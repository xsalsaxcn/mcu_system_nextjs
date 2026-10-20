"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";

// MCU_SESSION_ALL_COMPANIES_V430
// MCU_DUAL_QUEUE_SESSION_NAMES_V434
// MCU_PUBLIC_QUEUE_CENTRALIZED_V437

type Company = {
  id: number;
  name: string;
  package_ids: number[];
};

type Package = {
  id: number;
  name: string;
  company_id: number;
  description?: string;
};

type ActiveSession = {
  company_id: number;
  package_id: number;
  company_name: string;
  package_name: string;
  selected_at?: string;
};

type Diagnostics = {
  corporate_company_count?: number;
  corporate_package_count?: number;
  participant_link_count?: number;
};

type QueueConfig = {
  id: number;
  track_a_name: string;
  track_b_name: string;
  public_token: string;
};

export default function McuSessionPage() {
  return (
    <AuthGate>
      {() => <McuSessionContent />}
    </AuthGate>
  );
}

function McuSessionContent() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostics>({});
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [companyId, setCompanyId] = useState("");
  const [packageId, setPackageId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [queueConfig, setQueueConfig] = useState<QueueConfig | null>(null);
  const [queueAName, setQueueAName] = useState("Lab Darah");
  const [queueBName, setQueueBName] = useState("Rontgen");
  const [queuePublicUrl, setQueuePublicUrl] = useState("");
  const [queueSaving, setQueueSaving] = useState(false);
  const [queueMessage, setQueueMessage] = useState("");
  const [queueError, setQueueError] = useState("");

  const selectedCompany = useMemo(
    () => companies.find((company) => String(company.id) === String(companyId)) || null,
    [companies, companyId],
  );

  const filteredPackages = useMemo(() => {
    if (!selectedCompany) return [];
    const allowed = new Set((selectedCompany.package_ids || []).map((id) => Number(id)));
    return packages.filter((pkg) => allowed.has(Number(pkg.id)));
  }, [packages, selectedCompany]);

  async function loadQueueConfig() {
    setQueueError("");
    try {
      const res = await fetch("/api/mcu/queue-config", { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || "Gagal memuat setting Antrian MCU.");
      const config = json.queue_session || null;
      setQueueConfig(config);
      setQueueAName(String(config?.track_a_name || "Lab Darah"));
      setQueueBName(String(config?.track_b_name || "Rontgen"));
      setQueuePublicUrl(String(json.public_url || ""));
    } catch (err: any) {
      setQueueConfig(null);
      setQueuePublicUrl("");
      setQueueError(err?.message || "Gagal memuat setting Antrian MCU.");
    }
  }

  async function saveQueueNames(e: React.FormEvent) {
    e.preventDefault();
    setQueueSaving(true);
    setQueueMessage("");
    setQueueError("");
    try {
      const res = await fetch("/api/mcu/queue-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          track_a_name: queueAName,
          track_b_name: queueBName,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || "Gagal menyimpan penamaan Antrian MCU.");
      const config = json.queue_session || null;
      setQueueConfig(config);
      setQueueAName(String(config?.track_a_name || queueAName));
      setQueueBName(String(config?.track_b_name || queueBName));
      setQueuePublicUrl(String(json.public_url || ""));
      setQueueMessage(json.message || "Penamaan Antrian MCU berhasil disimpan.");
    } catch (err: any) {
      setQueueError(err?.message || "Gagal menyimpan penamaan Antrian MCU.");
    } finally {
      setQueueSaving(false);
    }
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/mcu/session", { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || "Gagal memuat Session MCU.");

      setCompanies(json.companies || []);
      setPackages(json.packages || []);
      setDiagnostics(json.diagnostics || {});
      setActiveSession(json.session || null);

      if (json.session) {
        setCompanyId(String(json.session.company_id || ""));
        setPackageId(String(json.session.package_id || ""));
        await loadQueueConfig();
      } else {
        setQueueConfig(null);
        setQueuePublicUrl("");
      }
    } catch (err: any) {
      setError(err?.message || "Gagal memuat Session MCU.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function changeCompany(nextCompanyId: string) {
    setCompanyId(nextCompanyId);

    const nextCompany = companies.find(
      (company) => String(company.id) === String(nextCompanyId),
    );
    const allowed = new Set((nextCompany?.package_ids || []).map((id) => Number(id)));
    const stillValid = packages.some(
      (pkg) => String(pkg.id) === String(packageId) && allowed.has(Number(pkg.id)),
    );

    if (!stillValid) setPackageId("");
    setMessage("");
    setError("");
  }

  async function saveSession(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");

    if (!companyId || !packageId) {
      setError("Pilih perusahaan dan paket pemeriksaan terlebih dahulu.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/mcu/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: Number(companyId),
          package_id: Number(packageId),
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || "Gagal mengaktifkan Session MCU.");
      setActiveSession(json.session || null);
      setMessage("Session MCU Corporate berhasil diaktifkan.");
      await loadQueueConfig();
    } catch (err: any) {
      setError(err?.message || "Gagal mengaktifkan Session MCU.");
    } finally {
      setSaving(false);
    }
  }

  async function clearSession() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/mcu/session", { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || "Gagal mengosongkan Session MCU.");
      setActiveSession(null);
      setCompanyId("");
      setPackageId("");
      setQueueConfig(null);
      setQueueAName("Lab Darah");
      setQueueBName("Rontgen");
      setQueuePublicUrl("");
      setQueueMessage("");
      setQueueError("");
      setMessage("Session MCU Corporate dikosongkan.");
    } catch (err: any) {
      setError(err?.message || "Gagal mengosongkan Session MCU.");
    } finally {
      setSaving(false);
    }
  }

  const selectedPackage = packages.find((pkg) => String(pkg.id) === String(packageId));

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <div className="text-2xl font-black text-slate-900">Session MCU Corporate</div>
        <div className="mt-1 text-sm text-slate-500">
          Pilih perusahaan dan paket pemeriksaan yang sedang digunakan pada session ini.
        </div>
      </section>

      {activeSession ? (
        <section className="card border border-emerald-200 bg-emerald-50/70 p-5">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Session Aktif</div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <div className="text-xs font-bold text-slate-500">Perusahaan</div>
              <div className="mt-1 text-lg font-black text-slate-900">{activeSession.company_name}</div>
            </div>
            <div>
              <div className="text-xs font-bold text-slate-500">Paket Pemeriksaan</div>
              <div className="mt-1 text-lg font-black text-slate-900">{activeSession.package_name}</div>
            </div>
          </div>
        </section>
      ) : null}

      <form onSubmit={saveSession} className="card space-y-5 p-5">
        <div>
          <div className="text-lg font-black text-slate-900">Setting Session</div>
          <div className="mt-1 text-sm text-slate-500">
            Perusahaan dibaca dari data MCU Corporate. Paket mengikuti relasi aktual peserta Corporate dan paket yang sudah disetup.
          </div>
          {!loading ? (
            <div className="mt-2 text-xs font-semibold text-slate-400">
              Terdeteksi {Number(diagnostics.corporate_company_count || companies.length)} perusahaan MCU Corporate.
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">Perusahaan</label>
            <select
              className="input"
              value={companyId}
              onChange={(e) => changeCompany(e.target.value)}
              disabled={loading || saving}
            >
              <option value="">- Pilih Perusahaan -</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Paket Pemeriksaan</label>
            <select
              className="input"
              value={packageId}
              onChange={(e) => {
                setPackageId(e.target.value);
                setMessage("");
                setError("");
              }}
              disabled={!companyId || loading || saving}
            >
              <option value="">- Pilih Paket -</option>
              {filteredPackages.map((pkg) => (
                <option key={pkg.id} value={pkg.id}>{pkg.name}</option>
              ))}
            </select>
            {companyId && !filteredPackages.length ? (
              <div className="mt-2 text-xs font-semibold text-amber-700">
                Belum ada paket Corporate aktif yang terhubung ke perusahaan ini.
              </div>
            ) : null}
          </div>
        </div>

        {selectedPackage?.description ? (
          <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{selectedPackage.description}</div>
        ) : null}

        {error ? <div className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div> : null}
        {message ? <div className="rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">{message}</div> : null}

        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn-primary" disabled={loading || saving || !companyId || !packageId}>
            {saving ? "Menyimpan..." : "Aktifkan Session"}
          </button>
          {activeSession ? (
            <button
              type="button"
              onClick={clearSession}
              disabled={saving}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Kosongkan Session
            </button>
          ) : null}
        </div>
      </form>


      <section className="card p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-lg font-black text-slate-900">Setup Penamaan Antrian MCU</div>
            <div className="mt-1 text-sm text-slate-500">
              Nama antrian bisa diubah per perusahaan + paket. Default: A = Lab Darah, B = Rontgen.
            </div>
          </div>
          {activeSession ? (
            <div className="flex flex-wrap gap-2">
              <a href="/mcu/queue" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-black text-blue-700">Buka Antrian MCU</a>
            </div>
          ) : null}
        </div>

        {!activeSession ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
            Aktifkan perusahaan dan paket terlebih dahulu untuk mengatur nama antrian.
          </div>
        ) : (
          <form onSubmit={saveQueueNames} className="mt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="label">Nama Antrian A</label>
                <input className="input" value={queueAName} maxLength={80} onChange={(e) => setQueueAName(e.target.value)} placeholder="Lab Darah" />
              </div>
              <div>
                <label className="label">Nama Antrian B</label>
                <input className="input" value={queueBName} maxLength={80} onChange={(e) => setQueueBName(e.target.value)} placeholder="Rontgen" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" disabled={queueSaving || !queueAName.trim() || !queueBName.trim()} className="btn-primary">
                {queueSaving ? "Menyimpan..." : "Simpan Penamaan Antrian"}
              </button>
              {queueConfig ? <span className="text-xs font-semibold text-slate-500">Aktif: A · {queueConfig.track_a_name} &nbsp; | &nbsp; B · {queueConfig.track_b_name}</span> : null}
            </div>
            {queueError ? <div className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{queueError}</div> : null}
            {queueMessage ? <div className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{queueMessage}</div> : null}
          </form>
        )}
      </section>

      <section className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
        Session ini khusus <b>MCU Corporate</b>. CAPASKA, Setup Label Paket, Registrasi Ulang, dan layout print label tidak diubah oleh menu ini.
      </section>
    </div>
  );
}
