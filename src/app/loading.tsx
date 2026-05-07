export default function RootLoading() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-4 py-16 sm:min-h-[50vh]">
      <div
        className="h-10 w-10 animate-spin rounded-full border-2 border-orange-500/25 border-t-orange-500 dark:border-orange-400/20 dark:border-t-orange-400"
        aria-hidden
      />
      <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">Loading…</p>
    </div>
  );
}
