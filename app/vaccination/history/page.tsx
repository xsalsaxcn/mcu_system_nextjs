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

type HeaderInfo = {
  companyName: string;
  fileName: string;
  fileHash: string;
  template: string;
  sheetName: string;
  headers: string[];
  suggestedMapping: Record<string, string>;
  suggestedDefaultParticipantType: "EMPLOYEE" | "DEPENDENT";
};

type VaccinationCompanySource = {
  id: number;
  name: string;
  institutionName: string;
  companyName: string;
  programType: string;
  label: string;
  databaseCount: number;
};

type MappingField = { key: string; label: string; group: "Peserta" | "Parent / Wali" | "Layanan"; required?: boolean };

const MAPPING_FIELDS: MappingField[] = [
  { key: "participantName", label: "Nama Peserta", group: "Peserta", required: true },
  { key: "participantType", label: "Tipe Peserta", group: "Peserta" },
  { key: "employeeId", label: "NIP / Employee ID", group: "Peserta" },
  { key: "nik", label: "NIK / KTP", group: "Peserta" },
  { key: "email", label: "Email", group: "Peserta" },
  { key: "phone", label: "No. HP / Telepon", group: "Peserta" },
  { key: "birthDate", label: "Tanggal Lahir", group: "Peserta" },
  { key: "gender", label: "Gender", group: "Peserta" },
  { key: "parentName", label: "Nama Parent / Wali", group: "Parent / Wali" },
  { key: "parentEmployeeId", label: "NIP / Employee ID Parent", group: "Parent / Wali" },
  { key: "parentNik", label: "NIK Parent", group: "Parent / Wali" },
  { key: "parentEmail", label: "Email Parent", group: "Parent / Wali" },
  { key: "parentPhone", label: "No. HP Parent", group: "Parent / Wali" },
  { key: "serviceDate", label: "Tanggal Layanan / Suntik", group: "Layanan" },
  { key: "serviceName", label: "Jenis Layanan / Benefit", group: "Layanan" },
  { key: "productBrand", label: "Merk / Brand", group: "Layanan" },
  { key: "location", label: "Lokasi", group: "Layanan" },
  { key: "nextDueDate", label: "Jadwal Selanjutnya", group: "Layanan" },
  { key: "notes", label: "Keterangan", group: "Layanan" },
];

function number(value: any) {
  return new Intl.NumberFormat("id-ID").format(Number(value || 0));
}

export default function VaccinationHistoryPage() {
  const [selectedCompanySourceId, setSelectedCompanySourceId] = useState("");
  const [companySources, setCompanySources] = useState<VaccinationCompanySource[]>([]);
  const [loadingCompanySources, setLoadingCompanySources] = useState(true);
  const [companySourceError, setCompanySourceError] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [fileInputKey, setFileInputKey] = useState(0);
  const [sourceYear, setSourceYear] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [headerInfo, setHeaderInfo] = useState<HeaderInfo | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [defaultParticipantType, setDefaultParticipantType] = useState<"EMPLOYEE" | "DEPENDENT">("EMPLOYEE");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [batches, setBatches] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({ persons: 0, services: 0, dependents: 0 });

  const canPreview = useMemo(() => Boolean(selectedCompanySourceId && file && companyName.trim() && headerInfo), [selectedCompanySourceId, file, companyName, headerInfo]);
  const canImport = useMemo(() => Boolean(selectedCompanySourceId && file && companyName.trim() && preview), [selectedCompanySourceId, file, companyName, preview]);

  const selectedCompanySource = useMemo(
    () => companySources.find((source) => String(source.id) === selectedCompanySourceId) || null,
    [companySources, selectedCompanySourceId],
  );

  function changeMapping(field: string, header: string) {
    setMapping((current) => {
      const next = { ...current };
      if (header) next[field] = header; else delete next[field];
      return next;
    });
    setPreview(null);
  }

  async function loadCompanySources() {
    setLoadingCompanySources(true);
    setCompanySourceError("");
    try {
      const json = await fetch("/api/vaccination/history/sources", { cache: "no-store" }).then((r) => r.json());
      if (!json.ok) {
        setCompanySources([]);
        setCompanySourceError(json.message || "Gagal memuat daftar perusahaan vaksinasi.");
        return;
      }
      setCompanySources(Array.isArray(json.sources) ? json.sources : []);
    } catch {
      setCompanySources([]);
      setCompanySourceError("Gagal memuat daftar perusahaan vaksinasi.");
    } finally {
      setLoadingCompanySources(false);
    }
  }

  async function loadBatches(company = companyName) {
    const selectedCompany = company.trim();
    if (!selectedCompany) {
      setBatches([]);
      setStats({ persons: 0, services: 0, dependents: 0 });
      return;
    }
    const params = new URLSearchParams();
    params.set("company", selectedCompany);
    const json = await fetch(`/api/vaccination/history/batches?${params.toString()}`, { cache: "no-store" }).then((r) => r.json());
    if (json.ok) {
      setBatches(json.batches || []);
      setStats(json.stats || { persons: 0, services: 0, dependents: 0 });
    }
  }

  function chooseCompanySource(sourceId: string) {
    setSelectedCompanySourceId(sourceId);
    const selected = companySources.find((source) => String(source.id) === sourceId) || null;
    const nextCompany = selected?.companyName || "";
    setCompanyName(nextCompany);
    setSourceYear("");
    setFile(null);
    setFileInputKey((current) => current + 1);
    setHeaderInfo(null);
    setMapping({});
    setPreview(null);
    setMessage("");
    setError("");
  }

  async function send(mode: "headers" | "preview" | "import") {
    if (!selectedCompanySourceId) { setError("Pilih perusahaan terlebih dahulu."); return; }
    if (!file) { setError("Pilih file Excel terlebih dahulu."); return; }
    if (!companyName.trim()) { setError("Perusahaan dari database belum terbaca."); return; }
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("sourceId", selectedCompanySourceId);
      form.set("companyName", companyName.trim());
      form.set("mode", mode);
      if (sourceYear.trim()) form.set("sourceYear", sourceYear.trim());
      form.set("mapping", JSON.stringify(mapping));
      form.set("defaultParticipantType", defaultParticipantType);
      const json = await fetch("/api/vaccination/history/import", { method: "POST", body: form }).then((r) => r.json());
      if (!json.ok) {
        setError(json.message || "Proses history gagal.");
        return;
      }
      if (mode === "headers") {
        setHeaderInfo(json);
        setMapping({});
        setDefaultParticipantType(json.suggestedDefaultParticipantType === "DEPENDENT" ? "DEPENDENT" : "EMPLOYEE");
        setPreview(null);
        setMessage(`Header terbaca: ${json.headers?.length || 0} kolom. Template: ${json.template}. Atur mapping bila nama header berbeda.`);
      } else if (mode === "preview") {
        setPreview(json);
        setMessage("Preview berhasil. Periksa mapping, jumlah baris, peserta anak, dan contoh data sebelum Import.");
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

  useEffect(() => { void loadCompanySources(); }, []);
  useEffect(() => { void loadBatches(companyName); }, [companyName]);

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
              <span className="text-xs font-black uppercase text-slate-500">Perusahaan / Instansi</span>
              <select value={selectedCompanySourceId} onChange={(e) => chooseCompanySource(e.target.value)} className="mt-2 w-full rounded-xl border bg-white px-3 py-3 font-bold">
                <option value="">{loadingCompanySources ? "Memuat perusahaan..." : "Pilih perusahaan terlebih dahulu"}</option>
                {companySources.map((source) => (
                  <option key={source.id} value={source.id}>{source.companyName}</option>
                ))}
              </select>
              {companySourceError ? <div className="mt-2 text-xs font-bold text-red-600">{companySourceError}</div> : null}
              {selectedCompanySource ? (
                <div className="mt-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
                  Perusahaan History: {companyName} · {selectedCompanySource.databaseCount} database vaksinasi terhubung
                </div>
              ) : null}
              {!selectedCompanySource && !loadingCompanySources ? (
                <div className="mt-2 text-xs font-semibold text-slate-500">Daftar diambil dari field Nama Instansi / Source yang disetting saat Import Database.</div>
              ) : null}
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase text-slate-500">Tahun Sumber (opsional)</span>
              <input disabled={!selectedCompanySourceId} value={sourceYear} onChange={(e) => { setSourceYear(e.target.value); setPreview(null); }} className="mt-2 w-full rounded-xl border px-3 py-3 disabled:bg-slate-100" placeholder="2022 / 2023 / 2024 / 2025" inputMode="numeric" />
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase text-slate-500">File Excel</span>
              <input key={fileInputKey} disabled={!selectedCompanySourceId} type="file" accept=".xlsx,.xls" onChange={(e) => { setFile(e.target.files?.[0] || null); setPreview(null); setHeaderInfo(null); setMapping({}); }} className="mt-2 block w-full rounded-xl border bg-white px-3 py-2.5 text-sm disabled:bg-slate-100" />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={loading || !selectedCompanySourceId || !file} onClick={() => void send("headers")} className="rounded-xl bg-slate-800 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{loading ? "Memproses..." : "1. Baca Header & Mapping"}</button>
            <button type="button" disabled={loading || !canPreview} onClick={() => void send("preview")} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50">2. Preview File</button>
            <button type="button" disabled={loading || !canImport} onClick={() => void send("import")} className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50">3. Import History</button>
          </div>

          {headerInfo ? (
            <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50/50 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-xs font-black uppercase text-blue-700">Menu Mapping Header</div>
                  <h2 className="mt-1 text-lg font-black text-slate-900">Cocokkan kolom Excel ke field History</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-600">Nama header tidak harus sama antar perusahaan. Kosongkan pilihan untuk memakai Auto Detect; pilih header secara manual bila berbeda.</p>
                  <div className="mt-2 text-xs font-bold text-slate-500">{headerInfo.fileName} · {headerInfo.sheetName} · Deteksi: {headerInfo.template} · {headerInfo.headers.length} header</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => { setMapping(headerInfo.suggestedMapping || {}); setPreview(null); }} className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-black text-blue-800 hover:bg-blue-100">Gunakan Saran Otomatis</button>
                  <button type="button" onClick={() => { setMapping({}); setPreview(null); }} className="rounded-xl border bg-white px-3 py-2 text-xs font-black hover:bg-slate-50">Reset ke Auto</button>
                </div>
              </div>

              <div className="mt-4 max-w-md">
                <label className="block">
                  <span className="text-xs font-black uppercase text-slate-500">Default Tipe Peserta bila tidak ada kolom tipe</span>
                  <select value={defaultParticipantType} onChange={(e) => { setDefaultParticipantType(e.target.value === "DEPENDENT" ? "DEPENDENT" : "EMPLOYEE"); setPreview(null); }} className="mt-2 w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-bold">
                    <option value="EMPLOYEE">Karyawan / Dewasa</option>
                    <option value="DEPENDENT">Anak / Tanggungan</option>
                  </select>
                </label>
              </div>

              {(["Peserta", "Parent / Wali", "Layanan"] as const).map((group) => (
                <div key={group} className="mt-5">
                  <div className="mb-2 text-sm font-black text-slate-900">{group}</div>
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {MAPPING_FIELDS.filter((field) => field.group === group).map((field) => (
                      <label key={field.key} className="rounded-xl border bg-white p-3">
                        <span className="text-xs font-black text-slate-600">{field.label}{field.required ? " *" : ""}</span>
                        <select value={mapping[field.key] || ""} onChange={(e) => changeMapping(field.key, e.target.value)} className="mt-2 w-full rounded-lg border px-2 py-2 text-sm">
                          <option value="">Auto Detect / tidak dipaksa</option>
                          {headerInfo.headers.map((header) => <option key={`${field.key}-${header}`} value={header}>{header}</option>)}
                        </select>
                        <div className="mt-1 truncate text-[11px] font-semibold text-slate-400">Saran: {headerInfo.suggestedMapping?.[field.key] || "belum terdeteksi"}</div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}

              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">
                Wajib pastikan Nama Peserta terdeteksi. Untuk anak/tanggungan, map Nama Anak serta minimal salah satu NIK/NIP/Email Parent. Preview ulang setiap kali mapping diubah.
              </div>
            </div>
          ) : null}

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
