import { test } from "node:test";
import assert from "node:assert/strict";
import { compareWithReference, comparisonCSV } from "../lib/comparison.ts";
const a = { id: "Lot A", measurements: { "volatile acidity": .7, sulphates: .56, alcohol: 9.4 }, predicted: 5, observed: null };
const b = { id: "Lot B", measurements: { "volatile acidity": .3, sulphates: .8, alcohol: 12.5 }, predicted: 7, observed: null };
test("reference differences have correct direction, units, and zero self-difference", () => {
  const delta = compareWithReference(b, a);
  assert.equal(delta.predicted_delta, 2);
  assert.ok(Math.abs(delta.measurement_deltas.alcohol - 3.1) < 1e-10);
  assert.equal(compareWithReference(a, b).predicted_delta, -2);
  assert.equal(compareWithReference(a, a).predicted_delta, 0);
});
test("comparison CSV preserves the chosen reference and escapes formula-like labels", () => {
  const text = comparisonCSV([{ ...b, id: "=unsafe" }, a], a);
  assert.ok(text.includes("predicted_difference"));
  assert.ok(text.includes("'=unsafe,Lot A,7,5,2"));
  assert.ok(text.includes("Lot A,Lot A,5,5,0,0,0,0"));
});
