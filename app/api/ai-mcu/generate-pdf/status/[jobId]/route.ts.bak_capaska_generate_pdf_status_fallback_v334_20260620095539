import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function normalizeEngineUrl() {
  return String(process.env.AI_MCU_ENGINE_URL || "").replace(/\/$/, "");
}

function fixPdfUrl(url: unknown, engineUrl: string) {
  const s = String(url || "");
  if (!s) return "";

  return s
    .replace("http://127.0.0.1:8001", engineUrl)
    .replace("http://localhost:8001", engineUrl)
    .replace("https://127.0.0.1:8001", engineUrl)
    .replace("https://localhost:8001", engineUrl);
}

function fixFileArray(files: unknown, engineUrl: string) {
  if (!Array.isArray(files)) return [];

  return files.map((file: any) => ({
    ...file,
    url: fixPdfUrl(file?.url, engineUrl),
  }));
}

export async function GET(
  _req: NextRequest,
  context: { params: { jobId: string } }
) {
  const engineUrl = normalizeEngineUrl();

  if (!engineUrl) {
    return NextResponse.json(
      {
        ok: false,
        status: "error",
        message: "AI_MCU_ENGINE_URL belum dikonfigurasi.",
      },
      { status: 500 }
    );
  }

  const jobId = context.params.jobId;

  const res = await fetch(
    `${engineUrl}/generate-pdf/status/${encodeURIComponent(jobId)}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    return NextResponse.json(
      {
        ok: false,
        status: json.status || "error",
        message: json.message || "Gagal membaca status job.",
        jobId,
      },
      { status: res.status }
    );
  }

  const pdfFiles = fixFileArray(json.pdfFiles, engineUrl);
  const mergedFiles = fixFileArray(json.mergedFiles, engineUrl);

  const zipFile = json.zipFile
    ? {
        ...json.zipFile,
        url: fixPdfUrl(json.zipFile.url, engineUrl),
      }
    : null;

  return NextResponse.json({
    ...json,
    pdfUrl: fixPdfUrl(json.pdfUrl, engineUrl),
    mergedPdfUrl: fixPdfUrl(json.mergedPdfUrl, engineUrl),
    pdfFiles,
    mergedFiles,
    zipFile,
  });
}
