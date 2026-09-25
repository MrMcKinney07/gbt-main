"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { RosterAgent, SafetyBoardItem } from "@/lib/types";
import { activityBucket, activityColor, safetyColor } from "@/lib/colors";
import { DEMO_TURF_CENTER, DEMO_TURF_POLYGON } from "@/lib/constants";
import { formatDuration, formatPercent, initials } from "@/lib/format";

// Free, no-token demotiles style per the task brief — no Mapbox/Maptiler key available in
// this environment.
const MAP_STYLE = "https://demotiles.maplibre.org/style.json";

function agentPopupHtml(agent: RosterAgent) {
  const bucket = activityBucket(agent.timeSinceLastDoorSeconds);
  return `
    <div style="font-family: inherit; padding: 10px 12px; min-width: 190px;">
      <div style="font-weight: 600; font-size: 13px; color: #0f172a;">${agent.userName}</div>
      <div style="font-size: 11px; color: #64748b; margin-bottom: 6px;">${agent.teamName}</div>
      <div style="font-size: 12px; color: #334155; display: grid; grid-template-columns: auto auto; gap: 2px 10px;">
        <span style="color:#94a3b8;">Doors today</span><span>${agent.doorsToday}</span>
        <span style="color:#94a3b8;">Contact rate</span><span>${formatPercent(agent.contactRate)}</span>
        <span style="color:#94a3b8;">Since last door</span><span style="color:${activityColor[bucket]}; font-weight:600;">${formatDuration(
    agent.timeSinceLastDoorSeconds
  )}</span>
        <span style="color:#94a3b8;">Battery</span><span>${agent.batteryPct}%</span>
      </div>
    </div>
  `;
}

export default function LiveOpsMap({
  roster,
  safetyAlerts,
  selectedUserId,
  onSelectAgent,
}: {
  roster: RosterAgent[];
  safetyAlerts: SafetyBoardItem[];
  selectedUserId?: string | null;
  onSelectAgent?: (userId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: DEMO_TURF_CENTER,
      zoom: 14,
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

  // Agent markers — colored by activity recency, never by the safety/accountability
  // palette (that distinction belongs to the alert stacks, not the roster dots).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function render(map: maplibregl.Map) {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      for (const agent of roster) {
        const bucket = activityBucket(agent.timeSinceLastDoorSeconds);
        const el = document.createElement("div");
        el.style.width = "30px";
        el.style.height = "30px";
        el.style.borderRadius = "9999px";
        el.style.display = "flex";
        el.style.alignItems = "center";
        el.style.justifyContent = "center";
        el.style.fontSize = "11px";
        el.style.fontWeight = "700";
        el.style.color = "white";
        el.style.cursor = "pointer";
        el.style.border =
          selectedUserId === agent.userId ? "3px solid #0f172a" : "2px solid white";
        el.style.boxShadow = "0 1px 4px rgba(0,0,0,0.35)";
        el.style.backgroundColor = activityColor[bucket];
        el.textContent = initials(agent.userName);
        el.setAttribute("role", "button");
        el.setAttribute("aria-label", `${agent.userName}, ${agent.teamName}`);

        const popup = new maplibregl.Popup({ offset: 18, closeButton: false }).setHTML(
          agentPopupHtml(agent)
        );

        el.addEventListener("mouseenter", () => {
          popup.setLngLat([agent.lng, agent.lat]).addTo(map);
        });
        el.addEventListener("mouseleave", () => popup.remove());
        el.addEventListener("click", () => onSelectAgent?.(agent.userId));

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([agent.lng, agent.lat])
          .addTo(map);
        markersRef.current.push(marker);
      }

      // Safety event markers — distinct pulsing red, structurally separate from the agent
      // dots above and from any accountability marker. See docs/ARCHITECTURE.md.
      for (const item of safetyAlerts) {
        if (!item.lastKnownGeom) continue;
        const el = document.createElement("div");
        el.className = "safety-marker-pulse";
        el.style.width = "16px";
        el.style.height = "16px";
        el.style.borderRadius = "9999px";
        el.style.backgroundColor = safetyColor.DEFAULT;
        el.style.border = "2px solid white";
        el.setAttribute("aria-label", `Safety alert: ${item.userName}`);
        el.title = `Safety: ${item.userName} — dark ${formatDuration(item.timeDarkSeconds)}`;

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([item.lastKnownGeom.lng, item.lastKnownGeom.lat])
          .addTo(map);
        markersRef.current.push(marker);
      }
    }

    if (map.isStyleLoaded()) render(map);
    else map.once("load", () => render(map));
  }, [roster, safetyAlerts, selectedUserId, onSelectAgent]);

  return <div ref={containerRef} className="h-full w-full" />;
}
