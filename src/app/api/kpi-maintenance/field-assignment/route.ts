import { KpiFrequency } from "@prisma/client/primary";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import { applyPillarOnlyTaskCreate, setTaskCount, wrapForPersist, markFieldAssignmentTask } from "@/lib/kpi-subkpis";
import { resolveOpsPermissions } from "@/lib/ops-permissions";
import { prisma } from "@/lib/prisma";
import { resolveAgentDesignatedCompanyId } from "@/lib/staff-company-scope";
import {
  agentIdsFromApprovalLevels,
  isValidLatLng,
  isValidTravelOrderVehicle,
  normalizeApprovalLevelsForStore,
  normalizeTravelerAgentIds,
  parseApprovedByAgentIds,
} from "@/lib/travel-order";
import {
  createTravelOrderWithLocations,
  findTravelOrderById,
  serializeTravelOrder,
  updateTravelOrderLocationAttachments,
} from "@/lib/travel-order-db";
import { persistTravelOrderImage } from "@/lib/travel-order-uploads";

async function assertAgentsInCompany(
  agentIds: string[],
  companyTeamId: string,
): Promise<string | null> {
  for (const id of agentIds) {
    const companyId = await resolveAgentDesignatedCompanyId(id);
    if (companyId !== companyTeamId) {
      return "Level 1 approver and confirmer must belong to the same company as the requester.";
    }
  }
  return null;
}

/**
 * POST /api/kpi-maintenance/field-assignment
 * Creates a one-off Task Management card + linked Travel Order (Field Assignment).
 * Available to all Admin/Personnel; auto-assigns the card to the creator.
 */
export async function POST(req: Request) {
  const { session, unauthorized } = await requireRole(["Admin", "Personnel"]);
  if (unauthorized || !session) return unauthorized;
  const perms = await resolveOpsPermissions(session);

  const creatorAgentId = perms.operator?.id ?? null;
  if (!creatorAgentId) {
    return NextResponse.json(
      { error: "Your account is not linked to a personnel record. Cannot create a travel order." },
      { status: 400 },
    );
  }

  const creatorCompanyId = await resolveAgentDesignatedCompanyId(creatorAgentId);
  if (!creatorCompanyId) {
    return NextResponse.json(
      { error: "Your account has no company assignment. Ask an admin to set your company first." },
      { status: 400 },
    );
  }

  const form = await req.formData();
  const title = String(form.get("title") ?? "").trim() || "Travel Orders";
  const mainTask = String(form.get("mainTask") ?? "").trim();
  const orderRequest = String(form.get("orderRequest") ?? "").trim();
  const approvedByAgentId = String(form.get("approvedByAgentId") ?? "").trim();
  const approvedByAgentIdsRaw = String(form.get("approvedByAgentIds") ?? "").trim();
  let approvedByAgentIds: string[] = [];
  if (approvedByAgentIdsRaw) {
    try {
      const parsed = JSON.parse(approvedByAgentIdsRaw) as unknown;
      if (Array.isArray(parsed)) {
        approvedByAgentIds = parsed
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.trim())
          .filter(Boolean);
      }
    } catch {
      return NextResponse.json({ error: "Invalid approvedByAgentIds." }, { status: 400 });
    }
  }
  if (approvedByAgentIds.length === 0 && approvedByAgentId) {
    approvedByAgentIds = [approvedByAgentId];
  }

  let approvalLevelsRaw: unknown = [];
  const approvalLevelsJson = String(form.get("approvalLevels") ?? "").trim();
  if (approvalLevelsJson) {
    try {
      approvalLevelsRaw = JSON.parse(approvalLevelsJson) as unknown;
    } catch {
      return NextResponse.json({ error: "Invalid approvalLevels." }, { status: 400 });
    }
  }
  const approvalLevels = normalizeApprovalLevelsForStore(
    Array.isArray(approvalLevelsRaw) ? approvalLevelsRaw : [],
  );
  if (approvalLevels.length > 0) {
    for (const lvl of approvalLevels) {
      if (!lvl.agentId) {
        return NextResponse.json(
          { error: `Assign an approver for Level ${lvl.level}.` },
          { status: 400 },
        );
      }
    }
    approvedByAgentIds = agentIdsFromApprovalLevels(approvalLevels);
  }

  const confirmationByAgentId = String(form.get("confirmationByAgentId") ?? "").trim();
  const vehicleRaw = String(form.get("vehicle") ?? "").trim();
  const scopedCompanyTeamIdRaw = String(form.get("scopedCompanyTeamId") ?? "").trim();
  // Always scope to the creator's company (ignore cross-company overrides).
  const scopedCompanyTeamId = creatorCompanyId;
  if (scopedCompanyTeamIdRaw && scopedCompanyTeamIdRaw !== creatorCompanyId && !perms.canAssignWork) {
    // Non-assigners cannot pick another company.
  }

  let additionalTravelerIds: string[] = [];
  const travelersRaw = String(form.get("additionalTravelerAgentIds") ?? form.get("travelerAgentIds") ?? "").trim();
  if (travelersRaw) {
    try {
      additionalTravelerIds = parseApprovedByAgentIds(JSON.parse(travelersRaw) as unknown);
    } catch {
      return NextResponse.json({ error: "Invalid travelerAgentIds." }, { status: 400 });
    }
  }
  const travelerAgentIds = normalizeTravelerAgentIds({
    createdByAgentId: creatorAgentId,
    additionalTravelerAgentIds: additionalTravelerIds,
  });

  let locations: Array<{
    label?: string;
    latitude?: number;
    longitude?: number;
    remarks?: string | null;
  }> = [];
  try {
    locations = JSON.parse(String(form.get("locationsJson") ?? "[]")) as typeof locations;
  } catch {
    return NextResponse.json({ error: "Invalid locationsJson." }, { status: 400 });
  }

  if (!mainTask) {
    return NextResponse.json({ error: "Enter a Field Assignment / travel order name." }, { status: 400 });
  }
  if (!orderRequest) {
    return NextResponse.json({ error: "Order request details are required." }, { status: 400 });
  }
  if (approvedByAgentIds.length === 0) {
    return NextResponse.json({ error: "Select at least one person who will approve this travel order." }, { status: 400 });
  }
  if (!confirmationByAgentId) {
    return NextResponse.json({ error: "Select who will confirm this travel order." }, { status: 400 });
  }
  if (!vehicleRaw || !isValidTravelOrderVehicle(vehicleRaw)) {
    return NextResponse.json({ error: "Select a valid vehicle for this travel order." }, { status: 400 });
  }

  // Travelers may be from any company; only L1 approver + confirmer stay company-locked.
  const companyCheckIds = [
    confirmationByAgentId,
    ...(approvalLevels.length > 0
      ? approvalLevels.filter((l) => l.level === 1).map((l) => l.agentId).filter(Boolean)
      : approvedByAgentIds),
  ] as string[];
  const companyCheck = await assertAgentsInCompany(
    [...new Set(companyCheckIds)],
    scopedCompanyTeamId,
  );
  if (companyCheck) {
    return NextResponse.json({ error: companyCheck }, { status: 400 });
  }

  const approvers = await prisma.agent.findMany({
    where: { id: { in: approvedByAgentIds } },
    select: { id: true },
  });
  if (approvers.length !== approvedByAgentIds.length) {
    return NextResponse.json({ error: "One or more approved-by users were not found." }, { status: 400 });
  }
  const confirmer = await prisma.agent.findUnique({
    where: { id: confirmationByAgentId },
    select: { id: true },
  });
  if (!confirmer) {
    return NextResponse.json({ error: "Confirmation person was not found." }, { status: 400 });
  }
  const travelers = await prisma.agent.findMany({
    where: { id: { in: travelerAgentIds } },
    select: { id: true },
  });
  if (travelers.length !== travelerAgentIds.length) {
    return NextResponse.json({ error: "One or more travelers were not found." }, { status: 400 });
  }
  if (!Array.isArray(locations) || locations.length === 0) {
    return NextResponse.json({ error: "Add at least one location." }, { status: 400 });
  }

  const pendingFilesByIndex = new Map<number, File[]>();
  for (const [key, value] of form.entries()) {
    const match = /^location_(\d+)_image$/.exec(key);
    if (!match || !(value instanceof File) || value.size <= 0) continue;
    const idx = Number(match[1]);
    const list = pendingFilesByIndex.get(idx) ?? [];
    list.push(value);
    pendingFilesByIndex.set(idx, list);
  }

  const normalizedLocations = [];
  for (let i = 0; i < locations.length; i++) {
    const loc = locations[i] ?? {};
    const label = String(loc.label ?? "").trim();
    if (!label) {
      return NextResponse.json({ error: `Location ${i + 1}: name/address is required.` }, { status: 400 });
    }
    const latRaw = loc.latitude;
    const lngRaw = loc.longitude;
    const latitude =
      latRaw == null || (typeof latRaw === "string" && String(latRaw).trim() === "")
        ? null
        : Number(latRaw);
    const longitude =
      lngRaw == null || (typeof lngRaw === "string" && String(lngRaw).trim() === "")
        ? null
        : Number(lngRaw);
    if (
      (latitude != null || longitude != null) &&
      !isValidLatLng(latitude, longitude)
    ) {
      return NextResponse.json(
        { error: `Location ${i + 1}: GPS coordinates are invalid.` },
        { status: 400 },
      );
    }
    normalizedLocations.push({
      label,
      latitude,
      longitude,
      remarks: typeof loc.remarks === "string" && loc.remarks.trim() ? loc.remarks.trim() : null,
      sortOrder: i,
    });
  }

  // Unique mainTask under title — append short suffix on conflict for personal creates.
  let finalMainTask = mainTask;
  const existing = await prisma.kpiMaintenance.findFirst({
    where: { title, mainTask: finalMainTask },
    select: { id: true },
  });
  if (existing) {
    finalMainTask = `${mainTask} (${new Date().toISOString().slice(0, 16).replace("T", " ")})`;
  }

  const createdBy =
    typeof session.user?.email === "string" && session.user.email.trim()
      ? session.user.email.trim()
      : "admin";
  const createdByRole = perms.isAdminRole ? "Admin" : "Personnel";

  let subKpis = wrapForPersist({ segmented: false, flat: [] });
  subKpis = applyPillarOnlyTaskCreate(subKpis, {
    checkbox: false,
    screenshots: false,
    screenshotUpload: false,
    numerical: true,
  }, { numericalTarget: 100 });
  subKpis = setTaskCount(subKpis, 0);
  subKpis = markFieldAssignmentTask(subKpis);

  const kpi = await prisma.kpiMaintenance.create({
    data: {
      title,
      mainTask: finalMainTask,
      isRecurring: false,
      frequency: KpiFrequency.MONTHLY,
      subKpis,
      enableSubtaskAssignees: false,
      scopedCompanyTeamId,
      assignedAgentId: creatorAgentId,
      createdBy,
      createdByRole,
    },
  });

  let travelOrder;
  try {
    travelOrder = await createTravelOrderWithLocations({
      kpiMaintenanceId: kpi.id,
      orderRequest,
      approvedByAgentIds,
      approvalLevels,
      confirmationByAgentId,
      createdBy,
      createdByAgentId: creatorAgentId,
      companyTeamId: scopedCompanyTeamId,
      travelerAgentIds,
      vehicle: vehicleRaw,
      status: "SUBMITTED",
      locations: normalizedLocations,
    });
  } catch (err) {
    await prisma.kpiMaintenance.delete({ where: { id: kpi.id } }).catch(() => undefined);
    const message = err instanceof Error ? err.message : "Could not create the travel order.";
    console.error("[field-assignment] travel order create failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const locs = [...travelOrder.locations].sort((a, b) => a.sortOrder - b.sortOrder);
  for (let i = 0; i < locs.length; i++) {
    const files = pendingFilesByIndex.get(i) ?? [];
    if (files.length === 0) continue;
    const loc = locs[i]!;
    const uploaded = [];
    for (const file of files.slice(0, 5)) {
      const saved = await persistTravelOrderImage(kpi.id, travelOrder.id, file);
      if ("error" in saved) {
        return NextResponse.json({ error: saved.error }, { status: 400 });
      }
      uploaded.push(saved);
    }
    await updateTravelOrderLocationAttachments(loc.id, [
      ...loc.attachments,
      ...uploaded,
    ]);
  }

  const fresh =
    pendingFilesByIndex.size > 0
      ? await findTravelOrderById(travelOrder.id)
      : travelOrder;

  return NextResponse.json(
    {
      kpi: { ...kpi, isFieldAssignment: true },
      travelOrder: fresh ? serializeTravelOrder(fresh) : null,
    },
    { status: 201 },
  );
}
