"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import HarmonyMenu from "@/components/HarmonyMenu";

type ModuleKey = "mcu_capaska" | "mcu_corporate" | "vaccination";

const MODULES: Array<{ key: ModuleKey; title: string; subtitle: string; accent: string }> = [
  {
    key: "mcu_capaska",
    title: "MCU CAPASKA",
    subtitle: "Progress, kelulusan, dan pemeriksaan CAPASKA.",
    accent: "from-blue-600 to-indigo-700",
  },
  {
    key: "mcu_corporate",
    title: "MCU Corporate",
    subtitle: "Progress dan hasil medical check-up corporate.",
    accent: "from-slate-700 to-slate-950",
  },
  {
    key: "vaccination",
    title: "Vaksinasi Perusahaan",
    subtitle: "Vaksin, antrian, administered, dokter, dan export.",
    accent: "from-emerald-600 to-teal-700",
  },
];

const VACCINATION_STATUS = [
  { value: "all", label: "Semua" },
  { value: "done", label: "Sudah" },
  { value: "not_done", label: "Belum" },
  { value: "no_queue", label: "Belum Rilis Antrian" },
  { value: "waiting", label: "Sudah Antrian Belum Selesai" },
];

export default function DashboardPage() {
  return <AuthGate>{(user) => <Dashboard user={user} />}</AuthGate>;
}

function MetricCard({
  label,
  value,
  active,
  tone = "slate",
  onClick,
}: {
  label: string;
  value: any;
  active?: boolean;
  tone?: "slate" | "blue" | "emerald" | "amber" | "red" | "indigo";
  onClick?: () => void;
}) {
  const toneClass = {
    slate: active ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-900",
    blue: active ? "border-blue-600 bg-blue-600 text-white" : "border-blue-100 bg-blue-50 text-blue-900",
    emerald: active ? "border-emerald-600 bg-emerald-600 text-white" : "border-emerald-100 bg-emerald-50 text-emerald-900",
    amber: active ? "border-amber-500 bg-amber-500 text-white" : "border-amber-100 bg-amber-50 text-amber-900",
    red: active ? "border-red-600 bg-red-600 text-white" : "border-red-100 bg-red-50 text-red-900",
    indigo: active ? "border-indigo-600 bg-indigo-600 text-white" : "border-indigo-100 bg-indigo-50 text-indigo-900",
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-3xl border p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${toneClass}`}
    >
      <div className="text-xs font-black uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-2 text-3xl font-black">{value ?? 0}</div>
    </button>
  );
}

function StatusPill({ children, tone = "slate" }: { children: any; tone?: "slate" | "blue" | "emerald" | "amber" | "red" }) {
  const cls = {
    slate: "bg-slate-100 text-slate-700",
    blue: "bg-blue-100 text-blue-700",
    emerald: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-700",
  }[tone];

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${cls}`}>{children}</span>;
}

function Dashboard({ user }: { user: any }) {
  const [moduleKey, setModuleKey] = useState<ModuleKey>("mcu_corporate");
  const [sources, setSources] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [sourceId, setSourceId] = useState("all");
  const [sessionId, setSessionId] = useState("");
  const [vaccStatus, setVaccStatus] = useState("all");
  const [mcuStatus, setMcuStatus] = useState("Semua");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [summary, setSummary] = useState<any>({});
  const [rows, setRows] = useState<any[]>([]);
  const [message, setMessage] = useState("Pilih modul dan database, lalu klik Tampilkan Dashboard.");

  const activeModule = MODULES.find((m) => m.key === moduleKey) || MODULES[0];
  const isVaccination = moduleKey === "vaccination";
  const mcuProgram = moduleKey === "mcu_capaska" ? "capaska" : "corporate";

  async function loadOptions(nextModule = moduleKey) {
    setRows([]);
    setSummary({});
    setLoaded(false);
    setSearch("");

    if (nextModule === "vaccination") {
      setSourceId("");
      const [sessionJson, sourceJson] = await Promise.all([
        fetch("/api/vaccination/sessions", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
        fetch("/api/sources?program=corporate", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      ]);
      setSessions(sessionJson.sessions || []);
      setSources(sourceJson.sources || []);
      if (sessionJson.sessions?.[0]?.id) setSessionId(String(sessionJson.sessions[0].id));
      return;
    }

    setSessionId("");
    setSourceId("all");
    const json = await fetch(`/api/sources?program=${nextModule === "mcu_capaska" ? "capaska" : "corporate"}`, { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => ({}));
    setSources(json.sources || []);
  }

  async function loadDashboard() {
    setLoading(true);
    setMessage("Memuat dashboard...");

    try {
      if (isVaccination) {
        const params = new URLSearchParams();
        params.set("status", vaccStatus);
        if (sessionId) params.set("session_id", sessionId);
        if (sourceId && sourceId !== "all") params.set("source_id", sourceId);

        const json = await fetch(`/api/vaccination/dashboard?${params.toString()}`, { cache: "no-store" }).then((r) => r.json());
        if (!json.ok) {
          setMessage(json.message || "Gagal memuat dashboard vaksinasi.");
          setRows([]);
          setSummary({});
          setLoaded(true);
          return;
        }

        setSummary(json.summary || {});
        setRows(json.rows || []);
        setMessage("Dashboard vaksinasi berhasil dimuat.");
        setLoaded(true);
        return;
      }

      const params = new URLSearchParams({
        program: mcuProgram,
        source_id: sourceId || "all",
        status: mcuStatus,
        limit: "1000",
      });

      const json = await fetch(`/api/dashboard?${params.toString()}`, { cache: "no-store" }).then((r) => r.json());
      if (!json.ok) {
        setMessage(json.message || "Gagal memuat dashboard MCU.");
        setRows([]);
        setSummary({});
        setLoaded(true);
        return;
      }

      setSummary(json.summary || {});
      setRows(json.rows || []);
      setMessage("Dashboard MCU berhasil dimuat.");
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }

  function exportData(type: "all" | "done" | "not_done" | "active" | "progress" | "full") {
    if (isVaccination) {
      const params = new URLSearchParams();
      params.set("format", "csv");
      params.set("status", type === "active" ? vaccStatus : type);
      if (sessionId) params.set("session_id", sessionId);
      if (sourceId && sourceId !== "all") params.set("source_id", sourceId);
      window.open(`/api/vaccination/dashboard?${params.toString()}`, "_blank");
      return;
    }

    const params = new URLSearchParams({
      program: mcuProgram,
      source_id: sourceId || "all",
      status: mcuStatus,
      type: type === "full" ? "full" : "progress",
    });
    window.open(`/api/dashboard/export?${params.toString()}`, "_blank");
  }

  useEffect(() => {
    loadOptions(moduleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleKey]);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return rows;

    return rows.filter((row: any) => {
      const haystack = isVaccination
        ? [
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
          ]
        : [
            row.name,
            row.mcu_id,
            row.external_id,
            row.source_name,
            row.package_name,
            row.status_pemeriksaan,
            row.kelulusan_status,
          ];

      return haystack.filter(Boolean).join(" ").toLowerCase().includes(keyword);
    });
  }, [rows, search, isVaccination]);

  return (
    <main className="min-h-screen bg-slate-50">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-5">
          <div>
            <div className="text-2xl font-black tracking-tight text-slate-900">Harmony Health App</div>
            <div className="text-sm font-medium text-slate-500">
              {user?.name || "Administrator"} · {user?.role || "Admin"}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <HarmonyMenu />
            <a href="/logout" className="rounded-2xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">
              Logout
            </a>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        <section className={`overflow-hidden rounded-[2rem] bg-gradient-to-r ${activeModule.accent} shadow-sm`}>
          <div className="p-7 text-white">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-3xl font-black">Dashboard Operasional</div>
                <div className="mt-2 max-w-3xl text-sm font-medium opacity-90">
                  Pilih layanan yang ingin ditampilkan, pilih database/session, lalu retrieve dashboard card dan tabel.
                </div>
              </div>
              <div className="rounded-2xl bg-white/15 px-4 py-3 text-sm font-black backdrop-blur">{activeModule.title}</div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          {MODULES.map((item) => (
            <button
              type="button"
              key={item.key}
              onClick={() => setModuleKey(item.key)}
              className={`rounded-3xl border p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                moduleKey === item.key ? "border-blue-500 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-900 hover:border-blue-200"
              }`}
            >
              <div className="text-lg font-black">{item.title}</div>
              <div className={`mt-2 text-sm leading-6 ${moduleKey === item.key ? "text-blue-50" : "text-slate-500"}`}>{item.subtitle}</div>
            </button>
          ))}
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[220px_1fr_1fr_auto]">
            <select className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" value={moduleKey} onChange={(e) => setModuleKey(e.target.value as ModuleKey)}>
              {MODULES.map((item) => <option key={item.key} value={item.key}>{item.title}</option>)}
            </select>

            {isVaccination ? (
              <select className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
                <option value="">Semua Session Vaksinasi</option>
                {sessions.map((session) => <option key={session.id} value={session.id}>{session.session_name} · {session.company_name || "-"}</option>)}
              </select>
            ) : (
              <select className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                <option value="all">Semua Database</option>
                {sources.map((source) => <option key={source.id} value={source.id}>{source.name} · {source.institution_name || "-"}</option>)}
              </select>
            )}

            {isVaccination ? (
              <select className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" value={vaccStatus} onChange={(e) => setVaccStatus(e.target.value)}>
                {VACCINATION_STATUS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            ) : (
              <select className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" value={mcuStatus} onChange={(e) => setMcuStatus(e.target.value)}>
                <option value="Semua">Semua</option>
                <option value="Belum Selesai">Belum Selesai</option>
                <option value="Selesai">Selesai</option>
                <option value="Lulus">Lulus</option>
                <option value="Tidak Lulus">Tidak Lulus</option>
                <option value="Belum Dinilai">Belum Dinilai</option>
              </select>
            )}

            <button type="button" onClick={loadDashboard} disabled={loading} className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60">
              {loading ? "Memuat..." : "Tampilkan Dashboard"}
            </button>
          </div>

          <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">{message}</div>
        </section>

        {loaded ? (
          <>
            {isVaccination ? (
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <MetricCard label="Total" value={summary.total} tone="slate" onClick={() => setVaccStatus("all")} active={vaccStatus === "all"} />
                <MetricCard label="Sudah" value={summary.done} tone="emerald" onClick={() => setVaccStatus("done")} active={vaccStatus === "done"} />
                <MetricCard label="Belum" value={summary.not_done} tone="amber" onClick={() => setVaccStatus("not_done")} active={vaccStatus === "not_done"} />
                <MetricCard label="Belum Antrian" value={summary.no_queue} tone="indigo" onClick={() => setVaccStatus("no_queue")} active={vaccStatus === "no_queue"} />
                <MetricCard label="Antri Belum Selesai" value={summary.waiting} tone="blue" onClick={() => setVaccStatus("waiting")} active={vaccStatus === "waiting"} />
              </section>
            ) : (
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                <MetricCard label="Total" value={summary.total} tone="slate" />
                <MetricCard label="Belum Selesai" value={summary.belum_selesai} tone="amber" />
                <MetricCard label="Selesai" value={summary.selesai} tone="blue" />
                <MetricCard label="Lulus" value={summary.lulus} tone="emerald" />
                <MetricCard label="Tidak Lulus" value={summary.tidak_lulus} tone="red" />
                <MetricCard label="Rata-rata" value={`${summary.rata_rata || 0}%`} tone="indigo" />
              </section>
            )}

            <section className="rounded-[2rem] border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-xl font-black text-slate-900">Data {activeModule.title}</div>
                  <div className="text-sm font-medium text-slate-500">{filteredRows.length} baris ditampilkan</div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <input className="min-w-[260px] rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" placeholder="Cari nama, nomor, status..." value={search} onChange={(e) => setSearch(e.target.value)} />

                  {isVaccination ? (
                    <>
                      <button className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700" onClick={() => exportData("done")}>Export Sudah</button>
                      <button className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-700" onClick={() => exportData("not_done")}>Export Belum</button>
                      <button className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white" onClick={() => exportData("active")}>Export Filter</button>
                    </>
                  ) : (
                    <>
                      <button className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700" onClick={() => exportData("progress")}>Export Progress</button>
                      <button className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700" onClick={() => exportData("full")}>Export Semua</button>
                    </>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                {isVaccination ? (
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-left">Antrian</th>
                        <th className="px-4 py-3 text-left">Nama</th>
                        <th className="px-4 py-3 text-left">MCU / ID</th>
                        <th className="px-4 py-3 text-left">Perusahaan</th>
                        <th className="px-4 py-3 text-left">Status</th>
                        <th className="px-4 py-3 text-left">Vaksin</th>
                        <th className="px-4 py-3 text-left">Dokter</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRows.map((row: any) => (
                        <tr key={row.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-black">{row.queue_number || "-"}</td>
                          <td className="px-4 py-3 font-bold text-slate-900">{row.participant_name}</td>
                          <td className="px-4 py-3 text-slate-600">{row.mcu_id || row.employee_id || "-"}</td>
                          <td className="px-4 py-3 text-slate-600">{row.company_name || row.session?.company_name || "-"}</td>
                          <td className="px-4 py-3"><StatusPill tone={row.is_done ? "emerald" : row.queue_number ? "blue" : "amber"}>{row.dashboard_status}</StatusPill></td>
                          <td className="px-4 py-3 text-slate-600">{row.vaccine_names || "-"}</td>
                          <td className="px-4 py-3 text-slate-600">{row.administered_by || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-left">Nama</th>
                        <th className="px-4 py-3 text-left">No. MCU</th>
                        <th className="px-4 py-3 text-left">Database</th>
                        <th className="px-4 py-3 text-left">Paket</th>
                        <th className="px-4 py-3 text-left">Status</th>
                        <th className="px-4 py-3 text-left">Kelulusan</th>
                        <th className="px-4 py-3 text-left">Score</th>
                        <th className="px-4 py-3 text-left">Progress</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRows.map((row: any) => (
                        <tr key={`${row.participant_id}-${row.mcu_id || row.external_id}`} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-bold text-slate-900">{row.name}</td>
                          <td className="px-4 py-3 text-slate-600">{row.mcu_id || row.external_id || "-"}</td>
                          <td className="px-4 py-3 text-slate-600">{row.source_name || "-"}</td>
                          <td className="px-4 py-3 text-slate-600">{row.package_name || "-"}</td>
                          <td className="px-4 py-3"><StatusPill tone={row.status_pemeriksaan === "Selesai" ? "blue" : "slate"}>{row.status_pemeriksaan}</StatusPill></td>
                          <td className="px-4 py-3"><StatusPill tone={row.kelulusan_status === "Lulus" ? "emerald" : row.kelulusan_status === "Tidak Lulus" ? "red" : "slate"}>{row.kelulusan_status}</StatusPill></td>
                          <td className="px-4 py-3 font-black">{row.total_score ?? "-"}</td>
                          <td className="px-4 py-3">
                            <div className="min-w-[140px]">
                              <div className="mb-1 text-xs font-bold text-slate-500">{row.done_stage}/{row.total_stage} · {row.progress_percent}%</div>
                              <div className="h-2 rounded-full bg-slate-100">
                                <div className="h-2 rounded-full bg-blue-600" style={{ width: `${row.progress_percent || 0}%` }} />
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {!filteredRows.length ? (
                  <div className="p-8 text-center text-sm font-semibold text-slate-500">
                    Belum ada data untuk pilihan ini.
                  </div>
                ) : null}
              </div>
            </section>
          </>
        ) : (
          <section className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-10 text-center">
            <div className="text-xl font-black text-slate-900">Belum ada dashboard ditampilkan</div>
            <p className="mt-2 text-sm font-medium text-slate-500">
              Pilih salah satu layanan, tentukan database/session, lalu klik Tampilkan Dashboard.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
