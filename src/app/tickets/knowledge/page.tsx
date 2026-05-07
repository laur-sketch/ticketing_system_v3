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
    <main className="min-h-[calc(100vh-56px)] bg-[#070d19] px-4 py-8 text-zinc-100">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center gap-3 rounded-2xl border border-zinc-800 bg-[#0b1220] p-6 shadow-[0_16px_45px_rgba(0,0,0,0.35)]">
          <span className="flex size-11 items-center justify-center rounded-xl bg-orange-500/20 text-orange-300">
            <BookOpen className="size-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Knowledge base</h1>
            <p className="text-sm text-zinc-300">Browse articles and how-tos organized by topic.</p>
          </div>
        </div>

        <article className="rounded-2xl border border-zinc-800 bg-[#0b1220] p-6 shadow-[0_16px_45px_rgba(0,0,0,0.35)]">
          <p className="text-sm leading-relaxed text-zinc-300">
            Help content is being expanded. For urgent issues, open a request from the dashboard or use{" "}
            <Link href="/tickets/new" className="font-semibold text-orange-300 underline">
              Create Request
            </Link>
            .
          </p>
        </article>

        <section
          id="settings"
          className="mt-10 scroll-mt-24 rounded-2xl border border-zinc-800 bg-[#0b1220] p-6 shadow-[0_16px_45px_rgba(0,0,0,0.35)]"
        >
          <h2 className="text-lg font-bold text-zinc-100">Portal settings</h2>
          <p className="mt-2 text-sm text-zinc-300">
            Notification and profile preferences will appear here in a future release.
          </p>
        </section>
      </div>
    </main>
  );
}
