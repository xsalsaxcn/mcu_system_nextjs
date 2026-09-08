"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type ViewMode = "rekap" | "laporan";

// VACCINATION_MEDIS_MIRROR_REPORT_PANEL_V150_4

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultStart() {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return isoDate(date);
}

function formatDate(value: any) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function VaccinationMedisReportPanel({ mode }: { mode: ViewMode }) {
  const [startDate, setStartDate] = useState(defaultStart());
  const [endDate, setEndDate] = useState(isoDate(new Date()));
  const [search, setSearch] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [medis, setMedis] = useState("all");
  const [data, setData] = useState<any>({
    summary: {},
    participants: [],
    rows: [],
    byProduct: [],
    bySession: [],
    sessionOptions: [],
    doctorOptions: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const params = useMemo(() => {
    const query = new URLSearchParams();
    if (startDate) query.set("start_date", startDate);
    if (endDate) query.set("end_date", endDate);
    if (search.trim()) query.set("q", search.trim());
    if (sessionId) query.set("session_id", sessionId);
    if (medis && medis !== "all") query.set("medis", medis);
    return query;
  }, [startDate, endDate, search, sessionId, medis]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/vaccination/medis/report?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) {
        throw new Error(json.message || "Gagal mengambil mirror data vaksinasi untuk Medis.");
      }
      setData(json);
    } catch (err: any) {
      setError(err?.message || "Gagal mengambil mirror data vaksinasi untuk Medis.");
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    load();
  }, [load]);

  const exportUrl = `/api/vaccination/medis/report?${params.toString()}&format=csv`;

  return (
    <main className="space-y-5">
      <section className="rounded-3xl bg-gradient-to-r from-blue-950 via-blue-800 to-emerald-600 p-6 text-white shadow-sm">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-100">
            Vaccination Medis
          </div>
          <h1 className="mt-1 text-3xl font-black">
            {mode === "rekap" ? "Rekap Peserta Medis" : "Laporan Medis"}
          </h1>
          <p className="mt-2 text-sm font-semibold text-blue-100">
            Mirror read-only dari modul vaksinasi. Halaman ini hanya dapat dikonsumsi role Vaccination Medis.
          </p>
        </div>
      </section>

      <section className="rounded-3xl border bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="text-xs font-black text-slate-600">
            Tanggal Mulai
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-black text-slate-600">
            Tanggal Akhir
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-black text-slate-600">
            Session
            <select
              value={sessionId}
              onChange={(event) => setSessionId(event.target.value)}
              className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"
            >
              <option value="">Semua session</option>
              {(data.sessionOptions || []).map((item: any) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-black text-slate-600">
            Dokter / Petugas
            <select
              value={medis}
              onChange={(event) => setMedis(event.target.value)}
              className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"
            >
              <option value="all">Semua Medis</option>
              {(data.doctorOptions || []).map((name: string) => (
                <option key={name} value={name.toLowerCase()}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-black text-slate-600">
            Cari
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Peserta / perusahaan / vaksin / lot / session"
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
          >
            {loading ? "Memuat..." : "Terapkan"}
          </button>
          <a
            href={exportUrl}
            className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white"
          >
            Export CSV Medis
          </a>
        </div>

        <div className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800">
          Source: {data.source || "vaccination_records + completed registration fallback"}
        </div>
        {error ? (
          <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {error}
          </div>
        ) : null}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["PESERTA", data.summary?.participants || 0],
          ["TINDAKAN / PRODUK", data.summary?.administrations || 0],
          ["PERUSAHAAN", data.summary?.companies || 0],
          ["PRODUK VAKSIN", data.summary?.products || 0],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-3xl border bg-white p-5 shadow-sm">
            <div className="text-[11px] font-black text-slate-500">{label}</div>
            <div className="mt-2 text-3xl font-black text-slate-950">{value}</div>
          </div>
        ))}
      </section>

      {mode === "rekap" ? (
        <section className="overflow-hidden rounded-3xl border bg-white shadow-sm">
          <div className="border-b px-5 py-4">
            <h2 className="text-lg font-black text-slate-900">Peserta yang Ditangani Tim Medis</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Satu peserta satu baris. Data mengikuti vaccination_records dan fallback completed registration.
            </p>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-100 text-[11px] uppercase text-slate-600">
                <tr>
                  <th className="p-3">Tanggal</th>
                  <th className="p-3">Peserta</th>
                  <th className="p-3">Perusahaan</th>
                  <th className="p-3">Session / Lokasi</th>
                  <th className="p-3">Vaksin</th>
                  <th className="p-3">Lot</th>
                  <th className="p-3">Medis</th>
                  <th className="p-3 text-right">Produk</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(data.participants || []).map((row: any) => (
                  <tr key={String(row.registration_id || `${row.participant_name}-${row.last_administered_at}`)}>
                    <td className="whitespace-nowrap p-3">{formatDate(row.last_administered_at)}</td>
                    <td className="p-3">
                      <div className="font-black text-slate-900">{row.participant_name}</div>
                      <div className="text-slate-500">{row.queue_number} · {row.mcu_id}</div>
                    </td>
                    <td className="p-3">
                      {row.company_name}
                      <div className="text-slate-500">{row.department}</div>
                    </td>
                    <td className="p-3">
                      {row.session_name}
                      <div className="text-slate-500">{row.location}</div>
                    </td>
                    <td className="p-3 font-bold">{(row.vaccines || []).join(", ") || "-"}</td>
                    <td className="p-3">{(row.lots || []).join(", ") || "-"}</td>
                    <td className="p-3">{(row.medis || []).join(", ") || "-"}</td>
                    <td className="p-3 text-right font-black">{row.total_products}</td>
                  </tr>
                ))}
                {!data.participants?.length ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500">
                      Belum ada peserta pada filter ini.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <>
          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <h2 className="font-black text-slate-900">Pemakaian per Produk</h2>
              <div className="mt-4 space-y-2">
                {(data.byProduct || []).map((row: any) => (
                  <div key={row.name} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                    <span className="font-bold text-slate-700">{row.name}</span>
                    <span className="font-black text-slate-950">{row.total}</span>
                  </div>
                ))}
                {!data.byProduct?.length ? <div className="text-sm text-slate-500">Belum ada data.</div> : null}
              </div>
            </div>
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <h2 className="font-black text-slate-900">Tindakan per Session</h2>
              <div className="mt-4 space-y-2">
                {(data.bySession || []).map((row: any) => (
                  <div key={row.name} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                    <span className="font-bold text-slate-700">{row.name}</span>
                    <span className="font-black text-slate-950">{row.total}</span>
                  </div>
                ))}
                {!data.bySession?.length ? <div className="text-sm text-slate-500">Belum ada data.</div> : null}
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-3xl border bg-white shadow-sm">
            <div className="border-b px-5 py-4">
              <h2 className="text-lg font-black text-slate-900">Detail Tindakan Medis</h2>
            </div>
            <div className="max-h-[560px] overflow-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-100 text-[11px] uppercase text-slate-600">
                  <tr>
                    <th className="p-3">Tanggal</th>
                    <th className="p-3">Peserta</th>
                    <th className="p-3">Perusahaan</th>
                    <th className="p-3">Vaksin</th>
                    <th className="p-3">Lot</th>
                    <th className="p-3">Session</th>
                    <th className="p-3">Medis</th>
                    <th className="p-3">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(data.rows || []).map((row: any) => (
                    <tr key={row.id}>
                      <td className="whitespace-nowrap p-3">{formatDate(row.administered_at)}</td>
                      <td className="p-3 font-bold">{row.participant_name}</td>
                      <td className="p-3">{row.company_name}</td>
                      <td className="p-3">{row.vaccine_name}</td>
                      <td className="p-3">{row.lot_number}</td>
                      <td className="p-3">{row.session_name}</td>
                      <td className="p-3">{row.administered_by}</td>
                      <td className="p-3">{row.data_source}</td>
                    </tr>
                  ))}
                  {!data.rows?.length ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-500">
                        Belum ada tindakan pada filter ini.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
