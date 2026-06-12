import Link from "next/link";
import { BookOpen } from "lucide-react";
import { requireSession } from "@/lib/access";
import { BRAND_TITLE } from "@/lib/brand";

export const metadata = {
  title: `Knowledge base · ${BRAND_TITLE}`,
};

export default async function KnowledgeBasePage() {
  await requireSession();

  return (
    <main className="min-h-[calc(100vh-56px)] bg-zinc-50 px-3 py-4 text-zinc-900 dark:bg-[#0e0e0d] dark:text-zinc-100 sm:px-4">
      <div className="mx-auto max-w-none">
        <div className="mb-4 flex items-center gap-3 rounded-md border border-zinc-200 bg-white p-4 shadow-[0_14px_28px_rgba(0,0,0,0.06)] dark:border-zinc-700/80 dark:bg-[#10100f] dark:shadow-[0_14px_28px_rgba(0,0,0,0.24)]">
          <span className="flex size-11 items-center justify-center rounded-lg bg-orange-500/12 text-orange-300">
            <BookOpen className="size-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-100">Knowledge base</h1>
          </div>
        </div>

        <article className="rounded-md border border-zinc-200 bg-white p-4 shadow-[0_14px_28px_rgba(0,0,0,0.06)] dark:border-zinc-700/80 dark:bg-[#10100f] dark:shadow-[0_14px_28px_rgba(0,0,0,0.24)]">
          <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            Help content is being expanded. For urgent issues, open a request from the dashboard or use{" "}
            <Link href="/tickets/new" className="font-semibold text-orange-300 underline">
              Create Request
            </Link>
            .
          </p>
        </article>

        <section
          id="settings"
          className="mt-4 scroll-mt-20 rounded-md border border-zinc-200 bg-white p-4 shadow-[0_14px_28px_rgba(0,0,0,0.06)] dark:border-zinc-700/80 dark:bg-[#10100f] dark:shadow-[0_14px_28px_rgba(0,0,0,0.24)]"
        >
          <h2 className="text-lg font-bold text-zinc-950 dark:text-zinc-100">Portal settings</h2>
          <p className="mt-2 text-sm text-zinc-300">
            Notification and profile preferences will appear here in a future release.
          </p>
        </section>
      </div>
    </main>
  );
}
