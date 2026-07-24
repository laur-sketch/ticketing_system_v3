import { describe, expect, it } from "vitest";
import {
  approvalLevelsAllowOptional,
  canApproveTravelOrderNow,
  getCurrentApprovalLevel,
  getOperatorActionableApprovalLevel,
  getUnlockedIncompleteLevels,
  isApprovalHierarchySatisfied,
  isApprovalLevelUnlocked,
  normalizeApprovalLevelsForStore,
  parseApprovalLevels,
  type TravelOrderApprovalLevelStored,
} from "@/lib/travel-order";

function lvl(
  partial: Partial<TravelOrderApprovalLevelStored> & { level: number; agentId: string },
): TravelOrderApprovalLevelStored {
  return {
    approvedAt: null,
    approvedByAgentId: null,
    optional: false,
    ...partial,
  };
}

describe("optional approval levels", () => {
  it("allows optional config only for 3+ levels", () => {
    expect(approvalLevelsAllowOptional(2)).toBe(false);
    expect(approvalLevelsAllowOptional(3)).toBe(true);
    expect(
      normalizeApprovalLevelsForStore([
        { level: 1, agentId: "a", optional: true },
        { level: 2, agentId: "b", optional: true },
      ]).every((l) => !l.optional),
    ).toBe(true);
    expect(
      normalizeApprovalLevelsForStore([
        { level: 1, agentId: "a", optional: false },
        { level: 2, agentId: "b", optional: true },
        { level: 3, agentId: "c", optional: false },
      ])[1]?.optional,
    ).toBe(true);
  });

  it("parses optional from stored JSON", () => {
    const parsed = parseApprovalLevels([
      { level: 1, agentId: "a", optional: true },
      { level: 2, agentId: "b" },
    ]);
    expect(parsed[0]?.optional).toBe(true);
    expect(parsed[1]?.optional).toBe(false);
  });

  it("does not block later required levels behind an optional one", () => {
    const levels = [
      lvl({ level: 1, agentId: "a1", approvedAt: "2026-01-01T00:00:00.000Z" }),
      lvl({ level: 2, agentId: "a2", optional: true }),
      lvl({ level: 3, agentId: "a3" }),
    ];
    expect(isApprovalLevelUnlocked(levels, 2)).toBe(true);
    expect(isApprovalLevelUnlocked(levels, 3)).toBe(true);
    const unlocked = getUnlockedIncompleteLevels(levels);
    expect(unlocked.map((l) => l.level)).toEqual([2, 3]);
    expect(getCurrentApprovalLevel(levels)?.level).toBe(2);
    expect(canApproveTravelOrderNow("a2", { status: "SUBMITTED", approvalLevels: levels })).toBe(
      true,
    );
    expect(canApproveTravelOrderNow("a3", { status: "SUBMITTED", approvalLevels: levels })).toBe(
      true,
    );
  });

  it("completes the hierarchy when an optional level approves", () => {
    const levels = [
      lvl({ level: 1, agentId: "a1", approvedAt: "2026-01-01T00:00:00.000Z" }),
      lvl({
        level: 2,
        agentId: "a2",
        optional: true,
        approvedAt: "2026-01-02T00:00:00.000Z",
        approvedByAgentId: "a2",
      }),
      lvl({ level: 3, agentId: "a3" }),
      lvl({ level: 4, agentId: "a4", optional: true }),
    ];
    expect(isApprovalHierarchySatisfied(levels)).toBe(true);
    expect(getUnlockedIncompleteLevels(levels)).toEqual([]);
  });

  it("completes when all required levels approve without optionals", () => {
    const levels = [
      lvl({ level: 1, agentId: "a1", approvedAt: "2026-01-01T00:00:00.000Z" }),
      lvl({ level: 2, agentId: "a2", optional: true }),
      lvl({ level: 3, agentId: "a3", approvedAt: "2026-01-03T00:00:00.000Z" }),
    ];
    expect(isApprovalHierarchySatisfied(levels)).toBe(true);
  });

  it("keeps required levels sequential before unlock", () => {
    const levels = [
      lvl({ level: 1, agentId: "a1" }),
      lvl({ level: 2, agentId: "a2", optional: true }),
      lvl({ level: 3, agentId: "a3" }),
    ];
    expect(isApprovalLevelUnlocked(levels, 1)).toBe(true);
    expect(isApprovalLevelUnlocked(levels, 2)).toBe(false);
    expect(isApprovalLevelUnlocked(levels, 3)).toBe(false);
    expect(getOperatorActionableApprovalLevel(levels, "a2")).toBeNull();
    expect(getOperatorActionableApprovalLevel(levels, "a1")?.level).toBe(1);
  });
});
