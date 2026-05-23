import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function fail(message: string, status = 400) {
  return NextResponse.json(
    {
      ok: false,
      message
    },
    { status }
  );
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

    const engineUrl = process.env.AI_MCU_ENGINE_URL;

    if (!engineUrl) {
      return NextResponse.json({
        ok: true,
        message:
          "Generate PDF page siap. Python PDF Engine belum dikonfigurasi di AI_MCU_ENGINE_URL.",
        jobId: `local-preview-${Date.now()}`,
        engineMode: "not-connected",
        fileName: "",
        pdfUrl: "",
        config: {
          mode,
          uploadDrive,
          mergePdf
        }
      });
    }

    const res = await fetch(`${engineUrl.replace(/\/$/, "")}/generate-pdf`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        mode,
        uploadDrive,
        mergePdf
      })
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok || !json.ok) {
      return fail(json.message || "Python PDF Engine gagal generate PDF.", 500);
    }

    return NextResponse.json({
      ok: true,
      message: json.message || "PDF berhasil digenerate.",
      jobId: json.jobId,
      pdfUrl: json.pdfUrl,
      fileName: json.fileName,
      engineMode: "python-engine"
    });
  } catch (error: any) {
    return fail(error?.message || "Generate PDF gagal.", 500);
  }
}