"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

type MapLocationPickerProps = {
  latitude: number | null;
  longitude: number | null;
  onChange?: (coords: { latitude: number; longitude: number }) => void;
  className?: string;
  heightClassName?: string;
  /** View-only pin (no click/drag). */
  readOnly?: boolean;
};

const DEFAULT_CENTER: [number, number] = [14.5995, 120.9842]; // Manila

/**
 * Leaflet map pin picker (OpenStreetMap tiles). Click to set GPS; Turf-ready lat/lng numbers.
 * Loaded only on the client to avoid SSR issues with Leaflet.
 */
export function MapLocationPicker({
  latitude,
  longitude,
  onChange,
  className,
  heightClassName = "h-48",
  readOnly = false,
}: MapLocationPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markerRef = useRef<import("leaflet").Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;

  useEffect(() => {
    let cancelled = false;
    async function setup() {
      if (!containerRef.current || mapRef.current) return;
      const L = (await import("leaflet")).default;
      // Ensure default marker icons resolve under webpack/Next.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      if (cancelled || !containerRef.current) return;
      const hasPin =
        typeof latitude === "number" &&
        typeof longitude === "number" &&
        Number.isFinite(latitude) &&
        Number.isFinite(longitude);
      const center: [number, number] = hasPin ? [latitude, longitude] : DEFAULT_CENTER;
      const map = L.map(containerRef.current, {
        center,
        zoom: hasPin ? 14 : 11,
        scrollWheelZoom: false,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
        maxZoom: 19,
      }).addTo(map);

      if (hasPin) {
        markerRef.current = L.marker(center, { draggable: !readOnlyRef.current }).addTo(map);
        if (!readOnlyRef.current) {
          markerRef.current.on("dragend", () => {
            const pos = markerRef.current?.getLatLng();
            if (!pos) return;
            onChangeRef.current?.({ latitude: pos.lat, longitude: pos.lng });
          });
        }
      }

      if (!readOnlyRef.current) {
        map.on("click", (e: import("leaflet").LeafletMouseEvent) => {
          const { lat, lng } = e.latlng;
          if (markerRef.current) {
            markerRef.current.setLatLng([lat, lng]);
          } else {
            markerRef.current = L.marker([lat, lng], { draggable: true }).addTo(map);
            markerRef.current.on("dragend", () => {
              const pos = markerRef.current?.getLatLng();
              if (!pos) return;
              onChangeRef.current?.({ latitude: pos.lat, longitude: pos.lng });
            });
          }
          onChangeRef.current?.({ latitude: lat, longitude: lng });
        });
      }
      mapRef.current = map;
      // Fix grey tiles when opened inside a modal.
      requestAnimationFrame(() => map.invalidateSize());
    }
    void setup();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Initialize once per mount; lat/lng sync handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (
      typeof latitude !== "number" ||
      typeof longitude !== "number" ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return;
    }
    void import("leaflet").then((mod) => {
      const L = mod.default;
      if (markerRef.current) {
        markerRef.current.setLatLng([latitude, longitude]);
      } else {
        markerRef.current = L.marker([latitude, longitude], { draggable: !readOnlyRef.current }).addTo(map);
        if (!readOnlyRef.current) {
          markerRef.current.on("dragend", () => {
            const pos = markerRef.current?.getLatLng();
            if (!pos) return;
            onChangeRef.current?.({ latitude: pos.lat, longitude: pos.lng });
          });
        }
      }
      map.setView([latitude, longitude], Math.max(map.getZoom(), 14));
    });
  }, [latitude, longitude]);

  return (
    <div className={cn("overflow-hidden rounded-xl border border-zinc-300 dark:border-zinc-700", className)}>
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
        crossOrigin=""
      />
      <div ref={containerRef} className={cn("w-full bg-zinc-100 dark:bg-zinc-900", heightClassName)} />
      <p className="border-t border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
        {readOnly
          ? "Check-in GPS pin"
          : "Click the map to drop a pin, or drag the marker to adjust GPS."}
        {typeof latitude === "number" && typeof longitude === "number"
          ? ` · ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
          : ""}
      </p>
    </div>
  );
}
