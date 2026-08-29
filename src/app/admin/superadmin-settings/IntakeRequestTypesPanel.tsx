"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { REQUEST_TYPES, type RequestTypeId } from "@/lib/request-types";

export function IntakeRequestTypesPanel() {
  const [hiddenTypeIds, setHiddenTypeIds] = useState<RequestTypeId[]>([]);
  const [savedHiddenTypeIds, setSavedHiddenTypeIds] = useState<RequestTypeId[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hiddenSet = useMemo(() => new Set(hiddenTypeIds), [hiddenTypeIds]);
  const dirty =
    JSON.stringify([...hiddenTypeIds].sort()) !== JSON.stringify([...savedHiddenTypeIds].sort());
  const visibleCount = REQUEST_TYPES.length - hiddenTypeIds.length;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/intake-request-types", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        hiddenTypeIds?: RequestTypeId[];
      };
      if (!res.ok) {
        setError(data.error ?? "Could not load intake request types.");
        return;
      }
      const hidden = Array.isArray(data.hiddenTypeIds) ? data.hiddenTypeIds : [];
      setHiddenTypeIds(hidden);
      setSavedHiddenTypeIds(hidden);
    } catch {
      setError("Could not load intake request types.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleVisible(typeId: RequestTypeId, visible: boolean) {
    setHiddenTypeIds((prev) => {
      const next = new Set(prev);
      if (visible) next.delete(typeId);
      else next.add(typeId);
      return [...next];
    });
    setMessage(null);
  }

  async function save() {
    if (visibleCount < 1) {
      setError("At least one request type must stay visible on create request.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/intake-request-types", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hiddenTypeIds }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        hiddenTypeIds?: RequestTypeId[];
      };
      if (!res.ok) {
        setError(data.error ?? "Could not save intake request types.");
        return;
      }
      const hidden = Array.isArray(data.hiddenTypeIds) ? data.hiddenTypeIds : hiddenTypeIds;
      setHiddenTypeIds(hidden);
      setSavedHiddenTypeIds(hidden);
      setMessage("Create request visibility saved.");
    } catch {
      setError("Could not save intake request types.");
    } finally {
      setBusy(false);
    }
  }

  async function resetDefaults() {
    if (
      !window.confirm(
        "Show all request types on create request again? This clears every hide rule.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/intake-request-types", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        hiddenTypeIds?: RequestTypeId[];
      };
      if (!res.ok) {
        setError(data.error ?? "Could not reset intake request types.");
        return;
      }
      setHiddenTypeIds([]);
      setSavedHiddenTypeIds([]);
      setMessage("All request types are visible on create request.");
    } catch {
      setError("Could not reset intake request types.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-zinc-200/80 bg-white/95 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" />
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Create request types
              </h2>
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              Choose which request types appear when someone opens Create request. Hidden types are
              removed from the type picker and blocked on submit. At least one type must remain
              visible.
            </p>
            <p className="mt-2 text-[11px] text-zinc-500">
              {visibleCount} of {REQUEST_TYPES.length} visible · {hiddenTypeIds.length} hidden
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-xl px-4"
              disabled={busy || loading}
              onClick={() => void resetDefaults()}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Show all
            </Button>
            <Button
              type="button"
              className="h-10 rounded-xl px-4"
              disabled={busy || loading || !dirty || visibleCount < 1}
              onClick={() => void save()}
            >
              <Save className="mr-2 h-4 w-4" />
              Save changes
            </Button>
          </div>
        </div>

        {message ? (
          <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-100">
            {error}
          </p>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/95 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {loading ? (
          <p className="px-5 py-10 text-center text-sm text-zinc-500">Loading request types…</p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {REQUEST_TYPES.map((type) => {
              const visible = !hiddenSet.has(type.id);
              return (
                <li
                  key={type.id}
                  className={cn(
                    "flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between",
                    !visible && "bg-zinc-50/80 dark:bg-zinc-950/40",
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {type.label}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                      {type.description}
                    </p>
                  </div>
                  <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    <input
                      type="checkbox"
                      checked={visible}
                      disabled={busy || (visible && visibleCount <= 1)}
                      onChange={(e) => toggleVisible(type.id, e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500/30 disabled:cursor-not-allowed"
                    />
                    Show on create request
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
