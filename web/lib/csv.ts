export const REQUIRED = ["volatile acidity", "sulphates", "alcohol"];
const OPTIONAL = ["sample_id", "quality", "fixed acidity", "citric acid", "residual sugar", "chlorides", "free sulfur dioxide", "total sulfur dioxide", "density", "pH"];
export type BatchRow = { id: string; measurements: Record<string, number>; observed: number | null };

export function parseCells(text: string): string[][] {
  text = text.replace(/^\uFEFF/, "");
  const header = text.split(/\r?\n/, 1)[0];
  const delimiter = (header.match(/;/g)?.length ?? 0) > (header.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false, afterQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; afterQuote = true; }
      else field += c;
    } else if (c === '"') {
      if (field || afterQuote) throw new Error("A quote appears in an unquoted CSV field.");
      quoted = true;
    } else if (c === delimiter) {
      row.push(field); field = ""; afterQuote = false;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some(v => v.trim() !== "")) rows.push(row);
      row = []; field = ""; afterQuote = false;
    } else {
      if (afterQuote && c.trim()) throw new Error("Unexpected characters after a closing CSV quote.");
      if (!afterQuote) field += c;
    }
  }
  if (quoted) throw new Error("The CSV has an unclosed quoted field.");
  row.push(field);
  if (row.some(v => v.trim() !== "")) rows.push(row);
  return rows;
}

function numeric(value: string, label: string): number {
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()) || !Number.isFinite(Number(value))) {
    throw new Error(`${label}: enter a number; blanks, NaN, and infinity are not accepted.`);
  }
  const result = Number(value);
  if (result < 0) throw new Error(`${label}: negative values are not accepted.`);
  return result;
}

export function parseBatch(text: string): { rows: BatchRow[]; ignored: string[] } {
  if (text.length > 2_000_000) throw new Error("The CSV must be smaller than 2 MB.");
  const cells = parseCells(text);
  if (cells.length < 2) throw new Error("Add a header and at least one sample row.");
  if (cells.length > 5001) throw new Error("Upload at most 5,000 samples at a time.");
  const headers = cells[0].map(h => {
    const normalized = h.trim().replace(/_/g, " ").toLowerCase();
    return normalized === "sample id" ? "sample_id" : normalized === "ph" ? "pH" : normalized;
  });
  if (new Set(headers).size !== headers.length) throw new Error("CSV column names must be unique.");
  const missing = REQUIRED.filter(f => !headers.includes(f));
  if (missing.length) throw new Error(`Missing required columns: ${missing.join(", ")}. Download the template to get started.`);
  const unknown = headers.filter(h => ![...REQUIRED, ...OPTIONAL].includes(h));
  if (unknown.length) throw new Error(`Unrecognized columns: ${unknown.join(", ")}. Use sample_id for sample labels.`);
  const ids = new Set<string>();
  const rows = cells.slice(1).map((row, index) => {
    const line = index + 2;
    if (row.length !== headers.length) throw new Error(`Row ${line}: expected ${headers.length} fields, found ${row.length}.`);
    const record = Object.fromEntries(headers.map((header, i) => [header, row[i].trim()]));
    const id = record.sample_id || `Sample ${String(index + 1).padStart(3, "0")}`;
    if (id.length > 100) throw new Error(`Row ${line}: sample labels must be at most 100 characters.`);
    if (ids.has(id)) throw new Error(`Row ${line}: duplicate sample label “${id}”. Use unique labels.`);
    ids.add(id);
    const measurements = Object.fromEntries(REQUIRED.map(f => [f, numeric(record[f], `Row ${line}, ${f}`)]));
    const observed = record.quality ? numeric(record.quality, `Row ${line}, quality`) : null;
    if (observed !== null && (!Number.isInteger(observed) || observed > 10)) throw new Error(`Row ${line}: observed quality must be an integer from 0 to 10.`);
    return { id, measurements, observed };
  });
  return { rows, ignored: headers.filter(h => ![...REQUIRED, "sample_id", "quality"].includes(h)) };
}

export function csvCell(value: string | number): string {
  let text = String(value);
  if (/^\s*[=+@-]/.test(text) && typeof value !== "number") text = "'" + text;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function resultsCSV(rows: (BatchRow & { predicted: number; warnings: string[]; reliability?: {support: string; human_review_recommended: boolean; review_reasons: string[]} })[]): string {
  const headers = ["sample_id", ...REQUIRED, "predicted_quality", "observed_quality", "error", "warnings", "training_support", "human_review_recommended", "review_reasons"];
  return [headers.join(","), ...rows.map(row => [row.id, ...REQUIRED.map(f => row.measurements[f]), row.predicted,
    row.observed ?? "", row.observed === null ? "" : row.predicted - row.observed, row.warnings.join("; "), row.reliability?.support ?? "", row.reliability ? String(row.reliability.human_review_recommended) : "", row.reliability?.review_reasons.join("; ") ?? ""].map(csvCell).join(","))].join("\r\n");
}
