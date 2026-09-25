"use client";

import { useState } from "react";

const RESOLVE_REASONS = [
  "Confirmed safe by phone",
  "Confirmed safe in person",
  "Device / connectivity issue",
  "Shift ended, forgot to clock out",
  "False alarm — watchdog misfire",
  "Other (see note)",
];

type ActionKey = "call" | "text" | "wellness" | "acknowledge" | "ask_nearby" | "escalate";

const ACTIONS: { key: ActionKey; label: string }[] = [
  { key: "call", label: "Call" },
  { key: "text", label: "Text" },
  { key: "wellness", label: "Send wellness prompt" },
  { key: "acknowledge", label: "Acknowledge" },
  { key: "ask_nearby", label: "Ask nearby agent" },
  { key: "escalate", label: "Escalate" },
];

export default function SafetyRowActions({
  agentName,
  onResolve,
}: {
  agentName: string;
  onResolve: (reason: string, note: string) => void;
}) {
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [reason, setReason] = useState(RESOLVE_REASONS[0]);
  const [note, setNote] = useState("");

  // These row actions are UI stubs — docs/API_CONTRACT.md doesn't yet define
  // manager-initiated call/text/nudge/escalate endpoints, so they record local intent
  // (visible feedback below) rather than call a real endpoint. Wire them up once the API
  // exposes them; see apps/console/README.md.
  function stub(label: string) {
    setLastAction(`${label} → ${agentName} (stub, not sent)`);
    window.setTimeout(() => setLastAction(null), 3500);
  }

  function submitResolve(e: React.FormEvent) {
    e.preventDefault();
    onResolve(reason, note);
    setResolveOpen(false);
    setNote("");
    setReason(RESOLVE_REASONS[0]);
  }

  return (
    <div onClick={(e) => e.stopPropagation()} className="flex flex-wrap items-center gap-1.5">
      {ACTIONS.map((a) => (
        <button
          key={a.key}
          type="button"
          onClick={() => stub(a.label)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          {a.label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setResolveOpen(true)}
        className="rounded-md bg-safety px-2 py-1 text-xs font-semibold text-white hover:bg-safety-strong"
      >
        Resolve
      </button>

      {lastAction && (
        <span className="w-full text-xs italic text-slate-400">{lastAction}</span>
      )}

      {resolveOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setResolveOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submitResolve}
            className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
          >
            <h3 className="text-sm font-semibold text-slate-900">Resolve safety item</h3>
            <p className="mt-1 text-xs text-slate-500">{agentName}</p>

            <label className="mt-4 block text-xs font-medium text-slate-700">
              Outcome reason (required)
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
              >
                {RESOLVE_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-3 block text-xs font-medium text-slate-700">
              Note (optional)
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
                placeholder="Anything else worth logging…"
              />
            </label>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResolveOpen(false)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-md bg-safety px-3 py-1.5 text-xs font-semibold text-white hover:bg-safety-strong"
              >
                Mark resolved
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
