import type {
  PatchNoteContentItem,
  PatchNoteContentSections,
  PatchNoteSection,
} from "@/lib/patch-notes-seed";

export type { PatchNoteContentItem, PatchNoteContentSections, PatchNoteSection };

const KNOWN_SECTION_LABELS: Record<string, string> = {
  newFeatures: "New Features / Improvements",
  improvements: "New Features / Improvements",
  bugFixes: "Bug Fixes",
  other: "Other",
  notes: "Notes",
};

function parseItem(row: unknown): PatchNoteContentItem | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const title = typeof r.title === "string" ? r.title.trim() : "";
  const description = typeof r.description === "string" ? r.description.trim() : "";
  if (!title && !description) return null;
  return { title: title || "Update", description };
}

function parseItemList(raw: unknown): PatchNoteContentItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseItem).filter((x): x is PatchNoteContentItem => x != null);
}

function humanizeSectionKey(key: string): string {
  if (KNOWN_SECTION_LABELS[key]) return KNOWN_SECTION_LABELS[key];
  const spaced = key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!spaced) return "Updates";
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Accepts:
 * - new shape `{ newFeatures, bugFixes, ... }`
 * - legacy flat array `[{ title, description }]` → treated as newFeatures
 * - JSON string of either shape
 */
export function parsePatchNoteContent(raw: unknown): PatchNoteContentSections {
  let value: unknown = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return {};
    }
  }
  if (Array.isArray(value)) {
    const items = parseItemList(value);
    return items.length > 0 ? { newFeatures: items } : {};
  }
  if (!value || typeof value !== "object") return {};

  const obj = value as Record<string, unknown>;
  const out: PatchNoteContentSections = {};
  for (const [key, entry] of Object.entries(obj)) {
    const items = parseItemList(entry);
    if (items.length > 0) out[key] = items;
  }
  return out;
}

/** Flatten content into ordered UI sections (merge newFeatures + improvements). */
export function contentToSections(content: PatchNoteContentSections): PatchNoteSection[] {
  const sections: PatchNoteSection[] = [];
  const featureItems = [...(content.newFeatures ?? []), ...(content.improvements ?? [])];
  if (featureItems.length > 0) {
    sections.push({
      key: "newFeatures",
      label: "New Features / Improvements",
      items: featureItems,
    });
  }

  const bugFixes = content.bugFixes ?? [];
  if (bugFixes.length > 0) {
    sections.push({
      key: "bugFixes",
      label: "Bug Fixes",
      items: bugFixes,
    });
  }

  const reserved = new Set(["newFeatures", "improvements", "bugFixes"]);
  for (const [key, items] of Object.entries(content)) {
    if (reserved.has(key) || !items || items.length === 0) continue;
    sections.push({
      key,
      label: humanizeSectionKey(key),
      items,
    });
  }
  return sections;
}

/** Ensure a patch payload always has displayable sections. */
export function resolvePatchNoteSections(note: {
  sections?: PatchNoteSection[] | null;
  content?: unknown;
}): PatchNoteSection[] {
  if (Array.isArray(note.sections) && note.sections.length > 0) {
    return note.sections;
  }
  return contentToSections(parsePatchNoteContent(note.content));
}
