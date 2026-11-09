import { test } from "node:test";
import assert from "node:assert/strict";
import reference from "../lib/generated/reliability.json" with { type: "json" };
import { assessReliability } from "../lib/reliability.ts";
import { predict } from "../lib/predictor.ts";
test("an ordinary sample gets similar real development examples", () => {
  const r = predict([{ "volatile acidity": .7, sulphates: .56, alcohol: 9.4 }])[0].reliability;
  assert.equal(r.support, "similar_examples");
  assert.equal(r.comparable_samples.length, 3);
  assert.ok(r.neighborhood_distance < r.unusual_distance_threshold);
  for (const neighbor of r.comparable_samples) {
    const original = reference.samples.find(s => s.sample_id === neighbor.sample_id)!;
    assert.equal(neighbor.observed_quality, original.observed_quality);
    assert.deepEqual(Object.values(neighbor.measurements), original.values);
  }
});
test("in-range unusual combinations are flagged independently of range checks", () => {
  const r = predict([{ "volatile acidity": .16, sulphates: 1.98, alcohol: 8.4 }])[0];
  assert.equal(r.warnings.length, 0);
  assert.equal(r.reliability.support, "unusual_combination");
  assert.ok(r.reliability.human_review_recommended);
  assert.match(r.reliability.review_reasons.join(), /combination/);
});
test("outside-range and uncommon predicted scores trigger review", () => {
  const r = predict([{ "volatile acidity": .7, sulphates: .56, alcohol: 15 }])[0].reliability;
  assert.equal(r.support, "outside_range");
  assert.ok(r.human_review_recommended);
  const high = assessReliability({ "volatile acidity": .7, sulphates: .56, alcohol: 9.4 }, 7.1, false);
  assert.match(high.review_reasons.join(), /uncommon score/);
});
test("distance and neighbor ordering are deterministic and finite at extreme values", () => {
  const sample = { "volatile acidity": .7, sulphates: .56, alcohol: 9.4 };
  const a = assessReliability(sample, 5, false);
  assert.deepEqual(a, assessReliability(sample, 5, false));
  assert.ok(a.comparable_samples.every((n, i, all) => i === 0 || n.distance >= all[i-1].distance));
  const extreme = predict([{ ...sample, alcohol: Number.MAX_VALUE }])[0];
  assert.ok(Number.isFinite(extreme.reliability.neighborhood_distance));
});
