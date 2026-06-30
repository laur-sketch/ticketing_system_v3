import { describe, expect, it } from "vitest";
import {
  SESSION_IDLE_MAX_AGE_SECONDS,
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
  it("uses midnight expiry for SuperAdmin and Admin", () => {
    const now = Math.floor(new Date("2026-06-17T07:00:00.000Z").getTime() / 1000);
    expect(computeSessionExpiresAt({ role: "SuperAdmin", nowUnixSeconds: now, isNewLogin: true })).toBe(
      nextMidnightUnixSeconds(now),
    );
    expect(computeSessionExpiresAt({ role: "Admin", nowUnixSeconds: now, isNewLogin: true })).toBe(
      nextMidnightUnixSeconds(now),
    );
  });

  it("keeps idle timeout for Personnel", () => {
    const now = 1_700_000_000;
    expect(computeSessionExpiresAt({ role: "Personnel", nowUnixSeconds: now, isNewLogin: true })).toBe(
      now + SESSION_IDLE_MAX_AGE_SECONDS,
    );
  });

  it("preserves existing admin expiry until midnight passes", () => {
    const now = 1_700_000_000;
    const existing = now + 3600;
    expect(
      computeSessionExpiresAt({
        role: "Admin",
        nowUnixSeconds: now,
        existingSessionExpiresAt: existing,
        isNewLogin: false,
      }),
    ).toBe(existing);
  });
});
