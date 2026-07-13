/** Pillar + optional main task naming on KPI maintenance rows. */
export type KpiMainTaskRecord = {
  title: string;
  mainTask?: string | null;
};

/** Display name for the task card and pillar-only completion row. */
export function kpiMainTaskLabel(record: KpiMainTaskRecord): string {
  const main = typeof record.mainTask === "string" ? record.mainTask.trim() : "";
  if (main) return main;
  return record.title.trim();
}

export function kpiPillarLabel(record: { title: string }): string {
  return record.title.trim();
}

/** True when `mainTask` is set and differs from the pillar title. */
export function kpiHasDistinctMainTask(record: KpiMainTaskRecord): boolean {
  const main = typeof record.mainTask === "string" ? record.mainTask.trim() : "";
  if (!main) return false;
  return main.toLowerCase() !== record.title.trim().toLowerCase();
}
