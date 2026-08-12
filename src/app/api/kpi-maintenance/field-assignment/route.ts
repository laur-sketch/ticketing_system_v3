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
  parseOptionalDateTimeInput,
  validateTravelOrderGatePass,
  emptyGatePassDraft,
  type TravelOrderGatePassDraft,
} from "@/lib/travel-order";
import {
  createTravelOrderWithLocations,
  findTravelOrderById,
  serializeTravelOrder,
  updateTravelOrderAttachments,
  updateTravelOrderLocationAttachments,
} from "@/lib/travel-order-db";
import {
  MAX_TRAVEL_ORDER_ATTACHMENTS,
  persistTravelOrderAttachment,
  persistTravelOrderImage,
  removeTravelOrderUploadDir,
} from "@/lib/travel-order-uploads";

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
  const mainTask = String(form.get("mainTask") ?? "").trim();
  const title =
    (mainTask.replace(/\s+/g, " ").toUpperCase() || String(form.get("title") ?? "").trim()) ||
    "FIELD ASSIGNMENT";
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
  const driverPresent = String(form.get("driverPresent") ?? "").trim() === "1" ||
    String(form.get("driverPresent") ?? "").trim().toLowerCase() === "true";
  const driverAgentId = String(form.get("driverAgentId") ?? "").trim();
  const driverLicenseNo = String(form.get("driverLicenseNo") ?? "").trim();
  const scopedCompanyTeamIdRaw = String(form.get("scopedCompanyTeamId") ?? "").trim();
  // Order ownership stays on the creator's company; approvers are never company-locked.
  const scopedCompanyTeamId = creatorCompanyId;
  void scopedCompanyTeamIdRaw;

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
    exemptRequesterFromTravelers:
      String(form.get("exemptRequesterFromTravelers") ?? "").trim() === "1" ||
      String(form.get("exemptRequesterFromTravelers") ?? "").trim().toLowerCase() ===
        "true",
  });
  if (travelerAgentIds.length === 0) {
    return NextResponse.json(
      { error: "Add at least one traveler, or leave the requestor on the travelers list." },
      { status: 400 },
    );
  }

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

  if (!orderRequest) {
    return NextResponse.json({ error: "Purpose of travel is required." }, { status: 400 });
  }
  const resolvedMainTask = mainTask || orderRequest.slice(0, 160);
  if (approvedByAgentIds.length === 0) {
    return NextResponse.json({ error: "Select at least one person who will approve this travel order." }, { status: 400 });
  }
  if (!confirmationByAgentId) {
    return NextResponse.json({ error: "Select who will confirm this travel order." }, { status: 400 });
  }
  if (!vehicleRaw || !isValidTravelOrderVehicle(vehicleRaw)) {
    return NextResponse.json({ error: "Select a valid vehicle for this travel order." }, { status: 400 });
  }
  if (driverPresent) {
    if (!driverAgentId) {
      return NextResponse.json({ error: "Select a driver from the travelers list." }, { status: 400 });
    }
    if (!travelerAgentIds.includes(driverAgentId)) {
      return NextResponse.json(
        { error: "Driver must be one of the selected travelers." },
        { status: 400 },
      );
    }
  }

  let gatePassDraft: TravelOrderGatePassDraft = emptyGatePassDraft();
  const gatePassRaw = String(form.get("gatePassJson") ?? "").trim();
  if (gatePassRaw) {
    try {
      const parsed = JSON.parse(gatePassRaw) as Partial<TravelOrderGatePassDraft> & {
        included?: boolean;
      };
      gatePassDraft = {
        included: parsed.included === true,
        estDepartureAt:
          typeof parsed.estDepartureAt === "string" ? parsed.estDepartureAt : "",
        estArrivalAt: typeof parsed.estArrivalAt === "string" ? parsed.estArrivalAt : "",
        actualDepartureStartedAt:
          typeof parsed.actualDepartureStartedAt === "string"
            ? parsed.actualDepartureStartedAt
            : null,
        actualDepartureStartedLatitude:
          typeof parsed.actualDepartureStartedLatitude === "number"
            ? parsed.actualDepartureStartedLatitude
            : null,
        actualDepartureStartedLongitude:
          typeof parsed.actualDepartureStartedLongitude === "number"
            ? parsed.actualDepartureStartedLongitude
            : null,
        actualDepartureEndedAt:
          typeof parsed.actualDepartureEndedAt === "string"
            ? parsed.actualDepartureEndedAt
            : null,
        actualDepartureEndedLatitude:
          typeof parsed.actualDepartureEndedLatitude === "number"
            ? parsed.actualDepartureEndedLatitude
            : null,
        actualDepartureEndedLongitude:
          typeof parsed.actualDepartureEndedLongitude === "number"
            ? parsed.actualDepartureEndedLongitude
            : null,
        startGuardOnDuty:
          typeof parsed.startGuardOnDuty === "string" ? parsed.startGuardOnDuty : "",
        endGuardOnDuty: typeof parsed.endGuardOnDuty === "string" ? parsed.endGuardOnDuty : "",
      };
    } catch {
      return NextResponse.json({ error: "Invalid gatePassJson." }, { status: 400 });
    }
  }
  const gatePassError = validateTravelOrderGatePass(gatePassDraft);
  if (gatePassError) {
    return NextResponse.json({ error: gatePassError }, { status: 400 });
  }

  // Approvers, confirmer, and travelers may be from any company.
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
  const pendingOrderAttachments: File[] = [];
  for (const [key, value] of form.entries()) {
    if (!(value instanceof File) || value.size <= 0) continue;
    if (key === "attachment" || key === "attachments") {
      pendingOrderAttachments.push(value);
      continue;
    }
    const match = /^location_(\d+)_image$/.exec(key);
    if (!match) continue;
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
  let finalMainTask = resolvedMainTask;
  const existing = await prisma.kpiMaintenance.findFirst({
    where: { title, mainTask: finalMainTask },
    select: { id: true },
  });
  if (existing) {
    finalMainTask = `${resolvedMainTask} (${new Date().toISOString().slice(0, 16).replace("T", " ")})`;
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
      driverPresent,
      driverAgentId: driverPresent ? driverAgentId : null,
      driverLicenseNo: driverPresent ? driverLicenseNo : null,
      gatePass: gatePassDraft.included
        ? {
            included: true,
            estDepartureAt: parseOptionalDateTimeInput(gatePassDraft.estDepartureAt),
            estArrivalAt: parseOptionalDateTimeInput(gatePassDraft.estArrivalAt),
            actualDepartureStartedAt: parseOptionalDateTimeInput(
              gatePassDraft.actualDepartureStartedAt,
            ),
            actualDepartureStartedLatitude: gatePassDraft.actualDepartureStartedLatitude,
            actualDepartureStartedLongitude: gatePassDraft.actualDepartureStartedLongitude,
            gatePassStartGuardOnDuty: gatePassDraft.startGuardOnDuty.trim() || null,
            actualDepartureEndedAt: parseOptionalDateTimeInput(
              gatePassDraft.actualDepartureEndedAt,
            ),
            actualDepartureEndedLatitude: gatePassDraft.actualDepartureEndedLatitude,
            actualDepartureEndedLongitude: gatePassDraft.actualDepartureEndedLongitude,
            gatePassEndGuardOnDuty: gatePassDraft.endGuardOnDuty.trim() || null,
          }
        : { included: false },
      status: "SUBMITTED",
      locations: normalizedLocations,
    });
  } catch (err) {
    await prisma.kpiMaintenance.delete({ where: { id: kpi.id } }).catch(() => undefined);
    const message = err instanceof Error ? err.message : "Could not create the travel order.";
    console.error("[field-assignment] travel order create failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  try {
    const locs = [...travelOrder.locations].sort((a, b) => a.sortOrder - b.sortOrder);
    for (let i = 0; i < locs.length; i++) {
      const files = pendingFilesByIndex.get(i) ?? [];
      if (files.length === 0) continue;
      const loc = locs[i]!;
      const uploaded = [];
      for (const file of files.slice(0, 5)) {
        const saved = await persistTravelOrderImage(kpi.id, travelOrder.id, file);
        if ("error" in saved) {
          throw new Error(saved.error);
        }
        uploaded.push(saved);
      }
      await updateTravelOrderLocationAttachments(loc.id, [
        ...loc.attachments,
        ...uploaded,
      ]);
    }

    if (pendingOrderAttachments.length > 0) {
      if (pendingOrderAttachments.length > MAX_TRAVEL_ORDER_ATTACHMENTS) {
        throw new Error(`You can attach at most ${MAX_TRAVEL_ORDER_ATTACHMENTS} files.`);
      }
      const uploaded = [];
      for (const file of pendingOrderAttachments.slice(0, MAX_TRAVEL_ORDER_ATTACHMENTS)) {
        const saved = await persistTravelOrderAttachment(kpi.id, travelOrder.id, file);
        if ("error" in saved) {
          throw new Error(saved.error);
        }
        uploaded.push(saved);
      }
      await updateTravelOrderAttachments(travelOrder.id, [
        ...(travelOrder.attachments ?? []),
        ...uploaded,
      ]);
    }
  } catch (err) {
    // Uploads happen after KPI + travel order commits — roll both back on failure.
    await prisma.travelOrder.delete({ where: { id: travelOrder.id } }).catch(() => undefined);
    await prisma.kpiMaintenance.delete({ where: { id: kpi.id } }).catch(() => undefined);
    await removeTravelOrderUploadDir(kpi.id, travelOrder.id).catch(() => undefined);
    const message = err instanceof Error ? err.message : "Could not save travel-order attachments.";
    console.error("[field-assignment] upload/attach failed; rolled back:", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const fresh =
    pendingFilesByIndex.size > 0 || pendingOrderAttachments.length > 0
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
