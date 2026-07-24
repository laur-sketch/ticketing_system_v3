import { Prisma } from "@prisma/client/primary";
import { prisma } from "@/lib/prisma";
import {
  canApproveTravelOrderNow,
  getOperatorActionableApprovalLevel,
  hasHierarchicalApprovals,
  isApprovalHierarchySatisfied,
  normalizeApprovalLevelsForStore,
  parseApprovedByAgentIds,
  parseApprovalLevels,
  parseTravelerAgentIds,
  parseTravelOrderAttachments,
  TRAVEL_ORDER_STATUS,
  type TravelOrderApprovalLevelDto,
  type TravelOrderApprovalLevelStored,
  type TravelOrderAttachment,
  type TravelOrderAgentRef,
} from "@/lib/travel-order";

export type TravelOrderLocationRow = {
  id: string;
  travelOrderId: string;
  label: string;
  latitude: number | null;
  longitude: number | null;
  checkedAt: Date | null;
  startedAt: Date | null;
  startedLatitude: number | null;
  startedLongitude: number | null;
  endedAt: Date | null;
  endedLatitude: number | null;
  endedLongitude: number | null;
  remarks: string | null;
  attachments: TravelOrderAttachment[];
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export type TravelOrderRow = {
  id: string;
  kpiMaintenanceId: string;
  orderRequest: string;
  status: string;
  approvedByAgentId: string | null;
  approvedByAgentIds: string[];
  approvalLevels: TravelOrderApprovalLevelDto[];
  confirmationByAgentId: string | null;
  createdByAgentId: string | null;
  companyTeamId: string | null;
  travelerAgentIds: string[];
  vehicle: string | null;
  rejectionReason: string | null;
  rejectedByAgentId: string | null;
  rejectedAt: Date | null;
  rejectedAtLevel: number | null;
  rejectedByAgent: TravelOrderAgentRef | null;
  kpiPercent: number | null;
  kpiSubmittedAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  approvedByAgent: TravelOrderAgentRef | null;
  approvedByAgents: TravelOrderAgentRef[];
  confirmationByAgent: TravelOrderAgentRef | null;
  createdByAgent: TravelOrderAgentRef | null;
  travelers: TravelOrderAgentRef[];
  locations: TravelOrderLocationRow[];
  /** Optional KPI labels when listed across tasks. */
  kpiTitle?: string | null;
  kpiMainTask?: string | null;
};

type LocationInput = {
  label: string;
  latitude?: number | null;
  longitude?: number | null;
  remarks?: string | null;
  sortOrder: number;
};

function newId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 25);
}

type RawTravelOrder = {
  id: string;
  kpi_maintenance_id: string;
  order_request: string;
  status: string;
  approved_by_agent_id: string | null;
  approved_by_agent_ids: unknown;
  approval_levels: unknown;
  confirmation_by_agent_id: string | null;
  created_by_agent_id: string | null;
  company_team_id: string | null;
  traveler_agent_ids: unknown;
  vehicle: string | null;
  rejection_reason: string | null;
  rejected_by_agent_id: string | null;
  rejected_at: Date | string | null;
  rejected_at_level: number | null;
  kpi_percent: number | null;
  kpi_submitted_at: Date | string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  agent_id: string | null;
  agent_name: string | null;
  agent_email: string | null;
  confirm_agent_id: string | null;
  confirm_agent_name: string | null;
  confirm_agent_email: string | null;
  creator_agent_id: string | null;
  creator_agent_name: string | null;
  creator_agent_email: string | null;
  reject_agent_id: string | null;
  reject_agent_name: string | null;
  reject_agent_email: string | null;
  kpi_title?: string | null;
  kpi_main_task?: string | null;
};

type RawLocation = {
  id: string;
  travel_order_id: string;
  label: string;
  latitude: number | null;
  longitude: number | null;
  checked_at: Date | string | null;
  started_at?: Date | string | null;
  started_latitude?: number | null;
  started_longitude?: number | null;
  ended_at?: Date | string | null;
  ended_latitude?: number | null;
  ended_longitude?: number | null;
  remarks: string | null;
  attachments: unknown;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
};

function asDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function mapAgent(
  id: string | null,
  name: string | null,
  email: string | null,
): TravelOrderAgentRef | null {
  if (!id || !name || !email) return null;
  return { id, name, email };
}

function mapOrderBase(
  order: RawTravelOrder,
  locations: RawLocation[],
): TravelOrderRow {
  const approvedByAgentIds = parseApprovedByAgentIds(
    order.approved_by_agent_ids,
    order.approved_by_agent_id,
  );
  const storedLevels = parseApprovalLevels(order.approval_levels);
  const createdByAgentId = order.created_by_agent_id;
  const travelerAgentIds = parseTravelerAgentIds(order.traveler_agent_ids, createdByAgentId);
  const primary = mapAgent(order.agent_id, order.agent_name, order.agent_email);
  const creator = mapAgent(
    order.creator_agent_id,
    order.creator_agent_name,
    order.creator_agent_email,
  );
  return {
    id: order.id,
    kpiMaintenanceId: order.kpi_maintenance_id,
    orderRequest: order.order_request,
    status: order.status,
    approvedByAgentId: order.approved_by_agent_id ?? approvedByAgentIds[0] ?? null,
    approvedByAgentIds,
    approvalLevels: storedLevels.map((lvl) => ({
      level: lvl.level,
      agentId: lvl.agentId,
      agent: null,
      approvedAt: lvl.approvedAt,
      approvedByAgentId: lvl.approvedByAgentId,
      approvedByAgent: null,
      optional: lvl.optional === true,
    })),
    confirmationByAgentId: order.confirmation_by_agent_id,
    createdByAgentId,
    companyTeamId: order.company_team_id,
    travelerAgentIds,
    vehicle: typeof order.vehicle === "string" && order.vehicle.trim() ? order.vehicle.trim() : null,
    rejectionReason:
      typeof order.rejection_reason === "string" && order.rejection_reason.trim()
        ? order.rejection_reason.trim()
        : null,
    rejectedByAgentId: order.rejected_by_agent_id,
    rejectedAt: asDate(order.rejected_at),
    rejectedAtLevel:
      typeof order.rejected_at_level === "number" && Number.isFinite(order.rejected_at_level)
        ? order.rejected_at_level
        : null,
    rejectedByAgent: mapAgent(
      order.reject_agent_id,
      order.reject_agent_name,
      order.reject_agent_email,
    ),
    kpiPercent:
      typeof order.kpi_percent === "number" && Number.isFinite(order.kpi_percent)
        ? order.kpi_percent
        : null,
    kpiSubmittedAt: asDate(order.kpi_submitted_at),
    createdBy: order.created_by,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    approvedByAgent: primary,
    approvedByAgents: primary ? [primary] : [],
    confirmationByAgent: mapAgent(
      order.confirm_agent_id,
      order.confirm_agent_name,
      order.confirm_agent_email,
    ),
    createdByAgent: creator,
    travelers: [],
    kpiTitle: order.kpi_title ?? null,
    kpiMainTask: order.kpi_main_task ?? null,
    locations: locations
      .filter((l) => l.travel_order_id === order.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((loc) => {
        const startedAt = asDate(loc.started_at ?? null);
        const endedAt = asDate(loc.ended_at ?? null) ?? asDate(loc.checked_at);
        const startedLatitude =
          typeof loc.started_latitude === "number" && Number.isFinite(loc.started_latitude)
            ? loc.started_latitude
            : null;
        const startedLongitude =
          typeof loc.started_longitude === "number" && Number.isFinite(loc.started_longitude)
            ? loc.started_longitude
            : null;
        const endedLatitude =
          (typeof loc.ended_latitude === "number" && Number.isFinite(loc.ended_latitude)
            ? loc.ended_latitude
            : null) ?? loc.latitude;
        const endedLongitude =
          (typeof loc.ended_longitude === "number" && Number.isFinite(loc.ended_longitude)
            ? loc.ended_longitude
            : null) ?? loc.longitude;
        return {
          id: loc.id,
          travelOrderId: loc.travel_order_id,
          label: loc.label,
          latitude: endedLatitude,
          longitude: endedLongitude,
          checkedAt: endedAt,
          startedAt,
          startedLatitude,
          startedLongitude,
          endedAt,
          endedLatitude,
          endedLongitude,
          remarks: loc.remarks,
          attachments: parseTravelOrderAttachments(loc.attachments),
          sortOrder: loc.sort_order,
          createdAt: loc.created_at,
          updatedAt: loc.updated_at,
        };
      }),
  };
}

async function hydrateApprovedByAgents(orders: TravelOrderRow[]): Promise<TravelOrderRow[]> {
  const flatIds = orders.flatMap((o) => o.approvedByAgentIds);
  const levelIds = orders.flatMap((o) =>
    o.approvalLevels.flatMap((l) => [l.agentId, l.approvedByAgentId].filter(Boolean) as string[]),
  );
  const travelerIds = orders.flatMap((o) => o.travelerAgentIds);
  const creatorIds = orders
    .map((o) => o.createdByAgentId)
    .filter((id): id is string => Boolean(id));
  const allIds = [...new Set([...flatIds, ...levelIds, ...travelerIds, ...creatorIds])];
  if (allIds.length === 0) return orders;
  const agents = await prisma.$queryRaw<Array<{ id: string; name: string; email: string }>>`
    SELECT id, name, email FROM agents WHERE id IN (${Prisma.join(allIds)})
  `;
  const byId = new Map(agents.map((a) => [a.id, a] as const));
  return orders.map((order) => {
    const approvedByAgents = order.approvedByAgentIds
      .map((id) => byId.get(id))
      .filter(Boolean) as TravelOrderAgentRef[];
    const approvalLevels: TravelOrderApprovalLevelDto[] = order.approvalLevels.map((lvl) => ({
      ...lvl,
      agent: lvl.agentId ? (byId.get(lvl.agentId) ?? null) : null,
      approvedByAgent: lvl.approvedByAgentId
        ? (byId.get(lvl.approvedByAgentId) ?? null)
        : null,
    }));
    const travelers = order.travelerAgentIds
      .map((id) => byId.get(id))
      .filter(Boolean) as TravelOrderAgentRef[];
    const createdByAgent =
      (order.createdByAgentId ? byId.get(order.createdByAgentId) : null) ??
      order.createdByAgent;
    return {
      ...order,
      approvedByAgents,
      approvedByAgent: approvedByAgents[0] ?? order.approvedByAgent,
      approvedByAgentId: order.approvedByAgentId ?? approvedByAgents[0]?.id ?? null,
      approvalLevels,
      travelers,
      createdByAgent: createdByAgent ?? null,
    };
  });
}

/**
 * Raw SQL helpers — work even when Prisma Client wasn't regenerated for TravelOrder
 * (common on Windows when `query_engine-windows.dll.node` is locked by `next dev`).
 */
export async function createTravelOrderWithLocations(input: {
  kpiMaintenanceId: string;
  orderRequest: string;
  approvedByAgentIds: string[];
  approvalLevels?: Array<{ level?: number; agentId?: string | null; optional?: boolean }>;
  confirmationByAgentId?: string | null;
  createdBy: string;
  createdByAgentId?: string | null;
  companyTeamId?: string | null;
  travelerAgentIds?: string[];
  vehicle?: string | null;
  status?: string;
  locations: LocationInput[];
}): Promise<TravelOrderRow> {
  const id = newId();
  const status = input.status ?? "SUBMITTED";
  const now = new Date();
  const approvalLevels = normalizeApprovalLevelsForStore(input.approvalLevels ?? []);
  const fromLevels = approvalLevels
    .map((l) => l.agentId)
    .filter((v): v is string => Boolean(v));
  const approvedByAgentIds = [
    ...new Set([
      ...(fromLevels.length > 0
        ? fromLevels
        : input.approvedByAgentIds.map((v) => v.trim()).filter(Boolean)),
    ]),
  ];
  if (approvedByAgentIds.length === 0) {
    throw new Error("At least one approver is required.");
  }
  if (approvalLevels.length > 0) {
    for (const lvl of approvalLevels) {
      if (!lvl.agentId) {
        throw new Error(`Assign an approver for Level ${lvl.level}.`);
      }
    }
  }
  const primaryApproverId = approvedByAgentIds[0]!;
  const confirmationByAgentId = input.confirmationByAgentId?.trim() || null;
  const createdByAgentId = input.createdByAgentId?.trim() || null;
  const companyTeamId = input.companyTeamId?.trim() || null;
  const travelerAgentIds = parseTravelerAgentIds(
    input.travelerAgentIds ?? [],
    createdByAgentId,
  );
  const vehicle =
    typeof input.vehicle === "string" && input.vehicle.trim() ? input.vehicle.trim() : null;

  await prisma.$executeRaw`
    INSERT INTO travel_orders (
      id, kpi_maintenance_id, order_request, status,
      approved_by_agent_id, approved_by_agent_ids, approval_levels, confirmation_by_agent_id,
      created_by_agent_id, company_team_id, traveler_agent_ids, vehicle,
      created_by, created_at, updated_at
    ) VALUES (
      ${id},
      ${input.kpiMaintenanceId},
      ${input.orderRequest},
      ${status},
      ${primaryApproverId},
      ${JSON.stringify(approvedByAgentIds)}::jsonb,
      ${JSON.stringify(approvalLevels)}::jsonb,
      ${confirmationByAgentId},
      ${createdByAgentId},
      ${companyTeamId},
      ${JSON.stringify(travelerAgentIds)}::jsonb,
      ${vehicle},
      ${input.createdBy},
      ${now},
      ${now}
    )
  `;

  for (const loc of input.locations) {
    const locId = newId();
    await prisma.$executeRaw`
      INSERT INTO travel_order_locations (
        id, travel_order_id, label, latitude, longitude,
        remarks, attachments, sort_order, created_at, updated_at
      ) VALUES (
        ${locId},
        ${id},
        ${loc.label},
        ${loc.latitude ?? null},
        ${loc.longitude ?? null},
        ${loc.remarks ?? null},
        ${JSON.stringify([])}::jsonb,
        ${loc.sortOrder},
        ${now},
        ${now}
      )
    `;
  }

  const created = await findTravelOrderById(id);
  if (!created) {
    throw new Error("Travel order was inserted but could not be reloaded.");
  }
  return created;
}

export async function findTravelOrdersByKpiId(
  kpiMaintenanceId: string
): Promise<TravelOrderRow[]> {
  const orders = await prisma.$queryRaw<RawTravelOrder[]>`
    SELECT
      t.id,
      t.kpi_maintenance_id,
      t.order_request,
      t.status,
      t.approved_by_agent_id,
      t.approved_by_agent_ids,
      COALESCE(t.approval_levels, '[]'::jsonb) AS approval_levels,
      t.confirmation_by_agent_id,
      t.created_by_agent_id,
      t.company_team_id,
      COALESCE(t.traveler_agent_ids, '[]'::jsonb) AS traveler_agent_ids,
      t.vehicle,
      t.rejection_reason,
      t.rejected_by_agent_id,
      t.rejected_at,
      t.rejected_at_level,
      t.kpi_percent,
      t.kpi_submitted_at,
      t.created_by,
      t.created_at,
      t.updated_at,
      a.id AS agent_id,
      a.name AS agent_name,
      a.email AS agent_email,
      c.id AS confirm_agent_id,
      c.name AS confirm_agent_name,
      c.email AS confirm_agent_email,
      cr.id AS creator_agent_id,
      cr.name AS creator_agent_name,
      cr.email AS creator_agent_email,
      rj.id AS reject_agent_id,
      rj.name AS reject_agent_name,
      rj.email AS reject_agent_email
    FROM travel_orders t
    LEFT JOIN agents a ON a.id = t.approved_by_agent_id
    LEFT JOIN agents c ON c.id = t.confirmation_by_agent_id
    LEFT JOIN agents cr ON cr.id = t.created_by_agent_id
    LEFT JOIN agents rj ON rj.id = t.rejected_by_agent_id
    WHERE t.kpi_maintenance_id = ${kpiMaintenanceId}
    ORDER BY t.created_at DESC
  `;

  if (orders.length === 0) return [];

  const ids = orders.map((o) => o.id);
  const locations =
    ids.length === 0
      ? []
      : await prisma.$queryRaw<RawLocation[]>`
          SELECT * FROM travel_order_locations
          WHERE travel_order_id IN (${Prisma.join(ids)})
          ORDER BY sort_order ASC
        `;

  return hydrateApprovedByAgents(orders.map((o) => mapOrderBase(o, locations)));
}

export async function findTravelOrderById(
  travelOrderId: string
): Promise<TravelOrderRow | null> {
  const orders = await prisma.$queryRaw<RawTravelOrder[]>`
    SELECT
      t.id,
      t.kpi_maintenance_id,
      t.order_request,
      t.status,
      t.approved_by_agent_id,
      t.approved_by_agent_ids,
      COALESCE(t.approval_levels, '[]'::jsonb) AS approval_levels,
      t.confirmation_by_agent_id,
      t.created_by_agent_id,
      t.company_team_id,
      COALESCE(t.traveler_agent_ids, '[]'::jsonb) AS traveler_agent_ids,
      t.vehicle,
      t.rejection_reason,
      t.rejected_by_agent_id,
      t.rejected_at,
      t.rejected_at_level,
      t.kpi_percent,
      t.kpi_submitted_at,
      t.created_by,
      t.created_at,
      t.updated_at,
      a.id AS agent_id,
      a.name AS agent_name,
      a.email AS agent_email,
      c.id AS confirm_agent_id,
      c.name AS confirm_agent_name,
      c.email AS confirm_agent_email,
      cr.id AS creator_agent_id,
      cr.name AS creator_agent_name,
      cr.email AS creator_agent_email,
      rj.id AS reject_agent_id,
      rj.name AS reject_agent_name,
      rj.email AS reject_agent_email
    FROM travel_orders t
    LEFT JOIN agents a ON a.id = t.approved_by_agent_id
    LEFT JOIN agents c ON c.id = t.confirmation_by_agent_id
    LEFT JOIN agents cr ON cr.id = t.created_by_agent_id
    LEFT JOIN agents rj ON rj.id = t.rejected_by_agent_id
    WHERE t.id = ${travelOrderId}
    LIMIT 1
  `;
  const order = orders[0];
  if (!order) return null;

  const locations = await prisma.$queryRaw<RawLocation[]>`
    SELECT * FROM travel_order_locations
    WHERE travel_order_id = ${travelOrderId}
    ORDER BY sort_order ASC
  `;

  const [hydrated] = await hydrateApprovedByAgents([mapOrderBase(order, locations)]);
  return hydrated ?? null;
}

/** Company-scoped travel order list (Field Assignment board). */
export async function findTravelOrdersByCompanyTeamId(
  companyTeamId: string,
): Promise<TravelOrderRow[]> {
  const orders = await prisma.$queryRaw<RawTravelOrder[]>`
    SELECT
      t.id,
      t.kpi_maintenance_id,
      t.order_request,
      t.status,
      t.approved_by_agent_id,
      t.approved_by_agent_ids,
      COALESCE(t.approval_levels, '[]'::jsonb) AS approval_levels,
      t.confirmation_by_agent_id,
      t.created_by_agent_id,
      t.company_team_id,
      COALESCE(t.traveler_agent_ids, '[]'::jsonb) AS traveler_agent_ids,
      t.vehicle,
      t.rejection_reason,
      t.rejected_by_agent_id,
      t.rejected_at,
      t.rejected_at_level,
      t.kpi_percent,
      t.kpi_submitted_at,
      t.created_by,
      t.created_at,
      t.updated_at,
      a.id AS agent_id,
      a.name AS agent_name,
      a.email AS agent_email,
      c.id AS confirm_agent_id,
      c.name AS confirm_agent_name,
      c.email AS confirm_agent_email,
      cr.id AS creator_agent_id,
      cr.name AS creator_agent_name,
      cr.email AS creator_agent_email,
      rj.id AS reject_agent_id,
      rj.name AS reject_agent_name,
      rj.email AS reject_agent_email,
      k.title AS kpi_title,
      k.main_task AS kpi_main_task
    FROM travel_orders t
    LEFT JOIN agents a ON a.id = t.approved_by_agent_id
    LEFT JOIN agents c ON c.id = t.confirmation_by_agent_id
    LEFT JOIN agents cr ON cr.id = t.created_by_agent_id
    LEFT JOIN agents rj ON rj.id = t.rejected_by_agent_id
    LEFT JOIN kpi_maintenance k ON k.id = t.kpi_maintenance_id
    WHERE t.company_team_id = ${companyTeamId}
    ORDER BY t.created_at DESC
  `;

  if (orders.length === 0) return [];

  const ids = orders.map((o) => o.id);
  const locations = await prisma.$queryRaw<RawLocation[]>`
    SELECT * FROM travel_order_locations
    WHERE travel_order_id IN (${Prisma.join(ids)})
    ORDER BY sort_order ASC
  `;

  return hydrateApprovedByAgents(orders.map((o) => mapOrderBase(o, locations)));
}

/**
 * SUBMITTED travel orders waiting on this agent to approve
 * (current hierarchical level, or flat designated approver list).
 */
export async function listPendingTravelApprovalsForAgent(
  agentId: string,
): Promise<TravelOrderRow[]> {
  const id = typeof agentId === "string" ? agentId.trim() : "";
  if (!id) return [];

  const orders = await prisma.$queryRaw<RawTravelOrder[]>`
    SELECT
      t.id,
      t.kpi_maintenance_id,
      t.order_request,
      t.status,
      t.approved_by_agent_id,
      t.approved_by_agent_ids,
      COALESCE(t.approval_levels, '[]'::jsonb) AS approval_levels,
      t.confirmation_by_agent_id,
      t.created_by_agent_id,
      t.company_team_id,
      COALESCE(t.traveler_agent_ids, '[]'::jsonb) AS traveler_agent_ids,
      t.vehicle,
      t.rejection_reason,
      t.rejected_by_agent_id,
      t.rejected_at,
      t.rejected_at_level,
      t.kpi_percent,
      t.kpi_submitted_at,
      t.created_by,
      t.created_at,
      t.updated_at,
      a.id AS agent_id,
      a.name AS agent_name,
      a.email AS agent_email,
      c.id AS confirm_agent_id,
      c.name AS confirm_agent_name,
      c.email AS confirm_agent_email,
      cr.id AS creator_agent_id,
      cr.name AS creator_agent_name,
      cr.email AS creator_agent_email,
      rj.id AS reject_agent_id,
      rj.name AS reject_agent_name,
      rj.email AS reject_agent_email,
      k.title AS kpi_title,
      k.main_task AS kpi_main_task
    FROM travel_orders t
    LEFT JOIN agents a ON a.id = t.approved_by_agent_id
    LEFT JOIN agents c ON c.id = t.confirmation_by_agent_id
    LEFT JOIN agents cr ON cr.id = t.created_by_agent_id
    LEFT JOIN agents rj ON rj.id = t.rejected_by_agent_id
    LEFT JOIN kpi_maintenance k ON k.id = t.kpi_maintenance_id
    WHERE t.status = ${TRAVEL_ORDER_STATUS.SUBMITTED}
      AND (
        t.approved_by_agent_id = ${id}
        OR t.approved_by_agent_ids @> ${JSON.stringify([id])}::jsonb
        OR t.approval_levels @> ${JSON.stringify([{ agentId: id }])}::jsonb
      )
    ORDER BY t.updated_at DESC
    LIMIT 100
  `;

  if (orders.length === 0) return [];

  const ids = orders.map((o) => o.id);
  const locations = await prisma.$queryRaw<RawLocation[]>`
    SELECT * FROM travel_order_locations
    WHERE travel_order_id IN (${Prisma.join(ids)})
    ORDER BY sort_order ASC
  `;

  const hydrated = await hydrateApprovedByAgents(orders.map((o) => mapOrderBase(o, locations)));
  return hydrated.filter((order) =>
    canApproveTravelOrderNow(id, order, { canAssignWork: false }),
  );
}

export async function countPendingTravelApprovalsForAgent(agentId: string): Promise<number> {
  const rows = await listPendingTravelApprovalsForAgent(agentId);
  return rows.length;
}

export async function travelOrderExistsForKpi(
  travelOrderId: string,
  kpiMaintenanceId: string
): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM travel_orders
    WHERE id = ${travelOrderId} AND kpi_maintenance_id = ${kpiMaintenanceId}
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function updateTravelOrderLocationAttachments(
  locationId: string,
  attachments: TravelOrderAttachment[]
): Promise<void> {
  const now = new Date();
  await prisma.$executeRaw`
    UPDATE travel_order_locations
    SET
      attachments = ${JSON.stringify(attachments)}::jsonb,
      updated_at = ${now}
    WHERE id = ${locationId}
  `;
}

export async function updateTravelOrderStatus(input: {
  travelOrderId: string;
  kpiMaintenanceId: string;
  status: string;
  rejectionReason?: string | null;
  rejectedByAgentId?: string | null;
  rejectedAtLevel?: number | null;
}): Promise<TravelOrderRow | null> {
  const now = new Date();
  const rejectionReason =
    typeof input.rejectionReason === "string" && input.rejectionReason.trim()
      ? input.rejectionReason.trim()
      : null;
  const rejectedByAgentId = input.rejectedByAgentId?.trim() || null;
  const rejectedAtLevel =
    typeof input.rejectedAtLevel === "number" && Number.isFinite(input.rejectedAtLevel)
      ? Math.floor(input.rejectedAtLevel)
      : null;
  if (input.status === TRAVEL_ORDER_STATUS.REJECTED) {
    await prisma.$executeRaw`
      UPDATE travel_orders
      SET status = ${input.status},
          rejection_reason = ${rejectionReason},
          rejected_by_agent_id = ${rejectedByAgentId},
          rejected_at = ${now},
          rejected_at_level = ${rejectedAtLevel},
          updated_at = ${now}
      WHERE id = ${input.travelOrderId}
        AND kpi_maintenance_id = ${input.kpiMaintenanceId}
    `;
  } else {
    await prisma.$executeRaw`
      UPDATE travel_orders
      SET status = ${input.status}, updated_at = ${now}
      WHERE id = ${input.travelOrderId}
        AND kpi_maintenance_id = ${input.kpiMaintenanceId}
    `;
  }
  return findTravelOrderById(input.travelOrderId);
}

/**
 * Approve the current pending level (hierarchical) or fully approve (flat).
 * Returns the updated order, or throws with a user-facing message.
 */
export async function approveTravelOrderSequential(input: {
  travelOrderId: string;
  kpiMaintenanceId: string;
  operatorAgentId: string | null;
  canAssignWork: boolean;
}): Promise<TravelOrderRow> {
  const order = await findTravelOrderById(input.travelOrderId);
  if (!order || order.kpiMaintenanceId !== input.kpiMaintenanceId) {
    throw new Error("Travel order not found.");
  }
  if (order.status !== TRAVEL_ORDER_STATUS.SUBMITTED) {
    throw new Error("Only a submitted travel order can be approved.");
  }

  const stored: TravelOrderApprovalLevelStored[] = order.approvalLevels.map((l) => ({
    level: l.level,
    agentId: l.agentId,
    approvedAt: l.approvedAt,
    approvedByAgentId: l.approvedByAgentId,
    optional: l.optional === true,
  }));

  if (!hasHierarchicalApprovals(stored)) {
    if (!input.canAssignWork) {
      const ids = parseApprovedByAgentIds(order.approvedByAgentIds, order.approvedByAgentId);
      if (!input.operatorAgentId || !ids.includes(input.operatorAgentId)) {
        throw new Error("Only a designated approver (or an admin) can approve this travel order.");
      }
    }
    const updated = await updateTravelOrderStatus({
      travelOrderId: input.travelOrderId,
      kpiMaintenanceId: input.kpiMaintenanceId,
      status: TRAVEL_ORDER_STATUS.APPROVED,
    });
    if (!updated) throw new Error("Travel order could not be updated.");
    return updated;
  }

  const target = getOperatorActionableApprovalLevel(stored, input.operatorAgentId, {
    canAssignWork: input.canAssignWork,
  });
  if (!target) {
    if (isApprovalHierarchySatisfied(stored)) {
      const updated = await updateTravelOrderStatus({
        travelOrderId: input.travelOrderId,
        kpiMaintenanceId: input.kpiMaintenanceId,
        status: TRAVEL_ORDER_STATUS.APPROVED,
      });
      if (!updated) throw new Error("Travel order could not be updated.");
      return updated;
    }
    throw new Error(
      "Only an unlocked level approver (or an admin) can approve this step. Previous required levels must approve first.",
    );
  }

  const nowIso = new Date().toISOString();
  const nextLevels = stored.map((lvl) =>
    lvl.level === target.level
      ? {
          ...lvl,
          approvedAt: nowIso,
          approvedByAgentId: input.operatorAgentId ?? lvl.agentId,
        }
      : lvl,
  );

  const fullyDone = isApprovalHierarchySatisfied(nextLevels);
  const now = new Date();
  await prisma.$executeRaw`
    UPDATE travel_orders
    SET
      approval_levels = ${JSON.stringify(nextLevels)}::jsonb,
      status = ${fullyDone ? TRAVEL_ORDER_STATUS.APPROVED : TRAVEL_ORDER_STATUS.SUBMITTED},
      updated_at = ${now}
    WHERE id = ${input.travelOrderId}
      AND kpi_maintenance_id = ${input.kpiMaintenanceId}
  `;

  const updated = await findTravelOrderById(input.travelOrderId);
  if (!updated) throw new Error("Travel order could not be updated.");
  return updated;
}

export async function recordTravelOrderKpiSubmit(input: {
  travelOrderId: string;
  kpiMaintenanceId: string;
  kpiPercent: number;
}): Promise<TravelOrderRow | null> {
  const now = new Date();
  const percent = Math.max(0, Math.min(100, Math.round(input.kpiPercent)));
  await prisma.$executeRaw`
    UPDATE travel_orders
    SET
      kpi_percent = ${percent},
      kpi_submitted_at = ${now}::timestamptz,
      updated_at = ${now}
    WHERE id = ${input.travelOrderId}
      AND kpi_maintenance_id = ${input.kpiMaintenanceId}
  `;
  return findTravelOrderById(input.travelOrderId);
}

export function fieldAssignmentKpiPercent(
  locations: Array<{
    checkedAt?: Date | string | null;
    endedAt?: Date | string | null;
  }>,
): {
  checked: number;
  total: number;
  percent: number;
} {
  const total = locations.length;
  const checked = locations.filter((l) => l.endedAt != null || l.checkedAt != null).length;
  const percent = total > 0 ? Math.round((checked / total) * 100) : 0;
  return { checked, total, percent };
}

export async function updateTravelOrderLocationVisit(input: {
  locationId: string;
  travelOrderId: string;
  /** @deprecated Prefer visitAction. */
  checked?: boolean;
  visitAction?: "start" | "end";
  latitude?: number | null;
  longitude?: number | null;
  /** Client-captured ISO instant; falls back to server UTC now. */
  checkedAtIso?: string | null;
  capturedAtIso?: string | null;
}): Promise<void> {
  const action =
    input.visitAction ??
    (input.checked === true ? "end" : input.checked === false ? "clear" : null);
  if (!action) {
    throw new Error("Provide visitAction (start|end) or checked.");
  }

  const capturedRaw = input.capturedAtIso ?? input.checkedAtIso;
  const parsed =
    typeof capturedRaw === "string" && capturedRaw.trim()
      ? new Date(capturedRaw.trim())
      : new Date();
  const at = Number.isFinite(parsed.getTime()) ? parsed : new Date();
  const atIso = at.toISOString();
  const lat = input.latitude ?? null;
  const lng = input.longitude ?? null;

  if (action === "start") {
    await prisma.$executeRaw`
      UPDATE travel_order_locations
      SET
        started_at = ${atIso}::timestamptz,
        started_latitude = ${lat},
        started_longitude = ${lng},
        updated_at = NOW()
      WHERE id = ${input.locationId}
        AND travel_order_id = ${input.travelOrderId}
        AND started_at IS NULL
    `;
    return;
  }

  if (action === "end") {
    await prisma.$executeRaw`
      UPDATE travel_order_locations
      SET
        ended_at = ${atIso}::timestamptz,
        ended_latitude = ${lat},
        ended_longitude = ${lng},
        checked_at = ${atIso}::timestamptz,
        latitude = ${lat},
        longitude = ${lng},
        updated_at = NOW()
      WHERE id = ${input.locationId}
        AND travel_order_id = ${input.travelOrderId}
        AND ended_at IS NULL
        AND checked_at IS NULL
        AND started_at IS NOT NULL
    `;
    return;
  }

  // clear (legacy uncheck)
  await prisma.$executeRaw`
    UPDATE travel_order_locations
    SET
      started_at = NULL,
      started_latitude = NULL,
      started_longitude = NULL,
      ended_at = NULL,
      ended_latitude = NULL,
      ended_longitude = NULL,
      checked_at = NULL,
      latitude = NULL,
      longitude = NULL,
      updated_at = NOW()
    WHERE id = ${input.locationId}
      AND travel_order_id = ${input.travelOrderId}
  `;
}

export async function updateTravelOrderLocationRemarks(input: {
  locationId: string;
  travelOrderId: string;
  remarks: string | null;
}): Promise<void> {
  const now = new Date();
  await prisma.$executeRaw`
    UPDATE travel_order_locations
    SET
      remarks = ${input.remarks},
      updated_at = ${now}
    WHERE id = ${input.locationId}
      AND travel_order_id = ${input.travelOrderId}
  `;
}

/** KPI ids that have at least one travel order (Field Assignment cards). */
export async function kpiIdsWithTravelOrders(kpiIds: string[]): Promise<Set<string>> {
  if (kpiIds.length === 0) return new Set();
  const rows = await prisma.$queryRaw<Array<{ kpi_maintenance_id: string }>>`
    SELECT DISTINCT kpi_maintenance_id
    FROM travel_orders
    WHERE kpi_maintenance_id IN (${Prisma.join(kpiIds)})
  `;
  return new Set(rows.map((r) => r.kpi_maintenance_id));
}

export function serializeTravelOrder(row: TravelOrderRow) {
  return {
    id: row.id,
    kpiMaintenanceId: row.kpiMaintenanceId,
    orderRequest: row.orderRequest,
    status: row.status,
    approvedByAgentId: row.approvedByAgentId,
    approvedByAgent: row.approvedByAgent,
    approvedByAgentIds: row.approvedByAgentIds,
    approvedByAgents: row.approvedByAgents,
    approvalLevels: row.approvalLevels,
    confirmationByAgentId: row.confirmationByAgentId,
    confirmationByAgent: row.confirmationByAgent,
    createdByAgentId: row.createdByAgentId,
    createdByAgent: row.createdByAgent,
    companyTeamId: row.companyTeamId,
    travelerAgentIds: row.travelerAgentIds,
    travelers: row.travelers,
    vehicle: row.vehicle,
    rejectionReason: row.rejectionReason ?? null,
    rejectedByAgentId: row.rejectedByAgentId ?? null,
    rejectedByAgent: row.rejectedByAgent ?? null,
    rejectedAt: row.rejectedAt ? row.rejectedAt.toISOString() : null,
    rejectedAtLevel: row.rejectedAtLevel ?? null,
    kpiPercent: row.kpiPercent,
    kpiSubmittedAt: row.kpiSubmittedAt ? row.kpiSubmittedAt.toISOString() : null,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    kpiTitle: row.kpiTitle ?? null,
    kpiMainTask: row.kpiMainTask ?? null,
    locations: row.locations.map((loc) => ({
      id: loc.id,
      label: loc.label,
      latitude: loc.latitude,
      longitude: loc.longitude,
      checkedAt: loc.checkedAt ? loc.checkedAt.toISOString() : null,
      startedAt: loc.startedAt ? loc.startedAt.toISOString() : null,
      startedLatitude: loc.startedLatitude,
      startedLongitude: loc.startedLongitude,
      endedAt: loc.endedAt ? loc.endedAt.toISOString() : null,
      endedLatitude: loc.endedLatitude,
      endedLongitude: loc.endedLongitude,
      remarks: loc.remarks,
      attachments: loc.attachments,
      sortOrder: loc.sortOrder,
    })),
  };
}
