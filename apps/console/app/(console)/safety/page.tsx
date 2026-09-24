"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import SafetyBanner from "@/components/SafetyBanner";
import SafetyQueue from "@/components/SafetyQueue";
import { useSafetyBoard } from "@/lib/use-live-data";

const SafetyMap = dynamic(() => import("@/components/SafetyMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-slate-400">
      Loading map…
    </div>
  ),
});

// This screen intentionally has no export button, anywhere on the page. Section 6.5 of the
// build prompt calls that absence out explicitly: wellness/safety data is not a report to
// hand around, and giving managers an export invites exactly the performance-review misuse
// the banner below disclaims. Do not add one back in.
export default function SafetyPage() {
  const { data, loading, isMock, error } = useSafetyBoard();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    document.title = "Safety – Field Console";
  }, []);

  useEffect(() => {
    // Auto-select the top queue row once data arrives, so the map pane has something to
    // follow immediately.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!selectedId && data?.items?.length) setSelectedId(data.items[0].id);
  }, [data, selectedId]);

  function handleResolve(id: string, reason: string, note: string) {
    // Resolve is a stub: docs/API_CONTRACT.md doesn't define a resolve endpoint yet. It
    // still enforces the spec's rule that a resolve requires an outcome reason (see the
    // modal in SafetyRowActions) before anything is marked done, even locally.
    setResolvedIds((prev) => new Set(prev).add(id));
    console.info("[safety resolve stub]", { id, reason, note });
  }

  if (loading && !data) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
        Loading Safety board…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-red-500">
        Couldn&apos;t load the Safety board.
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-hidden p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Safety</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Agents we have not heard from. Check on them.
          </p>
        </div>
        {isMock && (
          <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
            Demo data — {error ?? "API unreachable"}
          </span>
        )}
      </div>

      <SafetyBanner />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[1fr_420px]">
        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
          <SafetyQueue
            items={data.items}
            resolvedIds={resolvedIds}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onResolve={handleResolve}
          />
        </div>
        <div className="min-h-[320px] overflow-hidden rounded-lg border border-slate-200 bg-white">
          <SafetyMap items={data.items} selectedId={selectedId} />
        </div>
      </div>
    </div>
  );
}
