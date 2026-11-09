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
    !Array.isArray(p.warnings) || p.warnings.some((w: unknown) => typeof w !== "string"))) {
    throw new Error("The model returned incomplete results. Please try again.");
  }
  return body.predictions as Prediction[];
}
