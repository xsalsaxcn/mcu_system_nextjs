"use client";

import { useState } from "react";

const PROGRAM_OPTIONS = [
  { value: "corporate", label: "Corporate" },
  { value: "capaska", label: "CAPASKA" },
];

export default function AiMcuUploadPage() {
  const [programType, setProgramType] = useState("corporate");
  const [companyName, setCompanyName] = useState("");
  const [databaseName, setDatabaseName] = useState("");
  const [thresholdPct, setThresholdPct] = useState(10);
  const [oldFile, setOldFile] = useState<File | null>(null);
  const [newFile, setNewFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<any>(null);

  async function uploadAnalyzerData() {
    setMessage("");
    setResult(null);

    if (!companyName.trim()) {
      setMessage("Nama perusahaan / instansi wajib diisi.");
      return;
    }

    if (!databaseName.trim()) {
      setMessage("Nama database wajib diisi.");
      return;
    }

    if (!newFile) {
      setMessage("Upload MCU Baru wajib diisi.");
      return;
    }

    const form = new FormData();
    form.append("mode", "analyzer");
    form.append("programType", programType);
    form.append("companyName", companyName.trim());
    form.append("databaseName", databaseName.trim());
    form.append("thresholdPct", String(thresholdPct));
    form.append("newFile", newFile);
    if (oldFile) form.append("oldFile", oldFile);

    setLoading(true);
    setMessage("Mengupload MCU lama/baru dan menyiapkan data analisis...");

    try {
      const res = await fetch("/api/ai-mcu/upload", {
        method: "POST",
        body: form,
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        setMessage(json.message || "Upload gagal.");
        setResult(json);
        return;
      }

      setResult(json);
      setMessage(json.message || "Upload berhasil.");
    } catch (err: any) {
      setMessage(err?.message || "Upload gagal.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Upload Excel AI MCU Analyzer</h1>
            <p className="mt-2 max-w-4xl text-sm text-slate-600">
              Flow dibuat seperti AI MCU Analyzer lama: upload MCU lama sebagai pembanding,
              upload MCU baru sebagai data utama, lalu sistem menyiapkan rekap, abnormal,
              prioritas, perbandingan semua parameter, dan interpretasi penyakit.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href="/ai-mcu"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              ☰ Menu AI MCU
            </a>
            <a
              href="/ai-mcu"
              className="rounded-xl border px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Kembali
            </a>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm font-black text-blue-700">
            1. Upload Data
          </div>
          <div className="rounded-xl border bg-slate-50 px-4 py-3 text-sm font-black text-slate-500">
            2. Mapping Otomatis
          </div>
          <div className="rounded-xl border bg-slate-50 px-4 py-3 text-sm font-black text-slate-500">
            3. Analisis
          </div>
          <div className="rounded-xl border bg-slate-50 px-4 py-3 text-sm font-black text-slate-500">
            4. Generate PDF
          </div>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded-2xl border bg-slate-50 p-5">
            <h2 className="text-lg font-bold">Informasi Database</h2>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-bold text-slate-700">
                Jenis Program
              </label>
              <select
                value={programType}
                onChange={(e) => setProgramType(e.target.value)}
                disabled={loading}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
              >
                {PROGRAM_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-bold text-slate-700">
                Nama Perusahaan / Instansi
              </label>
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                disabled={loading}
                placeholder="Contoh: PT Katsuyama / BPIP"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
              />
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-bold text-slate-700">
                Nama Database
              </label>
              <input
                value={databaseName}
                onChange={(e) => setDatabaseName(e.target.value)}
                disabled={loading}
                placeholder="Contoh: MCU PT Katsuyama 2026"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
              />
              <div className="mt-2 text-xs text-slate-500">
                Database ini akan muncul di Analisis MCU, Mapping Header, dan Generate PDF.
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-bold text-slate-700">
                Threshold Perubahan Signifikan (%)
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={thresholdPct}
                onChange={(e) => setThresholdPct(Number(e.target.value || 10))}
                disabled={loading}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
              />
            </div>
          </section>

          <section className="rounded-2xl border bg-white p-5">
            <h2 className="text-lg font-bold">Upload Data MCU</h2>

            <div className="mt-4 rounded-2xl border bg-slate-50 p-4">
              <div className="text-sm font-black text-slate-900">
                MCU Lama / Data Pembanding
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Opsional. Dipakai untuk melihat parameter yang berubah dari tahun/periode sebelumnya.
              </div>
              <input
                type="file"
                accept=".xlsx,.xls"
                disabled={loading}
                onChange={(e) => setOldFile(e.target.files?.[0] || null)}
                className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
              />
            </div>

            <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <div className="text-sm font-black text-blue-900">
                MCU Baru / Data Utama <span className="text-red-600">*</span>
              </div>
              <div className="mt-1 text-xs text-blue-700">
                Wajib. Data ini menjadi sumber rekap, abnormal, prioritas, interpretasi, dan generate PDF.
              </div>
              <input
                type="file"
                accept=".xlsx,.xls"
                disabled={loading}
                onChange={(e) => setNewFile(e.target.files?.[0] || null)}
                className="mt-3 w-full rounded-xl border border-blue-300 bg-white px-4 py-3 text-sm"
              />
            </div>

            <button
              type="button"
              onClick={uploadAnalyzerData}
              disabled={loading}
              className="mt-5 w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Uploading & Preparing..." : "Upload & Siapkan Analisis"}
            </button>
          </section>
        </div>

        {message ? (
          <div
            className={`mt-5 rounded-xl border p-4 text-sm font-semibold ${
              result?.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-800"
            }`}
          >
            {message}
          </div>
        ) : null}

        {result?.ok ? (
          <section className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <h2 className="text-lg font-bold text-emerald-900">Upload Berhasil</h2>

            <div className="mt-3 grid gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-emerald-200 bg-white p-4 text-sm">
                Database
                <div className="mt-1 font-black">{result.source?.name}</div>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-white p-4 text-sm">
                MCU Baru
                <div className="mt-1 font-black">{result.newRows || 0} row</div>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-white p-4 text-sm">
                MCU Lama
                <div className="mt-1 font-black">{result.oldRows || 0} row</div>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-white p-4 text-sm">
                Peserta Baru
                <div className="mt-1 font-black">{result.totalParticipants || 0}</div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <a
                href={`/ai-mcu/analyze?source_id=${result.source?.id || ""}`}
                className="rounded-xl bg-purple-600 px-5 py-3 text-sm font-bold text-white hover:bg-purple-700"
              >
                Lanjut Analisis MCU
              </a>
              <a
                href={`/ai-mcu/generate?source_id=${result.source?.id || ""}`}
                className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700"
              >
                Lanjut Generate PDF
              </a>
              <a
                href={`/ai-mcu/mapping?source_id=${result.source?.id || ""}`}
                className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Mapping Header
              </a>
            </div>
          </section>
        ) : null}

        {result && !result.ok ? (
          <pre className="mt-5 max-h-72 overflow-auto rounded-xl border bg-slate-50 p-4 text-xs text-slate-700">
            {JSON.stringify(result, null, 2)}
          </pre>
        ) : null}
      </div>
    </main>
  );
}


