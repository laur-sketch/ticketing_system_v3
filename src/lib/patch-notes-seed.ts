/** Structured changelog body stored in PatchNote.content (JSONB). */
export type PatchNoteContentItem = {
  title: string;
  description: string;
};

/**
 * Preferred shape: `{ newFeatures, bugFixes, ...otherSections }`.
 * Legacy flat arrays are still accepted by the parser.
 */
export type PatchNoteContentSections = {
  newFeatures?: PatchNoteContentItem[];
  improvements?: PatchNoteContentItem[];
  bugFixes?: PatchNoteContentItem[];
  [sectionKey: string]: PatchNoteContentItem[] | undefined;
};

/** Normalized section for UI rendering. */
export type PatchNoteSection = {
  key: string;
  label: string;
  items: PatchNoteContentItem[];
};

export type PatchNoteSeed = {
  version: string;
  title: string;
  releasedAt: string;
  content: PatchNoteContentSections;
};

export const PATCH_NOTE_SEEDS: PatchNoteSeed[] = [
  {
    version: "0.4.1",
    title: "Seek Assistance, roster search & branding",
    releasedAt: "2026-07-18T00:00:00.000Z",
    content: {
      newFeatures: [
        {
          title: "Seek Assistance on the main task",
          description:
            "Request help from the main-task or segment modal with a dedicated Seek Assistance dialog, instead of hunting for it only on individual sub-tasks.",
        },
        {
          title: "Personnel and Activities roster search",
          description:
            "Filter staff lists by name or email on Personnel and Activities so you can find people faster in large rosters.",
        },
      ],
      improvements: [
        {
          title: "AGCTek LaunchPad BETA branding",
          description:
            "Staff surfaces rebrand to AGCTek LaunchPad BETA with a simpler admin header and sidebar chrome.",
        },
        {
          title: "On Duty panel clarity",
          description:
            "The On Duty panel is easier to scan when assigning work from today's clocked-in roster.",
        },
      ],
      bugFixes: [
        {
          title: "Seek Assistance hard to reach on complex tasks",
          description:
            "Assistance can be requested from the elevated main-task / segment controls so helpers unlock without digging through every sub-task row.",
        },
      ],
    },
  },
  {
    version: "0.3.0",
    title: "Sub-task managers & recurrence rollover",
    releasedAt: "2026-07-17T00:00:00.000Z",
    content: {
      newFeatures: [
        {
          title: "Sub-task manager popups",
          description:
            "Add and edit sub-tasks from dedicated popups on create and on the Task Board, instead of managing long inline lists.",
        },
        {
          title: "Unified Project create flow",
          description:
            "Projects use the same task-group and sub-task path as normal tasks. You no longer have to force the IT PROJECT IMPLEMENTATION pillar when creating a project.",
        },
        {
          title: "Sub-task REST endpoints",
          description:
            "Create and update individual sub-tasks through dedicated KPI maintenance routes used by the new manager popups.",
        },
      ],
      improvements: [
        {
          title: "Cleaner task create UI",
          description:
            "Draft sub-tasks open in a focused popup with clearer fields for title, description, priority, and due date.",
        },
      ],
      bugFixes: [
        {
          title: "Weekly tasks stayed DONE until the next calendar day",
          description:
            "Weekly recurring checklists now roll back to CURRENT as soon as every sub-task is complete, so the next cycle starts immediately.",
        },
        {
          title: "Monthly tasks stayed DONE until the next calendar day",
          description:
            "Monthly recurring checklists now recur immediately on full completion instead of waiting overnight before resetting.",
        },
        {
          title: "Quarterly tasks stayed DONE until the next calendar day",
          description:
            "Quarterly recurring checklists now roll over to the next period right when they hit DONE.",
        },
        {
          title: "Project create forced IT PROJECT IMPLEMENTATION",
          description:
            "Creating a Project no longer locks the task group to IT PROJECT IMPLEMENTATION. Pick any task group and attach sub-tasks like a normal one-off task.",
        },
      ],
    },
  },
  {
    version: "0.2.0",
    title: "Task Management & Personnel Updates",
    releasedAt: "2026-07-16T00:00:00.000Z",
    content: {
      newFeatures: [
        {
          title: "Subtask helper assignees",
          description:
            "When creating a task or project you can turn off subtask assignees. The main assignee can later press Seek Assistance to unlock a helper for a specific subtask.",
        },
        {
          title: "IT project start, end, and delay penalties",
          description:
            "IT project subtasks now support Start/End and daily delay penalties when work runs past the due date, with clearer progress on company metrics.",
        },
        {
          title: "Patch Notes history",
          description:
            "Open Patch Notes from the header to see every release, grouped by new features and bug fixes.",
        },
      ],
      improvements: [
        {
          title: "Personnel roster from merge database",
          description:
            "The Personnel page loads HRIS employees from your secondary merge database (including mergeddatabase-dev) and shows the real database name in the UI.",
        },
        {
          title: "On Duty from clock-ins",
          description:
            "Activities and assignment lists use today's merged clock-ins so only On Duty people appear as available assignees.",
        },
      ],
      bugFixes: [
        {
          title: "Empty Personnel roster on mergeddatabase-dev",
          description:
            "HRIS rows tagged hris-dev are included again so the Personnel page is not blank against the dev merge database.",
        },
        {
          title: "Enable Subtask Assignees toggle was ignored",
          description:
            "Unchecking Enable Subtask Assignees now hides helper assignee dropdowns until Seek Assistance unlocks a subtask.",
        },
        {
          title: "Seek Assistance still required when helpers were disabled",
          description:
            "With subtask assignees turned off at create time, helpers stay locked until the main assignee explicitly requests assistance.",
        },
      ],
    },
  },
  {
    version: "0.1.0",
    title: "Initial Command Center release",
    releasedAt: "2026-06-01T00:00:00.000Z",
    content: {
      newFeatures: [
        {
          title: "Ticket queue and assignment",
          description:
            "Staff can view, claim, and work tickets from the help desk queue with company-aware routing.",
        },
        {
          title: "Task and KPI boards",
          description:
            "Managers can define recurring tasks and projects, assign them to personnel, and track completion on the board.",
        },
        {
          title: "Personnel and roles",
          description:
            "Admins can manage staff roles and company queues so the right people see the right work.",
        },
      ],
      bugFixes: [],
    },
  },
];

/** @deprecated Prefer PATCH_NOTE_SEEDS — kept for older ensure scripts. */
export const DEFAULT_PATCH_NOTE_SEED = PATCH_NOTE_SEEDS[0]!;
