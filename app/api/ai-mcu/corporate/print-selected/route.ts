import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// CORPORATE_SELECTED_PAGES_V414
function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function getEngineUrl() {
  return String(process.env.AI_MCU_ENGINE_URL || "").replace(/\/$/, "");
}

function fixEngineUrl(value: unknown, engineUrl: string) {
  const url = String(value || "");
  if (!url) return "";
  return url
    .replace("http://127.0.0.1:8001", engineUrl)
    .replace("http://localhost:8001", engineUrl)
    .replace("https://127.0.0.1:8001", engineUrl)
    .replace("https://localhost:8001", engineUrl);
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  const engineUrl = getEngineUrl();
  if (!engineUrl) return fail("AI_MCU_ENGINE_URL belum dikonfigurasi.", 500);

  const body = await req.json().catch(() => ({}));
  const sourceUrl = String(body.sourceUrl || "").trim();
  const pages = String(body.pages || "").trim();
  if (!sourceUrl) return fail("Pilih PDF sumber.");
  if (!pages) return fail("Isi halaman yang akan dicetak. Contoh: 1-3,5,8.");

  let source: URL;
  let engine: URL;
  try {
    source = new URL(sourceUrl);
    engine = new URL(engineUrl);
  } catch {
    return fail("URL PDF sumber tidak valid.");
  }

  if (source.origin !== engine.origin) {
    return fail("PDF sumber harus berasal dari Python MCU Engine.");
  }

  const match = source.pathname.match(/^\/files\/([^/]+)\/(.+\.pdf)$/i);
  if (!match) return fail("Format URL PDF sumber tidak dikenali.");

  const jobId = decodeURIComponent(match[1]);
  const fileName = decodeURIComponent(match[2]);

  try {
    const response = await fetch(`${engineUrl}/corporate-pdf/select-pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, fileName, pages }),
      cache: "no-store",
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.ok) {
      return fail(json.message || "Gagal membuat PDF halaman terpilih.", response.status || 502);
    }

    return NextResponse.json({
      ...json,
      ok: true,
      pdfUrl: fixEngineUrl(json.pdfUrl, engineUrl),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Gagal menghubungi Python MCU Engine.";
    return fail(message, 502);
  }
}
