"use strict";

/**
 * Workbox service worker for Travel Order offline support.
 * - Precaches offline shell fallback
 * - NetworkFirst for Travel Order + agents APIs
 * - StaleWhileRevalidate for Next static chunks
 * - Document navigations: NetworkFirst with offline fallback
 * - Background Sync tag wakes clients to flush the Dexie pending queue
 */

/* eslint-disable no-undef */
importScripts("https://storage.googleapis.com/workbox-cdn/releases/7.1.0/workbox-sw.js");

const WB = self.workbox;
const TRAVEL_ORDER_SYNC_TAG = "travel-order-sync";
const SHELL_CACHE = "travel-order-shell-v1";
const PAGES_CACHE = "travel-order-pages";
const OFFLINE_FALLBACK_URL = "/offline-travel-orders.html";
const SHELL_URLS = [OFFLINE_FALLBACK_URL, "/agent/tasks"];

WB.setConfig({ debug: false });
WB.core.clientsClaim();
WB.core.skipWaiting();

WB.precaching.precacheAndRoute(self.__WB_MANIFEST || []);

async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  await Promise.all(
    SHELL_URLS.map(async (url) => {
      try {
        const response = await fetch(url, { credentials: "same-origin", cache: "reload" });
        if (response && response.ok) {
          await cache.put(url, response.clone());
          const pages = await caches.open(PAGES_CACHE);
          await pages.put(url, response.clone());
        }
      } catch {
        // Offline install — keep whatever was already cached.
      }
    }),
  );
}

async function warmShellUrls(urls) {
  const list = Array.isArray(urls) && urls.length ? urls : SHELL_URLS;
  const pages = await caches.open(PAGES_CACHE);
  const shell = await caches.open(SHELL_CACHE);
  await Promise.all(
    list.map(async (url) => {
      try {
        const response = await fetch(url, { credentials: "same-origin" });
        if (response && response.ok) {
          await pages.put(url, response.clone());
          if (url === OFFLINE_FALLBACK_URL || url.startsWith("/agent")) {
            await shell.put(url, response.clone());
          }
        }
      } catch {
        // Ignore warm failures (offline / auth redirect).
      }
    }),
  );
}

async function matchOfflineDocument(request) {
  const pages = await caches.open(PAGES_CACHE);
  const shell = await caches.open(SHELL_CACHE);

  const candidates = [];
  if (request && request.url) {
    candidates.push(request);
    try {
      const u = new URL(request.url);
      candidates.push(u.pathname);
      if (u.pathname.startsWith("/agent")) {
        candidates.push("/agent/tasks");
      }
    } catch {
      // ignore
    }
  }
  candidates.push("/agent/tasks", OFFLINE_FALLBACK_URL);

  for (const key of candidates) {
    const hit = (await pages.match(key)) || (await shell.match(key)) || (await caches.match(key));
    if (hit) return hit;
  }
  return undefined;
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      // Refresh shell when we can; ignore failures.
      await precacheShell();
    })(),
  );
});

WB.routing.registerRoute(
  ({ url, request }) =>
    request.method === "GET" &&
    (url.pathname.startsWith("/api/travel-orders") ||
      url.pathname.includes("/travel-orders") ||
      url.pathname.startsWith("/api/agents")),
  new WB.strategies.NetworkFirst({
    cacheName: "travel-order-api",
    // Fail over to cache quickly when the link is dead but navigator.onLine is still true.
    networkTimeoutSeconds: 2,
    plugins: [
      new WB.expiration.ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 7 }),
    ],
  }),
);

WB.routing.registerRoute(
  ({ request, url }) =>
    request.destination === "script" ||
    request.destination === "style" ||
    url.pathname.startsWith("/_next/static/"),
  new WB.strategies.StaleWhileRevalidate({
    cacheName: "travel-order-static",
    plugins: [
      new WB.expiration.ExpirationPlugin({ maxEntries: 160, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
  }),
);

WB.routing.registerRoute(
  ({ request, url }) =>
    request.mode === "navigate" ||
    (request.destination === "document" &&
      (url.pathname.startsWith("/agent") || url.pathname === OFFLINE_FALLBACK_URL)),
  new WB.strategies.NetworkFirst({
    cacheName: PAGES_CACHE,
    networkTimeoutSeconds: 2,
    plugins: [
      new WB.expiration.ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 }),
      {
        handlerDidError: async ({ request }) => matchOfflineDocument(request),
      },
    ],
  }),
);

WB.routing.registerRoute(
  ({ request }) => request.destination === "document",
  new WB.strategies.NetworkFirst({
    cacheName: PAGES_CACHE,
    networkTimeoutSeconds: 2,
    plugins: [
      new WB.expiration.ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 }),
      {
        handlerDidError: async ({ request }) => matchOfflineDocument(request),
      },
    ],
  }),
);

WB.routing.registerRoute(
  ({ request }) => request.destination === "image" || request.destination === "font",
  new WB.strategies.CacheFirst({
    cacheName: "travel-order-assets",
    plugins: [
      new WB.expiration.ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
  }),
);

WB.routing.setCatchHandler(async ({ request }) => {
  if (request.mode === "navigate" || request.destination === "document") {
    const fallback = await matchOfflineDocument(request);
    if (fallback) return fallback;
  }
  return Response.error();
});

self.addEventListener("sync", (event) => {
  if (event.tag !== TRAVEL_ORDER_SYNC_TAG) return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        client.postMessage({ type: "TRAVEL_ORDER_SYNC" });
      }
    }),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (data.type === "REQUEST_TRAVEL_ORDER_SYNC") {
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        client.postMessage({ type: "TRAVEL_ORDER_SYNC" });
      }
    });
  }
  if (data.type === "WARM_TRAVEL_ORDER_SHELL") {
    event.waitUntil(warmShellUrls(data.urls));
  }
});
