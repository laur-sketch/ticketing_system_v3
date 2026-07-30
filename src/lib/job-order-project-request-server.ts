/** Server-only: fulfill pending Job Order Task Project requests. */

import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/ticket-actions";
import {
  JO_PROJECT_REQUEST_CANCELLED_SUMMARY,
  JO_PROJECT_REQUEST_FULFILLED_SUMMARY,
  JO_PROJECT_REQUESTED_SUMMARY,
  jobOrderProjectRequestPendingFromActivities,
} from "@/lib/job-order-project-request";

/** If a Task Project request is pending on this JO, mark it fulfilled. */
export async function fulfillPendingJobOrderProjectRequest(opts: {
  ticketId: string;
  actor: "AGENT" | "SYSTEM";
  projectDisplayName?: string | null;
}): Promise<boolean> {
  const rows = await prisma.ticketActivity.findMany({
    where: {
      ticketId: opts.ticketId,
      summary: {
        in: [
          JO_PROJECT_REQUESTED_SUMMARY,
          JO_PROJECT_REQUEST_FULFILLED_SUMMARY,
          JO_PROJECT_REQUEST_CANCELLED_SUMMARY,
        ],
      },
    },
    orderBy: { createdAt: "asc" },
    select: { summary: true, detail: true },
  });
  const { pending } = jobOrderProjectRequestPendingFromActivities(rows);
  if (!pending) return false;
  const detail = opts.projectDisplayName?.trim()
    ? `Task Board project “${opts.projectDisplayName.trim()}” created.`
    : "Task Board project linked.";
  await logActivity(opts.ticketId, opts.actor, JO_PROJECT_REQUEST_FULFILLED_SUMMARY, detail);
  return true;
}
