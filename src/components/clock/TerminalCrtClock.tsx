import { cn } from "@/lib/cn";
import { formatPhilippineBarClock } from "@/lib/philippine-time";
import { SevenSegmentColon } from "@/components/clock/SevenSegmentColon";
import { SevenSegmentPair } from "@/components/clock/SevenSegmentDigit";

type Props = {
  epochMs: number | null;
  className?: string;
  size?: "default" | "compact";
};

function TerminalTraceDecor({ side }: { side: "left" | "right" }) {
  const mirror = side === "right";
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-y-6 w-7 opacity-70",
        mirror ? "right-2" : "left-2",
      )}
      aria-hidden
    >
      <svg viewBox="0 0 28 120" className="h-full w-full text-[var(--terminal-accent)]" fill="none">
        <path
          d={mirror ? "M4 4 V116 M4 20 H18 M4 52 H14 M4 84 H20" : "M24 4 V116 M24 20 H10 M24 52 H16 M24 84 H8"}
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
        <circle cx={mirror ? 4 : 24} cy="20" r="1.5" fill="currentColor" />
        <circle cx={mirror ? 18 : 10} cy="52" r="1.5" fill="currentColor" />
        <circle cx={mirror ? 4 : 24} cy="84" r="1.5" fill="currentColor" />
      </svg>
    </div>
  );
}

/** CRT terminal clock — amber glow on dark scanline screen, no metadata labels. */
export function TerminalCrtClock({ epochMs, className, size = "default" }: Props) {
  const compact = size === "compact";
  const parts = epochMs != null ? formatPhilippineBarClock(epochMs) : null;
  const digitWidth = compact ? "w-[0.62rem] sm:w-[0.68rem]" : "w-[1.15rem] sm:w-[1.35rem]";
  const colonClass = compact ? "h-[1.35rem] sm:h-[1.45rem]" : "h-[2.35rem] sm:h-[2.65rem]";

  return (
    <div
      className={cn(
        "select-none",
        compact ? "w-auto" : "w-full max-w-[22rem]",
        className,
      )}
      aria-live="polite"
      aria-label={parts?.ariaLabel ?? "Loading time"}
    >
      <div
        className={cn(
          "rounded-[1.15rem] border border-[color-mix(in_srgb,var(--terminal-accent)_32%,#1a2220)] bg-[#0c1010] p-2.5",
          "shadow-[0_0_36px_color-mix(in_srgb,var(--terminal-accent)_14%,transparent),inset_0_0_48px_rgba(0,0,0,0.75)]",
          compact && "rounded-md border p-[2px] shadow-none",
        )}
      >
        <div
          className={cn(
            "relative overflow-hidden rounded-[0.65rem] bg-[#050a0a]",
            "[--terminal-accent:var(--brand)] [--clock-segment-active:var(--brand)] [--clock-segment-inactive:color-mix(in_srgb,var(--brand)_12%,transparent)]",
            compact ? "px-2 py-1" : "px-5 py-8 sm:px-6 sm:py-10",
          )}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.22]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(to bottom, transparent 0px, transparent 2px, rgba(0,0,0,0.55) 2px, rgba(0,0,0,0.55) 4px)",
            }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_42%,rgba(0,0,0,0.55)_100%)]"
            aria-hidden
          />
          {!compact ? (
            <>
              <TerminalTraceDecor side="left" />
              <TerminalTraceDecor side="right" />
            </>
          ) : null}

          <div
            className={cn(
              "relative flex items-center justify-center",
              compact ? "gap-[0.06em]" : "gap-[0.12em]",
            )}
          >
            <SevenSegmentPair
              text={parts?.hours ?? "--"}
              digitClassName={digitWidth}
              slashedZero
              glow
            />
            <SevenSegmentColon className={cn(colonClass, "text-[var(--terminal-accent)]")} compact={compact} />
            <SevenSegmentPair
              text={parts?.minutes ?? "--"}
              digitClassName={digitWidth}
              slashedZero
              glow
            />
            <SevenSegmentColon className={cn(colonClass, "text-[var(--terminal-accent)]")} compact={compact} />
            <SevenSegmentPair
              text={parts?.seconds ?? "--"}
              digitClassName={digitWidth}
              slashedZero
              glow
            />
          </div>
        </div>
      </div>
    </div>
  );
}
