/**
 * End-to-end verification of org chart multi-select group move.
 *
 *  1. API: batch re-parent (PATCH { ids, parentId }) moves several nodes under
 *     one head; each moved node's direct reports re-attach to its former parent.
 *  2. Browser: shift+click selects several boxes, dragging one moves the whole
 *     group under the target head (PATCH { ids, parentId } fires).
 *
 * Writes and cleans up its own org-chart test rows. Requires the dev server on
 * localhost:3000 with a local NEXTAUTH_SECRET in .env.
 */
import { encode } from "next-auth/jwt";
import puppeteer from "puppeteer";
import { readFileSync } from "node:fs";
import { PrismaClient as SecondaryClient } from "@prisma/client/secondary";

const BASE = "http://localhost:3000";
const env = readFileSync(".env", "utf8");
const secretMatch = env.match(/^NEXTAUTH_SECRET\s*=\s*"?([^"\r\n]+)"?/m);
if (!secretMatch) throw new Error("NEXTAUTH_SECRET not found in .env");
const secret = secretMatch[1].trim();

function results(ok, message) {
  console.log(`${ok ? "PASS" : "FAIL"} - ${message}`);
  if (!ok) process.exitCode = 1;
}

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

// Pick 4 distinct active roster persons not already on the chart.
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
const people = candidates.filter((c) => !assigned.has(String(c.sourceUserId))).slice(0, 5);
results(people.length === 5, `5 roster persons found for the test (${people.map((p) => p.name).join(", ")})`);
if (people.length < 5) process.exit(process.exitCode ?? 1);

const createdIds = [];
async function create(mergedSourceUserId, parentId = null) {
  const r = await api("", { method: "POST", body: JSON.stringify({ mergedSourceUserId: String(mergedSourceUserId), parentId }) });
  createdIds.push(r.body?.id);
  return r;
}
async function cleanup() {
  for (const id of [...new Set(createdIds.filter(Boolean))]) {
    await api(`?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  }
}

// --- 1. API batch re-parent ------------------------------------------------
// Build: target (root) <- A (root) ; B, C under A ; A1 report under A ; B1 report under B.
const [pTarget, pA, pB, pC] = people;
const target = await create(pTarget.sourceUserId);           // root
const a = await create(pA.sourceUserId, target.body?.id);    // under target
const b = await create(pB.sourceUserId, a.body?.id);         // under A
const c = await create(pC.sourceUserId, a.body?.id);         // under A
results(target.status === 201 && a.status === 201 && b.status === 201 && c.status === 201, "Created target, A, B, C nodes");

// Move B + C together under the target head. Their reports: none yet, so both
// should simply re-parent under target; A keeps its position.
const batch = await api("", {
  method: "PATCH",
  body: JSON.stringify({ ids: [b.body.id, c.body.id], parentId: target.body.id }),
});
results(batch.status === 200, `Batch re-parent B+C under target → ${batch.status}`);
const afterBatch = await api("");
const row = (id, snap = afterBatch.body) => snap.find((n) => n.id === id);
results(row(b.body.id)?.parentId === target.body.id && row(c.body.id)?.parentId === target.body.id,
  `B and C now report to target (B→${row(b.body.id)?.parentId ? "target" : "?"}, C→${row(c.body.id)?.parentId ? "target" : "?"})`);
results(row(a.body.id)?.parentId === target.body.id, "A still reports to target");

// Batch re-parent with reports: create a report under B, then move B under A
// again — B's report should re-attach to B's former parent (target, the next
// head up).
const reportSrc = people.find((p) => ![pTarget, pA, pB, pC].includes(p));
if (!reportSrc) { console.log("FAIL - no 5th roster person for the report"); process.exit(1); }
const bReport = await create(String(reportSrc.sourceUserId), b.body.id);
results(bReport.status === 201, `Created report under B (${reportSrc.name})`);

const moveBack = await api("", {
  method: "PATCH",
  body: JSON.stringify({ ids: [b.body.id, c.body.id], parentId: a.body.id }),
});
results(moveBack.status === 200, `Batch re-parent B+C under A → ${moveBack.status}`);
const afterBack = await api("");
results(row(b.body.id, afterBack.body)?.parentId === a.body.id && row(c.body.id, afterBack.body)?.parentId === a.body.id, "B and C report to A again");
results(row(bReport.body.id, afterBack.body)?.parentId === target.body.id,
  `B's report re-attached to former head (target) when B moved → ${row(bReport.body.id, afterBack.body)?.parentId ? "target" : "?"}`);

// Guard: batch cannot move a node under one of its own reports.
const guard = await api("", {
  method: "PATCH",
  body: JSON.stringify({ ids: [a.body.id], parentId: b.body.id }),
});
results(guard.status === 400, `Cycle guard: moving A under its report B → ${guard.status} (expected 400)`);

// Guard: duplicate ids collapse.
const dup = await api("", {
  method: "PATCH",
  body: JSON.stringify({ ids: [b.body.id, b.body.id], parentId: target.body.id }),
});
results(dup.status === 200, `Duplicate ids collapse (B moved once) → ${dup.status}`);

await cleanup();

// --- 2. Browser: shift+click multi-select + group drag ---------------------
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1100 });
await page.setCookie({ name: "next-auth.session-token", value: jwt, domain: "localhost", path: "/", httpOnly: true });

await page.goto(`${BASE}/admin/workforce?view=sections`, { waitUntil: "networkidle0", timeout: 60000 });
await new Promise((r) => setTimeout(r, 800));

// Seed: target (root), A under target, B + C under A.
const t2 = await create(String(people[0].sourceUserId));
const a2 = await create(String(people[1].sourceUserId), t2.body.id);
const b2 = await create(String(people[2].sourceUserId), a2.body.id);
const c2 = await create(String(people[3].sourceUserId), a2.body.id);

await page.reload({ waitUntil: "networkidle0" });
await page.waitForSelector(".react-flow__node", { timeout: 20000 });
await new Promise((r) => setTimeout(r, 900));

const reqs = [];
page.on("request", (req) => { if (req.url().includes("/api/admin/org-chart") && req.method() === "PATCH") reqs.push(req.postData() ?? ""); });

async function nodeCenter(boxId) {
  return page.evaluate((id) => {
    const wrappers = [...document.querySelectorAll(".react-flow__node")].filter((w) =>
      w.querySelector(`[data-box-id="${id}"]`),
    );
    if (!wrappers.length) return null;
    const r = wrappers[wrappers.length - 1].getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, boxId);
}

async function clickAt(pt, shift = false) {
  await page.mouse.move(pt.x, pt.y);
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.down();
  await page.mouse.up();
  if (shift) await page.keyboard.up("Shift");
  await new Promise((r) => setTimeout(r, 350));
}

async function dragBox(fromId, toId) {
  const from = await nodeCenter(fromId);
  const to = await nodeCenter(toId);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 14; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 14, from.y + ((to.y - from.y) * i) / 14);
    await new Promise((r) => setTimeout(r, 25));
  }
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 1400));
}

const bPt = await nodeCenter(b2.body.id);
const cPt = await nodeCenter(c2.body.id);
await clickAt(bPt);
await clickAt(cPt, true);

// Selected boxes should show the orange ring (ReactFlow .selected wrapper).
const selectedCount = await page.evaluate(() =>
  document.querySelectorAll(".react-flow__node.selected").length,
);
results(selectedCount >= 2, `Shift+click selected ${selectedCount} boxes (expected ≥2)`);

// Drag B (selected) onto the target root — the whole selection should move.
await dragBox(b2.body.id, t2.body.id);
await new Promise((r) => setTimeout(r, 800));

const batchPatch = reqs.find((p) => {
  try { const j = JSON.parse(p); return Array.isArray(j.ids) && j.ids.length >= 2; } catch { return false; }
});
results(Boolean(batchPatch), `Group drag fired a batch PATCH (${batchPatch ? batchPatch.slice(0, 120) : "none"})`);

const finalNodes = await api("");
const fr = (id) => finalNodes.body.find((n) => n.id === id);
if (batchPatch) {
  const parsed = JSON.parse(batchPatch);
  const targetId = parsed.parentId;
  results(
    parsed.ids.includes(b2.body.id) && parsed.ids.includes(c2.body.id) &&
      fr(b2.body.id)?.parentId === targetId && fr(c2.body.id)?.parentId === targetId,
    "B and C landed under the target root after the group drag",
  );
} else {
  results(false, "B and C landed under the target root after the group drag");
}

// Visual check: no boxes remain highlighted as selected after the drop.
const selectedAfter = await page.evaluate(() => document.querySelectorAll(".react-flow__node.selected").length);
console.log(`  (selected boxes after drop: ${selectedAfter})`);

await cleanup();
await browser.close();

console.log(process.exitCode ? "VERIFICATION FAILED" : "VERIFICATION OK");
process.exit(process.exitCode ?? 0);
