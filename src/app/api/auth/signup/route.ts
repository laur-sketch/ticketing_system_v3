import { NextResponse } from "next/server";
import { COMPANY_ROSTER } from "@/lib/company-roster";
import {
  createPortalAccount,
  findPortalByEmailOnly,
  findPortalByUsername,
  isSignupRole,
} from "@/lib/portal-account";
import { prisma } from "@/lib/prisma";

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validUsername(username: string) {
  return /^[a-zA-Z0-9._-]{3,32}$/.test(username);
}

function passwordMeetsPolicy(password: string) {
  if (password.length < 8) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  return true;
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
      return NextResponse.json(
        {
          error: "Password must be at least 8 characters with one uppercase letter and one number.",
        },
        { status: 400 },
      );
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
      const cid = body.companyId?.trim() ?? "";
      const orgRole = body.customerOrgRole?.trim() ?? "";
      if (!cid || !["Head", "Personnel"].includes(orgRole)) {
        return NextResponse.json(
          { error: "Choose your company and org role (Head or Personnel)." },
          { status: 400 },
        );
      }
      const team = await prisma.team.findUnique({ where: { id: cid }, select: { name: true } });
      if (!team || !(COMPANY_ROSTER as readonly string[]).includes(team.name)) {
        return NextResponse.json({ error: "Invalid company selection." }, { status: 400 });
      }
      companyId = cid;
      customerOrgRole = orgRole;
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
