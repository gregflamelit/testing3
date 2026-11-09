import { modelMetadata } from "../../../lib/predictor.ts";
export async function GET() { return Response.json(modelMetadata); }
