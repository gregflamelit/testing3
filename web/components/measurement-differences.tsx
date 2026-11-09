import metadata from "../lib/generated/metadata.json";
import { REQUIRED } from "../lib/csv";
import { compareWithReference, type ComparisonRow } from "../lib/comparison";
import { signed } from "./reference-panel";

export function MeasurementDifferences({ row, reference }: { row: ComparisonRow; reference: ComparisonRow }) {
  const delta = compareWithReference(row, reference);
  return <div className="measurement-differences" role="group" aria-label={`Measurement differences for ${row.id} versus ${reference.id}`}>
    {REQUIRED.map(feature => {
      const value = delta.measurement_deltas[feature];
      const range = metadata.training_ranges[feature as keyof typeof metadata.training_ranges];
      const width = Math.min(50, Math.abs(value) / (range.max - range.min) * 50);
      return <div className="difference-line" key={feature}><div><span>{feature}</span><strong>{signed(value, feature === "alcohol" ? 1 : 2)} {feature === "alcohol" ? "percentage points" : "g/L"}</strong></div><div className="difference-track" aria-hidden="true"><i className="difference-zero" /><i className={value < 0 ? "difference-less" : "difference-more"} style={{ width: `${width}%`, left: value < 0 ? `${50 - width}%` : "50%" }} /></div></div>;
    })}<p className="difference-caption">Bars are relative to the studied measurement span, centred on the reference. They do not indicate better or worse wine.</p>
  </div>;
}
