"use client";

import { useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";

// WELLNESS_HISTORY_IMPORT_V352_PAGE

const requiredColumns = [
  ["KODE", "Kunci cocok ke peserta Wellness. Bisa juga No Karyawan / Employee ID."],
  ["Nama Karyawan", "Nama peserta untuk validasi dan tampilan hasil import."],
  ["Tanggal Periksa", "Tanggal MCU / Mini MCU / Final MCU."],
];

const clinicalColumns = [
  ["NO. LAB", "Opsional. Nomor lab / nomor pemeriksaan."],
  ["Nama Grup", "Risk Cluster klinis, misalnya Grup A - Triple Risk."],
  ["Risk Level", "Low / Medium / High / prioritas."],
  ["Selection Reason", "Alasan peserta masuk program Wellness."],
  ["HbA1c Raw", "Teks mentah dari lab bila ada."],
  ["HbA1c %", "Nilai HbA1c angka, contoh 7.1."],
  ["Tensi Raw", "Contoh 156/101."],
  ["Sistolik", "Angka sistolik."],
  ["Diastolik", "Angka diastolik."],
  ["BMI", "Nilai BMI/IMT."],
  ["BB", "Berat badan kg, opsional."],
  ["TB", "Tinggi badan cm, opsional."],
  ["Lingkar Perut", "Waist circumference cm, opsional."],
  ["Gula Darah", "GDP/GDS/glucose, opsional."],
  ["Risk Score", "Skor risiko awal/akhir."],
  ["Fokus Intervensi", "Treatment plan awal."],
  ["Monitoring Day-by-Day", "Rencana monitoring."],
  ["Catatan Validasi Medis", "Catatan dokter/nakes."],
  ["Status Program", "Status awal/final program."],
];

export default function WellnessHistoryImportPage() {
  return <AuthGate>{() => <WellnessHistoryImport />}</AuthGate>;
}

function WellnessHistoryImport() {
  const [file, setFile] = useState<File | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [historyType, setHistoryType] = useState("baseline_mcu");
  const [visitLabel, setVisitLabel] = useState("Baseline MCU");
  const [checkupDate, setCheckupDate] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [companies, setCompanies] = useState<any[]>([]);
  const [createMissing, setCreateMissing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("Upload history pemeriksaan MCU agar baseline/mini MCU/final MCU terbaca di grafik before-after peserta.");
  const [result, setResult] = useState<any>(null);

  async function loadSettings() {
    try {
      const json = await fetch("/api/wellness/settings", { cache: "no-store" }).then((res) => res.json());
      if (json.ok) {
        const loaded = json.companies || [];
        setCompanies(loaded);
        if (!companyId && loaded[0]?.id) setCompanyId(String(loaded[0].id));
      }
    } catch {
      setCompanies([]);
    }
  }

  useEffect(() => { loadSettings(); }, []);

  function handleHistoryType(value: string) {
    setHistoryType(value);
    const labelMap: Record<string, string> = {
      baseline_mcu: "Baseline MCU",
      mini_mcu_week_4: "Mini MCU Week 4",
      mini_mcu_week_8: "Mini MCU Week 8",
      final_mcu: "Final MCU",
      mini_mcu: "Mini MCU",
      other: "Pemeriksaan Lain",
    };
    setVisitLabel(labelMap[value] || value);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) {
      setMessage("Pilih file Excel history MCU terlebih dahulu.");
      return;
    }
    setLoading(true);
    setResult(null);
    setMessage("Mengimport history MCU...");

    const form = new FormData();
    form.set("file", file);
    form.set("history_type", historyType);
    form.set("visit_label", visitLabel);
    if (sheetName.trim()) form.set("sheet_name", sheetName.trim());
    if (checkupDate) form.set("checkup_date", checkupDate);
    if (companyId) form.set("company_id", companyId);
    if (createMissing) form.set("create_missing_participants", "1");

    const json = await fetch("/api/wellness/history/import", { method: "POST", body: form })
      .then((res) => res.json())
      .catch(() => ({ ok: false, message: "Gagal menghubungi server." }));

    setLoading(false);
    setResult(json);
    setMessage(json.message || (json.ok ? "Import history MCU selesai." : "Import history MCU gagal."));
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] bg-gradient-to-r from-blue-700 via-indigo-700 to-fuchsia-600 shadow-sm">
        <div className="p-7 text-white">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-3xl font-black">Import History Pemeriksaan MCU</div>
              <div className="mt-2 max-w-3xl text-sm font-medium text-blue-50">Import baseline MCU, mini MCU, atau final MCU agar grafik before-after per peserta terbaca.</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href="/wellness/import" className="rounded-2xl bg-white/15 px-4 py-3 text-sm font-black text-white ring-1 ring-white/25">Import Peserta</a>
              <a href="/wellness/dashboard" className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-blue-800 shadow-sm">Dashboard</a>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <form onSubmit={submit} className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4">
            <label className="grid gap-2 text-sm font-black text-slate-700">
              File Excel history MCU
              <input type="file" accept=".xlsx,.xls,.csv" className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" onChange={(event) => setFile(event.target.files?.[0] || null)} required />
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-black text-slate-700">
                Company / Main Entity
                <select className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
                  <option value="">Tanpa filter company</option>
                  {companies.map((company) => <option key={company.id} value={String(company.id)}>{company.name}</option>)}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-black text-slate-700">
                Jenis history
                <select className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" value={historyType} onChange={(event) => handleHistoryType(event.target.value)}>
                  <option value="baseline_mcu">Baseline MCU</option>
                  <option value="mini_mcu_week_4">Mini MCU Week 4</option>
                  <option value="mini_mcu_week_8">Mini MCU Week 8</option>
                  <option value="final_mcu">Final MCU</option>
                  <option value="mini_mcu">Mini MCU lainnya</option>
                  <option value="other">Pemeriksaan lain</option>
                </select>
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="grid gap-2 text-sm font-black text-slate-700">
                Visit Label
                <input className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" value={visitLabel} onChange={(event) => setVisitLabel(event.target.value)} />
              </label>
              <label className="grid gap-2 text-sm font-black text-slate-700">
                Tanggal default, opsional
                <input type="date" className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" value={checkupDate} onChange={(event) => setCheckupDate(event.target.value)} />
              </label>
              <label className="grid gap-2 text-sm font-black text-slate-700">
                Nama Sheet, opsional
                <input className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" placeholder="Kosongkan untuk sheet pertama" value={sheetName} onChange={(event) => setSheetName(event.target.value)} />
              </label>
            </div>

            <label className="flex items-start gap-3 rounded-3xl border border-amber-100 bg-amber-50 p-4 text-sm font-bold text-amber-900">
              <input type="checkbox" className="mt-1" checked={createMissing} onChange={(event) => setCreateMissing(event.target.checked)} />
              <span>Buat peserta baru bila KODE belum ditemukan. Default sebaiknya tidak dicentang supaya history tidak salah masuk peserta.</span>
            </label>

            <button disabled={loading} className="rounded-2xl bg-blue-600 px-4 py-4 text-sm font-black text-white shadow-sm disabled:opacity-60">
              {loading ? "Mengimport..." : "Import History MCU"}
            </button>
          </div>
        </form>

        <aside className="space-y-4">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-lg font-black text-slate-900">Mekanisme</div>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm font-semibold leading-6 text-slate-600">
              <li>Import peserta dulu di /wellness/import.</li>
              <li>Upload history MCU di halaman ini.</li>
              <li>Sistem mencocokkan data via KODE / No Karyawan.</li>
              <li>History akan muncul sebagai titik grafik peserta.</li>
              <li>Baseline MCU akan mengisi data before peserta.</li>
            </ol>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-lg font-black text-slate-900">Kolom Wajib</div>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              {requiredColumns.map(([name, description]) => (
                <div key={name} className="rounded-2xl bg-slate-50 p-3"><b>{name}</b><br />{description}</div>
              ))}
            </div>
          </div>
        </aside>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-xl font-black text-slate-900">Format Kolom yang Didukung</div>
        <div className="mt-1 text-sm font-semibold text-slate-500">Format ini cocok untuk file history karyawan yang berisi faktor risiko MCU.</div>
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3 text-left">Kolom</th><th className="px-4 py-3 text-left">Keterangan</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...requiredColumns, ...clinicalColumns].map(([name, description]) => (
                <tr key={name}><td className="px-4 py-3 font-black text-slate-900">{name}</td><td className="px-4 py-3 text-slate-600">{description}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="rounded-3xl bg-slate-100 px-5 py-4 text-sm font-bold text-slate-700">{message}</div>
        {result ? (
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl bg-emerald-50 p-4 text-sm font-black text-emerald-900">Imported: {result.inserted || 0}</div>
            <div className="rounded-2xl bg-blue-50 p-4 text-sm font-black text-blue-900">Baseline updated: {result.updatedBaseline || 0}</div>
            <div className="rounded-2xl bg-purple-50 p-4 text-sm font-black text-purple-900">Peserta baru: {result.createdParticipants || 0}</div>
            <div className="rounded-2xl bg-amber-50 p-4 text-sm font-black text-amber-900">Skipped: {result.skipped || 0}</div>
          </div>
        ) : null}
        {result?.missingParticipants?.length ? (
          <div className="mt-4 rounded-3xl border border-amber-100 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
            <div className="font-black">Peserta belum ditemukan, contoh:</div>
            <div className="mt-2">{result.missingParticipants.join(", ")}</div>
          </div>
        ) : null}
        {result?.errors?.length ? (
          <div className="mt-4 rounded-3xl border border-rose-100 bg-rose-50 p-4 text-sm font-semibold text-rose-900">
            <div className="font-black">Error:</div>
            <ul className="mt-2 list-disc pl-5">{result.errors.slice(0, 8).map((item: string) => <li key={item}>{item}</li>)}</ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}
