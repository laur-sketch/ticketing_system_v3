import { describe, expect, it } from "vitest";
import {
  isValidPersonnelAssignmentColor,
  normalizePersonnelAssignmentColor,
  personnelAssignmentHex,
  personnelAssigneeHighlightStyleFromKey,
} from "@/lib/personnel-assignment-colors";

describe("personnel assignment color hex input", () => {
  it("normalizes hex and legacy named keys", () => {
    expect(normalizePersonnelAssignmentColor("#FF5733")).toBe("#ff5733");
    expect(normalizePersonnelAssignmentColor("f00")).toBe("#ff0000");
    expect(normalizePersonnelAssignmentColor("#abc")).toBe("#aabbcc");
    expect(normalizePersonnelAssignmentColor("RED")).toBe("#e53935");
    expect(normalizePersonnelAssignmentColor("")).toBeNull();
    expect(normalizePersonnelAssignmentColor("not-a-color")).toBeNull();
  });

  it("validates empty as clear and rejects junk", () => {
    expect(isValidPersonnelAssignmentColor("")).toBe(true);
    expect(isValidPersonnelAssignmentColor("#12")).toBe(false);
    expect(isValidPersonnelAssignmentColor("#123456")).toBe(true);
  });

  it("resolves display hex and highlight styles for free-form colors", () => {
    expect(personnelAssignmentHex("#4b8eff")).toBe("#4b8eff");
    expect(personnelAssignmentHex("BLUE")).toBe("#4b8eff");
    expect(personnelAssigneeHighlightStyleFromKey("#ff5733")).toBeTruthy();
    expect(personnelAssigneeHighlightStyleFromKey(null)).toBeUndefined();
  });
});
