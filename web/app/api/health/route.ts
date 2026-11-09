import { modelMetadata } from "../../../lib/predictor.ts";
export async function GET() { return Response.json({ status: "ok", model_version: modelMetadata.model_version }); }
