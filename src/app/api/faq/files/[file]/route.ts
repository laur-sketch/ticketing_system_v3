import { createReadStream, existsSync } from "fs";
import path from "path";
import { Readable } from "stream";
import { NextResponse } from "next/server";
import { isFaqStoredFileName } from "@/lib/faq";
import { loadFaqCatalog } from "@/lib/faq-store";
import { faqStoredFilePath } from "@/lib/faq-uploads";

function guessMimeFromStoredName(storedFileName: string): string {
  const lower = storedFileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".pptx"))
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (lower.endsWith(".ppt")) return "application/vnd.ms-powerpoint";
  if (lower.endsWith(".odp")) return "application/vnd.oasis.opendocument.presentation";
  return "application/octet-stream";
}

/** Public FAQ presentation download / inline view. */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ file: string }> },
) {
  const { file } = await ctx.params;
  const storedFileName = path.basename(file);
  if (!storedFileName || storedFileName !== file || !isFaqStoredFileName(storedFileName)) {
    return NextResponse.json({ error: "Invalid file name." }, { status: 400 });
  }

  const catalog = await loadFaqCatalog();
  const item = catalog.items.find((row) => row.file?.storedFileName === storedFileName);
  if (!item?.file) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  const fullPath = faqStoredFilePath(storedFileName);
  if (!fullPath || !existsSync(fullPath)) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  const mimeType = item.file.mimeType || guessMimeFromStoredName(storedFileName);
  const originalName = item.file.originalName || storedFileName;
  const safeDownloadName = originalName.replace(/"/g, "").slice(0, 180) || storedFileName;
  const inline = mimeType === "application/pdf" && !new URL(req.url).searchParams.has("download");

  const stream = createReadStream(fullPath);
  const webStream = Readable.toWeb(stream) as unknown as ReadableStream;
  return new NextResponse(webStream, {
    headers: {
      "Content-Type": mimeType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeDownloadName}"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
