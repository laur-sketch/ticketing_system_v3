import { runComputeUserEfficiencyBreakdowns } from "@/lib/efficiency/user-efficiency-breakdown";

/** Fire-and-forget refresh of merged personnel efficiency after penalty changes. */
export function triggerEfficiencyRecomputeBackground(): void {
  void runComputeUserEfficiencyBreakdowns({
    dryRun: false,
    frequencies: ["MONTHLY", "WEEKLY"],
    lookbackPeriods: 1,
  }).catch((err) => {
    console.error("[efficiency-recompute]", err);
  });
}
