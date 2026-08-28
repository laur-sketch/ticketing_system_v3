import { NextResponse } from "next/server";
import { requireSession } from "@/lib/access";
import { ACTIVE_REQUEST_STATUSES } from "@/lib/active-request-statuses";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/ticket-actions";
import {
  persistTicketScreenshots,
  validateScreenshotFiles,
} from "@/lib/ticket-intake-screenshots";
import { MAX_SCREENSHOT_COUNT } from "@/lib/ticket-intake-screenshots-constants";
import { parseIntakeScreenshotMeta } from "@/lib/ticket-intake-screenshots-meta";
import { canAccessTicketScreenshot } from "@/lib/ticket-screenshot-access";

/**
 * POST /api/tickets/:id/screenshots
 * Append images/documents to a running (non-CLOSED) request.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      contactEmail: true,
      requestorEmail: true,
      assignedAgentId: true,
      teamId: true,
      intakeScreenshotMeta: true,
      ticketNumber: true,
    },
  });
  if (!ticket) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await canAccessTicketScreenshot(session, ticket))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!ACTIVE_REQUEST_STATUSES.includes(ticket.status)) {
    return NextResponse.json(
      { error: "Attachments can only be added while the request is still open (not closed)." },
      { status: 400 },
    );
  }

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Expected multipart form data with screenshots." },
      { status: 400 },
    );
  }

  const form = await req.formData();
  const files: File[] = [];
  for (const key of ["screenshots", "screenshot", "attachments", "attachment", "files", "file"]) {
    for (const value of form.getAll(key)) {
      if (value instanceof File && value.size > 0) files.push(value);
    }
  }

  if (files.length === 0) {
    return NextResponse.json({ error: "Add at least one file." }, { status: 400 });
  }

  const existing = parseIntakeScreenshotMeta(ticket.intakeScreenshotMeta);
  const remaining = MAX_SCREENSHOT_COUNT - existing.length;
  if (remaining <= 0) {
    return NextResponse.json(
      { error: `You can attach at most ${MAX_SCREENSHOT_COUNT} files.` },
      { status: 400 },
    );
  }

  const toUpload = files.slice(0, remaining);
  const validated = validateScreenshotFiles(toUpload, { maxCount: remaining });
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  try {
    const uploaded = await persistTicketScreenshots(ticket.id, toUpload);
    if (uploaded.length === 0) {
      return NextResponse.json({ error: "Add at least one file." }, { status: 400 });
    }

    const nextMeta = [...existing, ...uploaded];
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { intakeScreenshotMeta: nextMeta },
    });

    const label = uploaded.map((m) => m.originalName).join(", ");
    const actor =
      session.user.role === "Customer" || session.user.role === "Personnel"
        ? "USER"
        : "AGENT";
    await logActivity(ticket.id, actor, "Screenshots attached", label);

    return NextResponse.json({
      ok: true,
      added: uploaded,
      intakeScreenshotMeta: nextMeta,
      remaining: MAX_SCREENSHOT_COUNT - nextMeta.length,
    });
  } catch (err) {
    console.error("[tickets/screenshots] append failed", err);
    return NextResponse.json({ error: "Could not save attachments." }, { status: 500 });
  }
}
