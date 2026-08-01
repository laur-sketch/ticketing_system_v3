import { NextResponse } from "next/server";
import type { Prisma, TicketStatus } from "@prisma/client/primary";
import { requireRole } from "@/lib/access";
import { findSessionAgentId } from "@/lib/session-agent";
import { isAgentOnDutyFromMergedDb, loadOnDutySnapshot } from "@/lib/load-on-duty-snapshot";
import { prisma } from "@/lib/prisma";
import { personnelRequestBoardWhere } from "@/lib/rfp-request-board";
import { resolveStaffCompanyTeamId } from "@/lib/staff-company-scope";
import { withTtlCache } from "@/lib/ttl-cache";

export const dynamic = "force-dynamic";

type SidebarSummary = {
  open: number;
  inProgress: number;
  escalated: number;
  onDutyCount: number;
  onDutyPreview: Array<{ id: string; name: string; companyName: string }>;
  /** Personnel only: whether this user is clocked in today. */
  selfOnDuty: boolean | null;
};

async function buildSidebarSummary(input: {
  role: string;
  email: string | null | undefined;
  name: string | null | undefined;
}): Promise<SidebarSummary> {
  const isSuperAdmin = input.role === "SuperAdmin";
  const isPersonnel = input.role === "Personnel";
  const scopedCompanyTeamId =
    isSuperAdmin || isPersonnel ? null : await resolveStaffCompanyTeamId(input.email);
  const personnelAgent = isPersonnel
    ? await findSessionAgentId({ email: input.email, name: input.name })
    : null;

  const ticketScope: Prisma.TicketWhereInput = isPersonnel
    ? await personnelRequestBoardWhere(personnelAgent?.id)
    : isSuperAdmin
      ? {}
      : { teamId: scopedCompanyTeamId ?? "__none__" };

  const countStatus = (status: TicketStatus) =>
    prisma.ticket.count({ where: { status, ...ticketScope } });

  if (isPersonnel) {
    const [open, inProgress, escalated, selfOnDuty] = await Promise.all([
      countStatus("OPEN"),
      countStatus("IN_PROGRESS"),
      countStatus("ESCALATED"),
      personnelAgent?.id
        ? isAgentOnDutyFromMergedDb(personnelAgent.id)
        : Promise.resolve(false),
    ]);
    return {
      open,
      inProgress,
      escalated,
      onDutyCount: selfOnDuty ? 1 : 0,
      onDutyPreview: [],
      selfOnDuty,
    };
  }

  const [open, inProgress, escalated, onDuty] = await Promise.all([
    countStatus("OPEN"),
    countStatus("IN_PROGRESS"),
    countStatus("ESCALATED"),
    loadOnDutySnapshot({ page: 1, pageSize: 4, onDutyOnly: true }),
  ]);

  return {
    open,
    inProgress,
    escalated,
    onDutyCount: onDuty.onDutyCount,
    onDutyPreview: onDuty.agents.slice(0, 4).map((a) => ({
      id: a.id,
      name: a.name,
      companyName: a.companyName,
    })),
    selfOnDuty: null,
  };
}

export async function GET() {
  const { session, unauthorized } = await requireRole(["Admin", "Personnel"]);
  if (unauthorized || !session?.user) return unauthorized!;

  const role = session.user.role ?? "Personnel";
  const email = session.user.email ?? "";
  const cacheKey = `sidebar-summary:${role}:${email.toLowerCase()}`;

  const result = await withTtlCache(cacheKey, 15_000, () =>
    buildSidebarSummary({
      role,
      email: session.user.email,
      name: session.user.name,
    }),
  );

  return NextResponse.json(result, {
    headers: { "cache-control": "private, max-age=10, stale-while-revalidate=20" },
  });
}
