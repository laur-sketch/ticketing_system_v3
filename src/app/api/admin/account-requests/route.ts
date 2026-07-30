import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import { setLinkedAccountPassword } from "@/lib/auth/linked-account-password";
import { DEFAULT_PASSWORD_RESET } from "@/lib/default-reset-password";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { unauthorized } = await requireRole(["Admin"]);
  if (unauthorized) return unauthorized;

  const rows = await prisma.accountActionRequest.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      portalAccount: {
        select: { id: true, name: true, email: true, role: true },
      },
    },
  });
  return NextResponse.json({ rows });
}

export async function PATCH(req: Request) {
  const { session, unauthorized } = await requireRole(["Admin"]);
  if (unauthorized || !session) return unauthorized;

  const body = (await req.json()) as { id?: string; status?: string };
  const id = body.id?.trim() ?? "";
  const status = body.status?.toUpperCase() ?? "";
  if (!id || !["PENDING", "APPROVED", "REJECTED"].includes(status)) {
    return NextResponse.json({ error: "id and valid status are required." }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const request = await tx.accountActionRequest.update({
      where: { id },
      data: {
        status,
        reviewedBy: session.user.email ?? session.user.name ?? "unknown",
        reviewedAt: new Date(),
      },
    });

    if (status === "APPROVED" && request.requestType !== "PASSWORD_RESET") {
      const nextAccountStatus =
        request.requestType === "DELETION"
          ? "DELETED"
          : request.requestType === "SUSPENSION"
            ? "SUSPENDED"
            : null;
      if (nextAccountStatus) {
        await tx.portalAccount.update({
          where: { id: request.portalAccountId },
          data: { accountStatus: nextAccountStatus },
        });
      }
    }

    return request;
  });

  if (status === "APPROVED" && updated.requestType === "PASSWORD_RESET") {
    const portal = await prisma.portalAccount.findUnique({
      where: { id: updated.portalAccountId },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        mergedSourceUserId: true,
      },
    });
    if (portal) {
      await setLinkedAccountPassword(portal, DEFAULT_PASSWORD_RESET);
    }
  }

  return NextResponse.json(updated);
}
