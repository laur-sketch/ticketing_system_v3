/** Shared helpers for Request for Payment intake. */

export const MODE_OF_PAYMENT_OPTIONS = [
  "Check",
  "For Manager's Check Issuance",
  "Online direct to Payee's Bank Account #",
  "Payroll",
] as const;

export const DELIVERY_OF_CHECK_OPTIONS = [
  "Pickup",
  "Encashment",
  "Online Deposit",
] as const;

export const MODE_OF_PAYMENT_CHECK = "Check";
export const DELIVERY_OF_CHECK_ONLINE_DEPOSIT = "Online Deposit";

export type PaymentRequestFields = {
  payee: string;
  inPaymentOf: string;
  accountTitle: string;
  amount: string;
  modeOfPayment: string;
  deliveryOfCheck?: string;
  bankNameAccountNumber?: string;
  notes?: string;
};

/** Display amount with peso sign and two decimal places (e.g. ₱10000.00). */
export function formatPaymentPeso(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  const n = Number(v.replace(/[₱,\s]/g, ""));
  if (!Number.isFinite(n)) return v;
  return `₱${n.toFixed(2)}`;
}

/** Normalize typed amount to two decimal places (no currency symbol). */
export function normalizePaymentAmountInput(raw: string): string {
  const v = raw.replace(/[₱,\s]/g, "").trim();
  if (!v) return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return n.toFixed(2);
}

export function formatPaymentRequestTitle(
  fields: Pick<PaymentRequestFields, "payee" | "inPaymentOf" | "amount">,
): string {
  const of = fields.inPaymentOf.trim();
  const payee = fields.payee.trim();
  const amount = formatPaymentPeso(fields.amount) || fields.amount.trim();
  const base = of || payee || "Request for payment";
  const withAmount = amount ? `${base} · ${amount}` : base;
  return withAmount.slice(0, 200);
}

export function formatPaymentRequestDescription(fields: PaymentRequestFields): string {
  const amountDisplay = formatPaymentPeso(fields.amount) || fields.amount.trim();
  const lines = [
    `Payee: ${fields.payee.trim()}`,
    `In payment of: ${fields.inPaymentOf.trim()}`,
    `Account title: ${fields.accountTitle.trim()}`,
    `Amount: ${amountDisplay}`,
    `Mode of payment: ${fields.modeOfPayment.trim()}`,
  ];
  const delivery = (fields.deliveryOfCheck ?? "").trim();
  if (delivery) {
    lines.push(`Delivery of check: ${delivery}`);
  }
  const bank = (fields.bankNameAccountNumber ?? "").trim();
  if (bank) {
    lines.push(`Bank name / account number: ${bank}`);
  }
  const notes = (fields.notes ?? "").trim();
  if (notes) {
    lines.push("", "Additional notes:", notes);
  }
  return lines.join("\n");
}

/** Pull Account title from a formatted payment description (for board card previews). */
export function extractPaymentAccountTitle(description: string | null | undefined): string | null {
  const raw = (description ?? "").trim();
  if (!raw) return null;
  const match = /^Account title:\s*(.+)$/im.exec(raw);
  const value = match?.[1]?.trim();
  return value || null;
}

function fieldFromDescription(description: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^${escaped}:\\s*(.+)$`, "im").exec(description);
  const value = match?.[1]?.trim();
  return value || null;
}

/** Parse structured payment fields from a stored description (or return null if not a payment body). */
export function parsePaymentRequestDescription(
  description: string | null | undefined,
): PaymentRequestFields | null {
  const raw = (description ?? "").trim();
  if (!raw) return null;
  const payee = fieldFromDescription(raw, "Payee");
  const inPaymentOf = fieldFromDescription(raw, "In payment of");
  const accountTitle = fieldFromDescription(raw, "Account title");
  const amount = fieldFromDescription(raw, "Amount");
  const modeOfPayment = fieldFromDescription(raw, "Mode of payment");
  if (!payee && !inPaymentOf && !accountTitle && !amount && !modeOfPayment) {
    return null;
  }
  const notesMatch = /(?:^|\n)Additional notes:\s*\n([\s\S]*)$/i.exec(raw);
  return {
    payee: payee ?? "",
    inPaymentOf: inPaymentOf ?? "",
    accountTitle: accountTitle ?? "",
    amount: amount ?? "",
    modeOfPayment: modeOfPayment ?? "",
    deliveryOfCheck: fieldFromDescription(raw, "Delivery of check") ?? undefined,
    bankNameAccountNumber: fieldFromDescription(raw, "Bank name / account number") ?? undefined,
    notes: notesMatch?.[1]?.trim() || undefined,
  };
}
