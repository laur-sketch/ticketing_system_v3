import { COMPANY_ROSTER, type CompanyRosterName } from "@/lib/company-roster";

/**
 * Map HRIS / CSV / legacy labels onto canonical Company Board roster names.
 */
const HRIS_COMPANY_ALIASES: Record<string, CompanyRosterName> = {
  mchisi: "MCONPINCO",
  "m.conpinco": "MCONPINCO",
  "m conpinco": "MCONPINCO",
  eazzygas: "EAZYGAZ",
  easygas: "EAZYGAZ",
  eazygas: "EAZYGAZ",
  "aci/apmc": "ACI",
};

export function resolveRosterCompanyName(
  companyName: string | null | undefined,
): CompanyRosterName | null {
  const raw = (companyName ?? "").trim();
  if (!raw) return null;

  const exact = (COMPANY_ROSTER as readonly string[]).find(
    (n) => n.toLowerCase() === raw.toLowerCase(),
  );
  if (exact) return exact as CompanyRosterName;

  const alias = HRIS_COMPANY_ALIASES[raw.toLowerCase().replace(/\s+/g, " ")];
  return alias ?? null;
}
