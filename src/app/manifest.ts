import type { MetadataRoute } from "next";
import { BRAND_TITLE } from "@/lib/brand";

/**
 * Web app manifest so "Add to Home Screen" / install uses the WPD logo
 * instead of a browser screenshot or a cached favicon.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND_TITLE,
    short_name: "WPD",
    description: "End-to-end ticketing with SLA, escalation, and KPIs.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
