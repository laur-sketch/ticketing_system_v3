import { AgentTicketDeepLink } from "@/components/AgentTicketDeepLink";
import type { TicketLogEntry } from "@/lib/ticket-activity-log";
import { formatRelativeAgo } from "@/lib/ticket-board-formatters";

export function TicketActivityLogPanel({
  entries,
  linkTickets = true,
}: {
  entries: TicketLogEntry[];
  /** Personnel cannot open arbitrary tickets — show plain ticket numbers instead of links. */
  linkTickets?: boolean;
}) {
  return (
    <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_8px_28px_rgba(0,0,0,0.06)] dark:border-zinc-800 dark:bg-[#0b1220] dark:shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-zinc-700 dark:text-zinc-300">
            Ticket activity log
          </h2>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-500">
            Recent events across tickets in your visible companies (newest first).
          </p>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-500">
          No activity to show for this scope yet.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-zinc-200 dark:divide-zinc-800">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-col gap-1 py-3 first:pt-0 sm:flex-row sm:items-start sm:gap-4">
              <div className="shrink-0 text-[11px] text-zinc-500 dark:text-zinc-500">
                <time dateTime={e.createdAt.toISOString()}>{formatRelativeAgo(e.createdAt)}</time>
                <p className="mt-0.5 font-mono text-[10px] text-zinc-600 dark:text-zinc-400">{e.actor}</p>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  {linkTickets ? (
                    <AgentTicketDeepLink
                      ticketId={e.ticketId}
                      className="font-mono text-xs font-semibold text-orange-700 hover:underline dark:text-orange-400"
                    >
                      {e.ticketNumber}
                    </AgentTicketDeepLink>
                  ) : (
                    <span className="font-mono text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      {e.ticketNumber}
                    </span>
                  )}
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{e.summary}</span>
                </div>
                {e.detail ? (
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                    {e.detail}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
