import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function fail(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json(
    {
      ok: false,
      message,
      ...extra,
    },
    { status }
  );
}

function normalizeEngineUrl() {
  return String(process.env.AI_MCU_ENGINE_URL || "").replace(/\/$/, "");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const mode = String(body.mode || "single");
    const uploadDrive = Boolean(body.uploadDrive);
    const mergePdf = Boolean(body.mergePdf);

    if (!["single", "batch"].includes(mode)) {
      return fail("Mode generate tidak valid.");
    }

    const engineUrl = normalizeEngineUrl();

    if (!engineUrl) {
      return fail("AI_MCU_ENGINE_URL belum dikonfigurasi di Vercel.", 500);
    }

    const res = await fetch(`${engineUrl}/generate-pdf-async`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({
        mode,
        uploadDrive,
        mergePdf,
        baseUrl: engineUrl,
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok || !json.ok) {
      return fail(json.message || "Gagal memulai job PDF.", 500, {
        engineStatus: res.status,
        response: json,
      });
    }

    return NextResponse.json({
      ok: true,
      status: json.status || "queued",
      message: json.message || "Generate PDF dimulai.",
      jobId: json.jobId,
      progress: Number(json.progress || 0),
      current: Number(json.current || 0),
      total: Number(json.total || 0),
      engineMode: json.engineMode || "python-engine-async",
    });
  } catch (error: any) {
    return fail(error?.message || "Generate PDF gagal.", 500);
  }
}
