import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { NextResponse } from "next/server";
import { BRAND_TITLE } from "@/lib/brand";

export const runtime = "nodejs";

/** Strip wrapping quotes/spaces around env paths. */
function normalizeLogoPath(raw: string | undefined): string {
  let p = (raw ?? "").trim();
  while (
    p.length >= 2 &&
    ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'")))
  ) {
    p = p.slice(1, -1).trim();
  }
  return p;
}

function publicBrandDir() {
  return join(process.cwd(), "public", "brand");
}

function bundledDefaultLogoPath() {
  return join(publicBrandDir(), "agc-logo.svg");
}

/** Drop-in files (no env): logo.png | logo.webp | logo.jpg in public/brand/ */
function publicBrandLogoCandidates() {
  const d = publicBrandDir();
  return [
    join(d, "logo.png"),
    join(d, "logo.webp"),
    join(d, "logo.jpg"),
    join(d, "logo.jpeg"),
  ];
}

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function makeFallbackSvg(title: string) {
  const safeTitle = escapeXml(title);
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="96" viewBox="0 0 320 96" role="img" aria-label="${safeTitle}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#131313"/>
      <stop offset="100%" stop-color="#1f1f1f"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ff5c00"/>
      <stop offset="100%" stop-color="#ff7a2f"/>
    </linearGradient>
  </defs>
  <rect width="320" height="96" rx="18" fill="url(#bg)"/>
  <circle cx="52" cy="48" r="24" fill="#1b1b1b" stroke="url(#accent)" stroke-width="3"/>
  <path d="M40 48l8 8 16-16" fill="none" stroke="url(#accent)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="90" y="48" text-anchor="start" dominant-baseline="middle"
    font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"
    font-size="18" font-weight="800" fill="#e2e2e2" letter-spacing="0.2">
    ${safeTitle}
  </text>
</svg>
  `.trim();
}

function mimeFor(filePath: string) {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".svg") return "image/svg+xml";
  return "image/png";
}

export async function GET() {
  const fromEnv = normalizeLogoPath(process.env.BRAND_LOGO_PATH);
  const candidates = fromEnv
    ? [fromEnv, ...publicBrandLogoCandidates(), bundledDefaultLogoPath()]
    : [...publicBrandLogoCandidates(), bundledDefaultLogoPath()];

  for (const logoPath of candidates) {
    try {
      const buf = await readFile(logoPath);
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "content-type": mimeFor(logoPath),
          "cache-control": "public, max-age=300",
        },
      });
    } catch {
      // try next candidate
    }
  }

  return new NextResponse(makeFallbackSvg(BRAND_TITLE), {
    status: 200,
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=60",
    },
  });
}
