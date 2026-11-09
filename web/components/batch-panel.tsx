"use client";
import { useMemo, useRef, useState } from "react";
import { ArrowDownToLine, ArrowRight, ArrowUpDown, Check, FileSpreadsheet, Layers3, Loader2, Search, TriangleAlert, Upload, X } from "lucide-react";
import { parseBatch, REQUIRED, resultsCSV, type BatchRow } from "../lib/csv";
import type { Prediction } from "../lib/predictor";
import { downloadFile } from "../lib/download";
import { requestPredictions } from "../lib/client";
const demo = "sample_id,volatile acidity,sulphates,alcohol\nLot A · Cellar 01,0.70,0.56,9.4\nLot B · Cellar 01,0.28,0.80,12.5\nLot C · Cellar 02,0.90,0.45,10.0\nLot D · Cellar 02,0.36,0.68,11.2\nLot E · Reserve,0.25,0.84,13.0\nLot F · Trial,0.55,0.60,14.5";
type Result = BatchRow & { predicted: number; warnings: string[] };
export function BatchPanel() {
  const [pending, setPending] = useState<BatchRow[]>([]), [filename, setFilename] = useState("");
  const [ignored, setIgnored] = useState<string[]>([]), [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [progress, setProgress] = useState(0);
  const [drag, setDrag] = useState(false), [query, setQuery] = useState("");
  const [onlyWarned, setOnlyWarned] = useState(false), [sort, setSort] = useState<"asc" | "desc">("desc"), [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  function load(text: string, name: string) {
    try { const parsed = parseBatch(text); setPending(parsed.rows); setIgnored(parsed.ignored); setFilename(name); setResults([]); setSelected([]); setError(""); setPage(0); setQuery(""); setOnlyWarned(false); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not read this CSV."); setPending([]); setFilename(""); setResults([]); setIgnored([]); setSelected([]); }
  }
  async function file(file?: File) {
    if (!file || busy) return;
    if (file.size > 2_000_000) { setError("Choose a CSV smaller than 2 MB."); return; }
    try { load(await file.text(), file.name); } catch { setError("This file could not be opened. Please select it again."); }
  }
  async function compare() {
    if (!pending.length || busy) return;
    setBusy(true); setError(""); setProgress(0); setResults([]); setSelected([]);
    try {
      const all: Prediction[] = [];
      for (let offset = 0; offset < pending.length; offset += 500) {
        const chunk = pending.slice(offset, offset + 500);
        const predictions = await requestPredictions(chunk.map(r => r.measurements));
        all.push(...predictions); setProgress(Math.round(all.length / pending.length * 100));
      }
      setResults(pending.map((r, i) => ({ ...r, predicted: all[i].predicted_quality, warnings: all[i].warnings })));
      setPage(0);
    } catch (e) { setError(e instanceof Error && e.name !== "TimeoutError" ? e.message : "The request timed out. Please try the batch again."); }
    finally { setBusy(false); }
  }
  const filtered = useMemo(() => results.filter(r => r.id.toLowerCase().includes(query.toLowerCase()) && (!onlyWarned || r.warnings.length)).sort((a, b) => sort === "desc" ? b.predicted - a.predicted : a.predicted - b.predicted), [results, query, onlyWarned, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / 20)), safePage = Math.min(page, pages - 1);
  const visible = filtered.slice(safePage * 20, safePage * 20 + 20);
  const mean = results.length ? results.reduce((s, r) => s + r.predicted, 0) / results.length : 0;
  const observed = results.filter(r => r.observed !== null);
  const uploadedMAE = observed.length ? observed.reduce((s, r) => s + Math.abs(r.predicted - r.observed!), 0) / observed.length : null;
  return <div className="batch-view">
    <section className="card upload-card"><div className="section-heading"><div><span className="eyebrow muted">FROM YOUR LAB TO WINE LAB</span><h2>Bring your samples together</h2></div><FileSpreadsheet size={25} strokeWidth={1.2} /></div>
      <div className={`drop-zone ${drag ? "dragging" : ""}`} onDragOver={e => { e.preventDefault(); if (!busy) setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); void file(e.dataTransfer.files[0]); }}>
        <div className="upload-icon"><Upload size={25} strokeWidth={1.5} /></div><h3>{filename || "A whole batch. One simple upload."}</h3><p>{pending.length ? `${pending.length.toLocaleString()} samples validated and ready to compare.` : "Drop a CSV here, or choose a file from your computer."}</p>
        <div className="upload-actions"><button className="primary-button" disabled={busy} onClick={() => input.current?.click()}><Upload size={16} />{filename ? "Choose another CSV" : "Choose CSV file"}</button><button className="secondary-button" disabled={busy} onClick={() => load(demo, "Wine Lab demo · 6 samples")}><Layers3 size={16} />Try a demo batch</button></div>
        <input ref={input} type="file" accept=".csv,text/csv" aria-label="Upload batch CSV" className="sr-only" disabled={busy} onChange={e => { void file(e.target.files?.[0]); e.target.value = ""; }} /><span className="upload-limit">Up to 5,000 samples · CSV up to 2 MB · Comma or semicolon separated</span>
      </div>
      <div className="csv-guidance"><div><strong>Three columns are all you need</strong><p><code>volatile acidity</code><code>sulphates</code><code>alcohol</code><span>Optional: sample_id and observed quality.</span></p></div><button className="text-button" onClick={() => downloadFile("wine-lab-template.csv", "sample_id,volatile acidity,sulphates,alcohol\nSample A,0.70,0.56,9.4\n")}><ArrowDownToLine size={15} />Download template</button></div>
      {ignored.length > 0 && <p className="small-note">Only the selected three inputs are used. Ignoring {ignored.length} other measurement columns: {ignored.join(", ")}.</p>}
      {error && <div className="inline-alert error" role="alert">{error}</div>}
      {pending.length > 0 && !results.length && <div className="batch-submit"><span>{busy ? `Analyzing samples · ${progress}%` : `${pending.length.toLocaleString()} samples ready`}</span><button className="primary-button" disabled={busy} onClick={compare}>{busy ? <Loader2 className="spin" size={17} /> : <Layers3 size={17} />}{busy ? "Comparing…" : "Compare samples"}<ArrowRight size={17} /></button></div>}
      <p className="form-caption left">Your file is parsed in this browser. Only the three measurements are sent to the model; sample labels and observed scores stay here. Wine Lab does not save your uploads.</p>
    </section>
    {results.length > 0 && <>
      <div className="stats-grid"><div className="stat-card"><span>SAMPLES COMPARED</span><strong>{results.length.toLocaleString()}</strong><small>{filename}</small></div><div className="stat-card"><span>AVERAGE ESTIMATE</span><strong>{mean.toFixed(2)}<em>/ 10</em></strong><small>A batch summary, not an overall quality verdict</small></div><div className="stat-card"><span>OUTSIDE STUDIED RANGE</span><strong>{results.filter(r => r.warnings.length).length}</strong><small>Samples needing additional caution</small></div></div>
      {uploadedMAE !== null && <div className="inline-alert neutral"><FileSpreadsheet size={18} /><span><strong>Uploaded-file MAE: {uploadedMAE.toFixed(3)}</strong> across {observed.length} supplied scores. These may include training samples; this is not an independent validation result.</span></div>}
      <section className="card results-card"><div className="section-heading"><div><span className="eyebrow muted">THE BIGGER PICTURE</span><h2>Your batch, compared</h2></div><button className="secondary-button" onClick={() => downloadFile("wine-lab-batch-results.csv", resultsCSV(results))}><ArrowDownToLine size={16} />Export all results</button></div>
        <div className="table-toolbar"><label className="search-input"><Search size={16} /><input value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} placeholder="Find a sample…" aria-label="Find a sample" /></label><label className="checkbox-label"><input type="checkbox" checked={onlyWarned} onChange={e => { setOnlyWarned(e.target.checked); setPage(0); }} />Outside range only</label><span>Select up to 3 for a closer look</span></div>
        {selected.length > 0 && <div className="sample-comparison">{selected.map(id => { const row = results.find(r => r.id === id)!; return <article key={id}><div><strong>{id}</strong><button className="icon-link" aria-label={`Remove ${id} from comparison`} onClick={() => setSelected(s => s.filter(v => v !== id))}><X size={14} /></button></div><b>{row.predicted.toFixed(2)}<small> / 10</small></b>{REQUIRED.map(f => <p key={f}><span>{f}</span><strong>{row.measurements[f]}</strong></p>)}</article>; })}</div>}
        <div className="table-scroll"><table><caption className="sr-only">Sample measurements and model predictions</caption><thead><tr><th aria-label="Compare" /><th>Sample</th><th>Volatile acidity</th><th>Sulphates</th><th>Alcohol</th><th aria-sort={sort === "desc" ? "descending" : "ascending"}><button onClick={() => setSort(s => s === "desc" ? "asc" : "desc")}>Predicted quality<ArrowUpDown size={13} /></button></th><th>Range check</th></tr></thead><tbody>{visible.map(row => <tr key={row.id}><td><input type="checkbox" aria-label={`Compare ${row.id}`} checked={selected.includes(row.id)} disabled={selected.length >= 3 && !selected.includes(row.id)} onChange={() => setSelected(s => s.includes(row.id) ? s.filter(id => id !== row.id) : [...s, row.id])} /></td><th scope="row">{row.id}</th><td>{row.measurements["volatile acidity"].toFixed(2)}</td><td>{row.measurements.sulphates.toFixed(2)}</td><td>{row.measurements.alcohol.toFixed(1)}%</td><td><span className="table-score">{row.predicted.toFixed(2)}</span><span className="mini-score"><i style={{ width: `${Math.min(100, row.predicted * 10)}%` }} /></span></td><td>{row.warnings.length ? <span className="range-badge warn" title={row.warnings.join(" ")}><TriangleAlert size={12} />Outside range</span> : <span className="range-badge"><Check size={12} />Within range</span>}</td></tr>)}</tbody></table>{!visible.length && <p className="empty-table">No samples match these filters.</p>}</div>
        <div className="pagination"><span>{filtered.length.toLocaleString()} matching samples · Page {safePage + 1} of {pages}</span><div><button className="secondary-button" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</button><button className="secondary-button" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}>Next</button></div></div>
      </section>
    </>}
  </div>;
}
