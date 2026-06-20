import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// CAPASKA_GENERATE_PDF_DOWNLOAD_BUTTON_V336
function normalizeEngineUrl() {
  return String(process.env.AI_MCU_ENGINE_URL || "").replace(/\/$/, "");
}

function fixEngineUrl(url: unknown, engineUrl: string) {
  const value = String(url || "").trim();
  if (!value) return "";
  if (value.startsWith("/")) return engineUrl + value;
  return value
    .replace("http://127.0.0.1:8001", engineUrl)
    .replace("http://localhost:8001", engineUrl)
    .replace("https://127.0.0.1:8001", engineUrl)
    .replace("https://localhost:8001", engineUrl);
}

function pickUrl(json: any, engineUrl: string) {
  const candidates = [
    json?.mergedPdfUrl,
    json?.pdfUrl,
    json?.downloadUrl,
    json?.download_url,
    json?.fileUrl,
    json?.file_url,
    json?.url,
    json?.zipFile?.url,
    json?.mergedFiles?.[0]?.url,
    json?.pdfFiles?.[0]?.url,
    json?.files?.[0]?.url,
  ];

  for (const candidate of candidates) {
    const url = fixEngineUrl(candidate, engineUrl);
    if (url) return url;
  }
  return "";
}

async function tryJsonUrl(url: string, engineUrl: string) {
  const res = await fetch(url, { method: "GET", cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) return { ok: false, status: res.status, message: json?.message || res.statusText || "failed" };
  const picked = pickUrl(json, engineUrl);
  if (picked) return { ok: true, url: picked };
  return { ok: false, status: res.status, message: json?.message || "No file URL in JSON response." };
}

async function tryFile(url: string) {
  const res = await fetch(url, { method: "GET", cache: "no-store" });
  if (!res.ok) return { ok: false, status: res.status, message: res.statusText || "failed" };

  const contentType = res.headers.get("content-type") || "";
  const disposition = res.headers.get("content-disposition") || "";
  const looksLikeFile = disposition || /pdf|zip|octet-stream/i.test(contentType);
  if (!looksLikeFile) return { ok: false, status: res.status, message: "Endpoint did not return a PDF/ZIP file." };

  const headers = new Headers();
  headers.set("content-type", contentType || "application/octet-stream");
  if (disposition) headers.set("content-disposition", disposition);
  else headers.set("content-disposition", "attachment");

  return { ok: true, response: new NextResponse(res.body, { status: 200, headers }) };
}

export async function GET(
  _req: NextRequest,
  context: { params: { jobId: string } }
) {
  const engineUrl = normalizeEngineUrl();
  if (!engineUrl) {
    return NextResponse.json({ ok: false, message: "AI_MCU_ENGINE_URL belum dikonfigurasi." }, { status: 500 });
  }

  const jobId = context.params.jobId;
  const encoded = encodeURIComponent(jobId);
  const statusCandidates = [
    engineUrl + "/generate-pdf/status/" + encoded,
    engineUrl + "/generate-pdf-async/status/" + encoded,
    engineUrl + "/ai-mcu/generate-pdf/status/" + encoded,
    engineUrl + "/jobs/" + encoded,
  ];
  const downloadCandidates = [
    engineUrl + "/generate-pdf/download/" + encoded,
    engineUrl + "/generate-pdf-async/download/" + encoded,
    engineUrl + "/generate-pdf/result/" + encoded,
    engineUrl + "/generate-pdf-async/result/" + encoded,
    engineUrl + "/generate-pdf/file/" + encoded,
    engineUrl + "/ai-mcu/generate-pdf/download/" + encoded,
    engineUrl + "/jobs/" + encoded + "/download",
    engineUrl + "/jobs/" + encoded + "/result",
  ];

  const attempted: any[] = [];

  for (const url of statusCandidates) {
    try {
      const result = await tryJsonUrl(url, engineUrl);
      attempted.push({ url: url.replace(engineUrl, "<engine>"), ok: result.ok, status: result.status, message: result.message });
      if (result.ok && result.url) return NextResponse.redirect(result.url);
    } catch (error: any) {
      attempted.push({ url: url.replace(engineUrl, "<engine>"), ok: false, message: error?.message || "status fetch failed" });
    }
  }

  for (const url of downloadCandidates) {
    try {
      const result = await tryFile(url);
      attempted.push({ url: url.replace(engineUrl, "<engine>"), ok: result.ok, status: result.status, message: result.message });
      if (result.ok && result.response) return result.response;
    } catch (error: any) {
      attempted.push({ url: url.replace(engineUrl, "<engine>"), ok: false, message: error?.message || "download fetch failed" });
    }
  }

  return NextResponse.json(
    {
      ok: false,
      status: "error",
      jobId,
      message: "PDF selesai, tetapi URL/download file belum ditemukan dari engine.",
      attempted,
    },
    { status: 404 }
  );
}
