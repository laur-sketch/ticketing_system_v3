import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { MAX_SCREENSHOT_BYTES, MAX_SCREENSHOT_COUNT } from "./ticket-intake-screenshots-constants";
import type { IntakeScreenshotMetaItem } from "./ticket-intake-screenshots-meta";

function isProbablyImageFile(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  if (t.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp|heic|heif)$/i.test(file.name);
}

export function validateScreenshotFiles(
  files: File[],
): { ok: true } | { ok: false; error: string } {
  if (files.length > MAX_SCREENSHOT_COUNT) {
    return { ok: false, error: `You can attach at most ${MAX_SCREENSHOT_COUNT} screenshots.` };
  }
  for (const f of files) {
    if (f.size > MAX_SCREENSHOT_BYTES) {
      return { ok: false, error: "Each screenshot must be at most 5MB." };
    }
    if (f.size > 0 && !isProbablyImageFile(f)) {
      return { ok: false, error: "Only image files are allowed for screenshots." };
    }
  }
  return { ok: true };
}

function guessExt(mime: string, fallbackName: string): string {
  const fromName = path.extname(fallbackName);
  if (fromName && fromName.length <= 8) return fromName;
  const t = mime.toLowerCase();
  if (t.includes("png")) return ".png";
  if (t.includes("jpeg") || t.includes("jpg")) return ".jpg";
  if (t.includes("gif")) return ".gif";
  if (t.includes("webp")) return ".webp";
  return ".img";
}

export function ticketScreenshotsUploadDir(ticketId: string): string {
  return path.join(process.cwd(), "uploads", "tickets", ticketId);
}

export async function persistTicketScreenshots(
  ticketId: string,
  files: File[],
): Promise<IntakeScreenshotMetaItem[]> {
  const nonEmpty = files.filter((f) => f.size > 0);
  if (nonEmpty.length === 0) return [];
  const dir = ticketScreenshotsUploadDir(ticketId);
  await mkdir(dir, { recursive: true });
  const meta: IntakeScreenshotMetaItem[] = [];
  for (const file of nonEmpty) {
    const ext = guessExt(file.type, file.name);
    const storedFileName = `${randomUUID()}${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(dir, storedFileName), buf);
    meta.push({
      storedFileName,
      originalName: file.name.slice(0, 200) || storedFileName,
      mimeType: file.type && file.type.startsWith("image/") ? file.type : "image/jpeg",
      size: file.size,
    });
  }
  return meta;
}
