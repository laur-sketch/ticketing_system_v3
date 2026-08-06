import { describe, expect, it } from "vitest";
import {
  kpiChecklistProgress,
  progressWithInvertedRecording,
  setInvertedRecording,
  taskUsesInvertedRecording,
} from "@/lib/kpi-subkpis";

describe("inverted recording", () => {
  it("treats unchecked items as 100% and lowers percent when checked", () => {
    const raw = setInvertedRecording(
      {
        segmented: false,
        items: [
          { id: "a", title: "Incident A", done: false },
          { id: "b", title: "Incident B", done: false },
          { id: "c", title: "Incident C", done: false },
        ],
      },
      true,
    );
    expect(taskUsesInvertedRecording({ title: "Network", subKpis: raw })).toBe(true);

    const clear = kpiChecklistProgress(raw, "Network");
    expect(progressWithInvertedRecording(clear, true).percent).toBe(100);

    const withFlags = setInvertedRecording(
      {
        segmented: false,
        items: [
          { id: "a", title: "Incident A", done: true },
          { id: "b", title: "Incident B", done: false },
          { id: "c", title: "Incident C", done: true },
        ],
      },
      true,
    );
    const flagged = kpiChecklistProgress(withFlags, "Network");
    expect(progressWithInvertedRecording(flagged, true).percent).toBe(33);
  });
});
