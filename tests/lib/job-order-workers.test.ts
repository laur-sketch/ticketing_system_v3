import { describe, expect, it } from "vitest";
import {
  applyJobOrderWorkerAgentIds,
  completeJobOrderApprovalStep,
  currentJobOrderStepBoardAssigneeId,
  defaultJobOrderApprovalMeta,
  parseJobOrderWorkerAgentIds,
  isJobOrderAwaitingExecutionAssignee,
  markJobOrderExecutionAssigned,
  canMarkJobOrderDone,
} from "@/lib/job-order-approval";
import {
  isJobOrderExecutionMember,
  jobOrderKpiCreditAgentIds,
} from "@/lib/job-order-workers";

describe("job order workers", () => {
  it("stores co-workers separately from the execution assignee", () => {
    const meta = applyJobOrderWorkerAgentIds(
      defaultJobOrderApprovalMeta(),
      ["worker-1", "assignee-1", "worker-1"],
      "assignee-1",
    );
    expect(parseJobOrderWorkerAgentIds(meta)).toEqual(["worker-1"]);
  });

  it("credits assignee and listed co-workers", () => {
    const meta = applyJobOrderWorkerAgentIds(defaultJobOrderApprovalMeta(), ["worker-1"], "assignee-1");
    expect(
      jobOrderKpiCreditAgentIds({
        meta,
        ticketAssignedAgentId: "assignee-1",
        linkedProjectAssigneeId: null,
      }).sort(),
    ).toEqual(["assignee-1", "worker-1"]);
  });

  it("treats ticket assignee as execution member", () => {
    expect(
      isJobOrderExecutionMember({
        agentId: "assignee-1",
        meta: defaultJobOrderApprovalMeta(),
        ticketAssignedAgentId: "assignee-1",
        linkedProjectAssigneeId: null,
      }),
    ).toBe(true);
  });

  it("treats linked project assignee as execution member", () => {
    expect(
      isJobOrderExecutionMember({
        agentId: "project-assignee",
        meta: defaultJobOrderApprovalMeta(),
        ticketAssignedAgentId: null,
        linkedProjectAssigneeId: "project-assignee",
      }),
    ).toBe(true);
  });

  it("returns no board assignee when approval is DONE (icon should clear)", () => {
    let meta = defaultJobOrderApprovalMeta();
    meta = { ...meta, proceduralStep: "APPROVED_BY_2", approvedBy2AgentId: "approver-2" };
    const done = completeJobOrderApprovalStep(meta);
    expect(done.proceduralStep).toBe("DONE");
    expect(currentJobOrderStepBoardAssigneeId(done)).toBeNull();
  });

  it("awaits execution assignee until explicitly marked", () => {
    let meta = defaultJobOrderApprovalMeta();
    meta = { ...meta, proceduralStep: "DONE" };
    expect(isJobOrderAwaitingExecutionAssignee(meta)).toBe(true);
    meta = markJobOrderExecutionAssigned(meta);
    expect(isJobOrderAwaitingExecutionAssignee(meta)).toBe(false);
  });

  it("allows execution assignee or admin to mark job done", () => {
    let meta = defaultJobOrderApprovalMeta();
    meta = completeJobOrderApprovalStep(
      completeJobOrderApprovalStep(completeJobOrderApprovalStep(meta)),
    );
    meta = markJobOrderExecutionAssigned(meta);
    expect(
      canMarkJobOrderDone({
        meta,
        ticketStatus: "IN_PROGRESS",
        ticketAssignedAgentId: "assignee-1",
        actorAgentId: "assignee-1",
        isAdmin: false,
      }).ok,
    ).toBe(true);
    expect(
      canMarkJobOrderDone({
        meta,
        ticketStatus: "IN_PROGRESS",
        ticketAssignedAgentId: "assignee-1",
        actorAgentId: "other",
        isAdmin: true,
      }).ok,
    ).toBe(true);
    expect(
      canMarkJobOrderDone({
        meta,
        ticketStatus: "IN_PROGRESS",
        ticketAssignedAgentId: "assignee-1",
        actorAgentId: "other",
        isAdmin: false,
      }).ok,
    ).toBe(false);
    expect(
      canMarkJobOrderDone({
        meta,
        ticketStatus: "FOR_CONFIRMATION",
        ticketAssignedAgentId: "assignee-1",
        actorAgentId: "assignee-1",
        isAdmin: false,
      }).ok,
    ).toBe(false);
  });
});
