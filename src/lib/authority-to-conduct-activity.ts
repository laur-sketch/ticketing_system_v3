/** Shared helpers for Authority to Conduct Activity (ACA) intake. */

import {
  type AcaAuthorityResolution,
  type AcaApprovingPath,
  type AcaRecommendingLevel,
} from "@/lib/aca-authority-matrix";
import { resolveRosterCompanyName } from "@/lib/hris-company-aliases";

export type AcaRequestFields = {
  departmentStore: string;
  category: string;
  natureOfRequest: string;
  estimatedCost: string;
  budgetAmount: string;
  description: string;
  objective: string;
  dateSubmitted: string;
  implementationDate: string;
  submittedByName: string;
  /** Optional free-text status note at intake. */
  statusNote?: string;
  relatedTicketIds?: string;
};

/** Company / roster name → form-code company prefix (`{PREFIX}-FO-ACA-01`). */
export const ACA_COMPANY_FORM_PREFIXES: Record<string, string> = {
  AGC: "AGC",
  ALI: "ALI",
  "AMALGATED LENDING": "ALI",
  "AMALGATED LENDING INC.": "ALI",
  ACI: "ACI",
  "AMALGATED CAP": "ACI",
  "AMALGATED CAP (ACI) INC.": "ACI",
  APMC: "APMC",
  "AMALGATED PROPERTIES": "APMC",
  AGOC: "AGOC",
  AWIC: "AWIC",
  "AMALGATED WORLD IMPORT": "AWIC",
  MCHISI: "MCHISI",
  "MCHISI LPG": "MCHISI",
  "MCHISI FAMES": "MCHISI FAMES",
  MCHSI: "MCHSI",
  "M.CONPINCO": "MCHSI",
  "M.CONPINCO HOME IMPROVEMENT SUPERCENTER, INC.": "MCHSI",
  EAZYGAZ: "EAZYGAZ",
  EAZZYGAS: "EAZZY",
  EAZZY: "EAZZY",
  "EAZZY GAS": "EAZZY",
  "EAZZY GAS OPC": "EAZZY",
  MCCI: "MCCI",
  "M. CONPINCO CYCLEHOUSE": "MCCI",
  "M. CONPINCO CYCLEHOUSE INC.": "MCCI",
  INDUSTRIES: "INDUSTRIES",
};

/** @deprecated Prefer {@link ACA_COMPANY_FORM_PREFIXES}; kept for callers expecting full codes. */
export const ACA_COMPANY_FORM_CODES: Record<string, string> = Object.fromEntries(
  Object.entries(ACA_COMPANY_FORM_PREFIXES).map(([key, prefix]) => [key, `${prefix}-FO-ACA-01`]),
);

function sanitizeAcaFormPrefix(raw: string): string {
  const upper = raw.trim().toUpperCase();
  const paren = upper.match(/\(([A-Z0-9]{2,12})\)/);
  if (paren?.[1]) return paren[1];
  const compact = upper.replace(/[^A-Z0-9]+/g, "");
  if (compact.length >= 2 && compact.length <= 12) return compact;
  const firstToken = upper.split(/[\s,/]+/).find((t) => /[A-Z0-9]/.test(t)) ?? "";
  const token = firstToken.replace(/[^A-Z0-9]+/g, "");
  return token || "ACA";
}

/** Resolves `{Requestor's company}-FO-ACA-01` from a company / roster name. */
export function resolveAcaFormCompanyPrefix(companyName: string | null | undefined): string {
  const raw = (companyName ?? "").trim();
  if (!raw) return "ACA";
  // Normalize HRIS / CSV aliases onto Company Board roster names first.
  const canonical = resolveRosterCompanyName(raw) ?? raw;
  const upper = canonical.toUpperCase();
  for (const [key, prefix] of Object.entries(ACA_COMPANY_FORM_PREFIXES)) {
    if (upper === key.toUpperCase() || upper.includes(key.toUpperCase())) return prefix;
  }
  return sanitizeAcaFormPrefix(canonical);
}

export function resolveAcaFormCode(companyName: string | null | undefined): string {
  return `${resolveAcaFormCompanyPrefix(companyName)}-FO-ACA-01`;
}

export function formatAcaPeso(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  const n = Number(v.replace(/[₱,\s]/g, ""));
  if (!Number.isFinite(n)) return v;
  return `₱${n.toFixed(2)}`;
}

export function normalizeAcaAmountInput(raw: string): string {
  const v = raw.replace(/[₱,\s]/g, "").trim();
  if (!v) return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return n.toFixed(2);
}

export function parseAcaAmountNumber(raw: string | null | undefined): number | null {
  const n = Number((raw ?? "").replace(/[₱,\s]/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

export function formatAcaRequestTitle(
  fields: Pick<AcaRequestFields, "natureOfRequest" | "estimatedCost" | "departmentStore">,
): string {
  const nature = fields.natureOfRequest.trim() || "Authority to Conduct Activity";
  const dept = fields.departmentStore.trim();
  const amount = formatAcaPeso(fields.estimatedCost) || fields.estimatedCost.trim();
  const parts = [nature];
  if (dept) parts.push(dept);
  if (amount) parts.push(amount);
  return parts.join(" · ").slice(0, 200);
}

export function formatAcaRequestDescription(fields: AcaRequestFields): string {
  const lines = [
    ...(fields.departmentStore.trim()
      ? [`Department/Store: ${fields.departmentStore.trim()}`]
      : []),
    `Category: ${fields.category.trim()}`,
    `Nature of Request: ${fields.natureOfRequest.trim()}`,
    `Estimated Cost: ${formatAcaPeso(fields.estimatedCost) || fields.estimatedCost.trim()}`,
    `Budget Amount: ${formatAcaPeso(fields.budgetAmount) || fields.budgetAmount.trim()}`,
    `Date Submitted: ${fields.dateSubmitted.trim()}`,
    `Implementation Date: ${fields.implementationDate.trim()}`,
    `Submitted By: ${fields.submittedByName.trim()}`,
    "",
    "Description:",
    fields.description.trim(),
    "",
    "Objective:",
    fields.objective.trim(),
  ];
  const status = (fields.statusNote ?? "").trim();
  if (status) {
    lines.push("", `Status: ${status}`);
  }
  const related = (fields.relatedTicketIds ?? "").trim();
  if (related) {
    lines.push("", `Related documents: ${related}`);
  }
  return lines.join("\n");
}

export function parseAcaRequestDescription(description: string | null | undefined): {
  departmentStore: string;
  category: string;
  natureOfRequest: string;
  estimatedCost: string;
  budgetAmount: string;
  dateSubmitted: string;
  implementationDate: string;
  submittedByName: string;
  description: string;
  objective: string;
  statusNote: string;
  relatedTicketIds: string;
} | null {
  const raw = (description ?? "").trim();
  if (!raw) return null;
  // Require ACA-shaped markers so plain Issue/Concern descriptions are not treated as ACA.
  const looksLikeAca =
    /^Department\/Store:/im.test(raw) ||
    /^Nature of Request:/im.test(raw) ||
    /^Estimated Cost:/im.test(raw) ||
    /^Implementation Date:/im.test(raw) ||
    /^Submitted By:/im.test(raw);
  if (!looksLikeAca) return null;
  const get = (label: string) => {
    const re = new RegExp(`^${label}:\\s*(.*)$`, "im");
    const m = raw.match(re);
    return m?.[1]?.trim() ?? "";
  };
  const blockAfter = (label: string, untilLabels: string[]) => {
    const start = raw.search(new RegExp(`^${label}:\\s*$`, "im"));
    if (start < 0) {
      const inline = get(label);
      return inline;
    }
    const after = raw.slice(start).split(/\r?\n/).slice(1);
    const lines: string[] = [];
    for (const line of after) {
      if (untilLabels.some((u) => new RegExp(`^${u}:`, "i").test(line))) break;
      lines.push(line);
    }
    return lines.join("\n").trim();
  };

  const parsed = {
    departmentStore: get("Department/Store"),
    category: get("Category"),
    natureOfRequest: get("Nature of Request"),
    estimatedCost: get("Estimated Cost").replace(/^₱/, ""),
    budgetAmount: get("Budget Amount").replace(/^₱/, ""),
    dateSubmitted: get("Date Submitted"),
    implementationDate: get("Implementation Date"),
    submittedByName: get("Submitted By"),
    description: blockAfter("Description", ["Objective", "Status", "Related documents"]),
    objective: blockAfter("Objective", ["Status", "Related documents"]),
    statusNote: get("Status"),
    relatedTicketIds: get("Related documents"),
  };
  // Require at least one ACA marker so other request types are not misclassified.
  if (
    !parsed.departmentStore &&
    !parsed.category &&
    !parsed.natureOfRequest &&
    !parsed.estimatedCost &&
    !parsed.budgetAmount &&
    !parsed.dateSubmitted &&
    !parsed.implementationDate &&
    !parsed.submittedByName &&
    !parsed.description &&
    !parsed.objective
  ) {
    return null;
  }
  return parsed;
}

export type AcaCreateAssigneeDraft = {
  recommendedByAgentId: string;
  financeManagerAgentId: string;
  /** Ordered approving seat agent ids (AP or ExeCom rows). */
  approvingAgentIds: string[];
};

export type AcaCreatePayload = AcaRequestFields & {
  recommendingLevel: AcaRecommendingLevel;
  approvingPath: AcaApprovingPath;
  matrixSnapshot: AcaAuthorityResolution;
  assignees: AcaCreateAssigneeDraft;
};
