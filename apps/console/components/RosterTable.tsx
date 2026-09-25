"use client";

import { useMemo, useState } from "react";
import type { RosterAgent, SafetyBoardItem } from "@/lib/types";
import { activityBucket, activityColor } from "@/lib/colors";
import { formatDuration, formatPercent, initials } from "@/lib/format";

type SortKey =
  | "safetyState"
  | "userName"
  | "shiftStatus"
  | "doorsToday"
  | "contactsToday"
  | "contactRate"
  | "timeSinceLastDoorSeconds"
  | "photoStatus"
  | "outOfTurfCount"
  | "verificationScore"
  | "batteryPct"
  | "openFlags";

const severityRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "userName", label: "Agent" },
  { key: "shiftStatus", label: "Shift" },
  { key: "doorsToday", label: "Doors" },
  { key: "contactsToday", label: "Contacts" },
  { key: "contactRate", label: "Contact rate" },
  { key: "timeSinceLastDoorSeconds", label: "Since last door" },
  { key: "photoStatus", label: "Photo status" },
  { key: "outOfTurfCount", label: "Out of turf" },
  { key: "verificationScore", label: "Verification" },
  { key: "batteryPct", label: "Battery" },
  { key: "openFlags", label: "Flags" },
];

function photoStatusClasses(status: string) {
  switch (status) {
    case "overdue":
      return "bg-accountability text-white";
    case "due":
      return "bg-accountability-soft text-accountability-text";
    case "deferred":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

export default function RosterTable({
  roster,
  safetyAlerts,
  selectedUserId,
  onSelect,
}: {
  roster: RosterAgent[];
  safetyAlerts: SafetyBoardItem[];
  selectedUserId?: string | null;
  onSelect?: (userId: string) => void;
}) {
  // "Safety state" isn't a field the roster array carries directly (the contract keeps
  // roster and safety data separate — see docs/API_CONTRACT.md). We derive a sort-only
  // ranking by matching userId against the safetyAlerts stack's severity, purely to satisfy
  // the spec's default-sort rule; the roster table itself never renders safety fields.
  const safetyStateByUser = useMemo(() => {
    const map = new Map<string, number>();
    for (const alert of safetyAlerts) {
      const rank = severityRank[alert.severity] ?? 1;
      map.set(alert.userId, Math.max(map.get(alert.userId) ?? 0, rank));
    }
    return map;
  }, [safetyAlerts]);

  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "safetyState",
    dir: "desc",
  });

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }
    );
  }

  const sorted = useMemo(() => {
    const rows = [...roster];
    rows.sort((a, b) => {
      let cmp = 0;
      if (sort.key === "safetyState") {
        const sa = safetyStateByUser.get(a.userId) ?? 0;
        const sb = safetyStateByUser.get(b.userId) ?? 0;
        cmp = sa - sb;
        if (cmp === 0) cmp = a.timeSinceLastDoorSeconds - b.timeSinceLastDoorSeconds;
      } else if (sort.key === "userName" || sort.key === "shiftStatus" || sort.key === "photoStatus") {
        cmp = String(a[sort.key]).localeCompare(String(b[sort.key]));
      } else {
        cmp = (a[sort.key] as number) - (b[sort.key] as number);
      }
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [roster, sort, safetyStateByUser]);

  return (
    <div className="h-full overflow-auto">
      <table className="w-full min-w-[880px] border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50">
          <tr>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                onClick={() => toggleSort(col.key)}
                className="cursor-pointer select-none whitespace-nowrap border-b border-slate-200 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-800"
              >
                {col.label}
                {sort.key === col.key && (
                  <span className="ml-1 text-slate-400">{sort.dir === "asc" ? "▲" : "▼"}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((agent) => {
            const bucket = activityBucket(agent.timeSinceLastDoorSeconds);
            const inSafety = safetyStateByUser.has(agent.userId);
            return (
              <tr
                key={agent.userId}
                onClick={() => onSelect?.(agent.userId)}
                className={`cursor-pointer border-b border-slate-100 hover:bg-slate-50 ${
                  selectedUserId === agent.userId ? "bg-slate-100" : ""
                }`}
              >
                <td className="whitespace-nowrap px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                      style={{ backgroundColor: activityColor[bucket] }}
                      title={`Last door activity: ${bucket}`}
                    >
                      {initials(agent.userName)}
                    </span>
                    <div>
                      <div className="flex items-center gap-1.5 font-medium text-slate-900">
                        {agent.userName}
                        {inSafety && (
                          <span
                            className="h-2 w-2 rounded-full bg-safety"
                            title="Has an open safety item"
                          />
                        )}
                      </div>
                      <div className="text-xs text-slate-400">{agent.teamName}</div>
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-600 capitalize">
                  {agent.shiftStatus.replace(/_/g, " ")}
                </td>
                <td className="px-3 py-2 tabular-nums text-slate-700">{agent.doorsToday}</td>
                <td className="px-3 py-2 tabular-nums text-slate-700">{agent.contactsToday}</td>
                <td className="px-3 py-2 tabular-nums text-slate-700">
                  {formatPercent(agent.contactRate)}
                </td>
                <td className="px-3 py-2 tabular-nums" style={{ color: activityColor[bucket] }}>
                  {formatDuration(agent.timeSinceLastDoorSeconds)}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${photoStatusClasses(
                      agent.photoStatus
                    )}`}
                  >
                    {agent.photoStatus}
                  </span>
                </td>
                <td className="px-3 py-2 tabular-nums text-slate-700">{agent.outOfTurfCount}</td>
                <td className="px-3 py-2 tabular-nums text-slate-700">
                  {formatPercent(agent.verificationScore)}
                </td>
                <td className="px-3 py-2 tabular-nums text-slate-700">{agent.batteryPct}%</td>
                <td className="px-3 py-2 tabular-nums">
                  {agent.openFlags > 0 ? (
                    <span className="rounded-full bg-accountability-soft px-2 py-0.5 text-xs font-semibold text-accountability-text">
                      {agent.openFlags}
                    </span>
                  ) : (
                    <span className="text-slate-400">0</span>
                  )}
                </td>
              </tr>
            );
          })}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length} className="px-3 py-8 text-center text-sm text-slate-400">
                No agents on the roster.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
