"use client";

import { useEffect, useMemo, useState } from "react";
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

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-slate-900 p-6 text-white">
          <div className="text-3xl font-black">Dashboard Progress & Kelulusan</div>
          <div className="mt-2 max-w-3xl text-sm font-medium text-blue-100">
            Supervisor melihat progress stage, data selesai/belum selesai, kelulusan berdasarkan parameter kelulusan, dan export hasil pemeriksaan.
          </div>
          <div className="mt-3 w-fit rounded-full bg-white/15 px-3 py-1 text-xs font-black text-white">
            Dashboard v34 · wide export selesai only
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
                  Kelulusan hanya dihitung untuk peserta yang sudah menyelesaikan seluruh stage parameter.
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
                  {rows.map((row: any) => (
                    <tr key={row.participant_id} className="cursor-pointer hover:bg-blue-50" onClick={() => setSelected(row)}>
                      <td className="font-bold">{row.name}</td>
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
                  ))}
                  {!rows.length && (
                    <tr>
                      <td colSpan={8} className="p-5 text-center text-slate-500">Belum ada data untuk filter ini.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <CompactTable title="LULUS" rows={data.lulus_rows || []} emptyText="Belum ada peserta selesai yang masuk kriteria lulus." />
            <CompactTable title="TIDAK LULUS" rows={data.tidak_lulus_rows || []} emptyText="Belum ada peserta selesai yang di luar range kelulusan." />
          </section>

          {selected && (
            <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-lg font-black">Stage: {selected.name}</div>
                  <div className="text-sm text-slate-500">
                    Score {selected.total_score ?? "-"} · Kelulusan {selected.kelulusan_status} · Range {selected.pass_min_score} - {selected.pass_max_score}
                  </div>
                </div>
                <button className="btn-secondary" onClick={() => setSelected(null)}>Tutup</button>
              </div>
              <StageProgress stages={selected.stages} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
