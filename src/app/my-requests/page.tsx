import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function firstQuery(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

/** Legacy route — My Requests now lives on Request Board (`/agent?pane=mine`). */
export default async function MyRequestsRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; submitted?: string | string[] }>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  qs.set("pane", "mine");
  const q = firstQuery(params.q)?.trim();
  if (q) qs.set("q", q);
  if (firstQuery(params.submitted) === "1") qs.set("submitted", "1");
  redirect(`/agent?${qs.toString()}`);
}
