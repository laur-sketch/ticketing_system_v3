import type { SubKpiItem } from "@/lib/kpi-subkpis";

export type SubKpiCompletionMode = "checkbox" | "screenshots" | "both";

export const SUB_KPI_COMPLETION_MODE_OPTIONS: Array<{
  value: SubKpiCompletionMode;
  label: string;
}> = [
  { value: "checkbox", label: "Checkbox only" },
  { value: "screenshots", label: "Before/after screenshots only" },
  { value: "both", label: "Checkbox and screenshots" },
];

export function isSubKpiCompletionMode(value: unknown): value is SubKpiCompletionMode {
  return value === "checkbox" || value === "screenshots" || value === "both";
}

export function resolveSubKpiCompletionMode(
  item: Pick<SubKpiItem, "completionMode" | "screenshotsEnabled" | "beforeScreenshot" | "afterScreenshot">,
): SubKpiCompletionMode {
  if (isSubKpiCompletionMode(item.completionMode)) return item.completionMode;
  const legacyScreenshots =
    item.screenshotsEnabled === true ||
    (item.beforeScreenshot?.length ?? 0) > 0 ||
    (item.afterScreenshot?.length ?? 0) > 0;
  return legacyScreenshots ? "both" : "checkbox";
}

export function subKpiRequiresCheckbox(mode: SubKpiCompletionMode): boolean {
  return mode === "checkbox" || mode === "both";
}

export function subKpiRequiresScreenshots(mode: SubKpiCompletionMode): boolean {
  return mode === "screenshots" || mode === "both";
}

export function hasBeforeAndAfterScreenshots(
  item: Pick<SubKpiItem, "beforeScreenshot" | "afterScreenshot">,
): boolean {
  return (item.beforeScreenshot?.length ?? 0) > 0 && (item.afterScreenshot?.length ?? 0) > 0;
}

export function applySubKpiCompletionMode(item: SubKpiItem, mode: SubKpiCompletionMode): SubKpiItem {
  const next: SubKpiItem = { ...item, completionMode: mode };
  if (mode === "checkbox") {
    delete next.screenshotsEnabled;
  } else {
    next.screenshotsEnabled = true;
  }
  if (mode === "screenshots" && next.done && !hasBeforeAndAfterScreenshots(next)) {
    next.done = false;
  }
  return next;
}
