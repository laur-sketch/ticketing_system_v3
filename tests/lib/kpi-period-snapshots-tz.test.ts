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

  it("falls back to Asia/Taipei when client sends UTC and env is unset", () => {
    const prevSnap = process.env.KPI_SNAPSHOT_TZ;
    const prevReport = process.env.REPORT_TZ;
    const prevApp = process.env.APP_TIME_ZONE;
    delete process.env.KPI_SNAPSHOT_TZ;
    delete process.env.REPORT_TZ;
    delete process.env.APP_TIME_ZONE;
    expect(snapshotTimeZoneForTaskMetrics("UTC")).toBe("Asia/Taipei");
    if (prevSnap === undefined) delete process.env.KPI_SNAPSHOT_TZ;
    else process.env.KPI_SNAPSHOT_TZ = prevSnap;
    if (prevReport === undefined) delete process.env.REPORT_TZ;
    else process.env.REPORT_TZ = prevReport;
    if (prevApp === undefined) delete process.env.APP_TIME_ZONE;
    else process.env.APP_TIME_ZONE = prevApp;
  });
});

describe("kpiMaintenanceWhereForTaskMetrics", () => {
  it("scopes personnel metrics to their assigned KPIs only", () => {
    expect(kpiMaintenanceWhereForTaskMetrics("agent-1")).toEqual({
      assignedAgentId: "agent-1",
    });
  });
});
