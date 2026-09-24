"use client";

import type { SafetyBoardItem } from "@/lib/types";
import { formatDurationCompact, formatLatLng, formatRelativeTime, initials } from "@/lib/format";
import SafetyRowActions from "./SafetyRowActions";

const severityRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

function watchdogBadgeClasses(status: string) {
  switch (status) {
    case "sos":
      return "bg-safety-strong text-white";
    case "dark":
      return "bg-safety text-white";
    case "warning":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

export default function SafetyQueue({
  items,
  resolvedIds,
  selectedId,
  onSelect,
  onResolve,
}: {
  items: SafetyBoardItem[];
  resolvedIds: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onResolve: (id: string, reason: string, note: string) => void;
}) {
  // Queue sort per build prompt 6.5: severity, then time-dark, both descending — this is a
  // queue to work through, not a dashboard to skim.
  const sorted = [...items].sort((a, b) => {
    const sevDiff = (severityRank[b.severity] ?? 0) - (severityRank[a.severity] ?? 0);
    if (sevDiff !== 0) return sevDiff;
    return b.timeDarkSeconds - a.timeDarkSeconds;
  });

  if (sorted.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-slate-400">
        No one is dark right now. This queue is empty when the watchdog has nothing to
        report.
      </div>
    );
  }

  return (
    <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
      {sorted.map((item) => {
        const resolved = resolvedIds.has(item.id);
        return (
          <li
            key={item.id}
            onClick={() => onSelect(item.id)}
            className={`cursor-pointer px-4 py-3 transition-colors ${
              selectedId === item.id ? "bg-safety-soft/60" : "hover:bg-slate-50"
            } ${resolved ? "opacity-50" : ""}`}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-300 text-xs font-semibold text-slate-700">
                {initials(item.userName)}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">{item.userName}</span>
                    <span className="text-xs text-slate-400">{item.teamName}</span>
                    {resolved && (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                        Resolved
                      </span>
                    )}
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${watchdogBadgeClasses(
                      item.watchdogStatus
                    )}`}
                  >
                    {item.watchdogStatus}
                  </span>
                </div>

                {/* Time dark is the primary number on this screen, deliberately — never a
                    door count or contact rate. That's the whole point of section 8.0's
                    separation: this queue answers "how long since we heard from them",
                    nothing about their production. */}
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-bold tabular-nums text-safety-text">
                    {formatDurationCompact(item.timeDarkSeconds)}
                  </span>
                  <span className="text-xs text-slate-400">dark</span>
                </div>

                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600 sm:grid-cols-4">
                  <div>
                    {/* The contract's lastKnownGeom carries coords + accuracy but no
                        reverse-geocoded address (unlike lastDoorAddress below) — see
                        apps/console/README.md. */}
                    <dt className="text-slate-400">Last known location</dt>
                    <dd>
                      {item.lastKnownGeom
                        ? `${formatLatLng(item.lastKnownGeom.lat, item.lastKnownGeom.lng)} · ±${
                            item.lastKnownAccuracyM ?? "?"
                          }m`
                        : "Unknown"}
                      <div className="text-slate-400">{formatRelativeTime(item.lastKnownAt)}</div>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Last door</dt>
                    <dd>
                      {item.lastDoorAddress ?? "—"}
                      <div className="text-slate-400">{formatRelativeTime(item.lastDoorAt)}</div>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Battery</dt>
                    <dd>{item.batteryPct != null ? `${item.batteryPct}%` : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Turf</dt>
                    <dd>{item.turfName ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Escalation level</dt>
                    <dd className="capitalize">{item.escalationLevel.replace(/_/g, " ")}</dd>
                  </div>
                </dl>

                <div className="mt-3">
                  <SafetyRowActions
                    agentName={item.userName}
                    onResolve={(reason, note) => onResolve(item.id, reason, note)}
                  />
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
