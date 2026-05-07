import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/access";
import { customerTicketWhereBySessionEmail } from "@/lib/customer-pending-resolution";
import { prisma } from "@/lib/prisma";
import { findSessionAgentId } from "@/lib/session-agent";
import { BRAND_TITLE, BRAND_TAGLINE_CUSTOMER } from "@/lib/brand";

export const dynamic = "force-dynamic";

function firstQuery(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function MyTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; submitted?: string | string[] }>;
}) {
  const session = await requireSession();
  if (!session?.user) redirect("/signin");
  if (
    session.user.role !== "Customer" &&
    session.user.role !== "Personnel" &&
    session.user.role !== "Admin"
  ) {
    redirect("/");
  }
  const role = session.user.role;
  const params = await searchParams;
  const query = firstQuery(params.q)?.trim() ?? "";
  const submitted = firstQuery(params.submitted) === "1";

  const scope =
    role === "Customer"
      ? customerTicketWhereBySessionEmail(session.user.email ?? "")
      : await (async () => {
          const operator = await findSessionAgentId({ email: session.user.email, name: session.user.name });
          return operator ? ({ assignedAgentId: operator.id } as const) : { id: "__none__" };
        })();
  const searchOr: Prisma.TicketWhereInput | undefined = query
    ? {
        OR: [
          { ticketNumber: { contains: query, mode: "insensitive" } },
          { title: { contains: query, mode: "insensitive" } },
        ],
      }
    : undefined;
  const tickets = await prisma.ticket.findMany({
    where: searchOr ? { AND: [scope, searchOr] } : scope,
    orderBy: { createdAt: "desc" },
    include: { team: true, assignedAgent: true },
    take: 100,
  });

  return (
    <main className="min-h-[calc(100vh-56px)] bg-zinc-50 text-zinc-900 dark:bg-[#070d19] dark:text-zinc-100">
      <div className="mx-auto max-w-[1280px] space-y-5 px-4 py-6 sm:py-8 md:py-10">
        {submitted && role === "Customer" ? (
          <div className="rounded-xl border border-orange-400/50 bg-orange-500/15 px-4 py-3 text-sm text-orange-950 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-200">
            Ticket submitted successfully. You can now track it here in your customer portal.
          </div>
        ) : null}
        <div className="rounded-2xl border border-zinc-200 bg-gradient-to-b from-white to-zinc-50 p-6 shadow-[0_12px_40px_rgba(0,0,0,0.06)] dark:border-zinc-800/90 dark:from-[#0d1629] dark:to-[#0b1220] dark:shadow-[0_18px_48px_rgba(0,0,0,0.35)]">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-700 dark:text-orange-400/95">
            {BRAND_TITLE} · {BRAND_TAGLINE_CUSTOMER}
          </p>
          <h1 className="mt-1.5 text-[2.1rem] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {role === "Customer" ? "My submitted tickets" : "My tickets"}
          </h1>
          <p className="mt-2.5 text-[1.05rem] text-zinc-700 dark:text-zinc-300">
            {role === "Customer"
              ? "Track all tickets you submitted and open any ticket for conversation and status updates."
              : "Track tickets assigned to you and open any ticket for conversation and status updates."}
          </p>
          {query ? (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Showing results for &ldquo;{query}&rdquo;
            </p>
          ) : null}
        </div>

        <div className="space-y-3 sm:hidden">
          {tickets.length === 0 ? (
            <article className="rounded-2xl border border-zinc-200 bg-white px-4 py-5 text-sm text-zinc-700 shadow-[0_8px_24px_rgba(0,0,0,0.06)] dark:border-zinc-800 dark:bg-[#0b1220] dark:text-zinc-300 dark:shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
              {role === "Customer" ? "No submitted tickets yet." : "No tickets assigned to you yet."}
            </article>
          ) : (
            tickets.map((t) => (
              <article
                key={t.id}
                className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.06)] dark:border-zinc-800 dark:bg-[#0b1220] dark:shadow-[0_10px_30px_rgba(0,0,0,0.25)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/tickets/${t.id}`}
                    className="font-mono text-xs font-semibold text-orange-700 hover:underline dark:text-orange-300"
                  >
                    {t.ticketNumber}
                  </Link>
                  <span className="rounded-full bg-zinc-200 px-2.5 py-1 text-[10px] font-semibold uppercase text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200">
                    {t.status.replaceAll("_", " ")}
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">{t.title}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                  <p>Priority: {t.priority}</p>
                  <p>Assigned: {t.assignedAgent?.name ?? "Queue"}</p>
                </div>
              </article>
            ))
          )}
        </div>

        <div className="hidden overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.06)] dark:border-zinc-800/90 dark:bg-[#0b1220] dark:shadow-[0_14px_36px_rgba(0,0,0,0.28)] sm:block">
          <table className="w-full min-w-[640px] table-fixed divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead className="bg-zinc-100 text-left text-xs font-bold uppercase tracking-[0.08em] text-zinc-600 dark:bg-zinc-900/90 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3.5">Ticket</th>
                <th className="px-4 py-3.5">Title</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Priority</th>
                <th className="px-4 py-3.5">Assigned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {tickets.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-[1.02rem] text-zinc-600 dark:text-zinc-400">
                    {role === "Customer" ? "No submitted tickets yet." : "No tickets assigned to you yet."}
                  </td>
                </tr>
              ) : (
                tickets.map((t) => (
                  <tr key={t.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/80">
                    <td className="px-4 py-3 font-mono text-xs text-orange-700 dark:text-orange-300">
                      <Link href={`/tickets/${t.id}`} className="hover:underline">
                        {t.ticketNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-zinc-900 dark:text-zinc-100">{t.title}</td>
                    <td className="px-4 py-3 text-xs font-semibold uppercase text-zinc-800 dark:text-zinc-200">
                      {t.status.replaceAll("_", " ")}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-700 dark:text-zinc-300">{t.priority}</td>
                    <td className="px-4 py-3 text-xs text-zinc-700 dark:text-zinc-300">
                      {t.assignedAgent?.name ?? "Queue"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
