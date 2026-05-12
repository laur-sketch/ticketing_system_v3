import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Reads/writes `PortalAccount.staffAssignmentColor` via raw SQL so the app keeps
 * working when `prisma generate` could not refresh the client (e.g. Windows EPERM
 * while `next dev` holds the query engine DLL).
 */
export async function loadPortalStaffAssignmentColorMap(): Promise<Map<string, string | null>> {
  try {
    const rows = await prisma.$queryRaw<{ id: string; staffAssignmentColor: string | null }[]>(
      Prisma.sql`SELECT id, "staffAssignmentColor" FROM "PortalAccount"`,
    );
    return new Map(rows.map((r) => [r.id, r.staffAssignmentColor]));
  } catch {
    return new Map();
  }
}

export async function setPortalStaffAssignmentColor(portalId: string, color: string | null): Promise<void> {
  if (color === null) {
    await prisma.$executeRaw(
      Prisma.sql`UPDATE "PortalAccount" SET "staffAssignmentColor" = NULL WHERE id = ${portalId}`,
    );
  } else {
    await prisma.$executeRaw(
      Prisma.sql`UPDATE "PortalAccount" SET "staffAssignmentColor" = ${color} WHERE id = ${portalId}`,
    );
  }
}

export async function getPortalStaffAssignmentColor(portalId: string): Promise<string | null> {
  try {
    const rows = await prisma.$queryRaw<{ staffAssignmentColor: string | null }[]>(
      Prisma.sql`SELECT "staffAssignmentColor" FROM "PortalAccount" WHERE id = ${portalId} LIMIT 1`,
    );
    return rows[0]?.staffAssignmentColor ?? null;
  } catch {
    return null;
  }
}
