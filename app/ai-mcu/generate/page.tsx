"use client";

import { useRef, useState } from "react";

type GeneratedFile = {
  name: string;
  url: string;
  size?: number;
};

type GenerateResult = {
  ok: boolean;
  status?: "queued" | "running" | "done" | "error" | "not_found";
  message?: string;
  jobId?: string;
  progress?: number;
  current?: number;
  total?: number;
  currentName?: string;
  engineMode?: string;
  count?: number;
  fileName?: string;
  pdfUrl?: string;
  mergedPdfUrl?: string;
  pdfFiles?: GeneratedFile[];
  mergedFiles?: GeneratedFile[];
  zipFile?: GeneratedFile | null;
  errors?: { name: string; message: string }[];
};

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function AiMcuGeneratePage() {
  const [mode, setMode] = useState("single");
  const [uploadDrive, setUploadDrive] = useState(false);
  const [mergePdf, setMergePdf] = useState(true);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState("");

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearPollTimer() {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }

  async function pollJob(jobId: string) {
    try {
      const res = await fetch(`/api/ai-mcu/generate-pdf/status/${encodeURIComponent(jobId)}`, {
        method: "GET",
        cache: "no-store",
      });

      const json: GenerateResult = await res.json();

      if (!res.ok || !json.ok) {
        setError(json.message || "Gagal membaca status job PDF.");
        setPolling(false);
        setLoading(false);
        clearPollTimer();
        return;
      }

      setResult(json);

      if (json.status === "done") {
        setPolling(false);
        setLoading(false);
        clearPollTimer();
        return;
      }

      if (json.status === "error") {
        setError(json.message || "Generate PDF gagal di engine.");
        setPolling(false);
        setLoading(false);
        clearPollTimer();
        return;
      }

      pollTimerRef.current = setTimeout(() => {
        pollJob(jobId);
      }, 3000);
    } catch (err: any) {
      setError(err?.message || "Gagal membaca status job PDF.");
      setPolling(false);
      setLoading(false);
      clearPollTimer();
    }
  }

  async function generatePdf() {
    clearPollTimer();
    setLoading(true);
    setPolling(false);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/ai-mcu/generate-pdf", {
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

      const json: GenerateResult = await res.json();

      if (!res.ok || !json.ok) {
        setError(json.message || "Generate PDF gagal.");
        setLoading(false);
        return;
      }

      setResult(json);

      if (!json.jobId) {
        setError("Job ID tidak diterima dari engine.");
        setLoading(false);
        return;
      }

      setPolling(true);
      pollTimerRef.current = setTimeout(() => {
        pollJob(json.jobId as string);
      }, 1500);
    } catch (err: any) {
      setError(err?.message || "Generate PDF gagal.");
      setLoading(false);
      setPolling(false);
      clearPollTimer();
    }
  }

  const progress = Math.max(0, Math.min(100, Number(result?.progress || 0)));
  const done = result?.status === "done";
  const hasFiles =
    Boolean(result?.pdfUrl) ||
    Boolean(result?.mergedPdfUrl) ||
    Boolean(result?.zipFile?.url) ||
    Boolean(result?.pdfFiles?.length) ||
    Boolean(result?.mergedFiles?.length);

  return (
    <main className="p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Generate PDF AI MCU</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Generate PDF sekarang memakai async job. Halaman tidak menunggu request
              panjang; progress akan dipantau otomatis sampai PDF selesai.
            </p>
          </div>

          <a
            href="/ai-mcu"
            className="rounded-xl border px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Kembali
          </a>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <section className="rounded-2xl border bg-slate-50 p-5">
            <h2 className="text-lg font-bold">Pengaturan Generate</h2>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-bold text-slate-700">
                Mode Generate
              </label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                disabled={loading || polling}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm disabled:opacity-60"
              >
                <option value="single">Single PDF per peserta</option>
                <option value="batch">Batch PDF semua peserta</option>
              </select>
            </div>

            <label className="mt-4 flex items-center gap-3 rounded-xl border bg-white p-4 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={mergePdf}
                disabled={loading || polling}
                onChange={(e) => setMergePdf(e.target.checked)}
              />
              Merge PDF untuk print
            </label>

            <label className="mt-3 flex items-center gap-3 rounded-xl border bg-white p-4 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={uploadDrive}
                disabled={loading || polling}
                onChange={(e) => setUploadDrive(e.target.checked)}
              />
              Upload hasil ke Google Drive
            </label>

            <button
              type="button"
              onClick={generatePdf}
              disabled={loading || polling}
              className="mt-5 w-full rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading || polling ? "Generating PDF..." : "Generate PDF"}
            </button>

            {(loading || polling || result) ? (
              <div className="mt-5 rounded-2xl border bg-white p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-bold text-slate-900">
                      Status: {result?.status || "starting"}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Job ID: {result?.jobId || "-"}
                    </div>
                  </div>

                  <div className="text-right text-sm font-black text-slate-700">
                    {progress}%
                  </div>
                </div>

                <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-emerald-600 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                <div className="mt-3 text-sm text-slate-700">
                  {result?.message || "Menyiapkan job..."}
                </div>

                {result?.total ? (
                  <div className="mt-1 text-xs text-slate-500">
                    Progress peserta: {result.current || 0}/{result.total}
                    {result.currentName ? ` · ${result.currentName}` : ""}
                  </div>
                ) : null}
              </div>
            ) : null}

            {error ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
                {error}
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border bg-white p-5">
            <h2 className="text-lg font-bold">Hasil Generate</h2>

            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              PDF final dibuat oleh Python AI MCU Engine di Hugging Face. File hasil
              di server free bersifat sementara; untuk arsip permanen nanti gunakan
              Google Drive atau Supabase Storage.
            </div>

            {done && hasFiles ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  <div className="font-bold">{result?.message}</div>

                  {result?.engineMode ? (
                    <div className="mt-2">
                      Engine: <b>{result.engineMode}</b>
                    </div>
                  ) : null}

                  {result?.count ? (
                    <div>
                      Jumlah PDF: <b>{result.count}</b>
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-3">
                  {result?.pdfUrl ? (
                    <a
                      href={result.pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700"
                    >
                      Buka PDF Pertama
                    </a>
                  ) : null}

                  {result?.mergedPdfUrl ? (
                    <a
                      href={result.mergedPdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700"
                    >
                      Buka PDF Gabungan
                    </a>
                  ) : null}

                  {result?.zipFile?.url ? (
                    <a
                      href={result.zipFile.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
                    >
                      Download ZIP
                    </a>
                  ) : null}
                </div>

                {result?.pdfFiles?.length ? (
                  <div className="rounded-2xl border">
                    <div className="border-b bg-slate-50 px-4 py-3 font-bold">
                      File PDF
                    </div>
                    <div className="divide-y">
                      {result.pdfFiles.slice(0, 20).map((file) => (
                        <a
                          key={file.url}
                          href={file.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between gap-4 px-4 py-3 text-sm hover:bg-slate-50"
                        >
                          <span className="font-semibold text-slate-800">
                            {file.name}
                          </span>
                          <span className="text-xs text-slate-500">
                            {formatBytes(file.size)}
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}

                {result?.errors?.length ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    <div className="font-bold">Sebagian data gagal:</div>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {result.errors.map((err, index) => (
                        <li key={`${err.name}-${index}`}>
                          <b>{err.name}</b>: {err.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border bg-slate-50 p-4 text-sm text-slate-600">
                Belum ada hasil generate.
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-3">
              <a
                href="/ai-mcu/preview"
                className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Preview Data
              </a>

              <a
                href="/ai-mcu/edit"
                className="rounded-xl border border-blue-300 bg-blue-50 px-5 py-3 text-sm font-bold text-blue-700 hover:bg-blue-100"
              >
                Edit Data
              </a>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
