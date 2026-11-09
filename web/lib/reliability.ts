import reference from "./generated/reliability.json" with { type: "json" };
import rules from "./review-rules.json" with { type: "json" };
import type { ReviewCode } from "./review-labels";

export type ComparableSample = {
  sample_id: string; measurements: Record<string, number>; observed_quality: number;
  same_measurements_quality_range: number[]; distance: number;
};
export type Reliability = {
  support: "similar_examples" | "unusual_combination" | "outside_range";
  neighborhood_distance: number; unusual_distance_threshold: number;
  reference_count: number; comparable_samples: ComparableSample[];
  nearby_observed_range: number[]; human_review_recommended: boolean;
  review_reasons: string[];
  review_codes: ReviewCode[];
};
const normalized = reference.samples.map(sample => sample.values.map((v, i) => (v - reference.means[i]) / reference.scales[i]));

export function assessReliability(sample: Record<string, number>, predictedQuality: number, outsideRange: boolean): Reliability {
  const scaled = reference.features.map((f, i) => (sample[f] - reference.means[i]) / reference.scales[i]);
  const nearest: { index: number; distance: number }[] = [];
  for (let i = 0; i < normalized.length; i++) {
    // hypot avoids squaring overflow; extreme extrapolations are already flagged.
    const distance = Math.min(1e6, Math.hypot(...normalized[i].map((v, k) => scaled[k] - v)) / Math.sqrt(scaled.length));
    const at = nearest.findIndex(n => distance < n.distance);
    if (at >= 0) nearest.splice(at, 0, { index: i, distance });
    else if (nearest.length < rules.neighbors) nearest.push({ index: i, distance });
    if (nearest.length > rules.neighbors) nearest.pop();
  }
  const distance = nearest.reduce((s, n) => s + n.distance, 0) / nearest.length;
  const unusual = distance > reference.unusual_distance_threshold;
  const observed = nearest.flatMap(n => reference.samples[n.index].same_measurements_quality_range);
  const range = [Math.min(...observed), Math.max(...observed)];
  const reasons: string[] = [];
  const codes: ReviewCode[] = [];
  if (outsideRange) { codes.push("outside_range"); reasons.push("At least one measurement is outside the development-data range. Recheck units and use sensory review before acting."); }
  else if (unusual) { codes.push("unusual_combination"); reasons.push("These measurements form an unusual combination, even though each value may be in range. Verify the lab result and seek human review."); }
  if (range[1] - range[0] >= rules.disagreement_span) { codes.push("nearby_disagreement"); reasons.push("Nearby training samples span at least three quality points. Similar chemistry does not determine the sensory score."); }
  if (predictedQuality <= rules.uncommon_low || predictedQuality >= rules.uncommon_high) { codes.push("uncommon_score"); reasons.push("This estimate is near an uncommon score region. This is a scope caution, not a validated error signal; use human tasting review."); }
  return {
    support: outsideRange ? "outside_range" : unusual ? "unusual_combination" : "similar_examples",
    neighborhood_distance: distance, unusual_distance_threshold: reference.unusual_distance_threshold,
    reference_count: reference.reference_count,
    comparable_samples: nearest.slice(0, 3).map(n => {
      const row = reference.samples[n.index];
      return { sample_id: row.sample_id, measurements: Object.fromEntries(reference.features.map((f, i) => [f, row.values[i]])),
        observed_quality: row.observed_quality, same_measurements_quality_range: row.same_measurements_quality_range, distance: n.distance };
    }),
    nearby_observed_range: range, human_review_recommended: reasons.length > 0, review_reasons: reasons, review_codes: codes,
  };
}
