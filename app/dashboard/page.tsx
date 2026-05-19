"use client";

import { useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";
import StageProgress from "@/components/StageProgress";

export default function DashboardPage() {
  return (
    <AuthGate>
      {(user) => <Dashboard user={user} />}
    </AuthGate>
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
    const res = await fetch(`/api/dashboard?program=${program}&source_id=${sourceId}&status=${encodeURIComponent(nextStatus)}&limit=150`);
    const json = await res.json();
    setData(json);
    setLoading(false);
  }

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <div className="text-2xl font-black text-slate-900">Dashboard Progress</div>
        <div className="mt-1 text-sm text-slate-500">Pilih database, lalu klik refresh. Data tidak auto-refresh supaya lebih ringan di mobile.</div>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <select className="input" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
            <option value="all">Semua Database Instansi</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>{s.name} - {s.institution_name || "-"}</option>
            ))}
          </select>
          <button className="btn-primary" onClick={() => loadDashboard()} disabled={loading}>
            {loading ? "Memuat..." : "Refresh Dashboard"}
          </button>
        </div>
      </section>

      {data?.ok && (
        <>
          <section className="grid gap-3 md:grid-cols-4">
            {[
              ["Total Peserta", data.summary.total, "Semua"],
              ["Selesai", data.summary.selesai, "Selesai"],
              ["Belum Selesai", data.summary.belum_selesai, "Belum Selesai"],
              ["Rata-rata", `${data.summary.rata_rata}%`, status]
            ].map(([label, value, next]) => (
              <button
                key={label}
                onClick={() => {
                  if (typeof next === "string") {
                    setStatus(next);
                    loadDashboard(next);
                  }
                }}
                className="card p-4 text-left transition hover:border-blue-300 hover:bg-blue-50"
              >
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
                <div className="mt-2 text-2xl font-black text-slate-900">{value}</div>
              </button>
            ))}
          </section>

          <section className="card p-4">
            <div className="mb-3 text-lg font-black">Daftar Peserta: {status}</div>
            <div className="mobile-table">
              <table>
                <thead>
                  <tr>
                    <th>Nama</th>
                    <th>ID</th>
                    <th>Database</th>
                    <th>Status</th>
                    <th>Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row: any) => (
                    <tr key={row.participant_id} className="cursor-pointer hover:bg-blue-50" onClick={() => setSelected(row)}>
                      <td className="font-bold">{row.name}</td>
                      <td>{row.mcu_id || row.external_id || "-"}</td>
                      <td>{row.source_name}</td>
                      <td>{row.status_pemeriksaan}</td>
                      <td>{row.done_stage}/{row.total_stage} · {row.progress_percent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {selected && (
            <section className="card p-4">
              <div className="mb-3 text-lg font-black">Stage: {selected.name}</div>
              <StageProgress stages={selected.stages} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
