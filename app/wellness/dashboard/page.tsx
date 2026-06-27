"use client";

import WellnessQuickNav from "@/components/wellness/WellnessQuickNav";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";

// WELLNESS_CHART_HOVER_TOOLTIP_V375_FULL_DASHBOARD
// Full replacement dashboard Wellness.
// Includes participant list, evidence gallery, recent responses, before-after charts,
// and hover tooltip on every chart dot.

type Tone = "slate" | "blue" | "emerald" | "amber" | "rose" | "purple";

type TrendPoint = {
  label?: string;
  date?: string;
  date_label?: string;
  checkup_date?: string;
  log_date?: string;
  created_at?: string;
  visit_label?: string;
  history_type?: string;
  source?: string;
  type?: string;
  value?: any;
  sbp?: any;
  dbp?: any;
  [key: string]: any;
};

type TrendSeries = {
  key: string;
  label: string;
  unit?: string;
};

function cleanText(value: any) {
  return String(value ?? "").trim();
}

function fmt(value: any, suffix = "") {
  const text = cleanText(value);
  if (!text || text === "null" || text === "undefined") return "-";
  const n = Number(String(text).replace(",", "."));
  if (Number.isFinite(n)) {
    const display = Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
    return `${display}${suffix ? ` ${suffix}` : ""}`;
  }
  return `${text}${suffix ? ` ${suffix}` : ""}`;
}

function fmtPair(a: any, b: any, sep = "/") {
  const left = cleanText(a);
  const right = cleanText(b);
  if (!left && !right) return "-";
  return `${left || "-"}${sep}${right || "-"}`;
}

function toNumber(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function firstValue(points: TrendPoint[] = [], key = "value") {
  for (const point of points || []) {
    const n = toNumber((point as any)?.[key]);
    if (n !== null) return n;
  }
  return null;
}

function lastValue(points: TrendPoint[] = [], key = "value") {
  for (let i = (points || []).length - 1; i >= 0; i -= 1) {
    const n = toNumber((points[i] as any)?.[key]);
    if (n !== null) return n;
  }
  return null;
}

function deltaText(points: TrendPoint[] = [], key = "value", unit = "") {
  const first = firstValue(points, key);
  const last = lastValue(points, key);
  if (first === null || last === null) return "-";
  const delta = Math.round((last - first) * 100) / 100;
  const prefix = delta > 0 ? "+" : "";
  return `${prefix}${delta}${unit ? ` ${unit}` : ""}`;
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

function riskTone(level: string): Tone {
  const text = cleanText(level).toLowerCase();
  if (text.includes("triple") || text.includes("p1") || text.includes("tinggi")) return "rose";
  if (text.includes("glucose") || text.includes("hypertension") || text.includes("obesity")) return "amber";
  if (text.includes("membaik") || text.includes("normal")) return "emerald";
  return "blue";
}

function deltaTone(value: any, lowerIsBetter = true): Tone {
  const n = toNumber(value);
  if (n === null || n === 0) return "slate";
  if (lowerIsBetter) return n < 0 ? "emerald" : "rose";
  return n > 0 ? "emerald" : "rose";
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

function participantRisk(participant: any) {
  return cleanText(
    participant?.risk_cluster ||
      participant?.baseline_risk_group ||
      participant?.risk_group ||
      participant?.group_name
  );
}

function participantScope(participant: any) {
  return (
    cleanText(participant?.scope_text) ||
    [participant?.company_name, participant?.kelompok_name, participant?.group_unit_name]
      .map(cleanText)
      .filter(Boolean)
      .join(" › ")
  );
}

function participantLabel(participant: any) {
  const code = participantCode(participant);
  const name = participantName(participant);
  const risk = participantRisk(participant);
  const scope = participantScope(participant);
  return [`${code ? `${code} - ` : ""}${name}`, risk, scope].filter(Boolean).join(" | ");
}

function isPreviewableImageUrl(value: any) {
  const url = cleanText(value).toLowerCase();
  if (!url) return false;
  if (url.match(/\.(jpg|jpeg|png|webp|gif)(\?|#|$)/)) return true;
  if (url.includes("googleusercontent.com")) return true;
  if (url.includes("drive.google.com/uc?")) return true;
  if (url.includes("lh3.googleusercontent.com")) return true;
  return false;
}

function googleDrivePreviewUrl(value: any) {
  const url = cleanText(value);
  if (!url) return "";

  if (isPreviewableImageUrl(url)) return url;

  const fileMatch = url.match(/\/file\/d\/([^/]+)/);
  if (fileMatch?.[1]) return `https://drive.google.com/uc?export=view&id=${fileMatch[1]}`;

  const idMatch = url.match(/[?&]id=([^&]+)/);
  if (idMatch?.[1]) return `https://drive.google.com/uc?export=view&id=${idMatch[1]}`;

  return url;
}

function Badge({ children, tone = "blue" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-black ${toneClass(tone)}`}>
      {children}
    </span>
  );
}

function StatCard({
  label,
  value,
  tone = "slate",
  caption,
}: {
  label: string;
  value: any;
  tone?: Tone;
  caption?: string;
}) {
  return (
    <div className={`rounded-3xl border p-4 ${toneClass(tone)}`}>
      <div className="text-xs font-black uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-2 text-3xl font-black">{value ?? "-"}</div>
      {caption ? <div className="mt-1 text-xs font-bold opacity-70">{caption}</div> : null}
    </div>
  );
}

function MiniMetric({
  label,
  before,
  after,
  delta,
  suffix = "",
}: {
  label: string;
  before: any;
  after: any;
  delta?: any;
  suffix?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-2 text-sm font-black text-slate-900">
        {fmt(before, suffix)} → {fmt(after, suffix)}
      </div>
      {delta !== undefined ? (
        <div className={`mt-1 text-xs font-black ${deltaTone(delta).includes("emerald") ? "text-emerald-600" : "text-slate-500"}`}>
          Δ {fmt(delta, suffix)}
        </div>
      ) : null}
    </div>
  );
}

function EvidencePreview({ item }: { item: any }) {
  const title =
    cleanText(item?.title) ||
    cleanText(item?.label) ||
    cleanText(item?.evidence_type) ||
    cleanText(item?.type) ||
    "Bukti";

  const rawUrl =
    cleanText(item?.url) ||
    cleanText(item?.file_url) ||
    cleanText(item?.evidence_url) ||
    cleanText(item?.photo_url) ||
    cleanText(item?.image_url);

  const previewUrl = googleDrivePreviewUrl(rawUrl);

  if (!rawUrl) return null;

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-black text-slate-900">{title}</div>
          <div className="truncate text-xs font-bold text-slate-400">
            {cleanText(item?.date || item?.log_date || item?.created_at) || "Evidence"}
          </div>
        </div>
        <a
          href={rawUrl}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-full bg-blue-50 px-3 py-2 text-xs font-black text-blue-700"
        >
          Buka
        </a>
      </div>

      {previewUrl ? (
        <div className="bg-slate-50 p-3">
          {isPreviewableImageUrl(previewUrl) || previewUrl.includes("drive.google.com/uc?") ? (
            <img
              src={previewUrl}
              alt={title}
              className="h-44 w-full rounded-2xl object-cover"
              onError={(event) => {
                (event.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="flex h-32 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-4 text-center text-xs font-bold text-slate-400">
              Link tersimpan. Preview langsung tersedia bila link gambar dapat dibaca.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function EvidenceGallery({ items = [] }: { items?: any[] }) {
  const list = (items || []).filter((item) => {
    return cleanText(item?.url || item?.file_url || item?.evidence_url || item?.photo_url || item?.image_url);
  });

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-900">Evidence Gallery</h2>
          <p className="text-xs font-bold text-slate-400">Foto makanan, workout, dan healthtalk yang tersimpan sebagai URL.</p>
        </div>
        <Badge tone="blue">{list.length} bukti</Badge>
      </div>

      {!list.length ? (
        <div className="mt-4 rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">
          Belum ada bukti/foto.
        </div>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.slice(0, 9).map((item, index) => (
            <EvidencePreview key={`${item?.id || index}-${index}`} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}

function RecentResponses({ items = [] }: { items?: any[] }) {
  const list = items || [];

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-900">Riwayat Input Harian</h2>
          <p className="text-xs font-bold text-slate-400">Ringkasan response yang masuk dari aplikasi.</p>
        </div>
        <Badge tone="purple">{list.length} response</Badge>
      </div>

      {!list.length ? (
        <div className="mt-4 rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">
          Belum ada response harian.
        </div>
      ) : (
        <div className="mt-4 overflow-auto rounded-3xl border border-slate-100">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">Tanggal</th>
                <th className="px-4 py-3">Tipe</th>
                <th className="px-4 py-3">Detail</th>
                <th className="px-4 py-3">Point</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.slice(0, 12).map((item, index) => (
                <tr key={`${item?.id || index}-${index}`} className="bg-white">
                  <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-700">
                    {cleanText(item?.log_date || item?.date || item?.created_at) || "-"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-black text-slate-900">
                    {cleanText(item?.type || item?.input_type || item?.meal_time || item?.activity_type) || "-"}
                  </td>
                  <td className="min-w-[220px] px-4 py-3 font-bold text-slate-500">
                    {cleanText(item?.description || item?.food_description || item?.notes || item?.activity_notes) || "-"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-black text-blue-700">
                    {fmt(item?.points || item?.point || item?.total_points)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// WELLNESS_CHART_HOVER_TOOLTIP_V375
function TrendChart({
  title,
  caption,
  points = [],
  series,
  height = 150,
}: {
  title: string;
  caption?: string;
  points?: TrendPoint[];
  series: TrendSeries[];
  height?: number;
}) {
  const [hoveredPoint, setHoveredPoint] = useState<any>(null);

  const width = 520;
  const paddingX = 70;
  const paddingTop = 26;
  const paddingBottom = 42;
  const chartHeight = height;
  const plotHeight = chartHeight - paddingTop - paddingBottom;
  const usableWidth = width - paddingX * 2;

  const safePoints = points || [];
  const values: number[] = [];

  for (const point of safePoints) {
    for (const item of series || []) {
      const n = toNumber((point as any)?.[item.key]);
      if (n !== null) values.push(n);
    }
  }

  const minValue = values.length ? Math.min(...values) : 0;
  const maxValue = values.length ? Math.max(...values) : 1;
  const range = maxValue - minValue || 1;
  const pad = range * 0.18;
  const yMin = minValue - pad;
  const yMax = maxValue + pad;

  function xFor(index: number) {
    if (safePoints.length <= 1) return width / 2;
    return paddingX + (index / (safePoints.length - 1)) * usableWidth;
  }

  function yFor(value: any) {
    const n = toNumber(value);
    if (n === null) return null;
    return paddingTop + ((yMax - n) / (yMax - yMin || 1)) * plotHeight;
  }

  function labelForPoint(point: any, index: number) {
    return (
      cleanText(point?.visit_label) ||
      cleanText(point?.label) ||
      cleanText(point?.history_type) ||
      cleanText(point?.date_label) ||
      cleanText(point?.date) ||
      `Data ${index + 1}`
    );
  }

  function dateForPoint(point: any) {
    return (
      cleanText(point?.checkup_date) ||
      cleanText(point?.log_date) ||
      cleanText(point?.date) ||
      cleanText(point?.created_at) ||
      "-"
    );
  }

  function sourceForPoint(point: any) {
    return cleanText(point?.history_type || point?.source || point?.type) || "-";
  }

  function valueText(value: any, unit?: string) {
    const n = toNumber(value);
    if (n === null) return "-";
    return `${n}${unit ? ` ${unit}` : ""}`;
  }

  function tooltipTitle(point: any, item: TrendSeries, index: number) {
    const value = (point as any)?.[item.key];
    return [
      `${item.label}: ${valueText(value, item.unit)}`,
      `Label: ${labelForPoint(point, index)}`,
      `Tanggal: ${dateForPoint(point)}`,
      `Sumber: ${sourceForPoint(point)}`,
    ].join("\n");
  }

  function pathFor(key: string) {
    return safePoints
      .map((point, index) => {
        const y = yFor((point as any)?.[key]);
        if (y === null) return "";
        const x = xFor(index);
        return `${index === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .filter(Boolean)
      .join(" ");
  }

  const latest = safePoints?.[safePoints.length - 1] || null;

  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-black text-slate-900">{title}</div>
          {caption ? <div className="mt-1 text-xs font-bold text-slate-400">{caption}</div> : null}
        </div>

        {latest ? (
          <div className="rounded-full bg-slate-50 px-3 py-2 text-xs font-black text-slate-700">
            {series
              .map((item) => {
                const value = (latest as any)?.[item.key];
                const n = toNumber(value);
                if (n === null) return null;
                return `${item.label}: ${n}${item.unit ? ` ${item.unit}` : ""}`;
              })
              .filter(Boolean)
              .join(" / ")}
          </div>
        ) : null}
      </div>

      <div className="relative mt-4">
        {!safePoints.length || !values.length ? (
          <div
            className="flex items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-xs font-bold text-slate-400"
            style={{ height }}
          >
            Belum ada data grafik
          </div>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full overflow-visible"
              style={{ height }}
              role="img"
              aria-label={`Grafik ${title}`}
            >
              <line x1={paddingX} y1={paddingTop} x2={width - paddingX} y2={paddingTop} stroke="#eef2f7" strokeWidth="2" />
              <line x1={paddingX} y1={height - paddingBottom} x2={width - paddingX} y2={height - paddingBottom} stroke="#e2e8f0" strokeWidth="2" />

              {hoveredPoint ? (
                <line
                  x1={hoveredPoint.x}
                  y1={paddingTop}
                  x2={hoveredPoint.x}
                  y2={height - paddingBottom}
                  stroke="#94a3b8"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                  opacity="0.8"
                />
              ) : null}

              {series.map((item, seriesIndex) => {
                const stroke = seriesIndex === 1 ? "#e11d48" : "#2563eb";
                const path = pathFor(item.key);

                return (
                  <g key={item.key}>
                    <path d={path} fill="none" stroke={stroke} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />

                    {safePoints.map((point, index) => {
                      const y = yFor((point as any)?.[item.key]);
                      if (y === null) return null;

                      const x = xFor(index);
                      const value = (point as any)?.[item.key];
                      const active =
                        hoveredPoint &&
                        hoveredPoint.index === index &&
                        hoveredPoint.key === item.key;

                      return (
                        <g key={`${item.key}-${index}`}>
                          <circle
                            cx={x}
                            cy={y}
                            r={active ? 8 : 5}
                            fill={stroke}
                            stroke="white"
                            strokeWidth="3"
                            className="cursor-pointer transition-all"
                            onMouseEnter={() =>
                              setHoveredPoint({
                                point,
                                index,
                                key: item.key,
                                label: item.label,
                                unit: item.unit,
                                value,
                                x,
                                y,
                              })
                            }
                            onMouseLeave={() => setHoveredPoint(null)}
                          >
                            <title>{tooltipTitle(point, item, index)}</title>
                          </circle>

                          <circle
                            cx={x}
                            cy={y}
                            r="15"
                            fill="transparent"
                            className="cursor-pointer"
                            onMouseEnter={() =>
                              setHoveredPoint({
                                point,
                                index,
                                key: item.key,
                                label: item.label,
                                unit: item.unit,
                                value,
                                x,
                                y,
                              })
                            }
                            onMouseLeave={() => setHoveredPoint(null)}
                          />
                        </g>
                      );
                    })}
                  </g>
                );
              })}

              {safePoints.map((point, index) => {
                const x = xFor(index);
                const showLabel = safePoints.length <= 4 || index === 0 || index === safePoints.length - 1;
                if (!showLabel) return null;

                return (
                  <text
                    key={`label-${index}`}
                    x={x}
                    y={height - 12}
                    textAnchor="middle"
                    className="fill-slate-500 text-[11px] font-bold"
                  >
                    {labelForPoint(point, index)}
                  </text>
                );
              })}
            </svg>

            {hoveredPoint ? (
              <div
                className="pointer-events-none absolute z-20 min-w-[220px] rounded-2xl border border-slate-200 bg-white/95 p-3 text-xs shadow-xl shadow-slate-200 backdrop-blur"
                style={{
                  left: `${Math.min(Math.max((hoveredPoint.x / width) * 100, 18), 72)}%`,
                  top: `${Math.max(hoveredPoint.y - 88, 8)}px`,
                  transform: "translateX(-50%)",
                }}
              >
                <div className="font-black text-slate-900">{hoveredPoint.label}</div>
                <div className="mt-1 text-lg font-black text-blue-700">
                  {valueText(hoveredPoint.value, hoveredPoint.unit)}
                </div>
                <div className="mt-2 grid gap-1 font-bold text-slate-500">
                  <div>Label: {labelForPoint(hoveredPoint.point, hoveredPoint.index)}</div>
                  <div>Tanggal: {dateForPoint(hoveredPoint.point)}</div>
                  <div>Sumber: {sourceForPoint(hoveredPoint.point)}</div>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {series.map((item, index) => (
          <span
            key={item.key}
            className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-2 text-xs font-black text-slate-700"
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: index === 1 ? "#e11d48" : "#2563eb" }}
            />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ParticipantChartPanel({ participant }: { participant: any }) {
  const charts =
    participant?.parameter_charts ||
    participant?.charts ||
    participant?.chart_data ||
    participant?.trend_charts ||
    {};

  const risk = participantRisk(participant);
  const code = participantCode(participant);
  const name = participantName(participant);
  const scope = participantScope(participant);

  const weightPoints = charts.weight_kg || charts.weight || [];
  const bmiPoints = charts.bmi || [];
  const bpPoints = charts.blood_pressure || charts.bp || [];
  const hba1cPoints = charts.hba1c || [];
  const glucosePoints = charts.glucose || charts.gula_darah || [];
  const waistPoints = charts.waist_cm || charts.waist || [];
  const nutritionPoints = charts.nutrition_calories || charts.food_calories || [];
  const activityCaloriesPoints = charts.activity_calories || charts.workout_calories || [];
  const workoutMinutesPoints = charts.workout_minutes || charts.activity_minutes || [];
  const pointPoints = charts.points || charts.point || [];

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900">Grafik Parameter Per Peserta</h2>
          <p className="mt-1 text-sm font-bold text-slate-500">
            {name}
            {code ? ` • ${code}` : ""}
            {scope ? ` • ${scope}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {risk ? <Badge tone={riskTone(risk)}>{risk}</Badge> : null}
          {participant?.program_status ? <Badge tone="rose">{participant.program_status}</Badge> : null}
          {participant?.latest_date ? <Badge tone="blue">Latest: {participant.latest_date}</Badge> : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MiniMetric label="BB" before={firstValue(weightPoints)} after={lastValue(weightPoints)} delta={deltaText(weightPoints, "value", "kg")} suffix="kg" />
        <MiniMetric label="BMI" before={firstValue(bmiPoints)} after={lastValue(bmiPoints)} delta={deltaText(bmiPoints)} />
        <MiniMetric label="Tekanan Darah" before={fmtPair(firstValue(bpPoints, "sbp"), firstValue(bpPoints, "dbp"))} after={fmtPair(lastValue(bpPoints, "sbp"), lastValue(bpPoints, "dbp"))} />
        <MiniMetric label="HbA1c" before={firstValue(hba1cPoints)} after={lastValue(hba1cPoints)} delta={deltaText(hba1cPoints, "value", "%")} suffix="%" />
        <MiniMetric label="Point" before={firstValue(pointPoints)} after={lastValue(pointPoints)} delta={deltaText(pointPoints)} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2 2xl:grid-cols-3">
        <TrendChart title="Berat badan" points={weightPoints} series={[{ key: "value", label: "BB", unit: "kg" }]} />
        <TrendChart title="BMI" points={bmiPoints} series={[{ key: "value", label: "BMI" }]} />
        <TrendChart title="Tekanan darah" points={bpPoints} series={[{ key: "sbp", label: "Sistolik", unit: "mmHg" }, { key: "dbp", label: "Diastolik", unit: "mmHg" }]} />
        <TrendChart title="HbA1c" points={hba1cPoints} series={[{ key: "value", label: "HbA1c", unit: "%" }]} />
        <TrendChart title="Gula darah" points={glucosePoints} series={[{ key: "value", label: "Gula", unit: "mg/dL" }]} />
        <TrendChart title="Lingkar perut" points={waistPoints} series={[{ key: "value", label: "LP", unit: "cm" }]} />
        <TrendChart title="Nutrisi harian" caption="Total kalori dari food log" points={nutritionPoints} series={[{ key: "value", label: "Kalori", unit: "kkal" }]} />
        <TrendChart title="Workout calories" caption="Kalori terbakar dari activity log" points={activityCaloriesPoints} series={[{ key: "value", label: "Kalori", unit: "kkal" }]} />
        <TrendChart title="Workout duration" caption="Total durasi aktivitas per hari" points={workoutMinutesPoints} series={[{ key: "value", label: "Durasi", unit: "menit" }]} />
        <TrendChart title="Point harian" caption="Total point yang tercatat per tanggal" points={pointPoints} series={[{ key: "value", label: "Point" }]} />
      </div>

      <div className="mt-5 grid gap-5">
        <EvidenceGallery items={participant?.evidence_gallery || participant?.evidence || participant?.daily_evidence || []} />
        <RecentResponses items={participant?.recent_responses || participant?.daily_logs || participant?.responses || []} />
      </div>
    </section>
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
  const [selectedId, setSelectedId] = useState<any>("");

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
    const list = result?.participants || result?.rows || result?.data || [];
    if (!selectedId && list?.length) setSelectedId(list[0].id);
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
        participantCode(participant),
        participantName(participant),
        participantRisk(participant),
        participantScope(participant),
        participant?.company_name,
        participant?.kelompok_name,
        participant?.group_unit_name,
        participant?.program_status,
      ]
        .map(cleanText)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [participants, search]);

  const selectedParticipant = useMemo(() => {
    return (
      participants.find((participant: any) => String(participant.id) === String(selectedId)) ||
      filteredParticipants?.[0] ||
      participants?.[0] ||
      null
    );
  }, [participants, filteredParticipants, selectedId]);

  useEffect(() => {
    if (!filteredParticipants.length) return;
    const exists = filteredParticipants.some((participant: any) => String(participant.id) === String(selectedId));
    if (!exists) setSelectedId(filteredParticipants[0].id);
  }, [filteredParticipants, selectedId]);

  const summary = data?.summary || data?.stats || {};
  const totalParticipants = summary.total_participants ?? participants.length;
  const totalEvidence = summary.total_evidence ?? summary.evidence_count ?? "-";
  const totalPoints = summary.total_points ?? summary.points ?? "-";
  const activeParticipants = summary.active_participants ?? summary.active ?? "-";

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <WellnessQuickNav />

        <section className="overflow-hidden rounded-[2rem] bg-gradient-to-r from-fuchsia-600 via-rose-600 to-orange-500 shadow-sm">
          <div className="flex flex-col gap-4 p-7 text-white lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.2em] text-white/70">
                Wellness Command Center
              </div>
              <h1 className="mt-2 text-3xl font-black md:text-4xl">Dashboard Wellness</h1>
              <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-white/90">
                Monitoring peserta, input harian, evidence gallery, point, dan grafik before-after klinis per peserta.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <a href="/wellness/input" className="rounded-full bg-white px-5 py-3 text-xs font-black text-rose-700 shadow-sm">
                Input Harian
              </a>
              <a href="/wellness/nakes-input" className="rounded-full bg-white/15 px-5 py-3 text-xs font-black text-white ring-1 ring-white/30">
                Input NAKES
              </a>
              <a href="/wellness/history-import" className="rounded-full bg-white/15 px-5 py-3 text-xs font-black text-white ring-1 ring-white/30">
                Import History MCU
              </a>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Peserta" value={totalParticipants} tone="blue" caption="Total peserta Wellness" />
          <StatCard label="Aktif" value={activeParticipants} tone="emerald" caption="Peserta dengan aktivitas/input" />
          <StatCard label="Evidence" value={totalEvidence} tone="purple" caption="URL bukti/foto tersimpan" />
          <StatCard label="Point" value={totalPoints} tone="amber" caption="Akumulasi point tercatat" />
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-900">Pilih Peserta</h2>
              <p className="mt-1 text-xs font-bold text-slate-400">{message}</p>
            </div>

            <button
              type="button"
              onClick={load}
              className="rounded-full bg-blue-600 px-5 py-3 text-xs font-black text-white shadow-lg shadow-blue-100"
            >
              {loading ? "Memuat..." : "Refresh Dashboard"}
            </button>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1.3fr]">
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              placeholder="Cari nama, KODE, risk cluster, perusahaan, kelompok..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            <select
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              value={selectedParticipant?.id || ""}
              onChange={(event) => setSelectedId(event.target.value)}
              disabled={!filteredParticipants.length}
            >
              {!filteredParticipants.length ? <option value="">Tidak ada peserta</option> : null}
              {filteredParticipants.map((participant: any) => (
                <option key={participant.id} value={participant.id}>
                  {participantLabel(participant)}
                </option>
              ))}
            </select>
          </div>
        </section>

        {selectedParticipant ? (
          <ParticipantChartPanel participant={selectedParticipant} />
        ) : (
          <section className="rounded-[2rem] border border-dashed border-slate-200 bg-white p-10 text-center text-sm font-bold text-slate-400">
            Belum ada data peserta Wellness.
          </section>
        )}
      </div>
    </main>
  );
}