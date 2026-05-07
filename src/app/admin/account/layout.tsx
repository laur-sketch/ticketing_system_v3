import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function AdminAccountLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  const isStaff = role === "SuperAdmin" || role === "Admin" || role === "Personnel";

  return (
    <div className="min-h-[calc(100vh-56px)] bg-zinc-50 text-zinc-900 dark:bg-[#050505] dark:text-zinc-100">
      <div className="border-b border-orange-200 bg-gradient-to-r from-orange-100 via-white to-zinc-100 dark:border-orange-900/35 dark:from-orange-950/35 dark:via-[#080808] dark:to-zinc-950">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs">
          <span className="font-semibold uppercase tracking-[0.14em] text-orange-900 dark:text-orange-200/90">
            {isStaff ? "Admin · My account" : "My account"}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {role === "Customer" ? (
              <Link
                href="/"
                className="rounded-md border border-zinc-300/80 px-3 py-1 text-zinc-800 transition hover:bg-white dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Back to dashboard
              </Link>
            ) : null}
            {isStaff ? (
              <Link
                href="/admin/personnel"
                className="rounded-md border border-orange-400/70 px-3 py-1 text-orange-900 transition hover:border-orange-500 hover:bg-orange-50 dark:border-orange-800/60 dark:text-orange-100/90 dark:hover:border-orange-500/70 dark:hover:bg-transparent dark:hover:text-white"
              >
                Personnel registry
              </Link>
            ) : null}
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 py-8 md:py-12">{children}</div>
    </div>
  );
}
