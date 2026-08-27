/** Find tasks where enableSubtaskAssignees is true (for browser verification). */
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const USER = process.argv[2] || "agctek";
const PASS = process.argv[3] || "aci12345";
const JAR = path.join(os.tmpdir(), `cj-${Date.now()}.txt`);

function curl(args) {
  try {
    return execFileSync("curl", args, { encoding: "utf8", maxBuffer: 50 * 1024 * 1024, timeout: 180000 });
  } catch (e) {
    return `ERR: ${String(e.stdout || e.message).slice(0, 300)}`;
  }
}

const csrf = (() => {
  try {
    return JSON.parse(curl(["-s", "-c", JAR, `${BASE}/api/auth/csrf`, "--max-time", "20"])).csrfToken;
  } catch {
    return "";
  }
})();
console.log("csrf:", csrf ? "ok" : "MISSING");
curl([
  "-s", "-L", "-b", JAR, "-c", JAR, "-X", "POST", `${BASE}/api/auth/callback/credentials`,
  "-H", "Content-Type: application/x-www-form-urlencoded",
  "--data-urlencode", `csrfToken=${csrf}`,
  "--data-urlencode", `username=${USER}`,
  "--data-urlencode", `password=${PASS}`,
  "-o", os.tmpdir() + "/login-out.txt", "-w", "%{http_code}", "--max-time", "120",
]);
const board = curl(["-s", "-b", JAR, `${BASE}/api/kpi-maintenance?tz=Asia%2FManila`, "--max-time", "180"]);
try {
  const p = JSON.parse(board);
  const rows = Array.isArray(p.rows) ? p.rows : [];
  console.log("rows:", rows.length);
  for (const r of rows) {
    const enabled = r.enableSubtaskAssignees === true;
    if (enabled) {
      const subs = (r.subKpis && (r.subKpis.segments || []).length ? r.subKpis.segments.flatMap((s) => s.items || []) : []).length;
      console.log("ENABLED:", r.title, "| subKpis:", subs, "| assigned:", r.assignedAgent?.name ?? "none");
    }
  }
  console.log("--- tasks WITHOUT enableSubtaskAssignees (sample):", rows.slice(0, 8).map((r) => `${r.title}:${r.enableSubtaskAssignees}`).join(" | "));
} catch {
  console.log("parse failed:", board.slice(0, 300));
}
try { fs.unlinkSync(JAR); } catch {}
