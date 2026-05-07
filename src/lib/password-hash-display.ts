/** Fixed-length mask for admin roster; never exposes hash characters. */
const HASH_MASK = "************";

/** Display-only label: asterisks when a hash exists, em dash when unset. */
export function passwordHashLabel(hash: string | null | undefined): string {
  const h = (hash ?? "").trim();
  if (!h) return "—";
  return HASH_MASK;
}
