import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// CAPASKA_GENERATE_PDF_STATUS_FALLBACK_V334
// Proxy status job PDF AI MCU dengan fallback beberapa endpoint engine.
// Read-only: hanya membaca status job, tidak mengubah database/data peserta.
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

function sanitizeStatusSource(url: string, engineUrl: string) {
  return url.replace(engineUrl, "");
}

function buildStatusUrls(engineUrl: string, jobId: string) {
  const encoded = encodeURIComponent(jobId);
  return [
    `${engineUrl}/generate-pdf/status/${encoded}`,
    `${engineUrl}/generate-pdf-async/status/${encoded}`,
    `${engineUrl}/ai-mcu/generate-pdf/status/${encoded}`,
    `${engineUrl}/jobs/${encoded}`,
    `${engineUrl}/status/${encoded}`,
  ];
}

async function readJsonSafely(res: Response) {
  try {
    return await res.json();
  } catch {
    return {};
  }
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
  const statusUrls = buildStatusUrls(engineUrl, jobId);
  const failures: any[] = [];

  for (const url of statusUrls) {
    try {
      const res = await fetch(url, {
        method: "GET",
        cache: "no-store",
      });

      const json = await readJsonSafely(res);
      const statusSource = sanitizeStatusSource(url, engineUrl);

      if (!res.ok) {
        failures.push({
          statusSource,
          httpStatus: res.status,
          message: json?.message || json?.error || "Endpoint status belum cocok.",
        });
        continue;
      }

      const pdfFiles = fixFileArray(json.pdfFiles || json.pdf_files, engineUrl);
      const mergedFiles = fixFileArray(json.mergedFiles || json.merged_files, engineUrl);

      const zipFileRaw = json.zipFile || json.zip_file || null;
      const zipFile = zipFileRaw
        ? {
            ...zipFileRaw,
            url: fixPdfUrl(zipFileRaw.url, engineUrl),
          }
        : null;

      return NextResponse.json({
        ...json,
        ok: json.ok ?? true,
        jobId: json.jobId || json.job_id || jobId,
        statusSource,
        pdfUrl: fixPdfUrl(json.pdfUrl || json.pdf_url, engineUrl),
        mergedPdfUrl: fixPdfUrl(json.mergedPdfUrl || json.merged_pdf_url, engineUrl),
        pdfFiles,
        mergedFiles,
        zipFile,
      });
    } catch (error: any) {
      failures.push({
        statusSource: sanitizeStatusSource(url, engineUrl),
        message: error?.message || String(error),
      });
    }
  }

  return NextResponse.json(
    {
      ok: false,
      status: "error",
      message: "Gagal membaca status job PDF dari semua endpoint engine.",
      jobId,
      triedStatusEndpoints: failures,
    },
    { status: 502 }
  );
}
