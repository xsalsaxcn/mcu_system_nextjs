"use client";

import { useEffect, useMemo, useState } from "react";

type ChartPoint = {
  date: string;
  label: string;
  value: number;
};

type BpPoint = {
  date: string;
  label: string;
  sbp: number;
  dbp: number;
};

function clean(value: any) {
  return String(value ?? "").trim();
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function fmtNumber(value: any, digits = 0) {
  const n = Number(value);

  if (!Number.isFinite(n)) return "0";

  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(n);
}

export default function AchievementChartsTab({
  participant,
  workoutItems,
  clinicalHistory,
}: {
  participant?: any;
  workoutItems?: any[];
  clinicalHistory?: any[];
}) {
  const participantId = Number(
    participant?.id ||
      participant?.participant_id ||
      participant?.wellness_participant_id ||
      0
  );

  const [nutritionData, setNutritionData] = useState<any>({
    ok: false,
    logs: [],
    today_logs: [],
    latest_logs: [],
    today_calories: 0,
    today_count: 0,
    sources: null,
  });

  const [loadingNutrition, setLoadingNutrition] = useState(false);

  const nutritionLimit = Number(
    participant?.daily_calorie_limit ||
      participant?.target_calories ||
      participant?.calorie_limit ||
      2000
  );

  const workoutMinTarget = Number(
    participant?.workout_calorie_target ||
      participant?.active_calorie_target ||
      participant?.daily_activity_calorie_target ||
      300
  );

  async function loadNutritionChartData() {
    if (!participantId) return;

    setLoadingNutrition(true);

    const result = await fetch(
      `/api/wellness/portal/nutrition-direct?participant_id=${participantId}&t=${Date.now()}`,
      { cache: "no-store" }
    )
      .then((response) => response.json())
      .catch(() => null);

    if (result?.ok) {
      setNutritionData(result);
    }

    setLoadingNutrition(false);
  }

  useEffect(() => {
    loadNutritionChartData();
  }, [participantId]);

  const nutritionSeries = useMemo(() => {
    return aggregateChartSeries(nutritionData?.logs || [], {
      dateKeys: ["log_date", "created_at", "updated_at"],
      valueGetter: (item: any) => Number(item.calories || item.total_calories || 0),
      average: false,
    });
  }, [JSON.stringify(nutritionData?.logs || [])]);

  const workoutSeries = useMemo(() => {
    return aggregateChartSeries(workoutItems || [], {
      dateKeys: ["log_date", "created_at", "updated_at", "date"],
      valueGetter: (item: any) => chartCaloriesValue(item),
      average: false,
    });
  }, [JSON.stringify(workoutItems || [])]);

  const weightSeries = useMemo(() => {
    const rows = clinicalHistory || [];
    const series = aggregateChartSeries(rows, {
      dateKeys: ["exam_date", "mcu_date", "log_date", "created_at", "updated_at"],
      valueGetter: (item: any) =>
        firstNumber([
          item?.weight_kg,
          item?.body_weight_kg,
          item?.weight,
          item?.bb_kg,
          item?.berat_badan,
        ]),
      average: true,
    });

    if (series.length === 0 && participant?.initial_weight_kg) {
      const date = clean(participant?.program_start_date || participant?.created_at || todayDate());

      return [
        {
          date,
          label: formatChartDate(date),
          value: Number(participant.initial_weight_kg),
        },
      ];
    }

    return series;
  }, [JSON.stringify(clinicalHistory || []), participant?.initial_weight_kg]);

  const hba1cSeries = useMemo(() => {
    const rows = clinicalHistory || [];
    const series = aggregateChartSeries(rows, {
      dateKeys: ["exam_date", "mcu_date", "log_date", "created_at", "updated_at"],
      valueGetter: (item: any) =>
        firstNumber([
          item?.hba1c,
          item?.HbA1c,
          item?.hb_a1c,
          item?.baseline_hba1c,
        ]),
      average: true,
    });

    if (series.length === 0 && participant?.baseline_hba1c) {
      const date = clean(participant?.baseline_mcu_date || participant?.created_at || todayDate());

      return [
        {
          date,
          label: formatChartDate(date),
          value: Number(participant.baseline_hba1c),
        },
      ];
    }

    return series;
  }, [JSON.stringify(clinicalHistory || []), participant?.baseline_hba1c]);

  const bpSeries = useMemo(() => {
    const rows = clinicalHistory || [];
    const fromClinical = buildBpSeries(rows);

    if (
      fromClinical.systolic.length === 0 &&
      Number(participant?.baseline_sbp || 0) > 0
    ) {
      const date = clean(participant?.baseline_mcu_date || participant?.created_at || todayDate());

      return {
        systolic: [
          {
            date,
            label: formatChartDate(date),
            value: Number(participant.baseline_sbp),
          },
        ],
        diastolic: [
          {
            date,
            label: formatChartDate(date),
            value: Number(participant.baseline_dbp || 0),
          },
        ].filter((item) => item.value > 0),
      };
    }

    return fromClinical;
  }, [JSON.stringify(clinicalHistory || []), participant?.baseline_sbp, participant?.baseline_dbp]);

  const latestNutrition = latestValue(nutritionSeries);
  const latestWorkout = latestValue(workoutSeries);

  const nutritionRedFlag = latestNutrition > nutritionLimit;
  const workoutRedFlag = latestWorkout > 0 && latestWorkout < workoutMinTarget;

  return (
    <section className="w-full max-w-full space-y-5 overflow-hidden">
      <div className="rounded-[2rem] border border-white bg-white p-5 shadow-xl shadow-slate-200/60 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.22em] text-teal-700/70">
              Achievement Dashboard
            </div>

            <h2 className="mt-2 text-3xl font-black leading-tight text-slate-950">
              Grafik Capaian
            </h2>

            <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
              Pantau tren nutrisi, aktivitas, dan pemeriksaan kesehatan peserta secara visual.
            </p>
          </div>

          <button
            type="button"
            onClick={loadNutritionChartData}
            className="rounded-full bg-slate-950 px-5 py-3 text-xs font-black text-white"
          >
            {loadingNutrition ? "Memuat..." : "Refresh Grafik"}
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <ChartStatusCard
            title="Kalori masuk"
            value={`${fmtNumber(latestNutrition, 0)} kkal`}
            note={`Limit ${fmtNumber(nutritionLimit, 0)} kkal per hari`}
            danger={nutritionRedFlag}
            dangerText="Red flag: konsumsi melebihi limit harian"
            safeText="Masih dalam batas harian"
          />

          <ChartStatusCard
            title="Aktivitas workout"
            value={`${fmtNumber(latestWorkout, 0)} kkal`}
            note={`Target minimal ${fmtNumber(workoutMinTarget, 0)} kkal per hari`}
            danger={workoutRedFlag}
            dangerText="Red flag: kalori terbakar masih rendah"
            safeText="Aktivitas memenuhi target minimal"
          />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SmoothDashboardChart
          title="Grafik Nutrisi Konsumsi Harian"
          description="Total kalori masuk per hari untuk melihat pola stabil, naik, atau turun."
          unit="kkal"
          data={nutritionSeries}
          limit={nutritionLimit}
          dangerMode="above"
          emptyText="Belum ada data nutrisi untuk dibuat grafik."
        />

        <SmoothDashboardChart
          title="Grafik Workout Kalori Terbakar"
          description="Total kalori aktivitas per hari dari manual, Google Fit, atau Health Connect."
          unit="kkal"
          data={workoutSeries}
          limit={workoutMinTarget}
          dangerMode="below"
          emptyText="Belum ada data workout untuk dibuat grafik."
        />
      </div>

      <div className="rounded-[2rem] border border-white bg-white p-5 shadow-xl shadow-slate-200/60 md:p-6">
        <div className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">
          Pemeriksaan Nakes
        </div>

        <h3 className="mt-2 text-2xl font-black text-slate-950">
          Grafik Pemeriksaan Kesehatan
        </h3>

        <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
          Data berikut berasal dari hasil pemeriksaan oleh tenaga kesehatan atau baseline MCU yang tersedia.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SmoothDashboardChart
          title="Grafik Berat Badan"
          description="Perubahan berat badan dari waktu ke waktu."
          unit="kg"
          data={weightSeries}
          emptyText="Belum ada data berat badan."
        />

        <SmoothBpChart
          title="Grafik Tekanan Darah"
          description="Pantauan tekanan darah sistolik dan diastolik."
          systolic={bpSeries.systolic}
          diastolic={bpSeries.diastolic}
        />

        <SmoothDashboardChart
          title="Grafik HbA1c"
          description="Pantauan HbA1c dari pemeriksaan berkala."
          unit="%"
          data={hba1cSeries}
          limit={6.5}
          dangerMode="above"
          emptyText="Belum ada data HbA1c."
        />
      </div>
    </section>
  );
}

function ChartStatusCard({
  title,
  value,
  note,
  danger,
  dangerText,
  safeText,
}: {
  title: string;
  value: string;
  note: string;
  danger: boolean;
  dangerText: string;
  safeText: string;
}) {
  return (
    <div
      className={`rounded-[1.7rem] p-4 ${
        danger ? "bg-red-50 text-red-900" : "bg-teal-50 text-teal-900"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-black uppercase tracking-wide opacity-70">
          {title}
        </div>

        <div
          className={`rounded-full px-3 py-1 text-[10px] font-black ${
            danger ? "bg-red-600 text-white" : "bg-teal-600 text-white"
          }`}
        >
          {danger ? "Red flag" : "OK"}
        </div>
      </div>

      <div className="mt-3 text-3xl font-black">
        {value}
      </div>

      <div className="mt-1 text-xs font-bold opacity-70">
        {note}
      </div>

      <div className="mt-3 rounded-2xl bg-white/70 px-3 py-2 text-xs font-black">
        {danger ? dangerText : safeText}
      </div>
    </div>
  );
}

// WELLNESS_CHART_POINT_INTERACTION_V49B
// Memperluas area interaksi tanpa mengubah ukuran atau tampilan dot grafik.
function nearestChartPointIndex(
  clientX: number,
  svg: SVGSVGElement,
  points: Array<{ x: number }>
) {
  if (!points.length) return 0;

  const rect = svg.getBoundingClientRect();
  const viewBoxWidth = svg.viewBox?.baseVal?.width || 620;
  const relativeX =
    rect.width > 0 ? ((clientX - rect.left) / rect.width) * viewBoxWidth : 0;

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  points.forEach((point, index) => {
    const distance = Math.abs(point.x - relativeX);

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return nearestIndex;
}
function SmoothDashboardChart({
  title,
  description,
  unit,
  data,
  limit,
  dangerMode,
  emptyText,
}: {
  title: string;
  description: string;
  unit: string;
  data: ChartPoint[];
  limit?: number;
  dangerMode?: "above" | "below";
  emptyText: string;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const safeData = (data || []).filter((item) => Number(item.value) > 0).slice(-14);
  const latest = safeData.length ? safeData[safeData.length - 1] : null;

  const danger =
    latest && limit
      ? dangerMode === "above"
        ? latest.value > limit
        : dangerMode === "below"
          ? latest.value < limit
          : false
      : false;

  const chart = buildSmoothSvgChart(safeData, 620, 250);
  const activePoint =
    activeIndex !== null && chart.points[activeIndex]
      ? chart.points[activeIndex]
      : chart.points[chart.points.length - 1];

  return (
    <div className="rounded-[2rem] border border-white bg-white p-5 shadow-xl shadow-slate-200/60 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
            Progress Chart
          </div>

          <h3 className="mt-2 text-xl font-black leading-tight text-slate-950">
            {title}
          </h3>

          <p className="mt-2 text-xs font-bold leading-5 text-slate-500">
            {description}
          </p>
        </div>

        {latest ? (
          <div className={`shrink-0 rounded-[1.3rem] px-4 py-3 text-right ${
            danger ? "bg-red-50 text-red-900" : "bg-teal-50 text-teal-900"
          }`}>
            <div className="text-[10px] font-black uppercase tracking-wide opacity-70">
              Terakhir
            </div>

            <div className="text-xl font-black">
              {fmtNumber(latest.value, 0)}
            </div>

            <div className="text-[10px] font-bold opacity-70">
              {unit}
            </div>
          </div>
        ) : null}
      </div>

      {safeData.length === 0 ? (
        <div className="mt-5 rounded-[1.8rem] border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-bold text-slate-400">
          {emptyText}
        </div>
      ) : (
        <div className="relative mt-5 overflow-hidden rounded-[1.8rem] bg-gradient-to-br from-slate-50 via-white to-teal-50 p-3">
          <svg
            viewBox="0 0 620 250"
            className="h-64 w-full"
            role="img"
            aria-label={title}
            onPointerMove={(event) => {
              if (event.pointerType !== "touch") {
                setActiveIndex(
                  nearestChartPointIndex(event.clientX, event.currentTarget, chart.points)
                );
              }
            }}
            onPointerDown={(event) =>
              setActiveIndex(
                nearestChartPointIndex(event.clientX, event.currentTarget, chart.points)
              )
            }
            onClick={(event) =>
              setActiveIndex(
                nearestChartPointIndex(event.clientX, event.currentTarget, chart.points)
              )
            }
            onPointerLeave={(event) => {
              if (event.pointerType !== "touch") setActiveIndex(null);
            }}
          >
            <defs>
              <linearGradient id={`chartGradient-${slug(title)}`} x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#14b8a6" />
                <stop offset="55%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#6366f1" />
              </linearGradient>

              <linearGradient id={`areaGradient-${slug(title)}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
              </linearGradient>
            </defs>

            {[0, 1, 2, 3].map((row) => {
              const y = 30 + row * 55;

              return (
                <line
                  key={row}
                  x1="28"
                  x2="592"
                  y1={y}
                  y2={y}
                  stroke="#e5edf2"
                  strokeWidth="2"
                  strokeDasharray="6 10"
                />
              );
            })}

            {limit ? (
              <line
                x1="28"
                x2="592"
                y1={chart.limitY(limit)}
                y2={chart.limitY(limit)}
                stroke={dangerMode === "above" ? "#ef4444" : "#f97316"}
                strokeWidth="2"
                strokeDasharray="8 8"
                opacity="0.75"
              />
            ) : null}

            <path d={chart.areaPath} fill={`url(#areaGradient-${slug(title)})`} />

            <path
              d={chart.path}
              fill="none"
              stroke={`url(#chartGradient-${slug(title)})`}
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {chart.points.map((point, index) => (
              <g key={`${point.x}-${point.y}-${index}`}>
                {index === chart.points.length - 1 ? (
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r="13"
                    fill="#14b8a6"
                    opacity="0.16"
                    className="animate-ping"
                  />
                ) : null}

                <circle
                  cx={point.x}
                  cy={point.y}
                  r={activeIndex === index ? "9" : "6"}
                  fill="white"
                  stroke={danger ? "#ef4444" : "#0f766e"}
                  strokeWidth="4"
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(null)}
                  onTouchStart={() => setActiveIndex(index)}
                />
              </g>
            ))}
          </svg>

          {activePoint ? (
            <div
              className="pointer-events-none absolute rounded-2xl bg-slate-950 px-3 py-2 text-xs font-black text-white shadow-xl"
              style={{
                left: `${Math.max(12, Math.min(78, (activePoint.x / 620) * 100))}%`,
                top: `${Math.max(12, Math.min(70, (activePoint.y / 250) * 100))}%`,
                transform: "translate(-50%, -120%)",
              }}
            >
              {activePoint.label}: {fmtNumber(activePoint.value, 0)} {unit}
            </div>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center justify-between gap-3 px-1 text-[11px] font-bold text-slate-400">
            <span>{safeData[0]?.label}</span>
            <span>{safeData[safeData.length - 1]?.label}</span>
          </div>
        </div>
      )}

      {danger ? (
        <div className="mt-4 rounded-[1.4rem] bg-red-50 px-4 py-3 text-xs font-black leading-5 text-red-800">
          Red flag: nilai terakhir berada di luar target yang ditentukan.
        </div>
      ) : null}
    </div>
  );
}

function SmoothBpChart({
  title,
  description,
  systolic,
  diastolic,
}: {
  title: string;
  description: string;
  systolic: ChartPoint[];
  diastolic: ChartPoint[];
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const data = mergeBpSeries(systolic, diastolic).slice(-14);
  const chart = buildDualSmoothSvgChart(data, 620, 250);

  const active =
    activeIndex !== null && data[activeIndex]
      ? data[activeIndex]
      : data[data.length - 1];

  const latest = data[data.length - 1] || null;
  const danger = latest ? latest.sbp >= 140 || latest.dbp >= 90 : false;

  return (
    <div className="rounded-[2rem] border border-white bg-white p-5 shadow-xl shadow-slate-200/60 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
            Clinical Chart
          </div>

          <h3 className="mt-2 text-xl font-black leading-tight text-slate-950">
            {title}
          </h3>

          <p className="mt-2 text-xs font-bold leading-5 text-slate-500">
            {description}
          </p>
        </div>

        {latest ? (
          <div className={`shrink-0 rounded-[1.3rem] px-4 py-3 text-right ${
            danger ? "bg-red-50 text-red-900" : "bg-teal-50 text-teal-900"
          }`}>
            <div className="text-[10px] font-black uppercase tracking-wide opacity-70">
              Terakhir
            </div>

            <div className="text-xl font-black">
              {latest.sbp}/{latest.dbp}
            </div>

            <div className="text-[10px] font-bold opacity-70">
              mmHg
            </div>
          </div>
        ) : null}
      </div>

      {data.length === 0 ? (
        <div className="mt-5 rounded-[1.8rem] border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-bold text-slate-400">
          Belum ada data tekanan darah.
        </div>
      ) : (
        <div className="relative mt-5 overflow-hidden rounded-[1.8rem] bg-gradient-to-br from-slate-50 via-white to-teal-50 p-3">
          <svg
            viewBox="0 0 620 250"
            className="h-64 w-full"
            role="img"
            aria-label={title}
            onPointerMove={(event) => {
              if (event.pointerType !== "touch") {
                setActiveIndex(
                  nearestChartPointIndex(event.clientX, event.currentTarget, chart.points)
                );
              }
            }}
            onPointerDown={(event) =>
              setActiveIndex(
                nearestChartPointIndex(event.clientX, event.currentTarget, chart.points)
              )
            }
            onClick={(event) =>
              setActiveIndex(
                nearestChartPointIndex(event.clientX, event.currentTarget, chart.points)
              )
            }
            onPointerLeave={(event) => {
              if (event.pointerType !== "touch") setActiveIndex(null);
            }}
          >
            {[0, 1, 2, 3].map((row) => {
              const y = 30 + row * 55;

              return (
                <line
                  key={row}
                  x1="28"
                  x2="592"
                  y1={y}
                  y2={y}
                  stroke="#e5edf2"
                  strokeWidth="2"
                  strokeDasharray="6 10"
                />
              );
            })}

            <path
              d={chart.sbpPath}
              fill="none"
              stroke="#ef4444"
              strokeWidth="6"
              strokeLinecap="round"
            />

            <path
              d={chart.dbpPath}
              fill="none"
              stroke="#0f766e"
              strokeWidth="6"
              strokeLinecap="round"
            />

            {chart.points.map((point, index) => (
              <g key={`${point.x}-${point.sbpY}-${index}`}>
                <circle
                  cx={point.x}
                  cy={point.sbpY}
                  r={activeIndex === index ? "8" : "5"}
                  fill="white"
                  stroke="#ef4444"
                  strokeWidth="4"
                  onMouseEnter={() => setActiveIndex(index)}
                  onTouchStart={() => setActiveIndex(index)}
                />

                <circle
                  cx={point.x}
                  cy={point.dbpY}
                  r={activeIndex === index ? "8" : "5"}
                  fill="white"
                  stroke="#0f766e"
                  strokeWidth="4"
                  onMouseEnter={() => setActiveIndex(index)}
                  onTouchStart={() => setActiveIndex(index)}
                />
              </g>
            ))}
          </svg>

          {active ? (
            <div className="absolute left-1/2 top-5 -translate-x-1/2 rounded-2xl bg-slate-950 px-3 py-2 text-xs font-black text-white shadow-xl">
              {active.label}: {active.sbp}/{active.dbp} mmHg
            </div>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-3 px-1 text-[11px] font-black">
            <span className="text-red-600">Sistolik</span>
            <span className="text-teal-700">Diastolik</span>
          </div>
        </div>
      )}
    </div>
  );
}

function aggregateChartSeries(
  rows: any[],
  config: {
    dateKeys: string[];
    valueGetter: (item: any) => number;
    average?: boolean;
  }
) {
  const map = new Map<string, { total: number; count: number }>();

  for (const item of rows || []) {
    const date = chartDateFromItem(item, config.dateKeys);
    const value = Number(config.valueGetter(item) || 0);

    if (!date || !Number.isFinite(value) || value <= 0) continue;

    const current = map.get(date) || { total: 0, count: 0 };
    current.total += value;
    current.count += 1;
    map.set(date, current);
  }

  return Array.from(map.entries())
    .map(([date, value]) => ({
      date,
      label: formatChartDate(date),
      value: config.average ? value.total / Math.max(value.count, 1) : value.total,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function buildBpSeries(rows: any[]) {
  const map = new Map<string, { sbp: number; dbp: number; count: number }>();

  for (const item of rows || []) {
    const date = chartDateFromItem(item, [
      "exam_date",
      "mcu_date",
      "log_date",
      "created_at",
      "updated_at",
    ]);

    const sbp = firstNumber([
      item?.systolic,
      item?.sbp,
      item?.baseline_sbp,
      item?.systolic_bp,
    ]);

    const dbp = firstNumber([
      item?.diastolic,
      item?.dbp,
      item?.baseline_dbp,
      item?.diastolic_bp,
    ]);

    if (!date || sbp <= 0) continue;

    const current = map.get(date) || { sbp: 0, dbp: 0, count: 0 };
    current.sbp += sbp;
    current.dbp += dbp;
    current.count += 1;
    map.set(date, current);
  }

  const rowsOut = Array.from(map.entries())
    .map(([date, value]) => ({
      date,
      label: formatChartDate(date),
      sbp: Math.round(value.sbp / Math.max(value.count, 1)),
      dbp: Math.round(value.dbp / Math.max(value.count, 1)),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    systolic: rowsOut.map((item) => ({
      date: item.date,
      label: item.label,
      value: item.sbp,
    })),
    diastolic: rowsOut
      .filter((item) => item.dbp > 0)
      .map((item) => ({
        date: item.date,
        label: item.label,
        value: item.dbp,
      })),
  };
}

function mergeBpSeries(systolic: ChartPoint[], diastolic: ChartPoint[]) {
  const dbpMap = new Map(diastolic.map((item) => [item.date, item.value]));

  return systolic
    .map((item) => ({
      date: item.date,
      label: item.label,
      sbp: item.value,
      dbp: Number(dbpMap.get(item.date) || 0),
    }))
    .filter((item) => item.sbp > 0 && item.dbp > 0);
}

function chartDateFromItem(item: any, keys: string[]) {
  for (const key of keys) {
    const raw = clean(item?.[key]);
    if (!raw) continue;

    const iso = raw.match(/\d{4}-\d{2}-\d{2}/);
    if (iso) return iso[0];

    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  return "";
}

function chartCaloriesValue(item: any) {
  const raw = parseRawPayloadForChart(item);

  return firstNumber([
    item?.calories,
    item?.total_calories,
    item?.active_calories,
    raw?.calories,
    raw?.total_calories,
    raw?.active_calories,
    raw?.original_payload?.calories,
    raw?.original_payload?.active_calories,
  ]);
}

function parseRawPayloadForChart(item: any) {
  const raw = item?.raw_payload;

  if (!raw) return {};

  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  if (typeof raw === "object") return raw;

  return {};
}

function firstNumber(values: any[]) {
  for (const value of values) {
    const n = Number(String(value ?? "").replace(/\./g, "").replace(",", "."));

    if (Number.isFinite(n) && n > 0) return n;
  }

  return 0;
}

function latestValue(data: ChartPoint[]) {
  if (!data || data.length === 0) return 0;

  return Number(data[data.length - 1]?.value || 0);
}

function buildSmoothSvgChart(data: ChartPoint[], width: number, height: number) {
  const paddingX = 32;
  const paddingY = 28;
  const values = data.map((item) => Number(item.value || 0));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const spread = max - min || 1;

  const points = data.map((item, index) => {
    const x =
      paddingX +
      (index / Math.max(data.length - 1, 1)) * (width - paddingX * 2);

    const y =
      height -
      paddingY -
      ((Number(item.value || 0) - min) / spread) * (height - paddingY * 2);

    return {
      ...item,
      x,
      y,
    };
  });

  const path = smoothPathFromPoints(points.map((item) => ({ x: item.x, y: item.y })));
  const baseY = height - paddingY;
  const areaPath =
    points.length > 0
      ? `${path} L ${points[points.length - 1].x} ${baseY} L ${points[0].x} ${baseY} Z`
      : "";

  function limitY(limitValue: number) {
    return (
      height -
      paddingY -
      ((limitValue - min) / spread) * (height - paddingY * 2)
    );
  }

  return {
    points,
    path,
    areaPath,
    limitY,
  };
}

function buildDualSmoothSvgChart(data: BpPoint[], width: number, height: number) {
  const paddingX = 32;
  const paddingY = 28;
  const values = data.flatMap((item) => [item.sbp, item.dbp]).filter((n) => n > 0);
  const min = Math.min(...values, 60);
  const max = Math.max(...values, 160);
  const spread = max - min || 1;

  const points = data.map((item, index) => {
    const x =
      paddingX +
      (index / Math.max(data.length - 1, 1)) * (width - paddingX * 2);

    const sbpY =
      height -
      paddingY -
      ((Number(item.sbp || 0) - min) / spread) * (height - paddingY * 2);

    const dbpY =
      height -
      paddingY -
      ((Number(item.dbp || 0) - min) / spread) * (height - paddingY * 2);

    return {
      ...item,
      x,
      sbpY,
      dbpY,
    };
  });

  return {
    points,
    sbpPath: smoothPathFromPoints(points.map((item) => ({ x: item.x, y: item.sbpY }))),
    dbpPath: smoothPathFromPoints(points.map((item) => ({ x: item.x, y: item.dbpY }))),
  };
}

function smoothPathFromPoints(points: Array<{ x: number; y: number }>) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  return points
    .map((point, index) => {
      if (index === 0) return `M ${point.x} ${point.y}`;

      const previous = points[index - 1];
      const midX = (previous.x + point.x) / 2;

      return `C ${midX} ${previous.y}, ${midX} ${point.y}, ${point.x} ${point.y}`;
    })
    .join(" ");
}

function formatChartDate(value: any) {
  const raw = clean(value);

  if (!raw) return "-";

  const iso = raw.match(/\d{4}-\d{2}-\d{2}/);
  const text = iso ? iso[0] : raw.slice(0, 10);
  const parts = text.split("-");

  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}`;
  }

  return text;
}

function slug(value: string) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

