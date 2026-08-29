/** Public route that serves a team/company logo by team id (client-safe). */
export function companyLogoApiPath(teamId: string): string {
  return `/api/company-logos/${encodeURIComponent(teamId)}`;
}
