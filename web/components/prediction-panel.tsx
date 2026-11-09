"use client";
import { type CSSProperties, type FormEvent, useState } from "react";
import { ArrowDownToLine, ArrowRight, ChevronDown, CircleHelp, Info, Layers3, Loader2, RotateCcw, ShieldCheck, Sparkles, TriangleAlert, Wine } from "lucide-react";
import type { Prediction } from "../lib/predictor";
import { downloadFile } from "../lib/download";
import { requestPredictions } from "../lib/client";
import { resultsCSV } from "../lib/csv";
import { ReliabilityPanel, ComparableEvidence } from "./reliability-panel";
const fields = [
  { key: "volatile acidity", label: "Volatile acidity", unit: "g/L acetic acid", min: .16, max: 1.58, step: .01, description: "Volatile acidity expressed as grams of acetic acid per litre. Enter the lab result in g/L, not mg/L. A value of 0.70 g/L equals 700 mg/L." },
  { key: "sulphates", label: "Sulphates", unit: "g/L potassium sulphate", min: .33, max: 1.98, step: .01, description: "Sulphates expressed as grams of potassium sulphate (K₂SO₄) per litre. This is not a sulphur dioxide or sulphite measurement. Use the same unit as the study data." },
  { key: "alcohol", label: "Alcohol", unit: "% by volume", min: 8.4, max: 14, step: .1, description: "Alcohol by volume as a percentage. For a wine labelled 12.5% ABV, enter 12.5, not 0.125. No automatic unit conversion is performed." },
];
const presets = [
  { name: "Sample A", values: { "volatile acidity": ".70", sulphates: ".56", alcohol: "9.4" } },
  { name: "Sample B", values: { "volatile acidity": ".28", sulphates: ".80", alcohol: "12.5" } },
  { name: "Sample C", values: { "volatile acidity": ".90", sulphates: ".45", alcohol: "10.0" } },
];
export function PredictionPanel({ onCompare, onAnalytics }: { onCompare: () => void; onAnalytics: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({ ...presets[0].values });
  const [result, setResult] = useState<{ prediction: Prediction; values: Record<string, number> } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [preset, setPreset] = useState("Sample A"), [details, setDetails] = useState<string | null>(null);
  const stale = !!result && fields.some(f => Number(values[f.key]) !== result.values[f.key] || !values[f.key].trim());
  function update(key: string, value: string) { setValues(v => ({ ...v, [key]: value })); setPreset("Custom sample"); setError(""); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    const sample = Object.fromEntries(fields.map(f => [f.key, Number(values[f.key])]));
    if (fields.some(f => !values[f.key].trim() || !Number.isFinite(sample[f.key]) || sample[f.key] < 0)) { setError("Enter a valid, nonnegative number for all three measurements."); return; }
    setBusy(true); setError("");
    try {
      const predictions = await requestPredictions([sample]);
      setResult({ prediction: predictions[0], values: sample });
    } catch (e) { setError(e instanceof Error && e.name !== "TimeoutError" ? e.message : "The model took too long to respond. Please try again."); }
    finally { setBusy(false); }
  }
  const warnings = fields.filter(f => values[f.key].trim() && (Number(values[f.key]) < f.min || Number(values[f.key]) > f.max));
  return <><div className="predict-grid">
    <section className="card measurement-card"><div className="section-heading"><div><span className="eyebrow muted">THE INPUTS</span><h2>Meet your sample</h2></div><span className="subtle-pill">Just 3 measurements</span></div>
      <div className="preset-row"><label htmlFor="sample-preset">Start with an example</label><div className="select-wrap"><select id="sample-preset" value={preset} disabled={busy} onChange={e => { const p = presets.find(p => p.name === e.target.value)!; setPreset(p.name); setValues({ ...p.values }); setError(""); }} aria-label="Example sample">{preset === "Custom sample" && <option disabled>Custom sample</option>}{presets.map(p => <option key={p.name}>{p.name}</option>)}</select><ChevronDown size={14} /></div></div>
      <form onSubmit={submit}><fieldset disabled={busy} className="measurement-fields"><legend className="sr-only">Wine sample measurements</legend>{fields.map((f, i) => <div className="measurement" key={f.key}>
        <div className="measurement-label"><label htmlFor={`value-${i}`}>{f.label}</label><button type="button" className="help-button" aria-label={`About ${f.label.toLowerCase()}`} aria-expanded={details === f.key} onClick={() => setDetails(details === f.key ? null : f.key)}><CircleHelp size={14} /></button><span id={`unit-${i}`}>{f.unit}</span></div>
        {details === f.key && <p className="field-description" id={`help-${i}`}>{f.description}</p>}
        <div className="measurement-controls"><input className="measurement-range" type="range" min={f.min} max={f.max} step={f.step} value={Math.min(f.max, Math.max(f.min, Number(values[f.key]) || f.min))} onChange={e => update(f.key, e.target.value)} aria-label={`${f.label} slider`} style={{ "--range-percent": `${Math.min(100, Math.max(0, ((Number(values[f.key]) - f.min) / (f.max - f.min)) * 100))}%` } as CSSProperties} /><input id={`value-${i}`} className="number-input" type="number" inputMode="decimal" min="0" step="any" required value={values[f.key]} onChange={e => update(f.key, e.target.value)} aria-describedby={[`unit-${i}`, `range-${i}`, details === f.key ? `help-${i}` : null].filter(Boolean).join(" ")} /></div>
        <div className="range-labels" id={`range-${i}`}><span>{f.min}</span><span>{f.max}<span className="range-caption">studied range</span></span></div>
      </div>)}</fieldset>
      {warnings.length > 0 && <div className="inline-alert warning" role="status"><TriangleAlert size={16} /><span>{warnings.map(f => f.label).join(", ")} outside the studied range. Reliability is lower.</span></div>}
      {error && <div className="inline-alert error" role="alert">{error}</div>}
      <button className="primary-button full" disabled={busy} type="submit">{busy ? <Loader2 size={18} className="spin" /> : <Sparkles size={17} />}{busy ? "Analyzing your sample…" : "Predict wine quality"}<ArrowRight size={17} /></button><p className="form-caption"><ShieldCheck size={13} />Your measurements aren’t stored by Wine Lab.</p></form>
    </section>
    <section className={`card result-card ${result ? "has-result" : ""}`} aria-live="polite" aria-busy={busy}><div className="result-heading"><span className="eyebrow muted">THE PREDICTION</span><span className="model-tag"><span />CatBoost model</span></div>
      {result ? <><div className="result-intro"><span className="wine-icon"><Wine size={30} strokeWidth={1} /></span><h2>Your sample, in perspective</h2><p>{stale ? "Measurements changed. Predict again to update this result." : "A quality estimate grounded in measured chemistry."}</p></div>
        <div className={`quality-score ${stale ? "stale" : ""}`}><strong data-testid="prediction-score">{result.prediction.predicted_quality.toFixed(2)}</strong><span>/ 10</span></div><div className="score-caption">Estimated sensory quality</div>
        <div className="score-track"><div className="studied-band" /><span className="score-marker" style={{ left: `${Math.min(100, Math.max(0, result.prediction.predicted_quality * 10))}%` }} /><div className="score-ticks"><span>0</span><span>5</span><span>10</span></div></div><p className="score-context">Observed dataset scores range from 3 to 8.</p>
        {result.prediction.warnings.length > 0 && <div className="result-warning"><TriangleAlert size={16} />Outside the training range. Interpret with extra caution.</div>}
        {stale && <div className="result-warning"><RotateCcw size={15} />Showing the previous prediction</div>}

        {!stale && <ReliabilityPanel reliability={result.prediction.reliability} />}
        <button className="secondary-button download-result" disabled={stale || busy} onClick={() => downloadFile("wine-lab-prediction.csv", resultsCSV([{ id: preset, measurements: result.values, observed: null, predicted: result.prediction.predicted_quality, warnings: result.prediction.warnings, reliability: result.prediction.reliability }]))}><ArrowDownToLine size={16} />Download prediction</button>
      </> : <><div className="empty-result"><div className="wine-illustration"><svg viewBox="0 0 220 190" role="img" aria-label="Wine glass illustration"><circle cx="110" cy="87" r="73" fill="#f1e7e6" /><ellipse cx="110" cy="168" rx="43" ry="7" fill="#e6d9d7" /><path d="M80 25h60l8 58c2 26-15 44-38 44S70 109 72 83z" fill="#fffaf6" stroke="#b9a19e" strokeWidth="1.5" /><path d="M76 73c15 7 45-7 68 0l3 13c0 24-15 39-37 39S73 108 74 87z" fill="#852b48" opacity=".9" /><path d="M110 127v37m-25 3h50" stroke="#ad928f" strokeWidth="2" strokeLinecap="round" /><path d="M83 35l-3 23" stroke="white" strokeWidth="3" strokeLinecap="round" /><path d="M162 32v16m-8-8h16" stroke="#ac7e54" strokeWidth="1.5" /><circle cx="55" cy="117" r="3" fill="#ac7e54" /></svg></div><h2>A new perspective<br />is three measurements away.</h2><p>Adjust the sample’s chemistry, then let the model bring the numbers together.</p><div className="empty-prompt"><span>01</span>Measure<i /><span>02</span>Predict<i /><span>03</span>Explore</div></div><div className="empty-bottom"><ShieldCheck size={17} /><span>Validated against 320 held-out samples</span></div></>}
    </section>
  </div>{result && !stale && <ComparableEvidence reliability={result.prediction.reliability} />}<div className="below-prediction"><div><span className="small-circle"><Layers3 size={19} /></span><div><h3>More than one sample?</h3><p>Upload a CSV and compare your results in one place.</p></div><button className="text-button" onClick={onCompare}>Compare a batch<ArrowRight size={16} /></button></div><div><span className="small-circle"><Info size={19} /></span><div><h3>A useful estimate. An honest limit.</h3><p>Best for wines resembling the study data. Rare extremes are harder to predict.</p></div><button className="icon-link" onClick={onAnalytics} aria-label="Read model limitations"><ArrowRight size={18} /></button></div></div></>;
}

