import { NextResponse } from "next/server";
import { createReadStream, existsSync } from "fs";
import path from "path";
import { Readable } from "stream";
import { requireRole } from "@/lib/access";
import { travelOrderExistsForKpi } from "@/lib/travel-order-db";
import { travelOrderUploadDir } from "@/lib/travel-order-uploads";

/** GET image attachment for a travel order location. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; travelOrderId: string; file: string }> },
) {
  const { session, unauthorized } = await requireRole(["Admin", "Personnel"]);
  if (unauthorized || !session) return unauthorized;
  const { id, travelOrderId, file } = await ctx.params;
  const storedFileName = path.basename(file);
  if (!storedFileName || storedFileName !== file) {
    return NextResponse.json({ error: "Invalid file name." }, { status: 400 });
  }

  const exists = await travelOrderExistsForKpi(travelOrderId, id);
  if (!exists) return NextResponse.json({ error: "Travel order not found." }, { status: 404 });

  const fullPath = path.join(travelOrderUploadDir(id, travelOrderId), storedFileName);
  if (!existsSync(fullPath)) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  const stream = createReadStream(fullPath);
  const webStream = Readable.toWeb(stream) as unknown as ReadableStream;
  const mime = storedFileName.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  return new NextResponse(webStream, {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
