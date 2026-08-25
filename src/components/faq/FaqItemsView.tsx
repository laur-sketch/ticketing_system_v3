"use client";

import { Download, ExternalLink, FileText, PlayCircle } from "lucide-react";
import {
  googleSlidesEmbedSrc,
  isDirectVideoUrl,
  presentationFileHref,
  vimeoEmbedSrc,
  youtubeEmbedSrc,
  type FaqItem,
} from "@/lib/faq";
import { cn } from "@/lib/cn";

function videoEmbedSrc(url: string): string | null {
  return youtubeEmbedSrc(url) ?? vimeoEmbedSrc(url);
}

function presentationEmbedSrc(item: FaqItem): string | null {
  if (item.file?.mimeType === "application/pdf") {
    return presentationFileHref(item);
  }
  if (item.url) return googleSlidesEmbedSrc(item.url);
  return null;
}

export function FaqItemsView({
  items,
  className,
}: {
  items: FaqItem[];
  className?: string;
}) {
  const presentations = items.filter((item) => item.kind === "presentation");
  const videos = items.filter((item) => item.kind === "video");

  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950/50 dark:text-zinc-400">
        No FAQ materials have been published yet.
      </p>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      {presentations.length > 0 ? (
        <section className="space-y-3" aria-labelledby="faq-presentations-heading">
          <h3
            id="faq-presentations-heading"
            className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500"
          >
            Presentations
          </h3>
          <ul className="space-y-3">
            {presentations.map((item) => (
              <FaqPresentationCard key={item.id} item={item} />
            ))}
          </ul>
        </section>
      ) : null}

      {videos.length > 0 ? (
        <section className="space-y-3" aria-labelledby="faq-videos-heading">
          <h3
            id="faq-videos-heading"
            className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500"
          >
            Videos
          </h3>
          <ul className="space-y-3">
            {videos.map((item) => (
              <FaqVideoCard key={item.id} item={item} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function FaqPresentationCard({ item }: { item: FaqItem }) {
  const fileHref = presentationFileHref(item);
  const downloadHref = fileHref ? `${fileHref}?download=1` : null;
  const embedSrc = presentationEmbedSrc(item);
  const openHref = fileHref ?? (item.url || null);

  return (
    <li className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-950/60">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-orange-500/10 text-orange-700 dark:text-orange-300">
          <FileText className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{item.title}</p>
          {item.description ? (
            <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {item.description}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {openHref ? (
              <a
                href={openHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-900"
              >
                <ExternalLink className="size-3.5" aria-hidden />
                View
              </a>
            ) : null}
            {downloadHref ? (
              <a
                href={downloadHref}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-900"
              >
                <Download className="size-3.5" aria-hidden />
                Download
              </a>
            ) : null}
          </div>
          {embedSrc ? (
            <div className="mt-3 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
              <iframe
                title={item.title}
                src={embedSrc}
                className="aspect-video w-full bg-zinc-100 dark:bg-zinc-900"
                loading="lazy"
                allowFullScreen
              />
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function FaqVideoCard({ item }: { item: FaqItem }) {
  const embedSrc = videoEmbedSrc(item.url);
  const direct = isDirectVideoUrl(item.url);

  return (
    <li className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-950/60">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-orange-500/10 text-orange-700 dark:text-orange-300">
          <PlayCircle className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{item.title}</p>
          {item.description ? (
            <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {item.description}
            </p>
          ) : null}
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              <ExternalLink className="size-3.5" aria-hidden />
              Open video
            </a>
          ) : null}
          {embedSrc ? (
            <div className="mt-3 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
              <iframe
                title={item.title}
                src={embedSrc}
                className="aspect-video w-full bg-black"
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          ) : direct ? (
            <video
              className="mt-3 w-full rounded-lg border border-zinc-200 dark:border-zinc-700"
              controls
              preload="metadata"
              src={item.url}
            >
              Your browser cannot play this video.{" "}
              <a href={item.url} target="_blank" rel="noopener noreferrer">
                Open it in a new tab
              </a>
              .
            </video>
          ) : null}
        </div>
      </div>
    </li>
  );
}
