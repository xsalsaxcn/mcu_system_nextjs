"use client";

// V153_25_ISERVE_BENEFIT_COMBINATION_EXPORT_SAFE

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

function sameBenefitKeys(left: string[], right: string[]) {
  const a = Array.from(new Set(left)).sort();
  const b = Array.from(new Set(right)).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export default function VaccinationDashboardPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [exportDateFrom, setExportDateFrom] = useState("");
  const [exportDateTo, setExportDateTo] = useState("");
  const [summary, setSummary] = useState<any>({ total: 0, done: 0, not_done: 0, no_queue: 0, waiting: 0 });
  const [rows, setRows] = useState<any[]>([]);
  const [iserveProducts, setIserveProducts] = useState<any[]>([]);
  const [iserveCombinations, setIserveCombinations] = useState<any[]>([]);
  const [selectedBenefitKeys, setSelectedBenefitKeys] = useState<string[]>([]);
  const [iserveMetaLoading, setIserveMetaLoading] = useState(false);
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

  async function loadIserveMeta() {
    if (exportDateFrom && exportDateTo && exportDateFrom > exportDateTo) {
      setIserveProducts([]);
      setIserveCombinations([]);
      return;
    }

    setIserveMetaLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("status", "done");
      params.set("format", "iserve_meta");
      if (sessionId) params.set("session_id", sessionId);
      if (sourceId) params.set("source_id", sourceId);
      if (exportDateFrom) params.set("date_from", exportDateFrom);
      if (exportDateTo) params.set("date_to", exportDateTo);

      const json = await fetch(`/api/vaccination/dashboard?${params.toString()}`, {
        cache: "no-store",
      }).then((r) => r.json());

      if (!json.ok) {
        setIserveProducts([]);
        setIserveCombinations([]);
        setError(json.message || "Gagal membaca kombinasi benefit iServe.");
        return;
      }

      const products = json.products || [];
      const combinations = json.combinations || [];
      setIserveProducts(products);
      setIserveCombinations(combinations);

      const validKeys = new Set(products.map((item: any) => String(item.key || "")).filter(Boolean));
      setSelectedBenefitKeys((current) => current.filter((key) => validKeys.has(key)));
    } catch (err: any) {
      setIserveProducts([]);
      setIserveCombinations([]);
      setError(err?.message || "Gagal membaca kombinasi benefit iServe.");
    } finally {
      setIserveMetaLoading(false);
    }
  }

  function buildExportParams(exportStatus: string, format: "csv" | "iserve" | "iserve_meta") {
    if (exportDateFrom && exportDateTo && exportDateFrom > exportDateTo) {
      setError("Rentang tanggal export tidak valid: tanggal awal lebih besar dari tanggal akhir.");
      return null;
    }

    setError("");
    const params = new URLSearchParams();
    params.set("status", exportStatus);
    params.set("format", format);
    if (sessionId) params.set("session_id", sessionId);
    if (sourceId) params.set("source_id", sourceId);
    if (exportDateFrom) params.set("date_from", exportDateFrom);
    if (exportDateTo) params.set("date_to", exportDateTo);
    return params;
  }

  function exportCsv(exportStatus = status) {
    const params = buildExportParams(exportStatus, "csv");
    if (!params) return;
    window.open(`/api/vaccination/dashboard?${params.toString()}`, "_blank");
  }

  function exportIserve() {
    if (!selectedBenefitKeys.length) {
      setError("Pilih minimal 1 benefit iServe atau klik salah satu kombinasi yang terdeteksi.");
      return;
    }

    const selectedCombination = iserveCombinations.find((combo: any) =>
      sameBenefitKeys(combo.benefit_keys || [], selectedBenefitKeys)
    );

    if (!selectedCombination) {
      setError("Kombinasi benefit yang dipilih tidak ditemukan pada filter/session/rentang tanggal ini.");
      return;
    }

    const params = buildExportParams("done", "iserve");
    if (!params) return;
    selectedBenefitKeys.forEach((key) => params.append("benefit", key));
    window.open(`/api/vaccination/dashboard?${params.toString()}`, "_blank");
  }

  useEffect(() => {
    loadBase();
  }, []);

  useEffect(() => {
    loadDashboard(status);
  }, [sessionId, sourceId, status]);

  useEffect(() => {
    loadIserveMeta();
  }, [sessionId, sourceId, exportDateFrom, exportDateTo]);

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

  const selectedIserveCombination = useMemo(() => {
    if (!selectedBenefitKeys.length) return null;
    return iserveCombinations.find((combo: any) =>
      sameBenefitKeys(combo.benefit_keys || [], selectedBenefitKeys)
    ) || null;
  }, [iserveCombinations, selectedBenefitKeys]);

  function toggleBenefit(key: string) {
    setSelectedBenefitKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    );
  }

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
              <p className="text-sm text-slate-500">Export mengikuti filter session/database/status aktif. Rentang tanggal hanya diterapkan saat export.</p>
            </div>

            <div className="flex flex-col gap-2 lg:items-end">
              <div className="flex flex-wrap items-end gap-2">
                <label className="grid gap-1 text-xs font-bold text-slate-600">
                  Dari tanggal
                  <input
                    type="date"
                    value={exportDateFrom}
                    onChange={(e) => setExportDateFrom(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
                  />
                </label>
                <label className="grid gap-1 text-xs font-bold text-slate-600">
                  Sampai tanggal
                  <input
                    type="date"
                    value={exportDateTo}
                    onChange={(e) => setExportDateTo(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setExportDateFrom("");
                    setExportDateTo("");
                  }}
                  className="rounded-xl border bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100"
                >
                  Reset Tanggal
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <button onClick={() => exportCsv("all")} className="rounded-xl border bg-white px-3 py-2 text-sm font-bold">Export Semua</button>
                <button onClick={() => exportCsv("done")} className="rounded-xl border bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">Export Sudah</button>
                <button onClick={() => exportCsv("not_done")} className="rounded-xl border bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700">Export Belum</button>
                <button onClick={() => exportCsv(status)} className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white">Export Filter Aktif</button>
                <button
                  onClick={exportIserve}
                  disabled={!selectedIserveCombination}
                  className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-black text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Export XLSX iServe per kombinasi benefit yang dipilih"
                >
                  {selectedIserveCombination
                    ? `Export iServe · ${selectedIserveCombination.participant_count} peserta`
                    : "Export untuk iServe"}
                </button>
              </div>
            </div>
          </div>

          <div className="border-b bg-violet-50/40 p-4">
            <div className="rounded-2xl border border-violet-200 bg-white p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="font-black text-violet-900">Export iServe per Layanan / Benefit</h3>
                  <p className="mt-1 text-xs text-slate-600">
                    Satu peserta dapat memiliki lebih dari 1 benefit. Pilih beberapa produk atau klik kombinasi yang sudah terdeteksi.
                    Export membuat 1 row per peserta; Product, Lot, Dose, dan Quantity ditulis per layanan dalam baris yang sejajar.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedBenefitKeys([])}
                  className="rounded-lg border bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Reset Benefit
                </button>
              </div>

              <div className="mt-4">
                <div className="text-xs font-black uppercase tracking-wide text-slate-500">Pilih Produk / Benefit</div>
                {iserveMetaLoading ? (
                  <div className="mt-2 text-sm text-slate-500">Membaca benefit dan kombinasi...</div>
                ) : iserveProducts.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {iserveProducts.map((product: any) => (
                      <label
                        key={product.key}
                        className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${
                          selectedBenefitKeys.includes(product.key)
                            ? "border-violet-400 bg-violet-100 text-violet-900"
                            : "bg-white text-slate-700"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedBenefitKeys.includes(product.key)}
                          onChange={() => toggleBenefit(product.key)}
                        />
                        <span>{product.label}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-600">
                          {product.participant_count}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-slate-500">Belum ada layanan vaksin selesai pada filter/rentang tanggal ini.</div>
                )}
              </div>

              <div className="mt-4">
                <div className="text-xs font-black uppercase tracking-wide text-slate-500">Kombinasi Benefit yang Terdeteksi</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {iserveCombinations.map((combo: any) => {
                    const active = sameBenefitKeys(combo.benefit_keys || [], selectedBenefitKeys);
                    return (
                      <button
                        type="button"
                        key={combo.key}
                        onClick={() => setSelectedBenefitKeys(combo.benefit_keys || [])}
                        className={`rounded-xl border px-3 py-2 text-left text-xs font-bold ${
                          active
                            ? "border-violet-500 bg-violet-600 text-white"
                            : combo.benefit_count > 1
                              ? "border-violet-200 bg-violet-50 text-violet-800"
                              : "bg-white text-slate-700"
                        }`}
                        title={(combo.participant_names || []).join(", ")}
                      >
                        <span>{combo.label}</span>
                        <span className={`ml-2 rounded-full px-2 py-0.5 ${
                          active ? "bg-white/20" : "bg-slate-100 text-slate-600"
                        }`}>
                          {combo.participant_count} peserta
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedBenefitKeys.length ? (
                <div className={`mt-4 rounded-xl border p-3 text-sm ${
                  selectedIserveCombination
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-amber-200 bg-amber-50 text-amber-800"
                }`}>
                  {selectedIserveCombination ? (
                    <>
                      <div className="font-black">
                        Siap export: {selectedIserveCombination.label} · {selectedIserveCombination.participant_count} peserta
                      </div>
                      {selectedIserveCombination.participant_names?.length ? (
                        <div className="mt-1 text-xs">
                          {selectedIserveCombination.participant_names.join(", ")}
                          {selectedIserveCombination.participant_count > selectedIserveCombination.participant_names.length
                            ? ` +${selectedIserveCombination.participant_count - selectedIserveCombination.participant_names.length} lainnya`
                            : ""}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="font-bold">
                      Kombinasi checkbox ini tidak ada pada data saat ini. Pilih salah satu kombinasi yang terdeteksi.
                    </div>
                  )}
                </div>
              ) : null}
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
