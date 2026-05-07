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

  const body = (await req.json()) as { newEmail?: string; password?: string };
  const newEmail = body.newEmail?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";

  if (!newEmail || !password || !newEmail.includes("@")) {
    return NextResponse.json({ error: "New email and current password are required." }, { status: 400 });
  }

  const currentEmail = session.user.email.toLowerCase();
  if (newEmail === currentEmail) {
    return NextResponse.json({ error: "New email must be different." }, { status: 400 });
  }

  const portal = await prisma.portalAccount.findUnique({
    where: { email: currentEmail },
    select: { id: true, email: true, passwordHash: true },
  });
  if (!portal) {
    return NextResponse.json({ error: "Portal account not found." }, { status: 404 });
  }

  const passwordOk = await bcrypt.compare(password, portal.passwordHash);
  if (!passwordOk) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 403 });
  }

  const existing = await prisma.portalAccount.findUnique({
    where: { email: newEmail },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "Email already in use." }, { status: 409 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.portalAccount.update({
      where: { id: portal.id },
      data: { email: newEmail },
    });
    await tx.agent.updateMany({
      where: { email: currentEmail },
      data: { email: newEmail },
    });
  });

  return NextResponse.json({ ok: true });
}
