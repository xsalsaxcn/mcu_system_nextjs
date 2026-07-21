"use client";

import { useState } from "react";
import AuthGate from "@/components/AuthGate";

export default function WellnessImportPage() {
  return <AuthGate>{() => <WellnessImport />}</AuthGate>;
}

function WellnessImport() {
  const [file, setFile] = useState<File | null>(null);
  const [groupName, setGroupName] = useState("Wellness Default");
  const [sheetName, setSheetName] = useState("");
  const [message, setMessage] = useState("Upload Excel peserta. No Karyawan akan menjadi kunci signup peserta.");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) {
      setMessage("Pilih file Excel terlebih dahulu.");
      return;
    }

    setLoading(true);
    setResult(null);
    setMessage("Mengimport peserta Wellness...");
    const form = new FormData();
    form.set("file", file);
    form.set("group_name", groupName);
    if (sheetName.trim()) form.set("sheet_name", sheetName.trim());

    const json = await fetch("/api/wellness/import/participants", {
      method: "POST",
      body: form,
    }).then((r) => r.json()).catch(() => ({ ok: false, message: "Gagal menghubungi server." }));

    setLoading(false);
    if (!json.ok) {
      setMessage(json.message || "Import gagal.");
      return;
    }
    setResult(json);
    setMessage("Import selesai. Peserta bisa signup melalui /wellness/signup memakai No Karyawan yang sudah diimport.");
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] bg-gradient-to-r from-fuchsia-600 via-rose-600 to-orange-500 shadow-sm">
        <div className="p-7 text-white">
          <div className="text-3xl font-black">Import Peserta Wellness</div>
          <div className="mt-2 max-w-3xl text-sm font-medium text-rose-50">Import data existing karyawan/peserta sebagai dasar signup mandiri.</div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <form onSubmit={submit} className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4">
            <label className="grid gap-2 text-sm font-black text-slate-700">
              File Excel peserta
              <input type="file" accept=".xlsx,.xls,.csv" className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" onChange={(e) => setFile(e.target.files?.[0] || null)} required />
            </label>
            <label className="grid gap-2 text-sm font-black text-slate-700">
              Nama Kelompok Default
              <input className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
            </label>
            <label className="grid gap-2 text-sm font-black text-slate-700">
              Nama Sheet, opsional
              <input className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" placeholder="Kosongkan untuk sheet pertama" value={sheetName} onChange={(e) => setSheetName(e.target.value)} />
            </label>
            <button disabled={loading} className="rounded-2xl bg-rose-600 px-5 py-4 text-sm font-black text-white shadow-sm disabled:opacity-60">{loading ? "Importing..." : "Import Peserta"}</button>
          </div>
        </form>

        <aside className="space-y-4">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-lg font-black text-slate-900">Format Kolom yang Didukung</div>
            <div className="mt-3 text-sm font-semibold leading-6 text-slate-600">
              Minimal: <b>No Karyawan</b> dan <b>Nama</b>. Opsional: Email, No HP, Jenis Kelamin, Tanggal Lahir, Tinggi Badan, Berat Badan Awal, Target Berat, Kelompok/Divisi.
            </div>
          </div>
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-lg font-black text-slate-900">Link Signup Peserta</div>
            <a href="/wellness/signup" className="mt-3 block rounded-2xl bg-blue-600 px-4 py-3 text-center text-sm font-black text-white">Buka /wellness/signup</a>
          </div>
        </aside>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold leading-6 text-slate-700">{message}</div>
        {result ? (
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl bg-emerald-50 p-4"><div className="text-xs font-black uppercase text-emerald-600">Inserted</div><div className="mt-1 text-3xl font-black text-emerald-900">{result.inserted}</div></div>
            <div className="rounded-2xl bg-blue-50 p-4"><div className="text-xs font-black uppercase text-blue-600">Updated</div><div className="mt-1 text-3xl font-black text-blue-900">{result.updated}</div></div>
            <div className="rounded-2xl bg-slate-50 p-4"><div className="text-xs font-black uppercase text-slate-500">Skipped</div><div className="mt-1 text-3xl font-black text-slate-900">{result.skipped}</div></div>
            <div className="rounded-2xl bg-amber-50 p-4"><div className="text-xs font-black uppercase text-amber-600">Errors</div><div className="mt-1 text-3xl font-black text-amber-900">{result.errors?.length || 0}</div></div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
