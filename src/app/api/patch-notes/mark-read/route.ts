import { NextResponse } from "next/server";
import { requireSession } from "@/lib/access";
import { prismaPrimary } from "@/lib/prisma";
import {
  markAllPatchNotesViewed,
  markPatchNoteViewed,
  resolvePatchNotesUserId,
} from "@/lib/patch-notes";

/**
 * Mark patch notes as read for the merge-DB user.
 * Body: `{ markAll: true }` or `{ patchNoteId?: string }` (defaults to latest).
 */
export async function POST(req: Request) {
  const session = await requireSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { patchNoteId?: string; markAll?: boolean } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  const userId = await resolvePatchNotesUserId(session.user.id);
  if (!userId) {
    return NextResponse.json({ error: "Could not resolve user for patch notes." }, { status: 400 });
  }

  if (body.markAll === true) {
    const count = await markAllPatchNotesViewed(userId);
    return NextResponse.json({ ok: true, markAll: true, count });
  }

  let patchNoteId = typeof body.patchNoteId === "string" ? body.patchNoteId.trim() : "";
  if (!patchNoteId) {
    const latest = await prismaPrimary.patchNote.findFirst({
      orderBy: [{ releasedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true },
    });
    if (!latest) {
      return NextResponse.json({ error: "No patch notes found." }, { status: 404 });
    }
    patchNoteId = latest.id;
  } else {
    const exists = await prismaPrimary.patchNote.findUnique({
      where: { id: patchNoteId },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json({ error: "Patch note not found." }, { status: 404 });
    }
  }

  await markPatchNoteViewed(userId, patchNoteId);
  return NextResponse.json({ ok: true, patchNoteId });
}
