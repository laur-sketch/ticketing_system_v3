import { randomUUID } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import {
  MAX_FAQ_FILE_BYTES,
  guessFaqPresentationExt,
  isAllowedHttpUrl,
  isFaqStoredFileName,
  isPresentationMime,
  resolveFaqPresentationMime,
  type FaqFileMeta,
} from "@/lib/faq";

export function faqUploadDir(): string {
  return path.join(process.cwd(), "uploads", "faq");
}

export function faqStoredFilePath(storedFileName: string): string | null {
  if (!isFaqStoredFileName(storedFileName)) return null;
  return path.join(faqUploadDir(), storedFileName);
}

export async function persistFaqPresentation(file: File): Promise<FaqFileMeta | { error: string }> {
  if (file.size <= 0) {
    return { error: "Empty files cannot be uploaded." };
  }
  if (file.size > MAX_FAQ_FILE_BYTES) {
    return { error: "Presentations must be at most 25MB." };
  }
  const mimeType = resolveFaqPresentationMime(file);
  if (!isPresentationMime(mimeType, file.name)) {
    return { error: "Upload a PDF, PowerPoint, or OpenDocument presentation." };
  }
  const ext = guessFaqPresentationExt(mimeType, file.name);
  const storedFileName = `${randomUUID()}${ext}`;
  const dir = faqUploadDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, storedFileName), Buffer.from(await file.arrayBuffer()));
  return {
    storedFileName,
    originalName: file.name.slice(0, 200) || storedFileName,
    mimeType,
    size: file.size,
    uploadedAt: new Date().toISOString(),
  };
}

export async function removeFaqFile(storedFileName: string | null | undefined): Promise<void> {
  const fullPath = storedFileName ? faqStoredFilePath(storedFileName) : null;
  if (!fullPath) return;
  try {
    await unlink(fullPath);
  } catch {
    /* already gone */
  }
}

export function validateFaqUrl(url: string, required: boolean): string | null {
  const trimmed = url.trim();
  if (!trimmed) {
    return required ? "A URL is required." : null;
  }
  if (!isAllowedHttpUrl(trimmed)) {
    return "Enter a valid http(s) URL.";
  }
  return null;
}
