import { describe, expect, it } from "vitest";
import {
  computeSessionExpiresAt,
  nextMidnightUnixSeconds,
} from "@/lib/session-expiry-policy";

describe("nextMidnightUnixSeconds", () => {
  it("returns start of next calendar day in Asia/Manila", () => {
    // 2026-06-17 15:00 Manila = 2026-06-17 07:00 UTC
    const now = Math.floor(new Date("2026-06-17T07:00:00.000Z").getTime() / 1000);
    const midnight = nextMidnightUnixSeconds(now, "Asia/Manila");
    expect(new Date(midnight * 1000).toISOString()).toBe("2026-06-17T16:00:00.000Z");
  });
});

describe("computeSessionExpiresAt", () => {
  it("uses midnight expiry for every role", () => {
    const now = Math.floor(new Date("2026-06-17T07:00:00.000Z").getTime() / 1000);
    const midnight = nextMidnightUnixSeconds(now);
    for (const role of ["SuperAdmin", "Admin", "Personnel", "Customer"] as const) {
      expect(computeSessionExpiresAt({ role, nowUnixSeconds: now, isNewLogin: true })).toBe(midnight);
    }
  });

  it("always pins to next midnight even when an older idle expiry exists", () => {
    const now = Math.floor(new Date("2026-06-17T07:00:00.000Z").getTime() / 1000);
    const idleExpiry = now + 1800;
    expect(
      computeSessionExpiresAt({
        role: "Personnel",
        nowUnixSeconds: now,
        existingSessionExpiresAt: idleExpiry,
        isNewLogin: false,
      }),
    ).toBe(nextMidnightUnixSeconds(now));
  });
});
