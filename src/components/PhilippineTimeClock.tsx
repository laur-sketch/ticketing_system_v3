"use client";

import { cn } from "@/lib/cn";
import { PhilippineBarDigitalClock } from "@/components/clock/PhilippineBarDigitalClock";
import { TerminalCrtClock } from "@/components/clock/TerminalCrtClock";
import { usePhilippineTimeSync } from "@/hooks/usePhilippineTimeSync";

type Props = {
  className?: string;
  compact?: boolean;
  /** CRT terminal clock for auth pages; bar clock for dashboards */
  variant?: "inline" | "display" | "terminal";
};

/** Live clock synced to server time, displayed in Asia/Manila (PHT). */
export function PhilippineTimeClock({ className, compact = false, variant = "inline" }: Props) {
  const displayMs = usePhilippineTimeSync();

  if (variant === "terminal" || variant === "display") {
    return (
      <TerminalCrtClock
        epochMs={displayMs}
        size={compact ? "compact" : "default"}
        className={cn(className)}
      />
    );
  }

  const size = compact ? "compact" : "default";

  return (
    <PhilippineBarDigitalClock
      epochMs={displayMs}
      size={size}
      className={cn(className)}
    />
  );
}
