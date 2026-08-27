import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Personnel activity now lives under Workforce → Activity view. */
export default async function ActivitiesPage() {
  redirect("/admin/workforce?view=activity");
}
