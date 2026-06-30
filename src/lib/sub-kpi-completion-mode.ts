import type { SubKpiItem } from "@/lib/kpi-subkpis";

export type SubKpiCompletionMode = "checkbox" | "screenshots" | "both";

export type SubKpiCompletionRequirements = {
  checkbox: boolean;
  screenshots: boolean;
  numerical: boolean;
};

export const DEFAULT_COMPLETION_REQUIREMENTS: SubKpiCompletionRequirements = {
  checkbox: true,
  screenshots: false,
  numerical: false,
};

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

export function normalizeCompletionRequirements(
  value: unknown,
): SubKpiCompletionRequirements | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const checkbox = raw.checkbox === true;
  const screenshots = raw.screenshots === true;
  const numerical = raw.numerical === true;
  if (!checkbox && !screenshots && !numerical) return null;
  return { checkbox, screenshots, numerical };
}

export function completionRequirementsFromLegacyMode(
  mode: SubKpiCompletionMode,
): SubKpiCompletionRequirements {
  return {
    checkbox: mode === "checkbox" || mode === "both",
    screenshots: mode === "screenshots" || mode === "both",
    numerical: false,
  };
}

export function resolveSubKpiCompletionRequirements(
  item: Pick<SubKpiItem, "completionRequirements" | "completionMode" | "screenshotsEnabled" | "beforeScreenshot" | "afterScreenshot">,
): SubKpiCompletionRequirements {
  const normalized = normalizeCompletionRequirements(item.completionRequirements);
  if (normalized) return normalized;
  return completionRequirementsFromLegacyMode(resolveSubKpiCompletionMode(item));
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

export function subKpiRequiresCheckbox(requirements: SubKpiCompletionRequirements): boolean {
  return requirements.checkbox;
}

export function subKpiRequiresScreenshots(requirements: SubKpiCompletionRequirements): boolean {
  return requirements.screenshots;
}

export function subKpiRequiresNumerical(requirements: SubKpiCompletionRequirements): boolean {
  return requirements.numerical;
}

/** @deprecated use resolveSubKpiCompletionRequirements */
export function subKpiRequiresCheckboxFromMode(mode: SubKpiCompletionMode): boolean {
  return mode === "checkbox" || mode === "both";
}

/** @deprecated use resolveSubKpiCompletionRequirements */
export function subKpiRequiresScreenshotsFromMode(mode: SubKpiCompletionMode): boolean {
  return mode === "screenshots" || mode === "both";
}

export function hasBeforeAndAfterScreenshots(
  item: Pick<SubKpiItem, "beforeScreenshot" | "afterScreenshot">,
): boolean {
  return (item.beforeScreenshot?.length ?? 0) > 0 && (item.afterScreenshot?.length ?? 0) > 0;
}

export function hasNumericalRecord(item: Pick<SubKpiItem, "numericalValue">): boolean {
  return typeof item.numericalValue === "number" && Number.isFinite(item.numericalValue);
}

export function subKpiRequirementsMet(
  item: Pick<
    SubKpiItem,
    | "done"
    | "completionRequirements"
    | "completionMode"
    | "screenshotsEnabled"
    | "beforeScreenshot"
    | "afterScreenshot"
    | "numericalValue"
  >,
): boolean {
  const req = resolveSubKpiCompletionRequirements(item);
  if (req.checkbox && !item.done) return false;
  if (req.screenshots && !hasBeforeAndAfterScreenshots(item)) return false;
  if (req.numerical && !hasNumericalRecord(item)) return false;
  return req.checkbox || req.screenshots || req.numerical;
}

export function applySubKpiCompletionMode(item: SubKpiItem, mode: SubKpiCompletionMode): SubKpiItem {
  const requirements = completionRequirementsFromLegacyMode(mode);
  return applySubKpiCompletionRequirements(item, requirements);
}

export function applySubKpiCompletionRequirements(
  item: SubKpiItem,
  requirements: SubKpiCompletionRequirements,
): SubKpiItem {
  const next: SubKpiItem = {
    ...item,
    completionRequirements: requirements,
  };
  if (requirements.screenshots) {
    next.screenshotsEnabled = true;
  } else {
    delete next.screenshotsEnabled;
  }
  if (!requirements.checkbox && !subKpiRequirementsMet({ ...next, done: false })) {
    next.done = false;
  }
  if (requirements.screenshots && next.done && !hasBeforeAndAfterScreenshots(next)) {
    next.done = false;
  }
  if (requirements.numerical && next.done && !hasNumericalRecord(next)) {
    next.done = false;
  }
  return next;
}

export function completionRequirementsToPersist(
  requirements: SubKpiCompletionRequirements,
): SubKpiItem["completionRequirements"] {
  return {
    checkbox: requirements.checkbox,
    screenshots: requirements.screenshots,
    numerical: requirements.numerical,
  };
}
