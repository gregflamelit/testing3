import { predict } from "../../../lib/predictor.ts";

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length")) > 1_000_000) return Response.json({ error: "Request is too large." }, { status: 413 });
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 1_000_000) return Response.json({ error: "Request is too large." }, { status: 413 });
    body = JSON.parse(text);
  } catch { return Response.json({ error: "Send a valid JSON request." }, { status: 400 }); }
  try {
    if (!body || typeof body !== "object" || Object.keys(body).join() !== "samples") throw new Error("The request must contain only a samples array.");
    return Response.json({ predictions: predict((body as { samples: unknown }).samples) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid samples." }, { status: 422 });
  }
}
