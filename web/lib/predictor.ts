import model from "./generated/model.json" with { type: "json" };
import metadata from "./generated/metadata.json" with { type: "json" };
import { assessReliability, type Reliability } from "./reliability.ts";

export const features = model.features;
export const modelMetadata = metadata;
export type Measurements = Record<string, number>;
export type Prediction = {
  predicted_quality: number;
  warnings: string[];
  model_version: string;
  reference_test_mae: number;
  reliability: Reliability;
};

export function validateSamples(samples: unknown): asserts samples is Measurements[] {
  if (!Array.isArray(samples) || samples.length < 1 || samples.length > 1000) {
    throw new Error("Provide between 1 and 1,000 samples per request.");
  }
  for (const [index, sample] of samples.entries()) {
    if (!sample || typeof sample !== "object" || Array.isArray(sample) ||
        Object.keys(sample).length !== features.length || !features.every(f => Object.hasOwn(sample, f))) {
      throw new Error(`Sample ${index + 1}: provide exactly volatile acidity, sulphates, and alcohol.`);
    }
    for (const feature of features) {
      const value = sample[feature];
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        throw new Error(`Sample ${index + 1}: ${feature} must be a finite, nonnegative number.`);
      }
    }
  }
}

export function evaluate(values: number[]): number {
  // CatBoost numeric splits compare float32 inputs against float32 borders.
  const scaled = values.map((v, i) => Math.fround((v - model.means[i]) / model.scales[i]));
  let sum = 0;
  for (const tree of model.trees) {
    let leaf = 0;
    for (let depth = 0; depth < tree.splits.length; depth++) {
      const [feature, border] = tree.splits[depth];
      if (scaled[feature] > border) leaf |= 1 << depth;
    }
    sum += tree.leaves[leaf];
  }
  return model.scale_and_bias[0] as number * sum + (model.scale_and_bias[1] as number[])[0];
}

export function predict(samples: unknown): Prediction[] {
  validateSamples(samples);
  return samples.map(sample => {
    const warnings: string[] = [];
    for (const f of features) {
      const range = metadata.training_ranges[f as keyof typeof metadata.training_ranges];
      if (sample[f] < range.min || sample[f] > range.max) {
        warnings.push(`${f} is outside the training range (${range.min}–${range.max}). Treat this estimate with extra caution.`);
      }
    }
    const predicted_quality = evaluate(features.map(f => sample[f]));
    return {
      predicted_quality, warnings,
      model_version: metadata.model_version, reference_test_mae: metadata.test_metrics.mae,
      reliability: assessReliability(sample, predicted_quality, warnings.length > 0),
    };
  });
}
