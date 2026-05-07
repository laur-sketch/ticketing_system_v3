import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { parseIntakeScreenshotMeta } from "@/lib/ticket-intake-screenshots-meta";
import { ticketScreenshotsUploadDir } from "@/lib/ticket-intake-screenshots";
import { canAccessTicketScreenshot } from "@/lib/ticket-screenshot-access";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; file: string }> },
) {
  const session = await requireSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, file: fileParam } = await ctx.params;
  let storedFileName: string;
  try {
    storedFileName = path.basename(decodeURIComponent(fileParam));
  } catch {
    return NextResponse.json({ error: "Invalid file." }, { status: 400 });
  }
  if (!storedFileName || storedFileName.includes("..")) {
    return NextResponse.json({ error: "Invalid file." }, { status: 400 });
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: {
      contactEmail: true,
      requestorEmail: true,
      assignedAgentId: true,
      intakeScreenshotMeta: true,
    },
  });
  if (!ticket) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await canAccessTicketScreenshot(session, ticket))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const meta = parseIntakeScreenshotMeta(ticket.intakeScreenshotMeta);
  const item = meta.find((m) => m.storedFileName === storedFileName);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const diskPath = path.join(ticketScreenshotsUploadDir(id), storedFileName);

  try {
    const buf = await readFile(diskPath);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": item.mimeType || "image/jpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "File missing." }, { status: 404 });
  }
}
