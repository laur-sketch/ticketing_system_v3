import { cn } from "@/lib/cn";
import { formatPhilippineBarClock } from "@/lib/philippine-time";
import { SevenSegmentColon } from "@/components/clock/SevenSegmentColon";
import { SevenSegmentPair } from "@/components/clock/SevenSegmentDigit";

type Props = {
  epochMs: number | null;
  className?: string;
  size?: "default" | "compact";
};

/** Horizontal HH:MM:SS bar display synced to Philippine time. */
export function PhilippineBarDigitalClock({ epochMs, className, size = "default" }: Props) {
  const compact = size === "compact";
  const parts = epochMs != null ? formatPhilippineBarClock(epochMs) : null;
  const digitWidth = compact ? "w-[0.62rem] sm:w-[0.68rem]" : "w-[0.95rem] sm:w-[1.05rem]";
  const colonClass = compact ? "h-[1.35rem] sm:h-[1.45rem]" : "h-[2rem] sm:h-[2.15rem]";

  return (
    <div
      className={cn(
        "select-none rounded-[var(--radius-stoic)] border border-border bg-surface-muted p-[3px] shadow-[var(--shadow-card)]",
        compact && "rounded-md p-[2px] shadow-none",
        className,
      )}
      aria-live="polite"
      aria-label={parts?.ariaLabel ?? "Loading time"}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-[calc(var(--radius-stoic)-2px)] bg-[var(--clock-face)]",
          "[--clock-face:#0a0a0a] [--clock-segment-active:#f4f4f5] [--clock-segment-inactive:color-mix(in_srgb,var(--clock-segment-active)_14%,transparent)]",
          "dark:[--clock-face:#000000] dark:[--clock-segment-active:var(--brand)] dark:[--clock-segment-inactive:color-mix(in_srgb,var(--brand)_16%,transparent)]",
          compact ? "gap-[0.06em] px-2 py-1" : "gap-[0.1em] px-4 py-2.5 sm:px-5 sm:py-3",
        )}
      >
        <SevenSegmentPair text={parts?.hours ?? "--"} digitClassName={digitWidth} />
        <SevenSegmentColon className={colonClass} compact={compact} />
        <SevenSegmentPair text={parts?.minutes ?? "--"} digitClassName={digitWidth} />
        <SevenSegmentColon className={colonClass} compact={compact} />
        <SevenSegmentPair text={parts?.seconds ?? "--"} digitClassName={digitWidth} />
      </div>
    </div>
  );
}
