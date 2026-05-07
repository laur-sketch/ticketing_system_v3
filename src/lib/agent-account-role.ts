/** Display label for roster / assignee UI — legacy headPrivileges maps to Admin tier label. */
export function agentOperationalRoleLabel(headPrivileges: boolean | null | undefined): "Admin" | "Personnel" {
  return headPrivileges === true ? "Admin" : "Personnel";
}
