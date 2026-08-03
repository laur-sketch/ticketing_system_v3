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
import { resolveAcaFormCode } from "@/lib/authority-to-conduct-activity";

type AgentOpt = { id: string; name: string; email?: string | null };

export function AcaIntakeFields({
  companyName,
  category,
  onCategoryChange,
  natureOfRequest,
  onNatureOfRequestChange,
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
  submittedByName,
  onSubmittedByNameChange,
  relatedTicketIds,
  onRelatedTicketIdsChange,
  resolution,
  companyUsers,
  companyUsersLoading,
  sendToCompanySelected,
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
  submittedByName: string;
  onSubmittedByNameChange: (v: string) => void;
  relatedTicketIds: string;
  onRelatedTicketIdsChange: (v: string) => void;
  resolution: AcaAuthorityResolution | null;
  companyUsers: AgentOpt[];
  companyUsersLoading: boolean;
  sendToCompanySelected: boolean;
  recommendedByAgentId: string;
  onRecommendedByAgentIdChange: (v: string) => void;
  financeManagerAgentId: string;
  onFinanceManagerAgentIdChange: (v: string) => void;
  approvingAgentIds: string[];
  onApprovingAgentIdChange: (index: number, v: string) => void;
  renderAttachments: (inputId: string) => ReactNode;
}) {
  const categories = listAcaCategories();
  const natures = category ? listAcaNaturesForCategory(category) : [];
  const formCode = resolveAcaFormCode(companyName);
  const seatCount = resolution?.requiresAca ? resolution.approvingSeatCount : 0;
  const excludedBase = [recommendedByAgentId, financeManagerAgentId, ...approvingAgentIds].filter(
    Boolean,
  );

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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Company
          <Input
            readOnly
            value={companyName || "Select Send request to"}
            className="mt-1.5 border-zinc-300 bg-zinc-100 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-100"
          />
        </label>
        <div className="hidden sm:block" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Category
          <Select
            required
            value={category}
            onChange={(e) => {
              onCategoryChange(e.target.value);
              onNatureOfRequestChange("");
            }}
            className="mt-1.5 border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          >
            <option value="">Select category</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </label>
        <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Nature of Request
          <Select
            required
            value={natureOfRequest}
            onChange={(e) => onNatureOfRequestChange(e.target.value)}
            disabled={!category}
            className="mt-1.5 border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          >
            <option value="">{category ? "Select nature" : "Select category first"}</option>
            {natures.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </label>
      </div>

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

      <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
        Submitted By
        <Input
          required
          maxLength={200}
          value={submittedByName}
          onChange={(e) => onSubmittedByNameChange(e.target.value)}
          className="mt-1.5 border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
      </label>

      <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
        Related documents{" "}
        <span className="font-normal text-zinc-500 dark:text-zinc-400">
          (optional — RFP / PR / payment ticket IDs)
        </span>
        <Input
          maxLength={500}
          value={relatedTicketIds}
          onChange={(e) => onRelatedTicketIdsChange(e.target.value)}
          placeholder="e.g. REQ-2026-00123, REQ-2026-00124"
          className="mt-1.5 border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
      </label>

      <div>{renderAttachments("ticket-screenshots-aca")}</div>

      <div className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-700">
        <div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Required approval chain
          </p>
          <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            Assignees are filtered to the company selected in Send request to. Finance Manager is
            always required.
          </p>
        </div>

        {!sendToCompanySelected ? (
          <p className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            Select a company in Send request to before choosing ACA approvers.
          </p>
        ) : companyUsersLoading ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Loading company users…</p>
        ) : resolution?.requiresAca ? (
          <>
            <CompanyUserSearchField
              label={`Recommended By (${resolution.recommendingLabel ?? "RA"})`}
              users={companyUsers}
              value={recommendedByAgentId}
              onChange={onRecommendedByAgentIdChange}
              excludedIds={excludedBase.filter((id) => id !== recommendedByAgentId)}
              placeholder="Search company users…"
              emptyMessage="No eligible company users found."
            />
            <CompanyUserSearchField
              label="Validated by: Finance Manager"
              users={companyUsers}
              value={financeManagerAgentId}
              onChange={onFinanceManagerAgentIdChange}
              excludedIds={excludedBase.filter((id) => id !== financeManagerAgentId)}
              placeholder="Search company users…"
              emptyMessage="No eligible company users found."
            />
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
                placeholder="Search company users…"
                emptyMessage="No eligible company users found."
              />
            ))}
          </>
        ) : (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Complete Category, Nature, and Estimated Cost to load required approvers.
          </p>
        )}
      </div>
    </div>
  );
}
