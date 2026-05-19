"use client";

import { useState } from "react";
import AuthGate from "@/components/AuthGate";

export default function ImportPage() {
  return (
    <AuthGate>
      {(user) => <ImportForm user={user} />}
    </AuthGate>
  );
}

function ImportForm({ user }: { user: any }) {
  const [databaseName, setDatabaseName] = useState("");
  const [institutionName, setInstitutionName] = useState("BPIP / CAPASKA");
  const [companyName, setCompanyName] = useState("BPIP / CAPASKA");
  const [packageName, setPackageName] = useState("CAPASKA 2025/2026");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  if (user.role !== "admin") {
    return <div className="card p-5 text-red-700">Hanya admin yang dapat import database peserta.</div>;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return alert("Upload file Excel dulu.");

    const form = new FormData();
    form.append("database_name", databaseName);
    form.append("institution_name", institutionName);
    form.append("company_name", companyName);
    form.append("package_name", packageName);
    form.append("description", description);
    form.append("file", file);

    setLoading(true);
    setResult(null);

    const res = await fetch("/api/import", { method: "POST", body: form });
    const json = await res.json();

    setLoading(false);
    setResult(json);
  }

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <div className="text-2xl font-black">Import Database Peserta</div>
        <div className="mt-1 text-sm text-slate-500">Template tidak wajib. Sistem auto-detect header: Nama Peserta, Nama, Putra, Putri, Provinsi, NIK, dan lainnya.</div>
      </section>

      <form onSubmit={submit} className="card space-y-4 p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">Nama Database</label>
            <input className="input" value={databaseName} onChange={(e) => setDatabaseName(e.target.value)} placeholder="CAPASKA BPIP 2026 Batch 1" required />
          </div>
          <div>
            <label className="label">Nama Instansi / Source</label>
            <input className="input" value={institutionName} onChange={(e) => setInstitutionName(e.target.value)} />
          </div>
          <div>
            <label className="label">Perusahaan/Instansi</label>
            <input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </div>
          <div>
            <label className="label">Paket Pemeriksaan</label>
            <input className="input" value={packageName} onChange={(e) => setPackageName(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label">Catatan</label>
          <textarea className="input min-h-24" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div>
          <label className="label">Upload Excel</label>
          <input className="input" type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] || null)} required />
        </div>

        <button className="btn-primary" disabled={loading}>{loading ? "Import berjalan..." : "Import Database Peserta"}</button>
      </form>

      {result && (
        <section className={`card p-5 ${result.ok ? "border-emerald-200" : "border-red-200"}`}>
          <div className="text-lg font-black">{result.ok ? "Import selesai" : "Import gagal"}</div>
          <pre className="mt-3 max-h-96 overflow-auto rounded-xl bg-slate-900 p-4 text-xs text-white">{JSON.stringify(result, null, 2)}</pre>
        </section>
      )}
    </div>
  );
}
