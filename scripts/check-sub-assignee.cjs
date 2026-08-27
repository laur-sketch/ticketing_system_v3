/** Patient end-to-end check of the subtask in-place assignee editor (form login). */
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

async function fillLogin(page) {
  const u = await page.$('input[name="username"], input[name="email"], input[type="email"], input[type="text"]');
  const p = await page.$('input[type="password"]');
  if (!u || !p) return;
  await u.click({ clickCount: 3 });
  await u.type(USER, { delay: 30 });
  await p.click({ clickCount: 3 });
  await p.type(PASS, { delay: 30 });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => /^\s*sign\s*in\s*$/i.test(x.textContent || ""),
    ) || document.querySelector('button[type="submit"]');
    if (b) b.click();
  });
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

    // Login with retries.
    let loggedIn = false;
    for (let attempt = 1; attempt <= 8 && !loggedIn; attempt++) {
      for (let nav = 1; nav <= 2; nav++) {
        try {
          await page.goto(`${BASE}/signin`, { waitUntil: "domcontentloaded", timeout: 60000 });
          break;
        } catch { await sleep(3000); }
      }
      await sleep(1500);
      try { await fillLogin(page); } catch { /* page raced */ }
      loggedIn = await waitFor(() => page.evaluate(() => !location.pathname.startsWith("/signin")), 45000);
      console.log(`[login] attempt ${attempt}:`, loggedIn);
      if (!loggedIn) await sleep(8000); // cool down between attempts
    }
    if (!loggedIn) {
      console.log("LOGIN FAILED after retries");
      return;
    }
    console.log("[1] logged in:", page.url());

    // Board.
    for (let nav = 1; nav <= 4; nav++) {
      try {
        await page.goto(`${BASE}/agent/tasks?company=${COMPANY}`, { waitUntil: "domcontentloaded", timeout: 150000 });
        break;
      } catch { await sleep(6000); }
    }
    const cardReady = await waitFor(
      () => page.evaluate(() => document.querySelectorAll("article").length >= 1),
      300000,
    );
    await sleep(4000);
    const boardDump = await page.evaluate(() => ({
      articles: document.querySelectorAll("article").length,
      mainButtons: document.querySelectorAll('[aria-label="Change assignee"]').length,
      subButtonsOnBoard: document.querySelectorAll('[aria-label="Change sub-task assignee"]').length,
    }));
    console.log("[2] board ready:", cardReady, "| DOM:", JSON.stringify(boardDump));
    await page.screenshot({ path: `${OUT_DIR}/00-board.png`, fullPage: true });
    if (!cardReady || boardDump.articles === 0) {
      console.log("STOP: board did not render cards.");
      fs.writeFileSync(`${OUT_DIR}/console-errors.json`, JSON.stringify(logs, null, 2));
      console.log("CONSOLE ERRORS:", logs.length ? JSON.stringify(logs, null, 1) : "none");
      return;
    }

    // Open the full-task modal by clicking a card body (not its assignee button).
    await page.evaluate(() => {
      const card = document.querySelector("article");
      if (card) card.click();
    });
    const modalOpen = await waitFor(
      () => page.evaluate(() => !!document.querySelector('[role="dialog"][aria-modal="true"]')),
      90000,
    );
    await sleep(3000);
    const found = await waitFor(
      () => page.evaluate(() => !!document.querySelector('[aria-label="Change sub-task assignee"]')),
      90000,
    );
    await sleep(2000);
    const dump = await page.evaluate(() => ({
      modalOpen: !!document.querySelector('[role="dialog"][aria-modal="true"]'),
      subButtons: document.querySelectorAll('[aria-label="Change sub-task assignee"]').length,
      mainButtons: document.querySelectorAll('[aria-label="Change assignee"]').length,
      comboboxInputs: [...document.querySelectorAll('input[role="combobox"]')].map((i) => i.getAttribute("placeholder")),
      labels: [...document.querySelectorAll("p")].filter((p) => /sub task assignee/i.test(p.textContent || "")).length,
      bodySnippet: document.body.innerText.slice(0, 80),
    }));
    console.log("[3] modal/sub-assignee:", JSON.stringify(dump));
    await page.screenshot({ path: `${OUT_DIR}/01-modal.png`, fullPage: true });

    if (!modalOpen || dump.subButtons === 0) {
      console.log("STOP: modal opened but no subtask assignee buttons (control may need enableSubtaskAssignees).");
      fs.writeFileSync(`${OUT_DIR}/console-errors.json`, JSON.stringify(logs, null, 2));
      console.log("CONSOLE ERRORS:", logs.length ? JSON.stringify(logs, null, 1) : "none");
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
    console.log("[3] hover:", JSON.stringify(hover));

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
    console.log("[4] in-place:", JSON.stringify(edit));
    await page.screenshot({ path: `${OUT_DIR}/01-sub-inplace.png` });

    // Dropdown portaled + pick.
    const drop = await page.evaluate(() => {
      const listbox = document.querySelector('[role="listbox"]');
      return listbox
        ? { open: true, portaledToBody: listbox.parentElement === document.body, options: document.querySelectorAll('[role="listbox"] [role="option"]').length }
        : { open: false };
    });
    console.log("[5] dropdown:", JSON.stringify(drop));
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
      console.log("[6] after picking option:", JSON.stringify(afterPick));
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
    console.log("[7] after Escape:", JSON.stringify(afterEsc));

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
