import { prisma } from "@/lib/prisma";
import { EscalationTriggersClient } from "./ui";

export const dynamic = "force-dynamic";

export default async function EscalationTriggersPage() {
  const triggers = await prisma.escalationTrigger.findMany({
    orderBy: { priority: "asc" },
  });
  return <EscalationTriggersClient initialTriggers={triggers} />;
}
