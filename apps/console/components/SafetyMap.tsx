"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { SafetyBoardItem } from "@/lib/types";
import { safetyColor } from "@/lib/colors";
import { DEMO_TURF_CENTER, DEMO_TURF_POLYGON } from "@/lib/constants";
import { formatDurationCompact } from "@/lib/format";

const MAP_STYLE = "https://demotiles.maplibre.org/style.json";

export default function SafetyMap({
  items,
  selectedId,
}: {
  items: SafetyBoardItem[];
  selectedId: string | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: DEMO_TURF_CENTER,
      zoom: 13.5,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }));
    map.on("load", () => {
      map.addSource("demo-turf", { type: "geojson", data: DEMO_TURF_POLYGON });
      map.addLayer({
        id: "demo-turf-fill",
        type: "fill",
        source: "demo-turf",
        paint: { "fill-color": "#0ea5e9", "fill-opacity": 0.08 },
      });
      map.addLayer({
        id: "demo-turf-line",
        type: "line",
        source: "demo-turf",
        paint: { "line-color": "#0ea5e9", "line-width": 2, "line-dasharray": [2, 1.5] },
      });
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Every marker on this pane is a safety event — reserved red, pulsing, same visual family
  // as the Live Ops board's safety markers and never mixed with any accountability styling.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function render(map: maplibregl.Map) {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();

      for (const item of items) {
        if (!item.lastKnownGeom) continue;
        const isSelected = item.id === selectedId;
        const el = document.createElement("div");
        el.className = "safety-marker-pulse";
        el.style.width = isSelected ? "22px" : "14px";
        el.style.height = isSelected ? "22px" : "14px";
        el.style.borderRadius = "9999px";
        el.style.backgroundColor = safetyColor.DEFAULT;
        el.style.border = `${isSelected ? 3 : 2}px solid white`;
        el.title = `${item.userName} — dark ${formatDurationCompact(item.timeDarkSeconds)}`;

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([item.lastKnownGeom.lng, item.lastKnownGeom.lat])
          .addTo(map);
        markersRef.current.set(item.id, marker);
      }
    }

    if (map.isStyleLoaded()) render(map);
    else map.once("load", () => render(map));
  }, [items, selectedId]);

  // Follow the selected row.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const item = items.find((i) => i.id === selectedId);
    if (!item?.lastKnownGeom) return;
    map.flyTo({ center: [item.lastKnownGeom.lng, item.lastKnownGeom.lat], zoom: 15, speed: 1.1 });
  }, [selectedId, items]);

  return <div ref={containerRef} className="h-full w-full" />;
}
