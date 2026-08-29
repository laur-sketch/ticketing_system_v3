"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, FolderKanban, List, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  WORKFORCE_VIEW_IDS,
  WORKFORCE_VIEW_LABELS,
  type WorkforceViewId,
} from "@/lib/workforce-view-visibility";

const VIEW_ICONS: Record<WorkforceViewId, typeof List> = {
  list: List,
  activity: Activity,
  sections: FolderKanban,
};

const VIEW_BLURBS: Record<WorkforceViewId, string> = {
  list: "Personnel registry (roles, companies, accounts).",
  activity: "Live On Duty / Offline cards from today’s HRIS clock-ins.",
  sections: "Organizational chart and department sectioning.",
};

export function WorkforceViewsPanel() {
  const [hiddenViews, setHiddenViews] = useState<WorkforceViewId[]>([]);
  const [savedHiddenViews, setSavedHiddenViews] = useState<WorkforceViewId[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hiddenSet = useMemo(() => new Set(hiddenViews), [hiddenViews]);
  const dirty =
    JSON.stringify([...hiddenViews].sort()) !== JSON.stringify([...savedHiddenViews].sort());
  const visibleCount = WORKFORCE_VIEW_IDS.length - hiddenViews.length;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/workforce-view-visibility", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        hiddenViews?: WorkforceViewId[];
      };
      if (!res.ok) {
        setError(data.error ?? "Could not load Workforce toggle visibility.");
        return;
      }
      const hidden = Array.isArray(data.hiddenViews) ? data.hiddenViews : [];
      setHiddenViews(hidden);
      setSavedHiddenViews(hidden);
    } catch {
      setError("Could not load Workforce toggle visibility.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleVisible(viewId: WorkforceViewId, visible: boolean) {
    setHiddenViews((prev) => {
      const next = new Set(prev);
      if (visible) next.delete(viewId);
      else next.add(viewId);
      return WORKFORCE_VIEW_IDS.filter((id) => next.has(id));
    });
    setMessage(null);
  }

  async function save() {
    if (visibleCount < 1) {
      setError("At least one Workforce toggle must stay visible.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/workforce-view-visibility", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hiddenViews }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        hiddenViews?: WorkforceViewId[];
      };
      if (!res.ok) {
        setError(data.error ?? "Could not save Workforce toggle visibility.");
        return;
      }
      const hidden = Array.isArray(data.hiddenViews) ? data.hiddenViews : hiddenViews;
      setHiddenViews(hidden);
      setSavedHiddenViews(hidden);
      setMessage("Workforce toggle visibility saved.");
    } catch {
      setError("Could not save Workforce toggle visibility.");
    } finally {
      setBusy(false);
    }
  }

  async function resetDefaults() {
    if (
      !window.confirm(
        "Show ListView, Activity, and Org. Chart on Workforce again? This clears every hide rule.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/workforce-view-visibility", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hiddenViews: [] }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        hiddenViews?: WorkforceViewId[];
      };
      if (!res.ok) {
        setError(data.error ?? "Could not reset Workforce toggle visibility.");
        return;
      }
      setHiddenViews([]);
      setSavedHiddenViews([]);
      setMessage("All Workforce toggles are visible.");
    } catch {
      setError("Could not reset Workforce toggle visibility.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-300">
            SuperAdmin
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Workforce toggles
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Hide or show ListView, Activity, and Org. Chart on Workforce for everyone who can open
            that page. At least one toggle must stay visible.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || loading || (!dirty && hiddenViews.length === 0)}
            onClick={() => void resetDefaults()}
            className="gap-1.5"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            Show all
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy || loading || !dirty || visibleCount < 1}
            onClick={() => void save()}
            className="gap-1.5"
          >
            <Save className="size-3.5" aria-hidden />
            Save
          </Button>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-800 dark:text-rose-200">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-200">
          {message}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-6 text-sm text-zinc-500">Loading…</p>
      ) : (
        <ul className="mt-5 space-y-2">
          {WORKFORCE_VIEW_IDS.map((id) => {
            const Icon = VIEW_ICONS[id];
            const visible = !hiddenSet.has(id);
            return (
              <li
                key={id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-800"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={cn(
                      "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border",
                      visible
                        ? "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300"
                        : "border-zinc-200 bg-zinc-50 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-600",
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "text-sm font-semibold",
                        visible
                          ? "text-zinc-900 dark:text-zinc-100"
                          : "text-zinc-400 line-through dark:text-zinc-600",
                      )}
                    >
                      {WORKFORCE_VIEW_LABELS[id]}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{VIEW_BLURBS[id]}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy || (visible && visibleCount <= 1)}
                    onClick={() => toggleVisible(id, false)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                      !visible
                        ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900"
                        : "border border-zinc-200 text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900",
                    )}
                  >
                    Hide
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => toggleVisible(id, true)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                      visible
                        ? "bg-orange-600 text-white"
                        : "border border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900",
                    )}
                  >
                    Show
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
