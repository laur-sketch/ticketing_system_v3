import { NextResponse } from "next/server";
import { loadFaqCatalog } from "@/lib/faq-store";

/** Public FAQ catalog for the sign-in page. */
export async function GET() {
  const catalog = await loadFaqCatalog();
  return NextResponse.json(catalog, {
    headers: { "Cache-Control": "public, max-age=30" },
  });
}
