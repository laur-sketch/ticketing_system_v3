import { redirect } from "next/navigation";

export default async function LegacyEmailVerificationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; action?: string }>;
}) {
  const { token, action } = await searchParams;
  const parts: string[] = [];
  if (token) parts.push(`token=${encodeURIComponent(token)}`);
  if (action) parts.push(`action=${encodeURIComponent(action)}`);
  const query = parts.length ? `?${parts.join("&")}` : "";
  redirect(`/customer/verification/email${query}`);
}
