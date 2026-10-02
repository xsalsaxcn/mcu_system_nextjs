import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Corporate-only status proxy.
// Tidak dipakai CAPASKA, Vaksinasi, atau Wellness.
function normalizeEngineUrl() {
  return String(process.env.AI_MCU_ENGINE_URL || "").replace(/\/$/, "");
}

function fixPdfUrl(url: unknown, engineUrl: string) {
  const value = String(url || "").trim();
  if (!value) return "";
  if (value.startsWith("/")) return engineUrl + value;
  return value
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
      { ok: false, status: "error", message: "AI_MCU_ENGINE_URL belum dikonfigurasi." },
      { status: 500 }
    );
  }

  const jobId = context.params.jobId;
  const encoded = encodeURIComponent(jobId);
  const statusUrls = [
    `${engineUrl}/jobs/${encoded}`,
    `${engineUrl}/job-status/${encoded}`,
    `${engineUrl}/generate-pdf-status/${encoded}`,
  ];
  const failures: any[] = [];

  for (const url of statusUrls) {
    try {
      const res = await fetch(url, { method: "GET", cache: "no-store" });
      const json = await readJsonSafely(res);

      if (!res.ok) {
        failures.push({
          statusSource: url.replace(engineUrl, ""),
          httpStatus: res.status,
          message: json?.message || json?.error || "Endpoint status Corporate gagal.",
        });
        continue;
      }

      const resultPayload = json?.result && typeof json.result === "object" && !Array.isArray(json.result)
        ? json.result
        : {};

      const pdfFiles = fixFileArray(
        json.pdfFiles || json.pdf_files || resultPayload.pdfFiles || resultPayload.pdf_files,
        engineUrl
      );
      const mergedFiles = fixFileArray(
        json.mergedFiles || json.merged_files || resultPayload.mergedFiles || resultPayload.merged_files,
        engineUrl
      );
      const zipFileRaw = json.zipFile || json.zip_file || resultPayload.zipFile || resultPayload.zip_file || null;
      const zipFile = zipFileRaw
        ? { ...zipFileRaw, url: fixPdfUrl(zipFileRaw.url, engineUrl) }
        : null;

      return NextResponse.json({
        ...json,
        ok: json.ok ?? resultPayload.ok ?? true,
        jobId: json.jobId || json.job_id || resultPayload.jobId || resultPayload.job_id || jobId,
        pdfUrl: fixPdfUrl(json.pdfUrl || json.pdf_url || resultPayload.pdfUrl || resultPayload.pdf_url, engineUrl),
        mergedPdfUrl: fixPdfUrl(
          json.mergedPdfUrl || json.merged_pdf_url || resultPayload.mergedPdfUrl || resultPayload.merged_pdf_url,
          engineUrl
        ),
        pdfFiles,
        mergedFiles,
        zipFile,
      });
    } catch (error: any) {
      failures.push({
        statusSource: url.replace(engineUrl, ""),
        message: error?.message || String(error),
      });
    }
  }

  return NextResponse.json(
    {
      ok: false,
      status: "error",
      message: "Gagal membaca status job PDF Corporate dari semua endpoint engine.",
      jobId,
      triedStatusEndpoints: failures,
    },
    { status: 502 }
  );
}
