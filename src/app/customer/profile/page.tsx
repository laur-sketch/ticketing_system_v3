import { redirect } from "next/navigation";

/** Legacy URL: customer home is now the main dashboard at `/`. */
export default function CustomerProfileRedirectPage() {
  redirect("/");
}
