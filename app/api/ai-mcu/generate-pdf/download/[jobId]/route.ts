import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// CAPASKA_GENERATE_PDF_DOWNLOAD_RECURSIVE_V340
// Read-only proxy: mencari hasil PDF/ZIP dari response job engine secara rekursif.
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

function isLikelyDownloadString(value: string) {
  const text = value.trim();
  if (!text) return false;
  if (/\.(pdf|zip)(\?|#|$)/i.test(text)) return true;
  if (/\/files\//i.test(text)) return true;
  if (/\/download\//i.test(text)) return true;
  if (/\/result\//i.test(text) && /pdf|zip|file|download/i.test(text)) return true;
  return false;
}

function collectCandidateStrings(input: any, out: string[] = [], depth = 0) {
  if (depth > 8 || input == null) return out;
  if (typeof input === "string") {
    if (isLikelyDownloadString(input)) out.push(input);
    return out;
  }
  if (Array.isArray(input)) {
    for (const item of input) collectCandidateStrings(item, out, depth + 1);
    return out;
  }
  if (typeof input === "object") {
    for (const [key, value] of Object.entries(input)) {
      const keyText = String(key).toLowerCase();
      if (typeof value === "string") {
        if (
          isLikelyDownloadString(value) ||
          ((keyText.includes("url") || keyText.includes("path") || keyText.includes("file") || keyText.includes("download")) && /pdf|zip|files\//i.test(value))
        ) {
          out.push(value);
        }
      } else {
        collectCandidateStrings(value, out, depth + 1);
      }
    }
  }
  return out;
}

function collectFileNames(input: any, out: string[] = [], depth = 0) {
  if (depth > 8 || input == null) return out;
  if (typeof input === "string") {
    const text = input.trim();
    if (/\.(pdf|zip)$/i.test(text) && !/^https?:\/\//i.test(text) && !text.startsWith("/")) out.push(text);
    return out;
  }
  if (Array.isArray(input)) {
    for (const item of input) collectFileNames(item, out, depth + 1);
    return out;
  }
  if (typeof input === "object") {
    for (const [key, value] of Object.entries(input)) {
      const keyText = String(key).toLowerCase();
      if (typeof value === "string" && (keyText.includes("name") || keyText.includes("file") || keyText.includes("filename"))) {
        const text = value.trim();
        if (/\.(pdf|zip)$/i.test(text) && !/^https?:\/\//i.test(text) && !text.startsWith("/")) out.push(text);
      } else {
        collectFileNames(value, out, depth + 1);
      }
    }
  }
  return out;
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function pickUrl(json: any, engineUrl: string, jobId: string) {
  const directCandidates = [
    json?.mergedPdfUrl,
    json?.merged_pdf_url,
    json?.pdfUrl,
    json?.pdf_url,
    json?.downloadUrl,
    json?.download_url,
    json?.fileUrl,
    json?.file_url,
    json?.url,
    json?.path,
    json?.filePath,
    json?.file_path,
    json?.result?.mergedPdfUrl,
    json?.result?.merged_pdf_url,
    json?.result?.pdfUrl,
    json?.result?.pdf_url,
    json?.result?.downloadUrl,
    json?.result?.download_url,
    json?.result?.fileUrl,
    json?.result?.file_url,
    json?.result?.url,
    json?.data?.mergedPdfUrl,
    json?.data?.pdfUrl,
    json?.data?.downloadUrl,
    json?.data?.download_url,
    json?.data?.fileUrl,
    json?.output?.mergedPdfUrl,
    json?.output?.pdfUrl,
    json?.output?.downloadUrl,
    json?.zipFile?.url,
    json?.zip_file?.url,
    json?.result?.zipFile?.url,
    json?.result?.zip_file?.url,
    json?.data?.zipFile?.url,
    json?.mergedFiles?.[0]?.url,
    json?.merged_files?.[0]?.url,
    json?.pdfFiles?.[0]?.url,
    json?.pdf_files?.[0]?.url,
    json?.files?.[0]?.url,
    json?.result?.mergedFiles?.[0]?.url,
    json?.result?.pdfFiles?.[0]?.url,
    json?.result?.files?.[0]?.url,
    json?.data?.mergedFiles?.[0]?.url,
    json?.data?.pdfFiles?.[0]?.url,
    json?.data?.files?.[0]?.url,
  ];

  for (const candidate of directCandidates) {
    const url = fixEngineUrl(candidate, engineUrl);
    if (url) return url;
  }

  for (const candidate of uniqueValues(collectCandidateStrings(json))) {
    const url = fixEngineUrl(candidate, engineUrl);
    if (url) return url;
  }

  for (const fileName of uniqueValues(collectFileNames(json))) {
    return engineUrl + "/files/" + encodeURIComponent(jobId) + "/" + encodeURIComponent(fileName);
  }

  return "";
}

async function tryReadJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function tryJsonUrl(url: string, engineUrl: string, jobId: string) {
  const res = await fetch(url, { method: "GET", cache: "no-store" });
  const json = await tryReadJson(res);
  if (!res.ok || !json) {
    return { ok: false, status: res.status, message: json?.message || json?.error || res.statusText || "failed" };
  }
  const picked = pickUrl(json, engineUrl, jobId);
  if (picked) return { ok: true, url: picked, status: res.status, message: json?.message || "File URL found." };
  return { ok: false, status: res.status, message: json?.message || json?.status || "No file URL in JSON response." };
}

async function tryFile(url: string) {
  const res = await fetch(url, { method: "GET", cache: "no-store" });
  if (!res.ok) return { ok: false, status: res.status, message: res.statusText || "failed" };

  const contentType = res.headers.get("content-type") || "";
  const disposition = res.headers.get("content-disposition") || "";
  const looksLikeFile = Boolean(disposition) || /pdf|zip|octet-stream/i.test(contentType);
  if (!looksLikeFile) return { ok: false, status: res.status, message: "Endpoint did not return a PDF/ZIP file." };

  const headers = new Headers();
  headers.set("content-type", contentType || "application/octet-stream");
  if (disposition) headers.set("content-disposition", disposition);
  else headers.set("content-disposition", "attachment");

  return { ok: true, response: new NextResponse(res.body, { status: 200, headers }) };
}

function relativeUrl(url: string, engineUrl: string) {
  return url.replace(engineUrl, "<engine>");
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
    engineUrl + "/status/" + encoded,
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
    engineUrl + "/jobs/" + encoded + "/file",
    engineUrl + "/files/" + encoded,
    engineUrl + "/files/" + encoded + ".pdf",
    engineUrl + "/files/" + encoded + ".zip",
    engineUrl + "/download/" + encoded,
    engineUrl + "/result/" + encoded,
    engineUrl + "/outputs/" + encoded + ".pdf",
    engineUrl + "/outputs/" + encoded + ".zip",
    engineUrl + "/output/" + encoded + ".pdf",
    engineUrl + "/output/" + encoded + ".zip",
  ];

  const attempted: any[] = [];

  for (const url of statusCandidates) {
    try {
      const result = await tryJsonUrl(url, engineUrl, jobId);
      attempted.push({ url: relativeUrl(url, engineUrl), ok: result.ok, status: result.status, message: result.message });
      if (result.ok && result.url) return NextResponse.redirect(result.url);
    } catch (error: any) {
      attempted.push({ url: relativeUrl(url, engineUrl), ok: false, message: error?.message || "status fetch failed" });
    }
  }

  for (const url of downloadCandidates) {
    try {
      const result = await tryFile(url);
      attempted.push({ url: relativeUrl(url, engineUrl), ok: result.ok, status: result.status, message: result.message });
      if (result.ok && result.response) return result.response;
    } catch (error: any) {
      attempted.push({ url: relativeUrl(url, engineUrl), ok: false, message: error?.message || "download fetch failed" });
    }
  }

  return NextResponse.json(
    {
      ok: false,
      status: "error",
      jobId,
      message: "PDF selesai, tetapi URL/download file belum ditemukan dari engine. Endpoint /jobs ada tetapi belum mengirim URL/fileName yang bisa dipakai. Perlu cek response detail engine atau tambahkan fileName/url di endpoint /jobs.",
      attempted,
    },
    { status: 404 }
  );
}
