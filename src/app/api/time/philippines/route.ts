import { NextResponse } from "next/server";
import { formatPhilippineClock, philippineDateTimeFromEpoch, PHILIPPINE_TIME_ZONE } from "@/lib/philippine-time";

export const dynamic = "force-dynamic";

export async function GET() {
  const epochMs = Date.now();
  const dt = philippineDateTimeFromEpoch(epochMs);
  const formatted = formatPhilippineClock(epochMs);
  return NextResponse.json({
    epochMs,
    timeZone: PHILIPPINE_TIME_ZONE,
    iso: dt.toISO(),
    time: formatted.time,
    date: formatted.date,
    label: "Philippine Standard Time",
  });
}
