import { NextResponse } from "next/server";

const bootId = `${Date.now()}`;

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ bootId });
}
