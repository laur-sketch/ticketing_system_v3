/**
 * Access Controls configuration for SuperAdmin Settings.
 * Role matrix + org-chart layer matrix. Defaults mirror today’s hardcoded gates;
 * enforcement can adopt this config later.
 */
import { PORTAL_ROLES, type PortalRole } from "@/lib/staff-role";

export const ACCESS_CONTROL_SETTING_KEY = "access_controls";

export const ACCESS_CAPABILITIES = [
  { id: "nav.dashboard", label: "Dashboard", group: "Navigation" },
  { id: "nav.requests", label: "Requests", group: "Navigation" },
  { id: "nav.tasks", label: "Tasks", group: "Navigation" },
  { id: "nav.workforce", label: "Workforce", group: "Navigation" },
  { id: "nav.insights", label: "Metrics & Reports", group: "Navigation" },
  { id: "nav.superadminSettings", label: "SuperAdmin Settings", group: "Navigation" },
  { id: "nav.travelOrders", label: "Travel Orders (kiosk)", group: "Navigation" },

  { id: "board.assignment", label: "Assign Requests", group: "Request boards" },
  { id: "board.company", label: "Company Board", group: "Request boards" },
  { id: "board.request", label: "Requests", group: "Request boards" },

  { id: "ticket.create", label: "Create requests", group: "Requests" },
  { id: "ticket.assign", label: "Assign / reassign", group: "Requests" },
  { id: "ticket.approveProcedural", label: "Complete procedural approvals", group: "Requests" },
  { id: "ticket.setApprovalAssignees", label: "Set approval assignees", group: "Requests" },

  { id: "tasks.view", label: "View Task Board", group: "Tasks" },
  { id: "tasks.assign", label: "Assign / manage tasks", group: "Tasks" },
  { id: "tasks.createProject", label: "Create Task Board projects", group: "Tasks" },

  { id: "travel.approve", label: "Approve travel orders", group: "Travel" },
  { id: "travel.confirm", label: "Confirm travel orders", group: "Travel" },
  { id: "travel.gatePass", label: "Gate pass capture", group: "Travel" },
] as const;

export type AccessCapabilityId = (typeof ACCESS_CAPABILITIES)[number]["id"];

export type AccessCapabilityFlags = Record<AccessCapabilityId, boolean>;

export type AccessControlConfig = {
  version: 1;
  roles: Record<PortalRole, AccessCapabilityFlags>;
  /** Keys are layer numbers as strings: "1", "2", … */
  layers: Record<string, AccessCapabilityFlags>;
};

const CAPABILITY_IDS = ACCESS_CAPABILITIES.map((c) => c.id);

function flags(enabled: AccessCapabilityId[]): AccessCapabilityFlags {
  const set = new Set(enabled);
  const out = {} as AccessCapabilityFlags;
  for (const id of CAPABILITY_IDS) out[id] = set.has(id);
  return out;
}

const ALL = CAPABILITY_IDS;
const STAFF_CORE: AccessCapabilityId[] = [
  "nav.dashboard",
  "nav.requests",
  "nav.tasks",
  "nav.insights",
  "board.request",
  "ticket.create",
  "ticket.approveProcedural",
  "tasks.view",
  "travel.approve",
  "travel.confirm",
];

/** Defaults aligned with current hardcoded role behaviour. */
export function defaultAccessControlConfig(maxLayer = 5): AccessControlConfig {
  const layers: Record<string, AccessCapabilityFlags> = {};
  for (let layer = 1; layer <= Math.max(1, maxLayer); layer++) {
    // Layer overlays start empty (inherit role only) until SuperAdmin configures them.
    layers[String(layer)] = flags([]);
  }

  return {
    version: 1,
    roles: {
      SuperAdmin: flags(ALL),
      HighAdmin: flags(
        ALL.filter((id) => id !== "nav.superadminSettings"),
      ),
      Admin: flags([
        "nav.dashboard",
        "nav.requests",
        "nav.tasks",
        "nav.workforce",
        "nav.insights",
        "board.assignment",
        "board.company",
        "board.request",
        "ticket.create",
        "ticket.assign",
        "ticket.approveProcedural",
        "tasks.view",
        "tasks.assign",
        "tasks.createProject",
        "travel.approve",
        "travel.confirm",
      ]),
      Personnel: flags(STAFF_CORE),
      "Personnel-Guard": flags(["nav.travelOrders", "travel.gatePass"]),
      Customer: flags(["ticket.create"]),
    },
    layers,
  };
}

export function emptyCapabilityFlags(): AccessCapabilityFlags {
  return flags([]);
}

export function mergeAccessControlConfig(
  raw: unknown,
  maxLayer = 5,
): AccessControlConfig {
  const base = defaultAccessControlConfig(maxLayer);
  if (!raw || typeof raw !== "object") return base;
  const input = raw as Partial<AccessControlConfig>;

  const roles = { ...base.roles };
  for (const role of PORTAL_ROLES) {
    const incoming = input.roles?.[role];
    if (!incoming || typeof incoming !== "object") continue;
    roles[role] = { ...base.roles[role] };
    for (const id of CAPABILITY_IDS) {
      if (typeof incoming[id] === "boolean") roles[role][id] = incoming[id];
    }
  }

  const layers: Record<string, AccessCapabilityFlags> = { ...base.layers };
  const incomingLayers =
    input.layers && typeof input.layers === "object" ? input.layers : {};
  const layerKeys = new Set([
    ...Object.keys(layers),
    ...Object.keys(incomingLayers),
  ]);
  for (const key of layerKeys) {
    const layerNum = Number(key);
    if (!Number.isInteger(layerNum) || layerNum < 1) continue;
    const incoming = incomingLayers[key];
    layers[key] = { ...(layers[key] ?? emptyCapabilityFlags()) };
    if (incoming && typeof incoming === "object") {
      for (const id of CAPABILITY_IDS) {
        if (typeof incoming[id] === "boolean") layers[key][id] = incoming[id];
      }
    }
  }

  return { version: 1, roles, layers };
}

export function accessCapabilityGroups() {
  const groups: Array<{ group: string; items: Array<(typeof ACCESS_CAPABILITIES)[number]> }> = [];
  const byGroup = new Map<string, Array<(typeof ACCESS_CAPABILITIES)[number]>>();
  for (const cap of ACCESS_CAPABILITIES) {
    const list = byGroup.get(cap.group) ?? [];
    list.push(cap);
    byGroup.set(cap.group, list);
  }
  for (const [group, items] of byGroup) {
    groups.push({ group, items });
  }
  return groups;
}

export const ACCESS_CONTROL_ROLES: PortalRole[] = [...PORTAL_ROLES];
