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

// Seed two nodes to test Remove member against.
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
results(r1.status === 201 && r2.status === 201, `Seeded 2 chart members (${people[0].name}, ${people[1].name})`);

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1200 });
await page.setCookie({ name: "next-auth.session-token", value: jwt, domain: "localhost", path: "/", httpOnly: true });

await page.goto(`${BASE}/admin/workforce?view=sections`, { waitUntil: "networkidle0", timeout: 60000 });
await new Promise((r) => setTimeout(r, 1000));

// 1. Search bar: opens dropdown on focus
await page.click('input[placeholder*="Search roster"]');
await new Promise((r) => setTimeout(r, 500));
let dropdownOpen = await page.evaluate(() => Boolean(document.querySelector("div.relative ul, div.relative .absolute ul")));
results(dropdownOpen, "Search dropdown opens on focus");
const countHeader = await page.evaluate(() => document.querySelector("div.relative p.border-b")?.textContent ?? null);
console.log(`  dropdown header: ${countHeader}`);

// 2. Outside click closes the dropdown
await page.mouse.click(720, 60);
await new Promise((r) => setTimeout(r, 400));
dropdownOpen = await page.evaluate(() => Boolean(document.querySelector("div.relative ul, div.relative .absolute ul")));
results(!dropdownOpen, "Search dropdown closes on outside click");

// 3. Searching shows the seeded member with an "On chart" badge
await page.type('input[placeholder*="Search roster"]', people[0].name.split(" ")[0]);
await new Promise((r) => setTimeout(r, 500));
const hasOnChartBadge = await page.evaluate(() => {
  const items = [...document.querySelectorAll("div.relative li")];
  return items.some((li) => li.textContent.includes("On chart"));
});
results(hasOnChartBadge, "Picker shows 'On chart' badge for existing members");

// 4. Select the on-chart member → Remove member button becomes enabled
const clickItem = await page.evaluate(() => {
  const li = [...document.querySelectorAll("div.relative li")].find((x) => x.textContent.includes("On chart"));
  if (!li) return false;
  li.querySelector("button").click();
  return true;
});
await new Promise((r) => setTimeout(r, 400));
const removeDisabled = await page.evaluate(() => {
  const btns = [...document.querySelectorAll("button")];
  const remove = btns.find((b) => b.textContent.trim() === "Remove member");
  return remove ? remove.disabled : "missing";
});
results(removeDisabled === false, `Remove member button enabled after selecting an on-chart member (disabled=${removeDisabled})`);

// 5. Screenshot the panel state (selected + Remove enabled)
await page.screenshot({ path: "scripts/orgchart-ui-remove-enabled.png" });

// 6. Click Remove member → confirm dialog → leaf member deleted (no reports,
//    so the count drops by exactly 1 — the cascade case was shown in the dialog
//    message wording but we test the simple leaf removal here)
page.on("dialog", async (dialog) => {
  results(dialog.type() === "confirm" && dialog.message().includes("Remove"), `Remove confirm dialog shown: "${dialog.message().slice(0, 60)}…"`);
  await dialog.accept();
});
// Select the leaf member first (search by its name)
await page.mouse.click(720, 60); // blur the input so focus re-fires
await new Promise((r) => setTimeout(r, 300));
await page.click('input[placeholder*="Search roster"]');
await page.type('input[placeholder*="Search roster"]', people[1].name.split(" ")[0]);
await new Promise((r) => setTimeout(r, 500));
await page.evaluate(() => {
  const li = [...document.querySelectorAll("div.relative li")].find((x) => x.textContent.includes("On chart"));
  if (li) li.querySelector("button").click();
});
await new Promise((r) => setTimeout(r, 400));
const beforeCount = (await api("")).body.length;
await page.evaluate(() => {
  const btns = [...document.querySelectorAll("button")];
  btns.find((b) => b.textContent.trim() === "Remove member").click();
});
await new Promise((r) => setTimeout(r, 1500));
const afterCount = (await api("")).body.length;
results(afterCount === beforeCount - 1, `Member removed via button (${beforeCount} → ${afterCount})`);

// 7. Verify the add button is enabled for an unassigned person (plain Add flow unchanged)
await page.mouse.click(720, 60); // blur first so focus re-fires and opens the picker
await new Promise((r) => setTimeout(r, 300));
await page.click('input[placeholder*="Search roster"]');
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => {
  const li = [...document.querySelectorAll("div.relative li")].find((x) => !x.textContent.includes("On chart"));
  if (li) li.querySelector("button").click();
});
await new Promise((r) => setTimeout(r, 400));
const addDisabled = await page.evaluate(() => {
  const btns = [...document.querySelectorAll("button")];
  const add = btns.find((b) => /^Add\s/.test(b.textContent.trim()));
  return add ? { disabled: add.disabled, label: add.textContent.trim() } : "missing";
});
const chipShown = await page.evaluate(() => {
  const chip = [...document.querySelectorAll("p")].find((p) => p.textContent.startsWith("Selected:"));
  return chip ? chip.textContent.trim().slice(0, 50) : null;
});
const removeDisabled2 = await page.evaluate(() => {
  const btns = [...document.querySelectorAll("button")];
  const remove = btns.find((b) => b.textContent.trim() === "Remove member");
  return remove ? remove.disabled : "missing";
});
results(addDisabled?.disabled === false && removeDisabled2 === true, `Add enabled for unassigned, Remove disabled (add=${JSON.stringify(addDisabled)}, remove=${removeDisabled2}, chip=${chipShown})`);

await browser.close();
// cleanup
for (const id of created) await api(`?id=${encodeURIComponent(id)}`, { method: "DELETE" });
console.log(process.exitCode ? "VERIFICATION FAILED" : "VERIFICATION OK");
process.exit(process.exitCode ?? 0);
