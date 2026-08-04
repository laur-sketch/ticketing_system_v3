/**
 * Types + parsing for persisted screenshot metadata (no Node builtins — safe for client bundles).
 */
export type IntakeScreenshotMetaItem = {
  storedFileName: string;
  originalName: string;
  mimeType: string;
  size: number;
};

export function isIntakeAttachmentImage(item: Pick<IntakeScreenshotMetaItem, "mimeType" | "originalName">): boolean {
  const mime = (item.mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp|heic|heif)$/i.test(item.originalName || "");
}

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
      mimeType: typeof o.mimeType === "string" ? o.mimeType : "application/octet-stream",
      size: typeof o.size === "number" ? o.size : 0,
    });
  }
  return out;
}
