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
          title: "Empty Personnel when using mergeddatabase-dev",
          description:
            "HRIS rows tagged hris-dev are included again so the roster is not empty against the dev merge database.",
        },
        {
          title: "Subtask assignee toggle ignored",
          description:
            "Unchecking Enable Subtask Assignees now correctly hides helper assignee dropdowns until Seek Assistance is used.",
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
