"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { EmblaCarouselType } from "embla-carousel";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { cn } from "@/lib/cn";

export type RequestBoardPane = "board" | "mine";

function shouldIgnorePaneDrag(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  if (
    target.closest(
      "[data-kanban-scroller], [data-drag-handle], a, button, input, textarea, select, label, [role='button'], [role='link'], [contenteditable='true']",
    )
  ) {
    return true;
  }
  return false;
}

type RequestBoardPanesProps = {
  initialPane: RequestBoardPane;
  myRequests: ReactNode;
  children: ReactNode;
};

export function RequestBoardPanes({
  initialPane,
  myRequests,
  children,
}: RequestBoardPanesProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [api, setApi] = useState<CarouselApi>();
  const [pane, setPane] = useState<RequestBoardPane>(initialPane);

  const syncUrl = useCallback(
    (next: RequestBoardPane) => {
      const current: RequestBoardPane = searchParams.get("pane") === "mine" ? "mine" : "board";
      if (next === current) return;
      const qs = new URLSearchParams(searchParams.toString());
      if (next === "mine") {
        qs.set("pane", "mine");
      } else {
        qs.delete("pane");
        qs.delete("submitted");
      }
      const s = qs.toString();
      const href = s ? `${pathname}?${s}` : pathname;
      router.replace(href, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    if (!api) return;

    const onSelect = (embla: EmblaCarouselType) => {
      const next: RequestBoardPane = embla.selectedScrollSnap() === 1 ? "mine" : "board";
      setPane(next);
      syncUrl(next);
    };

    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api, syncUrl]);

  useEffect(() => {
    if (!api) return;
    const want = initialPane === "mine" ? 1 : 0;
    if (api.selectedScrollSnap() !== want) {
      api.scrollTo(want, true);
    }
    setPane(initialPane);
  }, [api, initialPane]);

  const goTo = (next: RequestBoardPane) => {
    api?.scrollTo(next === "mine" ? 1 : 0);
  };

  return (
    <div className="flex min-w-0 flex-col gap-2 sm:gap-3">
      <div
        className="flex items-center justify-center gap-1 rounded-xl border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-surface"
        data-pane-switcher
        role="tablist"
        aria-label="Request board panes"
      >
        <button
          type="button"
          role="tab"
          aria-selected={pane === "board"}
          onClick={() => goTo("board")}
          className={cn(
            "flex-1 rounded-lg px-3 py-2 text-center text-xs font-semibold transition sm:text-sm",
            pane === "board"
              ? "bg-orange-600 text-white shadow-sm"
              : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100",
          )}
        >
          Requests
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pane === "mine"}
          onClick={() => goTo("mine")}
          className={cn(
            "flex-1 rounded-lg px-3 py-2 text-center text-xs font-semibold transition sm:text-sm",
            pane === "mine"
              ? "bg-orange-600 text-white shadow-sm"
              : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100",
          )}
        >
          My requests
        </button>
      </div>
      <Carousel
        setApi={setApi}
        opts={{
          align: "start",
          containScroll: "trimSnaps",
          dragFree: false,
          skipSnaps: false,
          watchDrag: (_embla, event) => !shouldIgnorePaneDrag(event.target),
        }}
        className="w-full"
      >
        <CarouselContent className="-ml-0">
          <CarouselItem className="pl-0">
            <div className="min-w-0">{children}</div>
          </CarouselItem>
          <CarouselItem className="pl-0">
            <div className="min-w-0">{myRequests}</div>
          </CarouselItem>
        </CarouselContent>
      </Carousel>
    </div>
  );
}
