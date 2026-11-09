import type { ComparisonRow } from "../lib/comparison";
export function StickyReference({ reference }: { reference: ComparisonRow }) {
  return <div className="sticky-reference" data-testid="sticky-reference" role="region" aria-label="Pinned reference sample"><div><span>REFERENCE SAMPLE</span><strong>{reference.id} · {reference.predicted.toFixed(2)} / 10</strong><small>Score differences compare model estimates, not established differences in wine quality.</small></div><button className="secondary-button" onClick={() => document.getElementById("reference-sample")?.focus()}>Change reference</button></div>;
}
