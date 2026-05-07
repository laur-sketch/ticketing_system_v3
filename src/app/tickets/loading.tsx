export default function TicketsSegmentLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-3 py-8 sm:px-4 sm:py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-3 w-28 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-8 w-48 max-w-full animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-4 w-full max-w-md animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        </div>
        <div className="h-8 w-24 shrink-0 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
      </div>
      <div className="grid gap-5 sm:gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="h-40 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800/80" />
          <div className="h-52 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800/80" />
        </div>
        <div className="h-72 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800/80" />
      </div>
    </div>
  );
}
