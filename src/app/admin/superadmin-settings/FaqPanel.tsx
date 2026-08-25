"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CircleHelp, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FaqItemsView } from "@/components/faq/FaqItemsView";
import {
  FAQ_PRESENTATION_ACCEPT,
  MAX_FAQ_DESCRIPTION,
  MAX_FAQ_TITLE,
  emptyFaqCatalog,
  parseFaqCatalog,
  type FaqItem,
  type FaqItemKind,
} from "@/lib/faq";

type Draft = {
  kind: FaqItemKind;
  title: string;
  description: string;
  url: string;
  file: File | null;
  clearFile: boolean;
};

const emptyDraft = (): Draft => ({
  kind: "presentation",
  title: "",
  description: "",
  url: "",
  file: null,
  clearFile: false,
});

export function FaqPanel() {
  const [items, setItems] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/faq", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not load FAQ.");
        return;
      }
      setItems(parseFaqCatalog(data).items);
    } catch {
      setError("Could not load FAQ.");
      setItems(emptyFaqCatalog().items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function startEdit(item: FaqItem) {
    setEditingId(item.id);
    setDraft({
      kind: item.kind,
      title: item.title,
      description: item.description,
      url: item.url,
      file: null,
      clearFile: false,
    });
    setError(null);
    setMessage(null);
  }

  function resetForm() {
    setEditingId(null);
    setDraft(emptyDraft());
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const form = new FormData();
      form.set("kind", draft.kind);
      form.set("title", draft.title);
      form.set("description", draft.description);
      form.set("url", draft.url);
      if (draft.file) form.set("file", draft.file);
      if (draft.clearFile) form.set("clearFile", "1");

      const res = await fetch(editingId ? `/api/admin/faq/${encodeURIComponent(editingId)}` : "/api/admin/faq", {
        method: editingId ? "PUT" : "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not save FAQ item.");
        return;
      }
      setItems(parseFaqCatalog(data.catalog).items);
      resetForm();
      setMessage(editingId ? "FAQ item updated." : "FAQ item added.");
    } catch {
      setError("Could not save FAQ item.");
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(item: FaqItem) {
    if (!window.confirm(`Remove “${item.title}”?`)) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/faq/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not remove FAQ item.");
        return;
      }
      setItems(parseFaqCatalog(data.catalog).items);
      if (editingId === item.id) resetForm();
      setMessage("FAQ item removed.");
    } catch {
      setError("Could not remove FAQ item.");
    } finally {
      setBusy(false);
    }
  }

  const editing = items.find((item) => item.id === editingId) ?? null;

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-zinc-200/80 bg-white/95 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start gap-2">
          <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" />
          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Sign-in FAQ
            </h2>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              These presentations and videos appear when someone opens FAQ on the sign-in page. No
              login is required to view them. Upload a PDF or PowerPoint, or paste a Google Slides,
              YouTube, Vimeo, or direct video link.
            </p>
          </div>
        </div>

        {message ? (
          <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-100">
            {error}
          </p>
        ) : null}

        <form onSubmit={(e) => void submit(e)} className="mt-5 space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-700 dark:bg-zinc-950/40">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
              {editing ? "Edit item" : "Add item"}
            </p>
            {editing ? (
              <button
                type="button"
                disabled={busy}
                onClick={resetForm}
                className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                <X className="size-3.5" aria-hidden />
                Cancel edit
              </button>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
              Type
              <select
                value={draft.kind}
                disabled={busy}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    kind: e.target.value === "video" ? "video" : "presentation",
                    file: e.target.value === "video" ? null : prev.file,
                  }))
                }
                className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm font-normal normal-case tracking-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                <option value="presentation">Presentation</option>
                <option value="video">Video</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
              Title
              <input
                required
                maxLength={MAX_FAQ_TITLE}
                value={draft.title}
                disabled={busy}
                onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
                className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm font-normal normal-case tracking-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                placeholder={draft.kind === "video" ? "How to submit a request" : "New-hire walkthrough"}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
            Description <span className="font-normal normal-case tracking-normal text-zinc-400">(optional)</span>
            <textarea
              maxLength={MAX_FAQ_DESCRIPTION}
              rows={2}
              value={draft.description}
              disabled={busy}
              onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
              className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              placeholder="Short note shown under the title"
            />
          </label>

          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
            {draft.kind === "video" ? "Video URL" : "Link"}{" "}
            <span className="font-normal normal-case tracking-normal text-zinc-400">
              {draft.kind === "video"
                ? "(YouTube, Vimeo, or a direct video URL)"
                : "(optional if you upload a file — Google Slides, PDF, etc.)"}
            </span>
            <input
              type="url"
              value={draft.url}
              disabled={busy}
              required={draft.kind === "video"}
              onChange={(e) => setDraft((prev) => ({ ...prev, url: e.target.value }))}
              className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm font-normal normal-case tracking-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              placeholder={
                draft.kind === "video"
                  ? "https://www.youtube.com/watch?v=…"
                  : "https://docs.google.com/presentation/d/…"
              }
            />
          </label>

          {draft.kind === "presentation" ? (
            <div className="space-y-2">
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                Upload file <span className="font-normal normal-case tracking-normal text-zinc-400">(PDF, PPT, PPTX, ODP · max 25MB)</span>
                <input
                  type="file"
                  accept={FAQ_PRESENTATION_ACCEPT}
                  disabled={busy}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      file: e.target.files?.[0] ?? null,
                      clearFile: false,
                    }))
                  }
                  className="text-sm font-normal normal-case tracking-normal file:mr-3 file:rounded-lg file:border file:border-zinc-300 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-semibold"
                />
              </label>
              {editing?.file && !draft.file && !draft.clearFile ? (
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  Current file: {editing.file.originalName}{" "}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setDraft((prev) => ({ ...prev, clearFile: true, file: null }))}
                    className="font-semibold text-rose-700 hover:underline dark:text-rose-300"
                  >
                    Remove file
                  </button>
                </p>
              ) : null}
              {draft.clearFile ? (
                <p className="text-xs text-zinc-500">Existing file will be removed on save.</p>
              ) : null}
            </div>
          ) : null}

          <div className="flex justify-end">
            <Button type="submit" disabled={busy} className="h-10 rounded-xl px-4">
              {editing ? (
                <>
                  <Pencil className="mr-2 h-4 w-4" />
                  Save changes
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Add to FAQ
                </>
              )}
            </Button>
          </div>
        </form>
      </div>

      <div className="rounded-2xl border border-zinc-200/80 bg-white/95 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Published items</h3>
        {loading ? (
          <p className="mt-4 text-sm text-zinc-500">Loading…</p>
        ) : items.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">Nothing published yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 px-3 py-2.5 dark:border-zinc-700"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {item.title}
                  </p>
                  <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                    {item.kind}
                    {item.file ? " · file" : ""}
                    {item.url ? " · link" : ""}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => startEdit(item)}
                    className="h-8 rounded-lg"
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={busy}
                    onClick={() => void removeItem(item)}
                    className="h-8 rounded-lg"
                  >
                    <Trash2 className="mr-1 size-3.5" aria-hidden />
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {items.length > 0 ? (
          <div className="mt-6">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">
              Sign-in preview
            </p>
            <FaqItemsView items={items} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
