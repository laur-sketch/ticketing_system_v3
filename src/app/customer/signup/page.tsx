import { redirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CustomerSignUpRedirectPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const dest = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "kind" || key === "type") continue;
    if (typeof value === "string") dest.set(key, value);
    else if (Array.isArray(value) && value[0]) dest.set(key, value[0]);
  }
  const qs = dest.toString();
  redirect(qs ? `/signup?${qs}` : "/signup");
}
