import { Info, ShieldCheck, TriangleAlert } from "lucide-react";
import type { Reliability } from "../lib/reliability";

export function ReliabilityPanel({ reliability }: { reliability: Reliability }) {
  const unusual = reliability.support !== "similar_examples";
  return <section className="reliability-panel" aria-labelledby="reliability-heading">
    <h3 id="reliability-heading">How well does the training data support this sample?</h3>
    <div className={`support-badge ${unusual ? "caution" : ""}`} data-testid="support-label">{unusual ? <TriangleAlert size={16} /> : <ShieldCheck size={16} />}{reliability.support === "outside_range" ? "Outside the studied range" : reliability.support === "unusual_combination" ? "Unusual measurement combination" : "Similar training examples found"}</div>
    <p>Similarity is a context check, not a confidence score or a guarantee of accuracy.</p>
    {reliability.human_review_recommended ? <div className="review-note"><strong>Human review is especially important</strong><ul>{reliability.review_reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></div> : <p className="review-note">No additional review trigger was found. A sensory tasting remains the direct assessment of wine quality.</p>}
    <details className="comparable-details"><summary>Explore 3 comparable training samples</summary><p>Real development samples, selected by similarity across the three inputs. Observed scores are recorded tasting scores, not model predictions.</p>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Comparable training samples"><table><caption>Comparable training samples</caption><thead><tr><th scope="col">Training sample</th><th scope="col">Volatile acidity<br /><small>g/L acetic acid</small></th><th scope="col">Sulphates<br /><small>g/L K₂SO₄</small></th><th scope="col">Alcohol<br /><small>% vol</small></th><th scope="col">Observed score</th></tr></thead><tbody>{reliability.comparable_samples.map(row => <tr key={row.sample_id}><th scope="row">{row.sample_id}</th><td>{row.measurements["volatile acidity"].toFixed(2)}</td><td>{row.measurements.sulphates.toFixed(2)}</td><td>{row.measurements.alcohol.toFixed(1)}%</td><td>{row.observed_quality} / 10</td></tr>)}</tbody></table></div>
      <p>Other measured chemistry may differ. Samples with the same three inputs can also have different tasting scores. Nearby observed scores span {reliability.nearby_observed_range[0]}–{reliability.nearby_observed_range[1]}; this span is not a prediction interval.</p>
      <details><summary>How this check works</summary><p>Five-neighbor distance after scaling the three measurements. Unusual means above the 95th percentile of leave-one-profile-out distances among {reliability.reference_count.toLocaleString()} distinct development profiles. No held-out samples are used. Distance: {reliability.neighborhood_distance.toFixed(3)}; reference cutoff: {reliability.unusual_distance_threshold.toFixed(3)}. This training-based cutoff is a heuristic, not calibrated uncertainty.</p></details>
    </details>
  </section>;
}
