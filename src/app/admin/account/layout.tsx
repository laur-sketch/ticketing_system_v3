import Link from "next/link";
import { safeGetServerSession } from "@/lib/server-session";

export default async function AdminAccountLayout({ children }: { children: React.ReactNode }) {
  const session = await safeGetServerSession();
  const role = session?.user?.role;
  const isCustomer = role === "Customer";

  if (!isCustomer) {
    return (
      <div className="min-h-[calc(100vh-56px)] bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <div className="mx-auto max-w-6xl px-4 py-8 md:py-12">{children}</div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-56px)] bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs">
          <span className="font-semibold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-400">
            My account
          </span>
          <Link
            href="/"
            className="rounded-md border border-zinc-300 px-3 py-1 text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 py-8 md:py-12">{children}</div>
    </div>
  );
}
