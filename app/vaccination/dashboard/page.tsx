"use client";

import { useEffect, useMemo, useState } from "react";

const STATUS_OPTIONS = [
  { value: "all", label: "Semua" },
  { value: "done", label: "Sudah" },
  { value: "not_done", label: "Belum" },
  { value: "no_queue", label: "Belum Rilis Antrian" },
  { value: "waiting", label: "Sudah Antrian Belum Selesai" },
];

function fmtDate(value: any) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" });
}

export default function VaccinationDashboardPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [summary, setSummary] = useState<any>({ total: 0, done: 0, not_done: 0, no_queue: 0, waiting: 0 });
  const [rows, setRows] = useState<any[]>([]);
  const [message, setMessage] = useState("Dashboard vaksinasi: filter sudah/belum dan export masing-masing.");
  const [error, setError] = useState("");

  async function loadBase() {
    const [sessionsJson, sourcesJson] = await Promise.all([
      fetch("/api/vaccination/sessions", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/sources?program=vaccination", { cache: "no-store" }).then((r) => r.json()),
    ]);

    if (sessionsJson.ok) setSessions(sessionsJson.sessions || []);
    if (sourcesJson.ok) setSources(sourcesJson.sources || []);
  }

  async function loadDashboard(nextStatus = status) {
    setError("");

    const params = new URLSearchParams();
    params.set("status", nextStatus);
    if (sessionId) params.set("session_id", sessionId);
    if (sourceId) params.set("source_id", sourceId);

    const json = await fetch(`/api/vaccination/dashboard?${params.toString()}`, { cache: "no-store" }).then((r) => r.json());

    if (!json.ok) {
      setError(json.message || "Gagal mengambil dashboard vaksinasi.");
      return;
    }

    setSummary(json.summary || {});
    setRows(json.rows || []);
  }

  function exportCsv(exportStatus = status) {
    const params = new URLSearchParams();
    params.set("status", exportStatus);
    params.set("format", "csv");
    if (sessionId) params.set("session_id", sessionId);
    if (sourceId) params.set("source_id", sourceId);

    window.open(`/api/vaccination/dashboard?${params.toString()}`, "_blank");
  }

  useEffect(() => {
    loadBase();
  }, []);

  useEffect(() => {
    loadDashboard(status);
  }, [sessionId, sourceId, status]);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return rows;

    return rows.filter((row) => {
      const haystack = [
        row.queue_number,
        row.participant_name,
        row.mcu_id,
        row.employee_id,
        row.company_name,
        row.department,
        row.dashboard_status,
        row.vaccine_names,
        row.lot_numbers,
        row.administered_by,
      ].filter(Boolean).join(" ").toLowerCase();

      return haystack.includes(keyword);
    });
  }, [rows, search]);

  return (
    <main className="p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Dashboard Vaksinasi</h1>
            <p className="mt-2 text-sm text-slate-600">
              Monitor peserta sudah/belum vaksin, nomor antrian, dokter/petugas, dan export data per filter.
            </p>
          </div>
          <a href="/vaccination" className="rounded-xl border px-4 py-2 text-sm font-bold hover:bg-slate-50">☰ Menu Vaksinasi</a>
        </div>

        {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
        {message ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</div> : null}

        <section className="mt-6 rounded-2xl border bg-slate-50 p-5">
          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_220px_1fr_auto]">
            <select className="rounded-xl border px-3 py-2.5" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
              <option value="">Semua session</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.session_name} · {session.company_name || "-"}
                </option>
              ))}
            </select>

            <select className="rounded-xl border px-3 py-2.5" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              <option value="">Semua database corporate/vaksinasi</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                  {source.institution_name ? ` · ${source.institution_name}` : ""}
                </option>
              ))}
            </select>

            <select className="rounded-xl border px-3 py-2.5" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>

            <input
              className="rounded-xl border px-3 py-2.5"
              placeholder="Cari nama, antrian, vaksin, dokter..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <button onClick={() => loadDashboard(status)} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700">
              Refresh
            </button>
          </div>
        </section>

        <section className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <button onClick={() => setStatus("all")} className={`rounded-2xl border p-4 text-left ${status === "all" ? "bg-blue-600 text-white" : "bg-white"}`}>
            <div className="text-xs font-black uppercase opacity-70">Total</div>
            <div className="text-3xl font-black">{summary.total || 0}</div>
          </button>
          <button onClick={() => setStatus("done")} className={`rounded-2xl border p-4 text-left ${status === "done" ? "bg-emerald-600 text-white" : "bg-white"}`}>
            <div className="text-xs font-black uppercase opacity-70">Sudah</div>
            <div className="text-3xl font-black">{summary.done || 0}</div>
          </button>
          <button onClick={() => setStatus("not_done")} className={`rounded-2xl border p-4 text-left ${status === "not_done" ? "bg-amber-500 text-white" : "bg-white"}`}>
            <div className="text-xs font-black uppercase opacity-70">Belum</div>
            <div className="text-3xl font-black">{summary.not_done || 0}</div>
          </button>
          <button onClick={() => setStatus("no_queue")} className={`rounded-2xl border p-4 text-left ${status === "no_queue" ? "bg-slate-700 text-white" : "bg-white"}`}>
            <div className="text-xs font-black uppercase opacity-70">Belum Antrian</div>
            <div className="text-3xl font-black">{summary.no_queue || 0}</div>
          </button>
          <button onClick={() => setStatus("waiting")} className={`rounded-2xl border p-4 text-left ${status === "waiting" ? "bg-indigo-600 text-white" : "bg-white"}`}>
            <div className="text-xs font-black uppercase opacity-70">Antri Belum Selesai</div>
            <div className="text-3xl font-black">{summary.waiting || 0}</div>
          </button>
        </section>

        <section className="mt-6 rounded-2xl border bg-white">
          <div className="flex flex-col gap-3 border-b bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-bold">Data Peserta · {filteredRows.length} baris</h2>
              <p className="text-sm text-slate-500">Export mengikuti filter session/database/status yang aktif.</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button onClick={() => exportCsv("all")} className="rounded-xl border bg-white px-3 py-2 text-sm font-bold">Export Semua</button>
              <button onClick={() => exportCsv("done")} className="rounded-xl border bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">Export Sudah</button>
              <button onClick={() => exportCsv("not_done")} className="rounded-xl border bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700">Export Belum</button>
              <button onClick={() => exportCsv(status)} className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white">Export Filter Aktif</button>
            </div>
          </div>

          <div className="max-h-[620px] overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-100 text-xs uppercase text-slate-600">
                <tr>
                  <th className="p-3 text-left">Antrian</th>
                  <th className="p-3 text-left">Nama</th>
                  <th className="p-3 text-left">MCU ID</th>
                  <th className="p-3 text-left">Perusahaan</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-left">Vaksin</th>
                  <th className="p-3 text-left">Dokter/Petugas</th>
                  <th className="p-3 text-left">Waktu</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td className="p-3 font-black">{row.queue_number || "-"}</td>
                    <td className="p-3 font-bold">{row.participant_name}</td>
                    <td className="p-3">{row.mcu_id || row.employee_id || "-"}</td>
                    <td className="p-3">{row.company_name || row.session?.company_name || "-"}</td>
                    <td className="p-3">{row.dashboard_status}</td>
                    <td className="p-3">{row.vaccine_names || "-"}</td>
                    <td className="p-3">{row.administered_by || "-"}</td>
                    <td className="p-3">{fmtDate(row.administered_at)}</td>
                  </tr>
                ))}

                {!filteredRows.length ? (
                  <tr>
                    <td colSpan={8} className="p-5 text-center text-slate-500">Tidak ada data untuk filter ini.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
