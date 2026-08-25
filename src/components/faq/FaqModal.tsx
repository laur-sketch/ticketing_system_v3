"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FaqItemsView } from "@/components/faq/FaqItemsView";
import { emptyFaqCatalog, parseFaqCatalog, type FaqItem } from "@/lib/faq";

export function FaqModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [items, setItems] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetch("/api/faq", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not load FAQ.");
        return parseFaqCatalog(data);
      })
      .then((catalog) => {
        if (!cancelled) setItems(catalog.items);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setItems(emptyFaqCatalog().items);
          setError(err instanceof Error ? err.message : "Could not load FAQ.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[min(90dvh,44rem)] w-[calc(100vw-1.5rem)] max-w-2xl overflow-y-auto border-zinc-200 bg-white p-5 sm:p-6 dark:border-zinc-700 dark:bg-[#111]"
        aria-describedby="faq-dialog-description"
      >
        <DialogHeader>
          <DialogTitle className="text-left text-lg text-zinc-900 dark:text-zinc-50">
            FAQ
          </DialogTitle>
          <DialogDescription id="faq-dialog-description" className="text-left text-sm text-zinc-600 dark:text-zinc-400">
            Guides, presentations, and videos for using this system. Open a file or watch a video
            below.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="py-8 text-center text-sm text-zinc-500">Loading FAQ…</p>
        ) : error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-100">
            {error}
          </p>
        ) : (
          <FaqItemsView items={items} />
        )}
      </DialogContent>
    </Dialog>
  );
}
