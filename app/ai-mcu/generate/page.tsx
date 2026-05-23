"use client";

import { useState } from "react";

type GenerateResult = {
  ok: boolean;
  message?: string;
  jobId?: string;
  pdfUrl?: string;
  fileName?: string;
  engineMode?: string;
};

export default function AiMcuGeneratePage() {
  const [mode, setMode] = useState("single");
  const [uploadDrive, setUploadDrive] = useState(true);
  const [mergePdf, setMergePdf] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState("");

  async function generatePdf() {
    setLoading(true);
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

      const json = await res.json();

      if (!res.ok || !json.ok) {
        setError(json.message || "Generate PDF gagal.");
        return;
      }

      setResult(json);
    } catch (err: any) {
      setError(err?.message || "Generate PDF gagal.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Generate PDF AI MCU</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Halaman ini akan memanggil Python PDF Engine agar hasil PDF tetap
              sama seperti template AI MCU yang sudah benar. Next.js hanya menjadi
              trigger dan tampilan progress.
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
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
              >
                <option value="single">Single PDF per peserta</option>
                <option value="batch">Batch PDF semua peserta</option>
              </select>
            </div>

            <label className="mt-4 flex items-center gap-3 rounded-xl border bg-white p-4 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={mergePdf}
                onChange={(e) => setMergePdf(e.target.checked)}
              />
              Merge PDF untuk print
            </label>

            <label className="mt-3 flex items-center gap-3 rounded-xl border bg-white p-4 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={uploadDrive}
                onChange={(e) => setUploadDrive(e.target.checked)}
              />
              Upload hasil ke Google Drive
            </label>

            <button
              type="button"
              onClick={generatePdf}
              disabled={loading}
              className="mt-5 w-full rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Generating PDF..." : "Generate PDF"}
            </button>

            {error ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
                {error}
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border bg-white p-5">
            <h2 className="text-lg font-bold">Status Engine</h2>

            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              PDF final harus dibuat oleh Python Engine AI MCU, bukan oleh
              renderer baru di Next.js. Ini menjaga layout PDF tetap sama dengan
              template yang sudah benar.
            </div>

            {result?.ok ? (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                <div className="font-bold">{result.message}</div>

                {result.jobId ? (
                  <div className="mt-2">
                    Job ID: <b>{result.jobId}</b>
                  </div>
                ) : null}

                {result.engineMode ? (
                  <div>
                    Engine: <b>{result.engineMode}</b>
                  </div>
                ) : null}

                {result.fileName ? (
                  <div>
                    File: <b>{result.fileName}</b>
                  </div>
                ) : null}

                {result.pdfUrl ? (
                  <a
                    href={result.pdfUrl}
                    target="_blank"
                    className="mt-4 inline-block rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700"
                  >
                    Buka PDF
                  </a>
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