import { encode } from "next-auth/jwt";
import puppeteer from "puppeteer";
import { readFileSync } from "node:fs";
import { PrismaClient as SecondaryClient } from "@prisma/client/secondary";

const BASE = "http://localhost:3000";
const env = readFileSync(".env", "utf8");
const secretMatch = env.match(/^NEXTAUTH_SECRET\s*=\s*"?([^"\r\n]+)"/m);
const secret = secretMatch[1].trim();
const jwt = await encode({
  secret,
  maxAge: 8 * 3600,
  token: { sub: "verify.superadmin@local.invalid", name: "Verify SuperAdmin", role: "SuperAdmin", authProvider: "credentials" },
});
const headers = { "Content-Type": "application/json", Cookie: `next-auth.session-token=${jwt}` };
async function api(path, opts = {}) {
  const res = await fetch(`${BASE}/api/admin/org-chart${path}`, { ...opts, headers });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}
function results(ok, message) {
  console.log(`${ok ? "PASS" : "FAIL"} - ${message}`);
  if (!ok) process.exitCode = 1;
}

// Seed root + leaf.
const before = await api("");
const assigned = new Set(before.body.map((n) => n.mergedSourceUserId));
const secondary = new SecondaryClient();
await secondary.$connect();
const candidates = await secondary.mergedUser.findMany({
  where: { isActive: true },
  orderBy: { sourceUserId: "asc" },
  take: 80,
  select: { sourceUserId: true, name: true },
});
await secondary.$disconnect();
const people = candidates.filter((c) => !assigned.has(String(c.sourceUserId))).slice(0, 2);
if (people.length < 2) { console.log("FAIL - not enough roster people"); process.exit(1); }

const r1 = await api("", { method: "POST", body: JSON.stringify({ mergedSourceUserId: String(people[0].sourceUserId), parentId: null }) });
const r2 = await api("", { method: "POST", body: JSON.stringify({ mergedSourceUserId: String(people[1].sourceUserId), parentId: r1.body.id }) });
const created = [r1.body.id, r2.body.id];
results(r1.status === 201 && r2.status === 201, `Seeded root + leaf (${people[0].name}, ${people[1].name})`);

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1200 });
await page.setCookie({ name: "next-auth.session-token", value: jwt, domain: "localhost", path: "/", httpOnly: true });
await page.goto(`${BASE}/admin/workforce?view=sections`, { waitUntil: "networkidle0", timeout: 60000 });
await new Promise((r) => setTimeout(r, 1200));
await page.waitForSelector(".react-flow__node", { timeout: 20000 });
await new Promise((r) => setTimeout(r, 800));

const leafName = people[1].name;
const rootName = people[0].name;

// 1. Click the leaf card on the chart (synthetic click on the node wrapper).
const clicked = await page.evaluate((id) => {
  const wrappers = [...document.querySelectorAll(".react-flow__node")].filter((w) =>
    w.querySelector(`[data-box-id="${id}"]`),
  );
  if (!wrappers.length) return false;
  wrappers[wrappers.length - 1].click();
  return true;
}, r2.body.id);
results(clicked, "Clicked the leaf card on the chart");
await new Promise((r) => setTimeout(r, 600));

// 2. Panel should show the leaf as selected (chip + Remove enabled, Add disabled).
const panelState = await page.evaluate(() => {
  const chip = [...document.querySelectorAll("p")].find((p) => p.textContent.startsWith("Selected:"));
  const btns = [...document.querySelectorAll("button")];
  const remove = btns.find((b) => b.textContent.trim() === "Remove member");
  const add = btns.find((b) => /^Add\s/.test(b.textContent.trim()));
  return {
    chip: chip ? chip.textContent.trim().slice(0, 60) : null,
    removeDisabled: remove ? remove.disabled : "missing",
    addLabel: add ? add.textContent.trim() : "missing",
    addDisabled: add ? add.disabled : "missing",
  };
});
results(
  panelState.chip?.includes(leafName.split(" ")[0]) && panelState.chip?.includes("On chart"),
  `Panel shows the clicked card selected: "${panelState.chip}"`,
);
results(panelState.removeDisabled === false, `Remove member enabled after card click (disabled=${panelState.removeDisabled})`);
results(panelState.addDisabled === true, `Add member disabled for an on-chart member (${panelState.addLabel})`);

// 3. The clicked card itself carries the highlight ring (highlightId sync).
const highlighted = await page.evaluate((id) => {
  const box = document.querySelector(`[data-box-id="${id}"]`);
  return box ? box.classList.contains("org-chart-picked") : false;
}, r2.body.id);
results(highlighted, "Clicked card shows the highlight ring");

// 4. Pick the OTHER member from the roster picker → its card gets highlighted instead.
await page.mouse.click(720, 60); // blur first so focus re-fires
await new Promise((r) => setTimeout(r, 300));
await page.click('input[placeholder*="Search roster"]');
await page.type('input[placeholder*="Search roster"]', rootName.split(" ")[0]);
await new Promise((r) => setTimeout(r, 500));
await page.evaluate(() => {
  const li = [...document.querySelectorAll("div.relative li")].find((x) => x.textContent.includes("On chart"));
  if (li) li.querySelector("button").click();
});
await new Promise((r) => setTimeout(r, 500));
const reverseHighlight = await page.evaluate((id) => {
  const box = document.querySelector(`[data-box-id="${id}"]`);
  return box ? box.classList.contains("org-chart-picked") : false;
}, r1.body.id);
const leafUnhighlighted = await page.evaluate((id) => {
  const box = document.querySelector(`[data-box-id="${id}"]`);
  return box ? !box.classList.contains("org-chart-picked") : true;
}, r2.body.id);
results(reverseHighlight && leafUnhighlighted, "Picker pick highlights that card (reverse sync)");

// 5. Remove the root member via the button (cascade removes the leaf too — both seeded nodes).
page.on("dialog", async (dialog) => { await dialog.accept(); });
const beforeCount = (await api("")).body.length;
await page.evaluate(() => {
  const btns = [...document.querySelectorAll("button")];
  btns.find((b) => b.textContent.trim() === "Remove member").click();
});
await new Promise((r) => setTimeout(r, 1500));
const afterCount = (await api("")).body.length;
results(afterCount === beforeCount - 2, `Remove member removed the picked card (${beforeCount} → ${afterCount})`);

await page.screenshot({ path: "scripts/orgchart-card-remove-after.png" });

await browser.close();
for (const id of created) await api(`?id=${encodeURIComponent(id)}`, { method: "DELETE" });
console.log(process.exitCode ? "VERIFICATION FAILED" : "VERIFICATION OK");
process.exit(process.exitCode ?? 0);
