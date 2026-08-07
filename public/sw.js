"use strict";

/**
 * Workbox service worker for Travel Order offline support.
 * - Precaches shell routes / static assets when available
 * - NetworkFirst for Travel Order + agents APIs (populate Dexie-friendly HTTP cache)
 * - StaleWhileRevalidate for Next static chunks
 * - Background Sync tag wakes clients to flush the Dexie pending queue
 */

/* eslint-disable no-undef */
importScripts("https://storage.googleapis.com/workbox-cdn/releases/7.1.0/workbox-sw.js");

const WB = self.workbox;
const TRAVEL_ORDER_SYNC_TAG = "travel-order-sync";

WB.setConfig({ debug: false });
WB.core.clientsClaim();
WB.core.skipWaiting();

WB.precaching.precacheAndRoute(self.__WB_MANIFEST || []);

WB.routing.registerRoute(
  ({ url, request }) =>
    request.method === "GET" &&
    (url.pathname.startsWith("/api/travel-orders") ||
      url.pathname.includes("/travel-orders") ||
      url.pathname.startsWith("/api/agents")),
  new WB.strategies.NetworkFirst({
    cacheName: "travel-order-api",
    networkTimeoutSeconds: 8,
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
      new WB.expiration.ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
  }),
);

WB.routing.registerRoute(
  ({ request }) => request.destination === "document",
  new WB.strategies.NetworkFirst({
    cacheName: "travel-order-pages",
    networkTimeoutSeconds: 5,
    plugins: [
      new WB.expiration.ExpirationPlugin({ maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 }),
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
});
