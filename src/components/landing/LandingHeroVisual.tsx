import Image from "next/image";
import { Building2, LogIn, Shield, Users } from "lucide-react";
import { LANDING_IMAGES } from "@/lib/landing-images";

export function LandingHeroVisual() {
  return (
    <div className="relative overflow-hidden rounded-[var(--radius-stoic-lg)] border border-border shadow-[var(--shadow-elevated)]">
      <div className="relative min-h-[360px] w-full lg:min-h-[440px]">
        <Image
          src={LANDING_IMAGES.architecture}
          alt="Modern glass architecture with warm amber reflections"
          fill
          priority
          className="object-cover"
          sizes="(max-width: 1024px) 100vw, 520px"
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-background/30 via-transparent to-background/75"
          aria-hidden
        />
      </div>
      <div className="absolute inset-x-4 bottom-4 stoic-card border-border/80 bg-surface/95 p-4 backdrop-blur-md sm:inset-x-5 sm:bottom-5 sm:p-5">
        <p className="text-center text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
          Same entry for everyone
        </p>
        <div className="mt-4 flex flex-col items-center">
          <div className="flex w-full max-w-[220px] items-center justify-center gap-2 rounded-[var(--radius-stoic)] border-2 border-brand/40 bg-brand-muted px-4 py-3">
            <LogIn className="size-5 shrink-0 text-brand" aria-hidden />
            <div className="text-left">
              <p className="text-[10px] font-bold uppercase tracking-wide text-brand">One URL</p>
              <p className="text-sm font-bold text-foreground">/signin</p>
            </div>
          </div>
          <div className="my-2 h-8 w-px bg-border" aria-hidden />
          <div className="grid w-full grid-cols-3 gap-2 sm:gap-3">
            {[
              { label: "Queue", sub: "Agents", Icon: Users },
              { label: "Console", sub: "Admins", Icon: Shield },
              { label: "Portal", sub: "Customers", Icon: Building2 },
            ].map(({ label, sub, Icon }) => (
              <div
                key={label}
                className="rounded-[var(--radius-stoic)] border border-border bg-surface-muted px-2 py-3 text-center"
              >
                <Icon className="mx-auto size-4 text-brand" aria-hidden />
                <p className="mt-2 text-[11px] font-bold text-foreground">{label}</p>
                <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wide text-muted">{sub}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-4 text-center text-[11px] leading-snug text-muted">
          Your role decides the dashboard. Same sign-in and same registration screen for everyone.
        </p>
      </div>
    </div>
  );
}
