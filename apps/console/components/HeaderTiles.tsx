import type { HeaderTiles as HeaderTilesData } from "@/lib/types";
import { formatPercent } from "@/lib/format";

interface TileProps {
  label: string;
  value: string;
  accent?: "safety" | "accountability";
}

function Tile({ label, value, accent }: TileProps) {
  const accentClasses =
    accent === "safety"
      ? "border-safety-border bg-safety-soft"
      : accent === "accountability"
      ? "border-accountability-border bg-accountability-soft"
      : "border-brand-hairline bg-white";
  const valueClasses =
    accent === "safety"
      ? "text-safety-text"
      : accent === "accountability"
      ? "text-accountability-text"
      : "text-brand-ink";

  return (
    <div
      className={`flex min-w-0 flex-col justify-between rounded-lg border px-4 py-3.5 shadow-[0_1px_2px_rgba(14,26,43,0.04)] ${accentClasses}`}
    >
      <span className="truncate text-[11px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <span className={`mt-1.5 font-display text-2xl font-semibold tabular-nums ${valueClasses}`}>
        {value}
      </span>
    </div>
  );
}

export default function HeaderTiles({ tiles }: { tiles: HeaderTilesData }) {
  // Fixed order per build prompt 6.1: agents on shift/scheduled, doors today, contacts
  // today, contact rate, verified share, turfs complete/total, open safety items, open
  // accountability items. The last two use their reserved family colors (see
  // docs/ARCHITECTURE.md) and are never combined into one "open items" tile — they count
  // two different things for two different reasons.
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
      <Tile label="Agents on shift" value={`${tiles.agentsOnShift} / ${tiles.agentsScheduled}`} />
      <Tile label="Doors today" value={tiles.doorsToday.toLocaleString()} />
      <Tile label="Contacts today" value={tiles.contactsToday.toLocaleString()} />
      <Tile label="Contact rate" value={formatPercent(tiles.contactRate)} />
      <Tile label="Verified share" value={formatPercent(tiles.verifiedShare)} />
      <Tile label="Turfs complete" value={`${tiles.turfsComplete} / ${tiles.turfsTotal}`} />
      <Tile label="Open safety items" value={String(tiles.openSafetyItems)} accent="safety" />
      <Tile
        label="Open accountability items"
        value={String(tiles.openAccountabilityItems)}
        accent="accountability"
      />
    </div>
  );
}
