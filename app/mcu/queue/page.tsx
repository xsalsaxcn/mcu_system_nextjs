"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";

type Track = "A" | "B";

type CompanyOption = {
  id: number;
  name: string;
  package_ids?: number[];
};

type PackageOption = {
  id: number;
  name: string;
  description?: string;
};


type QueueEntry = {
  id: number;
  participant_id: number;
  a_queue_number?: string;
  a_queue_sequence?: number;
  a_status?: string;
  b_queue_number?: string;
  b_queue_sequence?: number;
  b_status?: string;
  participant?: {
    id: number;
    name?: string;
    mcu_id?: string;
    external_id?: string;
    nik?: string;
    employee_nik?: string;
    department?: string;
  } | null;
};

function statusLabel(value: any) {
  const s = String(value || "").toUpperCase();
  if (s === "WAITING") return "Menunggu";
  if (s === "CALLED") return "Dipanggil";
  if (s === "IN_PROGRESS") return "Proses";
  if (s === "DONE") return "Selesai";
  if (s === "SKIPPED") return "Skipped";
  if (s === "CANCELLED") return "Cancel";
  return s || "-";
}

function statusClass(value: any) {
  const s = String(value || "").toUpperCase();
  if (s === "WAITING") return "bg-orange-100 text-orange-700";
  if (["CALLED", "IN_PROGRESS"].includes(s)) return "bg-blue-100 text-blue-700";
  if (s === "DONE") return "bg-emerald-100 text-emerald-700";
  if (s === "SKIPPED") return "bg-amber-100 text-amber-800";
  if (s === "CANCELLED") return "bg-red-100 text-red-700";
  return "bg-slate-100 text-slate-700";
}

function fieldFor(track: Track, field: "status" | "number" | "sequence") {
  const prefix = track === "A" ? "a" : "b";
  if (field === "status") return `${prefix}_status` as keyof QueueEntry;
  if (field === "number") return `${prefix}_queue_number` as keyof QueueEntry;
  return `${prefix}_queue_sequence` as keyof QueueEntry;
}

export default function McuQueuePage() {
  return (
    <AuthGate>
      {() => <McuQueueContent />}
    </AuthGate>
  );
}

// MCU_QUEUE_COMPANY_PACKAGE_SELECTOR_V435
function McuQueueContent() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [packageId, setPackageId] = useState("");
  const [optionsReady, setOptionsReady] = useState(false);

  const filteredPackages = useMemo(() => {
    const company = companies.find((item) => String(item.id) === String(companyId));
    if (!company) return [];
    const allowed = new Set((company.package_ids || []).map((id) => Number(id)));
    return packages.filter((pkg) => allowed.has(Number(pkg.id)));
  }, [companies, packages, companyId]);

  const entries: QueueEntry[] = data?.entries || [];
  const trackAName = String(data?.queue_session?.track_a_name || "Lab Darah");
  const trackBName = String(data?.queue_session?.track_b_name || "Rontgen");

  async function loadOptions() {
    try {
      const res = await fetch("/api/mcu/session", { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || "Gagal memuat daftar perusahaan MCU.");

      const nextCompanies: CompanyOption[] = json.companies || [];
      const nextPackages: PackageOption[] = json.packages || [];
      setCompanies(nextCompanies);
      setPackages(nextPackages);

      const sessionCompanyId = String(json.session?.company_id || "");
      const sessionPackageId = String(json.session?.package_id || "");
      if (sessionCompanyId && sessionPackageId) {
        setCompanyId(sessionCompanyId);
        setPackageId(sessionPackageId);
      } else if (nextCompanies.length) {
        const firstCompany = nextCompanies[0];
        const firstPackageId = String(firstCompany.package_ids?.[0] || "");
        setCompanyId(String(firstCompany.id));
        setPackageId(firstPackageId);
      }
      setOptionsReady(true);
    } catch (err: any) {
      setError(err?.message || "Gagal memuat daftar perusahaan MCU.");
      setOptionsReady(true);
      setLoading(false);
    }
  }

  async function load(silent = false, overrideCompanyId?: string, overridePackageId?: string) {
    const cid = String((overrideCompanyId ?? companyId) || "");
    const pid = String((overridePackageId ?? packageId) || "");
    if (!cid || !pid) {
      setData(null);
      if (!silent) setLoading(false);
      return;
    }

    if (!silent) setLoading(true);
    try {
      const query = new URLSearchParams({ company_id: cid, package_id: pid });
      const res = await fetch(`/api/mcu/queue?${query.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || "Gagal memuat Antrian MCU.");
      setData(json);
      setError("");
    } catch (err: any) {
      setData(null);
      setError(err?.message || "Gagal memuat Antrian MCU.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    loadOptions();
  }, []);

  useEffect(() => {
    if (!optionsReady || !companyId || !packageId) return;
    load(false, companyId, packageId);
    const timer = window.setInterval(() => load(true, companyId, packageId), 5000);
    return () => window.clearInterval(timer);
  }, [optionsReady, companyId, packageId]);

  function speakCall(track: Track, entry: any) {
    if (!voiceEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const number = String(track === "A" ? entry?.a_queue_number : entry?.b_queue_number || "");
    const label = track === "A" ? trackAName : trackBName;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(`Nomor antrean ${number}. ${label}. Silakan menuju ${label}.`);
      utterance.lang = "id-ID";
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    } catch {
      // Voice tidak boleh mengganggu alur queue.
    }
  }

  async function action(actionName: string, track?: Track, entryId?: number) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/mcu/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionName, track, entry_id: entryId, company_id: Number(companyId), package_id: Number(packageId) }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || "Gagal memperbarui antrian.");
      setMessage(json.message || "Antrian diperbarui.");
      if ((actionName === "call-next" || actionName === "recall") && json.entry && track) {
        speakCall(track, json.entry);
      }
      await load(true, companyId, packageId);
    } catch (err: any) {
      setError(err?.message || "Gagal memperbarui antrian.");
    } finally {
      setBusy(false);
    }
  }

  function rowsForTrack(track: Track) {
    const statusKey = fieldFor(track, "status");
    const seqKey = fieldFor(track, "sequence");
    return [...entries]
      .filter((row) => String(row[statusKey] || "").toUpperCase() !== "CANCELLED")
      .sort((a, b) => Number(a[seqKey] || 999999) - Number(b[seqKey] || 999999));
  }

  function stats(track: Track) {
    const statusKey = fieldFor(track, "status");
    const rows = rowsForTrack(track);
    return {
      waiting: rows.filter((r) => String(r[statusKey] || "").toUpperCase() === "WAITING").length,
      active: rows.filter((r) => ["CALLED", "IN_PROGRESS"].includes(String(r[statusKey] || "").toUpperCase())).length,
      skipped: rows.filter((r) => String(r[statusKey] || "").toUpperCase() === "SKIPPED").length,
      done: rows.filter((r) => String(r[statusKey] || "").toUpperCase() === "DONE").length,
    };
  }

  function current(track: Track) {
    const statusKey = fieldFor(track, "status");
    return rowsForTrack(track).find((r) => ["CALLED", "IN_PROGRESS"].includes(String(r[statusKey] || "").toUpperCase())) || null;
  }

  function nextWaiting(track: Track) {
    const statusKey = fieldFor(track, "status");
    return rowsForTrack(track).find((r) => String(r[statusKey] || "").toUpperCase() === "WAITING") || null;
  }

  function TrackPanel({ track, label, accent }: { track: Track; label: string; accent: "blue" | "violet" }) {
    const statusKey = fieldFor(track, "status");
    const numberKey = fieldFor(track, "number");
    const rows = rowsForTrack(track);
    const activeRows = rows.filter((r) => !["SKIPPED", "DONE", "CANCELLED"].includes(String(r[statusKey] || "").toUpperCase()));
    const skippedRows = rows.filter((r) => String(r[statusKey] || "").toUpperCase() === "SKIPPED");
    const summary = stats(track);
    const currentRow = current(track);
    const nextRow = nextWaiting(track);
    const buttonClass = accent === "blue" ? "bg-blue-600 hover:bg-blue-700" : "bg-violet-600 hover:bg-violet-700";
    const numberClass = accent === "blue" ? "text-blue-700" : "text-violet-700";

    return (
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className={`text-lg font-black ${numberClass}`}>{track} · {label}</div>
            <div className="text-xs font-semibold text-slate-500">Antrian berjalan independen.</div>
          </div>
          <button disabled={busy} onClick={() => action("call-next", track)} className={`rounded-xl px-4 py-2 text-sm font-black text-white disabled:opacity-50 ${buttonClass}`}>
            Panggil Berikutnya {track}
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border bg-slate-50 p-3"><div className="text-xs font-bold text-slate-500">Dipanggil</div><div className={`mt-1 text-3xl font-black ${numberClass}`}>{currentRow ? String(currentRow[numberKey] || "-") : "-"}</div><div className="truncate text-xs font-bold text-slate-700">{currentRow?.participant?.name || "-"}</div></div>
          <div className="rounded-xl border bg-slate-50 p-3"><div className="text-xs font-bold text-slate-500">Berikutnya</div><div className="mt-1 text-3xl font-black text-slate-900">{nextRow ? String(nextRow[numberKey] || "-") : "-"}</div><div className="truncate text-xs font-bold text-slate-700">{nextRow?.participant?.name || "-"}</div></div>
          <div className="rounded-xl border bg-slate-50 p-3"><div className="text-xs font-bold text-slate-500">Menunggu</div><div className="mt-1 text-3xl font-black text-red-700">{summary.waiting}</div></div>
          <div className="rounded-xl border bg-emerald-50 p-3"><div className="text-xs font-bold text-emerald-700">Selesai</div><div className="mt-1 text-3xl font-black text-emerald-700">{summary.done}</div></div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3 text-left">No</th><th className="p-3 text-left">Nama</th><th className="p-3 text-left">Status</th><th className="p-3 text-left">Aksi</th></tr></thead>
            <tbody className="divide-y">
              {activeRows.length ? activeRows.map((row) => {
                const status = String(row[statusKey] || "").toUpperCase();
                return (
                  <tr key={`${track}-${row.id}`}>
                    <td className={`p-3 text-xl font-black ${numberClass}`}>{String(row[numberKey] || "-")}</td>
                    <td className="p-3"><div className="font-black text-slate-900">{row.participant?.name || "-"}</div><div className="text-xs text-slate-500">{row.participant?.mcu_id || row.participant?.external_id || "-"}</div></td>
                    <td className="p-3"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${statusClass(status)}`}>{statusLabel(status)}</span></td>
                    <td className="p-3"><div className="flex flex-wrap gap-1.5">
                      <button disabled={busy} onClick={() => action("recall", track, row.id)} className="rounded-lg border px-2.5 py-1 text-xs font-bold">Call</button>
                      <button disabled={busy} onClick={() => action("start", track, row.id)} className="rounded-lg border px-2.5 py-1 text-xs font-bold">Start</button>
                      <button disabled={busy} onClick={() => action("finish", track, row.id)} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Done</button>
                      <button disabled={busy} onClick={() => action("skip", track, row.id)} className="rounded-lg border px-2.5 py-1 text-xs font-bold">Skip</button>
                      <button disabled={busy} onClick={() => action("cancel", track, row.id)} className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">Cancel</button>
                    </div></td>
                  </tr>
                );
              }) : <tr><td colSpan={4} className="p-6 text-center text-sm font-semibold text-slate-500">Belum ada peserta pada antrian ini.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center justify-between"><div className="text-sm font-black text-amber-900">Skipped {track}</div><div className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-black text-amber-900">{skippedRows.length}</div></div>
          {skippedRows.length ? <div className="mt-2 space-y-2">{skippedRows.map((row) => <div key={`skip-${track}-${row.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-2"><div className="text-sm font-bold text-slate-800">{String(row[numberKey] || "-")} · {row.participant?.name || "-"}</div><button disabled={busy} onClick={() => action("reactivate", track, row.id)} className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-black text-white">Aktifkan</button></div>)}</div> : <div className="mt-2 text-xs font-semibold text-amber-700">Belum ada antrian skipped.</div>}
        </div>
      </section>
    );
  }

  if (!optionsReady && loading) return <div className="card p-6 text-sm font-semibold text-slate-500">Memuat Antrian MCU...</div>;

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-2xl font-black text-slate-900">Antrian MCU Corporate</div>
            <div className="mt-1 text-sm text-slate-500">Pilih perusahaan dan paket. Satu Public Queue menampilkan antrian A + B untuk pilihan tersebut.</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-xl bg-blue-100 px-3 py-2 text-xs font-black text-blue-800">A · {trackAName}</span>
              <span className="rounded-xl bg-violet-100 px-3 py-2 text-xs font-black text-violet-800">B · {trackBName}</span>
              <span className={`rounded-xl px-3 py-2 text-xs font-black ${voiceEnabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{voiceEnabled ? "🔊 Voice ON" : "🔇 Voice OFF"}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} onClick={() => action("sync")} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-black text-blue-700 disabled:opacity-50">Sinkronkan Registrasi Ulang</button>
            <button onClick={() => setVoiceEnabled((v) => !v)} className="rounded-xl border bg-white px-4 py-2 text-sm font-black text-slate-700">{voiceEnabled ? "Matikan Suara" : "Aktifkan Suara"}</button>
            {data?.public_url ? <a target="_blank" href={data.public_url} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-blue-700">Public Queue · {data?.company?.name || "Perusahaan"}</a> : null}
          </div>
        </div>

        <div className="mt-5 rounded-2xl border bg-slate-50 p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Perusahaan</label>
              <select
                className="input"
                value={companyId}
                onChange={(e) => {
                  const nextCompanyId = e.target.value;
                  const company = companies.find((item) => String(item.id) === String(nextCompanyId));
                  setCompanyId(nextCompanyId);
                  setPackageId(String(company?.package_ids?.[0] || ""));
                  setData(null);
                  setMessage("");
                  setError("");
                }}
              >
                <option value="">- Pilih Perusahaan -</option>
                {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Paket Pemeriksaan</label>
              <select
                className="input"
                value={packageId}
                disabled={!companyId}
                onChange={(e) => {
                  setPackageId(e.target.value);
                  setData(null);
                  setMessage("");
                  setError("");
                }}
              >
                <option value="">- Pilih Paket -</option>
                {filteredPackages.map((pkg) => <option key={pkg.id} value={pkg.id}>{pkg.name}</option>)}
              </select>
            </div>
          </div>
          {companyId && !filteredPackages.length ? (
            <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">Belum ada paket MCU Corporate yang terhubung ke perusahaan ini.</div>
          ) : null}
          {data?.company?.name && data?.package?.name ? (
            <div className="mt-3 text-xs font-semibold text-slate-500">Antrian yang sedang ditampilkan: <b>{data.company.name}</b> · {data.package.name}</div>
          ) : null}
        </div>

        {error ? <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div> : null}
        {message ? <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{message}</div> : null}
      </section>

      {companyId && packageId && data ? (
        <>
          <div className="grid gap-5 xl:grid-cols-2">
            <TrackPanel track="A" label={trackAName} accent="blue" />
            <TrackPanel track="B" label={trackBName} accent="violet" />
          </div>

          <section className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
            Peserta masuk ke antrian setelah <b>Registrasi Ulang MCU Corporate</b>. Tombol Sinkronkan dipakai untuk peserta yang sudah registrasi sebelum fitur antrian dipasang. Public Queue di atas adalah <b>satu layar gabungan A + B</b> untuk perusahaan dan paket yang sedang dipilih.
          </section>
        </>
      ) : (
        <section className="card p-6 text-center text-sm font-semibold text-slate-500">
          Pilih perusahaan dan paket pemeriksaan untuk menampilkan antrian.
        </section>
      )}
    </div>
  );
}
