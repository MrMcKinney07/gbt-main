import type { AccountabilityAlert, SafetyBoardItem } from "@/lib/types";
import { formatDurationCompact, formatRelativeTime } from "@/lib/format";
import { SafetyIcon, AccountabilityIcon } from "./icons";

function SafetyAlertCard({ item }: { item: SafetyBoardItem }) {
  return (
    <li className="rounded-lg border border-safety-border bg-safety-soft px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <SafetyIcon className="mt-0.5 h-4 w-4 shrink-0 text-safety" />
          <div>
            <p className="text-sm font-semibold text-safety-text">{item.userName}</p>
            <p className="text-xs text-safety-text/80">{item.teamName}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-safety px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
          {item.severity}
        </span>
      </div>
      <p className="mt-1.5 text-xs font-medium text-safety-text">
        Dark {formatDurationCompact(item.timeDarkSeconds)} · watchdog: {item.watchdogStatus}
      </p>
      {item.lastDoorAddress && (
        <p className="mt-0.5 truncate text-xs text-safety-text/70">
          Last door: {item.lastDoorAddress}
        </p>
      )}
    </li>
  );
}

function AccountabilityAlertCard({ item }: { item: AccountabilityAlert }) {
  return (
    <li className="rounded-lg border border-accountability-border bg-accountability-soft px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <AccountabilityIcon className="mt-0.5 h-4 w-4 shrink-0 text-accountability" />
          <div>
            <p className="text-sm font-semibold text-accountability-text">{item.userName}</p>
            <p className="text-xs text-accountability-text/80">{item.type.replace(/_/g, " ")}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-accountability px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
          {item.severity}
        </span>
      </div>
      <p className="mt-1.5 text-xs text-accountability-text">{item.summary}</p>
      <p className="mt-0.5 text-xs text-accountability-text/70">{formatRelativeTime(item.createdAt)}</p>
    </li>
  );
}

export default function AlertRail({
  safetyAlerts,
  accountabilityAlerts,
}: {
  safetyAlerts: SafetyBoardItem[];
  accountabilityAlerts: AccountabilityAlert[];
}) {
  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-3">
      {/* safetyAlerts and accountabilityAlerts render as separate stacks, always — see
          docs/ARCHITECTURE.md section 8.0. Safety (welfare/watchdog) and accountability
          (photo verification/anti-fraud) are opposite-purpose mechanisms; interleaving them
          by time or severity, or giving them one combined count, would let a manager read a
          welfare check as a productivity flag (or vice versa), which is the exact failure
          this screen exists to prevent. */}
      <section aria-labelledby="safety-alerts-heading">
        <div className="mb-2 flex items-center gap-2">
          <SafetyIcon className="h-4 w-4 text-safety" />
          <h2 id="safety-alerts-heading" className="text-xs font-bold uppercase tracking-wide text-safety">
            Safety — {safetyAlerts.length}
          </h2>
        </div>
        {safetyAlerts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">
            No open safety items.
          </p>
        ) : (
          <ul className="space-y-2">
            {safetyAlerts.map((item) => (
              <SafetyAlertCard key={item.id} item={item} />
            ))}
          </ul>
        )}
      </section>

      <div className="border-t border-slate-200" />

      <section aria-labelledby="accountability-alerts-heading">
        <div className="mb-2 flex items-center gap-2">
          <AccountabilityIcon className="h-4 w-4 text-accountability" />
          <h2
            id="accountability-alerts-heading"
            className="text-xs font-bold uppercase tracking-wide text-accountability"
          >
            Accountability — {accountabilityAlerts.length}
          </h2>
        </div>
        {accountabilityAlerts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">
            No open accountability items.
          </p>
        ) : (
          <ul className="space-y-2">
            {accountabilityAlerts.map((item) => (
              <AccountabilityAlertCard key={item.id} item={item} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
