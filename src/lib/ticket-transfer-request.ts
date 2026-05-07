export type TransferRequestPayload = {
  recipientPortalAccountId: string | null;
  recipientSuperAdmin: boolean;
  reason?: string;
};

export function serializeTransferRequest(payload: TransferRequestPayload): string {
  return JSON.stringify({
    v: 1,
    ...payload,
  });
}

export function parseTransferRequestDetail(detail: string | null | undefined): TransferRequestPayload | null {
  if (!detail?.trim()) return null;
  try {
    const o = JSON.parse(detail) as Record<string, unknown>;
    if (o && typeof o === "object" && o.v === 1) {
      return {
        recipientPortalAccountId:
          typeof o.recipientPortalAccountId === "string" ? o.recipientPortalAccountId : null,
        recipientSuperAdmin: o.recipientSuperAdmin === true,
        reason: typeof o.reason === "string" ? o.reason : undefined,
      };
    }
  } catch {
    /* legacy plain-text detail */
  }
  return {
    recipientPortalAccountId: null,
    recipientSuperAdmin: false,
    reason: detail.trim(),
  };
}

/** Whether this viewer may approve the pending transfer described by the parsed payload. */
export function canViewerApproveTransfer(opts: {
  sessionRole: string;
  reviewerPortalAccountId: string | null;
  parsed: TransferRequestPayload | null;
}): boolean {
  const { sessionRole, reviewerPortalAccountId, parsed } = opts;
  if (sessionRole === "SuperAdmin") return true;
  if (!parsed) return sessionRole === "SuperAdmin" || sessionRole === "Admin";
  if (parsed.recipientSuperAdmin) return sessionRole === "SuperAdmin";
  if (parsed.recipientPortalAccountId && reviewerPortalAccountId) {
    return parsed.recipientPortalAccountId === reviewerPortalAccountId;
  }
  return sessionRole === "SuperAdmin" || sessionRole === "Admin";
}
