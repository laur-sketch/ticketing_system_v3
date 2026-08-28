import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import {
  resolveMergedSourceUserIdForSessionEmail,
} from "@/lib/approval-position-resolver";
import { resolveIntakeApprovalRecommendations } from "@/lib/intake-approval-recommendations";
import { resolveOrgChartSectionIdsForMergedUser } from "@/lib/org-chart-section-roster";
import { parseRequestTypeId, type RequestTypeId } from "@/lib/request-types";

const SUPPORTED: RequestTypeId[] = [
  "REQUEST_FOR_PAYMENT",
  "FUND_TRANSFER_REQUEST",
  "JOB_ORDER",
  "ITEM_REQUISITION_SLIP",
  "AUTHORITY_TO_CONDUCT_ACTIVITY",
];

function isTruthyFlag(raw: string | null): boolean {
  return raw === "1" || raw === "true";
}

/**
 * GET /api/intake/approval-recommendations
 * Section/position-based suggested approvers for intake forms.
 */
export async function GET(req: Request) {
  const { session, unauthorized } = await requireRole(["Admin", "Personnel"]);
  if (unauthorized || !session) return unauthorized;

  const searchParams = new URL(req.url).searchParams;
  const requestType = parseRequestTypeId(searchParams.get("requestType"));
  if (!SUPPORTED.includes(requestType)) {
    return NextResponse.json({ error: "Unsupported request type." }, { status: 400 });
  }

  let requestorSectionId = searchParams.get("requestorSectionId")?.trim() || "";
  const sendToSectionId = searchParams.get("sendToSectionId")?.trim() || "";
  const requestingCompanyTeamId = searchParams.get("requestingCompanyTeamId")?.trim() || "";
  const skipNotedBy = isTruthyFlag(searchParams.get("skipNotedBy"));
  const skipApprovedBy = isTruthyFlag(searchParams.get("skipApprovedBy"));
  const deferBookkeeper = isTruthyFlag(searchParams.get("deferBookkeeper"));
  const acaRecommendingLevel = searchParams.get("acaRecommendingLevel")?.trim() || "";
  const acaApprovingPath = searchParams.get("acaApprovingPath")?.trim() || "";
  const acaApprovingSeatCountRaw = searchParams.get("acaApprovingSeatCount");
  const acaApprovingSeatCount = acaApprovingSeatCountRaw
    ? Number.parseInt(acaApprovingSeatCountRaw, 10)
    : NaN;

  const mergedSourceUserId = await resolveMergedSourceUserIdForSessionEmail(session.user.email);
  if (!requestorSectionId) {
    const memberSectionIds = await resolveOrgChartSectionIdsForMergedUser(mergedSourceUserId);
    requestorSectionId = memberSectionIds[0] ?? "";
  }

  const guide = await resolveIntakeApprovalRecommendations({
    requestType,
    requestorSectionId: requestorSectionId || null,
    sendToSectionId: sendToSectionId || null,
    requestorEmail: session.user.email,
    requestingCompanyTeamId: requestingCompanyTeamId || null,
    requestorMergedSourceUserId: mergedSourceUserId,
    skipNotedBy,
    skipApprovedBy,
    deferBookkeeper,
    acaRecommendingLevel: acaRecommendingLevel || null,
    acaApprovingPath: acaApprovingPath || null,
    acaApprovingSeatCount: Number.isFinite(acaApprovingSeatCount) ? acaApprovingSeatCount : null,
  });

  return NextResponse.json(guide);
}
