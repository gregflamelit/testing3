import { ArrowDownToLine, Flag, Info } from "lucide-react";
import type { ComparisonRow } from "../lib/comparison";

export function signed(value: number, digits = 2): string { return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`; }
export function ReferencePanel({ rows, referenceId, onChange, onExport }: {
  rows: ComparisonRow[]; referenceId: string; onChange: (id: string) => void; onExport: () => void;
}) {
  const reference = rows.find(r => r.id === referenceId);
  return <section className="reference-panel" aria-labelledby="reference-heading"><div className="reference-title"><Flag size={19} /><div><h3 id="reference-heading">Compare against a reference</h3><p>Choose a measured sample as your baseline. Differences describe model estimates, not a quality ranking or a causal effect.</p></div></div>
    <div className="reference-controls"><label htmlFor="reference-sample">Reference sample<select id="reference-sample" value={referenceId} onChange={e => onChange(e.target.value)}><option value="">Choose a reference sample</option>{rows.map(row => <option key={row.id} value={row.id}>{row.id}</option>)}</select></label><button className="secondary-button" disabled={!reference} onClick={onExport}><ArrowDownToLine size={16} />Export reference comparison</button></div>
    {reference && <div className="reference-summary" role="status"><strong>{reference.id}: {reference.predicted.toFixed(2)} / 10</strong><span>Volatile acidity {reference.measurements["volatile acidity"].toFixed(2)} g/L · Sulphates {reference.measurements.sulphates.toFixed(2)} g/L · Alcohol {reference.measurements.alcohol.toFixed(1)}% vol</span><p><Info size={14} />Small differences may reflect model error. No significance or confidence interval for differences has been established. Use lab and sensory review to make the decision.</p></div>}
  </section>;
}
