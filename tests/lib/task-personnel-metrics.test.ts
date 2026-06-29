import { describe, expect, it } from "vitest";
import {
  accumulateAssigneeProgressAcrossPeriods,
  personnelAssigneeProgressAcrossPeriods,
} from "@/lib/kpi-period-snapshots";
import {
  aggregatePersonnelTaskMetrics,
  mergePersonnelMetricCards,
  normalizePersonnelTaskTotals,
} from "@/lib/task-personnel-metrics";
import type { TaskChecklistPillarMetrics } from "@/lib/kpis";

describe("accumulateAssigneeProgressAcrossPeriods", () => {
  it("sums contributor totals across Mon–Sat periods instead of averaging", () => {
    const bundles = [
      {
        progress: { total: 2, done: 1, missing: 1, percent: 50 },
        contributors: [
          {
            id: "a1",
            name: "Alex",
            role: "Assignee",
            total: 2,
            done: 1,
            remaining: 1,
            percent: 50,
          },
        ],
      },
      {
        progress: { total: 2, done: 2, missing: 0, percent: 100 },
        contributors: [
          {
            id: "a1",
            name: "Alex",
            role: "Assignee",
            total: 2,
            done: 2,
            remaining: 0,
            percent: 100,
          },
        ],
      },
    ];

    const rows = accumulateAssigneeProgressAcrossPeriods(bundles);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Alex",
      total: 4,
      done: 3,
      remaining: 1,
      percent: 75,
    });
  });
});

describe("personnelAssigneeProgressAcrossPeriods", () => {
  it("does not inflate assigned totals from historical snapshots after tasks are removed", () => {
    const bundles = [
      {
        progress: { total: 10, done: 5, missing: 5, percent: 50 },
        contributors: [
          {
            id: "m1",
            name: "Mark Anthony Robina",
            role: "Assignee",
            total: 10,
            done: 5,
            remaining: 5,
            percent: 50,
          },
        ],
      },
      {
        progress: { total: 10, done: 8, missing: 2, percent: 80 },
        contributors: [
          {
            id: "m1",
            name: "Mark Anthony Robina",
            role: "Assignee",
            total: 10,
            done: 8,
            remaining: 2,
            percent: 80,
          },
        ],
      },
    ];
    const roster = [
      {
        row: {
          subKpis: {
            segmented: false,
            items: [{ id: "s1", title: "Monitoring", done: false, assignedAgentId: "m1" }],
          },
          assignedAgent: { id: "m1", name: "Mark Anthony Robina" },
        },
        periodCount: 2,
      },
    ];

    const rows = personnelAssigneeProgressAcrossPeriods(bundles, roster, (item) => Boolean(item.done));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Mark Anthony Robina",
      total: 2,
      done: 2,
      remaining: 0,
      percent: 100,
    });
  });
});

describe("aggregatePersonnelTaskMetrics", () => {
  it("uses accumulated pillar contributor rows for monthly personnel rollups", () => {
    const pillars = {
      "SYSTEM MAINTENANCE": {
        total: 2,
        done: 1,
        missing: 1,
        percent: 50,
        periodsCounted: 2,
        periodsInRange: 2,
        assigneeProgress: [
          {
            id: "a1",
            name: "Alex",
            role: "Assignee",
            total: 2,
            done: 1,
            remaining: 1,
            percent: 50,
          },
        ],
        assigneeProgressAccumulated: [
          {
            id: "a1",
            name: "Alex",
            role: "Assignee",
            total: 4,
            done: 3,
            remaining: 1,
            percent: 75,
          },
        ],
      },
    } satisfies TaskChecklistPillarMetrics;

    const rows = aggregatePersonnelTaskMetrics(pillars);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Alex",
      done: 3,
      remaining: 1,
      percent: 75,
      pillarsContributed: 1,
    });
  });
});

describe("normalizePersonnelTaskTotals", () => {
  it("caps closed and efficiency when historical completions exceed current assigned work", () => {
    expect(normalizePersonnelTaskTotals(26, 1606)).toEqual({
      assigned: 26,
      closed: 26,
      efficiency: 100,
    });
  });
});

describe("mergePersonnelMetricCards", () => {
  it("combines ticket and task metrics for the same person into one card", () => {
    const rows = mergePersonnelMetricCards(
      [
        {
          id: "a1",
          name: "Alex",
          role: "Assignee",
          total: 4,
          done: 3,
          remaining: 1,
          percent: 75,
          pillarsContributed: 1,
        },
      ],
      [{ id: "a1", name: "Alex", closed: 5, pending: 2, efficiency: 71.4 }],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Alex",
      tickets: { closed: 5, pending: 2, efficiency: 71 },
      tasks: { closed: 3, assigned: 4, efficiency: 75, pillarsContributed: 1 },
    });
  });
});
