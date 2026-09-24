"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import HeaderTiles from "@/components/HeaderTiles";
import RosterTable from "@/components/RosterTable";
import AlertRail from "@/components/AlertRail";
import { useLiveOps } from "@/lib/use-live-data";

const LiveOpsMap = dynamic(() => import("@/components/LiveOpsMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-slate-400">
      Loading map…
    </div>
  ),
});

export default function LiveOpsPage() {
  const { data, loading, error, isMock } = useLiveOps();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  if (loading && !data) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
        Loading Live Ops…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-red-500">
        Couldn&apos;t load Live Ops data.
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-hidden p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Live Operations</h1>
        {isMock && (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
            Demo data — {error ?? "API unreachable"}
          </span>
        )}
      </div>

      <HeaderTiles tiles={data.headerTiles} />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[1fr_320px]">
        <div className="flex min-h-0 flex-col gap-3">
          <div className="min-h-[280px] flex-[3] overflow-hidden rounded-lg border border-slate-200 bg-white">
            <LiveOpsMap
              roster={data.roster}
              safetyAlerts={data.safetyAlerts}
              selectedUserId={selectedUserId}
              onSelectAgent={setSelectedUserId}
            />
          </div>
          <div className="min-h-[220px] flex-[2] overflow-hidden rounded-lg border border-slate-200 bg-white">
            <RosterTable
              roster={data.roster}
              safetyAlerts={data.safetyAlerts}
              selectedUserId={selectedUserId}
              onSelect={setSelectedUserId}
            />
          </div>
        </div>

        <div className="min-h-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <AlertRail safetyAlerts={data.safetyAlerts} accountabilityAlerts={data.accountabilityAlerts} />
        </div>
      </div>
    </div>
  );
}
