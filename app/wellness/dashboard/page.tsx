"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import { WELLNESS_FOCUS_ITEMS, WELLNESS_GROUPS } from "@/lib/wellness/riskRules";

// WELLNESS_PARTICIPANT_CHARTS_V351

type RoleKey = "participant" | "leader" | "medical" | "company";

type Tone = "slate" | "emerald" | "blue" | "amber" | "rose" | "purple";

const roleCards: Array<{ key: RoleKey; title: string; subtitle: string; focus: string[] }> = [
  {
    key: "participant",
    title: "Peserta",
    subtitle: "Peserta hanya melihat data wellness miliknya sendiri.",
    focus: ["Profil wellness pribadi", "Input monitoring", "Grafik progres", "Reminder edukasi"],
  },
  {
    key: "leader",
    title: "Ketua Kelompok",
    subtitle: "Fokus pada kepatuhan dan progress anggota, bukan diagnosis klinis penuh.",
    focus: ["Status upload anggota", "Progress kelompok", "Reminder anggota", "Catatan kendala"],
  },
  {
    key: "medical",
    title: "Tim Medis / Admin Wellness",
    subtitle: "Role operasional lengkap untuk validasi, risiko, dan follow-up.",
    focus: ["Import data MCU", "Validasi upload", "Monitoring risiko", "Follow-up medis"],
  },
  {
    key: "company",
    title: "Perusahaan / HR",
    subtitle: "Melihat ringkasan agregat program tanpa detail medis sensitif.",
    focus: ["Executive summary", "Progress per kelompok", "Kepatuhan upload", "Export laporan agregat"],
  },
];

function fmt(value: any, suffix = "") {
  if (value === null || value === undefined || value === "") return "-";
  return `${value}${suffix}`;
}

function toneClass(tone: Tone) {
  return {
    slate: "border-slate-200 bg-white text-slate-950",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-950",
    blue: "border-blue-100 bg-blue-50 text-blue-950",
    amber: "border-amber-100 bg-amber-50 text-amber-950",
    rose: "border-rose-100 bg-rose-50 text-rose-950",
    purple: "border-purple-100 bg-purple-50 text-purple-950",
  }[tone];
}

function StatCard({ label, value, tone = "slate", caption }: { label: string; value: any; tone?: Tone; caption?: string }) {
  return (
    <div className={`rounded-3xl border p-5 shadow-sm ${toneClass(tone)}`}>
      <div className="text-xs font-black uppercase tracking-wide opacity-60">{label}</div>
      <div className="mt-2 text-3xl font-black">{value ?? 0}</div>
      {caption ? <div className="mt-1 text-xs font-semibold opacity-60">{caption}</div> : null}
    </div>
  );
}

function Badge({ children, tone = "blue" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${toneClass(tone)}`}>{children}</span>;
}

function riskTone(level: string): Tone {
  if (level === "high") return "rose";
  if (level === "medium") return "amber";
  if (level === "low") return "emerald";
  return "slate";
}


type TrendPoint = {
  label?: string;
  date?: string | null;
  source?: string | null;
  [key: string]: any;
};

type TrendSeries = {
  key: string;
  label: string;
  unit?: string;
};

function toNumber(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function lastValue(points: TrendPoint[] = [], key = "value") {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const value = toNumber(points[index]?.[key]);
    if (value !== null) return value;
  }
  return null;
}

function firstValue(points: TrendPoint[] = [], key = "value") {
  for (const point of points || []) {
    const value = toNumber(point?.[key]);
    if (value !== null) return value;
  }
  return null;
}

function deltaText(points: TrendPoint[] = [], key = "value", unit = "") {
  const first = firstValue(points, key);
  const last = lastValue(points, key);
  if (first === null || last === null || points.length < 2) return "Belum cukup data trend";
  const delta = Math.round((last - first) * 10) / 10;
  const sign = delta > 0 ? "+" : "";
  return `Delta ${sign}${delta}${unit ? ` ${unit}` : ""}`;
}

function TrendChart({ title, caption, points = [], series, height = 150 }: { title: string; caption?: string; points?: TrendPoint[]; series: TrendSeries[]; height?: number }) {
  const chartPoints = Array.isArray(points) ? points : [];
  const values = chartPoints
    .flatMap((point) => series.map((item) => toNumber(point?.[item.key])))
    .filter((value): value is number => value !== null);
  const primary = series[0];
  const primaryDelta = deltaText(chartPoints, primary?.key || "value", primary?.unit || "");

  if (!values.length) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-black text-slate-900">{title}</div>
        <div className="mt-1 text-xs font-semibold text-slate-400">{caption || "Belum ada data"}</div>
        <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs font-bold text-slate-400">Belum ada data grafik.</div>
      </div>
    );
  }

  const minRaw = Math.min(...values);
  const maxRaw = Math.max(...values);
  const range = maxRaw - minRaw;
  const pad = range === 0 ? Math.max(1, Math.abs(maxRaw) * 0.08) : range * 0.12;
  const min = minRaw - pad;
  const max = maxRaw + pad;
  const width = 360;
  const top = 14;
  const bottom = 26;
  const left = 30;
  const right = 16;
  const innerWidth = width - left - right;
  const innerHeight = height - top - bottom;
  const xFor = (index: number) => left + (chartPoints.length <= 1 ? innerWidth / 2 : (index / (chartPoints.length - 1)) * innerWidth);
  const yFor = (value: number) => top + ((max - value) / Math.max(0.0001, max - min)) * innerHeight;
  const seriesColors = ["#2563eb", "#e11d48", "#16a34a", "#9333ea"];

  function pathFor(key: string) {
    const segments: string[] = [];
    chartPoints.forEach((point, index) => {
      const value = toNumber(point?.[key]);
      if (value === null) return;
      const command = segments.length ? "L" : "M";
      segments.push(`${command}${xFor(index)},${yFor(value)}`);
    });
    return segments.join(" ");
  }

  const firstLabel = chartPoints[0]?.label || "Awal";
  const lastLabel = chartPoints[chartPoints.length - 1]?.label || "Terakhir";

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-black text-slate-900">{title}</div>
          <div className="mt-1 text-xs font-semibold text-slate-400">{caption || primaryDelta}</div>
        </div>
        <div className="rounded-2xl bg-slate-50 px-3 py-2 text-right text-xs font-black text-slate-700">
          {primary?.label}: {fmt(lastValue(chartPoints, primary?.key || "value"), primary?.unit ? ` ${primary.unit}` : "")}
        </div>
      </div>
      <svg className="mt-4 h-[170px] w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
        <line x1={left} x2={width - right} y1={top + innerHeight} y2={top + innerHeight} stroke="#e2e8f0" strokeWidth="1" />
        <line x1={left} x2={width - right} y1={top} y2={top} stroke="#f1f5f9" strokeWidth="1" />
        {series.map((item, seriesIndex) => {
          const path = pathFor(item.key);
          const color = seriesColors[seriesIndex % seriesColors.length];
          return (
            <g key={item.key}>
              {path ? <path d={path} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /> : null}
              {chartPoints.map((point, index) => {
                const value = toNumber(point?.[item.key]);
                if (value === null) return null;
                return <circle key={`${item.key}-${index}`} cx={xFor(index)} cy={yFor(value)} r="3.5" fill={color} />;
              })}
            </g>
          );
        })}
        <text x={left} y={height - 6} fontSize="10" fontWeight="700" fill="#64748b">{firstLabel}</text>
        <text x={width - right} y={height - 6} fontSize="10" fontWeight="700" textAnchor="end" fill="#64748b">{lastLabel}</text>
      </svg>
      <div className="mt-3 flex flex-wrap gap-2">
        {series.map((item, index) => (
          <span key={item.key} className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1 text-xs font-black text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: seriesColors[index % seriesColors.length] }} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ParticipantChartPanel({ participant }: { participant: any }) {
  const charts = participant?.parameter_charts || {};
  if (!participant) {
    return (
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500 shadow-sm">
        Pilih peserta untuk melihat grafik parameter.
      </section>
    );
  }

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-slate-50 p-6 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xl font-black text-slate-900">Grafik Parameter Per Peserta</div>
          <div className="mt-1 text-sm font-semibold text-slate-500">
            {participant.name} · {participant.code || "Tanpa kode"} · {participant.risk_group_name || "Monitoring"}
          </div>
        </div>
        <div className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm">
          Latest upload: {participant.latest_upload_date || "-"}
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <TrendChart title="Berat badan" points={charts.weight_kg} series={[{ key: "value", label: "BB", unit: "kg" }]} />
        <TrendChart title="BMI" points={charts.bmi} series={[{ key: "value", label: "BMI" }]} />
        <TrendChart title="Tekanan darah" points={charts.blood_pressure} series={[{ key: "sbp", label: "Sistolik", unit: "mmHg" }, { key: "dbp", label: "Diastolik", unit: "mmHg" }]} />
        <TrendChart title="HbA1c" points={charts.hba1c} series={[{ key: "value", label: "HbA1c", unit: "%" }]} />
        <TrendChart title="Gula darah" points={charts.glucose} series={[{ key: "value", label: "Gula", unit: "mg/dL" }]} />
        <TrendChart title="Lingkar perut" points={charts.waist_cm} series={[{ key: "value", label: "LP", unit: "cm" }]} />
        <TrendChart title="Nutrisi harian" caption="Total kalori dari food log" points={charts.nutrition_calories} series={[{ key: "value", label: "Kalori", unit: "kkal" }]} />
        <TrendChart title="Workout calories" caption="Kalori terbakar dari activity log" points={charts.activity_calories} series={[{ key: "value", label: "Kalori", unit: "kkal" }]} />
        <TrendChart title="Workout duration" caption="Total durasi aktivitas per hari" points={charts.workout_minutes} series={[{ key: "value", label: "Durasi", unit: "menit" }]} />
      </div>
    </section>
  );
}

export default function WellnessDashboardPage() {
  return <AuthGate>{() => <WellnessDashboard />}</AuthGate>;
}

function WellnessDashboard() {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<any>({});
  const [rows, setRows] = useState<any[]>([]);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [activeRole, setActiveRole] = useState<RoleKey>("medical");
  const [message, setMessage] = useState("Memuat dashboard Wellness...");

  async function load() {
    setLoading(true);
    try {
      const json = await fetch("/api/wellness/dashboard", { cache: "no-store" }).then((r) => r.json());
      if (!json.ok) {
        setMessage(json.message || "Gagal memuat dashboard Wellness.");
        setRows([]);
        setSummary({});
        return;
      }
      setRows(json.rows || []);
      setSummary(json.summary || {});
      setMessage("Dashboard Wellness berhasil dimuat.");
    } catch (error: any) {
      setMessage(error?.message || "Gagal memuat dashboard Wellness.");
      setRows([]);
      setSummary({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter((row) => [row.name, row.code, row.group_name, row.risk_group_name, row.risk_label, row.bmi_status].filter(Boolean).join(" ").toLowerCase().includes(keyword));
  }, [rows, search]);

  useEffect(() => {
    if (!rows.length) {
      setSelectedParticipantId("");
      return;
    }
    if (!rows.some((row) => String(row.id) === String(selectedParticipantId))) {
      setSelectedParticipantId(String(rows[0].id));
    }
  }, [rows, selectedParticipantId]);

  const selectedParticipant = useMemo(() => {
    return rows.find((row) => String(row.id) === String(selectedParticipantId)) || rows[0] || null;
  }, [rows, selectedParticipantId]);

  const activeRoleCard = roleCards.find((item) => item.key === activeRole) || roleCards[0];

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-950 via-blue-950 to-emerald-900 shadow-sm">
        <div className="p-7 text-white">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-black uppercase tracking-wide ring-1 ring-white/20">WELLNESS ONLY</span>
                <span className="rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-black uppercase tracking-wide text-emerald-100 ring-1 ring-emerald-200/20">Isolated from MCU Corporate, CAPASKA, Vaksinasi</span>
              </div>
              <div className="text-3xl font-black">Wellness Risk Monitoring</div>
              <div className="mt-2 max-w-3xl text-sm font-medium text-blue-50">
                Monitoring HbA1c/gula darah, BMI, tekanan darah, berat badan, lingkar perut, aktivitas fisik, kepatuhan follow-up, dan edukasi.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href="/wellness/settings" className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-blue-800 shadow-sm">Setting Parameter</a>
              <a href="/wellness/input" className="rounded-2xl bg-white/15 px-4 py-3 text-sm font-black text-white ring-1 ring-white/25">Input Monitoring</a>
              <a href="/wellness/import" className="rounded-2xl bg-white/15 px-4 py-3 text-sm font-black text-white ring-1 ring-white/25">Import Baseline MCU</a>
              <button onClick={load} disabled={loading} className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-black text-white shadow-sm disabled:opacity-60">{loading ? "Memuat..." : "Refresh"}</button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Peserta" value={summary.total || 0} caption="Total program" />
        <StatCard label="High Risk" value={summary.high_risk || 0} tone="rose" caption="Perlu prioritas" />
        <StatCard label="Perlu Follow-up" value={summary.need_followup || 0} tone="amber" caption="Alert medis" />
        <StatCard label="Kepatuhan" value={`${summary.compliance_rate || 0}%`} tone="emerald" caption="Upload mingguan" />
        <StatCard label="Rata-rata BMI" value={summary.avg_bmi || 0} tone="blue" caption="Baseline/progress" />
        <StatCard label="Avg Delta BB" value={fmt(summary.avg_weight_delta_kg, " kg")} tone="purple" caption={`${summary.improved_weight_count || 0} peserta turun BB`} />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {WELLNESS_FOCUS_ITEMS.map((item) => (
          <div key={item.title} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-black text-slate-900">{item.title}</div>
            <div className="mt-2 text-sm leading-6 text-slate-600">{item.description}</div>
          </div>
        ))}
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-lg font-black text-slate-900">Pilih Peserta untuk Grafik</div>
            <div className="mt-1 text-sm font-semibold text-slate-500">Grafik menampilkan baseline MCU dibandingkan input berkala, mini MCU, nutrisi, dan workout.</div>
          </div>
          <select
            className="min-w-[280px] rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            value={selectedParticipantId}
            onChange={(event) => setSelectedParticipantId(event.target.value)}
          >
            {rows.map((row) => (
              <option key={row.id} value={String(row.id)}>{row.name} {row.code ? `· ${row.code}` : ""}</option>
            ))}
          </select>
        </div>
      </section>

      <ParticipantChartPanel participant={selectedParticipant} />

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xl font-black text-slate-900">Role Workspace</div>
            <div className="mt-1 text-sm font-semibold text-slate-500">Hak akses Wellness dipisah berdasarkan role program.</div>
          </div>
          <div className="grid grid-cols-2 gap-2 md:flex">
            {roleCards.map((role) => (
              <button
                key={role.key}
                onClick={() => setActiveRole(role.key)}
                className={
                  "rounded-2xl px-4 py-3 text-sm font-black transition " +
                  (activeRole === role.key ? "bg-blue-600 text-white shadow-lg shadow-blue-100" : "bg-slate-100 text-slate-700 hover:bg-slate-200")
                }
              >
                {role.title}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-5 rounded-3xl border border-blue-100 bg-blue-50 p-5">
          <div className="text-lg font-black text-blue-950">{activeRoleCard.title}</div>
          <div className="mt-1 text-sm font-semibold text-blue-700">{activeRoleCard.subtitle}</div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {activeRoleCard.focus.map((item) => (
              <div key={item} className="rounded-2xl bg-white p-4 text-sm font-black text-slate-800 shadow-sm">{item}</div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xl font-black text-slate-900">Monitoring Risiko Peserta</div>
            <div className="mt-1 text-sm font-semibold text-slate-500">{message}</div>
          </div>
          <input
            className="min-w-[260px] rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            placeholder="Cari peserta / kelompok / risiko"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Nama</th>
                <th className="px-4 py-3 text-left">Entity/Kelompok</th>
                <th className="px-4 py-3 text-left">HbA1c/Gula</th>
                <th className="px-4 py-3 text-left">BMI Before → Now</th>
                <th className="px-4 py-3 text-left">TD Before → Now</th>
                <th className="px-4 py-3 text-left">BB Before → Now</th>
                <th className="px-4 py-3 text-left">Risiko</th>
                <th className="px-4 py-3 text-left">Upload</th>
                <th className="px-4 py-3 text-left">Follow-up</th>
                <th className="px-4 py-3 text-left">Grafik</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-black text-slate-900">{row.name}<div className="text-xs font-semibold text-slate-400">{row.code || "-"}</div></td>
                  <td className="px-4 py-3 text-slate-600">
                    <div className="font-bold text-slate-800">{row.company_name || "-"}</div>
                    <div className="text-xs text-slate-400">{row.group_name || "-"}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <div>HbA1c {fmt(row.baseline_hba1c)} → {fmt(row.hba1c)}</div>
                    <div className={`text-xs font-black ${Number(row.hba1c_delta || 0) <= 0 ? "text-emerald-700" : "text-rose-700"}`}>Δ {fmt(row.hba1c_delta)}</div>
                    <div className="text-xs text-slate-400">Gula {fmt(row.baseline_glucose)} → {fmt(row.glucose)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700">{fmt(row.baseline_bmi)} → {fmt(row.bmi)} · {row.bmi_status || "-"}</span>
                    <div className={`mt-1 text-xs font-black ${Number(row.bmi_delta || 0) <= 0 ? "text-emerald-700" : "text-rose-700"}`}>Δ {fmt(row.bmi_delta)}</div>
                  </td>
                  <td className="px-4 py-3 font-bold">
                    <div>{fmt(row.baseline_sbp)}/{fmt(row.baseline_dbp)} → {fmt(row.sbp)}/{fmt(row.dbp)}</div>
                    <div className={`text-xs font-black ${Number(row.sbp_delta || 0) <= 0 && Number(row.dbp_delta || 0) <= 0 ? "text-emerald-700" : "text-rose-700"}`}>Δ {fmt(row.sbp_delta)}/{fmt(row.dbp_delta)}</div>
                  </td>
                  <td className="px-4 py-3 font-bold">
                    <div>{fmt(row.baseline_weight_kg, " kg")} → {fmt(row.current_weight_kg, " kg")}</div>
                    <div className={`text-xs font-black ${Number(row.weight_delta_kg || 0) <= 0 ? "text-emerald-700" : "text-rose-700"}`}>Δ {fmt(row.weight_delta_kg, " kg")}</div>
                  </td>
                  <td className="px-4 py-3"><Badge tone={riskTone(row.risk_level)}>{row.risk_label || "Monitoring"}</Badge></td>
                  <td className="px-4 py-3 text-slate-600">{row.compliance_status || "-"}</td>
                  <td className="px-4 py-3 font-black text-slate-800">{row.need_followup ? "Ya" : "Tidak"}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setSelectedParticipantId(String(row.id))}
                      className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white shadow-sm hover:bg-blue-700"
                    >
                      Lihat grafik
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredRows.length ? <div className="p-8 text-center text-sm font-semibold text-slate-500">Belum ada data Wellness.</div> : null}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        {WELLNESS_GROUPS.map((group) => (
          <div key={group.name} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="font-black text-slate-950">{group.name}</div>
            <div className="mt-2 text-xs font-bold text-slate-500">{group.criteria}</div>
            <div className="mt-3 text-sm leading-6 text-slate-600">{group.focus}</div>
          </div>
        ))}
      </section>
    </div>
  );
}
