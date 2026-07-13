import { Prisma } from "@prisma/client/primary";
import { normalizePersonName } from "@/lib/admin-roster";
import { prisma } from "@/lib/prisma";
import { isStaffPortalRole } from "@/lib/staff-role";

export type AgentColorIdentity = {
  email?: string | null | undefined;
  name?: string | null | undefined;
};

/**
 * Maps **Agent roster email** (lower-trim) → portal `staffAssignmentColor` for Admin/Personnel.
 *
 * Uses raw SQL for email matches (Prisma client may lag the schema), then falls back to
 * **normalized display name** when no portal row shares the agent email — same idea as
 * `pickCanonicalAgentForPortal`, so assignee colors still work if Agent.email was out of sync.
 */
export async function loadStaffAssignmentColorsForAgents(
  agents: Iterable<AgentColorIdentity>,
): Promise<Map<string, string | null>> {
  const list = [...agents]
    .map((a) => ({
      emailKey: (a.email ?? "").trim().toLowerCase(),
      nameTrim: (a.name ?? "").trim(),
    }))
    .filter((a) => a.emailKey.length > 0);

  if (list.length === 0) return new Map();

  const uniqueEmails = [...new Set(list.map((a) => a.emailKey))];
  const emailToName = new Map<string, string>();
  for (const a of list) {
    if (!emailToName.has(a.emailKey)) emailToName.set(a.emailKey, a.nameTrim);
  }

  let emailRows: Array<{ e: string; c: string | null; r: string }> = [];
  try {
    emailRows = await prisma.$queryRaw<Array<{ e: string; c: string | null; r: string }>>(
      Prisma.sql`SELECT LOWER(TRIM(email)) AS e, "staffAssignmentColor" AS c, role AS r FROM "PortalAccount" WHERE LOWER(TRIM(email)) IN (${Prisma.join(
        uniqueEmails.map((x) => Prisma.sql`${x}`),
      )})`,
    );
  } catch {
    return new Map();
  }
  const byEmail = new Map(emailRows.map((r) => [r.e, r]));

  const needsNameFallback = uniqueEmails.some((ek) => !byEmail.has(ek));

  const nameToColor = new Map<string, string | null>();
  if (needsNameFallback) {
    try {
      const all = await prisma.portalAccount.findMany({
        select: { name: true, role: true, staffAssignmentColor: true },
      });
      for (const p of all) {
        if (!isStaffPortalRole(p.role)) continue;
        const nk = normalizePersonName(p.name);
        if (!nk) continue;
        if (!nameToColor.has(nk)) nameToColor.set(nk, p.staffAssignmentColor ?? null);
      }
    } catch {
      /* ignore */
    }
  }

  const out = new Map<string, string | null>();
  for (const emailKey of uniqueEmails) {
    const hit = byEmail.get(emailKey);
    const nameTrim = emailToName.get(emailKey) ?? "";
    if (hit) {
      out.set(emailKey, isStaffPortalRole(hit.r) ? hit.c : null);
    } else if (nameTrim) {
      const nk = normalizePersonName(nameTrim);
      out.set(emailKey, nameToColor.get(nk) ?? null);
    } else {
      out.set(emailKey, null);
    }
  }
  return out;
}

/** @deprecated Prefer {@link loadStaffAssignmentColorsForAgents} with `{ email, name }` when the name is available. */
export async function loadStaffAssignmentColorsForAgentEmails(
  emails: Iterable<string | null | undefined>,
): Promise<Map<string, string | null>> {
  return loadStaffAssignmentColorsForAgents([...emails].map((email) => ({ email })));
}
