import { TicketPriority } from "@prisma/client/primary";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";

const priorities = new Set(Object.values(TicketPriority));
const notifyTargets = new Set(["NONE", "ADMIN", "SUPERADMIN", "ADMIN_AND_SUPERADMIN"]);

/** Priority alerts now live in SuperAdmin Settings → SuperAdmin only. */
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
  const triggers = await prisma.escalationTrigger.findMany({
    orderBy: { priority: "asc" },
  });
  return NextResponse.json(triggers);
}

export async function PATCH(req: Request) {
  const denied = await guardSuperAdmin();
  if (denied) return denied;

  const body = await req.json();
  const priority = body.priority as TicketPriority;
  const enabled = Boolean(body.enabled);
  const notifyTarget = String(body.notifyTarget ?? "NONE").toUpperCase();

  if (!priorities.has(priority)) {
    return NextResponse.json({ error: "Invalid priority." }, { status: 400 });
  }
  if (!notifyTargets.has(notifyTarget)) {
    return NextResponse.json({ error: "Invalid notifyTarget." }, { status: 400 });
  }
  const notifyAdmin = notifyTarget === "ADMIN" || notifyTarget === "ADMIN_AND_SUPERADMIN";

  const trigger = await prisma.escalationTrigger.upsert({
    where: { priority },
    create: { priority, enabled, notifyAdmin, notifyTarget },
    update: { enabled, notifyAdmin, notifyTarget },
  });

  return NextResponse.json(trigger);
}
