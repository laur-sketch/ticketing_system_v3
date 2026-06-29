import { onDutyCompanyLine, resolveStaffOnDutyAgentIds } from "@/lib/on-duty-company-line";
import { prisma } from "@/lib/prisma";

export type OnDutyAgentSnapshot = {
  id: string;
  name: string;
  companyName: string;
  isOnline: boolean;
};

export type OnDutySnapshot = {
  agents: OnDutyAgentSnapshot[];
  page: number;
  totalPages: number;
  total: number;
  companies: string[];
};

const ONLINE_WINDOW_MS = 15 * 60 * 1000;

type LoadOnDutyOptions = {
  page?: number;
  pageSize?: number;
  companyFilter?: string;
};

export async function loadOnDutySnapshot(options: LoadOnDutyOptions = {}): Promise<OnDutySnapshot> {
  const pageSize = Math.min(48, Math.max(1, options.pageSize ?? 6));
  const pageRaw = Math.max(1, options.page ?? 1);
  const companyFilter = options.companyFilter?.trim() ?? "";

  const [onDutyPortalAccounts, onDutyAgentsCanonical] = await Promise.all([
    prisma.portalAccount.findMany({
      select: {
        email: true,
        name: true,
        role: true,
        staffDesignatedCompany: { select: { name: true } },
      },
    }),
    prisma.agent.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, name: true, createdAt: true },
    }),
  ]);

  const dutyAgentIds = resolveStaffOnDutyAgentIds(onDutyPortalAccounts, onDutyAgentsCanonical);
  if (dutyAgentIds.length === 0) {
    return { agents: [], page: 1, totalPages: 1, total: 0, companies: [] };
  }

  const onDutyAgents = await prisma.agent.findMany({
    where: { id: { in: dutyAgentIds } },
    orderBy: { name: "asc" },
    include: {
      team: true,
      tickets: {
        select: { updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
  });

  const now = Date.now();
  const allAgents: OnDutyAgentSnapshot[] = onDutyAgents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    companyName: onDutyCompanyLine(agent, agent.team?.name, onDutyPortalAccounts, onDutyAgentsCanonical),
    isOnline:
      !!agent.tickets[0]?.updatedAt &&
      now - new Date(agent.tickets[0].updatedAt).getTime() <= ONLINE_WINDOW_MS,
  }));

  const companies = [...new Set(allAgents.map((agent) => agent.companyName))].sort((a, b) =>
    a.localeCompare(b),
  );

  const filtered = companyFilter
    ? allAgents.filter((agent) => agent.companyName === companyFilter)
    : allAgents;

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(totalPages, pageRaw);
  const start = (page - 1) * pageSize;
  const agents = filtered.slice(start, start + pageSize);

  return { agents, page, totalPages, total, companies };
}
