import { NextResponse } from "next/server";
import { listRosterTeamsForSignup } from "@/lib/roster-teams";

/** Public list of company queues (for customer signup). */
export async function GET() {
  const teams = await listRosterTeamsForSignup();
  return NextResponse.json(teams);
}
