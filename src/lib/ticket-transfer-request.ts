export type TransferRequestPayload = {
  /** Agent who should receive the ticket when they accept. */
  recipientAgentId: string | null;
  recipientAgentName?: string | null;
  /** @deprecated Legacy admin-reviewer portal id (queue transfer). */
  recipientPortalAccountId: string | null;
  /** @deprecated Legacy SuperAdmin reviewer flag. */
  recipientSuperAdmin: boolean;
  targetTeamId?: string | null;
  targetTeamName?: string | null;
  reason?: string;
};

export function serializeTransferRequest(payload: TransferRequestPayload): string {
  return JSON.stringify({
    v: 2,
    ...payload,
  });
}

export function parseTransferRequestDetail(detail: string | null | undefined): TransferRequestPayload | null {
  if (!detail?.trim()) return null;
  try {
    const o = JSON.parse(detail) as Record<string, unknown>;
    if (o && typeof o === "object" && (o.v === 1 || o.v === 2)) {
      return {
        recipientAgentId: typeof o.recipientAgentId === "string" ? o.recipientAgentId : null,
        recipientAgentName: typeof o.recipientAgentName === "string" ? o.recipientAgentName : null,
        recipientPortalAccountId:
          typeof o.recipientPortalAccountId === "string" ? o.recipientPortalAccountId : null,
        recipientSuperAdmin: o.recipientSuperAdmin === true,
        targetTeamId: typeof o.targetTeamId === "string" ? o.targetTeamId : null,
        targetTeamName: typeof o.targetTeamName === "string" ? o.targetTeamName : null,
        reason: typeof o.reason === "string" ? o.reason : undefined,
      };
    }
  } catch {
    /* legacy plain-text detail */
  }
  return {
    recipientAgentId: null,
    recipientAgentName: null,
    recipientPortalAccountId: null,
    recipientSuperAdmin: false,
    targetTeamId: null,
    targetTeamName: null,
    reason: detail.trim(),
  };
}

/** Whether this viewer may accept/reject the pending transfer. */
export function canViewerApproveTransfer(opts: {
  sessionRole: string;
  reviewerPortalAccountId: string | null;
  sessionAgentId?: string | null;
  parsed: TransferRequestPayload | null;
}): boolean {
  const { sessionRole, reviewerPortalAccountId, sessionAgentId, parsed } = opts;
  if (sessionRole === "SuperAdmin") return true;
  if (!parsed) return sessionRole === "SuperAdmin" || sessionRole === "Admin";

  // Peer transfer: the named agent accepts and takes the assignment.
  if (parsed.recipientAgentId) {
    return Boolean(sessionAgentId && sessionAgentId === parsed.recipientAgentId);
  }

  // Legacy: company Admin / SuperAdmin reviews a queue move.
  if (parsed.recipientSuperAdmin) return sessionRole === "SuperAdmin";
  if (parsed.recipientPortalAccountId && reviewerPortalAccountId) {
    return parsed.recipientPortalAccountId === reviewerPortalAccountId;
  }
  return sessionRole === "SuperAdmin" || sessionRole === "Admin";
}
