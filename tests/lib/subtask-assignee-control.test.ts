import { describe, expect, it } from "vitest";
import {
  canMutateSubKpiAssignee,
  isSubKpiAssigneeUnlocked,
  normalizeSubKpis,
  setSubKpiItemAssistanceRequested,
  type SubKpiItem,
} from "@/lib/kpi-subkpis";
import {
  parseItProjectSubKpis,
  setItProjectSubKpiAssistanceRequested,
  wrapItProjectSubKpis,
} from "@/lib/it-project-subkpis";

describe("subtask assignee unlock helpers", () => {
  it("unlocks when parent flag is enabled", () => {
    expect(isSubKpiAssigneeUnlocked(true, {})).toBe(true);
    expect(isSubKpiAssigneeUnlocked(true, { assistanceRequested: false })).toBe(true);
  });

  it("unlocks when Seek Assistance was requested", () => {
    expect(isSubKpiAssigneeUnlocked(false, { assistanceRequested: true })).toBe(true);
    expect(isSubKpiAssigneeUnlocked(false, {})).toBe(false);
  });

  it("allows mutate when unlocked and assigner or main assignee", () => {
    const unlockedItem: Pick<SubKpiItem, "assistanceRequested"> = { assistanceRequested: true };
    expect(
      canMutateSubKpiAssignee({
        enableSubtaskAssignees: false,
        item: unlockedItem,
        canAssignWork: false,
        isMainAssignee: true,
      }),
    ).toBe(true);
    expect(
      canMutateSubKpiAssignee({
        enableSubtaskAssignees: true,
        item: {},
        canAssignWork: true,
        isMainAssignee: false,
      }),
    ).toBe(true);
    expect(
      canMutateSubKpiAssignee({
        enableSubtaskAssignees: false,
        item: {},
        canAssignWork: true,
        isMainAssignee: true,
      }),
    ).toBe(false);
  });
});

describe("assistanceRequested persistence", () => {
  it("round-trips on flat subKpis", () => {
    const raw = [{ id: "s1", title: "Wire cabinets", done: false }];
    const updated = setSubKpiItemAssistanceRequested(raw, "s1", "agent-1", "2026-07-16T04:00:00.000Z");
    expect(updated).not.toBeNull();
    const items = normalizeSubKpis(updated).segmented
      ? []
      : (normalizeSubKpis(updated) as { segmented: false; flat: SubKpiItem[] }).flat;
    expect(items[0]?.assistanceRequested).toBe(true);
    expect(items[0]?.assistanceRequestedBy).toBe("agent-1");
    expect(items[0]?.assistanceRequestedAt).toBe("2026-07-16T04:00:00.000Z");
  });

  it("round-trips on IT project envelope", () => {
    const envelope = wrapItProjectSubKpis({
      activePhaseId: "p1",
      phases: [
        {
          id: "p1",
          name: "Phase 1",
          items: [{ id: "it1", title: "Kickoff", done: false }],
        },
      ],
    });
    const updated = setItProjectSubKpiAssistanceRequested(
      envelope,
      "it1",
      "agent-9",
      "2026-07-16T05:00:00.000Z",
    );
    expect(updated).not.toBeNull();
    const parsed = parseItProjectSubKpis(updated);
    const item = parsed.phases[0]!.items[0]!;
    expect(item.assistanceRequested).toBe(true);
    expect(item.assistanceRequestedBy).toBe("agent-9");
    expect(item.assistanceRequestedAt).toBe("2026-07-16T05:00:00.000Z");
  });

  it("returns null when subtask id is missing", () => {
    expect(setSubKpiItemAssistanceRequested([{ id: "a", title: "A" }], "missing", "x")).toBeNull();
    expect(
      setItProjectSubKpiAssistanceRequested(
        wrapItProjectSubKpis({
          activePhaseId: "p1",
          phases: [{ id: "p1", name: "P", items: [{ id: "a", title: "A", done: false }] }],
        }),
        "missing",
        "x",
      ),
    ).toBeNull();
  });
});
