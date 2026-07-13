"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { X } from "lucide-react";

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;

type CompanyOption = { id: string; name: string };

async function fetchPublicCompanies(): Promise<CompanyOption[] | null> {
  try {
    const r = await fetch("/api/public/companies", { cache: "no-store" });
    if (!r.ok) return null;
    const rows = (await r.json()) as CompanyOption[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return null;
  }
}

export function UsernameSetupDialog() {
  const { data: session, status, update } = useSession();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [isStaff, setIsStaff] = useState(true);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companiesStatus, setCompaniesStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const applyCompanyList = useCallback((list: CompanyOption[] | null) => {
    if (list === null) {
      setCompanies([]);
      setCompaniesStatus("error");
      return;
    }
    setCompanies(list);
    setCompaniesStatus("ready");
    setCompanyId((prev) => (prev && list.some((c) => c.id === prev) ? prev : ""));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await fetchPublicCompanies();
      if (!cancelled) applyCompanyList(list);
    })();
    return () => { cancelled = true; };
  }, [applyCompanyList]);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "authenticated" && session?.needsUsername) {
      setOpen(true);
    } else {
      setOpen(false);
    }
  }, [status, session?.needsUsername]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const trimmed = username.trim();
    if (!USERNAME_RE.test(trimmed)) {
      setError("Username must be 3–32 characters and may only contain letters, numbers, periods, underscores, and hyphens.");
      return;
    }

    if (!companyId) {
      setError("Select the company you belong to.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/auth/set-username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmed, companyId, customerOrgRole: isStaff ? "Personnel" : "Customer" }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not set username.");
        return;
      }
      await update();
      window.location.reload();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative mx-4 w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="absolute right-3 top-3 rounded-full p-1 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          <X className="size-4" />
        </button>

        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Complete your account</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Choose a username and company to finish setting up your account.
        </p>

        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
              Username
            </span>
            <input
              ref={inputRef}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              placeholder="your_username"
              className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-orange-400/70 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsStaff(false)}
              className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                !isStaff
                  ? "border-orange-400/70 bg-orange-500/10 text-orange-700 shadow-sm dark:text-orange-300"
                  : "border-zinc-300 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              Customer
            </button>
            <button
              type="button"
              onClick={() => setIsStaff(true)}
              className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                isStaff
                  ? "border-orange-400/70 bg-orange-500/10 text-orange-700 shadow-sm dark:text-orange-300"
                  : "border-zinc-300 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              Staff (Personnel)
            </button>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
              Company
            </span>
            {companiesStatus === "loading" ? (
              <p className="flex items-center rounded-xl border border-zinc-300 bg-zinc-50 px-3.5 py-2.5 text-xs text-zinc-500 dark:border-zinc-600 dark:bg-zinc-800">
                Loading companies…
              </p>
            ) : companiesStatus === "error" ? (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-900 dark:text-amber-100/90">
                Could not load companies.
              </p>
            ) : (
              <select
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                required
                className="w-full cursor-pointer rounded-xl border border-zinc-300 bg-zinc-50 px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-orange-400/70 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="">Select company…</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </label>

          {error ? (
            <p className="rounded-lg border border-red-500/30 bg-red-500/[0.07] px-2.5 py-2 text-xs text-red-700 dark:text-red-200/90">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy || companiesStatus !== "ready"}
            className="flex h-11 w-full items-center justify-center rounded-xl bg-orange-600 text-sm font-bold text-white shadow-[0_6px_20px_rgba(234,88,12,0.35)] transition hover:bg-orange-700 active:translate-y-px disabled:pointer-events-none disabled:opacity-55"
          >
            {busy ? "Saving…" : "Complete setup"}
          </button>
        </form>
      </div>
    </div>
  );
}
