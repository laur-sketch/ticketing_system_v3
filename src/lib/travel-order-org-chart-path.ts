import { orgChartLayerById } from "@/app/admin/superadmin-settings/org-chart-layers";
import {
  resolveMergedSourceUserIdForAgent,
} from "@/lib/approval-position-resolver";
import { loadHrisAssignableStaff } from "@/lib/hris-staff-roster";
import { prisma } from "@/lib/prisma";
import {
  buildTravelOrderRecommendedPath,
  TRAVEL_ORDER_APPROVAL_TOP_ORG_LAYER,
  type TravelOrderOrgChartAncestor,
  type TravelOrderOrgChartPathSeat,
} from "@/lib/travel-order";

export type TravelOrderOrgChartApprovalPath = {
  requestorAgentId: string;
  requestorOrgLayer: number | null;
  seats: TravelOrderOrgChartPathSeat[];
};

/**
 * Walk the org chart from the requestor up to Layer 2 and build the recommended
 * travel-order approval path (personnel + required/optional per layer).
 * Either/or peer links expand each seat so any linked person may approve.
 */
export async function resolveTravelOrderOrgChartApprovalPath(
  requestorAgentId: string,
): Promise<TravelOrderOrgChartApprovalPath> {
  const agentId = requestorAgentId.trim();
  if (!agentId) {
    return { requestorAgentId: "", requestorOrgLayer: null, seats: [] };
  }

  const [mergedSourceUserId, orgNodes, eitherOrLinks, staff] = await Promise.all([
    resolveMergedSourceUserIdForAgent(agentId),
    prisma.orgChartNode.findMany({
      select: {
        id: true,
        parentId: true,
        parentEitherOrLinkId: true,
        mergedSourceUserId: true,
        personName: true,
      },
    }),
    prisma.orgChartEitherOrLink.findMany({
      select: { id: true, nodeAId: true, nodeBId: true },
    }),
    loadHrisAssignableStaff({}),
  ]);

  const layerByNodeId = orgChartLayerById(orgNodes);
  const nodeById = new Map(orgNodes.map((n) => [n.id, n]));
  const nodeByMergedId = new Map(orgNodes.map((n) => [n.mergedSourceUserId, n]));
  const agentByMergedId = new Map(
    staff
      .filter((s) => s.mergedSourceUserId)
      .map((s) => [s.mergedSourceUserId, s] as const),
  );

  const peersByNodeId = new Map<string, string[]>();
  const linkById = new Map(eitherOrLinks.map((l) => [l.id, l]));
  for (const link of eitherOrLinks) {
    const a = peersByNodeId.get(link.nodeAId) ?? [];
    a.push(link.nodeBId);
    peersByNodeId.set(link.nodeAId, a);
    const b = peersByNodeId.get(link.nodeBId) ?? [];
    b.push(link.nodeAId);
    peersByNodeId.set(link.nodeBId, b);
  }

  function resolvePerson(mergedSourceUserId: string, personName: string) {
    const staffRow = agentByMergedId.get(mergedSourceUserId);
    return {
      agentId: staffRow?.agentId ?? null,
      agentName: staffRow?.name ?? personName,
      mergedSourceUserId,
    };
  }

  function alternateAgentsFor(nodeId: string, onlyPeerIds?: Set<string>) {
    const peerIds = peersByNodeId.get(nodeId) ?? [];
    const out: TravelOrderOrgChartAncestor["alternateAgents"] = [];
    const seen = new Set<string>();
    for (const peerId of peerIds) {
      if (onlyPeerIds && !onlyPeerIds.has(peerId)) continue;
      const peer = nodeById.get(peerId);
      if (!peer || seen.has(peer.mergedSourceUserId)) continue;
      seen.add(peer.mergedSourceUserId);
      out!.push(resolvePerson(peer.mergedSourceUserId, peer.personName));
    }
    return out ?? [];
  }

  const requestorNode = mergedSourceUserId
    ? nodeByMergedId.get(mergedSourceUserId)
    : undefined;
  const requestorOrgLayer = requestorNode
    ? (layerByNodeId.get(requestorNode.id) ?? null)
    : null;

  const ancestors: TravelOrderOrgChartAncestor[] = [];
  if (requestorNode?.parentId) {
    let currentId: string | null = requestorNode.parentId;
    const visiting = new Set<string>();
    let isFirstHop = true;
    while (currentId && !visiting.has(currentId)) {
      visiting.add(currentId);
      const node = nodeById.get(currentId);
      if (!node) break;
      const layer = layerByNodeId.get(node.id) ?? 1;
      if (layer < TRAVEL_ORDER_APPROVAL_TOP_ORG_LAYER) break;
      const primary = resolvePerson(node.mergedSourceUserId, node.personName);
      let onlyPeers: Set<string> | undefined;
      if (isFirstHop && requestorNode.parentEitherOrLinkId) {
        const shared = linkById.get(requestorNode.parentEitherOrLinkId);
        if (shared) {
          onlyPeers = new Set(
            [shared.nodeAId, shared.nodeBId].filter((id) => id !== node.id),
          );
        }
      }
      ancestors.push({
        orgChartLayer: layer,
        agentId: primary.agentId,
        agentName: primary.agentName,
        mergedSourceUserId: primary.mergedSourceUserId,
        alternateAgents: alternateAgentsFor(node.id, onlyPeers).filter(
          (a) => a.mergedSourceUserId !== primary.mergedSourceUserId,
        ),
      });
      if (layer <= TRAVEL_ORDER_APPROVAL_TOP_ORG_LAYER) break;
      currentId = node.parentId;
      isFirstHop = false;
    }
  }

  return {
    requestorAgentId: agentId,
    requestorOrgLayer,
    seats: buildTravelOrderRecommendedPath({
      requestorOrgLayer,
      ancestors,
    }),
  };
}
