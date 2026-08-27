/**
 * Browser verification of the inverted-recording ChartView fix.
 *
 * No DB writes. Steps:
 *  1. Forge a NextAuth session JWT (SuperAdmin) using the local NEXTAUTH_SECRET.
 *  2. Intercept /api/kpis/task-metrics responses and inject per-task
 *     `invertedRecording` flags (CYBERSECURITY + NETWORK PERFORMANCE first, then
 *     every DAILY task) — simulating what the deployed DB carries.
 *  3. Open Insights → Task Metrics → double-click the Daily donut → Chart view.
 *  4. Assert the inverted tasks plot the safe/uptime % with the "inverted" badge,
 *     non-inverted tasks stay on raw efficiency, and the legend flips when every
 *     charted task is inverted.
 */
import { encode } from "next-auth/jwt";
import puppeteer from "puppeteer";
import { readFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const SCREENSHOT = "scripts/verify-chart-inverted.png";

// 1. Forge the session JWT using NextAuth's own encoder (HKDF-derived key).
const env = readFileSync(".env", "utf8");
const secretMatch = env.match(/^NEXTAUTH_SECRET\s*=\s*"?([^"\r\n]+)"?/m);
if (!secretMatch) throw new Error("NEXTAUTH_SECRET not found in .env");
const secret = secretMatch[1].trim();
const jwt = await encode({
  secret,
  maxAge: 8 * 3600,
  token: {
    sub: "verify-admin",
    name: "Verify Admin",
    email: "verify.admin@local.invalid",
    role: "SuperAdmin",
    authProvider: "credentials",
  },
});
const cookieHeader = `next-auth.session-token=${jwt}`;

// 2. Launch headless Chrome and install the session cookie + API interception.
const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1100 });
await page.setCookie({
  name: "next-auth.session-token",
  value: jwt,
  domain: "localhost",
  path: "/",
  httpOnly: true,
});

/** true = inject invertedRecording on every DAILY task; false = only the two targets. */
let allInverted = false;
await page.setRequestInterception(true);
page.on("request", (req) => {
  const url = req.url();
  if (!url.includes("/api/kpis/task-metrics")) {
    req.continue();
    return;
  }
  void (async () => {
    try {
      const res = await fetch(url, { headers: { cookie: cookieHeader } });
      const json = await res.json();
      const tasks = json?.taskChecklistPillars?.DAILY?.includedTasks;
      if (Array.isArray(tasks)) {
        for (const t of tasks) {
          const title = String(t.title ?? "").trim().toUpperCase();
          const target = /^(CYBERSECURITY|NETWORK PERFORMANCE)$/.test(title);
          t.invertedRecording = allInverted || target ? true : false;
        }
      }
      await req.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(json),
      });
    } catch (err) {
      console.error("[intercept] failed:", err);
      await req.continue();
    }
  })();
});

async function waitFor(fn, label, timeout = 60000) {
  await page.waitForFunction(fn, { timeout, polling: 250 });
  console.log(`  ok: ${label}`);
}

async function openDailyChartView() {
  await page.goto(`${BASE}/insights?tab=task-metrics`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });

  // Daily donut card (article[role=button] with header text "Daily").
  await waitFor(
    () => [...document.querySelectorAll('article[role="button"]')].some((c) => c.textContent?.includes("Daily")),
    "Daily donut card rendered",
  );
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('article[role="button"]')].find((c) =>
      c.textContent?.includes("Daily"),
    );
    card?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
  await waitFor(
    () => [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Chart view"),
    "detail modal opened with Chart view toggle",
  );
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Chart view");
    btn?.click();
  });
  await waitFor(
    () => document.querySelector('[role="dialog"]')?.textContent?.includes("task") &&
          document.querySelector('[role="dialog"]')?.textContent?.includes("with data"),
    "ChartView rendered",
  );
}

/**
 * Map of task title → { inverted: boolean, barPcts: string[] } for the open
 * dialog, paging through the 2×2 grid. A card is a div.rounded-xl containing
 * exactly one p.truncate (its title). Bar percents are spans immediately
 * followed by the bar div (rounded-t-sm), so y-axis ticks are excluded.
 */
async function readCharts() {
  const out = {};
  for (let pageIdx = 0; pageIdx < 8; pageIdx += 1) {
    const pageData = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const res = {};
      if (!dialog) return res;
      for (const el of dialog.querySelectorAll("div.rounded-xl")) {
        if (el.querySelectorAll("p.truncate").length !== 1) continue;
        const titleEl = el.querySelector("p.truncate");
        const title = titleEl.textContent.trim();
        if (!title || res[title]) continue;
        const barPcts = [...el.querySelectorAll("span")]
          .filter(
            (s) =>
              /^\d+%$/.test(s.textContent.trim()) &&
              s.nextElementSibling?.classList.contains("rounded-t-sm"),
          )
          .map((s) => s.textContent.trim());
        res[title] = {
          inverted: el.textContent.includes("inverted"),
          barPcts: [...new Set(barPcts)],
        };
      }
      return res;
    });
    Object.assign(out, pageData);
    const hasNext = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const nextBtn = [...(dialog?.querySelectorAll("button") ?? [])].find(
        (b) => b.textContent?.trim() === "Next",
      );
      return Boolean(nextBtn && !nextBtn.disabled);
    });
    if (!hasNext) break;
    await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const nextBtn = [...(dialog?.querySelectorAll("button") ?? [])].find(
        (b) => b.textContent?.trim() === "Next",
      );
      nextBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 450));
  }
  return out;
}

const expect = (cond, msg) => {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ok: ${msg}`);
};

// ---- Pass 1: only CYBERSECURITY + NETWORK PERFORMANCE are inverted ----
console.log("\n=== Pass 1: CYBERSECURITY + NETWORK PERFORMANCE inverted, others normal ===");
allInverted = false;
await openDailyChartView();
const pass1 = await readCharts();
const cyber = pass1["CYBERSECURITY"];
const net = pass1["NETWORK PERFORMANCE"];
const other = pass1["OTHER TASKS"];
console.log(
  "  charts:",
  JSON.stringify(
    {
      CYBERSECURITY: cyber,
      "NETWORK PERFORMANCE": net,
      "OTHER TASKS": other,
      totalCharts: Object.keys(pass1).length,
    },
    null,
    2,
  ),
);

expect(cyber, "CYBERSECURITY chart present");
expect(cyber.inverted, "CYBERSECURITY shows the inverted badge");
expect(cyber.barPcts.includes("100%"), "CYBERSECURITY plots 100% safe/uptime (was 0% before the fix)");
expect(net, "NETWORK PERFORMANCE chart present");
expect(net.inverted, "NETWORK PERFORMANCE shows the inverted badge");
expect(net.barPcts.includes("100%"), "NETWORK PERFORMANCE plots 100% safe/uptime");
expect(other, "OTHER TASKS chart present");
expect(!other.inverted, "OTHER TASKS has no inverted badge");
expect(other.barPcts.includes("0%"), "OTHER TASKS stays on raw efficiency (0%)");
await page.screenshot({ path: SCREENSHOT, fullPage: false });
console.log(`  screenshot: ${SCREENSHOT}`);

// ---- Pass 2: every DAILY task inverted → legend switches to safe/uptime ----
console.log("\n=== Pass 2: all DAILY tasks inverted → legend = Safe / uptime % ===");
allInverted = true;
await openDailyChartView();
const legendOk = await page.evaluate(() =>
  document.querySelector('[role="dialog"]')?.textContent?.includes("Safe / uptime % (unchecked / total) per date"),
);
expect(legendOk, "legend reads 'Safe / uptime % (unchecked / total) per date' when all tasks are inverted");
const pass2 = await readCharts();
expect(pass2["OTHER TASKS"]?.inverted, "OTHER TASKS now also shows the inverted badge");
expect(pass2["OTHER TASKS"]?.barPcts.includes("100%"), "OTHER TASKS plots 100% safe/uptime when inverted");

await browser.close();
console.log("\nALL BROWSER ASSERTIONS PASSED");
