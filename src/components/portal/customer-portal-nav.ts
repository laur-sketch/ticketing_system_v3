import type { LucideIcon } from "lucide-react";
import { BookOpen, Home, Settings, Ticket } from "lucide-react";

export type CustomerPortalNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

/** Primary + secondary links for customer portal (sidebar + mobile drawer). */
export const CUSTOMER_PORTAL_NAV_ITEMS: CustomerPortalNavItem[] = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/my-tickets", label: "Active Tickets", icon: Ticket },
  { href: "/tickets/knowledge", label: "Knowledge Base", icon: BookOpen },
  { href: "/tickets/knowledge#settings", label: "Settings", icon: Settings },
];

export function customerPortalNavItemActive(label: string, pathname: string, hash: string): boolean {
  if (label === "Dashboard") return pathname === "/";
  if (label === "Active Tickets") return pathname === "/my-tickets" || pathname.startsWith("/my-tickets/");
  if (label === "Knowledge Base") return pathname === "/tickets/knowledge" && hash !== "#settings";
  if (label === "Settings") return pathname === "/tickets/knowledge" && hash === "#settings";
  return false;
}
