export default function AgentSegmentLoading() {
  return (
    <div className="space-y-6 px-3 py-6 sm:px-4 sm:py-8">
      <div className="h-8 w-56 max-w-full animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-36 animate-pulse rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/60" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/60" />
    </div>
  );
}
