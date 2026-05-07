import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as { currentPassword?: string; newPassword?: string };
  const currentPassword = body.currentPassword ?? "";
  const newPassword = body.newPassword ?? "";

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "Current password and new password are required." }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 });
  }
  if (newPassword === currentPassword) {
    return NextResponse.json({ error: "New password must be different from current password." }, { status: 400 });
  }

  const email = session.user.email.toLowerCase();
  const portal = await prisma.portalAccount.findUnique({
    where: { email },
    select: { id: true, passwordHash: true },
  });
  if (!portal) {
    return NextResponse.json({ error: "Portal account not found." }, { status: 404 });
  }

  const passwordOk = await bcrypt.compare(currentPassword, portal.passwordHash);
  if (!passwordOk) {
    return NextResponse.json({ error: "Incorrect current password." }, { status: 403 });
  }

  const nextHash = await bcrypt.hash(newPassword, 12);
  await prisma.portalAccount.update({
    where: { id: portal.id },
    data: { passwordHash: nextHash },
  });

  return NextResponse.json({ ok: true });
}
