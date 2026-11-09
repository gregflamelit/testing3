import type { Prediction, Measurements } from "./predictor";

export async function requestPredictions(samples: Measurements[]): Promise<Prediction[]> {
  const response = await fetch("/api/predict", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ samples }), signal: AbortSignal.timeout(30000),
  });
  const body = await response.json() as { error?: unknown; predictions?: unknown };
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "The model could not complete the request. Please try again.");
  if (!Array.isArray(body.predictions) || body.predictions.length !== samples.length || body.predictions.some(p =>
    !p || typeof p.predicted_quality !== "number" || !Number.isFinite(p.predicted_quality) ||
    !Array.isArray(p.warnings) || p.warnings.some((w: unknown) => typeof w !== "string") ||
    !p.reliability || !["similar_examples", "unusual_combination", "outside_range"].includes(p.reliability.support) ||
    typeof p.reliability.human_review_recommended !== "boolean" ||
    !Number.isFinite(p.reliability.neighborhood_distance) || !Number.isFinite(p.reliability.unusual_distance_threshold) ||
    !Array.isArray(p.reliability.review_reasons) || p.reliability.review_reasons.some((r: unknown) => typeof r !== "string") ||
    !Array.isArray(p.reliability.nearby_observed_range) || p.reliability.nearby_observed_range.length !== 2 ||
    !Array.isArray(p.reliability.comparable_samples) || p.reliability.comparable_samples.length !== 3)) {
    throw new Error("The model returned incomplete results. Please try again.");
  }
  return body.predictions as Prediction[];
}
