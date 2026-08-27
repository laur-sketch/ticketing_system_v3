import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Personnel registry now lives under Workforce → ListView. */
export default async function PersonnelPage() {
  redirect("/admin/workforce?view=list");
}
