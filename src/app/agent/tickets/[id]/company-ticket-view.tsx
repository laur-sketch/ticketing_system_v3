import Link from "next/link";
import type { TicketStatus } from "@prisma/client";
import { formatTicketStatusLabel } from "@/lib/ticket-status-label";
import { cn } from "@/lib/cn";

function statusPillClass(status: TicketStatus) {
  if (status === "OPEN") {
    return "bg-sky-500/15 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200";
  }
  if (status === "IN_PROGRESS") {
    return "bg-indigo-500/15 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-200";
  }
  if (status === "FOR_CONFIRMATION" || status === "RESOLVED") {
    return "bg-emerald-500/15 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200";
  }
  if (status === "ESCALATED") {
    return "bg-amber-500/15 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200";
  }
  if (status === "PENDING_INFO") {
    return "bg-violet-500/15 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200";
  }
  return "bg-zinc-200 text-zinc-700 dark:bg-zinc-700/60 dark:text-zinc-200";
}

export function CompanyTicketView({
  ticketNumber,
  status,
  backHref,
}: {
  ticketNumber: string;
  status: TicketStatus;
  backHref: string;
}) {
  return (
    <div className="flex min-h-[12rem] flex-col items-center justify-center px-6 py-10">
      <Link
        href={backHref}
        className="mb-8 self-start text-xs font-semibold text-orange-300 hover:underline"
      >
        ← Back to company board
      </Link>
      <div className="w-full max-w-md rounded-2xl border border-zinc-700/80 bg-[#0e1629]/90 p-8 shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
        <dl className="space-y-8">
          <div className="text-center">
            <dt className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Ticket number</dt>
            <dd className="mt-2 font-mono text-2xl font-bold tracking-tight text-zinc-50">{ticketNumber}</dd>
          </div>
          <div className="text-center">
            <dt className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Status</dt>
            <dd className="mt-3">
              <span
                className={cn(
                  "inline-flex rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wide",
                  statusPillClass(status),
                )}
              >
                {formatTicketStatusLabel(status)}
              </span>
            </dd>
          </div>
        </dl>
      </div>
      <Link
        href={backHref}
        className="mt-8 inline-flex h-10 items-center justify-center rounded-lg border border-zinc-600 bg-zinc-900 px-5 text-sm font-semibold text-zinc-200 hover:bg-zinc-800"
      >
        Close
      </Link>
    </div>
  );
}
