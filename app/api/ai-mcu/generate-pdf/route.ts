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

async function readJsonSafe(res: Response) {
  const text = await res.text();

  try {
    return {
      json: JSON.parse(text),
      text,
    };
  } catch {
    return {
      json: null,
      text,
    };
  }
}

function normalizeEngineUrl() {
  const raw = process.env.AI_MCU_ENGINE_URL || "";
  return raw.replace(/\/$/, "");
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

function fixFileArray(files: any, engineUrl: string) {
  if (!Array.isArray(files)) return [];

  return files.map((file) => ({
    ...file,
    url: fixPdfUrl(file?.url, engineUrl),
  }));
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();

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
          mergePdf,
        },
      });
    }

    const endpoint = `${engineUrl}/generate-pdf`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300000);

    let res: Response;

    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify({
          mode,
          uploadDrive,
          mergePdf,
          baseUrl: engineUrl,
        }),
      });
    } catch (error: any) {
      clearTimeout(timeout);

      return fail("Next.js tidak bisa connect ke Python PDF Engine.", 500, {
        detail: error?.message || String(error),
        engineUrl,
        endpoint,
      });
    }

    clearTimeout(timeout);

    const { json, text } = await readJsonSafe(res);

    if (!res.ok) {
      return fail(
        json?.message || "Python PDF Engine mengembalikan error.",
        500,
        {
          engineUrl,
          endpoint,
          status: res.status,
          responseText: text?.slice(0, 2000),
        }
      );
    }

    if (!json?.ok) {
      return fail(json?.message || "Generate PDF gagal di Python Engine.", 500, {
        engineUrl,
        endpoint,
        response: json,
      });
    }

    const pdfFiles = fixFileArray(json.pdfFiles, engineUrl);
    const mergedFiles = fixFileArray(json.mergedFiles, engineUrl);

    const fixedPdfUrl = fixPdfUrl(json.pdfUrl, engineUrl);
    const fixedMergedPdfUrl = fixPdfUrl(json.mergedPdfUrl, engineUrl);

    const fixedZipFile = json.zipFile
      ? {
          ...json.zipFile,
          url: fixPdfUrl(json.zipFile.url, engineUrl),
        }
      : null;

    return NextResponse.json({
      ok: true,
      message: json.message || "PDF berhasil digenerate.",
      jobId: json.jobId,
      pdfUrl: fixedPdfUrl,
      fileName: json.fileName,
      mergedPdfUrl: fixedMergedPdfUrl,
      mergedFiles,
      pdfFiles,
      zipFile: fixedZipFile,
      count: json.count,
      engineMode: json.engineMode || "python-engine",
      durationMs: Date.now() - startedAt,
    });
  } catch (error: any) {
    return fail(error?.message || "Generate PDF gagal.", 500);
  }
}