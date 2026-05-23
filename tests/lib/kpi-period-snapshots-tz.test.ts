import { describe, expect, it } from "vitest";
import {
  kpiMaintenanceWhereForTaskMetrics,
  snapshotTimeZoneForTaskMetrics,
} from "@/lib/kpi-period-snapshots";

describe("snapshotTimeZoneForTaskMetrics", () => {
  it("prefers KPI_SNAPSHOT_TZ over client tz", () => {
    const prev = process.env.KPI_SNAPSHOT_TZ;
    process.env.KPI_SNAPSHOT_TZ = "Asia/Manila";
    expect(snapshotTimeZoneForTaskMetrics("UTC")).toBe("Asia/Manila");
    if (prev === undefined) delete process.env.KPI_SNAPSHOT_TZ;
    else process.env.KPI_SNAPSHOT_TZ = prev;
  });

  it("falls back to Asia/Manila when client sends UTC and env is unset", () => {
    const prevSnap = process.env.KPI_SNAPSHOT_TZ;
    const prevReport = process.env.REPORT_TZ;
    delete process.env.KPI_SNAPSHOT_TZ;
    delete process.env.REPORT_TZ;
    expect(snapshotTimeZoneForTaskMetrics("UTC")).toBe("Asia/Manila");
    if (prevSnap === undefined) delete process.env.KPI_SNAPSHOT_TZ;
    else process.env.KPI_SNAPSHOT_TZ = prevSnap;
    if (prevReport === undefined) delete process.env.REPORT_TZ;
    else process.env.REPORT_TZ = prevReport;
  });
});

describe("kpiMaintenanceWhereForTaskMetrics", () => {
  it("includes org-wide KPIs for assigned personnel", () => {
    expect(kpiMaintenanceWhereForTaskMetrics("agent-1")).toEqual({
      OR: [{ assignedAgentId: "agent-1" }, { assignedAgentId: null }],
    });
  });
});
