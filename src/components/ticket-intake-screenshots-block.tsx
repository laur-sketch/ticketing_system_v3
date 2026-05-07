import { parseIntakeScreenshotMeta } from "@/lib/ticket-intake-screenshots-meta";

export function TicketIntakeScreenshotsBlock({
  ticketId,
  meta,
  headingClassName,
  cardClassName,
}: {
  ticketId: string;
  meta: unknown;
  headingClassName?: string;
  cardClassName?: string;
}) {
  const items = parseIntakeScreenshotMeta(meta);
  if (items.length === 0) return null;

  const h2 = headingClassName ?? "text-sm font-semibold text-white";
  const card =
    cardClassName ??
    "rounded-2xl border border-zinc-800 bg-[#0b1220] p-5 shadow-sm";

  return (
    <article className={card}>
      <h2 className={h2}>Screenshots from request</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Submitted with the intake form. Click an image to open the full size.
      </p>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((m) => {
          const href = `/api/tickets/${ticketId}/screenshots/${encodeURIComponent(m.storedFileName)}`;
          return (
            <li key={m.storedFileName} className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/40">
              <a href={href} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element -- auth cookies; external API route */}
                <img
                  src={href}
                  alt={m.originalName}
                  className="h-36 w-full object-cover object-top"
                  loading="lazy"
                />
              </a>
              <p className="truncate px-2 py-1.5 text-[11px] text-zinc-500" title={m.originalName}>
                {m.originalName}
              </p>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
