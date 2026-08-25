"use client";

import { splitHighlight } from "@/lib/global-search";

export function SearchHighlight({
  text,
  query,
  className,
}: {
  text: string;
  query: string;
  className?: string;
}) {
  const parts = splitHighlight(text, query);
  return (
    <span className={className}>
      {parts.map((part, index) =>
        part.match ? (
          <mark
            key={`${index}-${part.text}`}
            className="rounded-sm bg-orange-200/80 px-0.5 text-inherit dark:bg-orange-500/30"
          >
            {part.text}
          </mark>
        ) : (
          <span key={`${index}-${part.text}`}>{part.text}</span>
        ),
      )}
    </span>
  );
}
