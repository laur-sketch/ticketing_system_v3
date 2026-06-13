import { Tabs } from "@/components/ui/vercel-tabs";

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "integrations", label: "Integrations" },
  { id: "activity", label: "Activity" },
  { id: "domains", label: "Domains" },
  { id: "usage", label: "Usage" },
  { id: "monitoring", label: "Monitoring" },
];

export default function DemoOne() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center">
      <Tabs tabs={tabs} />
    </div>
  );
}
