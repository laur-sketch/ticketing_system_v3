import { NextResponse } from "next/server";
import { requireSession } from "@/lib/access";
import { prismaPrimary } from "@/lib/prisma";

async function guardSuperAdmin() {
  const session = await requireSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "SuperAdmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

function serializeSection(s: {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  parentId: string | null;
  companyTeamId: string | null;
  headNodeId: string | null;
  companyTeam: { id: string; name: string } | null;
  headNode: {
    id: string;
    personName: string;
    personRole: string | null;
    companyName: string | null;
  } | null;
  _count: { memberships: number };
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    sortOrder: s.sortOrder,
    parentId: s.parentId,
    companyTeamId: s.companyTeamId,
    companyName: s.companyTeam?.name ?? null,
    headNodeId: s.headNodeId,
    headName: s.headNode?.personName ?? null,
    headRole: s.headNode?.personRole ?? null,
    headCompanyName: s.headNode?.companyName ?? null,
    memberCount: s._count.memberships,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

const sectionInclude = {
  companyTeam: { select: { id: true, name: true } },
  headNode: {
    select: {
      id: true,
      personName: true,
      personRole: true,
      companyName: true,
    },
  },
  _count: { select: { memberships: true } },
} as const;

/// Top-level sections may contain nested subsections at any depth via parentId.
async function isSectionDescendantOf(
  ancestorId: string,
  nodeId: string,
  rows?: Array<{ id: string; parentId: string | null }>,
): Promise<boolean> {
  const all =
    rows ??
    (await prismaPrimary.orgChartSection.findMany({
      select: { id: true, parentId: true },
    }));
  const childrenOf = new Map<string | null, string[]>();
  for (const s of all) {
    const list = childrenOf.get(s.parentId) ?? [];
    list.push(s.id);
    childrenOf.set(s.parentId, list);
  }
  const stack = [nodeId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === ancestorId) return true;
    for (const child of childrenOf.get(current) ?? []) stack.push(child);
  }
  return false;
}

async function resolveParentId(
  raw: unknown,
  opts?: { sectionId?: string },
): Promise<
  { parentId: string; companyTeamId: string | null } | { error: string; status: number } | null
> {
  if (raw === undefined || raw === null || raw === "") return null;
  const parentId = String(raw).trim();
  if (!parentId) return null;
  if (opts?.sectionId && parentId === opts.sectionId) {
    return { error: "A section cannot be its own parent.", status: 400 };
  }
  const parent = await prismaPrimary.orgChartSection.findUnique({
    where: { id: parentId },
    select: { id: true, companyTeamId: true },
  });
  if (!parent) {
    return { error: "Parent section not found.", status: 400 };
  }
  if (opts?.sectionId && (await isSectionDescendantOf(opts.sectionId, parentId))) {
    return {
      error: "A section cannot be nested under one of its own subsections.",
      status: 400,
    };
  }
  return { parentId: parent.id, companyTeamId: parent.companyTeamId };
}

async function resolveHeadNodeId(
  sectionId: string,
  raw: unknown,
): Promise<{ headNodeId: string | null } | { error: string; status: number }> {
  if (raw === undefined) {
    return { error: "Nothing to update.", status: 400 };
  }
  if (raw === null || raw === "") {
    return { headNodeId: null };
  }
  const headNodeId = String(raw).trim();
  const node = await prismaPrimary.orgChartNode.findUnique({
    where: { id: headNodeId },
    select: {
      id: true,
      sectionMemberships: {
        where: { sectionId },
        select: { sectionId: true },
      },
    },
  });
  if (!node) {
    return { error: "That person is not on the org chart.", status: 400 };
  }
  if (node.sectionMemberships.length === 0) {
    return {
      error: "The head must be a member of this section or subsection.",
      status: 400,
    };
  }
  return { headNodeId };
}

async function syncPrimarySections(nodeIds: string[]) {
  if (nodeIds.length === 0) return;
  const nodes = await prismaPrimary.orgChartNode.findMany({
    where: { id: { in: nodeIds } },
    select: {
      id: true,
      sectionId: true,
      sectionMemberships: {
        select: { sectionId: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  await prismaPrimary.$transaction(
    nodes
      .map((node) => {
        const membershipIds = node.sectionMemberships.map((m) => m.sectionId);
        const nextPrimary =
          node.sectionId && membershipIds.includes(node.sectionId)
            ? node.sectionId
            : membershipIds[0] ?? null;
        if (nextPrimary === node.sectionId) return null;
        return prismaPrimary.orgChartNode.update({
          where: { id: node.id },
          data: { sectionId: nextPrimary },
        });
      })
      .filter((op): op is Exclude<typeof op, null> => op != null),
  );
}

/** Clear section head when members leave their section. */
async function clearHeadsForNodes(nodeIds: string[]) {
  if (nodeIds.length === 0) return;
  await prismaPrimary.orgChartSection.updateMany({
    where: { headNodeId: { in: nodeIds } },
    data: { headNodeId: null },
  });
}

export async function GET() {
  const denied = await guardSuperAdmin();
  if (denied) return denied;

  const sections = await prismaPrimary.orgChartSection.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: sectionInclude,
  });

  return NextResponse.json(sections.map(serializeSection));
}

export async function POST(req: Request) {
  const denied = await guardSuperAdmin();
  if (denied) return denied;

  const body = (await req.json()) as Record<string, unknown>;
  const name = String(body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Section name is required." }, { status: 400 });
  }

  const descriptionRaw = String(body.description ?? "").trim();
  const description = descriptionRaw ? descriptionRaw.slice(0, 500) : null;

  const parentResolved = await resolveParentId(body.parentId);
  if (parentResolved && "error" in parentResolved) {
    return NextResponse.json(
      { error: parentResolved.error },
      { status: parentResolved.status },
    );
  }
  const parentId = parentResolved?.parentId ?? null;

  let companyTeamId: string | null = body.companyTeamId
    ? String(body.companyTeamId).trim()
    : null;
  if (parentResolved && body.companyTeamId === undefined) {
    companyTeamId = parentResolved.companyTeamId;
  }
  if (companyTeamId) {
    if (companyTeamId.startsWith("company:")) {
      companyTeamId = null;
    } else {
      const team = await prismaPrimary.team.findUnique({
        where: { id: companyTeamId },
        select: { id: true },
      });
      if (!team) {
        return NextResponse.json({ error: "Company not found." }, { status: 400 });
      }
    }
  }

  const [max] = await prismaPrimary.orgChartSection.findMany({
    where: { parentId },
    orderBy: { sortOrder: "desc" },
    take: 1,
    select: { sortOrder: true },
  });
  const sortOrder =
    typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)
      ? Math.max(0, Math.floor(body.sortOrder))
      : (max?.sortOrder ?? -1) + 1;

  const created = await prismaPrimary.orgChartSection.create({
    data: {
      name: name.slice(0, 120),
      description,
      companyTeamId,
      parentId,
      sortOrder,
    },
    include: sectionInclude,
  });

  return NextResponse.json(serializeSection(created), { status: 201 });
}

export async function PATCH(req: Request) {
  const denied = await guardSuperAdmin();
  if (denied) return denied;

  const body = (await req.json()) as Record<string, unknown>;
  const id = String(body.id ?? "").trim();

  const fromList = Array.isArray(body.nodeIds)
    ? body.nodeIds.map((x) => String(x ?? "").trim()).filter(Boolean)
    : [];
  const single = body.nodeId ? String(body.nodeId).trim() : "";
  const nodeIds = [...new Set(fromList.length > 0 ? fromList : single ? [single] : [])];

  // Assign / clear / remove section memberships for one or many org-chart nodes.
  if (
    nodeIds.length > 0 &&
    (
      body.clear === true ||
      body.remove === true ||
      body.nodeIds !== undefined ||
      body.nodeId !== undefined
    )
  ) {
    const clearAll =
      body.clear === true || body.sectionId === null || (!id && body.clear === true);
    const removeFromSection = body.remove === true && !clearAll;
    let sectionId: string | null = null;
    if (!clearAll) {
      if (!id) {
        return NextResponse.json({ error: "Section id is required." }, { status: 400 });
      }
      const existing = await prismaPrimary.orgChartSection.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!existing) {
        return NextResponse.json({ error: "Section not found." }, { status: 404 });
      }
      sectionId = id;
    }

    const found = await prismaPrimary.orgChartNode.findMany({
      where: { id: { in: nodeIds } },
      select: { id: true },
    });
    if (found.length !== nodeIds.length) {
      return NextResponse.json(
        { error: "One or more chart members were not found." },
        { status: 404 },
      );
    }

    if (clearAll) {
      await clearHeadsForNodes(nodeIds);
      await prismaPrimary.orgChartNodeSectionMembership.deleteMany({
        where: { nodeId: { in: nodeIds } },
      });
    } else if (removeFromSection) {
      await prismaPrimary.orgChartSection.updateMany({
        where: { id: sectionId!, headNodeId: { in: nodeIds } },
        data: { headNodeId: null },
      });
      await prismaPrimary.orgChartNodeSectionMembership.deleteMany({
        where: { nodeId: { in: nodeIds }, sectionId: sectionId! },
      });
    } else {
      await prismaPrimary.orgChartNodeSectionMembership.createMany({
        data: nodeIds.map((nodeId) => ({ nodeId, sectionId: sectionId! })),
        skipDuplicates: true,
      });
    }

    await syncPrimarySections(nodeIds);

    return NextResponse.json({
      sectionId: clearAll ? null : sectionId,
      cleared: clearAll,
      removed: removeFromSection,
      updated: nodeIds,
    });
  }

  if (!id) {
    return NextResponse.json({ error: "Section id is required." }, { status: 400 });
  }

  const existing = await prismaPrimary.orgChartSection.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Section not found." }, { status: 404 });
  }

  // Set or clear the section / subsection head.
  if (body.headNodeId !== undefined) {
    const resolved = await resolveHeadNodeId(id, body.headNodeId);
    if ("error" in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    const updated = await prismaPrimary.orgChartSection.update({
      where: { id },
      data: { headNodeId: resolved.headNodeId },
      include: sectionInclude,
    });
    return NextResponse.json(serializeSection(updated));
  }

  const data: {
    name?: string;
    description?: string | null;
    sortOrder?: number;
    companyTeamId?: string | null;
    parentId?: string | null;
  } = {};

  if (body.name !== undefined) {
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Section name is required." }, { status: 400 });
    }
    data.name = name.slice(0, 120);
  }

  if (body.description !== undefined) {
    const descriptionRaw = String(body.description ?? "").trim();
    data.description = descriptionRaw ? descriptionRaw.slice(0, 500) : null;
  }

  if (body.sortOrder !== undefined) {
    const n = Number(body.sortOrder);
    if (!Number.isFinite(n)) {
      return NextResponse.json({ error: "Invalid sort order." }, { status: 400 });
    }
    data.sortOrder = Math.max(0, Math.floor(n));
  }

  if (body.parentId !== undefined) {
    const parentResolved = await resolveParentId(body.parentId, { sectionId: id });
    if (parentResolved && "error" in parentResolved) {
      return NextResponse.json(
        { error: parentResolved.error },
        { status: parentResolved.status },
      );
    }
    data.parentId = parentResolved?.parentId ?? null;
  }

  if (body.companyTeamId !== undefined) {
    let companyTeamId: string | null = body.companyTeamId
      ? String(body.companyTeamId).trim()
      : null;
    if (companyTeamId) {
      if (companyTeamId.startsWith("company:")) {
        companyTeamId = null;
      } else {
        const team = await prismaPrimary.team.findUnique({
          where: { id: companyTeamId },
          select: { id: true },
        });
        if (!team) {
          return NextResponse.json({ error: "Company not found." }, { status: 400 });
        }
      }
    }
    data.companyTeamId = companyTeamId;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const updated = await prismaPrimary.orgChartSection.update({
    where: { id },
    data,
    include: sectionInclude,
  });

  return NextResponse.json(serializeSection(updated));
}

export async function DELETE(req: Request) {
  const denied = await guardSuperAdmin();
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "Section id is required." }, { status: 400 });
  }

  const existing = await prismaPrimary.orgChartSection.findUnique({
    where: { id },
    include: {
      _count: { select: { memberships: true, children: true } },
      children: { select: { id: true, _count: { select: { memberships: true } } } },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Section not found." }, { status: 404 });
  }

  const childMemberCount = existing.children.reduce((sum, c) => sum + c._count.memberships, 0);
  await prismaPrimary.orgChartSection.delete({ where: { id } });
  return NextResponse.json({
    removed: id,
    removedMemberships: existing._count.memberships + childMemberCount,
    removedSubsections: existing._count.children,
  });
}
