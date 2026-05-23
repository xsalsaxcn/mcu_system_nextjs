"use client";

import { useState } from "react";

type UploadResult = {
  ok: boolean;
  message?: string;
  file?: {
    name: string;
    size: number;
    type: string;
  };
  preset?: string;
  nextStep?: string;
};

export default function AiMcuUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preset, setPreset] = useState("autodetect");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState("");

  async function submitUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setResult(null);
    setError("");

    if (!file) {
      setError("Pilih file Excel terlebih dahulu.");
      return;
    }

    const allowed = [".xlsx", ".xls"];
    const lowerName = file.name.toLowerCase();
    const validExt = allowed.some((ext) => lowerName.endsWith(ext));

    if (!validExt) {
      setError("Format file harus .xlsx atau .xls.");
      return;
    }

    const form = new FormData();
    form.append("file", file);
    form.append("preset", preset);

    try {
      setLoading(true);

      const res = await fetch("/api/ai-mcu/upload", {
        method: "POST",
        body: form,
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        setError(json.message || "Upload gagal.");
        return;
      }

      setResult(json);
    } catch (err: any) {
      setError(err?.message || "Upload gagal.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Upload Excel AI MCU</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Upload file Excel hasil MCU untuk diproses oleh AI MCU Analyzer.
              Tahap ini menyiapkan workflow upload dan pilihan mapping header.
            </p>
          </div>

          <a
            href="/ai-mcu"
            className="rounded-xl border px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Kembali
          </a>
        </div>

        <form onSubmit={submitUpload} className="mt-6 space-y-5">
          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">
              File Excel
            </label>

            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
            />

            <p className="mt-2 text-xs text-slate-500">
              Format yang didukung: .xlsx dan .xls.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">
              Preset Mapping
            </label>

            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
            >
              <option value="autodetect">Auto Detect</option>
              <option value="manual">Manual Mapping</option>
            </select>

            <p className="mt-2 text-xs text-slate-500">
              Auto Detect mencoba membaca header otomatis. Manual Mapping akan
              diarahkan ke halaman mapping seperti konsep mail merge / Autocrat.
            </p>
          </div>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
              {error}
            </div>
          ) : null}

          {result?.ok ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              <div className="font-bold">{result.message}</div>
              <div className="mt-2">
                File: <b>{result.file?.name}</b>
              </div>
              <div>
                Size: <b>{result.file?.size?.toLocaleString()} bytes</b>
              </div>
              <div>
                Preset: <b>{result.preset}</b>
              </div>
              <div className="mt-2 text-xs">
                Next step: {result.nextStep}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Uploading..." : "Upload Excel"}
            </button>

            <a
              href="/ai-mcu/mapping"
              className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              Ke Mapping Header
            </a>
          </div>
        </form>
      </div>
    </main>
  );
}