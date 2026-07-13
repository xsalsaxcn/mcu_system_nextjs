import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// CORPORATE_PDF_HISTORY_INFO_V416
function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function getEngineUrl() {
  return String(process.env.AI_MCU_ENGINE_URL || "").replace(/\/$/, "");
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  const engineUrl = getEngineUrl();
  if (!engineUrl) return fail("AI_MCU_ENGINE_URL belum dikonfigurasi.", 500);

  const body = await req.json().catch(() => ({}));
  const sourceUrl = String(body.sourceUrl || "").trim();
  if (!sourceUrl) return fail("URL PDF riwayat tidak tersedia.");

  let source: URL;
  let engine: URL;
  try {
    source = new URL(sourceUrl);
    engine = new URL(engineUrl);
  } catch {
    return fail("URL PDF riwayat tidak valid.");
  }

  if (source.origin !== engine.origin) {
    return fail("PDF riwayat harus berasal dari Python MCU Engine.");
  }

  const match = source.pathname.match(/^\/files\/([^/]+)\/(.+\.pdf)$/i);
  if (!match) return fail("Format URL PDF riwayat tidak dikenali.");

  const jobId = decodeURIComponent(match[1]);
  const fileName = decodeURIComponent(match[2]);

  try {
    const response = await fetch(`${engineUrl}/corporate-pdf/info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, fileName }),
      cache: "no-store",
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.ok) {
      return fail(json.message || "Gagal membaca metadata PDF riwayat.", response.status || 502);
    }
    return NextResponse.json({ ...json, ok: true, sourceUrl });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Gagal menghubungi Python MCU Engine.";
    return fail(message, 502);
  }
}
