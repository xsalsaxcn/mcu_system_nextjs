import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const engineUrl = process.env.AI_MCU_ENGINE_URL || "";

  return NextResponse.json({
    ok: true,
    hasEngineUrl: Boolean(engineUrl),
    engineUrlPreview: engineUrl
      ? engineUrl.replace(/^https?:\/\//, "").slice(0, 40)
      : "",
  });
}