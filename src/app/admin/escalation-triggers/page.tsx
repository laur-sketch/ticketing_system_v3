import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Priority alerts now live inside SuperAdmin Settings. */
export default async function EscalationTriggersPage() {
  redirect("/admin/superadmin-settings?tab=alerts");
}
