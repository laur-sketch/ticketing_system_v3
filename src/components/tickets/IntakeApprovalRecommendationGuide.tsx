"use client";

import { useEffect, useMemo, useState } from "react";
import { Lightbulb, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { IntakeApprovalRecommendationGuide } from "@/lib/intake-approval-recommendations";
import type { RequestTypeId } from "@/lib/request-types";

type Props = {
  requestType: RequestTypeId;
  requestorSectionId?: string;
  sendToSectionId?: string;
  requestingCompanyTeamId?: string;
  skipNotedBy?: boolean;
  skipApprovedBy?: boolean;
  deferBookkeeper?: boolean;
  onApply: (assignees: Record<string, string>) => void;
};

export function IntakeApprovalRecommendationGuide({
  requestType,
  requestorSectionId = "",
  sendToSectionId = "",
  requestingCompanyTeamId = "",
  skipNotedBy = false,
  skipApprovedBy = false,
  deferBookkeeper = false,
  onApply,
}: Props) {
  const [guide, setGuide] = useState<IntakeApprovalRecommendationGuide | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryKey = useMemo(
    () =>
      [
        requestType,
        requestorSectionId.trim(),
        sendToSectionId.trim(),
        requestingCompanyTeamId.trim(),
        skipNotedBy ? "1" : "0",
        skipApprovedBy ? "1" : "0",
        deferBookkeeper ? "1" : "0",
      ].join("|"),
    [requestType, requestorSectionId, sendToSectionId, requestingCompanyTeamId, skipNotedBy, skipApprovedBy, deferBookkeeper],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const params = new URLSearchParams({ requestType });
        const requestorId = requestorSectionId.trim();
        const sendToId = sendToSectionId.trim();
        if (requestorId) params.set("requestorSectionId", requestorId);
        if (sendToId) params.set("sendToSectionId", sendToId);
        const requestingCompanyId = requestingCompanyTeamId.trim();
        if (requestingCompanyId) params.set("requestingCompanyTeamId", requestingCompanyId);
        if (skipNotedBy) params.set("skipNotedBy", "1");
        if (skipApprovedBy) params.set("skipApprovedBy", "1");
        if (deferBookkeeper) params.set("deferBookkeeper", "1");

        const res = await fetch(`/api/intake/approval-recommendations?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? "Could not load approval recommendations.");
        }
        const data = (await res.json()) as IntakeApprovalRecommendationGuide;
        if (!cancelled) setGuide(data);
      } catch (err) {
        if (!cancelled) {
          setGuide(null);
          setError(err instanceof Error ? err.message : "Could not load approval recommendations.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [queryKey, deferBookkeeper, requestType, requestorSectionId, requestingCompanyTeamId, sendToSectionId, skipApprovedBy, skipNotedBy]);

  const filledSeats = guide?.seats.filter((seat) => seat.agentId) ?? [];
  const canApply = filledSeats.length > 0;

  const sectionSummary = useMemo(() => {
    if (!guide) return null;
    const requestorIsSubsection =
      guide.requestorMainSectionName &&
      guide.requestorSectionName &&
      guide.requestorMainSectionName !== guide.requestorSectionName;

    if (requestType === "REQUEST_FOR_PAYMENT") {
      const parts: string[] = [];
      if (guide.requestorSectionName) {
        parts.push(`requesting department ${guide.requestorSectionName}`);
      }
      if (guide.requestorMainSectionName) {
        parts.push(
          requestorIsSubsection
            ? `main section ${guide.requestorMainSectionName} (subsection head first)`
            : `main section ${guide.requestorMainSectionName}`,
        );
      }
      if (guide.sendToSectionName) {
        parts.push(`bookkeeper from send-to section ${guide.sendToSectionName}`);
      }
      if (guide.requestingCompanyName) {
        parts.push(`requesting company ${guide.requestingCompanyName}`);
      } else if (guide.requestorCompanyName) {
        parts.push(`requestor company ${guide.requestorCompanyName}`);
      }
      return parts.length > 0 ? parts.join(" · ") : null;
    }
    if (guide.requestorMainSectionName) {
      return requestorIsSubsection
        ? `main section ${guide.requestorMainSectionName} (subsection head first for ${guide.requestorSectionName})`
        : `main section ${guide.requestorMainSectionName}`;
    }
    return null;
  }, [guide, requestType]);

  function handleApply() {
    if (!guide) return;
    const next: Record<string, string> = {};
    for (const seat of guide.seats) {
      if (seat.agentId) next[seat.key] = seat.agentId;
    }
    if (Object.keys(next).length === 0) return;
    onApply(next);
  }

  return (
    <div className="rounded-xl border border-orange-200/80 bg-orange-50/40 p-3 dark:border-orange-500/25 dark:bg-orange-950/15 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            <Lightbulb className="size-4 shrink-0 text-orange-600 dark:text-orange-400" aria-hidden />
            Approval recommendations
          </p>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            Suggested assignees from org-chart sections
            {sectionSummary ? ` — ${sectionSummary}` : ""}. Subsection heads are listed first for Noted By when you belong to a subsection.
            Approved By uses the next section head up from your department. Bookkeeper uses send-to
            section and your company by default, or requesting company when that option is enabled.
            You can still choose someone else below.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canApply || loading}
          onClick={handleApply}
          className="shrink-0 border-orange-300 bg-white text-orange-900 hover:bg-orange-50 dark:border-orange-500/40 dark:bg-zinc-950 dark:text-orange-100 dark:hover:bg-orange-950/40"
        >
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="size-3.5" aria-hidden />
          )}
          Apply recommendations
        </Button>
      </div>

      {loading ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Loading section-based recommendations…
        </p>
      ) : error ? (
        <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">{error}</p>
      ) : guide && guide.seats.length > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {guide.seats.map((seat) => (
            <div
              key={seat.key}
              className={cn(
                "rounded-lg border px-3 py-2",
                seat.agentId
                  ? "border-emerald-200/80 bg-white dark:border-emerald-500/25 dark:bg-zinc-950/50"
                  : "border-zinc-200/80 bg-white/70 dark:border-zinc-700 dark:bg-zinc-950/30",
              )}
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-500">
                {seat.label}
              </p>
              <p
                className={cn(
                  "mt-0.5 text-sm font-medium",
                  seat.agentName
                    ? "text-emerald-800 dark:text-emerald-300"
                    : "text-zinc-400 dark:text-zinc-600",
                )}
              >
                {seat.agentName ?? "No recommendation yet"}
              </p>
              {seat.hint ? (
                <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">{seat.hint}</p>
              ) : !seat.agentName ? (
                <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                  No matching user in the send-to section for your company.
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          Select your section to see recommended approvers.
        </p>
      )}
    </div>
  );
}
