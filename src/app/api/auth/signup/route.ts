import { NextResponse } from "next/server";
import { COMPANY_ROSTER } from "@/lib/company-roster";
import {
  createPortalAccount,
  findPortalByEmailOnly,
  findPortalByUsername,
  isSignupRole,
} from "@/lib/portal-account";
import { prisma } from "@/lib/prisma";
import { ensureRosterTeamsInDb } from "@/lib/roster-teams";

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validUsername(username: string) {
  return /^[a-zA-Z0-9._-]{3,32}$/.test(username);
}

function passwordMeetsPolicy(password: string) {
  /** Signup password complexity rules removed; only require a non-empty value. */
  return password.length > 0;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      name?: string;
      username?: string;
      email?: string;
      password?: string;
      role?: string;
      companyId?: string;
      customerOrgRole?: string;
    };
    const name = body.name?.trim() ?? "";
    const username = body.username?.trim().toLowerCase() ?? "";
    const email = body.email?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";
    const roleRaw = body.role?.toString().trim() ?? "Customer";
    const normalizedRole = roleRaw.toLowerCase() === "agent" ? "Personnel" : roleRaw;

    if (!isSignupRole(normalizedRole)) {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }
    const role = normalizedRole;

    if (name.length < 2) {
      return NextResponse.json({ error: "Please enter a display name." }, { status: 400 });
    }
    if (!validUsername(username)) {
      return NextResponse.json(
        {
          error: "Username must be 3–32 characters (letters, numbers, . _ -).",
        },
        { status: 400 },
      );
    }
    if (!validEmail(email)) {
      return NextResponse.json({ error: "Enter a valid work email." }, { status: 400 });
    }
    if (!passwordMeetsPolicy(password)) {
      return NextResponse.json({ error: "Enter a password." }, { status: 400 });
    }

    const [byEmail, byUser] = await Promise.all([
      findPortalByEmailOnly(email),
      findPortalByUsername(username),
    ]);
    if (byEmail) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }
    if (byUser) {
      return NextResponse.json({ error: "This username is already taken." }, { status: 409 });
    }

    let companyId: string | null = null;
    let customerOrgRole: string | null = null;
    if (role === "Customer") {
      await ensureRosterTeamsInDb();
      const cid = body.companyId?.trim() ?? "";
      const orgRoleRaw = body.customerOrgRole?.trim() ?? "";
      const normalizedOrgRole = orgRoleRaw === "Head" ? "Admin" : orgRoleRaw;
      if (!cid || !["Admin", "Personnel"].includes(normalizedOrgRole)) {
        return NextResponse.json(
          { error: "Choose your company and org role (Admin or Personnel)." },
          { status: 400 },
        );
      }
      const team = await prisma.team.findUnique({ where: { id: cid }, select: { id: true, name: true } });
      if (!team || !(COMPANY_ROSTER as readonly string[]).includes(team.name)) {
        return NextResponse.json({ error: "Invalid company selection." }, { status: 400 });
      }
      companyId = team.id;
      customerOrgRole = normalizedOrgRole;
    }

    const result = await createPortalAccount({
      username,
      email,
      name,
      password,
      role,
      companyId,
      customerOrgRole,
    });
    if (!result.ok) {
      if (result.code === "DUPLICATE") {
        return NextResponse.json(
          { error: "Username or email is already registered." },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: "Could not create account." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Could not create account." }, { status: 500 });
  }
}
