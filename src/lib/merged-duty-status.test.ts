import { describe, expect, it } from "vitest";
import {
  dutyStatusFromLatestClockIn,
  formatClockInLocalTime,
  mysqlDatetimeAppZoneYmd,
  philippineDayBounds,
  philippineMysqlDayBounds,
} from "@/lib/merged-duty-status";

describe("philippineDayBounds", () => {
  it("returns Asia/Taipei calendar day bounds as real UTC instants", () => {
    // 2026-07-14 15:00 GMT+8 = 2026-07-14 07:00 UTC
    const now = new Date("2026-07-14T07:00:00.000Z");
    const { start, endExclusive, ymd } = philippineDayBounds(now, "Asia/Taipei");
    expect(ymd).toBe("2026-07-14");
    expect(start.toISOString()).toBe("2026-07-13T16:00:00.000Z");
    expect(endExclusive.toISOString()).toBe("2026-07-14T16:00:00.000Z");
  });
});

describe("philippineMysqlDayBounds", () => {
  it("returns UTC DATETIME strings covering the Asia/Taipei calendar day", () => {
    const now = new Date("2026-07-14T07:00:00.000Z"); // 15:00 GMT+8
    const { start, endExclusive, ymd } = philippineMysqlDayBounds(now, "Asia/Taipei");
    expect(ymd).toBe("2026-07-14");
    // Taipei midnight = previous day 16:00 UTC
    expect(start).toBe("2026-07-13 16:00:00");
    expect(endExclusive).toBe("2026-07-14 16:00:00");
  });
});

describe("dutyStatusFromLatestClockIn", () => {
  // "now" is a real UTC instant (15:00 GMT+8 on Jul 14).
  const now = new Date("2026-07-14T07:00:00.000Z");

  it("is ON_DUTY for early morning local (stored as prior-evening UTC)", () => {
    // 07:59 Taipei = 23:59 previous day UTC
    expect(dutyStatusFromLatestClockIn(new Date("2026-07-13T23:59:00.000Z"), now, "Asia/Taipei")).toBe(
      "ON_DUTY",
    );
  });

  it("is ON_DUTY for 08:29 local (stored as 00:29 UTC)", () => {
    expect(dutyStatusFromLatestClockIn(new Date("2026-07-14T00:29:00.000Z"), now, "Asia/Taipei")).toBe(
      "ON_DUTY",
    );
  });

  it("is OFFLINE for previous Taipei calendar day", () => {
    // 15:00 previous Taipei day = 07:00 previous UTC day
    expect(dutyStatusFromLatestClockIn(new Date("2026-07-13T07:00:00.000Z"), now, "Asia/Taipei")).toBe(
      "OFFLINE",
    );
  });

  it("is OFFLINE when missing", () => {
    expect(dutyStatusFromLatestClockIn(null, now, "Asia/Taipei")).toBe("OFFLINE");
  });
});

describe("formatClockInLocalTime", () => {
  it("shows GMT+8 wall time for a UTC-stored clock-in", () => {
    // 00:29 UTC → 08:29 Taipei
    const text = formatClockInLocalTime(new Date("2026-07-14T00:29:54.000Z"), "Asia/Taipei");
    expect(text).toMatch(/8:29/);
  });
});

describe("mysqlDatetimeAppZoneYmd", () => {
  it("maps UTC-stored DATETIME onto the Asia/Taipei calendar day", () => {
    expect(mysqlDatetimeAppZoneYmd(new Date("2026-07-13T23:59:00.000Z"), "Asia/Taipei")).toBe(
      "2026-07-14",
    );
    expect(mysqlDatetimeAppZoneYmd(new Date("2026-07-14T00:29:00.000Z"), "Asia/Taipei")).toBe(
      "2026-07-14",
    );
  });
});
