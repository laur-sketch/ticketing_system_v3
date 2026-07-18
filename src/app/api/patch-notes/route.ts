import { NextResponse } from "next/server";
import { requireSession } from "@/lib/access";
import {
  getViewedPatchNoteIdsForKeys,
  listPatchNotes,
  resolvePatchNotesUserKeys,
} from "@/lib/patch-notes";

/** Full patch history (newest first) + whether the latest is unread for auto-show. */
export async function GET() {
  const session = await requireSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const patches = await listPatchNotes();
    if (patches.length === 0) {
      return NextResponse.json({
        patches: [],
        latest: null,
        hasViewedLatest: true,
        autoShow: false,
      });
    }

    const keys = await resolvePatchNotesUserKeys(session.user.id);
    const latest = patches[0]!;
    if (!keys) {
      return NextResponse.json({
        patches,
        latest,
        hasViewedLatest: true,
        autoShow: false,
      });
    }

    const lookupIds = [keys.primaryUserId, ...keys.legacyUserIds];
    const viewedIds = await getViewedPatchNoteIdsForKeys(
      lookupIds,
      patches.map((p) => p.id),
    );
    const patchesWithView = patches.map((p) => ({
      ...p,
      viewed: viewedIds.has(p.id),
    }));
    const hasViewedLatest = viewedIds.has(latest.id);

    return NextResponse.json({
      patches: patchesWithView,
      latest,
      hasViewedLatest,
      /** Auto-open only when the newest release has never been marked read for this user. */
      autoShow: !hasViewedLatest,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("PatchNote") || message.includes("does not exist") || message.includes("42P01")) {
      console.warn("[patch-notes] tables missing; run scripts/ensure-patch-notes.ts");
      return NextResponse.json({
        patches: [],
        latest: null,
        hasViewedLatest: true,
        autoShow: false,
      });
    }
    throw err;
  }
}
