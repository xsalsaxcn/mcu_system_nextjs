"use client";

import { useEffect, useMemo, useState } from "react";
import { wellnessStreakWorkoutCalories } from "@/lib/wellness/streak";

// WELLNESS_CHART_DEVICE_PRIMARY_SOURCE_V72
// WELLNESS_CHART_TODAY_ONLY_SUMMARY_V73
// WELLNESS_CHART_NO_GOOGLE_FIT_CALORIE_GUESS_V79N
// WELLNESS_CHART_GOOGLE_FIT_TOTAL_DISPLAY_V79O
// WELLNESS_GOOGLEFIT_TOTAL_ENERGY_INFO_GRAPH_V126M118
// Display-only: active workout stays canonical; Google Fit total energy is shown in a separate informational graph only.

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
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((entry) => entry.type === "year")?.value || "";
  const month = parts.find((entry) => entry.type === "month")?.value || "";
  const day = parts.find((entry) => entry.type === "day")?.value || "";

  return year && month && day
    ? `${year}-${month}-${day}`
    : new Date().toISOString().slice(0, 10);
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

  // WELLNESS_PORTAL_CHART_COACH_TARGET_PARITY_V126M59
  // Grafik harus memakai current effective target yang sama dengan Ringkasan/Coach.
  // wellness_streak_targets dikirim oleh Portal participant payload dari canonical
  // participant streak target pipeline. Field legacy tetap hanya sebagai fallback.
  const workoutMinTarget = Number(
    participant?.wellness_streak_targets?.workout_min_calories ||
      participant?.workout_min_calories ||
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

  // WELLNESS_GOOGLEFIT_PARTICIPANT_DISPLAY_PARITY_V126M116
  // V79O used total Google Fit energy when exact active calories were absent.
  // Since V111 provides the canonical conservative ACTIVE fallback, the chart
  // must always use chartCaloriesValue()/wellnessStreakWorkoutCalories instead.
  // Total energy remains informational only and never becomes workout/streak/point.
  const googleFitLegacyTotalRowsPresentV126M116 = useMemo(
    () =>
      normalizeWorkoutItemsForChartV72(workoutItems || []).some((item: any) =>
        googleFitTotalOnlyRowV79O(item),
      ),
    [JSON.stringify(workoutItems || [])],
  );

  const workoutSeries = useMemo(() => {
    return aggregateChartSeries(normalizeWorkoutItemsForChartV72(workoutItems || []), {
      dateKeys: ["log_date", "created_at", "updated_at", "date"],
      valueGetter: (item: any) => chartCaloriesValue(item),
      average: false,
    });
  }, [JSON.stringify(workoutItems || [])]);

  const googleFitTotalEnergySeriesV126M118 = useMemo(() => {
    return aggregateChartSeries(
      normalizeWorkoutItemsForChartV72(workoutItems || []).filter(
        (item: any) => chartDeviceProviderV72(item) === "google_fit",
      ),
      {
        dateKeys: ["log_date", "created_at", "updated_at", "date"],
        valueGetter: (item: any) => chartGoogleFitTotalCaloriesV79O(item),
        average: false,
      },
    );
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

  // V73: kartu status adalah kondisi hari ini, bukan nilai terakhir yang pernah diisi.
  // Grafik historis di bawah tetap memakai seluruh nutritionSeries/workoutSeries.
  const todayKeyV73 = todayDate();
  const todayNutrition = Number(
    nutritionSeries.find((item) => item.date === todayKeyV73)?.value || 0
  );
  const todayWorkout = Number(
    workoutSeries.find((item) => item.date === todayKeyV73)?.value || 0
  );

  const todayGoogleFitTotalEnergyV126M118 = Number(
    googleFitTotalEnergySeriesV126M118.find((item) => item.date === todayKeyV73)?.value || 0
  );

  const nutritionRedFlag = todayNutrition > nutritionLimit;
  const workoutRedFlag =
    todayWorkout > 0 &&
    todayWorkout < workoutMinTarget;

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

        <div className="mt-5">
          <WorkoutMomentumSpotlight data={workoutSeries} target={workoutMinTarget} />
        </div>

        {googleFitLegacyTotalRowsPresentV126M116 ? (
          <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-bold leading-5 text-blue-900">
            Grafik workout memakai kalori aktif canonical yang sama dengan Ringkasan, Coach, streak, dan point. Energi total Google Fit yang mencakup basal ditampilkan pada grafik informasi terpisah dan tidak pernah dipakai sebagai nilai workout.
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <ChartStatusCard
            title="Kalori masuk hari ini"
            value={`${fmtNumber(todayNutrition, 0)} kkal`}
            note={`Limit ${fmtNumber(nutritionLimit, 0)} kkal per hari`}
            danger={nutritionRedFlag}
            dangerText="Red flag: konsumsi melebihi limit harian"
            safeText={
              todayNutrition > 0
                ? "Masih dalam batas harian"
                : "Belum ada input nutrisi hari ini"
            }
          />

          <ChartStatusCard
            title="Workout aktif hari ini"
            value={`${fmtNumber(todayWorkout, 0)} kkal`}
            note={`Target minimal ${fmtNumber(workoutMinTarget, 0)} kkal per hari`}
            danger={workoutRedFlag}
            dangerText="Red flag: kalori workout aktif masih di bawah target"
            safeText={
              todayWorkout > 0
                ? "Kalori workout aktif terbaca dari provider/canonical resolver"
                : "Belum ada workout aktif hari ini"
            }
          />
          {todayGoogleFitTotalEnergyV126M118 > 0 ? (
            <div className="md:col-span-2 rounded-[1.3rem] border border-blue-100 bg-blue-50 px-4 py-3">
              <div className="text-[10px] font-black uppercase tracking-wide text-blue-500">
                Energi total Google Fit · informasi
              </div>
              <div className="mt-1 text-lg font-black text-blue-950">
                {fmtNumber(todayGoogleFitTotalEnergyV126M118, 0)} kkal
              </div>
              <div className="mt-1 text-[10px] font-bold leading-4 text-blue-700">
                Termasuk energi basal/istirahat. Nilai ini tidak dipakai untuk target workout, streak, atau point.
              </div>
            </div>
          ) : null}
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
          title="Grafik Workout Kalori Aktif"
          description="Kalori workout aktif per hari dari manual, Google Fit, atau Health Connect. Nilai ini yang dipakai untuk target workout; rule streak/point tetap mengikuti resolver canonical."
          unit="kkal"
          data={workoutSeries}
          limit={workoutMinTarget}
          dangerMode="below"
          emptyText="Belum ada data workout aktif untuk dibuat grafik."
        />

        <SmoothDashboardChart
          title="Energi Total Google Fit · Informasi"
          description="Energi total provider per hari, termasuk komponen basal/istirahat. Grafik ini hanya informasi dan tidak digunakan untuk target workout, streak, point, atau penentuan status peserta."
          unit="kkal"
          data={googleFitTotalEnergySeriesV126M118}
          emptyText="Belum ada snapshot energi total Google Fit untuk ditampilkan."
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


// WELLNESS_CHART_WORKOUT_SPOTLIGHT_V66
// WELLNESS_CHART_WORKOUT_TOOLTIP_V69
function WorkoutMomentumSpotlight({ data, target }: { data: ChartPoint[]; target: number }) {
  const series = data.slice(-7);
  const rows =
    series.length > 0
      ? series
      : Array.from({ length: 7 }, (_, index) => ({
          date: `empty-${index}`,
          label: "-",
          value: 0,
        }));
  const maximum = Math.max(target || 0, ...rows.map((item) => Number(item.value || 0)), 1);
  const latest = series.length ? Number(series[series.length - 1]?.value || 0) : 0;
  const achievement = target > 0 ? Math.round((latest / target) * 100) : 0;
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const selectedIndex = activeIndex ?? Math.max(0, rows.length - 1);
  const selected = rows[selectedIndex] || rows[rows.length - 1];
  const selectedValue = Number(selected?.value || 0);
  const selectedAchievement = target > 0 ? Math.round((selectedValue / target) * 100) : 0;
  const targetHeight = Math.min(104, (Math.max(0, target) / maximum) * 104);

  return (
    <article className="rounded-[1.7rem] border border-teal-100 bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 p-4 text-white shadow-xl shadow-teal-900/10">
      <div className="flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-300">Workout Momentum</div>
          <h3 className="mt-1 text-xl font-black leading-tight text-white">Kalori Workout 7 Hari</h3>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-300">Pilih batang untuk melihat detail harian.</p>
        </div>
        <div className="w-full rounded-2xl bg-white/10 px-3 py-2 text-left backdrop-blur min-[420px]:w-auto min-[420px]:shrink-0 min-[420px]:text-right">
          <div className="text-xl font-black leading-tight text-white">{fmtNumber(latest)} kkal</div>
          <div className="mt-1 text-[10px] font-black text-teal-300">{achievement}% target</div>
        </div>
      </div>

      <div className="relative mt-5 flex h-44 items-end gap-1.5 border-b border-white/15 pb-7 pt-8 sm:gap-2">
        {target > 0 ? (
          <div
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-teal-300/55"
            style={{ bottom: `${28 + targetHeight}px` }}
          />
        ) : null}

        {rows.map((item, index) => {
          const numericValue = Number(item.value || 0);
          const height = Math.max(numericValue > 0 ? 12 : 5, (numericValue / maximum) * 104);
          const isSelected = index === selectedIndex;
          const alignClass = index === 0 ? "left-0" : index === rows.length - 1 ? "right-0" : "left-1/2 -translate-x-1/2";

          return (
            <button
              type="button"
              key={`${item.date}-${index}`}
              className="relative flex min-w-0 flex-1 flex-col items-center justify-end gap-2 outline-none"
              aria-label={`${item.label}: ${fmtNumber(numericValue)} kkal`}
              onPointerEnter={() => setActiveIndex(index)}
              onPointerDown={() => setActiveIndex(index)}
              onTouchStart={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              onClick={() => setActiveIndex(index)}
            >
              <div className="relative flex h-[104px] w-full items-end justify-center overflow-visible">
                {isSelected ? (
                  <div
                    className={`pointer-events-none absolute z-30 min-w-[88px] rounded-xl bg-white px-2.5 py-2 text-left text-slate-950 shadow-2xl ${alignClass}`}
                    style={{ bottom: `${Math.min(116, height + 12)}px` }}
                  >
                    <div className="text-[10px] font-black text-slate-500">{item.label}</div>
                    <div className="mt-0.5 whitespace-nowrap text-xs font-black">{fmtNumber(numericValue)} kkal</div>
                    <span
                      className={`absolute -bottom-1.5 h-3 w-3 rotate-45 bg-white ${
                        index === 0 ? "left-4" : index === rows.length - 1 ? "right-4" : "left-1/2 -translate-x-1/2"
                      }`}
                    />
                  </div>
                ) : null}

                <div
                  className={`w-[62%] max-w-7 rounded-t-full bg-gradient-to-t from-teal-500 to-emerald-300 transition-all duration-500 ${
                    isSelected
                      ? "ring-2 ring-white shadow-[0_0_24px_rgba(45,212,191,0.55)]"
                      : "opacity-75"
                  }`}
                  style={{ height: `${height}px` }}
                />
              </div>
              <span className={`whitespace-nowrap text-[8px] font-black sm:text-[9px] ${isSelected ? "text-teal-300" : "text-slate-400"}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 grid gap-2 min-[420px]:grid-cols-2">
        <div className="rounded-xl bg-white/5 px-3 py-2.5">
          <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">Hari dipilih</div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="text-xs font-black text-white">{selected?.label || "-"}</span>
            <span className="text-xs font-black text-teal-300">{fmtNumber(selectedValue)} kkal</span>
          </div>
          <div className="mt-1 text-[9px] font-bold text-slate-400">{selectedAchievement}% dari target</div>
        </div>
        <div className="rounded-xl bg-white/5 px-3 py-2.5">
          <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">Target Coach</div>
          <div className="mt-1 text-xs font-black text-white">{target > 0 ? `${fmtNumber(target)} kkal / hari` : "Belum ditetapkan"}</div>
          <div className="mt-1 text-[9px] font-bold text-slate-400">Garis putus-putus pada grafik</div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-teal-400 to-emerald-300 transition-all duration-700"
            style={{ width: `${Math.min(100, achievement)}%` }}
          />
        </div>
        <span className="w-14 shrink-0 text-right text-xs font-black text-teal-300">{achievement}%</span>
      </div>
    </article>
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

// WELLNESS_CHART_ADAPTIVE_TOOLTIP_V52
// Menjaga tooltip tetap berada di dalam card dan memberi pulse halus pada titik aktif/terakhir.
function clampChartValue(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function adaptiveChartTooltipStyle(
  point: { x: number; y: number },
  width = 620,
  height = 250
) {
  const rawLeft = (point.x / width) * 100;
  const rawTop = (point.y / height) * 100;
  const placeBelow = point.y <= height * 0.38;

  let left = clampChartValue(rawLeft, 4, 96);
  let translateX = "-50%";

  if (rawLeft < 18) {
    left = 4;
    translateX = "0%";
  } else if (rawLeft > 82) {
    left = 96;
    translateX = "-100%";
  }

  const top = placeBelow
    ? clampChartValue(rawTop + 8, 8, 84)
    : clampChartValue(rawTop - 6, 12, 88);

  return {
    left: `${left}%`,
    top: `${top}%`,
    transform: `translate(${translateX}, ${placeBelow ? "0%" : "-100%"})`,
  };
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
                {activeIndex === index ||
                (activeIndex === null && index === chart.points.length - 1) ? (
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={activeIndex === index ? "16" : "13"}
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
              className="pointer-events-none absolute z-10 max-w-[calc(100%_-_1.5rem)] whitespace-nowrap rounded-2xl bg-slate-950 px-3 py-2 text-center text-xs font-black text-white shadow-xl"
              style={adaptiveChartTooltipStyle(activePoint, 620, 250)}
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

  const activeChartPoint =
    activeIndex !== null && chart.points[activeIndex]
      ? chart.points[activeIndex]
      : chart.points[chart.points.length - 1];

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
                {activeIndex === index ||
                (activeIndex === null && index === chart.points.length - 1) ? (
                  <>
                    <circle
                      cx={point.x}
                      cy={point.sbpY}
                      r="13"
                      fill="#ef4444"
                      opacity="0.12"
                      className="animate-ping"
                    />
                    <circle
                      cx={point.x}
                      cy={point.dbpY}
                      r="13"
                      fill="#0f766e"
                      opacity="0.12"
                      className="animate-ping"
                    />
                  </>
                ) : null}

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

          {active && activeChartPoint ? (
            <div
              className="pointer-events-none absolute z-10 max-w-[calc(100%_-_1.5rem)] whitespace-nowrap rounded-2xl bg-slate-950 px-3 py-2 text-center text-xs font-black text-white shadow-xl"
              style={adaptiveChartTooltipStyle(
                {
                  x: activeChartPoint.x,
                  y: Math.min(activeChartPoint.sbpY, activeChartPoint.dbpY),
                },
                620,
                250
              )}
            >
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

function chartDeviceProviderV72(item: any) {
  const raw = parseRawPayloadForChart(item);
  const source = clean(item?.source || item?.input_source || item?.provider || raw?.provider).toLowerCase();
  const externalId = clean(item?.external_activity_id || item?.provider_activity_id).toLowerCase();
  const name = clean(item?.activity_name || item?.activity_type).toLowerCase();
  const mode = clean(raw?.sync_mode).toLowerCase();

  if (
    (source === "health_connect" || source === "health-connect") &&
    (externalId.includes("health_connect_daily_") ||
      name.includes("health connect daily") ||
      mode === "daily_aggregate")
  ) {
    return "health_connect";
  }

  if (
    (source === "google_fit" || source === "google-fit") &&
    (externalId.includes("google_fit_daily_") ||
      name.includes("google fit daily") ||
      mode === "aggregate_daily")
  ) {
    return "google_fit";
  }

  return "";
}

function chartDateKeyV72(item: any) {
  return clean(
    item?.log_date || item?.date || item?.started_at || item?.created_at || item?.updated_at
  ).slice(0, 10);
}

function chartUpdatedAtV72(item: any) {
  const raw = parseRawPayloadForChart(item);
  const date = new Date(
    raw?.health_connect_last_sync_at ||
      raw?.google_fit_last_sync_at ||
      item?.updated_at ||
      item?.created_at ||
      item?.started_at ||
      ""
  );

  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function chartStepsValueV72(item: any) {
  const raw = parseRawPayloadForChart(item);
  return firstNumber([
    item?.steps,
    item?.total_steps,
    raw?.health_connect_steps,
    raw?.google_fit_steps,
    raw?.steps,
    raw?.original_payload?.steps,
  ]);
}

function chartEstimatedCaloriesV72(item: any) {
  const raw = parseRawPayloadForChart(item);
  const steps = chartStepsValueV72(item);
  const minutes = firstNumber([
    item?.duration_minutes,
    raw?.health_connect_active_minutes,
    raw?.google_fit_active_minutes,
    raw?.active_minutes,
  ]);

  if (steps > 0) return Math.max(1, Math.round(Math.min(steps * 0.0371, steps * 0.1)));
  if (minutes > 0) return Math.min(1200, Math.max(1, Math.round(minutes * 4.2)));
  return 0;
}

function chartCaloriesValue(item: any) {
  const raw = parseRawPayloadForChart(item);
  const provider = chartDeviceProviderV72(item);

  if (provider === "health_connect") {
    return firstNumber([
      raw?.selected_active_calories,
      raw?.health_connect_calories_used === true
        ? raw?.health_connect_calories_original
        : 0,
      item?.calories,
      item?.total_calories,
      raw?.health_connect_calories,
      chartEstimatedCaloriesV72(item),
    ]);
  }

  if (provider === "google_fit") {
    // WELLNESS_GOOGLEFIT_ACTIVE_ESTIMATE_FALLBACK_V126M111_PARTICIPANT_CHART
    // Keep participant charts on the same canonical ACTIVE-workout semantics as
    // Coach/Admin/Streak. Google Fit total energy remains display-only.
    return wellnessStreakWorkoutCalories(item);
  }

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


function chartGoogleFitTotalCaloriesV79O(item: any) {
  const raw = parseRawPayloadForChart(item);
  return firstNumber([
    raw?.google_fit_total_calories,
    raw?.google_fit_calories_expended,
    raw?.exact_snapshot?.total_calories,
    raw?.last_sync_snapshot?.total_calories,
    raw?.original_payload?.calories_expended,
    raw?.original_payload?.calories,
  ]);
}

function googleFitTotalOnlyRowV79O(item: any) {
  const raw = parseRawPayloadForChart(item);
  return (
    chartDeviceProviderV72(item) === "google_fit" &&
    raw?.active_calories_available === false &&
    chartGoogleFitTotalCaloriesV79O(item) > 0
  );
}

function chartDailyPriorityV72(item: any) {
  const provider = chartDeviceProviderV72(item);
  const raw = parseRawPayloadForChart(item);

  if (provider === "health_connect") {
    if (
      firstNumber([raw?.selected_active_calories]) > 0 ||
      (raw?.health_connect_calories_used === true &&
        firstNumber([raw?.health_connect_calories_original]) > 0)
    ) {
      return 400;
    }
    return 300;
  }

  if (provider === "google_fit") return 200;
  return 0;
}

function normalizeWorkoutItemsForChartV72(items: any[] = []) {
  const result = new Map<string, any>();

  for (const item of items || []) {
    const provider = chartDeviceProviderV72(item);
    const date = chartDateKeyV72(item);
    const key = provider
      ? `device_daily_${date}`
      : String(
          item?.id ||
            item?.external_activity_id ||
            item?.provider_activity_id ||
            `${date}-${result.size}`
        );
    const previous = result.get(key);

    if (!previous) {
      result.set(key, item);
      continue;
    }

    if (provider && chartDeviceProviderV72(previous)) {
      const currentPriority = chartDailyPriorityV72(item);
      const previousPriority = chartDailyPriorityV72(previous);

      if (currentPriority > previousPriority) {
        result.set(key, item);
        continue;
      }

      if (currentPriority < previousPriority) continue;
    }

    const currentQuality = chartStepsValueV72(item) * 1000 + chartCaloriesValue(item);
    const previousQuality = chartStepsValueV72(previous) * 1000 + chartCaloriesValue(previous);

    if (
      currentQuality > previousQuality ||
      (currentQuality === previousQuality &&
        chartUpdatedAtV72(item) >= chartUpdatedAtV72(previous))
    ) {
      result.set(key, item);
    }
  }

  return [...result.values()];
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
    if (typeof value === "number") {
      if (Number.isFinite(value) && value > 0) return value;
      continue;
    }

    const text = String(value ?? "").trim();
    if (!text) continue;

    const normalized = text.includes(",")
      ? text.replace(/\./g, "").replace(",", ".")
      : text.replace(/[^0-9.-]/g, "");
    const n = Number(normalized);

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

