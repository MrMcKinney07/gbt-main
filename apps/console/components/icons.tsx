// Small inline icon set so the safety and accountability stacks are distinguishable by
// shape as well as color — never rely on color alone.

export function SafetyIcon({ className = "h-4 w-4" }: { className?: string }) {
  // Life-ring / welfare glyph
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="2" />
      <path
        d="M5.6 5.6l3.3 3.3M18.4 5.6l-3.3 3.3M5.6 18.4l3.3-3.3M18.4 18.4l-3.3-3.3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AccountabilityIcon({ className = "h-4 w-4" }: { className?: string }) {
  // Camera glyph — photo verification
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1-1.5h7L16.5 7h2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-9Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3.2" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
