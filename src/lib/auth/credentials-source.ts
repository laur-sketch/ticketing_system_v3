/**
 * Credential source of truth for password login.
 *
 * - `merged` (default): authenticate against merged_users; portal_accounts are
 *   session/profile projections only (no dual passwords).
 * - `portal`: legacy mode — portal_accounts.password_hash is primary.
 */
export type CredentialsSource = "merged" | "portal";

export function getCredentialsSource(): CredentialsSource {
  const raw = process.env.PORTAL_CREDENTIALS_SOURCE?.trim().toLowerCase();
  if (raw === "portal") return "portal";
  // Explicit merged, empty, or any other value → merged SoT
  return "merged";
}

export function useMergedCredentials(): boolean {
  return getCredentialsSource() === "merged";
}
