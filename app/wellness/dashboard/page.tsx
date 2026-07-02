"use client";

import WellnessQuickNav from "@/components/wellness/WellnessQuickNav";
import AuthGate from "@/components/AuthGate";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

// WELLNESS_DASHBOARD_LOOKER_STYLE_V408
// Redesign:
// - Dashboard dibuat lebih mirip Looker Studio: list/table sebagai pusat monitoring.
// - Nama peserta bisa diklik untuk masuk detail 1 peserta saja.
// - Activities Harian menampilkan Riwayat Activities, Riwayat Nutrisi, dan Trend Aktivitas Terbanyak.
// - Capaian Point dibuat ranking table + chart sederhana.
// - Grafik klinis tetap ada, tetapi tidak mendominasi tampilan utama.

type Tone = "slate" | "blue" | "emerald" | "amber" | "rose" | "purple";
type MainView = "overview" | "daily" | "ranking" | "clinical" | "points";
type DetailTab = "summary" | "history" | "nutrition" | "activity" | "healthtalk" | "evidence" | "clinical";

type TrendPoint = {
  label?: string;
  date?: string;
  value?: any;
  sbp?: any;
  dbp?: any;
  source?: string;
  [key: string]: any;
};

function cleanText(value: any) {
  return String(value ?? "").trim();
}

function toNumber(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(String(value).replace(",", "."));
  return Number.isFinite(numeric) ? numeric : null;
}

function fmt(value: any, suffix = "") {
  const text = cleanText(value);
  if (!text || text === "null" || text === "undefined") return "-";

  const numeric = toNumber(text);
  if (numeric !== null) {
    const display = Number.isInteger(numeric)
      ? String(numeric)
      : String(Math.round(numeric * 10) / 10);

    return `${display}${suffix ? ` ${suffix}` : ""}`;
  }

  return `${text}${suffix ? ` ${suffix}` : ""}`;
}

function fmtNumber(value: any) {
  const numeric = toNumber(value);
  if (numeric === null) return "-";

  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 1,
  }).format(numeric);
}

function fmtKkal(value: any) {
  const numeric = toNumber(value);
  if (numeric === null || numeric <= 0) return "-";

  return `${fmtNumber(numeric)} kkal`;
}

function fmtPoint(value: any) {
  const numeric = toNumber(value);
  if (numeric === null || numeric <= 0) return "-";

  return fmtNumber(numeric);
}

function shortDate(value: any) {
  const text = cleanText(value);
  if (!text) return "-";

  const raw = text.slice(0, 10);
  const parts = raw.split("-");

  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;

  return raw;
}

function shortTime(value: any) {
  const text = cleanText(value);
  if (!text) return "-";

  const match = text.match(/(\d{1,2}):(\d{2})/);
  if (match) return `${match[1].padStart(2, "0")}:${match[2]}`;

  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return "-";
}

function toneClass(tone: Tone) {
  const map: Record<Tone, string> = {
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
    amber: "border-amber-100 bg-amber-50 text-amber-800",
    rose: "border-rose-100 bg-rose-50 text-rose-700",
    purple: "border-purple-100 bg-purple-50 text-purple-700",
  };

  return map[tone] || map.slate;
}

function riskTone(value: any): Tone {
  const text = cleanText(value).toLowerCase();

  if (text.includes("tinggi") || text.includes("high") || text.includes("triple")) return "rose";
  if (text.includes("medium") || text.includes("sedang") || text.includes("obesity")) return "amber";
  if (text.includes("baik") || text.includes("normal") || text.includes("low")) return "emerald";

  return "blue";
}

function participantName(participant: any) {
  return (
    cleanText(participant?.participant_display_name) ||
    cleanText(participant?.participant_name) ||
    cleanText(participant?.name) ||
    `Peserta #${participant?.id || "-"}`
  );
}

function participantCode(participant: any) {
  return cleanText(participant?.code || participant?.employee_code || participant?.no_karyawan);
}

function participantGroup(participant: any) {
  return (
    cleanText(participant?.group_name) ||
    cleanText(participant?.kelompok_name) ||
    cleanText(participant?.group_unit_name) ||
    cleanText(participant?.old_group_name) ||
    "-"
  );
}

function participantCompany(participant: any) {
  return cleanText(participant?.company_name) || "-";
}

function participantRisk(participant: any) {
  return (
    cleanText(participant?.risk_group_name) ||
    cleanText(participant?.baseline_risk_group) ||
    cleanText(participant?.risk_label) ||
    cleanText(participant?.risk_level) ||
    "-"
  );
}

function responseDate(item: any) {
  return (
    cleanText(item?.date) ||
    cleanText(item?.log_date) ||
    cleanText(item?.event_date) ||
    cleanText(item?.created_at).slice(0, 10) ||
    "-"
  );
}

function responseTime(item: any) {
  return (
    cleanText(item?.time) ||
    cleanText(item?.log_time) ||
    shortTime(item?.created_at) ||
    "-"
  );
}

function responseType(item: any) {
  return (
    cleanText(item?.type) ||
    cleanText(item?.input_type) ||
    cleanText(item?.meal_time) ||
    cleanText(item?.activity_type) ||
    "-"
  );
}

function responseDetail(item: any) {
  return (
    cleanText(item?.detail) ||
    cleanText(item?.description) ||
    cleanText(item?.title) ||
    cleanText(item?.meal_text) ||
    cleanText(item?.food_name) ||
    cleanText(item?.activity_name) ||
    cleanText(item?.raw_payload?.["Detected Foods"]) ||
    cleanText(item?.raw_payload?.["Add Options"]) ||
    "-"
  );
}

function responseCalories(item: any) {
  return (
    toNumber(item?.calories) ??
    toNumber(item?.total_calories) ??
    toNumber(item?.activity_calories) ??
    toNumber(item?.raw_payload?.["Kalori Makanan"]) ??
    toNumber(item?.raw_payload?.["Kalori Aktivitas"]) ??
    null
  );
}

function responsePoints(item: any) {
  return (
    toNumber(item?.points) ??
    toNumber(item?.point) ??
    toNumber(item?.total_points) ??
    toNumber(item?.raw_payload?.["Total Point"]) ??
    null
  );
}

function isNutrition(item: any) {
  const text = `${responseType(item)} ${responseDetail(item)}`.toLowerCase();
  return text.includes("nutrisi") || text.includes("makan") || text.includes("food");
}

function isActivity(item: any) {
  const text = `${responseType(item)} ${responseDetail(item)}`.toLowerCase();
  return text.includes("aktivitas") || text.includes("activity") || text.includes("workout") || text.includes("jalan") || text.includes("run") || text.includes("walk");
}

function isHealthtalk(item: any) {
  const text = `${responseType(item)} ${responseDetail(item)}`.toLowerCase();
  return text.includes("healthtalk") || text.includes("health talk") || text.includes("seminar");
}

function safeResponses(participant: any) {
  return Array.isArray(participant?.recent_responses)
    ? participant.recent_responses
    : Array.isArray(participant?.daily_logs)
      ? participant.daily_logs
      : Array.isArray(participant?.responses)
        ? participant.responses
        : [];
}

function activityCount(participant: any) {
  const summary = participant?.activity_summary || participant?.activity_history || [];
  if (Array.isArray(summary) && summary.length) {
    return summary.reduce((sum: number, item: any) => {
      const count = toNumber(item?.count ?? item?.jumlah);
      return sum + (count || 1);
    }, 0);
  }

  return toNumber(participant?.activity_logs_count) || 0;
}

function nutritionCount(participant: any) {
  return toNumber(participant?.food_logs_count) || safeResponses(participant).filter(isNutrition).length;
}

function totalNutritionCalories(participant: any) {
  const chart = participant?.parameter_charts?.nutrition_calories || [];
  if (Array.isArray(chart) && chart.length) {
    return chart.reduce((sum: number, item: any) => sum + Number(item?.value || 0), 0);
  }

  return toNumber(participant?.calories_today) || 0;
}

function totalActivityCalories(participant: any) {
  const chart = participant?.parameter_charts?.activity_calories || [];
  if (Array.isArray(chart) && chart.length) {
    return chart.reduce((sum: number, item: any) => sum + Number(item?.value || 0), 0);
  }

  return toNumber(participant?.activity_calories_today) || 0;
}

function allResponses(participants: any[] = []) {
  const list: any[] = [];

  for (const participant of participants || []) {
    for (const item of safeResponses(participant)) {
      list.push({
        ...item,
        participant_id: participant.id,
        participant_name: participantName(participant),
        participant_code: participantCode(participant),
        group_name: participantGroup(participant),
      });
    }
  }

  return list.sort((a, b) => {
    const aa = `${responseDate(a)} ${responseTime(a)}`;
    const bb = `${responseDate(b)} ${responseTime(b)}`;
    return bb.localeCompare(aa);
  });
}

function buildActivityTrend(participants: any[] = []) {
  const map = new Map<string, any>();

  for (const participant of participants || []) {
    const summary = participant?.activity_summary || participant?.activity_history || [];

    if (Array.isArray(summary) && summary.length) {
      for (const item of summary) {
        const name =
          cleanText(item?.activity_name) ||
          cleanText(item?.nama_activities) ||
          "Aktivitas";

        const key = name.toLowerCase();
        const current = map.get(key) || {
          name,
          count: 0,
          duration: 0,
          calories: 0,
        };

        current.count += toNumber(item?.count ?? item?.jumlah) || 1;
        current.duration += toNumber(item?.duration_minutes) || 0;
        current.calories += toNumber(item?.calories) || 0;

        map.set(key, current);
      }
    }
  }

  if (!map.size) {
    for (const item of allResponses(participants).filter(isActivity)) {
      const name = responseDetail(item);
      const key = name.toLowerCase();

      const current = map.get(key) || {
        name,
        count: 0,
        duration: 0,
        calories: 0,
      };

      current.count += 1;
      current.calories += responseCalories(item) || 0;

      map.set(key, current);
    }
  }

  return [...map.values()]
    .sort((a, b) => Number(b.count || 0) - Number(a.count || 0))
    .slice(0, 10);
}

function buildPointBreakdown(participant: any) {
  const responses = safeResponses(participant);

  const nutrition = responses.filter(isNutrition).reduce((sum: number, item: any) => sum + (responsePoints(item) || 0), 0);
  const activity = responses.filter(isActivity).reduce((sum: number, item: any) => sum + (responsePoints(item) || 0), 0);
  const healthtalk = responses.filter(isHealthtalk).reduce((sum: number, item: any) => sum + (responsePoints(item) || 0), 0);
  const total = toNumber(participant?.total_points) || nutrition + activity + healthtalk;

  return {
    nutrition,
    activity,
    healthtalk,
    total,
  };
}

function googleDrivePreviewUrl(value: any) {
  const url = cleanText(value);
  if (!url) return "";

  if (url.match(/\.(jpg|jpeg|png|webp|gif)(\?|#|$)/i)) return url;
  if (url.includes("googleusercontent.com")) return url;
  if (url.includes("drive.google.com/uc?")) return url;
  if (url.includes("drive.google.com/thumbnail")) return url;

  const fileMatch = url.match(/\/file\/d\/([^/]+)/);
  if (fileMatch?.[1]) return `https://drive.google.com/uc?export=view&id=${fileMatch[1]}`;

  const idMatch = url.match(/[?&]id=([^&]+)/);
  if (idMatch?.[1]) return `https://drive.google.com/uc?export=view&id=${idMatch[1]}`;

  return url;
}

function Badge({ children, tone = "blue" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-black ${toneClass(tone)}`}>
      {children}
    </span>
  );
}

function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[1.5rem] border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </section>
  );
}

function SectionHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-black text-slate-950">{title}</h2>
        {subtitle ? <p className="mt-1 text-xs font-bold text-slate-400">{subtitle}</p> : null}
      </div>
      {right}
    </div>
  );
}

function StatCard({
  label,
  value,
  caption,
  tone = "slate",
}: {
  label: string;
  value: any;
  caption?: string;
  tone?: Tone;
}) {
  return (
    <div className={`rounded-[1.25rem] border p-4 ${toneClass(tone)}`}>
      <div className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">
        {label}
      </div>
      <div className="mt-2 text-2xl font-black">{value ?? "-"}</div>
      {caption ? <div className="mt-1 text-xs font-bold opacity-70">{caption}</div> : null}
    </div>
  );
}

function NavButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-xs font-black transition ${
        active
          ? "bg-blue-600 text-white shadow-lg shadow-blue-100"
          : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}

function DetailTabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-black transition ${
        active
          ? "bg-slate-950 text-white"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {label}
    </button>
  );
}

function EmptyState({ text = "Belum ada data." }: { text?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-bold text-slate-400">
      {text}
    </div>
  );
}

function HorizontalBars({
  items = [],
  valueKey = "value",
  labelKey = "label",
  suffix = "",
}: {
  items?: any[];
  valueKey?: string;
  labelKey?: string;
  suffix?: string;
}) {
  const maxValue = Math.max(...items.map((item) => Number(item?.[valueKey] || 0)), 1);

  if (!items.length) return <EmptyState text="Belum ada data trend." />;

  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const value = Number(item?.[valueKey] || 0);
        const width = Math.max(4, Math.round((value / maxValue) * 100));

        return (
          <div key={`${item?.[labelKey] || index}-${index}`}>
            <div className="mb-1 flex items-center justify-between gap-3 text-xs">
              <div className="line-clamp-1 font-black text-slate-700">
                {index + 1}. {item?.[labelKey] || "-"}
              </div>
              <div className="shrink-0 font-black text-slate-900">
                {fmtNumber(value)}{suffix ? ` ${suffix}` : ""}
              </div>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-blue-500"
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MiniLineChart({
  title,
  points = [],
  valueKey = "value",
  suffix = "",
}: {
  title: string;
  points?: TrendPoint[];
  valueKey?: string;
  suffix?: string;
}) {
  const safePoints = Array.isArray(points) ? points.filter(Boolean).slice(-12) : [];
  const values = safePoints
    .map((point) => toNumber((point as any)?.[valueKey]))
    .filter((value): value is number => value !== null);

  if (!safePoints.length || !values.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-black text-slate-900">{title}</div>
        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs font-bold text-slate-400">
          Belum ada data grafik.
        </div>
      </div>
    );
  }

  const width = 360;
  const height = 110;
  const padX = 22;
  const padY = 18;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  function x(index: number) {
    if (safePoints.length <= 1) return width / 2;
    return padX + (index / (safePoints.length - 1)) * (width - padX * 2);
  }

  function y(value: any) {
    const numeric = toNumber(value);
    if (numeric === null) return height / 2;
    return padY + ((max - numeric) / range) * (height - padY * 2);
  }

  const path = safePoints
    .map((point, index) => {
      const px = x(index);
      const py = y((point as any)?.[valueKey]);
      return `${index === 0 ? "M" : "L"} ${px} ${py}`;
    })
    .join(" ");

  const latest = values[values.length - 1];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-black text-slate-900">{title}</div>
        <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
          {fmt(latest, suffix)}
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 h-[120px] w-full">
        <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke="#e2e8f0" strokeWidth="2" />
        <path d={path} fill="none" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {safePoints.map((point, index) => (
          <circle
            key={`${index}-${point?.date || point?.label}`}
            cx={x(index)}
            cy={y((point as any)?.[valueKey])}
            r="4.5"
            fill="#2563eb"
            stroke="white"
            strokeWidth="2"
          >
            <title>
              {`${point?.label || point?.date || "Data"}: ${fmt((point as any)?.[valueKey], suffix)}`}
            </title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

function ParticipantsTable({
  participants,
  onSelect,
}: {
  participants: any[];
  onSelect: (participant: any) => void;
}) {
  if (!participants.length) return <EmptyState text="Belum ada peserta." />;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <div className="max-h-[520px] overflow-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-blue-50 text-xs uppercase tracking-wide text-slate-700">
            <tr>
              <th className="w-12 px-4 py-3">No</th>
              <th className="min-w-[220px] px-4 py-3">Nama Peserta</th>
              <th className="min-w-[120px] px-4 py-3">Kelompok</th>
              <th className="px-4 py-3">BMI</th>
              <th className="px-4 py-3">Tensi</th>
              <th className="px-4 py-3">Makan</th>
              <th className="px-4 py-3">Aktivitas</th>
              <th className="px-4 py-3">Point</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {participants.map((participant, index) => (
              <tr key={participant.id || index} className="hover:bg-blue-50/40">
                <td className="px-4 py-3 font-bold text-slate-500">{index + 1}.</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onSelect(participant)}
                    className="text-left font-black text-blue-700 hover:underline"
                  >
                    {participantName(participant)}
                  </button>
                  <div className="mt-0.5 text-xs font-bold text-slate-400">
                    {participantCode(participant) || "-"} • {participantCompany(participant)}
                  </div>
                </td>
                <td className="px-4 py-3 font-bold text-slate-600">{participantGroup(participant)}</td>
                <td className="px-4 py-3 font-black text-slate-900">{fmt(participant?.bmi)}</td>
                <td className="px-4 py-3 font-bold text-slate-600">
                  {participant?.sbp || participant?.dbp ? `${participant?.sbp || "-"}/${participant?.dbp || "-"}` : "-"}
                </td>
                <td className="px-4 py-3 font-bold text-slate-700">{fmtKkal(participant?.calories_today)}</td>
                <td className="px-4 py-3 font-bold text-slate-700">{fmtKkal(participant?.activity_calories_today)}</td>
                <td className="px-4 py-3 font-black text-violet-700">{fmtPoint(participant?.total_points)}</td>
                <td className="px-4 py-3">
                  <Badge tone={riskTone(participantRisk(participant))}>
                    {participant?.compliance_status || participantRisk(participant)}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RankingTable({
  title,
  participants,
  valueLabel,
  valueGetter,
  onSelect,
  tone = "blue",
}: {
  title: string;
  participants: any[];
  valueLabel: string;
  valueGetter: (participant: any) => number;
  onSelect: (participant: any) => void;
  tone?: Tone;
}) {
  const rows = [...participants]
    .map((participant) => ({
      participant,
      value: valueGetter(participant) || 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 25);

  return (
    <Card className="p-5">
      <SectionHeader title={title} right={<Badge tone={tone}>{rows.length} peserta</Badge>} />
      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
        <div className="max-h-[440px] overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-blue-50 text-xs uppercase tracking-wide text-slate-700">
              <tr>
                <th className="w-12 px-4 py-3">No</th>
                <th className="px-4 py-3">Nama Peserta</th>
                <th className="px-4 py-3">{valueLabel}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, index) => (
                <tr key={`${row.participant.id}-${index}`} className="hover:bg-blue-50/40">
                  <td className="px-4 py-3 font-bold text-slate-500">{index + 1}.</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onSelect(row.participant)}
                      className="text-left font-black text-slate-800 hover:text-blue-700 hover:underline"
                    >
                      {participantName(row.participant)}
                    </button>
                    <div className="text-xs font-bold text-slate-400">
                      {participantGroup(row.participant)}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-black text-slate-900">{fmtNumber(row.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

function RecentTable({
  title,
  items,
  type,
}: {
  title: string;
  items: any[];
  type: "nutrition" | "activity" | "healthtalk" | "all";
}) {
  let rows = items || [];
  if (type === "nutrition") rows = rows.filter(isNutrition);
  if (type === "activity") rows = rows.filter(isActivity);
  if (type === "healthtalk") rows = rows.filter(isHealthtalk);

  rows = rows.slice(0, 100);

  return (
    <Card className="p-5">
      <SectionHeader title={title} right={<Badge tone="blue">{rows.length} data</Badge>} />

      {!rows.length ? (
        <div className="mt-4">
          <EmptyState text="Belum ada data." />
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
          <div className="max-h-[440px] overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-blue-50 text-xs uppercase tracking-wide text-slate-700">
                <tr>
                  <th className="w-12 px-4 py-3">No</th>
                  <th className="px-4 py-3">Tanggal</th>
                  {"participant_name" in (rows[0] || {}) ? <th className="px-4 py-3">Nama Peserta</th> : null}
                  <th className="px-4 py-3">Tipe</th>
                  <th className="min-w-[260px] px-4 py-3">Detail</th>
                  <th className="px-4 py-3">Kalori</th>
                  <th className="px-4 py-3">Point</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {rows.map((item, index) => (
                  <tr key={item?.id || `${responseDate(item)}-${index}`} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-slate-500">{index + 1}.</td>
                    <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-700">
                      {shortDate(responseDate(item))}
                      <div className="text-xs text-slate-400">{responseTime(item)}</div>
                    </td>
                    {"participant_name" in item ? (
                      <td className="px-4 py-3 font-black text-slate-800">{item.participant_name}</td>
                    ) : null}
                    <td className="whitespace-nowrap px-4 py-3 font-black text-slate-900">{responseType(item)}</td>
                    <td className="px-4 py-3 font-semibold leading-6 text-slate-600">{responseDetail(item)}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-black text-blue-700">{fmtKkal(responseCalories(item))}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-black text-violet-700">{fmtPoint(responsePoints(item))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}

function EvidenceGallery({ participant }: { participant: any }) {
  const items = Array.isArray(participant?.evidence_gallery)
    ? participant.evidence_gallery
    : Array.isArray(participant?.evidence)
      ? participant.evidence
      : [];

  const rows = items.filter((item: any) =>
    cleanText(item?.url || item?.evidence_url || item?.photo_url || item?.image_url)
  );

  return (
    <Card className="p-5">
      <SectionHeader title="Evidence Gallery" subtitle="Foto makanan, workout, dan Health Talk." right={<Badge tone="purple">{rows.length} bukti</Badge>} />

      {!rows.length ? (
        <div className="mt-4">
          <EmptyState text="Belum ada evidence." />
        </div>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.slice(0, 12).map((item: any, index: number) => {
            const rawUrl = cleanText(item?.url || item?.evidence_url || item?.photo_url || item?.image_url);
            const preview = googleDrivePreviewUrl(rawUrl);

            return (
              <div key={`${rawUrl}-${index}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-4 py-3">
                  <div className="line-clamp-1 text-sm font-black text-slate-900">
                    {item?.title || item?.type || "Evidence"}
                  </div>
                  <div className="text-xs font-bold text-slate-400">
                    {shortDate(item?.date || item?.log_date || item?.created_at)}
                  </div>
                </div>

                <div className="bg-slate-50 p-3">
                  {preview ? (
                    <img
                      src={preview}
                      alt={item?.title || "Evidence"}
                      className="h-44 w-full rounded-xl object-cover"
                      onError={(event) => {
                        (event.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="flex h-44 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white text-xs font-bold text-slate-400">
                      Preview tidak tersedia.
                    </div>
                  )}
                </div>

                <div className="px-4 py-3">
                  <a
                    href={rawUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-black text-blue-700 hover:underline"
                  >
                    Buka bukti
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function ClinicalPanel({ participant }: { participant: any }) {
  const charts = participant?.parameter_charts || {};

  return (
    <Card className="p-5">
      <SectionHeader title="Monitoring Klinis" subtitle="Grafik ringkas per parameter peserta." />

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MiniLineChart title="Berat Badan" points={charts.weight_kg || []} suffix="kg" />
        <MiniLineChart title="BMI" points={charts.bmi || []} />
        <MiniLineChart title="Lingkar Perut" points={charts.waist_cm || []} suffix="cm" />
        <MiniLineChart title="HbA1c" points={charts.hba1c || []} suffix="%" />
        <MiniLineChart title="Gula Darah" points={charts.glucose || []} suffix="mg/dL" />
        <MiniLineChart title="Point Harian" points={charts.points || []} />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <MiniLineChart title="Kalori Nutrisi" points={charts.nutrition_calories || []} suffix="kkal" />
        <MiniLineChart title="Kalori Aktivitas" points={charts.activity_calories || []} suffix="kkal" />
      </div>
    </Card>
  );
}

function ParticipantDetail({
  participant,
  activeTab,
  setActiveTab,
  onBack,
}: {
  participant: any;
  activeTab: DetailTab;
  setActiveTab: (tab: DetailTab) => void;
  onBack: () => void;
}) {
  const responses = safeResponses(participant);
  const point = buildPointBreakdown(participant);

  return (
    <div className="space-y-5">
      <Card className="p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <button
              type="button"
              onClick={onBack}
              className="mb-4 rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-200"
            >
              ← Kembali ke semua peserta
            </button>

            <div className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">
              Detail Peserta
            </div>
            <h1 className="mt-2 text-3xl font-black text-slate-950">{participantName(participant)}</h1>
            <p className="mt-2 text-sm font-bold text-slate-500">
              {participantCode(participant) || "-"} • {participantCompany(participant)} • {participantGroup(participant)}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge tone={riskTone(participantRisk(participant))}>{participantRisk(participant)}</Badge>
            <Badge tone="blue">{participant?.compliance_status || "Status -"}</Badge>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Total Point" value={fmtPoint(participant?.total_points)} tone="amber" caption="Akumulasi point" />
          <StatCard label="Kalori Makan" value={fmtKkal(totalNutritionCalories(participant))} tone="blue" caption="Akumulasi dari log" />
          <StatCard label="Kalori Aktivitas" value={fmtKkal(totalActivityCalories(participant))} tone="emerald" caption="Workout/device/manual" />
          <StatCard label="BMI" value={fmt(participant?.bmi)} tone={riskTone(participantRisk(participant))} caption={participant?.bmi_status || "Status BMI"} />
          <StatCard label="Tensi" value={participant?.sbp || participant?.dbp ? `${participant?.sbp || "-"}/${participant?.dbp || "-"}` : "-"} tone="purple" caption="mmHg" />
        </div>

        <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
          <DetailTabButton active={activeTab === "summary"} label="Ringkasan" onClick={() => setActiveTab("summary")} />
          <DetailTabButton active={activeTab === "history"} label="Riwayat Harian" onClick={() => setActiveTab("history")} />
          <DetailTabButton active={activeTab === "nutrition"} label="Nutrisi" onClick={() => setActiveTab("nutrition")} />
          <DetailTabButton active={activeTab === "activity"} label="Aktivitas" onClick={() => setActiveTab("activity")} />
          <DetailTabButton active={activeTab === "healthtalk"} label="Health Talk" onClick={() => setActiveTab("healthtalk")} />
          <DetailTabButton active={activeTab === "clinical"} label="Monitoring Klinis" onClick={() => setActiveTab("clinical")} />
          <DetailTabButton active={activeTab === "evidence"} label="Evidence" onClick={() => setActiveTab("evidence")} />
        </div>
      </Card>

      {activeTab === "summary" ? (
        <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="p-5">
            <SectionHeader title="Breakdown Point" subtitle="Membantu mengecek sumber point peserta." />
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <StatCard label="Nutrisi" value={fmtPoint(point.nutrition)} tone="blue" caption="+5 setiap laporan nutrisi" />
              <StatCard label="Aktivitas" value={fmtPoint(point.activity)} tone="emerald" caption="Point dari aktivitas/evidence" />
              <StatCard label="Health Talk" value={fmtPoint(point.healthtalk)} tone="purple" caption="Online +10, Offline +20 dengan bukti" />
              <StatCard label="Total" value={fmtPoint(point.total)} tone="amber" caption="Total point peserta" />
            </div>
          </Card>

          <Card className="p-5">
            <SectionHeader title="Aktivitas Peserta" subtitle="Jenis aktivitas yang paling sering dilakukan." />
            <div className="mt-5">
              <HorizontalBars
                items={(participant?.activity_summary || participant?.activity_history || []).map((item: any) => ({
                  label: item?.activity_name || item?.nama_activities || "Aktivitas",
                  value: item?.count || item?.jumlah || 1,
                })).slice(0, 8)}
                labelKey="label"
                valueKey="value"
                suffix="x"
              />
            </div>
          </Card>
        </div>
      ) : null}

      {activeTab === "history" ? <RecentTable title="Riwayat Input Harian Peserta" items={responses} type="all" /> : null}
      {activeTab === "nutrition" ? <RecentTable title="Riwayat Nutrisi Peserta" items={responses} type="nutrition" /> : null}
      {activeTab === "activity" ? <RecentTable title="Riwayat Aktivitas Peserta" items={responses} type="activity" /> : null}
      {activeTab === "healthtalk" ? <RecentTable title="Riwayat Health Talk Peserta" items={responses} type="healthtalk" /> : null}
      {activeTab === "clinical" ? <ClinicalPanel participant={participant} /> : null}
      {activeTab === "evidence" ? <EvidenceGallery participant={participant} /> : null}
    </div>
  );
}

function OverviewPage({
  participants,
  onSelect,
}: {
  participants: any[];
  onSelect: (participant: any) => void;
}) {
  const topActivity = [...participants]
    .map((participant) => ({
      participant,
      value: activityCount(participant),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const topPoint = [...participants]
    .map((participant) => ({
      participant,
      value: toNumber(participant?.total_points) || 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  return (
    <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
      <Card className="p-5">
        <SectionHeader
          title="Daftar Peserta Wellness"
          subtitle="Klik nama peserta untuk melihat seluruh data peserta tersebut saja."
          right={<Badge tone="blue">{participants.length} peserta</Badge>}
        />
        <div className="mt-4">
          <ParticipantsTable participants={participants} onSelect={onSelect} />
        </div>
      </Card>

      <div className="space-y-5">
        <Card className="p-5">
          <SectionHeader title="Ranking Olahraga" subtitle="Peserta paling aktif berdasarkan jumlah aktivitas." />
          <div className="mt-4 space-y-3">
            {topActivity.map((row, index) => (
              <button
                key={`${row.participant.id}-${index}`}
                type="button"
                onClick={() => onSelect(row.participant)}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-left hover:bg-blue-50"
              >
                <div>
                  <div className="text-sm font-black text-slate-900">{index + 1}. {participantName(row.participant)}</div>
                  <div className="text-xs font-bold text-slate-400">{participantGroup(row.participant)}</div>
                </div>
                <div className="text-lg font-black text-blue-700">{fmtNumber(row.value)}</div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <SectionHeader title="Capaian Point" subtitle="Peserta dengan point tertinggi." />
          <div className="mt-4 space-y-3">
            {topPoint.map((row, index) => (
              <button
                key={`${row.participant.id}-${index}`}
                type="button"
                onClick={() => onSelect(row.participant)}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-left hover:bg-amber-50"
              >
                <div>
                  <div className="text-sm font-black text-slate-900">{index + 1}. {participantName(row.participant)}</div>
                  <div className="text-xs font-bold text-slate-400">{participantGroup(row.participant)}</div>
                </div>
                <div className="text-lg font-black text-amber-700">{fmtPoint(row.value)}</div>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function DailyPage({
  participants,
}: {
  participants: any[];
}) {
  const responses = allResponses(participants);
  const activities = responses.filter(isActivity);
  const nutrition = responses.filter(isNutrition);
  const trend = buildActivityTrend(participants);

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <RecentTable title="Riwayat Activities" items={activities} type="all" />
        <RecentTable title="Riwayat Nutrisi" items={nutrition} type="all" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="p-5">
          <SectionHeader
            title="Trend Aktivitas Terbanyak"
            subtitle="Jenis aktivitas yang paling sering tercatat dari peserta."
            right={<Badge tone="emerald">{trend.length} jenis</Badge>}
          />
          <div className="mt-5">
            <HorizontalBars items={trend} labelKey="name" valueKey="count" suffix="x" />
          </div>
        </Card>

        <Card className="p-5">
          <SectionHeader
            title="Durasi & Kalori Aktivitas"
            subtitle="Ringkasan aktivitas terbanyak, termasuk durasi dan kalori bila tersedia."
          />
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-blue-50 text-xs uppercase tracking-wide text-slate-700">
                <tr>
                  <th className="w-12 px-4 py-3">No</th>
                  <th className="px-4 py-3">Aktivitas</th>
                  <th className="px-4 py-3">Jumlah</th>
                  <th className="px-4 py-3">Durasi</th>
                  <th className="px-4 py-3">Kalori</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {trend.map((item, index) => (
                  <tr key={`${item.name}-${index}`}>
                    <td className="px-4 py-3 font-bold text-slate-500">{index + 1}.</td>
                    <td className="px-4 py-3 font-black text-slate-900">{item.name}</td>
                    <td className="px-4 py-3 font-black text-blue-700">{fmtNumber(item.count)}x</td>
                    <td className="px-4 py-3 font-bold text-slate-600">{fmt(item.duration, "menit")}</td>
                    <td className="px-4 py-3 font-bold text-slate-600">{fmtKkal(item.calories)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

function RankingPage({
  participants,
  onSelect,
}: {
  participants: any[];
  onSelect: (participant: any) => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <RankingTable
        title="Ranking Olahraga"
        participants={participants}
        valueLabel="Jumlah Aktivitas"
        valueGetter={activityCount}
        onSelect={onSelect}
        tone="emerald"
      />

      <RankingTable
        title="Ranking Nutrisi"
        participants={participants}
        valueLabel="Input Nutrisi"
        valueGetter={nutritionCount}
        onSelect={onSelect}
        tone="blue"
      />

      <RankingTable
        title="Ranking Point"
        participants={participants}
        valueLabel="Total Point"
        valueGetter={(participant) => toNumber(participant?.total_points) || 0}
        onSelect={onSelect}
        tone="amber"
      />
    </div>
  );
}

function ClinicalListPage({
  participants,
  onSelect,
}: {
  participants: any[];
  onSelect: (participant: any) => void;
}) {
  const obesityRows = participants
    .filter((participant) => {
      const bmi = toNumber(participant?.bmi);
      return bmi !== null && bmi >= 30;
    })
    .sort((a, b) => Number(b.bmi || 0) - Number(a.bmi || 0));

  const overweightRows = participants
    .filter((participant) => {
      const bmi = toNumber(participant?.bmi);
      return bmi !== null && bmi >= 25 && bmi < 30;
    })
    .sort((a, b) => Number(b.bmi || 0) - Number(a.bmi || 0));

  const bpRows = participants
    .filter((participant) => {
      const sbp = toNumber(participant?.sbp);
      const dbp = toNumber(participant?.dbp);
      return (sbp !== null && sbp >= 140) || (dbp !== null && dbp >= 90);
    })
    .sort((a, b) => Number(b.sbp || 0) - Number(a.sbp || 0));

  function ClinicalTable({ title, rows }: { title: string; rows: any[] }) {
    return (
      <Card className="p-5">
        <SectionHeader title={title} right={<Badge tone="rose">{rows.length} peserta</Badge>} />
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
          <div className="max-h-[360px] overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-blue-50 text-xs uppercase tracking-wide text-slate-700">
                <tr>
                  <th className="w-12 px-4 py-3">No</th>
                  <th className="px-4 py-3">Nama</th>
                  <th className="px-4 py-3">Kelompok</th>
                  <th className="px-4 py-3">BMI</th>
                  <th className="px-4 py-3">Tensi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((participant, index) => (
                  <tr key={`${participant.id}-${index}`} className="hover:bg-blue-50/40">
                    <td className="px-4 py-3 font-bold text-slate-500">{index + 1}.</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onSelect(participant)}
                        className="font-black text-blue-700 hover:underline"
                      >
                        {participantName(participant)}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-600">{participantGroup(participant)}</td>
                    <td className="px-4 py-3 font-black text-slate-900">{fmt(participant?.bmi)}</td>
                    <td className="px-4 py-3 font-bold text-slate-600">
                      {participant?.sbp || participant?.dbp ? `${participant?.sbp || "-"}/${participant?.dbp || "-"}` : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <ClinicalTable title="Monitoring BMI Obesitas" rows={obesityRows} />
      <ClinicalTable title="Monitoring BMI Overweight" rows={overweightRows} />
      <ClinicalTable title="Monitoring Tekanan Darah" rows={bpRows} />
    </div>
  );
}

function PointsPage({
  participants,
  onSelect,
}: {
  participants: any[];
  onSelect: (participant: any) => void;
}) {
  const rows = [...participants]
    .map((participant) => ({
      participant,
      point: toNumber(participant?.total_points) || 0,
      breakdown: buildPointBreakdown(participant),
    }))
    .sort((a, b) => b.point - a.point);

  const bars = rows.slice(0, 40).map((row) => ({
    label: participantName(row.participant),
    value: row.point,
  }));

  return (
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <Card className="p-5">
        <SectionHeader title="Grafik Capaian Point" subtitle="Ranking total point seluruh peserta." />
        <div className="mt-5">
          <HorizontalBars items={bars} labelKey="label" valueKey="value" />
        </div>
      </Card>

      <Card className="p-5">
        <SectionHeader title="Capaian Point" subtitle="Klik nama untuk melihat detail sumber point." right={<Badge tone="amber">{rows.length} peserta</Badge>} />
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
          <div className="max-h-[560px] overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-blue-50 text-xs uppercase tracking-wide text-slate-700">
                <tr>
                  <th className="w-12 px-4 py-3">No</th>
                  <th className="px-4 py-3">Nama Peserta</th>
                  <th className="px-4 py-3">Nutrisi</th>
                  <th className="px-4 py-3">Aktivitas</th>
                  <th className="px-4 py-3">Health Talk</th>
                  <th className="px-4 py-3">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, index) => (
                  <tr key={`${row.participant.id}-${index}`} className="hover:bg-amber-50/50">
                    <td className="px-4 py-3 font-bold text-slate-500">{index + 1}.</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onSelect(row.participant)}
                        className="font-black text-blue-700 hover:underline"
                      >
                        {participantName(row.participant)}
                      </button>
                      <div className="text-xs font-bold text-slate-400">{participantGroup(row.participant)}</div>
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-600">{fmtPoint(row.breakdown.nutrition)}</td>
                    <td className="px-4 py-3 font-bold text-slate-600">{fmtPoint(row.breakdown.activity)}</td>
                    <td className="px-4 py-3 font-bold text-slate-600">{fmtPoint(row.breakdown.healthtalk)}</td>
                    <td className="px-4 py-3 font-black text-amber-700">{fmtPoint(row.point)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default function WellnessDashboardPage() {
  return <AuthGate>{() => <WellnessDashboard />}</AuthGate>;
}

function WellnessDashboard() {
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Memuat dashboard Wellness...");
  const [search, setSearch] = useState("");
  const [mainView, setMainView] = useState<MainView>("overview");
  const [selectedId, setSelectedId] = useState<any>("");
  const [detailTab, setDetailTab] = useState<DetailTab>("summary");

  async function load() {
    setLoading(true);
    setMessage("Memuat dashboard Wellness...");

    const result = await fetch("/api/wellness/dashboard", { cache: "no-store" })
      .then((response) => response.json())
      .catch((error) => ({
        ok: false,
        message: error?.message || "Gagal memuat dashboard.",
      }));

    setData(result || {});
    setMessage(result?.message || "Dashboard berhasil dimuat.");
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const participants = useMemo(() => {
    return data?.participants || data?.rows || data?.data || [];
  }, [data]);

  const filteredParticipants = useMemo(() => {
    const q = cleanText(search).toLowerCase();

    if (!q) return participants;

    return participants.filter((participant: any) => {
      const haystack = [
        participantName(participant),
        participantCode(participant),
        participantGroup(participant),
        participantCompany(participant),
        participantRisk(participant),
        participant?.compliance_status,
      ]
        .map(cleanText)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [participants, search]);

  const selectedParticipant = useMemo(() => {
    if (!selectedId) return null;

    return participants.find((participant: any) => String(participant.id) === String(selectedId)) || null;
  }, [participants, selectedId]);

  const summary = data?.summary || {};
  const totalParticipants = summary.total ?? summary.total_participants ?? participants.length;
  const activeParticipants = summary.active ?? summary.active_participants ?? "-";
  const totalFoodCaloriesToday = summary.total_food_calories_today ?? 0;
  const totalActivityCaloriesToday = summary.total_activity_calories_today ?? 0;
  const totalPoints = summary.total_points ?? 0;

  function openParticipant(participant: any) {
    setSelectedId(participant.id);
    setDetailTab("summary");
  }

  function closeParticipant() {
    setSelectedId("");
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900 md:px-8">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <WellnessQuickNav />

        <Card className="p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">
                Wellness Monitoring
              </div>
              <h1 className="mt-2 text-3xl font-black text-slate-950">
                Dashboard Wellness
              </h1>
              <p className="mt-1 text-sm font-bold text-slate-500">
                Tampilan list-first: pilih peserta dari tabel, lalu lihat detail peserta secara fokus.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <a href="/wellness/input" className="rounded-full bg-blue-600 px-5 py-3 text-xs font-black text-white">
                Input Harian
              </a>
              <a href="/wellness/nakes-input" className="rounded-full bg-slate-900 px-5 py-3 text-xs font-black text-white">
                Input NAKES
              </a>
              <button
                type="button"
                onClick={load}
                className="rounded-full bg-white px-5 py-3 text-xs font-black text-slate-700 ring-1 ring-slate-200"
              >
                {loading ? "Memuat..." : "Refresh"}
              </button>
            </div>
          </div>
        </Card>

        {!selectedParticipant ? (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <StatCard label="Peserta" value={fmtNumber(totalParticipants)} tone="blue" caption="Total peserta" />
              <StatCard label="Aktif" value={fmtNumber(activeParticipants)} tone="emerald" caption="Peserta dengan input" />
              <StatCard label="Kalori Makan Hari Ini" value={fmtKkal(totalFoodCaloriesToday)} tone="blue" caption="Akumulasi harian" />
              <StatCard label="Kalori Aktivitas Hari Ini" value={fmtKkal(totalActivityCaloriesToday)} tone="purple" caption="Workout/device/manual" />
              <StatCard label="Point" value={fmtPoint(totalPoints)} tone="amber" caption="Akumulasi point" />
            </section>

            <Card className="p-4">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex gap-2 overflow-x-auto pb-1">
                  <NavButton active={mainView === "overview"} label="Dashboard Utama" onClick={() => setMainView("overview")} />
                  <NavButton active={mainView === "daily"} label="Activities Harian" onClick={() => setMainView("daily")} />
                  <NavButton active={mainView === "ranking"} label="Ranking" onClick={() => setMainView("ranking")} />
                  <NavButton active={mainView === "clinical"} label="Monitoring Klinis" onClick={() => setMainView("clinical")} />
                  <NavButton active={mainView === "points"} label="Capaian Point" onClick={() => setMainView("points")} />
                </div>

                <input
                  className="w-full rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 xl:w-[420px]"
                  placeholder="Cari nama, kode, kelompok, perusahaan..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>

              <div className="mt-3 text-xs font-bold text-slate-400">
                {message} • Data tampil: {filteredParticipants.length} peserta
              </div>
            </Card>

            {mainView === "overview" ? (
              <OverviewPage participants={filteredParticipants} onSelect={openParticipant} />
            ) : null}

            {mainView === "daily" ? (
              <DailyPage participants={filteredParticipants} />
            ) : null}

            {mainView === "ranking" ? (
              <RankingPage participants={filteredParticipants} onSelect={openParticipant} />
            ) : null}

            {mainView === "clinical" ? (
              <ClinicalListPage participants={filteredParticipants} onSelect={openParticipant} />
            ) : null}

            {mainView === "points" ? (
              <PointsPage participants={filteredParticipants} onSelect={openParticipant} />
            ) : null}
          </>
        ) : (
          <ParticipantDetail
            participant={selectedParticipant}
            activeTab={detailTab}
            setActiveTab={setDetailTab}
            onBack={closeParticipant}
          />
        )}
      </div>
    </main>
  );
}