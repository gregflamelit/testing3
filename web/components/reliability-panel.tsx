import { Info, ShieldCheck, TriangleAlert } from "lucide-react";
import type { Reliability } from "../lib/reliability";
import { REVIEW_LABELS } from "../lib/review-labels";

export function ReliabilityPanel({ reliability }: { reliability: Reliability }) {
  const unusual = reliability.support !== "similar_examples";
  return <section className="reliability-panel compact-review" aria-labelledby="reliability-heading">
    <h3 id="reliability-heading">{reliability.human_review_recommended ? "Review recommended" : "Routine sensory review"}</h3>
    <div className={`support-badge ${unusual ? "caution" : ""}`} data-testid="support-label">{unusual ? <TriangleAlert size={16} /> : <ShieldCheck size={16} />}{reliability.support === "outside_range" ? "Outside the studied range" : reliability.support === "unusual_combination" ? "Unusual measurement combination" : "Similar training examples found"}</div>
    {reliability.review_codes.length > 0 && <ul className="review-chips">{reliability.review_codes.map(code => <li key={code}>{REVIEW_LABELS[code]}</li>)}</ul>}
    <p>{reliability.human_review_recommended ? "Verify the measurements and use a human tasting before making a decision." : "No additional review trigger was found. Tasting remains the direct quality assessment."} These flags are context checks, not confidence scores or proven error alerts.</p>
  </section>;
}

export function ComparableEvidence({ reliability }: { reliability: Reliability }) {
  return <section className="card prediction-evidence" aria-labelledby="sample-evidence-heading"><div className="section-heading"><div><span className="eyebrow muted">EXPLORE THE CONTEXT</span><h2 id="sample-evidence-heading">Comparable samples & model limitations</h2></div></div>
    <details className="comparable-details"><summary>Explore 3 comparable training samples</summary><p>Real development samples, selected by similarity across the three inputs. Observed scores are recorded tasting scores, not model predictions.</p>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Comparable training samples"><table><caption>Comparable training samples</caption><thead><tr><th scope="col">Training sample</th><th scope="col">Volatile acidity<br /><small>g/L acetic acid</small></th><th scope="col">Sulphates<br /><small>g/L K₂SO₄</small></th><th scope="col">Alcohol<br /><small>% vol</small></th><th scope="col">Observed score</th></tr></thead><tbody>{reliability.comparable_samples.map(row => <tr key={row.sample_id}><th scope="row">{row.sample_id}</th><td>{row.measurements["volatile acidity"].toFixed(2)}</td><td>{row.measurements.sulphates.toFixed(2)}</td><td>{row.measurements.alcohol.toFixed(1)}%</td><td>{row.observed_quality} / 10</td></tr>)}</tbody></table></div>
      <p>Other measured chemistry may differ. Samples with the same three inputs can also have different tasting scores. Nearby observed scores span {reliability.nearby_observed_range[0]}–{reliability.nearby_observed_range[1]}; this span is not a prediction interval.</p>
      <details><summary>How this check works</summary><p>Five-neighbor distance after scaling the three measurements. Unusual means above the 95th percentile of leave-one-profile-out distances among {reliability.reference_count.toLocaleString()} distinct development profiles. No held-out samples are used. Distance: {reliability.neighborhood_distance.toFixed(3)}; reference cutoff: {reliability.unusual_distance_threshold.toFixed(3)}. This training-based cutoff is a heuristic, not calibrated uncertainty.</p></details>
    </details><details><summary>Why review was recommended</summary>{reliability.review_reasons.length ? <ul>{reliability.review_reasons.map(reason => <li key={reason}>{reason}</li>)}</ul> : <p>No additional trigger was found; this does not guarantee an accurate prediction.</p>}</details>
    <details><summary>Typical test error and limits of these flags</summary><p>The frozen model’s held-out MAE was 0.45 quality points. This is aggregate test error, not an individual prediction interval. In a separate exploratory grouped development audit, flagged MAE was 0.487 versus 0.475 without a flag; the difference interval included zero. The flags have not demonstrated reliable error detection.</p></details>
  </section>;
}
