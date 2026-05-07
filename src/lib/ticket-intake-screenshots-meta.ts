/**
 * Types + parsing for persisted screenshot metadata (no Node builtins — safe for client bundles).
 */
export type IntakeScreenshotMetaItem = {
  storedFileName: string;
  originalName: string;
  mimeType: string;
  size: number;
};

function isSafeStoredFileName(name: string): boolean {
  if (!name || name.includes("..")) return false;
  return !name.includes("/") && !name.includes("\\");
}

export function parseIntakeScreenshotMeta(raw: unknown): IntakeScreenshotMetaItem[] {
  if (!raw || !Array.isArray(raw)) return [];
  const out: IntakeScreenshotMetaItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const storedFileName = typeof o.storedFileName === "string" ? o.storedFileName : "";
    if (!storedFileName || !isSafeStoredFileName(storedFileName)) {
      continue;
    }
    out.push({
      storedFileName,
      originalName: typeof o.originalName === "string" ? o.originalName : storedFileName,
      mimeType: typeof o.mimeType === "string" ? o.mimeType : "image/jpeg",
      size: typeof o.size === "number" ? o.size : 0,
    });
  }
  return out;
}
