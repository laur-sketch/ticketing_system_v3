import { prismaPrimary } from "@/lib/prisma";
import {
  contentToSections,
  parsePatchNoteContent,
  type PatchNoteContentItem,
  type PatchNoteContentSections,
  type PatchNoteSection,
} from "@/lib/patch-notes-content";

export type { PatchNoteContentItem, PatchNoteContentSections, PatchNoteSection };
export { contentToSections, parsePatchNoteContent } from "@/lib/patch-notes-content";

export type PatchNoteDto = {
  id: string;
  version: string;
  title: string;
  /** Normalized display sections (features, bug fixes, others). */
  sections: PatchNoteSection[];
  /** Raw/normalized content object for clients that prefer the JSON shape. */
  content: PatchNoteContentSections;
  releasedAt: string;
  viewed?: boolean;
};

/**
 * Resolve the MergeDatabase user id for the signed-in portal account.
 * Prefers `mergedSourceUserId`; falls back to portal id so staff without an
 * HRIS link can still mark notes as read.
 */
export async function resolvePatchNotesUserId(portalAccountId: string): Promise<string | null> {
  const id = portalAccountId.trim();
  if (!id) return null;
  const portal = await prismaPrimary.portalAccount.findUnique({
    where: { id },
    select: { mergedSourceUserId: true },
  });
  if (!portal) return null;
  if (portal.mergedSourceUserId != null) {
    return portal.mergedSourceUserId.toString();
  }
  return id;
}

function toDto(row: {
  id: string;
  version: string;
  title: string;
  content: unknown;
  releasedAt: Date;
}): PatchNoteDto {
  const content = parsePatchNoteContent(row.content);
  return {
    id: row.id,
    version: row.version,
    title: row.title,
    content,
    sections: contentToSections(content),
    releasedAt: row.releasedAt.toISOString(),
  };
}

/** All patch notes, newest release first. */
export async function listPatchNotes(): Promise<PatchNoteDto[]> {
  const rows = await prismaPrimary.patchNote.findMany({
    orderBy: [{ releasedAt: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(toDto);
}

export async function getLatestPatchNote(): Promise<PatchNoteDto | null> {
  const row = await prismaPrimary.patchNote.findFirst({
    orderBy: [{ releasedAt: "desc" }, { createdAt: "desc" }],
  });
  return row ? toDto(row) : null;
}

export async function hasUserViewedPatch(userId: string, patchNoteId: string): Promise<boolean> {
  const view = await prismaPrimary.userPatchNoteView.findUnique({
    where: {
      userId_patchNoteId: { userId, patchNoteId },
    },
    select: { id: true },
  });
  return Boolean(view);
}

export async function getViewedPatchNoteIds(userId: string, patchNoteIds: string[]): Promise<Set<string>> {
  if (patchNoteIds.length === 0) return new Set();
  const views = await prismaPrimary.userPatchNoteView.findMany({
    where: { userId, patchNoteId: { in: patchNoteIds } },
    select: { patchNoteId: true },
  });
  return new Set(views.map((v) => v.patchNoteId));
}

export async function markPatchNoteViewed(userId: string, patchNoteId: string): Promise<void> {
  await prismaPrimary.userPatchNoteView.upsert({
    where: {
      userId_patchNoteId: { userId, patchNoteId },
    },
    create: { userId, patchNoteId },
    update: { viewedAt: new Date() },
  });
}

/** Mark every existing patch note as read for this user. */
export async function markAllPatchNotesViewed(userId: string): Promise<number> {
  const patches = await prismaPrimary.patchNote.findMany({ select: { id: true } });
  if (patches.length === 0) return 0;
  const now = new Date();
  await prismaPrimary.$transaction(
    patches.map((p) =>
      prismaPrimary.userPatchNoteView.upsert({
        where: { userId_patchNoteId: { userId, patchNoteId: p.id } },
        create: { userId, patchNoteId: p.id, viewedAt: now },
        update: { viewedAt: now },
      }),
    ),
  );
  return patches.length;
}
