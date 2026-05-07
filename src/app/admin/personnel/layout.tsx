import Link from "next/link";

export default function PersonnelLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="border-b border-zinc-200 bg-zinc-100 dark:border-zinc-800/90 dark:bg-[#0d1018]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-xs text-zinc-600 dark:text-zinc-400">
          <span className="font-semibold uppercase tracking-[0.14em] text-zinc-700 dark:text-zinc-500">Admin · Personnel</span>
          <Link
            href="/admin/account"
            className="rounded-md border border-zinc-300 px-3 py-1 text-zinc-700 transition hover:border-zinc-400 hover:bg-white hover:text-zinc-900 dark:border-zinc-700/80 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:bg-transparent dark:hover:text-white"
          >
            My account
          </Link>
        </div>
      </div>
      {children}
    </>
  );
}
