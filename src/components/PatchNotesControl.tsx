"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Megaphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PatchNoteContentSections, PatchNoteSection } from "@/lib/patch-notes-seed";
import { resolvePatchNoteSections } from "@/lib/patch-notes-content";

export type PatchNotePayload = {
  id: string;
  version: string;
  title: string;
  content?: PatchNoteContentSections | unknown;
  sections?: PatchNoteSection[];
  releasedAt: string;
  viewed?: boolean;
};

type Props = {
  /** When true, show the button next to Process Controls. */
  visible?: boolean;
};

/** Survives login/logout on this browser until a newer patch id appears. */
const DISMISSED_LATEST_STORAGE_KEY = "agctek:patchNotes:dismissedLatestId";

function readDismissedLatestId(): string | null {
  try {
    return window.localStorage.getItem(DISMISSED_LATEST_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeDismissedLatestId(patchNoteId: string) {
  try {
    window.localStorage.setItem(DISMISSED_LATEST_STORAGE_KEY, patchNoteId);
  } catch {
    // Ignore quota / private-mode failures; server mark-read is the source of truth.
  }
}

function formatReleaseDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function PatchNotesControl({ visible = true }: Props) {
  const [open, setOpen] = useState(false);
  const [patches, setPatches] = useState<PatchNotePayload[]>([]);
  const [latestId, setLatestId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkedAutoShow, setCheckedAutoShow] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const load = useCallback(async (opts?: { autoOpen?: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/patch-notes", { cache: "no-store" });
      if (!res.ok) {
        setError("Could not load patch notes.");
        return null;
      }
      const data = (await res.json()) as {
        patches?: PatchNotePayload[];
        latest?: PatchNotePayload | null;
        autoShow?: boolean;
        hasViewedLatest?: boolean;
      };
      const next = Array.isArray(data.patches) ? data.patches : [];
      const resolvedLatestId = data.latest?.id ?? next[0]?.id ?? null;
      setPatches(next);
      setLatestId(resolvedLatestId);

      if (opts?.autoOpen && next.length > 0 && resolvedLatestId) {
        const dismissedLocally = readDismissedLatestId() === resolvedLatestId;
        // Server unread wins unless this browser already dismissed this exact latest release.
        const shouldAutoOpen = data.autoShow === true && !dismissedLocally;
        if (shouldAutoOpen) {
          setOpen(true);
        } else if (data.hasViewedLatest || dismissedLocally) {
          // Keep local dismiss in sync when server already knows it's read.
          writeDismissedLatestId(resolvedLatestId);
        }
      }
      return data;
    } catch {
      setError("Could not load patch notes.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible || checkedAutoShow) return;
    setCheckedAutoShow(true);
    void load({ autoOpen: true });
  }, [visible, checkedAutoShow, load]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function openManual() {
    setOpen(true);
    await load();
  }

  async function markAllAsRead() {
    setMarking(true);
    setError(null);
    try {
      const res = await fetch("/api/patch-notes/mark-read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        latestId?: string | null;
      };
      if (!res.ok) {
        setError(body.error ?? "Could not mark as read.");
        return;
      }
      const dismissId = body.latestId ?? latestId ?? patches[0]?.id ?? null;
      if (dismissId) {
        writeDismissedLatestId(dismissId);
      }
      setPatches((prev) => prev.map((p) => ({ ...p, viewed: true })));
      setOpen(false);
    } catch {
      setError("Could not mark as read.");
    } finally {
      setMarking(false);
    }
  }

  if (!visible) return null;

  const hasUnread = patches.some((p) => !p.viewed);

  const modal =
    open && mounted
      ? createPortal(
          <div
            className="fixed inset-0 z-[300] flex items-center justify-center overflow-y-auto overscroll-contain bg-black/55 p-4 backdrop-blur-sm sm:p-6"
            onClick={() => setOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="patch-notes-title"
          >
            <div
              className="my-auto flex w-full max-w-xl max-h-[min(42rem,calc(100dvh-2rem))] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-950"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                    Changelog
                  </p>
                  <h2
                    id="patch-notes-title"
                    className="mt-0.5 text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
                  >
                    Patch Notes &amp; Update History
                  </h2>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    Newest updates first. Open anytime from the header.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                {loading && patches.length === 0 ? (
                  <p className="text-sm text-zinc-500">Loading…</p>
                ) : patches.length === 0 ? (
                  <p className="text-sm text-zinc-500">No patch notes yet.</p>
                ) : (
                  <div className="space-y-5">
                    {patches.map((note) => {
                      const sections = resolvePatchNoteSections(note);
                      return (
                        <article
                          key={note.id}
                          className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-4 py-3.5 dark:border-zinc-800 dark:bg-zinc-900/60"
                        >
                          <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-zinc-200/80 pb-2.5 dark:border-zinc-800">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                v{note.version}
                                {note.title ? (
                                  <span className="font-medium text-zinc-600 dark:text-zinc-400">
                                    {" "}
                                    · {note.title}
                                  </span>
                                ) : null}
                              </p>
                              <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                                Released {formatReleaseDate(note.releasedAt)}
                              </p>
                            </div>
                            {note.viewed === false ? (
                              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-800 dark:bg-orange-950/60 dark:text-orange-200">
                                New
                              </span>
                            ) : null}
                          </header>

                          {sections.length === 0 ? (
                            <p className="mt-3 text-sm text-zinc-500">No details for this release.</p>
                          ) : (
                            <div className="mt-3 space-y-4">
                              {sections.map((section) => (
                                <section key={`${note.id}-${section.key}`}>
                                  <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-orange-700 dark:text-orange-300">
                                    {section.label}
                                  </h3>
                                  <ul className="mt-2 space-y-2.5">
                                    {section.items.map((item, index) => (
                                      <li
                                        key={`${note.id}-${section.key}-${item.title}-${index}`}
                                        className="flex items-start gap-2.5"
                                      >
                                        <span
                                          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500"
                                          aria-hidden
                                        />
                                        <div className="min-w-0">
                                          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                            {item.title}
                                          </p>
                                          {item.description ? (
                                            <p className="mt-0.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                                              {item.description}
                                            </p>
                                          ) : null}
                                        </div>
                                      </li>
                                    ))}
                                  </ul>
                                </section>
                              ))}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
                {error ? (
                  <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setOpen(false)}
                  disabled={marking}
                >
                  Close
                </Button>
                <Button
                  type="button"
                  className="rounded-xl bg-orange-600 text-white hover:bg-orange-500"
                  onClick={() => void markAllAsRead()}
                  disabled={marking || patches.length === 0 || !hasUnread}
                >
                  {marking ? "Saving…" : "Mark All as Read"}
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={() => void openManual()}
        className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-2.5 text-xs font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-100 sm:h-9 sm:px-3 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        aria-label="Open patch notes"
        title="Patch Notes"
      >
        <Megaphone size={15} className="shrink-0" aria-hidden />
        <span className="hidden sm:inline">Patch Notes</span>
      </button>
      {modal}
    </>
  );
}
