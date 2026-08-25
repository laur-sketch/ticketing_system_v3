"use client";

import { useEffect } from "react";
import { rememberSearchItem, type GlobalSearchResultKind } from "@/lib/global-search";

type Props = {
  id: string;
  kind: GlobalSearchResultKind;
  title: string;
  subtitle?: string;
  href: string;
  status?: string;
  requestType?: string;
  badge?: string;
};

/** Persists a viewed page into command-palette recent items (localStorage). */
export function TrackRecentSearchVisit({
  id,
  kind,
  title,
  subtitle,
  href,
  status,
  requestType,
  badge,
}: Props) {
  useEffect(() => {
    rememberSearchItem({
      id,
      kind,
      title,
      subtitle,
      href,
      status,
      requestType,
      badge,
    });
  }, [id, kind, title, subtitle, href, status, requestType, badge]);

  return null;
}
