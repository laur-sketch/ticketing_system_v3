/** Shared active-state logic for sidebar / shell navigation. */
export function navLinkActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (
    href === "/agent" &&
    (pathname === "/agent" || pathname.startsWith("/agent/") || pathname === "/admin/manual-assignment")
  ) {
    return true;
  }
  if (href === "/admin/personnel" && pathname.startsWith("/admin/personnel")) return true;
  if (href === "/admin/account" && pathname.startsWith("/admin/account")) return true;
  if (href === "/admin/escalation-triggers" && pathname.startsWith("/admin/escalation-triggers")) return true;
  if (href === "/insights" && pathname.startsWith("/insights")) return true;
  if (href === "/customer/profile" && pathname.startsWith("/customer")) return true;
  if (href === "/my-tickets" && pathname.startsWith("/my-tickets")) return true;
  if (pathname === href) return true;
  return false;
}
