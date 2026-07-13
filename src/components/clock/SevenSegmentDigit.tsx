import { cn } from "@/lib/cn";

type SegmentId = "a" | "b" | "c" | "d" | "e" | "f" | "g";

const DIGIT_SEGMENTS: Record<number, SegmentId[]> = {
  0: ["a", "b", "c", "d", "e", "f"],
  1: ["b", "c"],
  2: ["a", "b", "g", "e", "d"],
  3: ["a", "b", "g", "c", "d"],
  4: ["f", "g", "b", "c"],
  5: ["a", "f", "g", "c", "d"],
  6: ["a", "f", "g", "e", "c", "d"],
  7: ["a", "b", "c"],
  8: ["a", "b", "c", "d", "e", "f", "g"],
  9: ["a", "b", "c", "d", "f", "g"],
};

/** Rounded bar paths for a single seven-segment digit (viewBox 0 0 30 52). */
const SEGMENT_RECTS: Record<SegmentId, string> = {
  a: "M5.5 2.5h19a2 2 0 0 1 2 2v2.5a2 2 0 0 1-2 2h-19a2 2 0 0 1-2-2v-2.5a2 2 0 0 1 2-2z",
  b: "M22.5 6.5h2.5a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-2.5a2 2 0 0 1-2-2v-16a2 2 0 0 1 2-2z",
  c: "M22.5 28.5h2.5a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-2.5a2 2 0 0 1-2-2v-16a2 2 0 0 1 2-2z",
  d: "M5.5 45.5h19a2 2 0 0 1 2 2v2.5a2 2 0 0 1-2 2h-19a2 2 0 0 1-2-2v-2.5a2 2 0 0 1 2-2z",
  e: "M5 28.5h2.5a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-2.5a2 2 0 0 1-2-2v-16a2 2 0 0 1 2-2z",
  f: "M5 6.5h2.5a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-2.5a2 2 0 0 1-2-2v-16a2 2 0 0 1 2-2z",
  g: "M5.5 24h19a2 2 0 0 1 2 2v2.5a2 2 0 0 1-2 2h-19a2 2 0 0 1-2-2v-2.5a2 2 0 0 1 2-2z",
};

const ALL_SEGMENTS: SegmentId[] = ["a", "b", "c", "d", "e", "f", "g"];

type Props = {
  value: number | null;
  className?: string;
  activeClassName?: string;
  inactiveClassName?: string;
  slashedZero?: boolean;
  glow?: boolean;
};

export function SevenSegmentDigit({
  value,
  className,
  activeClassName = "fill-[var(--clock-segment-active,var(--foreground))]",
  inactiveClassName = "fill-[var(--clock-segment-inactive,color-mix(in_srgb,var(--foreground)_10%,var(--border)))]",
  slashedZero = false,
  glow = false,
}: Props) {
  const lit =
    value != null && value >= 0 && value <= 9 ? new Set(DIGIT_SEGMENTS[value]) : new Set<SegmentId>();

  return (
    <svg
      viewBox="0 0 30 52"
      className={cn(
        "block h-auto w-full",
        glow && "drop-shadow-[0_0_5px_var(--clock-segment-active)]",
        className,
      )}
      aria-hidden
    >
      {ALL_SEGMENTS.map((segment) => (
        <path
          key={segment}
          d={SEGMENT_RECTS[segment]}
          className={lit.has(segment) ? activeClassName : inactiveClassName}
        />
      ))}
      {slashedZero && value === 0 ? (
        <line
          x1="8"
          y1="44"
          x2="22"
          y2="8"
          stroke="var(--clock-segment-active)"
          strokeWidth="2.75"
          strokeLinecap="round"
          className={glow ? "drop-shadow-[0_0_4px_var(--clock-segment-active)]" : undefined}
        />
      ) : null}
    </svg>
  );
}

export function SevenSegmentPair({
  text,
  digitClassName,
  slashedZero,
  glow,
}: {
  text: string;
  digitClassName?: string;
  slashedZero?: boolean;
  glow?: boolean;
}) {
  const chars = text.padStart(2, "0").slice(-2).split("");
  return (
    <div className="flex items-center gap-[0.18em]">
      {chars.map((char, index) => {
        const digit = Number(char);
        return (
          <SevenSegmentDigit
            key={`${char}-${index}`}
            value={Number.isFinite(digit) ? digit : null}
            className={digitClassName}
            slashedZero={slashedZero}
            glow={glow}
          />
        );
      })}
    </div>
  );
}
