import { NextResponse } from "next/server";
import { requireSession } from "@/lib/access";
import {
  getViewedPatchNoteIds,
  listPatchNotes,
  resolvePatchNotesUserId,
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

    const userId = await resolvePatchNotesUserId(session.user.id);
    const latest = patches[0]!;
    if (!userId) {
      return NextResponse.json({
        patches,
        latest,
        hasViewedLatest: true,
        autoShow: false,
      });
    }

    const viewedIds = await getViewedPatchNoteIds(
      userId,
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
