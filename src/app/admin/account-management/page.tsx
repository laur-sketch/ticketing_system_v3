import { redirect } from "next/navigation";

export default function AccountManagementRedirectPage() {
  redirect("/admin/personnel");
}
