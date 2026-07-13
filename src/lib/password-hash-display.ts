/** Display-only label for admin roster password column. */
export function passwordHashLabel(hash: string | null | undefined): string {
  const h = (hash ?? "").trim();
  if (!h) return "Google sign-in";
  return "************";
}
