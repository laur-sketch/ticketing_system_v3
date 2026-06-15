import Image from "next/image";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  DatabaseZap,
  Network,
  ShieldCheck,
  Target,
  Terminal,
} from "lucide-react";
import { BrandLockup } from "@/components/BrandLockup";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { cn } from "@/lib/cn";
import { BRAND_TITLE } from "@/lib/brand";

const heroImage =
  "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1600&q=80";
const consoleImage =
  "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1400&q=80";

const featureImages = [
  "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=900&q=80",
];

const navItems = ["Platform", "Solutions", "Resources", "Pricing"];

const pillars = [
  {
    title: "Radical Focus",
    body: "Eliminate secondary telemetry. Surface only what matters most to the teams holding the line.",
    Icon: Target,
    tone: "border-[#ff5c00] text-[#ff5c00]",
  },
  {
    title: "Manual Precision",
    body: "Automation where helpful, control where vital. Keep high-fidelity override capability on every layer.",
    Icon: ShieldCheck,
    tone: "border-[#0096fd] text-[#a0c9ff]",
  },
  {
    title: "Systemic Health",
    body: "Live operational health, queue pressure, assignment load, and accountability in one disciplined workspace.",
    Icon: BarChart3,
    tone: "border-[#7df4ff] text-[#7df4ff]",
  },
];

const featureCards = [
  {
    marker: "01 / QUEUE",
    title: "Atomic Task Routing",
    body: "Task assignment shaped by operator bandwidth, company scope, priority, and accountable handoff.",
    accent: "text-[#ff5c00]",
  },
  {
    marker: "02 / CORE",
    title: "Infrastructure Sync",
    body: "Bi-directional state between intake, assignment boards, ticket queues, and KPI task operations.",
    accent: "text-[#a0c9ff]",
  },
  {
    marker: "03 / AUDIT",
    title: "Immutable Logging",
    body: "Every decision, transfer, escalation, and resolution remains traceable across the support lifecycle.",
    accent: "text-[#7df4ff]",
  },
];

const footerGroups = [
  {
    heading: "Product",
    links: [
      { label: "Platform", href: "#platform" },
      { label: "Solutions", href: "#solutions" },
      { label: "Pricing", href: "#pricing" },
      { label: "Documentation", href: "/tickets/knowledge" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "Resources", href: "#resources" },
      { label: "Careers", href: "mailto:support@example.com?subject=Careers" },
      { label: "Partners", href: "mailto:support@example.com?subject=Partnerships" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy", href: "mailto:support@example.com?subject=Privacy" },
      { label: "Terms", href: "mailto:support@example.com?subject=Terms" },
      { label: "Compliance", href: "mailto:support@example.com?subject=Compliance" },
    ],
  },
];

function MetricPanel({
  label,
  value,
  Icon,
  tone = "border-[#ff5c00]",
}: {
  label: string;
  value: string;
  Icon: typeof Activity;
  tone?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col justify-between rounded-lg border border-orange-200/70 border-l-4 bg-white/90 p-6 shadow-[0_18px_60px_rgba(120,53,15,0.10)] backdrop-blur-xl dark:border-white/5 dark:bg-[#1e100a]/70 sm:p-8",
        tone,
      )}
    >
      <span className="break-words font-mono text-xs font-semibold uppercase tracking-[0.04em] text-orange-900/65 dark:text-[#e4beb1]/80 sm:text-sm">
        {label}
      </span>
      <div className="mt-8 flex items-end justify-between gap-3">
        <span className="min-w-0 break-words font-mono text-3xl font-semibold text-[#2b140a] dark:text-[#fadcd2] sm:text-4xl">
          {value}
        </span>
        <Icon className="size-5 shrink-0 text-current sm:size-6" aria-hidden />
      </div>
    </div>
  );
}

export function TaskCommandLanding() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#fff7f3] font-sans text-[#2b140a] dark:bg-[#0b0b0c] dark:text-[#fadcd2]">
      <header className="sticky top-0 z-50 border-b border-orange-200/70 bg-white/85 backdrop-blur-xl dark:border-white/10 dark:bg-[#1e100a]/80">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-5 py-4 md:px-12 lg:px-20">
          <BrandLockup
            variant="landing-header"
            href="/"
            className="[&_img]:h-12 [&_img]:max-h-12 [&_img]:w-auto [&_img]:object-left [&_span]:text-[#2b140a] dark:[&_span]:text-[#fadcd2] sm:[&_img]:h-14 sm:[&_img]:max-h-14"
          />
          <nav className="hidden items-center gap-8 md:flex">
            {navItems.map((item, index) => (
              <a
                key={item}
                href={`#${item.toLowerCase()}`}
                className={cn(
                  "text-sm font-semibold transition-colors",
                  index === 0
                    ? "border-b-2 border-[#ff5c00] pb-1 text-[#a73a00] dark:border-[#ffb59a] dark:text-[#ffb59a]"
                    : "text-orange-950/65 hover:text-orange-950 dark:text-[#e4beb1] dark:hover:text-[#fadcd2]",
                )}
              >
                {item}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <ThemeToggle className="hidden border-orange-200 bg-white/70 text-orange-950 hover:bg-orange-50 hover:text-orange-900 dark:border-white/20 dark:bg-transparent dark:text-[#e4beb1] dark:hover:bg-white/5 dark:hover:text-[#fadcd2] sm:inline-flex" />
            <Link
              href="/signin"
              className="hidden border border-orange-200 bg-white/70 px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] text-orange-950 transition hover:bg-orange-50 dark:border-white/20 dark:bg-transparent dark:text-[#fadcd2] dark:hover:bg-white/5 md:inline-flex"
            >
              Schedule Demo
            </Link>
            <Link
              href="/signin"
              className="bg-[#ff5c00] px-5 py-2 text-xs font-black uppercase tracking-[0.1em] text-[#521800] shadow-[0_0_15px_-5px_rgba(255,92,0,0.5)] transition hover:brightness-110"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section id="platform" className="relative flex min-h-[min(921px,calc(100dvh+18rem))] flex-col items-center justify-center overflow-hidden px-5 py-24 md:px-12 lg:px-20">
          <div className="pointer-events-none absolute inset-0 opacity-60">
            <div className="absolute left-1/2 top-20 h-96 w-96 -translate-x-1/2 rounded-full bg-[#ff5c00]/18 blur-[120px]" />
            <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgba(255,92,0,0.04)_50%,transparent)] bg-[length:100%_4px]" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#fff7f3] via-transparent to-[#fff7f3] dark:from-[#1e100a] dark:to-[#1e100a]" />
          </div>

          <div className="relative z-10 mx-auto max-w-4xl text-center">
            <span className="mb-6 block text-xs font-black uppercase tracking-[0.28em] text-[#ff5c00]">
              Operational Readiness
            </span>
            <h1 className="text-5xl font-black leading-[1.05] tracking-[-0.04em] text-[#2b140a] dark:text-[#fadcd2] md:text-7xl">
              Infrastructure that runs on discipline.
            </h1>
            <p className="mx-auto mt-8 max-w-2xl text-lg leading-8 text-orange-950/70 dark:text-[#e4beb1]">
              From intake to resolution, architecture and workspace designed for mission-critical operations. Eliminate
              noise and focus on critical system health.
            </p>
            <div className="mt-12 flex flex-col items-center justify-center gap-5 md:flex-row">
              <Link
                href="/signin"
                className="w-full bg-[#ff5c00] px-10 py-5 text-center text-xs font-black uppercase tracking-[0.1em] text-[#521800] shadow-[0_0_15px_-5px_rgba(255,92,0,0.5)] transition hover:brightness-110 md:w-auto"
              >
                Deploy Instance
              </Link>
              <a
                href="#solutions"
                className="group flex items-center gap-2 text-xs font-black uppercase tracking-[0.1em] text-[#ffb59a]"
              >
                View System Specs
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
              </a>
            </div>
          </div>

          <div className="group relative z-10 mt-20 w-full max-w-6xl">
            <div className="absolute -inset-1 bg-gradient-to-r from-[#ff5c00]/20 to-[#0096fd]/20 opacity-60 blur-2xl transition duration-1000 group-hover:opacity-90" />
            <div className="relative overflow-hidden rounded-lg border border-orange-200/70 bg-white/80 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-[#1e100a]/70">
              <Image
                src={heroImage}
                alt="High-tech server room with orange infrastructure lighting"
                width={1600}
                height={800}
                priority
                className="h-[360px] w-full object-cover opacity-80 mix-blend-luminosity sm:h-[520px] lg:h-[600px]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#fff7f3]/85 via-transparent to-transparent dark:from-[#1e100a]/90" />
              <div className="absolute bottom-8 left-6 flex items-center gap-4 sm:bottom-10 sm:left-10">
                <span className="size-2 rounded-full bg-[#ff5c00] shadow-[0_0_18px_rgba(255,92,0,0.8)]" />
                <span className="font-mono text-sm font-semibold text-[#ff5c00]">SYSTEM STATUS: OPTIMIZED</span>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#fff0e8] px-5 py-24 md:px-12 lg:px-20 lg:py-32 dark:bg-[#180b06]">
          <div className="mx-auto grid max-w-[1280px] gap-6 md:grid-cols-3">
            {pillars.map(({ title, body, Icon, tone }) => (
              <article key={title} className={cn("border-t-2 bg-white/75 p-8 shadow-sm dark:bg-[#271812]", tone)}>
                <div className="mb-8 flex size-12 items-center justify-center bg-orange-100/80 dark:bg-white/[0.04]">
                  <Icon className="size-6" aria-hidden />
                </div>
                <h2 className="text-3xl font-bold text-[#2b140a] dark:text-[#fadcd2]">{title}</h2>
                <p className="mt-4 leading-7 text-orange-950/70 dark:text-[#e4beb1]">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="solutions" className="relative overflow-hidden px-5 py-24 md:px-12 lg:px-20 lg:py-32">
          <div className="mx-auto max-w-[1280px]">
            <div className="mb-16 text-center lg:mb-20">
              <h2 className="text-4xl font-bold tracking-tight text-[#2b140a] dark:text-[#fadcd2] md:text-5xl">The Command Interface</h2>
              <p className="mx-auto mt-4 max-w-xl text-orange-950/70 dark:text-[#e4beb1]">
                Proprietary HUD design optimized for sub-second reaction times.
              </p>
            </div>
            <div className="grid auto-rows-[240px] grid-cols-1 gap-6 md:grid-cols-12">
              <div className="group relative overflow-hidden rounded-lg border border-orange-200/70 bg-white/80 shadow-[0_18px_60px_rgba(120,53,15,0.10)] backdrop-blur-xl dark:border-white/5 dark:bg-[#1e100a]/70 lg:col-span-8 lg:row-span-2">
                <Image
                  src={consoleImage}
                  alt="Technical workstation with code and orange lighting"
                  fill
                  sizes="(min-width: 1024px) 66vw, 100vw"
                  className="object-cover opacity-80 transition-transform duration-700 group-hover:scale-105 dark:opacity-55"
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-[#fff7f3]/25 via-transparent to-[#ff5c00]/10 dark:from-[#1e100a]" />
                <div className="absolute left-6 top-6 border border-white/10 bg-black/40 px-4 py-2 backdrop-blur-md sm:left-8 sm:top-8">
                  <span className="font-mono text-sm font-semibold text-[#ff5c00]">LIVE_CONSOLE_VIEW.EXE</span>
                </div>
              </div>
              <div className="grid gap-6 sm:grid-cols-2 lg:col-span-4 lg:grid-cols-1">
                <MetricPanel label="NODE LATENCY" value="12ms" Icon={Activity} />
                <MetricPanel label="ACTIVE UPTIME" value="99.998%" Icon={CheckCircle2} tone="border-[#0096fd]" />
              </div>
              <div className="flex flex-col gap-6 rounded-lg border border-orange-200/70 bg-white/90 p-8 shadow-[0_18px_60px_rgba(120,53,15,0.10)] backdrop-blur-xl dark:border-white/5 dark:bg-[#1e100a]/70 md:col-span-12 md:flex-row md:items-center md:justify-between md:px-12">
                <div>
                  <h3 className="text-3xl font-bold text-[#2b140a] dark:text-[#fadcd2]">Ready to initialize?</h3>
                  <p className="mt-2 text-orange-950/70 dark:text-[#e4beb1]">Join technical teams using {BRAND_TITLE} to run support operations.</p>
                </div>
                <Link href="/signin" className="bg-[#ff5c00] px-8 py-4 text-center text-xs font-black uppercase tracking-[0.1em] text-[#521800]">
                  Get Started
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section id="resources" className="bg-[#fff0e8] px-5 py-24 md:px-12 lg:px-20 lg:py-32 dark:bg-[#271812]">
          <div className="mx-auto max-w-[1280px]">
            <h2 className="mb-16 text-center text-4xl font-bold text-[#2b140a] dark:text-[#fadcd2] md:text-5xl">Precision Features</h2>
            <div className="grid gap-6 md:grid-cols-3">
              {featureCards.map((feature, index) => (
                <article key={feature.title} className="group flex h-full flex-col">
                  <div className="relative aspect-video overflow-hidden rounded-t-lg">
                    <Image
                      src={featureImages[index]}
                      alt={`${feature.title} infrastructure preview`}
                      fill
                      sizes="(min-width: 768px) 33vw, 100vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-[#ff5c00]/10 transition-colors group-hover:bg-transparent" />
                  </div>
                  <div className="flex flex-1 flex-col border border-orange-200/70 bg-white/80 p-8 shadow-sm dark:border-white/5 dark:bg-[#43312a]">
                    <span className={cn("mb-4 block font-mono text-sm font-semibold", feature.accent)}>
                      {feature.marker}
                    </span>
                    <h3 className="text-3xl font-bold text-[#2b140a] dark:text-[#fadcd2]">{feature.title}</h3>
                    <p className="mt-4 flex-1 leading-7 text-orange-950/70 dark:text-[#e4beb1]">{feature.body}</p>
                    <a href="#pricing" className="mt-6 flex items-center gap-2 text-xs font-black uppercase tracking-[0.1em] text-orange-950 transition hover:text-[#a73a00] dark:text-[#fadcd2] dark:hover:text-[#ffb59a]">
                      Learn More <ArrowRight className="size-3.5" aria-hidden />
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer id="pricing" className="border-t border-orange-200/70 bg-[#fff7f3] px-5 py-16 md:px-12 lg:px-20 dark:border-white/5 dark:bg-[#180b06]">
        <div className="mx-auto grid max-w-[1280px] gap-10 md:grid-cols-4">
          <div>
            <BrandLockup
              variant="landing-header"
              href="/"
              className="[&_img]:h-16 [&_img]:max-h-16 [&_img]:w-auto [&_img]:object-left [&_span]:text-[#2b140a] dark:[&_span]:text-[#fadcd2] sm:[&_img]:h-[4.5rem] sm:[&_img]:max-h-[4.5rem]"
            />
            <p className="mt-4 leading-7 text-orange-950/70 dark:text-[#e4beb1]">
              Engineering operational excellence through disciplined architectural design.
            </p>
            <div className="mt-8 flex gap-4 text-orange-950/60 dark:text-[#e4beb1]">
              <Terminal className="size-5 transition hover:text-[#ffb59a]" aria-hidden />
              <Network className="size-5 transition hover:text-[#ffb59a]" aria-hidden />
              <DatabaseZap className="size-5 transition hover:text-[#ffb59a]" aria-hidden />
            </div>
          </div>
          {footerGroups.map(({ heading, links }) => (
            <div key={heading} className="flex flex-col gap-4">
              <span className="mb-2 text-xs font-black uppercase tracking-[0.1em] text-[#ff5c00]">{heading}</span>
              {links.map((item) => (
                <a key={item.label} href={item.href} className="text-xs font-bold uppercase tracking-[0.1em] text-orange-950/70 transition hover:text-[#a73a00] dark:text-[#e4beb1] dark:hover:text-[#7df4ff]">
                  {item.label}
                </a>
              ))}
              {heading === "Legal" ? (
                <p className="mt-4 border-t border-orange-200/70 pt-4 font-mono text-[10px] text-orange-950/60 dark:border-white/10 dark:text-[#e4beb1]">
                  © 2026 {BRAND_TITLE}. Operational Excellence.
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}
