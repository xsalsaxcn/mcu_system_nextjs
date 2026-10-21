"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";

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

type QueueSession = {
  id: number;
  company_id: number;
  package_id: number;
  company_name?: string;
  package_name?: string;
  session_name?: string | null;
  location?: string | null;
  session_date?: string | null;
  track_a_name?: string;
  track_b_name?: string;
  is_active?: number;
  public_token?: string;
};

type Diagnostics = {
  corporate_company_count?: number;
  corporate_package_count?: number;
  participant_link_count?: number;
};

function dateLabel(value?: string | null) {
  if (!value) return "Tanggal belum diatur";
  try {
    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(`${value}T00:00:00`));
  } catch {
    return value;
  }
}

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
  const [queueSessions, setQueueSessions] = useState<QueueSession[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostics>({});
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);

  const [companyId, setCompanyId] = useState("");
  const [packageId, setPackageId] = useState("");

  const [location, setLocation] = useState("");
  const [sessionDate, setSessionDate] = useState("");
  const [sessionName, setSessionName] = useState("");
  const [trackAName, setTrackAName] = useState("Lab Darah");
  const [trackBName, setTrackBName] = useState("Rontgen");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedCompany = useMemo(
    () =>
      companies.find(
        (company) => String(company.id) === String(companyId),
      ) || null,
    [companies, companyId],
  );

  const filteredPackages = useMemo(() => {
    if (!selectedCompany) return [];
    const allowed = new Set(
      (selectedCompany.package_ids || []).map((id) => Number(id)),
    );
    return packages.filter((pkg) => allowed.has(Number(pkg.id)));
  }, [packages, selectedCompany]);

  const visibleSessions = useMemo(
    () =>
      queueSessions
        .filter(
          (row) =>
            String(row.company_id) === String(companyId) &&
            String(row.package_id) === String(packageId),
        )
        .sort((a, b) => {
          const ad = String(a.session_date || "9999-12-31");
          const bd = String(b.session_date || "9999-12-31");
          return ad.localeCompare(bd) || Number(a.id) - Number(b.id);
        }),
    [queueSessions, companyId, packageId],
  );

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/mcu/session", { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.message || "Gagal memuat Session MCU.");
      }

      setCompanies(json.companies || []);
      setPackages(json.packages || []);
      setQueueSessions(json.queue_sessions || []);
      setDiagnostics(json.diagnostics || {});
      setActiveSession(json.session || null);

      if (json.session) {
        setCompanyId(String(json.session.company_id || ""));
        setPackageId(String(json.session.package_id || ""));
      } else if ((json.companies || []).length) {
        const first = json.companies[0];
        setCompanyId(String(first.id || ""));
        setPackageId(String(first.package_ids?.[0] || ""));
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
    const company = companies.find(
      (row) => String(row.id) === String(nextCompanyId),
    );
    setPackageId(String(company?.package_ids?.[0] || ""));
    setMessage("");
    setError("");
  }

  async function activateSelection(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId || !packageId) {
      setError("Pilih perusahaan dan paket pemeriksaan.");
      return;
    }

    setSaving(true);
    setMessage("");
    setError("");

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
      if (!json.ok) {
        throw new Error(json.message || "Gagal menyimpan pilihan MCU.");
      }
      setActiveSession(json.session || null);
      setMessage(json.message || "Pilihan MCU Corporate aktif.");
    } catch (err: any) {
      setError(err?.message || "Gagal menyimpan pilihan MCU.");
    } finally {
      setSaving(false);
    }
  }

  async function addLocationSession(e: React.FormEvent) {
    e.preventDefault();

    if (!companyId || !packageId) {
      setError("Pilih perusahaan dan paket pemeriksaan.");
      return;
    }
    if (!location.trim() || !sessionDate) {
      setError("Lokasi dan tanggal MCU wajib diisi.");
      return;
    }
    if (!trackAName.trim() || !trackBName.trim()) {
      setError("Nama Antrian A dan B wajib diisi.");
      return;
    }
    if (
      trackAName.trim().toLowerCase() ===
      trackBName.trim().toLowerCase()
    ) {
      setError("Nama Antrian A dan B harus berbeda.");
      return;
    }

    setSaving(true);
    setMessage("");
    setError("");

    try {
      const res = await fetch("/api/mcu/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-location-session",
          company_id: Number(companyId),
          package_id: Number(packageId),
          location: location.trim(),
          session_date: sessionDate,
          session_name: sessionName.trim(),
          track_a_name: trackAName.trim(),
          track_b_name: trackBName.trim(),
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        throw new Error(
          json.message || "Gagal menambahkan Session lokasi MCU.",
        );
      }

      setLocation("");
      setSessionDate("");
      setSessionName("");
      setMessage(
        json.message || "Session lokasi/tanggal MCU berhasil ditambahkan.",
      );
      await load();
    } catch (err: any) {
      setError(
        err?.message || "Gagal menambahkan Session lokasi MCU.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function setSessionActive(
    queueSessionId: number,
    active: boolean,
  ) {
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const res = await fetch("/api/mcu/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: active
            ? "reactivate-location-session"
            : "deactivate-location-session",
          queue_session_id: queueSessionId,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.message || "Gagal mengubah status Session MCU.");
      }
      setMessage(json.message || "Status Session MCU diperbarui.");
      await load();
    } catch (err: any) {
      setError(err?.message || "Gagal mengubah status Session MCU.");
    } finally {
      setSaving(false);
    }
  }

  async function clearSelection() {
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const res = await fetch("/api/mcu/session", { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.message || "Gagal mengosongkan pilihan MCU.");
      }
      setActiveSession(null);
      setMessage("Pilihan MCU Corporate dikosongkan.");
    } catch (err: any) {
      setError(err?.message || "Gagal mengosongkan pilihan MCU.");
    } finally {
      setSaving(false);
    }
  }

  const selectedPackage = packages.find(
    (pkg) => String(pkg.id) === String(packageId),
  );

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <div className="text-2xl font-black text-slate-900">
          Session MCU Corporate
        </div>
        <div className="mt-1 text-sm text-slate-500">
          Satu perusahaan dan paket dapat memiliki beberapa lokasi serta tanggal MCU yang berbeda.
        </div>
      </section>

      {activeSession ? (
        <section className="card border border-emerald-200 bg-emerald-50/70 p-5">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
            Pilihan Perusahaan / Paket Aktif
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <div className="text-xs font-bold text-slate-500">
                Perusahaan
              </div>
              <div className="mt-1 text-lg font-black text-slate-900">
                {activeSession.company_name}
              </div>
            </div>
            <div>
              <div className="text-xs font-bold text-slate-500">
                Paket Pemeriksaan
              </div>
              <div className="mt-1 text-lg font-black text-slate-900">
                {activeSession.package_name}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <form onSubmit={activateSelection} className="card space-y-4 p-5">
        <div>
          <div className="text-lg font-black text-slate-900">
            1. Pilih Perusahaan & Paket
          </div>
          <div className="mt-1 text-sm text-slate-500">
            Paket tetap memakai setup MCU Corporate existing. Lokasi dan tanggal ditambahkan di bagian Jadwal / Lokasi MCU di bawah.
          </div>
          <div className="mt-2 text-xs font-semibold text-slate-400">
            Terdeteksi {diagnostics.corporate_company_count || 0} perusahaan MCU Corporate.
          </div>
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
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
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
                <option key={pkg.id} value={pkg.id}>
                  {pkg.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedPackage?.description ? (
          <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
            {selectedPackage.description}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className="btn-primary"
            disabled={loading || saving || !companyId || !packageId}
          >
            {saving ? "Menyimpan..." : "Simpan Pilihan"}
          </button>

          {activeSession ? (
            <button
              type="button"
              onClick={clearSelection}
              disabled={saving}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700"
            >
              Kosongkan Pilihan
            </button>
          ) : null}
        </div>
      </form>

      <section className="card p-5">
        <div>
          <div className="text-lg font-black text-slate-900">
            2. Jadwal / Lokasi MCU
          </div>
          <div className="mt-1 text-sm text-slate-500">
            Tambahkan beberapa lokasi atau tanggal untuk perusahaan dan paket yang sama. Masing-masing menjadi Session Antrian yang terpisah.
          </div>
        </div>

        <form onSubmit={addLocationSession} className="mt-5 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="label">Lokasi MCU</label>
              <input
                className="input"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Contoh: Kampus Anggrek"
                disabled={!companyId || !packageId || saving}
              />
            </div>
            <div>
              <label className="label">Tanggal MCU</label>
              <input
                type="date"
                className="input"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                disabled={!companyId || !packageId || saving}
              />
            </div>
            <div>
              <label className="label">Nama Session (opsional)</label>
              <input
                className="input"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="Otomatis jika dikosongkan"
                disabled={!companyId || !packageId || saving}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Nama Antrian A</label>
              <input
                className="input"
                value={trackAName}
                maxLength={80}
                onChange={(e) => setTrackAName(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Nama Antrian B</label>
              <input
                className="input"
                value={trackBName}
                maxLength={80}
                onChange={(e) => setTrackBName(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={
              saving ||
              !companyId ||
              !packageId ||
              !location.trim() ||
              !sessionDate
            }
          >
            + Tambah Session Lokasi
          </button>
        </form>

        <div className="mt-6">
          <div className="text-sm font-black text-slate-900">
            Session untuk pilihan ini · {visibleSessions.length}
          </div>

          {!visibleSessions.length ? (
            <div className="mt-3 rounded-xl border border-dashed p-4 text-sm font-semibold text-slate-500">
              Belum ada Session lokasi/tanggal untuk perusahaan dan paket ini.
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-2xl border">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="p-3">Tanggal</th>
                    <th className="p-3">Lokasi</th>
                    <th className="p-3">Nama Session</th>
                    <th className="p-3">Antrian A</th>
                    <th className="p-3">Antrian B</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleSessions.map((row) => {
                    const active = Number(row.is_active || 0) === 1;
                    return (
                      <tr key={row.id} className="border-t">
                        <td className="p-3 font-bold">
                          {dateLabel(row.session_date)}
                        </td>
                        <td className="p-3 font-black">
                          {row.location || "Legacy / belum diatur"}
                        </td>
                        <td className="p-3">
                          {row.session_name || "-"}
                        </td>
                        <td className="p-3">{row.track_a_name || "Lab Darah"}</td>
                        <td className="p-3">{row.track_b_name || "Rontgen"}</td>
                        <td className="p-3">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-black ${
                              active
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {active ? "Aktif" : "Nonaktif"}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-2">
                            {active ? (
                              <a
                                href={`/mcu/queue?session_id=${row.id}`}
                                className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700"
                              >
                                Buka Antrian
                              </a>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => setSessionActive(row.id, !active)}
                              disabled={saving}
                              className="rounded-lg border bg-white px-3 py-2 text-xs font-black text-slate-700"
                            >
                              {active ? "Nonaktifkan" : "Aktifkan Lagi"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {error ? (
        <div className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
          {message}
        </div>
      ) : null}

      <section className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
        Session ini khusus <b>MCU Corporate</b>. Vaccination, CAPASKA, WELLNESS, AI-MCU PDF,
        Registrasi Ulang, serta layout sticker/print tidak diubah pada Stage 1 ini.
      </section>
    </div>
  );
}
