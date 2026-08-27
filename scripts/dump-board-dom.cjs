/** Dump the assignee-related DOM on the board to see which code is live. */
const puppeteer = require("puppeteer-core");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = process.env.BASE_URL || "http://localhost:3000";
const USER = process.argv[2] || "agctek";
const PASS = process.argv[3] || "aci12345";
const COMPANY = "3cd2fdf9-7e56-4c5c-89d2-5558b5acff70";

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
    for (let nav = 1; nav <= 3; nav++) {
      try {
        await page.goto(`${BASE}/signin`, { waitUntil: "domcontentloaded", timeout: 120000 });
        break;
      } catch { await sleep(4000); }
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
    await page.goto(`${BASE}/agent/tasks?company=${COMPANY}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await waitFor(() => page.evaluate(() => document.body.innerText.length > 400), 180000);
    await sleep(4000);

    const info = await page.evaluate(() => {
      const comboboxes = [...document.querySelectorAll('input[role="combobox"]')];
      const subBtns = [...document.querySelectorAll('[aria-label="Change sub-task assignee"]')];
      const mainBtns = [...document.querySelectorAll('[aria-label="Change assignee"]')];
      const assigneeEditorEls = [...document.querySelectorAll("[data-assignee-editor]")];
      const subTaskLabels = [...document.querySelectorAll("p")]
        .filter((p) => /sub task assignee/i.test(p.textContent || ""))
        .length;
      const cardText = [...document.querySelectorAll("article")].slice(0, 2).map((a) => a.innerText.slice(0, 300));
      return {
        comboboxInputs: comboboxes.map((i) => i.getAttribute("placeholder")),
        subAssigneeButtons: subBtns.map((b) => (b.textContent || "").trim().slice(0, 40)),
        mainAssigneeButtons: mainBtns.length,
        assigneeEditorEls: assigneeEditorEls.length,
        subTaskLabelsFound: subTaskLabels,
        firstCards: cardText,
        bodySnippet: document.body.innerText.slice(0, 200),
      };
    });
    console.log("DOM:", JSON.stringify(info, null, 1));
  } finally {
    await browser.close();
  }
}
main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
