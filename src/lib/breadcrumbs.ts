export type BreadcrumbSegment = {
  label: string;
  href?: string;
};

const ROUTE_LABELS: Record<string, string> = {
  agent: "Assignment Board",
  tasks: "Kanban / Task Board",
  tickets: "Requests",
  insights: "KPI / Insights",
  process: "Process Controls",
  admin: "Administration",
  workforce: "User / Position management",
  "manual-assignment": "Assignment Board",
  "superadmin-settings": "SuperAdmin Settings",
  account: "My account",
  "my-requests": "My Requests",
  "travel-orders": "Travel Orders",
  new: "Create Request",
};

const QUERY_CRUMBS: Array<{
  match: (params: URLSearchParams) => boolean;
  segments: BreadcrumbSegment[];
}> = [
  {
    match: (params) => params.get("assigned") === "UNASSIGNED",
    segments: [
      { label: "Boards", href: "/agent" },
      { label: "Unassigned" },
    ],
  },
  {
    match: (params) => params.get("board") === "company",
    segments: [
      { label: "Boards", href: "/agent" },
      { label: "Company Board" },
    ],
  },
  {
    match: (params) => params.get("board") === "kpi",
    segments: [{ label: "Kanban / Task Board", href: "/agent/tasks" }],
  },
];

function titleCaseSegment(raw: string) {
  return raw
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function buildStaffBreadcrumbs(
  pathname: string,
  searchParams: URLSearchParams | null,
): BreadcrumbSegment[] {
  const home: BreadcrumbSegment = { label: "Home", href: "/" };
  if (pathname === "/") return [home];

  const params = searchParams ?? new URLSearchParams();
  for (const rule of QUERY_CRUMBS) {
    if (rule.match(params)) {
      return [home, ...rule.segments];
    }
  }

  const parts = pathname.split("/").filter(Boolean);

  if (parts[0] === "agent" && parts[1] === "tickets" && parts[2]) {
    return [
      home,
      { label: "My Work", href: "/agent" },
      { label: "Assignment Board", href: "/agent" },
      { label: parts[2] },
    ];
  }

  if (parts[0] === "agent" && parts[1] === "tasks") {
    const taskId = params.get("task");
    if (taskId) {
      return [
        home,
        { label: "Boards", href: "/agent/tasks" },
        { label: "Kanban / Task Board", href: "/agent/tasks" },
        { label: taskId },
      ];
    }
    return [home, { label: "Boards", href: "/agent" }, { label: "Kanban / Task Board" }];
  }

  if (parts[0] === "agent" && parts[1] === "approvals") {
    return [home, { label: "My Work", href: "/agent" }, { label: "My Assigned", href: "/agent" }];
  }

  if (parts[0] === "agent") {
    if (params.get("assigned") === "UNASSIGNED") {
      return [home, { label: "Boards", href: "/agent" }, { label: "Unassigned" }];
    }
    return [home, { label: "My Work", href: "/agent" }, { label: "My Assigned", href: "/agent" }];
  }

  if (parts[0] === "my-requests") {
    return [home, { label: "My Work", href: "/my-requests" }, { label: "My Requests" }];
  }

  if (parts[0] === "travel-orders") {
    const tail = parts[1] ? titleCaseSegment(parts[1]) : null;
    return tail
      ? [
          home,
          { label: "Boards", href: "/travel-orders" },
          { label: "Travel Orders", href: "/travel-orders" },
          { label: tail },
        ]
      : [home, { label: "Boards", href: "/travel-orders" }, { label: "Travel Orders" }];
  }

  if (parts[0] === "tickets" && parts[1] === "new") {
    return [home, { label: "Create Request" }];
  }

  if (parts[0] === "tickets" && parts[1]) {
    return [home, { label: "Requests", href: "/my-requests" }, { label: parts[1] }];
  }

  if (parts[0] === "admin" && parts[1] === "manual-assignment") {
    return [home, { label: "Boards", href: "/admin/manual-assignment" }, { label: "Assignment Board" }];
  }

  const crumbs: BreadcrumbSegment[] = [home];
  let pathAcc = "";
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]!;
    pathAcc += `/${part}`;
    const isLast = i === parts.length - 1;
    const mapped = ROUTE_LABELS[part];
    const label = mapped ?? titleCaseSegment(part);
    crumbs.push(isLast ? { label } : { label, href: pathAcc });
  }
  return crumbs;
}

export function mergeBreadcrumbTail(
  base: BreadcrumbSegment[],
  tail: BreadcrumbSegment[],
): BreadcrumbSegment[] {
  if (tail.length === 0) return base;
  const parent = base.slice(0, -1);
  return [...parent, ...tail];
}
