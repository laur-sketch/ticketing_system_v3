import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { loadStaffAssignmentColorsForAgents } from "@/lib/assignee-assignment-color";
import { canViewerApproveTransfer, parseTransferRequestDetail } from "@/lib/ticket-transfer-request";
import { formatTicketStatusLabel } from "@/lib/ticket-status-label";
import { safeReturnToParam } from "@/lib/safe-return-to";
import { AgentWorkspace } from "./workspace";

export const dynamic = "force-dynamic";

export default async function AgentTicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const session = await requireSession();
  if (!session?.user) redirect("/signin");
  if (!["SuperAdmin", "Admin", "Personnel"].includes(session.user.role)) redirect("/");

  const { id } = await params;
  const sp = await searchParams;
  const backHref = safeReturnToParam(sp.returnTo, "/agent");

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      team: true,
      assignedAgent: true,
      activities: { orderBy: { createdAt: "asc" } },
      messages: { orderBy: { createdAt: "asc" } },
      feedback: { select: { csat: true, comment: true } },
    },
  });
  if (!ticket) notFound();

  const assigneeColorMap = await loadStaffAssignmentColorsForAgents([
    { email: ticket.assignedAgent?.email, name: ticket.assignedAgent?.name },
  ]);
  const assigneeEmail = ticket.assignedAgent?.email?.trim().toLowerCase();
  const staffAssignmentColor = assigneeEmail ? (assigneeColorMap.get(assigneeEmail) ?? null) : null;
  const ticketForWorkspace = {
    ...ticket,
    assignedAgent: ticket.assignedAgent
      ? { ...ticket.assignedAgent, staffAssignmentColor }
      : null,
  };
  const requestorEmail = (ticketForWorkspace.requestorEmail ?? ticketForWorkspace.contactEmail ?? "").trim();
  const requestorAccount = requestorEmail
    ? await prisma.portalAccount.findFirst({
        where: { email: { equals: requestorEmail, mode: "insensitive" } },
        select: {
          company: { select: { name: true } },
          staffDesignatedCompany: { select: { name: true } },
        },
      })
    : null;
  const requestorCompanyName =
    requestorAccount?.company?.name?.trim() ||
    requestorAccount?.staffDesignatedCompany?.name?.trim() ||
    null;
  let transferPending = false;
  let lastTransferDetail: string | null = null;
  for (const a of ticketForWorkspace.activities) {
    if (a.summary === "Transfer requested") {
      transferPending = true;
      lastTransferDetail = a.detail ?? null;
    }
    if (a.summary === "Transfer approved" || a.summary === "Transfer rejected") {
      transferPending = false;
      lastTransferDetail = null;
    }
  }

  const normalizedEmail = (session.user.email ?? "").trim().toLowerCase();
  const normalizedName = (session.user.name ?? "").trim();
  const operatorByEmail = normalizedEmail
    ? await prisma.agent.findUnique({
        where: { email: normalizedEmail },
        include: { team: true },
      })
    : null;
  const operatorByName =
    !operatorByEmail && normalizedName
      ? await prisma.agent.findFirst({
          where: { name: normalizedName },
          include: { team: true },
        })
      : null;
  const operator = operatorByEmail ?? operatorByName;
  const isAdmin = session.user.role === "SuperAdmin" || session.user.role === "Admin";
  const isAssignedOperator = !!operator && operator.id === ticketForWorkspace.assignedAgentId;
  if (session.user.role === "Personnel" && !isAssignedOperator) {
    redirect("/agent");
  }
  const canUpdatePriority = isAdmin || isAssignedOperator;
  const canRequestTransfer = !isAdmin && isAssignedOperator;
  const myPortal = normalizedEmail
    ? await prisma.portalAccount.findFirst({
        where: { email: { equals: normalizedEmail, mode: "insensitive" } },
        select: { id: true },
      })
    : null;
  const canApproveTransfer = transferPending
    ? canViewerApproveTransfer({
        sessionRole: session.user.role,
        reviewerPortalAccountId: myPortal?.id ?? null,
        parsed: parseTransferRequestDetail(lastTransferDetail),
      })
    : false;

  return (
    <main className="fixed inset-0 z-40 bg-black/55 px-3 py-4 text-zinc-100 backdrop-blur-[2px] sm:px-6 sm:py-6">
      <div className="mx-auto flex h-full max-w-[1200px] items-center justify-center">
        <div className="w-full rounded-3xl border border-zinc-700/80 bg-black/30 p-2 shadow-[0_30px_90px_rgba(0,0,0,0.55)] backdrop-blur-sm">
          <section className="mx-auto flex max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-[#0b1220] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.45)] sm:p-6">
            <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-zinc-800/90 bg-[#0e1629]/80 p-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:p-5">
              <div>
                <Link href={backHref} className="text-xs font-semibold text-orange-300 hover:underline">
                  {backHref === "/agent" ? "← Back to queue" : "← Back"}
                </Link>
                <h1 className="mt-2 text-xl font-semibold text-zinc-100 sm:text-2xl">
                  {ticketForWorkspace.ticketNumber}{" "}
                  <span className="text-sm font-normal text-zinc-400 sm:text-base">· {ticketForWorkspace.title}</span>
                </h1>
                <p className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">
                  Customer: <span className="text-zinc-300 normal-case tracking-normal">{ticketForWorkspace.contactName}</span>
                </p>
                <p className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">
                  Requestor Email:{" "}
                  <span className="text-zinc-300 normal-case tracking-normal">
                    {ticketForWorkspace.requestorEmail ?? ticketForWorkspace.contactEmail}
                  </span>
                </p>
                <p className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">
                  Company:{" "}
                  <span className="text-zinc-300 normal-case tracking-normal">
                    {requestorCompanyName ?? "Not assigned"}
                  </span>
                </p>
                {ticketForWorkspace.team?.name ? (
                  <p className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">
                    Company Requested to:{" "}
                    <span className="text-zinc-300 normal-case tracking-normal">{ticketForWorkspace.team.name}</span>
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <span className="w-fit rounded-full bg-zinc-700 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-200">
                  {formatTicketStatusLabel(ticketForWorkspace.status)}
                </span>
                <Link
                  href={backHref}
                  className="inline-flex h-8 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 px-3 text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
                >
                  Close
                </Link>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <AgentWorkspace
                ticket={ticketForWorkspace}
                canUpdatePriority={canUpdatePriority}
                canRequestTransfer={canRequestTransfer}
                canApproveTransfer={canApproveTransfer}
                transferPending={transferPending}
              />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
