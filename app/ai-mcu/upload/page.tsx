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
  const [presetMapping, setPresetMapping] = useState("auto");
  const [file, setFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<any>(null);

  async function uploadExcel() {
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

    if (!file) {
      setMessage("Pilih file Excel terlebih dahulu.");
      return;
    }

    const form = new FormData();
    form.append("programType", programType);
    form.append("companyName", companyName.trim());
    form.append("databaseName", databaseName.trim());
    form.append("presetMapping", presetMapping);
    form.append("file", file);

    setLoading(true);
    setMessage("Mengupload dan membaca Excel...");

    try {
      const res = await fetch("/api/ai-mcu/upload", {
        method: "POST",
        body: form,
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        setMessage(json.message || "Upload Excel gagal.");
        setResult(json);
        return;
      }

      setResult(json);
      setMessage(json.message || "Excel berhasil diupload.");
    } catch (err: any) {
      setMessage(err?.message || "Upload Excel gagal.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Upload Excel AI MCU</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Upload file Excel hasil MCU, isi nama perusahaan/instansi dan nama database.
              Setelah upload, data peserta dan row hasil MCU akan masuk ke database AI MCU
              dan bisa dipakai di Analisis MCU serta Generate PDF.
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

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
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
                placeholder="Contoh: PT Sehat Sentosa / BPIP"
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
                placeholder="Contoh: MCU PT Sehat Mei 2026"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
              />
              <div className="mt-2 text-xs text-slate-500">
                Nama ini akan muncul di dropdown database pada Analisis MCU dan Generate PDF.
              </div>
            </div>
          </section>

          <section className="rounded-2xl border bg-white p-5">
            <h2 className="text-lg font-bold">File & Mapping</h2>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-bold text-slate-700">
                File Excel
              </label>
              <input
                type="file"
                accept=".xlsx,.xls"
                disabled={loading}
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
              />
              <div className="mt-2 text-xs text-slate-500">
                Format yang didukung: .xlsx dan .xls.
              </div>
            </div>

            <div className="mt-5">
              <label className="mb-2 block text-sm font-bold text-slate-700">
                Preset Mapping
              </label>
              <select
                value={presetMapping}
                onChange={(e) => setPresetMapping(e.target.value)}
                disabled={loading}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
              >
                <option value="auto">Auto Detect</option>
                <option value="manual">Manual Mapping</option>
              </select>
              <div className="mt-2 text-xs text-slate-500">
                Auto Detect akan mencari kolom Nama, NIK, No MCU, dan hasil pemeriksaan dari header Excel.
              </div>
            </div>

            <button
              type="button"
              onClick={uploadExcel}
              disabled={loading}
              className="mt-6 w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Uploading..." : "Upload Excel"}
            </button>

            {message ? (
              <div
                className={`mt-4 rounded-xl border p-4 text-sm font-semibold ${
                  result?.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-amber-200 bg-amber-50 text-amber-800"
                }`}
              >
                {message}
              </div>
            ) : null}
          </section>
        </div>

        {result?.ok ? (
          <section className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <h2 className="text-lg font-bold text-emerald-900">Upload Berhasil</h2>

            <div className="mt-3 grid gap-2 text-sm text-emerald-800 md:grid-cols-2">
              <div>
                Database: <b>{result.source?.name}</b>
              </div>
              <div>
                Program: <b>{result.source?.program_type}</b>
              </div>
              <div>
                Perusahaan/Instansi: <b>{result.source?.institution_name}</b>
              </div>
              <div>
                Peserta tersimpan: <b>{result.totalParticipants}</b>
              </div>
              <div>
                Row Excel terbaca: <b>{result.totalExcelRows}</b>
              </div>
              <div>
                Row data MCU tersimpan: <b>{result.totalStoredRows}</b>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <a
                href="/ai-mcu/analyze"
                className="rounded-xl bg-purple-600 px-5 py-3 text-sm font-bold text-white hover:bg-purple-700"
              >
                Lanjut Analisis MCU
              </a>

              <a
                href="/ai-mcu/generate"
                className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700"
              >
                Lanjut Generate PDF
              </a>

              <a
                href="/ai-mcu/preview"
                className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Preview Data
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
