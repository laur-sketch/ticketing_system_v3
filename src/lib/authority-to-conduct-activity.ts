/** Shared helpers for Authority to Conduct Activity (ACA) intake. */

import {
  type AcaAuthorityResolution,
  type AcaApprovingPath,
  type AcaRecommendingLevel,
} from "@/lib/aca-authority-matrix";

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

/** Company team name → official ACA form code prefix. */
export const ACA_COMPANY_FORM_CODES: Record<string, string> = {
  ACI: "ACI-FO-ACA-01",
  "AMALGATED CAP": "ACI-FO-ACA-01",
  "AMALGATED CAP (ACI) INC.": "ACI-FO-ACA-01",
  ALI: "ALI-FO-ACA-01",
  "AMALGATED LENDING": "ALI-FO-ACA-01",
  "AMALGATED LENDING INC.": "ALI-FO-ACA-01",
  MCHSI: "MCHSI-FO-ACA-01",
  "M.CONPINCO": "MCHSI-FO-ACA-01",
  "M.CONPINCO HOME IMPROVEMENT SUPERCENTER, INC.": "MCHSI-FO-ACA-01",
  APMC: "APMC-FO-ACA-01",
  "AMALGATED PROPERTIES": "APMC-FO-ACA-01",
  AWIC: "AWIC-FO-ACA-01",
  "AMALGATED WORLD IMPORT": "AWIC-FO-ACA-01",
  EAZZY: "EAZZY-FO-ACA-01",
  "EAZZY GAS": "EAZZY-FO-ACA-01",
  "EAZZY GAS OPC": "EAZZY-FO-ACA-01",
  MCCI: "MCCI-FO-ACA-01",
  "M. CONPINCO CYCLEHOUSE": "MCCI-FO-ACA-01",
  "M. CONPINCO CYCLEHOUSE INC.": "MCCI-FO-ACA-01",
};

export function resolveAcaFormCode(companyName: string | null | undefined): string {
  const raw = (companyName ?? "").trim();
  if (!raw) return "ACA-FO-ACA-01";
  const upper = raw.toUpperCase();
  for (const [key, code] of Object.entries(ACA_COMPANY_FORM_CODES)) {
    if (upper === key.toUpperCase() || upper.includes(key.toUpperCase())) return code;
  }
  return "ACA-FO-ACA-01";
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
    `Department/Store: ${fields.departmentStore.trim()}`,
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
