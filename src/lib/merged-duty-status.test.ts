import { describe, expect, it } from "vitest";
import {
  dutyStatusFromLatestClockIn,
  philippineDayBounds,
} from "@/lib/merged-duty-status";

describe("philippineDayBounds", () => {
  it("returns Asia/Manila calendar day bounds", () => {
    // 2026-07-14 15:00 PHT = 2026-07-14 07:00 UTC
    const now = new Date("2026-07-14T07:00:00.000Z");
    const { start, endExclusive, ymd } = philippineDayBounds(now);
    expect(ymd).toBe("2026-07-14");
    expect(start.toISOString()).toBe("2026-07-13T16:00:00.000Z");
    expect(endExclusive.toISOString()).toBe("2026-07-14T16:00:00.000Z");
  });
});

describe("dutyStatusFromLatestClockIn", () => {
  const now = new Date("2026-07-14T07:00:00.000Z");

  it("is ON_DUTY when clock-in is today PHT", () => {
    expect(dutyStatusFromLatestClockIn(new Date("2026-07-14T01:30:00.000Z"), now)).toBe("ON_DUTY");
  });

  it("is OFFLINE when clock-in is yesterday", () => {
    expect(dutyStatusFromLatestClockIn(new Date("2026-07-13T10:00:00.000Z"), now)).toBe("OFFLINE");
  });

  it("is OFFLINE when missing", () => {
    expect(dutyStatusFromLatestClockIn(null, now)).toBe("OFFLINE");
  });
});
