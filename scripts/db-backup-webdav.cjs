/**
 * WebDAV mirror for UGREEN NAS (uses same login as UGOS web UI).
 */
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");
const { URL } = require("node:url");

function encodeWebdavPath(rawPath) {
  return rawPath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function joinWebdavUrl(baseUrl, ...segments) {
  const base = baseUrl.replace(/\/+$/, "");
  const suffix = encodeWebdavPath(segments.filter(Boolean).join("/"));
  return suffix ? `${base}/${suffix}` : base;
}

function webdavRequest(urlString, method, { auth, body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const lib = url.protocol === "https:" ? https : http;
    const reqHeaders = { ...headers };
    if (auth?.user) {
      const token = Buffer.from(`${auth.user}:${auth.pass || ""}`).toString("base64");
      reqHeaders.Authorization = `Basic ${token}`;
    }
    if (body && !reqHeaders["Content-Length"]) {
      reqHeaders["Content-Length"] = Buffer.isBuffer(body) ? body.length : Buffer.byteLength(body);
    }

    const insecure = (process.env.DB_BACKUP_WEBDAV_INSECURE || "").trim() === "1";
    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method,
        headers: reqHeaders,
        rejectUnauthorized: !insecure,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode || 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function ensureWebdavCollection(urlString, auth) {
  const url = new URL(urlString);
  const segments = url.pathname.split("/").filter(Boolean);
  let current = `${url.origin}`;
  for (const segment of segments) {
    current = `${current}/${encodeURIComponent(segment)}`;
    const res = await webdavRequest(current, "MKCOL", { auth });
    if (res.status === 201 || res.status === 405 || res.status === 301 || res.status === 302) {
      continue;
    }
    if (res.status >= 200 && res.status < 300) continue;
    if (res.status === 409) continue;
    if (res.status === 401 || res.status === 403) {
      throw new Error(`WebDAV auth failed (${res.status}). Enable WebDAV in UGOS and confirm user access.`);
    }
    if (res.status === 404) {
      throw new Error(`WebDAV path not found: ${current}. Enable WebDAV in Control Panel -> File Service.`);
    }
  }
}

async function uploadWebdavFile(localPath, remoteUrl, auth) {
  const body = fs.readFileSync(localPath);
  const res = await webdavRequest(remoteUrl, "PUT", {
    auth,
    body,
    headers: { "Content-Type": "application/octet-stream" },
  });
  if (res.status === 201 || res.status === 204 || (res.status >= 200 && res.status < 300)) {
    return remoteUrl;
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(`WebDAV upload denied (${res.status}). Check username/password and folder permissions.`);
  }
  throw new Error(`WebDAV upload failed (${res.status}): ${res.body.slice(0, 200)}`);
}

function parsePropfindEntries(xml, baseUrl) {
  const entries = [];
  const responseBlocks = xml.match(/<(?:[a-zA-Z0-9]+:)?response[\s\S]*?<\/(?:[a-zA-Z0-9]+:)?response>/g) || [];
  for (const block of responseBlocks) {
    const hrefMatch = block.match(/<(?:[a-zA-Z0-9]+:)?href>([^<]+)<\/(?:[a-zA-Z0-9]+:)?href>/i);
    if (!hrefMatch) continue;
    const href = decodeURIComponent(hrefMatch[1]);
    if (!href.endsWith(".dump")) continue;
    const lastModMatch = block.match(/<(?:[a-zA-Z0-9]+:)?getlastmodified>([^<]+)<\/(?:[a-zA-Z0-9]+:)?getlastmodified>/i);
    const mtime = lastModMatch ? Date.parse(lastModMatch[1]) : 0;
    const fileName = path.posix.basename(href);
    entries.push({
      name: fileName,
      href,
      url: new URL(href, baseUrl).toString(),
      mtimeMs: Number.isFinite(mtime) ? mtime : 0,
    });
  }
  return entries;
}

async function listWebdavBackups(baseUrl, auth) {
  const res = await webdavRequest(baseUrl.replace(/\/+$/, "/"), "PROPFIND", {
    auth,
    headers: { Depth: "1", "Content-Type": "application/xml" },
    body:
      '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getlastmodified/></d:prop></d:propfind>',
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error(`WebDAV list denied (${res.status}).`);
  }
  if (res.status < 200 || res.status >= 300) {
    return [];
  }
  return parsePropfindEntries(res.body, baseUrl);
}

async function deleteWebdavFile(urlString, auth) {
  const res = await webdavRequest(urlString, "DELETE", { auth });
  if (res.status === 204 || res.status === 200 || res.status === 404) return;
  throw new Error(`WebDAV delete failed (${res.status}) for ${urlString}`);
}

async function pruneWebdavBackups(baseUrl, auth, retentionDays) {
  if (retentionDays <= 0) return [];
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const entries = await listWebdavBackups(baseUrl, auth);
  const removed = [];
  for (const entry of entries) {
    if (entry.mtimeMs >= cutoff) continue;
    await deleteWebdavFile(entry.url, auth);
    removed.push(entry.name);
  }
  return removed;
}

async function mirrorBackupWebdav(sourcePath, config) {
  const { baseUrl, user, pass } = config;
  const auth = { user, pass };
  await ensureWebdavCollection(baseUrl, auth);
  const remoteUrl = joinWebdavUrl(baseUrl, path.basename(sourcePath));
  return uploadWebdavFile(sourcePath, remoteUrl, auth);
}

async function testWebdavConnection(config) {
  const { baseUrl, user, pass } = config;
  const auth = { user, pass };
  await ensureWebdavCollection(baseUrl, auth);
  const res = await webdavRequest(baseUrl.replace(/\/+$/, "/"), "PROPFIND", {
    auth,
    headers: { Depth: "0", "Content-Type": "application/xml" },
    body:
      '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/></d:prop></d:propfind>',
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error(`WebDAV login failed (${res.status}). Use your UGOS web username/password.`);
  }
  if (res.status >= 200 && res.status < 300) return true;
  throw new Error(`WebDAV test failed (${res.status}). Enable WebDAV in UGOS Control Panel -> File Service.`);
}

module.exports = {
  mirrorBackupWebdav,
  pruneWebdavBackups,
  testWebdavConnection,
  joinWebdavUrl,
};
