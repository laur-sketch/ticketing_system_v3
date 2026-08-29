import { redirect } from "next/navigation";

/** Legacy route — executive metrics live on Insights. */
export default function ReportsPage() {
  redirect("/insights?tab=ticket-metrics");
}
