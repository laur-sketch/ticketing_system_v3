"use client";

import type { ReactNode } from "react";
import { CompanyUserSearchField } from "@/components/tickets/CompanyUserSearchField";
import { DatePickerField } from "@/components/ui/DatePickerField";
import { Input, Select, Textarea } from "@/components/ui/field";
import {
  listAcaCategories,
  listAcaNaturesForCategory,
  type AcaAuthorityResolution,
} from "@/lib/aca-authority-matrix";
import { acaLevelShowsInExeComTable } from "@/lib/aca-approval";
import { resolveAcaFormCode } from "@/lib/authority-to-conduct-activity";

type AgentOpt = { id: string; name: string; email?: string | null };

const NATURE_VALUE_SEP = "::";

export function encodeAcaNatureValue(category: string, nature: string): string {
  return `${category}${NATURE_VALUE_SEP}${nature}`;
}

export function decodeAcaNatureValue(value: string): { category: string; nature: string } | null {
  const idx = value.indexOf(NATURE_VALUE_SEP);
  if (idx <= 0) return null;
  const category = value.slice(0, idx);
  const nature = value.slice(idx + NATURE_VALUE_SEP.length);
  if (!category || !nature) return null;
  return { category, nature };
}

export function AcaIntakeFields({
  companyName,
  category,
  onCategoryChange,
  natureOfRequest,
  onNatureOfRequestChange,
  departmentStore,
  onDepartmentStoreChange,
  estimatedCost,
  onEstimatedCostChange,
  budgetAmount,
  onBudgetAmountChange,
  description,
  onDescriptionChange,
  objective,
  onObjectiveChange,
  dateSubmitted,
  onDateSubmittedChange,
  implementationDate,
  onImplementationDateChange,
  relatedTicketIds,
  onRelatedTicketIdsChange,
  resolution,
  recommendedByUsers,
  recommendedByLockedToRequestor,
  requestorCompanyName,
  companyUsers,
  companyUsersLoading,
  recommendedByAgentId,
  onRecommendedByAgentIdChange,
  financeManagerAgentId,
  onFinanceManagerAgentIdChange,
  approvingAgentIds,
  onApprovingAgentIdChange,
  renderAttachments,
}: {
  companyName: string;
  category: string;
  onCategoryChange: (v: string) => void;
  natureOfRequest: string;
  onNatureOfRequestChange: (v: string) => void;
  departmentStore: string;
  onDepartmentStoreChange: (v: string) => void;
  estimatedCost: string;
  onEstimatedCostChange: (v: string) => void;
  budgetAmount: string;
  onBudgetAmountChange: (v: string) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  objective: string;
  onObjectiveChange: (v: string) => void;
  dateSubmitted: string;
  onDateSubmittedChange: (v: string) => void;
  implementationDate: string;
  onImplementationDateChange: (v: string) => void;
  relatedTicketIds: string;
  onRelatedTicketIdsChange: (v: string) => void;
  resolution: AcaAuthorityResolution | null;
  recommendedByUsers: AgentOpt[];
  recommendedByLockedToRequestor: boolean;
  requestorCompanyName: string;
  companyUsers: AgentOpt[];
  companyUsersLoading: boolean;
  recommendedByAgentId: string;
  onRecommendedByAgentIdChange: (v: string) => void;
  financeManagerAgentId: string;
  onFinanceManagerAgentIdChange: (v: string) => void;
  approvingAgentIds: string[];
  onApprovingAgentIdChange: (index: number, v: string) => void;
  renderAttachments: (inputId: string) => ReactNode;
}) {
  const categories = listAcaCategories();
  const formCode = resolveAcaFormCode(companyName);
  const seatCount = resolution?.requiresAca ? resolution.approvingSeatCount : 0;
  const approvingPathUsesExeComTable = acaLevelShowsInExeComTable(resolution?.approvingPath);
  const excludedBase = [recommendedByAgentId, financeManagerAgentId, ...approvingAgentIds].filter(
    Boolean,
  );
  const natureSelectValue =
    category && natureOfRequest ? encodeAcaNatureValue(category, natureOfRequest) : "";

  return (
    <div className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-700 dark:bg-zinc-950/30 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Authority to Conduct Activity
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            Official form · {formCode}
          </p>
        </div>
        <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
          ACA No. · Assigned on submit
        </p>
      </div>

      <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
        Nature of Request
        <Select
          required
          value={natureSelectValue}
          onChange={(e) => {
            const parsed = decodeAcaNatureValue(e.target.value);
            if (!parsed) {
              onCategoryChange("");
              onNatureOfRequestChange("");
              return;
            }
            onCategoryChange(parsed.category);
            onNatureOfRequestChange(parsed.nature);
          }}
          className="mt-1.5 border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        >
          <option value="">Select nature of request</option>
          {categories.map((c) => (
            <optgroup key={c} label={c}>
              {listAcaNaturesForCategory(c).map((n) => (
                <option key={`${c}${NATURE_VALUE_SEP}${n}`} value={encodeAcaNatureValue(c, n)}>
                  {n}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </label>

      <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
        Department / Store
        <Input
          required
          maxLength={200}
          value={departmentStore}
          onChange={(e) => onDepartmentStoreChange(e.target.value)}
          placeholder="e.g. IT Dept., Main Store"
          className="mt-1.5 border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Estimated Cost
          <Input
            required
            maxLength={80}
            value={estimatedCost}
            onChange={(e) => onEstimatedCostChange(e.target.value)}
            placeholder="e.g. 15000.00"
            className="mt-1.5 border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </label>
        <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Budget Amount
          <Input
            required
            maxLength={80}
            value={budgetAmount}
            onChange={(e) => onBudgetAmountChange(e.target.value)}
            placeholder="e.g. 15000.00"
            className="mt-1.5 border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </label>
      </div>

      {resolution ? (
        <div
          className={`rounded-lg border px-3 py-2 text-xs ${
            !resolution.ok
              ? "border-rose-400/40 bg-rose-500/10 text-rose-800 dark:text-rose-200"
              : !resolution.requiresAca
                ? "border-amber-400/40 bg-amber-500/10 text-amber-800 dark:text-amber-200"
                : "border-emerald-400/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200"
          }`}
        >
          <p className="font-semibold">Authority Matrix</p>
          <p className="mt-1">{resolution.guidance}</p>
          {resolution.recommendingLabel ? (
            <p className="mt-1">Recommending: {resolution.recommendingLabel}</p>
          ) : null}
          {resolution.approvingLabel ? (
            <p className="mt-0.5">
              Approving: {resolution.approvingLabel}
              {resolution.approvingSeatCount > 1
                ? ` · ${resolution.approvingSeatCount} seats`
                : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Date Submitted
          <DatePickerField
            required
            value={dateSubmitted}
            onChange={(e) => onDateSubmittedChange(e.target.value)}
            wrapperClassName="mt-1.5"
          />
        </label>
        <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Implementation Date
          <DatePickerField
            required
            value={implementationDate}
            onChange={(e) => onImplementationDateChange(e.target.value)}
            wrapperClassName="mt-1.5"
          />
        </label>
      </div>

      <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
        Description
        <Textarea
          required
          rows={3}
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Describe the activity"
          className="mt-1.5 border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
      </label>

      <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
        Objective
        <Textarea
          required
          rows={3}
          value={objective}
          onChange={(e) => onObjectiveChange(e.target.value)}
          placeholder="Objective of the activity"
          className="mt-1.5 border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
      </label>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Related documents{" "}
          <span className="font-normal text-zinc-500 dark:text-zinc-400">
            (optional — ticket IDs and/or files)
          </span>
          <Input
            maxLength={500}
            value={relatedTicketIds}
            onChange={(e) => onRelatedTicketIdsChange(e.target.value)}
            placeholder="e.g. REQ-2026-00123, REQ-2026-00124"
            className="mt-1.5 border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </label>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          Attach supporting documents (PDF, Word, Excel, images) below.
        </p>
        <div>{renderAttachments("ticket-screenshots-aca")}</div>
      </div>

      <div className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-700">
        <div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Procedural steps
          </p>
          <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            {recommendedByLockedToRequestor
              ? `Recommended By (RA 1–2) is limited to your company${
                  requestorCompanyName ? ` (${requestorCompanyName})` : ""
                }. Validated By and Approvers may be from any company.`
              : "Recommended By (RA 3–4), Validated By, and Approvers may be chosen from any company."}{" "}
            Recommended By and Validated By are always required.
          </p>
        </div>

        {companyUsersLoading ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Loading users…</p>
        ) : resolution?.requiresAca ? (
          <>
            {recommendedByLockedToRequestor && !requestorCompanyName ? (
              <p className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                Your company must be assigned before choosing Recommended By for RA 1–2.
              </p>
            ) : null}
            <CompanyUserSearchField
              label={`Recommended By: ${resolution.recommendingLabel ?? "RA"}${
                recommendedByLockedToRequestor ? " · your company" : " · any company"
              }`}
              users={recommendedByUsers}
              value={recommendedByAgentId}
              onChange={onRecommendedByAgentIdChange}
              excludedIds={excludedBase.filter((id) => id !== recommendedByAgentId)}
              placeholder={
                recommendedByLockedToRequestor
                  ? "Search your company users…"
                  : "Search users…"
              }
              emptyMessage={
                recommendedByLockedToRequestor
                  ? "No eligible users in your company."
                  : "No eligible users found."
              }
            />
            <CompanyUserSearchField
              label="Validated By: Finance Manager"
              users={companyUsers}
              value={financeManagerAgentId}
              onChange={onFinanceManagerAgentIdChange}
              excludedIds={excludedBase.filter((id) => id !== financeManagerAgentId)}
              placeholder="Search users…"
              emptyMessage="No eligible users found."
            />
            {!approvingPathUsesExeComTable && seatCount > 0
              ? Array.from({ length: seatCount }, (_, i) => (
                  <CompanyUserSearchField
                    key={`aca-approver-${i}`}
                    label={
                      seatCount > 1
                        ? `${resolution.approvingLabel ?? "Approver"} · Seat ${i + 1}`
                        : resolution.approvingLabel ?? "Approver"
                    }
                    users={companyUsers}
                    value={approvingAgentIds[i] ?? ""}
                    onChange={(v) => onApprovingAgentIdChange(i, v)}
                    excludedIds={excludedBase.filter((id) => id !== (approvingAgentIds[i] ?? ""))}
                    placeholder="Search users…"
                    emptyMessage="No eligible users found."
                  />
                ))
              : null}
            {approvingPathUsesExeComTable && seatCount > 0 ? (
              <div className="space-y-3 border-t border-zinc-200 pt-3 dark:border-zinc-700">
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {resolution.approvingLabel ?? "Approvers"}
                    {seatCount > 1 ? ` (${seatCount} seats)` : ""}
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                    These seats appear in the ExeCom approval table on the ticket — not in procedural
                    steps.
                  </p>
                </div>
                {Array.from({ length: seatCount }, (_, i) => (
                  <CompanyUserSearchField
                    key={`aca-approver-${i}`}
                    label={
                      seatCount > 1
                        ? `${resolution.approvingLabel ?? "Approver"} · Seat ${i + 1}`
                        : resolution.approvingLabel ?? "Approver"
                    }
                    users={companyUsers}
                    value={approvingAgentIds[i] ?? ""}
                    onChange={(v) => onApprovingAgentIdChange(i, v)}
                    excludedIds={excludedBase.filter((id) => id !== (approvingAgentIds[i] ?? ""))}
                    placeholder="Search users…"
                    emptyMessage="No eligible users found."
                  />
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Complete Nature of Request and Estimated Cost to load required approvers.
          </p>
        )}
      </div>
    </div>
  );
}
