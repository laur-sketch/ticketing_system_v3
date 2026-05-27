import { describe, expect, it } from "vitest";
import {
  getArchivedTaskScreenshots,
  getPillarScreenshots,
  normalizeSubKpis,
  removePillarScreenshot,
  removeSubKpiItemScreenshot,
  resetAllSubKpiDone,
} from "@/lib/kpi-subkpis";

const screenshot = {
  storedFileName: "proof-1.png",
  originalName: "proof.png",
  mimeType: "image/png" as const,
  size: 1234,
  uploadedAt: "2026-05-26T00:00:00.000Z",
};

describe("KPI task screenshots", () => {
  it("archives uploaded screenshots and clears active slots when recurring tasks reset", () => {
    const reset = resetAllSubKpiDone({
      segmented: false,
      items: [
        {
          id: "sub-1",
          title: "Daily check",
          done: true,
          screenshotsEnabled: true,
          beforeScreenshot: [screenshot],
          afterScreenshot: [{ ...screenshot, storedFileName: "proof-2.png" }],
        },
      ],
      pillarScreenshotsEnabled: true,
      pillarBeforeScreenshot: [screenshot],
    });

    const normalized = normalizeSubKpis(reset);
    expect(normalized.segmented).toBe(false);
    if (normalized.segmented) throw new Error("Expected flat sub-task list");
    const [item] = normalized.flat;

    expect(item.done).toBe(false);
    expect(item.beforeScreenshot).toBeUndefined();
    expect(item.afterScreenshot).toBeUndefined();
    expect(getPillarScreenshots(reset, "before")).toEqual([]);

    const [archive] = getArchivedTaskScreenshots(reset);
    expect(archive?.subTasks[0]?.beforeScreenshot?.[0]?.storedFileName).toBe("proof-1.png");
    expect(archive?.subTasks[0]?.afterScreenshot?.[0]?.storedFileName).toBe("proof-2.png");
    expect(archive?.pillarBeforeScreenshot?.[0]?.storedFileName).toBe("proof-1.png");
  });

  it("removes a selected sub-task screenshot without clearing the other slot", () => {
    const updated = removeSubKpiItemScreenshot(
      {
        segmented: false,
        items: [
          {
            id: "sub-1",
            title: "Daily check",
            screenshotsEnabled: true,
            beforeScreenshot: [screenshot, { ...screenshot, storedFileName: "proof-keep.png" }],
            afterScreenshot: [{ ...screenshot, storedFileName: "proof-after.png" }],
          },
        ],
      },
      "sub-1",
      "before",
      "proof-1.png",
    );

    const normalized = normalizeSubKpis(updated);
    const item = normalized.segmented ? null : normalized.flat[0];

    expect(item?.beforeScreenshot?.map((m) => m.storedFileName)).toEqual(["proof-keep.png"]);
    expect(item?.afterScreenshot?.map((m) => m.storedFileName)).toEqual(["proof-after.png"]);
  });

  it("removes a selected pillar screenshot", () => {
    const updated = removePillarScreenshot(
      {
        segmented: false,
        items: [],
        pillarScreenshotsEnabled: true,
        pillarBeforeScreenshot: [screenshot, { ...screenshot, storedFileName: "proof-keep.png" }],
      },
      "before",
      "proof-1.png",
    );

    expect(getPillarScreenshots(updated, "before").map((m) => m.storedFileName)).toEqual(["proof-keep.png"]);
  });
});
