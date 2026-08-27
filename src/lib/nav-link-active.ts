/** Shared active-state logic for sidebar / shell navigation. */
export function navLinkActive(
  pathname: string,
  href: string,
  searchParams?: URLSearchParams | null,
): boolean {
  const params = searchParams ?? null;
  const [path, queryString] = href.split("?");
  const hrefParams = queryString ? new URLSearchParams(queryString) : null;

  if (hrefParams) {
    const onPath = pathname === path || pathname.startsWith(`${path}/`);
    if (!onPath) return false;
    for (const [key, value] of hrefParams.entries()) {
      const current = params?.get(key);
      if (key === "board" && path === "/agent" && value === "ticket" && !current) {
        continue;
      }
      if (current !== value) return false;
    }
    return true;
  }

  if (path === "/") return pathname === "/";
  if (path === "/agent/tasks") {
    return pathname === "/agent/tasks" || pathname.startsWith("/agent/tasks/");
  }
  if (
    path === "/agent" &&
    (pathname === "/agent" ||
      pathname.startsWith("/agent/tickets") ||
      pathname === "/admin/manual-assignment" ||
      pathname === "/my-requests" ||
      pathname.startsWith("/my-requests/"))
  ) {
    if (params?.get("assigned") === "UNASSIGNED") return false;
    if (params?.get("board") === "company") return false;
    if (params?.get("view") === "approvals") return false;
    return true;
  }
  if (path === "/admin/workforce") {
    return pathname === "/admin/workforce" || pathname.startsWith("/admin/workforce/");
  }
  if (path === "/admin/personnel" || path === "/admin/activities") {
    return pathname.startsWith("/admin/workforce");
  }
  if (path === "/admin/superadmin-settings" || path === "/admin/escalation-triggers") {
    return (
      pathname.startsWith("/admin/superadmin-settings") ||
      pathname.startsWith("/admin/escalation-triggers")
    );
  }
  if (path === "/admin/account" && pathname.startsWith("/admin/account")) return true;
  if (path === "/insights" && pathname.startsWith("/insights")) return true;
  if (path === "/customer/profile" && pathname.startsWith("/customer")) return true;
  if (path === "/my-tickets" && pathname.startsWith("/my-tickets")) return true;
  if (pathname === path) return true;
  return pathname.startsWith(`${path}/`);
}
