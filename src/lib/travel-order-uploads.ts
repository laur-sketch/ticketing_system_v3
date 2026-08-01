import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { MAX_TASK_SCREENSHOT_BYTES } from "@/lib/task-screenshot-constants";
import type { TaskScreenshotMetaItem } from "@/lib/task-screenshot-meta";
import { validateTaskScreenshotFile } from "@/lib/task-screenshots";

export function travelOrderUploadDir(kpiId: string, travelOrderId: string): string {
  return path.join(process.cwd(), "uploads", "kpi-maintenance", kpiId, "travel-order", travelOrderId);
}

export async function persistTravelOrderImage(
  kpiId: string,
  travelOrderId: string,
  file: File,
): Promise<TaskScreenshotMetaItem | { error: string }> {
  const validated = validateTaskScreenshotFile(file);
  if (!validated.ok) return { error: validated.error };
  if (file.size > MAX_TASK_SCREENSHOT_BYTES) {
    return { error: "Images must not exceed 10MB." };
  }
  const type = (file.type || "").toLowerCase();
  const mimeType: "image/jpeg" | "image/png" =
    type === "image/png" || /\.png$/i.test(file.name) ? "image/png" : "image/jpeg";
  const ext = mimeType === "image/png" ? ".png" : ".jpg";
  const storedFileName = `${randomUUID()}${ext}`;
  const dir = travelOrderUploadDir(kpiId, travelOrderId);
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
