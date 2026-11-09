import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/predict/route.ts";
import { GET as health } from "../app/api/health/route.ts";
import { GET as metadata } from "../app/api/model/route.ts";
import type { Prediction } from "../lib/predictor.ts";
import { modelMetadata } from "../lib/predictor.ts";
const good = { "volatile acidity": .7, sulphates: .56, alcohol: 9.4 };
const request = (body: unknown) => new Request("https://wine.test/api/predict", { method: "POST", body: JSON.stringify(body) });

test("health and model schema expose the locked champion", async () => {
  assert.equal((await (await health()).json() as {status: string}).status, "ok");
  const body = await (await metadata()).json() as typeof modelMetadata;
  assert.equal(body.family, "CatBoost");
  assert.deepEqual(body.selected_features, Object.keys(good));
});
test("real route returns exact ordered batch predictions without caching", async () => {
  const response = await POST(request({ samples: [good, good] }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json() as {predictions: Prediction[]};
  assert.equal(body.predictions.length, 2);
  assert.deepEqual(body.predictions[0], body.predictions[1]);
  assert.ok(Math.abs(body.predictions[0].predicted_quality - 5) < .1);
});
test("route handles 500 sample chunks and 1000 sample request limit", async () => {
  const response = await POST(request({ samples: Array(1000).fill(good) }));
  assert.equal((await response.json() as {predictions: Prediction[]}).predictions.length, 1000);
  assert.equal((await POST(request({ samples: Array(1001).fill(good) }))).status, 422);
});
for (const body of [{}, { samples: [] }, { samples: [{}] }, { samples: [good], extra: 1 }, { samples: [{ ...good, quality: 5 }] }]) {
  test(`route rejects invalid contract ${JSON.stringify(body)}`, async () => assert.equal((await POST(request(body))).status, 422));
}
test("route rejects malformed JSON and oversized body", async () => {
  assert.equal((await POST(new Request("https://wine.test/api/predict", { method: "POST", body: "broken" }))).status, 400);
  assert.equal((await POST(new Request("https://wine.test/api/predict", { method: "POST", body: "x".repeat(1_000_001) }))).status, 413);
});
