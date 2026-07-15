import { NextResponse } from "next/server";

import { runPortalToMergedSync } from "@/lib/auth/portal-to-merged-sync";
import { runPortalWorkToMergedSync } from "@/lib/sync/portal-work-to-merged";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request) {
  const configured = process.env.INTERNAL_JOB_KEY?.trim();
  if (!configured) return false;
  return req.headers.get("x-internal-job-key") === configured;
}

/** POST /api/jobs/sync-portal-merged — ongoing PortalAccount → merged_users + work sync */
export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await runPortalToMergedSync({ dryRun: false });
  const work = await runPortalWorkToMergedSync({ dryRun: false });
  return NextResponse.json(
    { users, work },
    { headers: { "cache-control": "no-store" } },
  );
}
