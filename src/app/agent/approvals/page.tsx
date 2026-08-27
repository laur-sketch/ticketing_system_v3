import { redirect } from "next/navigation";

export default function NeedsMyApprovalPage() {
  redirect("/agent");
}
