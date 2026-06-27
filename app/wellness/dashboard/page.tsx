"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";

// WELLNESS_PRO_WORKSPACE_V357
// WELLNESS_EVIDENCE_GALLERY_PROGRESS_V364

type Tone = "slate" | "emerald" | "blue" | "amber" | "rose" | "purple" | "indigo";

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

const workspaceMenu = [
  { label: "1. Setting Program", href: "/wellness/settings", description: "Perusahaan, kelompok, group, parameter" },
  { label: "2. Import Peserta", href: "/wellness/import", description: "Identitas peserta per group upload" },
  { label: "3. Import History MCU", href: "/wellness/history-import", description: "Baseline, mini MCU, final MCU" },
  { label: "4. Dashboard", href: "/wellness/dashboard", description: "Before-after dan grafik" },
  { label: "5. Input Harian", href: "/wellness/input", description: "Nutrisi, workout, BB" },
  { label: "6. Master", href: "/wellness/master", description: "Kalori makanan dan aktivitas" },
  { label: "7. Signup Peserta", href: "/wellness/signup", description: "Portal peserta" },
];

function fmt(value: any, suffix = "") {
  if (value === null || value === undefined || value === "" || Number.isNaN(value)) return "-";
  return `${value}${suffix}`;
}

function fmtPair(a: any, b: any, sep = "/") {
  if ((a === null || a === undefined || a === "") && (b === null || b === undefined || b === "")) return "-";
  return `${fmt(a)}${sep}${fmt(b)}`;
}

function toneClass(tone: Tone) {
  return {
    slate: "border-slate-200 bg-white text-slate-950",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-950",
    blue: "border-blue-100 bg-blue-50 text-blue-950",
    amber: "border-amber-100 bg-amber-50 text-amber-950",
    rose: "border-rose-100 bg-rose-50 text-rose-950",
    purple: "border-purple-100 bg-purple-50 text-purple-950",
    indigo: "border-indigo-100 bg-indigo-50 text-indigo-950",
  }[tone];
}

function riskTone(level: string): Tone {
  if (level === "high") return "rose";
  if (level === "medium") return "amber";
  if (level === "low") return "emerald";
  return "slate";
}

function deltaTone(value: any, lowerIsBetter = true) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) return "text-slate-500";
  const good = lowerIsBetter ? numeric < 0 : numeric > 0;
  return good ? "text-emerald-700" : "text-rose-700";
}

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

function Badge({ children, tone = "blue" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-black ${toneClass(tone)}`}>{children}</span>;
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

function MiniMetric({ label, before, after, delta, suffix = "" }: { label: string; before: any; after: any; delta?: any; suffix?: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
      <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-black text-slate-900">{fmt(before, suffix)} → {fmt(after, suffix)}</div>
      {delta !== undefined ? <div className={`text-[11px] font-black ${deltaTone(delta)}`}>Δ {fmt(delta, suffix)}</div> : null}
    </div>
  );
}



function cleanText(value: any) {
  return String(value ?? "").trim();
}

function isPreviewableImageUrl(value: any) {
  const url = cleanText(value);
  if (!url) return false;
  if (url.startsWith("data:image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/i.test(url) || /drive\.google\.com\/uc\?/i.test(url);
}

function EvidencePreview({ item }: { item: any }) {
  const url = cleanText(item?.url || item?.evidence_url);
  const previewUrl = cleanText(item?.image_preview_url || url);
  return (
    <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="aspect-[4/3] bg-slate-100">
        {isPreviewableImageUrl(previewUrl) ? (
          <img src={previewUrl} alt={item?.title || "Bukti Wellness"} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center px-5 text-center text-xs font-black text-slate-400">
            Preview langsung belum tersedia. Buka bukti bila link bukan gambar publik.
          </div>
        )}
      </div>
      <div className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-black text-slate-900">{item?.title || item?.type || "Bukti Wellness"}</div>
            <div className="mt-1 text-xs font-bold text-slate-400">{item?.date || "-"} · {item?.type || "Evidence"}</div>
          </div>
          <Badge tone="emerald">Gambar tersimpan sebagai URL</Badge>
        </div>
        {item?.notes ? <div className="line-clamp-2 text-xs font-semibold leading-5 text-slate-500">{item.notes}</div> : null}
        {url ? <a href={url} target="_blank" rel="noreferrer" className="inline-flex rounded-2xl bg-blue-600 px-4 py-2 text-xs font-black text-white">Buka bukti</a> : null}
      </div>
    </article>
  );
}

function EvidenceGallery({ items = [] }: { items?: any[] }) {
  const evidenceItems = Array.isArray(items) ? items : [];
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-lg font-black text-slate-900">Gallery Bukti / Foto</div>
          <div className="mt-1 text-xs font-bold text-slate-500">Foto makanan, bukti aktivitas, dan gambar healthtalk. File tetap di URL/Google Drive; aplikasi mencoba menampilkan gambar langsung.</div>
        </div>
        <Badge tone="blue">{evidenceItems.length} bukti</Badge>
      </div>
      {evidenceItems.length ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {evidenceItems.slice(0, 9).map((item: any) => <EvidencePreview key={item.key || item.id || item.url} item={item} />)}
        </div>
      ) : (
        <div className="mt-4 rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-bold text-slate-400">Belum ada link bukti untuk peserta ini.</div>
      )}
    </div>
  );
}

function RecentResponses({ items = [] }: { items?: any[] }) {
  const rows = Array.isArray(items) ? items : [];
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5">
        <div className="text-lg font-black text-slate-900">Riwayat Input Harian</div>
        <div className="mt-1 text-xs font-bold text-slate-500">Tampilan ringkas seperti form response, tetapi tetap berasal dari data aplikasi.</div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">Tanggal</th>
              <th className="px-4 py-3 text-left">Tipe</th>
              <th className="px-4 py-3 text-left">Isi Response</th>
              <th className="px-4 py-3 text-left">Kalori</th>
              <th className="px-4 py-3 text-left">Point</th>
              <th className="px-4 py-3 text-left">Bukti</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row: any) => (
              <tr key={row.id} className="align-top hover:bg-slate-50">
                <td className="px-4 py-3 font-bold text-slate-700">{row.date || "-"}</td>
                <td className="px-4 py-3"><Badge tone={row.type === "Nutrisi" ? "amber" : row.type === "Aktivitas" ? "emerald" : row.type === "Healthtalk" ? "purple" : "blue"}>{row.type}</Badge></td>
                <td className="px-4 py-3">
                  <div className="font-black text-slate-900">{row.title || "-"}</div>
                  <div className="mt-1 max-w-xl text-xs font-semibold leading-5 text-slate-500">{row.description || "-"}</div>
                </td>
                <td className="px-4 py-3 font-bold text-slate-600">{row.calories ? `${row.calories} kkal` : "-"}</td>
                <td className="px-4 py-3 font-black text-emerald-700">{Number(row.points || 0) ? `+${row.points}` : "-"}</td>
                <td className="px-4 py-3">{row.evidence_url ? <a href={row.evidence_url} target="_blank" rel="noreferrer" className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">Buka bukti</a> : <span className="text-xs font-bold text-slate-400">-</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <div className="p-8 text-center text-sm font-bold text-slate-400">Belum ada input harian untuk peserta ini.</div> : null}
      </div>
    </div>
  );
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
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-xl font-black text-slate-900">Grafik Parameter Per Peserta</div>
          <div className="mt-1 text-sm font-semibold text-slate-500">
            {participant.name} · {participant.code || "Tanpa kode"} · {participant.company_name || "-"} · {participant.group_name || "-"}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={riskTone(participant.risk_level)}>{participant.risk_group_name || participant.risk_label || "Monitoring"}</Badge>
          <Badge tone={participant.need_followup ? "rose" : "emerald"}>{participant.need_followup ? "Perlu follow-up" : "Stabil"}</Badge>
          <Badge tone="blue">Latest: {participant.latest_upload_date || "-"}</Badge>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MiniMetric label="BB" before={participant.baseline_weight_kg} after={participant.current_weight_kg} delta={participant.weight_delta_kg} suffix=" kg" />
        <MiniMetric label="BMI" before={participant.baseline_bmi} after={participant.bmi} delta={participant.bmi_delta} />
        <MiniMetric label="Tekanan Darah" before={fmtPair(participant.baseline_sbp, participant.baseline_dbp)} after={fmtPair(participant.sbp, participant.dbp)} delta={participant.sbp_delta} />
        <MiniMetric label="HbA1c" before={participant.baseline_hba1c} after={participant.hba1c} delta={participant.hba1c_delta} suffix="%" />
        <MiniMetric label="Point" before={0} after={participant.total_points || 0} delta={participant.total_points || 0} />
        <MiniMetric label="Bukti" before={0} after={participant.evidence_count || 0} delta={0} />
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
        <TrendChart title="Point harian" caption="Total point yang tercatat per tanggal" points={charts.points} series={[{ key: "value", label: "Point" }]} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_1fr]">
        <EvidenceGallery items={participant.evidence_gallery || []} />
        <RecentResponses items={participant.recent_responses || []} />
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
  const [message, setMessage] = useState("Memuat dashboard Wellness...");
  const [riskFilter, setRiskFilter] = useState("all");

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
    return rows.filter((row) => {
      const matchKeyword = !keyword || [row.name, row.code, row.company_name, row.group_name, row.old_group_name, row.risk_group_name, row.risk_label, row.bmi_status].filter(Boolean).join(" ").toLowerCase().includes(keyword);
      const matchRisk = riskFilter === "all" || row.risk_level === riskFilter || (riskFilter === "followup" && row.need_followup);
      return matchKeyword && matchRisk;
    });
  }, [rows, search, riskFilter]);

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

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-950 via-blue-950 to-emerald-900 shadow-sm">
        <div className="p-7 text-white">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-black uppercase tracking-wide ring-1 ring-white/20">Wellness Workspace</span>
                <span className="rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-black uppercase tracking-wide text-emerald-100 ring-1 ring-emerald-200/20">Isolated from MCU, CAPASKA, Vaksinasi</span>
              </div>
              <div className="text-3xl font-black">Wellness Command Center</div>
              <div className="mt-2 max-w-3xl text-sm font-medium text-blue-50">
                Satu workspace khusus Wellness untuk setting program, import peserta per group, history MCU, before-after, grafik per peserta, dan follow-up.
              </div>
            </div>
            <button onClick={load} disabled={loading} className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-black text-white shadow-sm disabled:opacity-60">
              {loading ? "Memuat..." : "Refresh Dashboard"}
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
        {workspaceMenu.map((item) => (
          <a key={item.href} href={item.href} className={`rounded-3xl border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${item.href === "/wellness/dashboard" ? "border-blue-500 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-900 hover:border-blue-200"}`}>
            <div className="text-sm font-black">{item.label}</div>
            <div className={`mt-1 text-xs font-semibold leading-5 ${item.href === "/wellness/dashboard" ? "text-blue-50" : "text-slate-500"}`}>{item.description}</div>
          </a>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        <StatCard label="Peserta" value={summary.total || 0} caption="Total program" />
        <StatCard label="High Risk" value={summary.high_risk || 0} tone="rose" caption="Prioritas follow-up" />
        <StatCard label="Medium Risk" value={summary.medium_risk || 0} tone="amber" caption="Pantau berkala" />
        <StatCard label="Perlu Follow-up" value={summary.need_followup || 0} tone="purple" caption="Alert klinis/program" />
        <StatCard label="Kepatuhan" value={`${summary.compliance_rate || 0}%`} tone="emerald" caption="Upload aktif" />
        <StatCard label="Avg Delta BB" value={fmt(summary.avg_weight_delta_kg, " kg")} tone="blue" caption={`${summary.improved_weight_count || 0} peserta turun BB`} />
        <StatCard label="Total Point" value={summary.total_points || 0} tone="purple" caption="Akumulasi engagement" />
        <StatCard label="Bukti Gambar" value={summary.evidence_count || 0} tone="amber" caption="URL bukti tampil di gallery" />
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-xl font-black text-slate-900">Pilih Peserta untuk Grafik Before-After</div>
            <div className="mt-1 text-sm font-semibold text-slate-500">{message}</div>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <input
              className="min-w-[260px] rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              placeholder="Cari nama, kode, perusahaan, risiko..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              value={riskFilter}
              onChange={(event) => setRiskFilter(event.target.value)}
            >
              <option value="all">Semua Risiko</option>
              <option value="high">High Risk</option>
              <option value="medium">Medium Risk</option>
              <option value="low">Low Risk</option>
              <option value="followup">Perlu Follow-up</option>
            </select>
            <select
              className="min-w-[300px] rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              value={selectedParticipantId}
              onChange={(event) => setSelectedParticipantId(event.target.value)}
            >
              {filteredRows.map((row) => (
                <option key={row.id} value={String(row.id)}>{row.code ? `${row.code} - ` : ""}{row.name} · {row.risk_group_name || row.risk_label || "Monitoring"} · {row.company_name || "-"} &gt; {row.group_name || "-"}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <ParticipantChartPanel participant={selectedParticipant} />

      <section className="rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xl font-black text-slate-900">Daftar Peserta Wellness</div>
            <div className="mt-1 text-sm font-semibold text-slate-500">{filteredRows.length} dari {rows.length} peserta ditampilkan</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/wellness/import" className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-black text-blue-700">Import Peserta</a>
            <a href="/wellness/history-import" className="rounded-2xl border border-purple-200 bg-purple-50 px-4 py-3 text-sm font-black text-purple-700">Import History MCU</a>
            <a href="/wellness/input" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-black text-rose-700">Input Harian</a>
            <a href="/api/wellness/export" className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white">Export Wellness</a>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1180px] w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Peserta</th>
                <th className="px-4 py-3 text-left">Scope Program</th>
                <th className="px-4 py-3 text-left">Baseline MCU</th>
                <th className="px-4 py-3 text-left">Progress Terakhir</th>
                <th className="px-4 py-3 text-left">Risiko</th>
                <th className="px-4 py-3 text-left">Aktivitas Hari Ini</th>
                <th className="px-4 py-3 text-left">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map((row) => (
                <tr key={row.id} className="align-top hover:bg-slate-50">
                  <td className="px-4 py-4">
                    <div className="font-black text-slate-950">{row.name || "-"}</div>
                    <div className="mt-1 text-xs font-semibold text-slate-400">Kode: {row.code || "-"}</div>
                    <div className="mt-2"><Badge tone={riskTone(row.risk_level)}>{row.risk_group_name || row.risk_label || "Monitoring"}</Badge></div>
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-600">
                    <div className="font-black text-slate-900">{row.company_name || "-"}</div>
                    <div className="mt-1 text-xs font-bold text-slate-500">Kelompok/Group: {row.group_name || "-"}</div>
                    {row.old_group_name && row.old_group_name !== "-" && row.old_group_name !== row.group_name ? <div className="mt-1 text-xs font-bold text-slate-400">Divisi/legacy: {row.old_group_name}</div> : null}
                  </td>
                  <td className="px-4 py-4">
                    <div className="grid gap-2">
                      <MiniMetric label="BB/BMI" before={row.baseline_weight_kg} after={row.baseline_bmi} suffix="" />
                      <div className="text-xs font-bold text-slate-500">TD {fmtPair(row.baseline_sbp, row.baseline_dbp)} · HbA1c {fmt(row.baseline_hba1c, "%")} · Gula {fmt(row.baseline_glucose)}</div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="grid gap-2">
                      <MiniMetric label="BB" before={row.baseline_weight_kg} after={row.current_weight_kg} delta={row.weight_delta_kg} suffix=" kg" />
                      <div className="text-xs font-bold text-slate-500">BMI {fmt(row.bmi)} · TD {fmtPair(row.sbp, row.dbp)} · HbA1c {fmt(row.hba1c, "%")}</div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="space-y-2">
                      <Badge tone={riskTone(row.risk_level)}>{row.risk_label || "Monitoring"}</Badge>
                      <div><Badge tone={row.need_followup ? "rose" : "emerald"}>{row.need_followup ? "Perlu follow-up" : "Tidak urgent"}</Badge></div>
                      <div className="text-xs font-bold text-slate-500">Kepatuhan: {row.compliance_status || "-"}</div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm font-bold text-slate-600">
                    <div>Makan: {row.calories_today || 0} kkal</div>
                    <div>Aktivitas: {row.activity_calories_today || 0} kkal</div>
                    <div className="mt-1 text-xs text-slate-400">Latest: {row.latest_upload_date || "-"}</div>
                  </td>
                  <td className="px-4 py-4">
                    <button type="button" onClick={() => setSelectedParticipantId(String(row.id))} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white shadow-sm hover:bg-blue-700">Lihat Grafik</button>
                    <a href="/wellness/input" className="mt-2 block rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-center text-xs font-black text-rose-700">Input</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredRows.length ? <div className="p-8 text-center text-sm font-semibold text-slate-500">Belum ada data Wellness.</div> : null}
        </div>
      </section>
    </div>
  );
}
