import { SafetyIcon } from "./icons";

export default function SafetyBanner() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-safety-border bg-safety-soft px-4 py-2.5 text-sm font-medium text-safety-text">
      <SafetyIcon className="h-4 w-4 shrink-0 text-safety" />
      Wellness data is never used for performance review.
    </div>
  );
}
