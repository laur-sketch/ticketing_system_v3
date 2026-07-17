import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import { loadOnDutySnapshot } from "@/lib/load-on-duty-snapshot";
import { withTtlCache } from "@/lib/ttl-cache";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { unauthorized } = await requireRole(["Admin", "Personnel"]);
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(req.url);
  const pageSizeRaw = Number.parseInt(searchParams.get("pageSize") ?? "6", 10) || 6;
  const pageSize = Math.min(48, Math.max(1, pageSizeRaw));
  const pageRaw = Number.parseInt(searchParams.get("page") ?? "1", 10) || 1;
  const companyFilter = searchParams.get("company")?.trim() ?? "";
  const searchQuery = searchParams.get("q")?.trim() ?? "";

  const cacheKey = `on-duty:${pageRaw}:${pageSize}:${companyFilter}:${searchQuery.toLowerCase()}`;
  const result = await withTtlCache(cacheKey, 10_000, () =>
    loadOnDutySnapshot({ page: pageRaw, pageSize, companyFilter, searchQuery }),
  );

  return NextResponse.json(result, {
    headers: { "cache-control": "private, max-age=10, stale-while-revalidate=20" },
  });
}
