/**
 * Cookie-based end-to-end check of the subtask in-place assignee editor.
 * Logs in via curl (slow dev server is fine), injects the session cookie into
 * Edge headless, then verifies the subtask assignee field on the board.
 */
const puppeteer = require("puppeteer-core");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = process.env.BASE_URL || "http://localhost:3000";
const USER = process.argv[2] || "agctek";
const PASS = process.argv[3] || "aci12345";
const COMPANY = "3cd2fdf9-7e56-4c5c-89d2-5558b5acff70";
const OUT_DIR = "/tmp/sub-check";
fs.mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(predicate, timeoutMs, intervalMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await predicate()) return true;
    } catch {}
    await sleep(intervalMs);
  }
  return false;
}

function curl(args) {
  return execFileSync("curl", args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024, timeout: 240000 });
}

function loginViaCurl() {
  const JAR = path.join(os.tmpdir(), `cj-${Date.now()}.txt`);
  const csrf = (() => {
    try {
      return JSON.parse(curl(["-s", "-c", JAR, `${BASE}/api/auth/csrf`, "--max-time", "30"])).csrfToken;
    } catch {
      return "";
    }
  })();
  if (!csrf) throw new Error("csrf missing");
  let status = "?";
  try {
    status = curl([
      "-s", "-L", "-b", JAR, "-c", JAR, "-X", "POST", `${BASE}/api/auth/callback/credentials`,
      "-H", "Content-Type: application/x-www-form-urlencoded",
      "--data-urlencode", `csrfToken=${csrf}`,
      "--data-urlencode", `username=${USER}`,
      "--data-urlencode", `password=${PASS}`,
      "-o", os.tmpdir() + "/login-out.txt", "-w", "%{http_code}", "--max-time", "240",
    ]);
  } catch (e) {
    console.log("[cookie] login curl threw:", String(e.message || e).slice(0, 200));
  }
  console.log("[cookie] login status:", status);
  const lines = fs
    .readFileSync(JAR, "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"));
  const cookies = lines.flatMap((l) => {
    const p = l.split("\t");
    if (p.length < 7 || !p[5]) {
      console.log("[cookie-parse] skipping line:", JSON.stringify(l.slice(0, 80)));
      return [];
    }
    return [{ domain: p[0], name: p[5], value: p[6] }];
  });
  try { fs.unlinkSync(JAR); } catch {}
  return cookies;
}

async function main() {
  console.log("[0] logging in via curl...");
  let cookies = [];
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      cookies = loginViaCurl();
      if (cookies.some((c) => c.name.includes("session") || c.name.includes("token"))) break;
    } catch (e) {
      console.log(`[0] attempt ${attempt} failed:`, String(e.message || e).slice(0, 120));
    }
  }
  console.log("[0] cookies:", cookies.map((c) => c.name).join(", "));

  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu"],
    defaultViewport: { width: 1600, height: 1000 },
  });
  try {
    const page = await browser.newPage();
    await page.setCookie(
      ...cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain === "localhost" ? "localhost" : c.domain,
        path: "/",
        httpOnly: true,
        secure: false,
      })),
    );
    const logs = [];
    page.on("console", (m) => { if (m.type() === "error") logs.push(m.text().slice(0, 300)); });
    page.on("pageerror", (e) => logs.push("PAGEERROR: " + String(e).slice(0, 300)));

    console.log("[1] opening board with session cookie...");
    await page.goto(`${BASE}/agent/tasks?company=${COMPANY}`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await sleep(2000);
    const authed = await page.evaluate(() => !location.pathname.startsWith("/signin"));
    console.log("[1] authenticated:", authed, "| url:", page.url());

    const found = await waitFor(
      () => page.evaluate(() => !!document.querySelector('[aria-label="Change sub-task assignee"]')),
      240000,
    );
    const dump = await page.evaluate(() => ({
      subButtons: document.querySelectorAll('[aria-label="Change sub-task assignee"]').length,
      mainButtons: document.querySelectorAll('[aria-label="Change assignee"]').length,
      comboboxInputs: [...document.querySelectorAll('input[role="combobox"]')].map((i) => i.getAttribute("placeholder")),
      labels: [...document.querySelectorAll("p")].filter((p) => /sub task assignee/i.test(p.textContent || "")).length,
      bodySnippet: document.body.innerText.slice(0, 150),
    }));
    console.log("[1] subtask fields found:", found, "| DOM:", JSON.stringify(dump));

    if (!found || dump.subButtons === 0) {
      console.log("No subtask assignee buttons — cannot continue. (Board may be showing empty state.)");
      console.log("body:", JSON.stringify(dump.bodySnippet));
      return;
    }

    // Hover -> dotted underline, no card.
    await page.hover('[aria-label="Change sub-task assignee"]');
    await sleep(500);
    const hover = await page.evaluate(() => {
      const btn = document.querySelector('[aria-label="Change sub-task assignee"]');
      const name = btn?.querySelector("span");
      const avatar = btn?.querySelector("div");
      return {
        bg: btn ? getComputedStyle(btn).backgroundColor : null,
        shadow: btn ? getComputedStyle(btn).boxShadow : null,
        deco: name ? getComputedStyle(name).textDecorationLine : null,
        decoStyle: name ? getComputedStyle(name).textDecorationStyle : null,
        avatarW: avatar ? getComputedStyle(avatar).width : null,
        text: btn ? (btn.textContent || "").trim().slice(0, 40) : null,
      };
    });
    console.log("[2] hover:", JSON.stringify(hover));

    // Click -> in-place underline input.
    await page.evaluate(() => document.querySelector('[aria-label="Change sub-task assignee"]')?.click());
    const opened = await waitFor(() => page.evaluate(() => !!document.querySelector('input[role="combobox"]')), 30000);
    const edit = await page.evaluate(() => {
      const input = document.querySelector('input[role="combobox"]');
      const cs = input ? getComputedStyle(input) : null;
      return {
        inputShown: !!input,
        subButtonsGone: !document.querySelector('[aria-label="Change sub-task assignee"]'),
        borderBottom: cs ? cs.borderBottomWidth + " " + cs.borderBottomStyle : null,
        bg: cs ? cs.backgroundColor : null,
      };
    });
    console.log("[3] in-place:", JSON.stringify(edit));
    await page.screenshot({ path: `${OUT_DIR}/01-sub-inplace.png` });

    // Dropdown portaled + pick.
    const drop = await page.evaluate(() => {
      const listbox = document.querySelector('[role="listbox"]');
      return listbox
        ? { open: true, portaledToBody: listbox.parentElement === document.body, options: document.querySelectorAll('[role="listbox"] [role="option"]').length }
        : { open: false };
    });
    console.log("[4] dropdown:", JSON.stringify(drop));
    if (drop.open) {
      await page.evaluate(() => {
        const opt = document.querySelectorAll('[role="listbox"] [role="option"]')[1];
        if (opt) opt.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      });
      await sleep(2500);
      const afterPick = await page.evaluate(() => ({
        comboboxInputs: document.querySelectorAll('input[role="combobox"]').length,
        subButtons: document.querySelectorAll('[aria-label="Change sub-task assignee"]').length,
      }));
      console.log("[5] after picking option:", JSON.stringify(afterPick));
    }

    // Escape cancels.
    await page.evaluate(() => document.querySelector('[aria-label="Change sub-task assignee"]')?.click());
    await waitFor(() => page.evaluate(() => !!document.querySelector('input[role="combobox"]')), 30000);
    await page.keyboard.press("Escape");
    await sleep(800);
    const afterEsc = await page.evaluate(() => ({
      comboboxInputs: document.querySelectorAll('input[role="combobox"]').length,
      subButtons: document.querySelectorAll('[aria-label="Change sub-task assignee"]').length,
    }));
    console.log("[6] after Escape:", JSON.stringify(afterEsc));

    fs.writeFileSync(`${OUT_DIR}/console-errors.json`, JSON.stringify(logs, null, 2));
    console.log("CONSOLE ERRORS:", logs.length ? JSON.stringify(logs, null, 1) : "none");
  } finally {
    await browser.close();
  }
}
main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
