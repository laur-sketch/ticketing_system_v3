import type { DefaultSession } from "next-auth";
import type { UserRole } from "@/lib/auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      role: UserRole;
      /** OAuth / credentials provider id (e.g. google, credentials). */
      authProvider?: string | null;
      /** Customer portal: linked company (Team id). */
      companyId?: string | null;
      companyName?: string | null;
      /** Customer org role at signup: Head | Personnel (not staff Personnel). */
      customerOrgRole?: string | null;
      /** Canonical portal staff tier from PortalAccount: Head | Personnel | null for customers. */
      staffRoleLabel?: string | null;
    };
  }

  interface User {
    role?: UserRole;
    companyId?: string | null;
    companyName?: string | null;
    customerOrgRole?: string | null;
    staffRoleLabel?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: UserRole;
    authProvider?: string | null;
    companyId?: string | null;
    companyName?: string | null;
    customerOrgRole?: string | null;
    staffRoleLabel?: string | null;
  }
}
