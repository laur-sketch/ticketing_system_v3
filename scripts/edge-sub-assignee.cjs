/** Verify the click-to-edit subtask assignee field (underline style, in place). */
const puppeteer = require("puppeteer-core");
const fs = require("fs");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = process.env.BASE_URL || "http://localhost:3000";
const USER = process.argv[2] || "agctek";
const PASS = process.argv[3] || "aci12345";
const COMPANY = "3cd2fdf9-7e56-4c5c-89d2-5558b5acff70";
const OUT_DIR = "/tmp/sub-check";
fs.mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(predicate, timeoutMs, intervalMs = 1500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await predicate()) return true;
    } catch {}
    await sleep(intervalMs);
  }
  return false;
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu"],
    defaultViewport: { width: 1600, height: 1000 },
  });
  try {
    const page = await browser.newPage();
    const logs = [];
    page.on("console", (m) => { if (m.type() === "error") logs.push(m.text().slice(0, 300)); });
    page.on("pageerror", (e) => logs.push("PAGEERROR: " + String(e).slice(0, 300)));

    for (let nav = 1; nav <= 3; nav++) {
      try {
        await page.goto(`${BASE}/signin`, { waitUntil: "domcontentloaded", timeout: 120000 });
        break;
      } catch {
        await sleep(4000);
      }
    }
    await sleep(1500);
    for (let attempt = 1; attempt <= 4; attempt++) {
      const u = await page.$('input[name="username"], input[name="email"], input[type="email"], input[type="text"]');
      const p = await page.$('input[type="password"]');
      if (u && p) {
        await u.click({ clickCount: 3 });
        await u.type(USER, { delay: 40 });
        await p.click({ clickCount: 3 });
        await p.type(PASS, { delay: 40 });
        await page.evaluate(() => {
          const b = [...document.querySelectorAll("button")].find(
            (x) => /^\s*sign\s*in\s*$/i.test(x.textContent || ""),
          ) || document.querySelector('button[type="submit"]');
          if (b) b.click();
        });
      }
      if (await waitFor(() => page.evaluate(() => !location.pathname.startsWith("/signin")), 90000)) break;
      await page.goto(`${BASE}/signin`, { waitUntil: "domcontentloaded", timeout: 120000 });
      await sleep(1500);
    }
    console.log("[1] logged in:", page.url());

    await page.goto(`${BASE}/agent/tasks?company=${COMPANY}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    // Wait for a subtask assignee field to render.
    const found = await waitFor(
      () => page.evaluate(() => !!document.querySelector('[aria-label="Change sub-task assignee"]')),
      180000,
    );
    console.log("[1] subtask assignee fields found:", found);
    await sleep(2000);

    const count = await page.evaluate(
      () => document.querySelectorAll('[aria-label="Change sub-task assignee"]').length,
    );
    console.log("[1] subtask assignee fields:", count);

    // --- Hover: dotted underline, no card ---
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
        style: name ? getComputedStyle(name).textDecorationStyle : null,
        avatarW: avatar ? getComputedStyle(avatar).width : null,
        label: btn ? (btn.textContent || "").trim().slice(0, 40) : null,
      };
    });
    console.log("[2] hover:", JSON.stringify(hover));

    // --- Click: in-place underline input ---
    await page.evaluate(() => document.querySelector('[aria-label="Change sub-task assignee"]')?.click());
    const opened = await waitFor(
      () => page.evaluate(() => !!document.querySelector('input[role="combobox"]')),
      25000,
    );
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

    // --- Dropdown portaled + option pick ---
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
      await sleep(2000);
      const afterPick = await page.evaluate(() => ({
        comboboxInputs: document.querySelectorAll('input[role="combobox"]').length,
        subButtons: document.querySelectorAll('[aria-label="Change sub-task assignee"]').length,
      }));
      console.log("[5] after picking option:", JSON.stringify(afterPick));
    }

    // --- Escape cancels ---
    await page.evaluate(() => document.querySelector('[aria-label="Change sub-task assignee"]')?.click());
    await waitFor(() => page.evaluate(() => !!document.querySelector('input[role="combobox"]')), 25000);
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
