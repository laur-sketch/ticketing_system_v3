import type { UserRole } from "@/lib/auth";

/** Roles that can file tickets as a requestor and must confirm their own resolutions. */
export function isTicketRequestorRole(role: string | undefined | null): role is UserRole {
  return (
    role === "Customer" ||
    role === "Personnel" ||
    role === "Admin" ||
    role === "SuperAdmin"
  );
}

export function ticketRequestorNavLabel(role: string | undefined | null): string {
  if (role === "Admin" || role === "SuperAdmin") return "Admin";
  if (role === "Personnel") return "Personnel";
  return "Customer";
}
