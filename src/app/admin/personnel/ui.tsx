"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { authInputClass, authLabelClass } from "@/components/auth/AuthShell";
import { cn } from "@/lib/cn";
import { BRAND_TITLE } from "@/lib/brand";
import { passwordHashLabel } from "@/lib/password-hash-display";
import type { PersonnelRosterRow } from "@/lib/personnel-accounts-data";
import { StaffAssignmentColorSelect } from "@/components/admin/StaffAssignmentColorSelect";
import { SimplePaginationBar } from "@/components/ui/SimplePaginationBar";
import { PORTAL_ROLES, isStaffPortalRole, normalizePortalRole } from "@/lib/staff-role";

function portalRegistryRoleLabel(role: (typeof PORTAL_ROLES)[number]) {
  if (role === "SuperAdmin") return "Super Admin (platform)";
  return role;
}

type Team = { id: string; name: string };
type PortalAccountRow = {
  id: string;
  username: string | null;
  passwordHash: string;
  email: string;
  name: string;
  role: string;
  headPrivileges?: boolean;
  accountStatus?: string;
  staffDesignatedCompanyId?: string | null;
  staffDesignatedCompany?: { id: string; name: string } | null;
  staffAssignmentColor?: string | null;
  createdAt: string;
  agentId: string | null;
  onPersonnelRoster: boolean;
};
type RosterCompany = { id: string; name: string };
const ALL_SBUS_VALUE = "__ALL_SBUS__";
const PERSONNEL_REGISTRY_PAGE_SIZE = 10;

type PendingAccountRequestRow = {
  id: string;
  requestType: string;
  reason: string | null;
  status: string;
  createdAt: string;
  portalAccount: { id: string; name: string; email: string; role: string };
};

export function PersonnelClient({
  initialTeams,
  initialPersonnel,
  viewerMode,
  scopeUnavailable,
  scopedCompanyName,
}: {
  initialTeams: Team[];
  initialPersonnel: PersonnelRosterRow[];
  viewerMode: "superadmin" | "admin";
  scopeUnavailable: boolean;
  scopedCompanyName: string | null;
}) {
  const isAdminCompanyView = viewerMode === "admin";
  const [, setTeams] = useState<Team[]>(initialTeams);
  const [personnel, setPersonnel] = useState<PersonnelRosterRow[]>(initialPersonnel);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"cards" | "table">("table");
  const [portalAccounts, setPortalAccounts] = useState<PortalAccountRow[]>([]);
  const [rosterCompanies, setRosterCompanies] = useState<RosterCompany[]>([]);
  const [roleBusyId, setRoleBusyId] = useState<string | null>(null);
  const [reconcileBusy, setReconcileBusy] = useState(false);
  const [pendingAccountRequests, setPendingAccountRequests] = useState<PendingAccountRequestRow[]>([]);
  const [requestReviewBusyId, setRequestReviewBusyId] = useState<string | null>(null);

  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createOk, setCreateOk] = useState<string | null>(null);
  const [createUsername, setCreateUsername] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createName, setCreateName] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState<"Admin" | "Personnel">("Personnel");
  const [createCompanyId, setCreateCompanyId] = useState("");
  const [personnelRegistryPage, setPersonnelRegistryPage] = useState(1);
  const [portalRegistryPage, setPortalRegistryPage] = useState(1);

  const { data: session, status: sessionStatus } = useSession();
  const canManagePortalAccounts = session?.user?.role === "SuperAdmin";

  useEffect(() => {
    void loadPendingAccountRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(personnel.length / PERSONNEL_REGISTRY_PAGE_SIZE));
    setPersonnelRegistryPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [personnel.length]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(portalAccounts.length / PERSONNEL_REGISTRY_PAGE_SIZE));
    setPortalRegistryPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [portalAccounts.length]);

  useEffect(() => {
    setPortalRegistryPage(1);
  }, [view]);

  useEffect(() => {
    if (sessionStatus === "loading") return;
    if (canManagePortalAccounts) {
      void loadRoles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, canManagePortalAccounts]);

  async function reconcileDuplicateAgents() {
    setError(null);
    setReconcileBusy(true);
    try {
      const res = await fetch("/api/admin/accounts/reconcile", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string; mergedAgentRows?: number };
      if (!res.ok) {
        setError(data.error ?? "Could not merge duplicate agent rows.");
        return;
      }
      await load();
      await loadRoles();
      await loadPendingAccountRequests();
    } finally {
      setReconcileBusy(false);
    }
  }

  async function loadPendingAccountRequests() {
    const res = await fetch("/api/admin/account-requests", { cache: "no-store" });
    if (res.status === 401 || res.status === 403) return;
    if (!res.ok) return;
    const data = (await res.json()) as { rows?: PendingAccountRequestRow[] };
    const rows = data.rows ?? [];
    setPendingAccountRequests(rows.filter((r) => r.status === "PENDING"));
  }

  async function reviewAccountRequest(id: string, status: "APPROVED" | "REJECTED") {
    setError(null);
    setRequestReviewBusyId(id);
    try {
      const res = await fetch("/api/admin/account-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(payload.error ?? "Could not update request.");
        return;
      }
      await loadPendingAccountRequests();
      await loadRoles();
    } finally {
      setRequestReviewBusyId(null);
    }
  }

  async function createStaffAccount(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreateError(null);
    setCreateOk(null);
    if (!createCompanyId) {
      setCreateError("Select a designated company queue.");
      return;
    }
    setCreateBusy(true);
    try {
      const res = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: createUsername.trim(),
          email: createEmail.trim(),
          name: createName.trim(),
          password: createPassword,
          role: createRole,
          staffDesignatedCompanyId: createCompanyId,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setCreateError(data.error ?? "Could not create account.");
        return;
      }
      setCreateOk("Account created. They can sign in with the username and password you set.");
      setCreateUsername("");
      setCreateEmail("");
      setCreateName("");
      setCreatePassword("");
      setCreateRole("Personnel");
      setCreateCompanyId("");
      await loadRoles();
      await load();
    } finally {
      setCreateBusy(false);
    }
  }

  async function load() {
    const res = await fetch("/api/admin/accounts");
    if (!res.ok) return;
    const data = (await res.json()) as {
      teams: Team[];
      personnel?: PersonnelRosterRow[];
    };
    setTeams(data.teams ?? []);
    setPersonnel(data.personnel ?? []);
  }

  async function removeFromRoster(portalAccountId: string, agentId: string | null) {
    if (!agentId) return;
    setError(null);
    setRoleBusyId(portalAccountId);
    try {
      const res = await fetch(`/api/admin/accounts/${agentId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Could not remove from roster.");
        return;
      }
      await load();
      await loadRoles();
    } finally {
      setRoleBusyId(null);
    }
  }

  async function loadRoles() {
    const res = await fetch("/api/admin/roles", { cache: "no-store" });
    if (res.status === 401 || res.status === 403) {
      setPortalAccounts([]);
      setRosterCompanies([]);
      return;
    }
    if (!res.ok) {
      setError("Could not load portal accounts.");
      return;
    }
    const data = (await res.json()) as {
      accounts: PortalAccountRow[];
      rosterCompanies?: RosterCompany[];
    };
    setPortalAccounts(data.accounts ?? []);
    setRosterCompanies(data.rosterCompanies ?? []);
  }

  async function updateAccountPortalRole(id: string, role: string) {
    setError(null);
    setRoleBusyId(id);
    try {
      const res = await fetch("/api/admin/roles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, role }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not update portal role.");
        return;
      }
      await loadRoles();
      await load();
    } finally {
      setRoleBusyId(null);
    }
  }

  async function updateStaffDesignated(id: string, staffDesignatedCompanyId: string) {
    setError(null);
    setRoleBusyId(id);
    try {
      const res = await fetch("/api/admin/roles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          staffDesignatedCompanyId: staffDesignatedCompanyId || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not update designated company.");
        return;
      }
      await loadRoles();
      await load();
    } finally {
      setRoleBusyId(null);
    }
  }

  async function updateStaffAssignmentColor(id: string, staffAssignmentColor: string) {
    setError(null);
    setRoleBusyId(id);
    try {
      const res = await fetch("/api/admin/roles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          staffAssignmentColor: staffAssignmentColor.trim() || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not update assignment color.");
        return;
      }
      await load();
      if (session?.user?.role === "SuperAdmin") {
        await loadRoles();
      }
    } finally {
      setRoleBusyId(null);
    }
  }

  const teamSelectClass = `${cn(
    "w-full min-w-0 rounded-md border border-zinc-300 bg-zinc-50 px-1.5 py-1 text-[11px] text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200",
    "focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/30",
  )} max-w-full sm:max-w-[140px]`;

  const assignmentSelectClass = `${cn(
    "w-full min-w-0 rounded-md border border-zinc-300 bg-zinc-50 px-1.5 py-1 text-[11px] text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200",
    "focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/30",
  )} max-w-full sm:max-w-[128px]`;

  function showStaffDesignatedCompany(role: string) {
    const n = normalizePortalRole(role) ?? role;
    return n === "Admin" || n === "Personnel" || n === "Customer";
  }

  const accountStatusClass = (statusRaw: string | undefined) => {
    const status = (statusRaw ?? "ACTIVE").toUpperCase();
    if (status === "SUSPENDED") return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    if (status === "DELETED") return "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300";
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  };

  const personnelRegistryPageCount = Math.max(1, Math.ceil(personnel.length / PERSONNEL_REGISTRY_PAGE_SIZE));
  const personnelRegistryPageClamped = Math.min(
    Math.max(1, personnelRegistryPage),
    personnelRegistryPageCount,
  );
  const paginatedPersonnel = useMemo(() => {
    const start = (personnelRegistryPageClamped - 1) * PERSONNEL_REGISTRY_PAGE_SIZE;
    return personnel.slice(start, start + PERSONNEL_REGISTRY_PAGE_SIZE);
  }, [personnel, personnelRegistryPageClamped]);

  const portalRegistryPageCount = Math.max(1, Math.ceil(portalAccounts.length / PERSONNEL_REGISTRY_PAGE_SIZE));
  const portalRegistryPageClamped = Math.min(
    Math.max(1, portalRegistryPage),
    portalRegistryPageCount,
  );
  const paginatedPortalAccounts = useMemo(() => {
    const start = (portalRegistryPageClamped - 1) * PERSONNEL_REGISTRY_PAGE_SIZE;
    return portalAccounts.slice(start, start + PERSONNEL_REGISTRY_PAGE_SIZE);
  }, [portalAccounts, portalRegistryPageClamped]);

  return (
    <main className="min-h-[calc(100vh-56px)] bg-zinc-50 px-3 py-4 text-zinc-900 dark:bg-[#0a0b12] dark:text-zinc-100 sm:px-4 md:py-5">
      <div className="mx-auto max-w-[min(100%,1600px)] space-y-4">
        <header className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800/90 dark:bg-[#12161c] md:p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-400/95">
            {BRAND_TITLE} · Admin console
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 dark:text-white md:text-3xl">Personnel registry</h1>
          <p className="mt-2 max-w-3xl text-xs leading-snug text-zinc-600 dark:text-zinc-400">
            {isAdminCompanyView ? (
              <>
                View staff on your company queue{scopedCompanyName ? ` (${scopedCompanyName})` : ""}. You can set
                assignment colors for Admin and Personnel here; other roster changes are done by a SuperAdmin. Your
                login:{" "}
                <Link href="/admin/account" className="text-orange-400 underline-offset-2 hover:underline">
                  My account
                </Link>
                .
              </>
            ) : (
              <>
                Manage portal roles and the designated company for staff. The company set on signup or by SuperAdmin
                immediately puts the user on that company queue. Your own login:{" "}
                <Link href="/admin/account" className="text-orange-400 underline-offset-2 hover:underline">
                  My account
                </Link>
                .
              </>
            )}
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-500">
              {isAdminCompanyView ? (
                <>
                  One row per Admin or Personnel on your company queue. Assignment colors are editable below; contact
                  a SuperAdmin to add staff or change roles.
                </>
              ) : (
                <>
                  One row per portal user (linked Agent when on roster). Duplicates? Merge extra{" "}
                  <code className="rounded bg-zinc-200 px-1 text-[10px] dark:bg-zinc-800">Agent</code> rows.
                </>
              )}
            </p>
            {!isAdminCompanyView ? (
              <button
                type="button"
                disabled={reconcileBusy}
                onClick={() => void reconcileDuplicateAgents()}
                className="shrink-0 rounded-lg border border-orange-500/50 bg-orange-500/10 px-3 py-1.5 text-[11px] font-semibold text-orange-800 transition hover:bg-orange-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:text-orange-200"
              >
                {reconcileBusy ? "Merging…" : "Merge duplicate agents"}
              </button>
            ) : null}
          </div>
        </header>

        {canManagePortalAccounts && !isAdminCompanyView ? (
          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800/90 dark:bg-[#12161c] md:p-5">
            <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-700 dark:text-zinc-400">
              Add staff portal account
            </h2>
            <p className="mt-1 text-[11px] leading-snug text-zinc-600 dark:text-zinc-500">
              Creates an <strong className="font-semibold text-zinc-800 dark:text-zinc-200">Admin</strong> or{" "}
              <strong className="font-semibold text-zinc-800 dark:text-zinc-200">Personnel</strong> login (not a
              customer company signup). The user is placed on the agent roster for the queue you pick so they appear on
              the assignment board immediately.
            </p>
            {createOk ? (
              <p className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.08] px-3 py-2 text-xs text-emerald-900 dark:text-emerald-100/90">
                {createOk}
              </p>
            ) : null}
            {createError ? (
              <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/[0.07] px-3 py-2 text-xs text-red-800 dark:text-red-200/90">
                {createError}
              </p>
            ) : null}
            <form onSubmit={(e) => void createStaffAccount(e)} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="flex flex-col gap-1 sm:col-span-1">
                <span className={authLabelClass}>Username</span>
                <input
                  required
                  value={createUsername}
                  onChange={(e) => setCreateUsername(e.target.value)}
                  autoComplete="off"
                  placeholder="jdoe"
                  className={authInputClass}
                />
              </label>
              <label className="flex flex-col gap-1 sm:col-span-1">
                <span className={authLabelClass}>Work email</span>
                <input
                  type="email"
                  required
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  autoComplete="off"
                  placeholder="jdoe@company.com"
                  className={authInputClass}
                />
              </label>
              <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-1">
                <span className={authLabelClass}>Display name</span>
                <input
                  required
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  autoComplete="off"
                  placeholder="Jane Doe"
                  className={authInputClass}
                />
              </label>
              <label className="flex flex-col gap-1 sm:col-span-1">
                <span className={authLabelClass}>Initial password</span>
                <input
                  type="password"
                  required
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className={authInputClass}
                />
              </label>
              <label className="flex flex-col gap-1 sm:col-span-1">
                <span className={authLabelClass}>Portal role</span>
                <select
                  value={createRole}
                  onChange={(e) => setCreateRole(e.target.value as "Admin" | "Personnel")}
                  className={authInputClass}
                >
                  <option value="Personnel">Personnel</option>
                  <option value="Admin">Admin</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-1">
                <span className={authLabelClass}>Designated company queue</span>
                <select
                  required
                  value={createCompanyId}
                  onChange={(e) => setCreateCompanyId(e.target.value)}
                  disabled={rosterCompanies.length === 0}
                  className={authInputClass}
                >
                  <option value="">Select company…</option>
                  {rosterCompanies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-end sm:col-span-2 lg:col-span-3">
                <button
                  type="submit"
                  disabled={createBusy || rosterCompanies.length === 0}
                  className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {createBusy ? "Creating…" : "Create staff account"}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
        ) : null}

        {pendingAccountRequests.length > 0 ? (
          <section className="rounded-xl border border-amber-400/40 bg-amber-500/[0.07] p-4 dark:border-amber-500/30 dark:bg-amber-500/[0.06]">
            <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-amber-900 dark:text-amber-200/90">
              Pending account requests
            </h2>
            <p className="mt-0.5 text-[11px] text-amber-800/90 dark:text-amber-100/70">
              Approve suspension, deletion, or password reset (default password applied on approval).
            </p>
            <ul className="mt-3 space-y-2">
              {pendingAccountRequests.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-[#0f1218] sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                      {r.requestType === "PASSWORD_RESET"
                        ? "Password reset"
                        : r.requestType === "DELETION"
                          ? "Account deletion"
                          : "Account suspension"}{" "}
                      · {r.portalAccount.name}
                    </p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">{r.portalAccount.email}</p>
                    {r.reason?.trim() ? (
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">{r.reason}</p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-zinc-500">
                      {new Date(r.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={requestReviewBusyId === r.id}
                      onClick={() => void reviewAccountRequest(r.id, "REJECTED")}
                      className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      disabled={requestReviewBusyId === r.id}
                      onClick={() => void reviewAccountRequest(r.id, "APPROVED")}
                      className="rounded-full bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
                    >
                      Approve
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {isAdminCompanyView ? (
          <>
            {scopeUnavailable ? (
              <section className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-6 dark:border-amber-500/25 dark:bg-amber-500/[0.06]">
                <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-amber-800 dark:text-amber-200/90">
                  No company queue assigned
                </h2>
                <p className="mt-1 max-w-xl text-[11px] leading-snug text-amber-900/90 dark:text-amber-100/80">
                  Your Admin account does not have a designated company yet. A SuperAdmin can set your designated company
                  under <strong className="font-semibold">Personnel</strong> so your roster appears here.
                </p>
              </section>
            ) : (
              <section className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800/90 dark:bg-[#0f1218]">
                <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800/80">
                  <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-700 dark:text-zinc-400">
                    Company roster
                  </h2>
                  <p className="mt-0.5 text-[11px] text-zinc-600 dark:text-zinc-500">
                    {scopedCompanyName ?? "Your queue"} · staff on this company board queue
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] table-fixed border-collapse divide-y divide-zinc-200 text-[11px] dark:divide-zinc-800/90">
                    <thead className="bg-zinc-100 text-left text-[10px] font-bold uppercase tracking-wide text-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-500">
                      <tr>
                        <th className="w-[15%] px-3 py-2">Name</th>
                        <th className="w-[9%] px-3 py-2">User</th>
                        <th className="w-[24%] px-3 py-2">Email</th>
                        <th className="w-[11%] px-3 py-2">Role</th>
                        <th className="w-[11%] px-3 py-2">Status</th>
                        <th className="w-[19%] px-3 py-2">Queue</th>
                        <th className="w-[11%] px-3 py-2">Assign</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/80">
                      {personnel.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-3 py-8 text-center text-xs text-zinc-600 dark:text-zinc-500">
                            No personnel are on this company queue yet.
                          </td>
                        </tr>
                      ) : (
                        paginatedPersonnel.map((row) => (
                          <tr key={row.portalAccountId} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40">
                            <td className="truncate px-3 py-2 font-medium text-zinc-900 dark:text-white" title={row.name}>
                              {row.name}
                            </td>
                            <td className="truncate px-3 py-2 text-zinc-600 dark:text-slate-400" title={row.username ?? ""}>
                              {row.username?.trim() || "—"}
                            </td>
                            <td className="truncate px-3 py-2 text-zinc-600 dark:text-slate-400" title={row.email}>
                              {row.email}
                            </td>
                            <td className="truncate px-3 py-2 text-zinc-700 dark:text-zinc-300">
                              {normalizePortalRole(row.staffRole) ?? row.staffRole}
                            </td>
                            <td className="max-w-0 px-2 py-2">
                              <span
                                className={cn(
                                  "inline-flex max-w-full truncate rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase leading-tight tracking-wide",
                                  accountStatusClass(row.accountStatus),
                                )}
                              >
                                {row.accountStatus}
                              </span>
                            </td>
                            <td className="truncate px-3 py-2 text-zinc-600" title={row.teamName}>
                              {row.teamName}
                            </td>
                            <td className="px-2 py-2">
                              <StaffAssignmentColorSelect
                                disabled={roleBusyId === row.portalAccountId}
                                value={row.staffAssignmentColor ?? ""}
                                onChange={(next) => void updateStaffAssignmentColor(row.portalAccountId, next)}
                                selectClassName={assignmentSelectClass}
                              />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <SimplePaginationBar
                  page={personnelRegistryPage}
                  pageSize={PERSONNEL_REGISTRY_PAGE_SIZE}
                  total={personnel.length}
                  onPageChange={setPersonnelRegistryPage}
                  itemLabel="users"
                />
              </section>
            )}
          </>
        ) : (
          <>
            {canManagePortalAccounts ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] text-zinc-600 dark:text-zinc-500">
                    Portal accounts · one row per account · SuperAdmin roles & designated company
                  </p>
                  <div className="inline-flex rounded-lg border border-zinc-300 bg-zinc-100 p-0.5 text-[11px] font-semibold dark:border-zinc-700 dark:bg-zinc-900/80">
                    <button
                      type="button"
                      onClick={() => setView("cards")}
                      className={cn(
                        "rounded-md px-3 py-1 transition",
                        view === "cards"
                          ? "bg-white text-zinc-900 shadow-sm dark:bg-white dark:text-zinc-900"
                          : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200",
                      )}
                    >
                      Cards
                    </button>
                    <button
                      type="button"
                      onClick={() => setView("table")}
                      className={cn(
                        "rounded-md px-3 py-1 transition",
                        view === "table"
                          ? "bg-white text-zinc-900 shadow-sm dark:bg-white dark:text-zinc-900"
                          : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200",
                      )}
                    >
                      Table
                    </button>
                  </div>
                </div>

                {view === "cards" ? (
                  <>
                    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {portalAccounts.length === 0 ? (
                      <article className="col-span-full rounded-xl border border-dashed border-zinc-300 bg-zinc-100 px-4 py-6 text-center text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/20 dark:text-zinc-500">
                        No portal accounts loaded.
                      </article>
                    ) : (
                      paginatedPortalAccounts.map((a) => (
                        <article
                          key={a.id}
                          className="flex flex-col rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-[#12161c]"
                        >
                          <div className="grid grid-cols-3 gap-2 border-b border-zinc-200 pb-3 dark:border-zinc-700/80">
                            <div className="min-w-0">
                              <p className="text-[9px] font-bold uppercase tracking-wide text-zinc-500">Name</p>
                              <p className="mt-0.5 truncate text-sm font-semibold text-zinc-900 dark:text-white" title={a.name}>
                                {a.name}
                              </p>
                            </div>
                            <div className="min-w-0">
                              <p className="text-[9px] font-bold uppercase tracking-wide text-zinc-500">User</p>
                              <p className="mt-0.5 truncate text-xs font-medium text-zinc-800 dark:text-zinc-200" title={a.username ?? ""}>
                                {a.username?.trim() ? a.username : "—"}
                              </p>
                            </div>
                            <div className="min-w-0">
                              <p className="text-[9px] font-bold uppercase tracking-wide text-zinc-500">Hash</p>
                              <p className="mt-0.5 font-mono text-[11px] tracking-widest text-zinc-600 dark:text-zinc-400">
                                {passwordHashLabel(a.passwordHash)}
                              </p>
                            </div>
                          </div>
                          <p className="mt-2 truncate text-xs text-zinc-600 dark:text-slate-400" title={a.email}>
                            {a.email}
                          </p>
                          <div className="mt-2">
                            <span
                              className={cn(
                                "inline-flex rounded border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                                accountStatusClass(a.accountStatus),
                              )}
                            >
                              {a.accountStatus ?? "ACTIVE"}
                            </span>
                          </div>
                          <label className="mt-2 flex flex-col gap-0.5">
                            <span className="text-[9px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
                              Roles
                            </span>
                            <select
                              disabled={roleBusyId === a.id}
                              value={(normalizePortalRole(a.role) ?? "Customer") as (typeof PORTAL_ROLES)[number]}
                              onChange={(e) => void updateAccountPortalRole(a.id, e.target.value)}
                              className={teamSelectClass}
                            >
                              {PORTAL_ROLES.map((r) => (
                                <option key={r} value={r}>
                                  {portalRegistryRoleLabel(r)}
                                </option>
                              ))}
                            </select>
                          </label>
                          {showStaffDesignatedCompany(a.role) ? (
                            isStaffPortalRole(a.role) ? (
                              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <label className="flex min-w-0 flex-col gap-0.5">
                                  <span className="text-[9px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
                                    Company
                                  </span>
                                  <select
                                    value={a.staffDesignatedCompanyId ?? ""}
                                    disabled={roleBusyId === a.id || rosterCompanies.length === 0}
                                    onChange={(e) =>
                                      void updateStaffDesignated(
                                        a.id,
                                        e.target.value === ALL_SBUS_VALUE ? "" : e.target.value,
                                      )
                                    }
                                    className={teamSelectClass}
                                  >
                                    <option value="">-</option>
                                    <option value={ALL_SBUS_VALUE}>ALL SBU's</option>
                                    {rosterCompanies.map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="flex min-w-0 flex-col gap-0.5">
                                  <span className="text-[9px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
                                    Assignment color
                                  </span>
                                  <StaffAssignmentColorSelect
                                    value={a.staffAssignmentColor ?? ""}
                                    disabled={roleBusyId === a.id}
                                    onChange={(next) => void updateStaffAssignmentColor(a.id, next)}
                                    selectClassName={assignmentSelectClass}
                                  />
                                </label>
                              </div>
                            ) : (
                              <label className="mt-2 flex flex-col gap-0.5">
                                <span className="text-[9px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
                                  Company
                                </span>
                                <select
                                  value={a.staffDesignatedCompanyId ?? ""}
                                  disabled={roleBusyId === a.id || rosterCompanies.length === 0}
                                  onChange={(e) =>
                                    void updateStaffDesignated(
                                      a.id,
                                      e.target.value === ALL_SBUS_VALUE ? "" : e.target.value,
                                    )
                                  }
                                  className={teamSelectClass}
                                >
                                  <option value="">-</option>
                                  <option value={ALL_SBUS_VALUE}>ALL SBU's</option>
                                  {rosterCompanies.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )
                          ) : isStaffPortalRole(a.role) ? (
                            <label className="mt-2 flex flex-col gap-0.5">
                              <span className="text-[9px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
                                Assignment color
                              </span>
                              <StaffAssignmentColorSelect
                                value={a.staffAssignmentColor ?? ""}
                                disabled={roleBusyId === a.id}
                                onChange={(next) => void updateStaffAssignmentColor(a.id, next)}
                                selectClassName={assignmentSelectClass}
                              />
                            </label>
                          ) : null}
                          {a.agentId ? (
                            <button
                              type="button"
                              disabled={roleBusyId === a.id}
                              onClick={() => void removeFromRoster(a.id, a.agentId)}
                              className="mt-3 inline-flex w-full items-center justify-center rounded-lg border border-zinc-300 bg-transparent py-1.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-500 dark:text-zinc-200 dark:hover:border-zinc-400 dark:hover:bg-zinc-800/50"
                            >
                              Remove from roster
                            </button>
                          ) : null}
                        </article>
                      ))
                    )}
                  </section>
                  <SimplePaginationBar
                    page={portalRegistryPage}
                    pageSize={PERSONNEL_REGISTRY_PAGE_SIZE}
                    total={portalAccounts.length}
                    onPageChange={setPortalRegistryPage}
                    itemLabel="users"
                    className="mt-2 rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800/90 dark:bg-[#0f1218]"
                  />
                </>
                ) : (
                  <section className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800/90 dark:bg-[#0f1218]">
                    <table className="w-full table-fixed border-collapse divide-y divide-zinc-200 text-[11px] dark:divide-zinc-800/90">
                      <thead className="bg-zinc-100 text-left text-[10px] font-bold uppercase tracking-wide text-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-500">
                        <tr>
                          <th className="w-[11%] px-2 py-2">Name</th>
                          <th className="w-[8%] px-2 py-2">User</th>
                          <th className="w-[9%] px-2 py-2">Hash</th>
                          <th className="w-[18%] px-2 py-2">Email</th>
                          <th className="w-[8%] px-2 py-2">Status</th>
                          <th className="w-[10%] px-2 py-2">Roles</th>
                          <th className="w-[12%] px-2 py-2">Co.</th>
                          <th className="w-[10%] px-2 py-2">Color</th>
                          <th className="w-[14%] px-2 py-2 text-right">Act.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/80">
                        {portalAccounts.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="px-3 py-8 text-center text-xs text-zinc-600 dark:text-zinc-500">
                              No portal accounts loaded.
                            </td>
                          </tr>
                        ) : (
                          paginatedPortalAccounts.map((a) => (
                            <tr key={a.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40">
                              <td className="truncate px-2 py-1.5 font-medium text-zinc-900 dark:text-white" title={a.name}>
                                {a.name}
                              </td>
                              <td className="truncate px-2 py-1.5 text-zinc-600 dark:text-slate-400" title={a.username ?? ""}>
                                {a.username ?? "—"}
                              </td>
                              <td className="px-2 py-1.5 font-mono text-[10px] tracking-widest text-zinc-600 dark:text-zinc-400">
                                {passwordHashLabel(a.passwordHash)}
                              </td>
                              <td className="truncate px-2 py-1.5 text-zinc-600 dark:text-slate-400" title={a.email}>
                                {a.email}
                              </td>
                              <td className="max-w-0 px-1 py-1">
                                <span
                                  className={cn(
                                    "inline-flex max-w-full truncate rounded border px-1 py-0.5 text-[8px] font-bold uppercase leading-tight tracking-wide",
                                    accountStatusClass(a.accountStatus),
                                  )}
                                  title={a.accountStatus ?? "ACTIVE"}
                                >
                                  {a.accountStatus ?? "ACTIVE"}
                                </span>
                              </td>
                              <td className="px-1 py-1">
                                <select
                                  disabled={roleBusyId === a.id}
                                  value={(normalizePortalRole(a.role) ?? "Customer") as (typeof PORTAL_ROLES)[number]}
                                  onChange={(e) => void updateAccountPortalRole(a.id, e.target.value)}
                                  className={teamSelectClass}
                                >
                                  {PORTAL_ROLES.map((r) => (
                                    <option key={r} value={r}>
                                      {portalRegistryRoleLabel(r)}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-1 py-1">
                                {showStaffDesignatedCompany(a.role) ? (
                                  <select
                                    disabled={roleBusyId === a.id || rosterCompanies.length === 0}
                                    value={a.staffDesignatedCompanyId ?? ""}
                                    onChange={(e) =>
                                      void updateStaffDesignated(
                                        a.id,
                                        e.target.value === ALL_SBUS_VALUE ? "" : e.target.value,
                                      )
                                    }
                                    className={teamSelectClass}
                                  >
                                    <option value="">-</option>
                                    <option value={ALL_SBUS_VALUE}>ALL SBU's</option>
                                    {rosterCompanies.map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.name}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="text-[10px] text-zinc-500">—</span>
                                )}
                              </td>
                              <td className="px-1 py-1">
                                {isStaffPortalRole(a.role) ? (
                                  <StaffAssignmentColorSelect
                                    disabled={roleBusyId === a.id}
                                    value={a.staffAssignmentColor ?? ""}
                                    onChange={(next) => void updateStaffAssignmentColor(a.id, next)}
                                    selectClassName={assignmentSelectClass}
                                  />
                                ) : (
                                  <span className="text-[10px] text-zinc-500">—</span>
                                )}
                              </td>
                              <td className="px-2 py-1 text-right">
                                {a.agentId ? (
                                  <button
                                    type="button"
                                    disabled={roleBusyId === a.id}
                                    onClick={() => void removeFromRoster(a.id, a.agentId)}
                                    className="rounded-md border border-zinc-300 bg-transparent px-2 py-0.5 text-[10px] font-medium text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-500 dark:text-zinc-200 dark:hover:border-zinc-400 dark:hover:bg-zinc-800/50"
                                  >
                                    Remove
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-zinc-500">—</span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                    <SimplePaginationBar
                      page={portalRegistryPage}
                      pageSize={PERSONNEL_REGISTRY_PAGE_SIZE}
                      total={portalAccounts.length}
                      onPageChange={setPortalRegistryPage}
                      itemLabel="users"
                    />
                  </section>
                )}
              </>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
