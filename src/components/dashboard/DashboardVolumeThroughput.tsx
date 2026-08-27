"use client";

import { MetricsTrendChart } from "@/components/metrics/MetricsCharts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";

export function DashboardVolumeThroughput({
  labels,
  created,
  closed,
}: {
  labels: string[];
  created: number[];
  closed: number[];
}) {
  const [view, setView] = useState<"density" | "line">("density");

  return (
    <section className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-600 dark:text-zinc-500">
            Volume and throughput
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Created vs closed (daily)</p>
            <Tabs value={view} onValueChange={(value) => setView(value as typeof view)}>
              <TabsList className="rounded-full border border-zinc-300 bg-zinc-100 p-1 text-[10px] font-bold uppercase tracking-[0.12em] dark:border-zinc-700 dark:bg-zinc-900/90">
                <TabsTrigger value="density" className="rounded-full px-3 py-1 text-[10px] font-bold uppercase data-[state=active]:bg-orange-600 data-[state=active]:text-white">
                  Density
                </TabsTrigger>
                <TabsTrigger value="line" className="rounded-full px-3 py-1 text-[10px] font-bold uppercase data-[state=active]:bg-orange-600 data-[state=active]:text-white">
                  Line chart
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </div>
      <div className="mt-6">
        <MetricsTrendChart labels={labels} created={created} closed={closed} variant={view} />
      </div>
    </section>
  );
}
