/**
 * Shared mirror config/helpers for db-backup.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const webdav = require("./db-backup-webdav.cjs");

const root = path.join(__dirname, "..");

function loadEnvFromRoot() {
  for (const name of [".env", ".env.production"]) {
    const envPath = path.join(root, name);
    if (!fs.existsSync(envPath)) continue;
    for (const lineRaw of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const line = lineRaw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
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

function getMirrorMode() {
  const explicit = (process.env.DB_BACKUP_MIRROR_MODE || "").trim().toLowerCase();
  if (explicit === "webdav" || explicit === "smb") return explicit;
  if ((process.env.DB_BACKUP_WEBDAV_URL || "").trim()) return "webdav";
  if ((process.env.DB_BACKUP_MIRROR_DIR || "").trim()) return "smb";
  return "";
}

function getWebdavConfig() {
  const baseUrl = (process.env.DB_BACKUP_WEBDAV_URL || "").trim();
  const user = (process.env.DB_BACKUP_WEBDAV_USER || process.env.DB_BACKUP_NAS_USER || "").trim();
  const pass = (process.env.DB_BACKUP_WEBDAV_PASS || "").trim();
  if (!baseUrl || !user || !pass) return null;
  return { baseUrl, user, pass };
}

function resolveMirrorDir(raw) {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("//") || trimmed.startsWith("\\\\")) {
    const body = trimmed.replace(/^[/\\]+/, "").replace(/\//g, "\\");
    return `\\\\${body}`;
  }
  return path.resolve(trimmed);
}

function mirrorBackupSmb(sourcePath, mirrorDir) {
  fs.mkdirSync(mirrorDir, { recursive: true });
  const target = path.join(mirrorDir, path.basename(sourcePath));
  fs.copyFileSync(sourcePath, target);
  return target;
}

async function mirrorBackup(sourcePath) {
  const mode = getMirrorMode();
  if (!mode) return { mirrored: null, mirrorError: null, mode: "" };

  if (mode === "webdav") {
    const config = getWebdavConfig();
    if (!config) {
      return {
        mirrored: null,
        mirrorError: "WebDAV mirror configured but DB_BACKUP_WEBDAV_URL/USER/PASS missing.",
        mode,
      };
    }
    try {
      const mirrored = await webdav.mirrorBackupWebdav(sourcePath, config);
      return { mirrored, mirrorError: null, mode };
    } catch (error) {
      return {
        mirrored: null,
        mirrorError: error instanceof Error ? error.message : String(error),
        mode,
      };
    }
  }

  const mirrorDir = resolveMirrorDir(process.env.DB_BACKUP_MIRROR_DIR || "");
  if (!mirrorDir) return { mirrored: null, mirrorError: null, mode };
  try {
    const mirrored = mirrorBackupSmb(sourcePath, mirrorDir);
    return { mirrored, mirrorError: null, mode };
  } catch (error) {
    return {
      mirrored: null,
      mirrorError: error instanceof Error ? error.message : String(error),
      mode,
    };
  }
}

async function pruneMirrorBackups(retentionDays) {
  const mode = getMirrorMode();
  if (mode === "webdav") {
    const config = getWebdavConfig();
    if (!config || retentionDays <= 0) return [];
    return webdav.pruneWebdavBackups(config.baseUrl, { user: config.user, pass: config.pass }, retentionDays);
  }
  return null;
}

module.exports = {
  loadEnvFromRoot,
  getMirrorMode,
  getWebdavConfig,
  resolveMirrorDir,
  mirrorBackup,
  pruneMirrorBackups,
  testWebdavConnection: webdav.testWebdavConnection,
};
