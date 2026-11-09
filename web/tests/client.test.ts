import { test } from "node:test";
import assert from "node:assert/strict";
import { requestPredictions } from "../lib/client.ts";
const sample = { "volatile acidity": .7, sulphates: .56, alcohol: 9.4 };

test("client preserves server errors and rejects incomplete/nonfinite responses", async () => {
  const original = globalThis.fetch;
  try {
    for (const body of [{ predictions: [] }, { predictions: [{ predicted_quality: "5", warnings: [] }] }, { predictions: [{ predicted_quality: 5, warnings: [true] }] }]) {
      globalThis.fetch = async () => Response.json(body);
      await assert.rejects(requestPredictions([sample]), /incomplete/);
    }
    globalThis.fetch = async () => Response.json({ error: "Invalid sample" }, { status: 422 });
    await assert.rejects(requestPredictions([sample]), /Invalid sample/);
    globalThis.fetch = async () => { throw new Error("Network failure"); };
    await assert.rejects(requestPredictions([sample]), /Network failure/);
  } finally { globalThis.fetch = original; }
});
