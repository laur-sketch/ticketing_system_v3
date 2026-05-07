import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { NextResponse } from "next/server";
import { BRAND_TITLE } from "@/lib/brand";

export const runtime = "nodejs";

const DEFAULT_LOCAL_BRAND_LOGO =
  "C:\\Users\\Administrator\\.cursor\\projects\\c-xampp-htdocs-ticket-system-v3\\assets\\c__Users_Administrator_AppData_Roaming_Cursor_User_workspaceStorage_6b352eb58bd06ca356f95803f2d40c4f_images_450854211_2120321401684452_5423327526871394472_n-3c16fb39-2771-4be0-ad46-42e414319b36.png";

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function makeFallbackSvg(title: string) {
  const safeTitle = escapeXml(title);
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="96" viewBox="0 0 320 96" role="img" aria-label="${safeTitle}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1220"/>
      <stop offset="100%" stop-color="#121c31"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f97316"/>
      <stop offset="100%" stop-color="#fb923c"/>
    </linearGradient>
  </defs>
  <rect width="320" height="96" rx="18" fill="url(#bg)"/>
  <circle cx="52" cy="48" r="24" fill="#0f172a" stroke="url(#accent)" stroke-width="3"/>
  <path d="M40 48l8 8 16-16" fill="none" stroke="url(#accent)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="90" y="48" text-anchor="start" dominant-baseline="middle"
    font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"
    font-size="18" font-weight="800" fill="#F8FAFC" letter-spacing="0.2">
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
  const logoPath = process.env.BRAND_LOGO_PATH?.trim() || DEFAULT_LOCAL_BRAND_LOGO;
  try {
    const buf = await readFile(logoPath);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "content-type": mimeFor(logoPath),
        "cache-control": "public, max-age=300",
      },
    });
  } catch {
    return new NextResponse(makeFallbackSvg(BRAND_TITLE), {
      status: 200,
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
        "cache-control": "public, max-age=60",
      },
    });
  }
}
