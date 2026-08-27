"use client";

import { useCallback, useEffect, useMemo, useState, Fragment } from "react";
import { Layers, Shield, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ACCESS_CONTROL_ROLES,
  accessCapabilityGroups,
  defaultAccessControlConfig,
  mergeAccessControlConfig,
  type AccessCapabilityId,
  type AccessControlConfig,
} from "@/lib/access-controls";
import { formatOrgChartLevelLabel } from "@/app/admin/superadmin-settings/org-chart-layers";
import type { PortalRole } from "@/lib/staff-role";
import { cn } from "@/lib/cn";

type MatrixMode = "roles" | "layers";

export function AccessControlsPanel({
  maxOrgLayer = 1,
}: {
  /** Highest layer currently present on the org chart (at least 1). */
  maxOrgLayer?: number;
}) {
  const configuredMaxLayer = Math.max(5, maxOrgLayer);
  const [mode, setMode] = useState<MatrixMode>("roles");
  const [config, setConfig] = useState<AccessControlConfig>(() =>
    defaultAccessControlConfig(configuredMaxLayer),
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const groups = useMemo(() => accessCapabilityGroups(), []);
  const layerKeys = useMemo(() => {
    const keys = new Set<string>();
    for (let i = 1; i <= configuredMaxLayer; i++) keys.add(String(i));
    for (const key of Object.keys(config.layers)) keys.add(key);
    return [...keys]
      .map((k) => Number(k))
      .filter((n) => Number.isInteger(n) && n >= 1)
      .sort((a, b) => a - b)
      .map(String);
  }, [config.layers, configuredMaxLayer]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/access-controls?maxLayer=${encodeURIComponent(String(configuredMaxLayer))}`,
        { cache: "no-store" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        config?: unknown;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not load access controls.");
        return;
      }
      setConfig(mergeAccessControlConfig(data.config, configuredMaxLayer));
      setDirty(false);
    } catch {
      setError("Could not load access controls.");
    } finally {
      setLoading(false);
    }
  }, [configuredMaxLayer]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleRole(role: PortalRole, capabilityId: AccessCapabilityId) {
    setConfig((prev) => ({
      ...prev,
      roles: {
        ...prev.roles,
        [role]: {
          ...prev.roles[role],
          [capabilityId]: !prev.roles[role][capabilityId],
        },
      },
    }));
    setDirty(true);
    setMessage(null);
  }

  function toggleLayer(layerKey: string, capabilityId: AccessCapabilityId) {
    setConfig((prev) => {
      const current = prev.layers[layerKey] ?? defaultAccessControlConfig(configuredMaxLayer).layers["1"];
      return {
        ...prev,
        layers: {
          ...prev.layers,
          [layerKey]: {
            ...current,
            [capabilityId]: !current[capabilityId],
          },
        },
      };
    });
    setDirty(true);
    setMessage(null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/access-controls", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, maxLayer: configuredMaxLayer }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        config?: unknown;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not save access controls.");
        return;
      }
      setConfig(mergeAccessControlConfig(data.config, configuredMaxLayer));
      setDirty(false);
      setMessage("Access controls saved.");
    } catch {
      setError("Could not save access controls.");
    } finally {
      setBusy(false);
    }
  }

  async function resetDefaults() {
    if (
      !window.confirm(
        "Reset Access Controls to the platform defaults? This overwrites the saved matrix.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/access-controls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxLayer: configuredMaxLayer }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        config?: unknown;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not reset access controls.");
        return;
      }
      setConfig(mergeAccessControlConfig(data.config, configuredMaxLayer));
      setDirty(false);
      setMessage("Access controls reset to defaults.");
    } catch {
      setError("Could not reset access controls.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-zinc-200/80 bg-white/95 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" />
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Access Controls
              </h2>
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              Configure what each portal role can access, and optional grants by org-chart level
              (Level 1 = top of the chart). Role permissions are the base; level toggles are
              additional grants for people on that level. Saving stores the matrix for SuperAdmin
              review — wire enforcement as a follow-up if needed.
            </p>
            {maxOrgLayer > 0 ? (
              <p className="mt-1 text-[11px] text-zinc-500">
                Org chart currently reaches {formatOrgChartLevelLabel(maxOrgLayer)}. Matrix shows
                through {formatOrgChartLevelLabel(configuredMaxLayer)}.
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-xl px-4"
              disabled={busy || loading}
              onClick={() => void resetDefaults()}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset defaults
            </Button>
            <Button
              type="button"
              className="h-10 rounded-xl px-4"
              disabled={busy || loading || !dirty}
              onClick={() => void save()}
            >
              <Save className="mr-2 h-4 w-4" />
              Save changes
            </Button>
          </div>
        </div>

        <div className="mt-4">
          <Tabs value={mode} onValueChange={(v) => setMode(v as MatrixMode)}>
            <TabsList className="rounded-full border border-zinc-300 bg-zinc-100 p-1 text-xs dark:border-zinc-700 dark:bg-zinc-950">
              <TabsTrigger
                value="roles"
                className="rounded-full px-3 py-1.5 text-xs data-[state=active]:bg-zinc-900 data-[state=active]:text-white dark:data-[state=active]:bg-white dark:data-[state=active]:text-zinc-900"
              >
                <Shield className="mr-1.5 inline h-3.5 w-3.5" />
                By role
              </TabsTrigger>
              <TabsTrigger
                value="layers"
                className="rounded-full px-3 py-1.5 text-xs data-[state=active]:bg-zinc-900 data-[state=active]:text-white dark:data-[state=active]:bg-white dark:data-[state=active]:text-zinc-900"
              >
                <Layers className="mr-1.5 inline h-3.5 w-3.5" />
                By org chart level
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {message ? (
          <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-100">
            {error}
          </p>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/95 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {loading ? (
          <p className="px-5 py-10 text-center text-sm text-zinc-500">Loading access controls…</p>
        ) : mode === "roles" ? (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/60">
                  <th className="sticky left-0 z-10 bg-zinc-50 px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:bg-zinc-950/60">
                    Capability
                  </th>
                  {ACCESS_CONTROL_ROLES.map((role) => (
                    <th
                      key={role}
                      className="min-w-[7.5rem] px-3 py-3 text-center text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-300"
                    >
                      {role}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <Fragment key={`g-${group.group}`}>
                    <tr className="bg-orange-50/60 dark:bg-orange-950/20">
                      <td
                        colSpan={ACCESS_CONTROL_ROLES.length + 1}
                        className="px-4 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-orange-800 dark:text-orange-200"
                      >
                        {group.group}
                      </td>
                    </tr>
                    {group.items.map((cap) => (
                      <tr
                        key={cap.id}
                        className="border-b border-zinc-100 dark:border-zinc-800/80"
                      >
                        <td className="sticky left-0 z-10 bg-white px-4 py-2.5 font-medium text-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
                          {cap.label}
                        </td>
                        {ACCESS_CONTROL_ROLES.map((role) => {
                          const on = Boolean(config.roles[role]?.[cap.id]);
                          return (
                            <td key={`${role}-${cap.id}`} className="px-3 py-2 text-center">
                              <input
                                type="checkbox"
                                checked={on}
                                disabled={busy}
                                aria-label={`${role}: ${cap.label}`}
                                onChange={() => toggleRole(role, cap.id)}
                                className={cn(
                                  "h-4 w-4 cursor-pointer rounded border-zinc-300 text-orange-600 focus:ring-orange-500/30 disabled:cursor-not-allowed",
                                )}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/60">
                  <th className="sticky left-0 z-10 bg-zinc-50 px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:bg-zinc-950/60">
                    Capability
                  </th>
                  {layerKeys.map((layer) => (
                    <th
                      key={layer}
                      className="min-w-[6.5rem] px-3 py-3 text-center text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-300"
                    >
                      {formatOrgChartLevelLabel(Number(layer))}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <Fragment key={`lg-${group.group}`}>
                    <tr className="bg-orange-50/60 dark:bg-orange-950/20">
                      <td
                        colSpan={layerKeys.length + 1}
                        className="px-4 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-orange-800 dark:text-orange-200"
                      >
                        {group.group}
                      </td>
                    </tr>
                    {group.items.map((cap) => (
                      <tr
                        key={`l-${cap.id}`}
                        className="border-b border-zinc-100 dark:border-zinc-800/80"
                      >
                        <td className="sticky left-0 z-10 bg-white px-4 py-2.5 font-medium text-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
                          {cap.label}
                        </td>
                        {layerKeys.map((layer) => {
                          const on = Boolean(config.layers[layer]?.[cap.id]);
                          return (
                            <td key={`${layer}-${cap.id}`} className="px-3 py-2 text-center">
                              <input
                                type="checkbox"
                                checked={on}
                                disabled={busy}
                                aria-label={`${formatOrgChartLevelLabel(Number(layer))}: ${cap.label}`}
                                onChange={() => toggleLayer(layer, cap.id)}
                                className="h-4 w-4 cursor-pointer rounded border-zinc-300 text-orange-600 focus:ring-orange-500/30 disabled:cursor-not-allowed"
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
            <p className="border-t border-zinc-100 px-4 py-3 text-[11px] text-zinc-500 dark:border-zinc-800">
              Checked cells grant the capability to members currently sitting on that org-chart
              level, in addition to their portal role.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
