/**
 * Lightweight Windows-friendly app supervisor (no PM2 named pipes).
 *
 * Usage:
 *   node scripts/server-ctl.cjs start|stop|restart|status
 */
const { spawn } = require("child_process");
const fs = require("fs");
const net = require("net");
const path = require("path");

const root = path.join(__dirname, "..");
const pidFile = path.join(root, "logs", "server.pid");
const outLog = path.join(root, "logs", "server-out.log");
const errLog = path.join(root, "logs", "server-error.log");
const serverScript = path.join(root, "server.js");

function loadEnvFiles() {
  for (const name of [".env", ".env.production"]) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

function readPid() {
  if (!fs.existsSync(pidFile)) return null;
  const n = Number(fs.readFileSync(pidFile, "utf8").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function writePid(pid) {
  fs.mkdirSync(path.dirname(pidFile), { recursive: true });
  fs.writeFileSync(pidFile, String(pid), "utf8");
}

function clearPid() {
  try {
    fs.unlinkSync(pidFile);
  } catch {
    /* ignore */
  }
}

function isAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function portInUse(port) {
  return new Promise((resolve) => {
    const tester = net
      .createServer()
      .once("error", () => resolve(true))
      .once("listening", () => tester.close(() => resolve(false)))
      .listen(port, "0.0.0.0");
  });
}

function stopPid(pid) {
  if (!pid || !isAlive(pid)) return false;
  try {
    process.kill(pid);
    return true;
  } catch {
    return false;
  }
}

async function waitForExit(pid, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!isAlive(pid)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  if (isAlive(pid)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* ignore */
    }
  }
  return !isAlive(pid);
}

async function start() {
  loadEnvFiles();
  const port = Number(process.env.PORT || 3000);
  const existing = readPid();
  if (existing && isAlive(existing)) {
    console.log(`Server already running (pid ${existing}).`);
    return;
  }
  clearPid();

  if (await portInUse(port)) {
    console.error(`Port ${port} is already in use. Stop the other process first.`);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(outLog), { recursive: true });
  const out = fs.openSync(outLog, "a");
  const err = fs.openSync(errLog, "a");

  const child = spawn(
    process.execPath,
    ["--max-http-header-size=65536", serverScript],
    {
      cwd: root,
      env: { ...process.env, NODE_ENV: "production", PORT: String(port) },
      detached: true,
      stdio: ["ignore", out, err],
      windowsHide: true,
    },
  );
  child.unref();
  writePid(child.pid);

  await new Promise((r) => setTimeout(r, 4000));
  if (!isAlive(child.pid)) {
    console.error("Server failed to start. Check logs/server-error.log");
    clearPid();
    process.exit(1);
  }
  console.log(`Server started (pid ${child.pid}) on port ${port}`);
}

async function stop() {
  const pid = readPid();
  if (!pid) {
    console.log("Server is not running (no pid file).");
    return;
  }
  if (!stopPid(pid)) {
    console.log("Server is not running.");
    clearPid();
    return;
  }
  await waitForExit(pid);
  clearPid();
  console.log("Server stopped.");
}

async function status() {
  loadEnvFiles();
  const port = Number(process.env.PORT || 3000);
  const pid = readPid();
  const alive = isAlive(pid);
  const listening = await portInUse(port);
  console.log(`PID file : ${pid ?? "(none)"}`);
  console.log(`Process  : ${alive ? "running" : "stopped"}`);
  console.log(`Port ${port}  : ${listening ? "in use" : "free"}`);
}

async function main() {
  const cmd = (process.argv[2] || "status").toLowerCase();
  if (cmd === "start") return start();
  if (cmd === "stop") return stop();
  if (cmd === "restart" || cmd === "reload") {
    await stop();
    return start();
  }
  if (cmd === "status" || cmd === "list") return status();
  console.error(`Unknown command: ${cmd}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
