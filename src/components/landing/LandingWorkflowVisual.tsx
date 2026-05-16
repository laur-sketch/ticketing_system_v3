import Image from "next/image";
import { LANDING_IMAGES } from "@/lib/landing-images";

export function LandingWorkflowVisual() {
  return (
    <article className="relative overflow-hidden rounded-[var(--radius-stoic-lg)] border border-border shadow-[var(--shadow-card)]">
      <div className="relative min-h-[320px] w-full lg:min-h-[380px]">
        <Image
          src={LANDING_IMAGES.infrastructure}
          alt="Server racks and network switches with amber status indicators"
          fill
          className="object-cover"
          sizes="(max-width: 1024px) 100vw, 480px"
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/92 via-background/35 to-transparent"
          aria-hidden
        />
      </div>
      <div className="absolute inset-x-4 bottom-4 space-y-3 sm:inset-x-5 sm:bottom-5">
        <div className="stoic-card border-border/80 bg-surface/95 p-4 backdrop-blur-md">
          <span className="inline-block rounded bg-brand px-2 py-0.5 text-[10px] font-bold uppercase text-brand-ink">
            Critical
          </span>
          <p className="mt-2 text-xs font-semibold text-foreground">Database latency in cluster Alpha-7</p>
          <p className="mt-1 text-xs text-muted">Ticket #INC-204 · Kanban queue</p>
        </div>
        <div className="stoic-card border-border/80 bg-surface/95 p-4 backdrop-blur-md">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">System stability</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
            <div className="h-full w-[99.8%] rounded-full bg-brand" />
          </div>
          <p className="mt-1 text-right text-[10px] font-bold tabular-nums text-brand">99.8%</p>
        </div>
      </div>
    </article>
  );
}
