import { describe, expect, it } from "vitest";
import {
  appendSubKpiItem,
  collectAllSubKpiItems,
  normalizeSubKpis,
  removeSubKpiItem,
  updateSubKpiItem,
} from "@/lib/kpi-subkpis";
import { listSubTaskDtos } from "@/lib/kpi-subtasks-rest";

const baseChecklist = [{ id: "a", title: "First step", done: false }];

describe("sub-task manager fields (description + priority)", () => {
  it("persists description and priority when appending a sub-task", () => {
    const result = appendSubKpiItem(baseChecklist, {
      title: "Write docs",
      description: "  Cover the new API endpoints  ",
      dueDate: "2026-08-01",
      projectPriority: "High",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const items = collectAllSubKpiItems(normalizeSubKpis(result.json));
    const added = items.find((it) => it.title === "Write docs");
    expect(added?.description).toBe("Cover the new API endpoints");
    expect(added?.projectPriority).toBe("High");
    expect(added?.dueDate).toBe("2026-08-01");
  });

  it("updates and clears description and priority on an existing sub-task", () => {
    const withDesc = updateSubKpiItem(baseChecklist, "a", {
      description: "Details here",
      projectPriority: "Medium",
    });
    expect(withDesc.ok).toBe(true);
    if (!withDesc.ok) return;
    let items = collectAllSubKpiItems(normalizeSubKpis(withDesc.json));
    expect(items[0]?.description).toBe("Details here");
    expect(items[0]?.projectPriority).toBe("Medium");

    const cleared = updateSubKpiItem(withDesc.json, "a", {
      description: null,
      projectPriority: null,
    });
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) return;
    items = collectAllSubKpiItems(normalizeSubKpis(cleared.json));
    expect(items[0]?.description).toBeUndefined();
    expect(items[0]?.projectPriority).toBeUndefined();
  });

  it("rejects invalid priorities instead of persisting them", () => {
    const result = appendSubKpiItem(baseChecklist, {
      title: "Bad priority",
      projectPriority: "Urgent",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const items = collectAllSubKpiItems(normalizeSubKpis(result.json));
    expect(items.find((it) => it.title === "Bad priority")?.projectPriority).toBeUndefined();
  });

  it("maps sub-tasks to REST DTOs with derived status and assignee", () => {
    const checklist = [
      {
        id: "a",
        title: "First step",
        description: "Kick things off",
        done: true,
        assignedAgentId: "agent-1",
        assignedAgentName: "Alice",
        dueDate: "2026-08-05",
        projectPriority: "Low",
      },
      { id: "b", title: "Second step", done: false },
    ];
    const dtos = listSubTaskDtos(checklist);
    expect(dtos).toHaveLength(2);
    expect(dtos[0]).toMatchObject({
      id: "a",
      title: "First step",
      description: "Kick things off",
      status: "Done",
      done: true,
      assignee: { id: "agent-1", name: "Alice" },
      dueDate: "2026-08-05",
      priority: "Low",
    });
    expect(dtos[1]).toMatchObject({ id: "b", status: "Pending", done: false, assignee: null });
  });

  it("keeps at least one sub-task when deleting", () => {
    const result = removeSubKpiItem(baseChecklist, "a");
    expect(result.ok).toBe(false);
  });
});
