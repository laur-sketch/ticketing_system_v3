import { cn } from "@/lib/cn";

export function SevenSegmentColon({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const dotSize = compact ? "size-[2.5px]" : "size-[4px]";
  return (
    <div
      className={cn("flex shrink-0 flex-col items-center justify-center gap-1 px-0.5", className)}
      aria-hidden
    >
      <span
        className={cn(
          dotSize,
          "rounded-full bg-[var(--clock-segment-active)] shadow-[0_0_6px_var(--clock-segment-active)]",
        )}
      />
      <span
        className={cn(
          dotSize,
          "rounded-full bg-[var(--clock-segment-active)] shadow-[0_0_6px_var(--clock-segment-active)]",
        )}
      />
    </div>
  );
}
