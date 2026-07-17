import { isItProjectEnvelope, parseItProjectSubKpis } from "@/lib/it-project-subkpis";
import { normalizeSubKpis, type SubKpiItem } from "@/lib/kpi-subkpis";
import { subKpiRequirementsMet } from "@/lib/sub-kpi-completion-mode";

/** Flat sub-task shape returned by the /kpi-maintenance/[id]/subtasks REST endpoints. */
export type SubTaskDto = {
  id: string;
  title: string;
  description: string | null;
  /** Derived board status ("Done" / "Pending"), or the IT-project projectStatus when set. */
  status: string;
  done: boolean;
  assignee: { id: string; name: string } | null;
  startDate: string | null;
  dueDate: string | null;
  priority: SubKpiItem["projectPriority"];
  segmentId: string | null;
  segmentLabel: string | null;
  assistanceRequested: boolean;
};

export function subTaskToDto(
  item: SubKpiItem,
  segment?: { id: string; label: string } | null,
): SubTaskDto {
  const done = subKpiRequirementsMet(item);
  return {
    id: item.id,
    title: item.title,
    description: item.description?.trim() ? item.description.trim() : null,
    status: item.projectStatus ?? (done ? "Done" : "Pending"),
    done,
    assignee:
      item.assignedAgentId && item.assignedAgentId.trim()
        ? { id: item.assignedAgentId.trim(), name: item.assignedAgentName?.trim() || "Assignee" }
        : null,
    startDate: item.startDate ?? null,
    dueDate: item.dueDate ?? null,
    priority: item.projectPriority ?? null,
    segmentId: segment?.id ?? null,
    segmentLabel: segment?.label ?? null,
    assistanceRequested: item.assistanceRequested === true,
  };
}

/** List all sub-tasks (flat, segmented, or IT-project envelopes) as REST DTOs. */
export function listSubTaskDtos(subKpisRaw: unknown): SubTaskDto[] {
  if (isItProjectEnvelope(subKpisRaw)) {
    const parsed = parseItProjectSubKpis(subKpisRaw);
    return parsed.phases.flatMap((phase) =>
      phase.items.map((item) => subTaskToDto(item, { id: phase.id, label: phase.name })),
    );
  }
  const n = normalizeSubKpis(subKpisRaw);
  if (n.segmented) {
    return n.segments.flatMap((seg) =>
      seg.items.map((item) => subTaskToDto(item, { id: seg.id, label: seg.label })),
    );
  }
  return n.flat.map((item) => subTaskToDto(item, null));
}
