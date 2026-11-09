import { REQUIRED, csvCell, type BatchRow } from "./csv.ts";
export type ComparisonRow = BatchRow & { predicted: number };

export function compareWithReference(row: ComparisonRow, reference: ComparisonRow) {
  return { predicted_delta: row.predicted - reference.predicted,
    measurement_deltas: Object.fromEntries(REQUIRED.map(f => [f, row.measurements[f] - reference.measurements[f]])) };
}
export function comparisonCSV(rows: ComparisonRow[], reference: ComparisonRow): string {
  const header = ["sample_id", "reference_sample_id", "predicted_quality", "reference_predicted_quality", "predicted_difference", ...REQUIRED.map(f => `${f} difference`)];
  return [header.join(","), ...rows.map(row => {
    const delta = compareWithReference(row, reference);
    return [row.id, reference.id, row.predicted, reference.predicted, delta.predicted_delta, ...REQUIRED.map(f => delta.measurement_deltas[f])].map(csvCell).join(",");
  })].join("\r\n");
}
