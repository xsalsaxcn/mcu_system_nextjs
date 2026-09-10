"use client";

import { useEffect, useMemo, useState } from "react";

type Preview = {
  companyName: string;
  fileName: string;
  fileHash: string;
  template: string;
  sheetName: string;
  warnings: string[];
  summary: Record<string, number>;
  preview: any[];
};

function number(value: any) {
  return new Intl.NumberFormat("id-ID").format(Number(value || 0));
}

export default function VaccinationHistoryPage() {
  const [companyName, setCompanyName] = useState("BINUS");
  const [sourceYear, setSourceYear] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [batches, setBatches] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({ persons: 0, services: 0, dependents: 0 });

  const canImport = useMemo(() => Boolean(file && companyName.trim() && preview), [file, companyName, preview]);

  async function loadBatches() {
    const params = new URLSearchParams();
    if (companyName.trim()) params.set("company", companyName.trim());
    const json = await fetch(`/api/vaccination/history/batches?${params.toString()}`, { cache: "no-store" }).then((r) => r.json());
    if (json.ok) {
      setBatches(json.batches || []);
      setStats(json.stats || { persons: 0, services: 0, dependents: 0 });
    }
  }

  async function send(mode: "preview" | "import") {
    if (!file) { setError("Pilih file Excel terlebih dahulu."); return; }
    if (!companyName.trim()) { setError("Nama perusahaan wajib diisi."); return; }
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("companyName", companyName.trim());
      form.set("mode", mode);
      if (sourceYear.trim()) form.set("sourceYear", sourceYear.trim());
      const json = await fetch("/api/vaccination/history/import", { method: "POST", body: form }).then((r) => r.json());
      if (!json.ok) {
        setError(json.message || "Proses history gagal.");
        return;
      }
      if (mode === "preview") {
        setPreview(json);
        setMessage("Preview berhasil. Periksa template, jumlah baris, peserta anak, dan contoh data sebelum Import.");
      } else {
        setMessage(json.message || "Import history selesai.");
        await loadBatches();
      }
    } catch {
      setError("Proses history gagal.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadBatches(); }, []);

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-3xl border bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-wide text-emerald-700">Vaccination History V151</div>
              <h1 className="mt-1 text-3xl font-black text-slate-900">Import History Layanan</h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-500">
                Import riwayat lama tanpa memasukkannya ke vaccination_records. History anak disimpan sebagai pasien tersendiri dan diikat ke parent melalui NIK / NIP / Employee ID / Email.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href="/vaccination/register" className="rounded-xl border bg-white px-4 py-2 text-sm font-black hover:bg-slate-50">Registrasi</a>
              <a href="/vaccination" className="rounded-xl border bg-white px-4 py-2 text-sm font-black hover:bg-slate-50">☰ Menu Vaksinasi</a>
            </div>
          </div>

          {error ? <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
          {message ? <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</div> : null}

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <label className="block">
              <span className="text-xs font-black uppercase text-slate-500">Perusahaan</span>
              <input value={companyName} onChange={(e) => { setCompanyName(e.target.value); setPreview(null); }} className="mt-2 w-full rounded-xl border px-3 py-3" placeholder="Contoh: BINUS" />
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase text-slate-500">Tahun Sumber (opsional)</span>
              <input value={sourceYear} onChange={(e) => { setSourceYear(e.target.value); setPreview(null); }} className="mt-2 w-full rounded-xl border px-3 py-3" placeholder="2022 / 2023 / 2024 / 2025" inputMode="numeric" />
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase text-slate-500">File Excel</span>
              <input type="file" accept=".xlsx,.xls" onChange={(e) => { setFile(e.target.files?.[0] || null); setPreview(null); }} className="mt-2 block w-full rounded-xl border bg-white px-3 py-2.5 text-sm" />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={loading || !file} onClick={() => void send("preview")} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{loading ? "Memproses..." : "Preview File"}</button>
            <button type="button" disabled={loading || !canImport} onClick={() => void send("import")} className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50">Import History</button>
          </div>

          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
            Safety: preview tidak menulis database. Import file yang sama bersifat idempotent berdasarkan hash file + sheet + row. File 2024 Dewasa dipakai sebagai identity enrichment bila tidak memiliki tanggal/jenis layanan.
          </div>
        </section>

        {preview ? (
          <section className="rounded-3xl border bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-xl font-black">Preview Import</h2>
                <div className="mt-1 text-sm font-semibold text-slate-500">{preview.fileName} · {preview.sheetName} · {preview.template}</div>
              </div>
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-800">Belum diimport</span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              {[
                ["Total Baris", preview.summary.totalRows],
                ["History Layanan", preview.summary.serviceRows],
                ["Identity Only", preview.summary.identityOnlyRows],
                ["Karyawan", preview.summary.employeeRows],
                ["Anak", preview.summary.dependentRows],
                ["Tanpa Strong ID", preview.summary.missingStrongIdRows],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-2xl border bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase text-slate-500">{label}</div>
                  <div className="mt-2 text-2xl font-black">{number(value)}</div>
                </div>
              ))}
            </div>

            {preview.warnings?.length ? (
              <div className="mt-5 space-y-2">
                {preview.warnings.map((warning) => <div key={warning} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">{warning}</div>)}
              </div>
            ) : null}

            <div className="mt-5 overflow-auto rounded-2xl border">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                  <tr>
                    <th className="p-3 text-left">Row</th>
                    <th className="p-3 text-left">Tipe</th>
                    <th className="p-3 text-left">Nama</th>
                    <th className="p-3 text-left">NIP / Parent ID</th>
                    <th className="p-3 text-left">Email</th>
                    <th className="p-3 text-left">Tanggal</th>
                    <th className="p-3 text-left">Layanan</th>
                    <th className="p-3 text-left">Lokasi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {preview.preview.map((row) => (
                    <tr key={row.row}>
                      <td className="p-3">{row.row}</td>
                      <td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-black ${row.type === "DEPENDENT" ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-700"}`}>{row.type === "DEPENDENT" ? "ANAK" : "KARYAWAN"}</span></td>
                      <td className="p-3 font-bold">{row.name}</td>
                      <td className="p-3">{row.employeeId || "-"}</td>
                      <td className="p-3">{row.email || "-"}</td>
                      <td className="p-3">{row.serviceDate || "-"}</td>
                      <td className="p-3">{[row.service, row.brand].filter(Boolean).join(" · ")}</td>
                      <td className="p-3">{row.location || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <section className="rounded-3xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">Data History Tersimpan</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">Ringkasan master orang, anak/tanggungan, layanan, dan batch import.</p>
            </div>
            <button type="button" onClick={() => void loadBatches()} className="rounded-xl border bg-white px-4 py-2 text-sm font-black hover:bg-slate-50">Refresh</button>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {[["Master Orang", stats.persons], ["Anak / Tanggungan", stats.dependents], ["History Layanan", stats.services]].map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl border bg-slate-50 p-4">
                <div className="text-xs font-black uppercase text-slate-500">{label}</div>
                <div className="mt-2 text-2xl font-black">{number(value)}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 overflow-auto rounded-2xl border">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                <tr>
                  <th className="p-3 text-left">Waktu</th>
                  <th className="p-3 text-left">File</th>
                  <th className="p-3 text-left">Template</th>
                  <th className="p-3 text-left">Baris</th>
                  <th className="p-3 text-left">History</th>
                  <th className="p-3 text-left">Anak</th>
                  <th className="p-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {batches.map((batch) => (
                  <tr key={batch.id}>
                    <td className="p-3">{batch.imported_at ? new Date(batch.imported_at).toLocaleString("id-ID") : "-"}</td>
                    <td className="p-3 font-bold">{batch.source_filename}</td>
                    <td className="p-3">{batch.detected_template || "-"}</td>
                    <td className="p-3">{number(batch.total_rows)}</td>
                    <td className="p-3">{number(batch.service_rows)}</td>
                    <td className="p-3">{number(batch.dependent_rows)}</td>
                    <td className="p-3"><span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-800">{batch.status}</span></td>
                  </tr>
                ))}
                {!batches.length ? <tr><td colSpan={7} className="p-6 text-center text-sm font-semibold text-slate-500">Belum ada batch import untuk perusahaan ini.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
