/**
 * The brand mark: a chromosome pair, the lower bar carrying one introgressed
 * segment (docs/adr/0009, amended 2026-09-29). Painted in currentColor with
 * the segment at reduced opacity, so it is single-colour by construction:
 * parchment on the masthead, black on paper. Decorative; whoever places it
 * supplies the accessible name (the masthead's <h1>).
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect className="brand-mark-bar" x="2" y="5" width="20" height="5" rx="2.5" />
      <path className="brand-mark-bar" d="M4.5 14H11v5H4.5a2.5 2.5 0 0 1 0-5Z" />
      <path className="brand-mark-bar" d="M18 14h1.5a2.5 2.5 0 0 1 0 5H18Z" />
      <rect className="brand-mark-segment" x="11" y="14" width="7" height="5" />
    </svg>
  );
}
