"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import StageProgress from "@/components/StageProgress";

const FILTERS = ["Semua", "Belum Selesai", "Selesai", "Lulus", "Tidak Lulus", "Belum Dinilai"];

export default function DashboardPage() {
  return (
    <AuthGate>
      {(user) => <Dashboard user={user} />}
    </AuthGate>
  );
}

function StatCard({
  label,
  value,
  hint,
  active,
  onClick
}: {
  label: string;
  value: any;
  hint?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-3xl border p-5 text-left shadow-sm transition ${
        active
          ? "border-blue-400 bg-blue-600 text-white"
          : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50"
      }`}
    >
      <div className={`text-xs font-black uppercase tracking-wide ${active ? "text-blue-100" : "text-slate-500"}`}>
        {label}
      </div>
      <div className="mt-2 text-3xl font-black">{value}</div>
      {hint && <div className={`mt-1 text-xs font-semibold ${active ? "text-blue-100" : "text-slate-500"}`}>{hint}</div>}
    </button>
  );
}

function StatusBadge({ value }: { value: string }) {
  const className =
    value === "Lulus"
      ? "bg-emerald-100 text-emerald-700"
      : value === "Tidak Lulus"
        ? "bg-red-100 text-red-700"
        : value === "Selesai"
          ? "bg-blue-100 text-blue-700"
          : "bg-slate-100 text-slate-600";

  return <span className={`rounded-full px-2.5 py-1 text-xs font-black ${className}`}>{value}</span>;
}

function CompactTable({ title, rows, emptyText }: { title: string; rows: any[]; emptyText: string }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-lg font-black">{title}</div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{rows.length}</div>
      </div>

      {!rows.length ? (
        <div className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">{emptyText}</div>
      ) : (
        <div className="max-h-80 overflow-auto rounded-2xl border border-slate-100">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50">
              <tr>
                <th className="p-3 text-left">Nama</th>
                <th className="p-3 text-left">No. MCU</th>
                <th className="p-3 text-left">Paket</th>
                <th className="p-3 text-left">Score</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row: any) => (
                <tr key={row.participant_id} className="border-t border-slate-100">
                  <td className="p-3 font-bold">{row.name}</td>
                  <td className="p-3">{row.mcu_id || row.external_id || "-"}</td>
                  <td className="p-3">{row.package_name || "-"}</td>
                  <td className="p-3 font-black">{row.total_score ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Dashboard({ user }: { user: any }) {
  const [sources, setSources] = useState<any[]>([]);
  const [sourceId, setSourceId] = useState("all");
  const [status, setStatus] = useState("Semua");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("name_asc");
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [data, setData] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const program = user.program_type === "all" ? "capaska" : user.program_type;

  useEffect(() => {
    fetch(`/api/sources?program=${program}`)
      .then((r) => r.json())
      .then((d) => setSources(d.sources || []));
  }, [program]);

  async function loadDashboard(nextStatus = status) {
    setLoading(true);
    setSelected(null);

    const res = await fetch(
      `/api/dashboard?program=${program}&source_id=${sourceId}&status=${encodeURIComponent(nextStatus)}&limit=500`,
      { cache: "no-store" }
    );

    const json = await res.json();
    setData(json);
    setLoading(false);
  }

  function chooseStatus(nextStatus: string) {
    setStatus(nextStatus);
    loadDashboard(nextStatus);
  }

  function exportExcel(type: "progress" | "full") {
    const params = new URLSearchParams({
      program,
      source_id: sourceId,
      status,
      type
    });

    window.open(`/api/dashboard/export?${params.toString()}`, "_blank");
  }

  const rows = data?.rows || [];

  const rowsToShow = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    let filtered = rows.filter((row: any) => {
      if (!keyword) return true;

      const haystack = [
        row.name,
        row.mcu_id,
        row.external_id,
        row.nik,
        row.employee_nik
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(keyword);
    });

    const scoreValue = (row: any) => {
      const n = Number(row.total_score);
      return Number.isFinite(n) ? n : -999999;
    };

    const progressValue = (row: any) => {
      const n = Number(row.progress_percent);
      return Number.isFinite(n) ? n : 0;
    };

    filtered = [...filtered].sort((a: any, b: any) => {
      if (sortBy === "name_desc") return String(b.name || "").localeCompare(String(a.name || ""));
      if (sortBy === "progress_desc") return progressValue(b) - progressValue(a);
      if (sortBy === "progress_asc") return progressValue(a) - progressValue(b);
      if (sortBy === "score_desc") return scoreValue(b) - scoreValue(a);
      if (sortBy === "score_asc") return scoreValue(a) - scoreValue(b);

      return String(a.name || "").localeCompare(String(b.name || ""));
    });

    return filtered;
  }, [rows, searchTerm, sortBy]);

  useEffect(() => {
    setCurrentPage(1);
  }, [status, searchTerm, sortBy, rowsPerPage, sourceId]);

  const pageCount = useMemo(() => {
    if (rowsPerPage === 0) return 1;
    return Math.max(1, Math.ceil(rowsToShow.length / rowsPerPage));
  }, [rowsToShow.length, rowsPerPage]);

  const effectivePage = Math.min(currentPage, pageCount);

  const pagedRows = useMemo(() => {
    if (rowsPerPage === 0) return rowsToShow;

    const start = (effectivePage - 1) * rowsPerPage;
    return rowsToShow.slice(start, start + rowsPerPage);
  }, [rowsToShow, rowsPerPage, effectivePage]);

  const firstRowNumber = rowsToShow.length ? (rowsPerPage === 0 ? 1 : (effectivePage - 1) * rowsPerPage + 1) : 0;
  const lastRowNumber = rowsPerPage === 0 ? rowsToShow.length : Math.min(effectivePage * rowsPerPage, rowsToShow.length);

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-slate-900 p-6 text-white">
          <div className="text-3xl font-black">Dashboard Progress & Kelulusan</div>
          <div className="mt-2 max-w-3xl text-sm font-medium text-blue-100">
            Supervisor melihat progress stage, data selesai/belum selesai, kelulusan berdasarkan parameter kelulusan, dan export hasil pemeriksaan.
          </div>
          <div className="mt-3 w-fit rounded-full bg-white/15 px-3 py-1 text-xs font-black text-white">
            Dashboard v37 · row click stage detail
          </div>
        </div>

        <div className="grid gap-3 p-5 lg:grid-cols-[1fr_auto_auto_auto]">
          <select className="input" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
            <option value="all">Semua Database Instansi</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} - {s.institution_name || "-"}
              </option>
            ))}
          </select>

          <button className="btn-primary" onClick={() => loadDashboard()} disabled={loading}>
            {loading ? "Memuat..." : "Refresh Dashboard"}
          </button>

          <button
            type="button"
            className="rounded-xl border border-slate-300 px-4 py-2.5 font-black text-slate-700 hover:bg-slate-50"
            onClick={() => exportExcel("progress")}
            disabled={!data?.ok}
          >
            Export Progress Excel
          </button>

          <button
            type="button"
            className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 font-black text-emerald-700 hover:bg-emerald-100"
            onClick={() => exportExcel("full")}
            disabled={!data?.ok}
          >
            Export Semua Hasil
          </button>
        </div>
      </section>

      {data?.ok && (
        <>
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
            <StatCard label="Total" value={data.summary.total} active={status === "Semua"} onClick={() => chooseStatus("Semua")} />
            <StatCard label="Belum Selesai" value={data.summary.belum_selesai} active={status === "Belum Selesai"} onClick={() => chooseStatus("Belum Selesai")} />
            <StatCard label="Selesai" value={data.summary.selesai} active={status === "Selesai"} onClick={() => chooseStatus("Selesai")} />
            <StatCard label="Lulus" value={data.summary.lulus} hint="hanya yang selesai" active={status === "Lulus"} onClick={() => chooseStatus("Lulus")} />
            <StatCard label="Tidak Lulus" value={data.summary.tidak_lulus} hint="hanya yang selesai" active={status === "Tidak Lulus"} onClick={() => chooseStatus("Tidak Lulus")} />
            <StatCard label="Belum Dinilai" value={data.summary.belum_dinilai} active={status === "Belum Dinilai"} onClick={() => chooseStatus("Belum Dinilai")} />
            <StatCard label="Rata-rata" value={`${data.summary.rata_rata}%`} />
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xl font-black">Daftar Peserta: {status}</div>
                <div className="text-sm text-slate-500">
                  Kelulusan hanya dihitung untuk peserta yang sudah menyelesaikan seluruh stage parameter. Klik baris peserta untuk melihat detail stage.
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {FILTERS.map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => chooseStatus(filter)}
                    className={`rounded-xl px-3 py-2 text-sm font-black ${
                      status === filter ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_240px_180px_190px]">
              <div>
                <label className="label">Search Nama / No MCU</label>
                <input
                  className="input"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Ketik nama, No MCU, NIK..."
                />
              </div>

              <div>
                <label className="label">Sort</label>
                <select className="input" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                  <option value="name_asc">Alphabet A-Z</option>
                  <option value="name_desc">Alphabet Z-A</option>
                  <option value="progress_desc">Progress tertinggi</option>
                  <option value="progress_asc">Progress terendah</option>
                  <option value="score_desc">Score tertinggi</option>
                  <option value="score_asc">Score terendah</option>
                </select>
              </div>

              <div>
                <label className="label">Rows per page</label>
                <select
                  className="input"
                  value={rowsPerPage}
                  onChange={(e) => setRowsPerPage(Number(e.target.value))}
                >
                  <option value={25}>25 rows</option>
                  <option value={50}>50 rows</option>
                  <option value={100}>100 rows</option>
                  <option value={150}>150 rows</option>
                  <option value={0}>Semua rows</option>
                </select>
              </div>

              <div className="rounded-2xl bg-slate-50 p-3">
                <div className="text-xs font-black uppercase text-slate-500">Data Cocok</div>
                <div className="text-2xl font-black text-slate-900">{rowsToShow.length}</div>
              </div>
            </div>

            <div className="mobile-table">
              <table>
                <thead>
                  <tr>
                    <th>Nama</th>
                    <th>No. MCU</th>
                    <th>Database</th>
                    <th>Paket</th>
                    <th>Status</th>
                    <th>Kelulusan</th>
                    <th>Score</th>
                    <th>Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((row: any) => {
                    const isOpen = Number(selected?.participant_id) === Number(row.participant_id);

                    return (
                      <Fragment key={row.participant_id}>
                        <tr
                          className={`cursor-pointer hover:bg-blue-50 ${isOpen ? "bg-blue-50" : ""}`}
                          onClick={() => setSelected(isOpen ? null : row)}
                        >
                          <td className="font-bold">
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${isOpen ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                                {isOpen ? "−" : "+"}
                              </span>
                              {row.name}
                            </div>
                          </td>
                          <td>{row.mcu_id || row.external_id || "-"}</td>
                          <td>{row.source_name}</td>
                          <td>{row.package_name}</td>
                          <td><StatusBadge value={row.status_pemeriksaan} /></td>
                          <td><StatusBadge value={row.kelulusan_status} /></td>
                          <td className="font-black">{row.total_score ?? "-"}</td>
                          <td>
                            <div className="min-w-32">
                              <div className="mb-1 text-xs font-bold">{row.done_stage}/{row.total_stage} · {row.progress_percent}%</div>
                              <div className="h-2 rounded-full bg-slate-100">
                                <div className="h-2 rounded-full bg-blue-600" style={{ width: `${row.progress_percent}%` }} />
                              </div>
                            </div>
                          </td>
                        </tr>

                        {isOpen && (
                          <tr>
                            <td colSpan={8} className="bg-blue-50/60 p-4">
                              <div className="rounded-3xl border border-blue-100 bg-white p-4 shadow-sm">
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <div className="text-lg font-black">Detail Stage: {row.name}</div>
                                    <div className="text-sm text-slate-500">
                                      No. MCU {row.mcu_id || row.external_id || "-"} · Score {row.total_score ?? "-"} · Kelulusan {row.kelulusan_status} · Range {row.pass_min_score} - {row.pass_max_score}
                                    </div>
                                  </div>
                                  <button type="button" className="btn-secondary" onClick={(event) => {
                                    event.stopPropagation();
                                    setSelected(null);
                                  }}>
                                    Tutup
                                  </button>
                                </div>

                                <StageProgress stages={row.stages || []} />
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {!rowsToShow.length && (
                    <tr>
                      <td colSpan={8} className="p-5 text-center text-slate-500">Belum ada data untuk filter ini.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-slate-50 p-3 md:flex-row md:items-center md:justify-between">
              <div className="text-sm font-semibold text-slate-600">
                Menampilkan <b>{firstRowNumber}</b> - <b>{lastRowNumber}</b> dari <b>{rowsToShow.length}</b> data
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-black disabled:opacity-40"
                  disabled={effectivePage <= 1}
                  onClick={() => setCurrentPage(1)}
                >
                  First
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-black disabled:opacity-40"
                  disabled={effectivePage <= 1}
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                >
                  Prev
                </button>

                <div className="rounded-xl bg-white px-3 py-2 text-sm font-black text-slate-700">
                  Page {effectivePage} / {pageCount}
                </div>

                <button
                  type="button"
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-black disabled:opacity-40"
                  disabled={effectivePage >= pageCount}
                  onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
                >
                  Next
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-black disabled:opacity-40"
                  disabled={effectivePage >= pageCount}
                  onClick={() => setCurrentPage(pageCount)}
                >
                  Last
                </button>
              </div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <CompactTable title="LULUS" rows={data.lulus_rows || []} emptyText="Belum ada peserta selesai yang masuk kriteria lulus." />
            <CompactTable title="TIDAK LULUS" rows={data.tidak_lulus_rows || []} emptyText="Belum ada peserta selesai yang di luar range kelulusan." />
          </section>


        </>
      )}
    </div>
  );
}
