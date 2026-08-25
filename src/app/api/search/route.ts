import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import { groupSearchResults, type GlobalSearchResponse } from "@/lib/global-search";
import { runGlobalSearch } from "@/lib/global-search-server";

/**
 * GET /api/search?q=&limit=
 * Permission-aware unified search across tickets, tasks, travel orders, projects, and users.
 */
export async function GET(req: Request) {
  const { session, unauthorized } = await requireRole([
    "SuperAdmin",
    "HighAdmin",
    "Admin",
    "Personnel",
    "Personnel-Guard",
  ]);
  if (unauthorized || !session) return unauthorized;

  const { searchParams } = new URL(req.url);
  const q = String(searchParams.get("q") ?? "").trim();
  const limitRaw = Number.parseInt(String(searchParams.get("limit") ?? "10"), 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 20) : 10;

  if (q.length < 2) {
    const empty: GlobalSearchResponse = { query: q, results: [], groups: {} };
    return NextResponse.json(empty, { headers: { "Cache-Control": "private, no-store" } });
  }

  const results = await runGlobalSearch(session, q, { limit });
  const payload: GlobalSearchResponse = {
    query: q,
    results,
    groups: groupSearchResults(results),
  };
  return NextResponse.json(payload, { headers: { "Cache-Control": "private, no-store" } });
}
