import { test } from "node:test";
import assert from "node:assert/strict";
import fixtures from "../lib/generated/parity-fixtures.json" with { type: "json" };
import { evaluate, predict, modelMetadata } from "../lib/predictor.ts";

test("web ensemble matches Python champion on dataset, randomized inputs, and every split boundary", () => {
  let maxError = 0;
  fixtures.inputs.forEach((row, i) => { maxError = Math.max(maxError, Math.abs(evaluate(row) - fixtures.predictions[i])); });
  assert.ok(maxError < 1e-10, `Maximum prediction difference: ${maxError}`);
  assert.equal(fixtures.source_artifact_sha256, modelMetadata.artifact_sha256);
  assert.ok(fixtures.inputs.length > 6000);
});

const good = { "volatile acidity": .7, sulphates: .56, alcohol: 9.4 };
test("range warnings and deterministic ordered batches", () => {
  const a = predict([good])[0];
  assert.deepEqual(predict([good, good]), [a, a]);
  assert.ok(predict([{ ...good, alcohol: 25 }])[0].warnings.length);
  assert.deepEqual(predict([{ alcohol: 9.4, sulphates: .56, "volatile acidity": .7 }])[0], a);
});
for (const value of [null, [], {}, [good, {}], [{ ...good, quality: 5 }], [{ ...good, alcohol: "9.4" }], [{ ...good, alcohol: true }], [{ ...good, alcohol: NaN }], [{ ...good, alcohol: Infinity }], [{ ...good, alcohol: -1 }], Array(1001).fill(good)]) {
  test(`reject invalid model input ${JSON.stringify(value)?.slice(0, 75)}`, () => assert.throws(() => predict(value)));
}
