import { describe, expect, it } from "vitest";
import { wrapItProjectSubKpis, type ItProjectData } from "@/lib/it-project-subkpis";
import { setTaskDailyPenaltyAmount } from "@/lib/kpi-subkpis";
import { penaltyDeductionsForKpi, subKpiAccruedPenalty } from "@/lib/task-delay-penalty";

describe("IT project delay penalty", () => {
  it("accrues daily penalty for overdue incomplete IT subtasks", () => {
    const data: ItProjectData = {
      activePhaseId: "p1",
      phases: [
        {
          id: "p1",
          name: "Phase 1",
          dueDate: "2026-07-01",
          items: [
            {
              id: "s1",
              title: "Late work",
              done: false,
              dueDate: "2026-07-01",
              assignedAgentId: "agent-1",
              assignedAgentName: "Ada",
            },
          ],
        },
      ],
    };
    let raw = wrapItProjectSubKpis(data);
    raw = setTaskDailyPenaltyAmount(raw, 2);
    const nowMs = new Date("2026-07-04T12:00:00.000Z").getTime();
    const map = penaltyDeductionsForKpi(
      {
        subKpis: raw,
        frequency: "DAILY",
        isRecurring: false,
        title: "IT PROJECT IMPLEMENTATION",
      },
      { nowMs, timeZone: "Asia/Manila" },
    );
    expect(map.size).toBe(1);
    const row = [...map.values()][0]!;
    expect(row.deduction).toBeGreaterThan(0);

    const item = data.phases[0]!.items[0]!;
    const pts = subKpiAccruedPenalty(item, {
      nowMs,
      timeZone: "Asia/Manila",
      frequency: "DAILY",
      isRecurring: false,
      title: "IT PROJECT IMPLEMENTATION",
      taskDailyPenaltyAmount: 2,
      phaseDueDate: "2026-07-01",
    });
    expect(pts).toBe(row.deduction);
  });
});
