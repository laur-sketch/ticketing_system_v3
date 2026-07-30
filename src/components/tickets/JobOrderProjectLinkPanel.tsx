"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ProjectOption = {
  id: string;
  displayName: string;
  title: string;
  mainTask: string | null;
  itProjectName: string | null;
};

type LinkedProject = ProjectOption;

type Prefill = {
  ticketId: string;
  ticketNumber: string;
  teamId: string | null;
  alreadyLinkedProjectId: string | null;
  suggestedProjectName: string;
};

type CompanyAdmin = {
  id: string;
  name: string;
  email: string;
};

type ProjectRequest = {
  pending: boolean;
  targetAdminAgentId?: string | null;
  targetAdminAgentName?: string | null;
  requestedByAgentId?: string | null;
  requestedByAgentName?: string | null;
  note?: string | null;
};

export function JobOrderProjectLinkPanel({
  ticketId,
  canCreateProject,
  canRequestProject,
  sessionAgentId = null,
}: {
  ticketId: string;
  /** Admin / SuperAdmin / company coordinator — can open Task management create flow. */
  canCreateProject: boolean;
  /** Assigned Personnel — request an Admin to create the project. */
  canRequestProject: boolean;
  sessionAgentId?: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkedProject, setLinkedProject] = useState<LinkedProject | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [companyAdmins, setCompanyAdmins] = useState<CompanyAdmin[]>([]);
  const [projectRequest, setProjectRequest] = useState<ProjectRequest>({ pending: false });
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [selectedAdminId, setSelectedAdminId] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/job-order-project?listProjects=1`, {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        linkedProject?: LinkedProject | null;
        projects?: ProjectOption[];
        prefill?: Prefill;
        companyAdmins?: CompanyAdmin[];
        projectRequest?: ProjectRequest;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not load project link options.");
        return;
      }
      setLinkedProject(data.linkedProject ?? null);
      setProjects(data.projects ?? []);
      setPrefill(data.prefill ?? null);
      setCompanyAdmins(data.companyAdmins ?? []);
      setProjectRequest(data.projectRequest ?? { pending: false });
      setSelectedId(data.linkedProject?.id ?? "");
      if (data.projectRequest?.pending && data.projectRequest.targetAdminAgentId) {
        setSelectedAdminId(data.projectRequest.targetAdminAgentId);
      }
    } catch {
      setError("Could not load project link options.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per ticket
  }, [ticketId]);

  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => {
      const hay = `${p.displayName} ${p.title} ${p.mainTask ?? ""} ${p.itProjectName ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [projects, query]);

  const isTargetedAdmin =
    projectRequest.pending &&
    Boolean(
      sessionAgentId &&
        projectRequest.targetAdminAgentId &&
        sessionAgentId === projectRequest.targetAdminAgentId,
    );

  async function linkSelected() {
    if (!selectedId) {
      setError("Select a project to link.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tickets/${ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "link_job_order_project", kpiMaintenanceId: selectedId }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      linkedProject?: LinkedProject | null;
    };
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Could not link project.");
      return;
    }
    setLinkedProject(data.linkedProject ?? null);
    setProjectRequest({ pending: false });
    router.refresh();
  }

  async function unlink() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tickets/${ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unlink_job_order_project" }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Could not unlink project.");
      return;
    }
    setLinkedProject(null);
    setSelectedId("");
    router.refresh();
  }

  async function requestProject() {
    if (!selectedAdminId) {
      setError("Select a company Admin to create the Task Project.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tickets/${ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "request_job_order_project",
        targetAdminAgentId: selectedAdminId,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      projectRequest?: ProjectRequest;
    };
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Could not submit Task Project request.");
      return;
    }
    setProjectRequest(data.projectRequest ?? { pending: true });
    router.refresh();
  }

  async function cancelRequest() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tickets/${ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel_job_order_project_request" }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      projectRequest?: ProjectRequest;
    };
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Could not cancel request.");
      return;
    }
    setProjectRequest(data.projectRequest ?? { pending: false });
    setSelectedAdminId("");
    router.refresh();
  }

  const createHref = (() => {
    const params = new URLSearchParams();
    params.set("fromJobOrder", ticketId);
    if (prefill?.teamId) params.set("company", prefill.teamId);
    return `/agent/tasks?${params.toString()}`;
  })();

  return (
    <div className="mt-4 rounded-xl border border-orange-400/30 bg-orange-500/[0.06] p-3 sm:p-4 dark:border-orange-500/25 dark:bg-orange-500/10">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-orange-900 dark:text-orange-200">
            Related Task Board project
          </p>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            {canCreateProject
              ? "Link this Job Order to an existing project, or create one from these details."
              : canRequestProject
                ? "Link an existing project, or request a company Admin to create a Task Project."
                : "Link this Job Order to an existing Task Board project."}
          </p>
        </div>
        {canCreateProject && !linkedProject ? (
          <Link
            href={createHref}
            className="inline-flex shrink-0 items-center rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-orange-500"
          >
            Create Related Project
          </Link>
        ) : null}
      </div>

      {loading ? (
        <p className="mt-3 text-xs text-zinc-500">Loading projects…</p>
      ) : linkedProject ? (
        <div className="mt-3 space-y-2">
          <div className="rounded-lg border border-zinc-200 bg-white/80 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950/50">
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Linked project</p>
            <p className="mt-0.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {linkedProject.displayName}
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">{linkedProject.title}</p>
            <Link
              href={`/agent/tasks?task=${encodeURIComponent(linkedProject.id)}${
                prefill?.teamId ? `&company=${encodeURIComponent(prefill.teamId)}` : ""
              }`}
              className="mt-2 inline-flex text-xs font-semibold text-orange-700 hover:underline dark:text-orange-300"
            >
              Open on Task Board
            </Link>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void unlink()}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:border-rose-400/50 hover:text-rose-700 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            Unlink project
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {projectRequest.pending ? (
            <div
              className={`rounded-lg border px-3 py-2 ${
                isTargetedAdmin
                  ? "border-orange-400/50 bg-orange-500/15 dark:border-orange-400/40 dark:bg-orange-500/20"
                  : "border-zinc-200 bg-white/80 dark:border-zinc-700 dark:bg-zinc-950/50"
              }`}
            >
              <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                Task Project request pending
              </p>
              <p className="mt-0.5 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {isTargetedAdmin
                  ? `${projectRequest.requestedByAgentName?.trim() || "Personnel"} asked you to create a Task Project for this Job Order.`
                  : `Requested from ${projectRequest.targetAdminAgentName?.trim() || "company Admin"}.`}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {isTargetedAdmin || canCreateProject ? (
                  <Link
                    href={createHref}
                    className="inline-flex rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-orange-500"
                  >
                    Create Task Project
                  </Link>
                ) : null}
                {canRequestProject || canCreateProject ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void cancelRequest()}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:border-rose-400/50 hover:text-rose-700 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                  >
                    Cancel request
                  </button>
                ) : null}
              </div>
            </div>
          ) : canRequestProject && !canCreateProject ? (
            <div className="space-y-2 rounded-lg border border-zinc-200 bg-white/60 p-3 dark:border-zinc-700 dark:bg-zinc-950/40">
              <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
                Request Task Project
              </p>
              <label className="block text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
                Company Admin
                <select
                  value={selectedAdminId}
                  onChange={(e) => setSelectedAdminId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  <option value="">Select Admin…</option>
                  {companyAdmins.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.email ? ` · ${a.email}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              {companyAdmins.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  No Admins found for this company. Ask a SuperAdmin to assign company Admins.
                </p>
              ) : null}
              <button
                type="button"
                disabled={busy || !selectedAdminId}
                onClick={() => void requestProject()}
                className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
              >
                Request Task Project
              </button>
            </div>
          ) : null}

          <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
              Search projects
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type to filter by name…"
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-500">
              Select project
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              >
                <option value="">Choose a project…</option>
                {filteredProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName}
                    {p.title && p.title !== p.displayName ? ` · ${p.title}` : ""}
                  </option>
                ))}
              </select>
            </label>
            {filteredProjects.length === 0 ? (
              <p className="text-xs text-zinc-500">
                No matching projects for this company.
                {canCreateProject
                  ? " Use Create Related Project to start one."
                  : canRequestProject
                    ? " Request a company Admin to create one."
                    : ""}
              </p>
            ) : null}
            <button
              type="button"
              disabled={busy || !selectedId}
              onClick={() => void linkSelected()}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              Link selected project
            </button>
          </div>
        </div>
      )}

      {error ? (
        <p className="mt-2 rounded-lg border border-rose-400/40 bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-700 dark:text-rose-200">
          {error}
        </p>
      ) : null}
    </div>
  );
}
