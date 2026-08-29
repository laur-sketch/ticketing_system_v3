import { NextResponse } from "next/server";
import { requireSession } from "@/lib/access";
import { parseIntakeRequestTypeVisibility } from "@/lib/intake-request-type-visibility";
import {
  getIntakeRequestTypeVisibility,
  setIntakeRequestTypeVisibility,
} from "@/lib/intake-request-type-visibility-db";

async function guardSuperAdmin() {
  const session = await requireSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "SuperAdmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const denied = await guardSuperAdmin();
  if (denied) return denied;
  const config = await getIntakeRequestTypeVisibility();
  return NextResponse.json(config);
}

export async function PUT(req: Request) {
  const denied = await guardSuperAdmin();
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as { hiddenTypeIds?: unknown };
  try {
    const config = await setIntakeRequestTypeVisibility(
      parseIntakeRequestTypeVisibility(body),
    );
    return NextResponse.json(config);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save intake request types." },
      { status: 400 },
    );
  }
}

export async function POST() {
  /** Reset — show all request types. */
  const denied = await guardSuperAdmin();
  if (denied) return denied;
  const config = await setIntakeRequestTypeVisibility({ hiddenTypeIds: [] });
  return NextResponse.json(config);
}
