"use client";

import { useState } from "react";

// WELLNESS_MOMENTUM_UI_POLISH_V69
// WELLNESS_GOOGLE_FIT_TOTAL_DISPLAY_V79O
// Improves mobile card proportions, full day labels, and interactive bar values without changing calculations or data sources.

// WELLNESS_MOMENTUM_STREAK_V66
// Shared visual dashboard for participant and coach. Pure presentation; no database writes.

export type WellnessMomentumDay = {
  date: string;
  label: string;
  nutritionCount: number;
  nutritionCalories: number;
  workoutCalories: number;
  workoutTitle?: string;
  workoutSubtitle?: string;
  workoutTargetEnabled?: boolean;
  steps: number;
  success: boolean;
};

type Tone = "teal" | "orange" | "blue" | "violet";

type Props = {
  days: WellnessMomentumDay[];
  currentStreak: number;
  successDates?: string[];
  nutritionCount: number;
  nutritionCalories: number;
  workoutCalories: number;
  workoutTitle?: string;
  workoutSubtitle?: string;
  workoutTargetEnabled?: boolean;
  steps: number;
  nutritionTarget?: number;
  workoutTarget?: number;
  stepsTarget?: number;
  currentWeight?: number;
  baselineWeight?: number;
  targetWeight?: number;
  bmi?: number | null;
  systolic?: number | null;
  diastolic?: number | null;
  totalPoints?: number;
  healthTalkCount?: number;
  mode?: "participant" | "coach";
  compact?: boolean;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));
}

function percent(value: number, target: number) {
  if (!(target > 0)) return 0;
  return Math.max(0, (value / target) * 100);
}

function fmt(value: number, digits = 0) {
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(Number.isFinite(value) ? value : 0);
}

function momentumDayLabel(day: WellnessMomentumDay) {
  const raw = String(day.label || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(day.date)) {
    const parsed = new Date(`${day.date}T12:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed
        .toLocaleDateString("id-ID", { weekday: "short" })
        .replace(/\./g, "")
        .slice(0, 3);
    }
  }

  if (!raw || raw === "-") return "-";
  return raw.replace(/\./g, "").slice(0, 3);
}

function dateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function weightProgress(current: number, baseline: number, target: number) {
  if (!(current > 0) || !(target > 0)) return 0;
  if (!(baseline > 0) || baseline === target) return Math.abs(current - target) <= 0.5 ? 100 : 0;
  const total = Math.abs(baseline - target);
  const remaining = Math.abs(current - target);
  return clamp(((total - remaining) / total) * 100);
}

const toneMap: Record<Tone, { bar: string; text: string; soft: string; icon: string }> = {
  teal: {
    bar: "bg-gradient-to-r from-teal-500 to-emerald-400",
    text: "text-teal-700",
    soft: "bg-teal-50",
    icon: "bg-teal-50 text-teal-700",
  },
  orange: {
    bar: "bg-gradient-to-r from-orange-500 to-amber-400",
    text: "text-orange-600",
    soft: "bg-orange-50",
    icon: "bg-orange-50 text-orange-600",
  },
  blue: {
    bar: "bg-gradient-to-r from-blue-600 to-sky-400",
    text: "text-blue-700",
    soft: "bg-blue-50",
    icon: "bg-blue-50 text-blue-700",
  },
  violet: {
    bar: "bg-gradient-to-r from-violet-600 to-fuchsia-400",
    text: "text-violet-700",
    soft: "bg-violet-50",
    icon: "bg-violet-50 text-violet-700",
  },
};

function WeeklyMetricCard({
  title,
  subtitle,
  value,
  target,
  valueLabel,
  icon,
  tone,
  days,
  dayValue,
  dayValueLabel,
  limitMode = false,
  showProgress = true,
}: {
  title: string;
  subtitle: string;
  value: number;
  target: number;
  valueLabel: string;
  icon: string;
  tone: Tone;
  days: WellnessMomentumDay[];
  dayValue: (day: WellnessMomentumDay) => number;
  dayValueLabel: (value: number) => string;
  limitMode?: boolean;
  showProgress?: boolean;
}) {
  const colors = toneMap[tone];
  const rawPercent = percent(value, target);
  const fillPercent = clamp(rawPercent);
  const maximum = Math.max(target || 0, ...days.map(dayValue), 1);
  const [activeIndex, setActiveIndex] = useState(Math.max(0, days.length - 1));
  const selectedDay = days[activeIndex] || days[days.length - 1];
  const selectedValue = selectedDay ? dayValue(selectedDay) : 0;

  return (
    <article
      aria-label={
        showProgress
          ? `${title}: ${Math.round(rawPercent)}% dari ${limitMode ? "batas" : "target"}`
          : `${title}: ${valueLabel}`
      }
      className="min-w-0 overflow-hidden rounded-[1.45rem] border border-slate-100 bg-white p-4 shadow-[0_12px_35px_rgba(15,23,42,0.07)]"
    >
      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-3">
        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-lg ${colors.icon}`}>
          {icon}
        </div>

        <div className="min-w-0">
          <h3 className="text-sm font-black leading-5 text-slate-950">{title}</h3>
          <div className={`mt-1 break-words text-[13px] font-black leading-5 ${colors.text}`}>
            {valueLabel}
          </div>
          <p className="mt-0.5 text-[11px] font-bold leading-4 text-slate-400">{subtitle}</p>
        </div>
      </div>

      <div className={`mt-3 flex items-center justify-between gap-2 rounded-xl px-3 py-2 ${colors.soft}`}>
        <span className="text-[10px] font-black text-slate-500">
          {selectedDay ? momentumDayLabel(selectedDay) : "-"}
        </span>
        <span className={`text-[11px] font-black ${colors.text}`}>{dayValueLabel(selectedValue)}</span>
      </div>

      <div className="mt-3 flex h-[96px] items-end gap-1.5 border-b border-dashed border-slate-200 pb-2">
        {days.map((day, index) => {
          const dayNumber = dayValue(day);
          const height = Math.max(dayNumber > 0 ? 10 : 3, (dayNumber / maximum) * 58);
          const isSelected = index === activeIndex;
          const dayLabel = momentumDayLabel(day);

          return (
            <button
              type="button"
              key={`${day.date}-${title}`}
              className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5 outline-none"
              aria-label={`${dayLabel}: ${dayValueLabel(dayNumber)}`}
              onPointerEnter={() => setActiveIndex(index)}
              onPointerDown={() => setActiveIndex(index)}
              onTouchStart={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              onClick={() => setActiveIndex(index)}
            >
              <div className="flex h-[60px] w-full items-end justify-center">
                <div
                  className={`w-[58%] max-w-6 rounded-t-full transition-all duration-500 ${colors.bar} ${
                    isSelected
                      ? "ring-2 ring-white shadow-[0_0_0_4px_rgba(20,184,166,0.12)]"
                      : "opacity-70"
                  }`}
                  style={{ height: `${height}px` }}
                />
              </div>
              <span className={`whitespace-nowrap text-[8px] font-black leading-none ${isSelected ? colors.text : "text-slate-400"}`}>
                {dayLabel}
              </span>
            </button>
          );
        })}
      </div>

      {showProgress ? (
        <div className="mt-3 flex items-center gap-2.5">
          <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all duration-700 ${colors.bar}`}
              style={{ width: `${fillPercent}%` }}
            />
          </div>
          <span className={`w-11 shrink-0 text-right text-xs font-black ${colors.text}`}>
            {Math.round(rawPercent)}%
          </span>
        </div>
      ) : (
        <div className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-[10px] font-black leading-4 text-blue-700">
          Nilai ditampilkan persis dari provider dan tidak dibandingkan dengan target workout.
        </div>
      )}
    </article>
  );
}

function WeeklyStreak({ days, currentStreak }: { days: WellnessMomentumDay[]; currentStreak: number }) {
  return (
    <article className="rounded-[1.7rem] border border-slate-100 bg-white p-4 shadow-[0_12px_35px_rgba(15,23,42,0.07)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-slate-950">Streak Mingguan</h3>
          <p className="mt-1 text-[11px] font-bold text-slate-400">Target nutrisi dan workout tercapai</p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl bg-teal-50 px-3 py-2 text-teal-700">
          <span className="text-2xl">🔥</span>
          <div>
            <div className="text-xl font-black leading-none">{currentStreak}</div>
            <div className="mt-1 text-[9px] font-black uppercase tracking-wide">hari</div>
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-7 gap-1.5">
        {days.map((day, index) => {
          const latest = index === days.length - 1;
          return (
            <div key={`streak-${day.date}`} className="text-center">
              <div
                className={`mx-auto grid h-8 w-8 place-items-center rounded-full border text-xs font-black transition ${
                  day.success
                    ? "border-emerald-500 bg-emerald-500 text-white shadow-md shadow-emerald-100"
                    : latest
                      ? "border-blue-500 bg-white text-blue-600"
                      : "border-slate-100 bg-slate-100 text-slate-300"
                }`}
              >
                {day.success ? "✓" : latest ? "•" : ""}
              </div>
              <div className={`mt-1.5 text-[9px] font-black ${latest ? "text-blue-600" : "text-slate-400"}`}>
                {day.label}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-2xl bg-gradient-to-r from-teal-50 to-sky-50 px-3 py-3 text-[11px] font-bold leading-5 text-teal-800">
        ✨ Konsistensi adalah kunci. Pertahankan streak-mu setiap hari.
      </div>
    </article>
  );
}

function MonthlyCalendar({ successDates }: { successDates: string[] }) {
  const successSet = new Set(successDates);
  // WELLNESS_COACH_TARGET_STREAK_PARITY_V126M109_1_CURRENT_MONTH_CALENDAR
  // Always open the calendar on the current month. Historical success dates
  // remain intact; they simply no longer force the UI back to the last success month.
  const reference = new Date();
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const cells = Array.from({ length: firstDay + totalDays }, (_, index) => {
    if (index < firstDay) return null;
    const day = index - firstDay + 1;
    const date = new Date(year, month, day);
    return { day, key: dateKey(date), today: dateKey(date) === dateKey(new Date()) };
  });

  return (
    <article className="rounded-[1.7rem] border border-slate-100 bg-white p-4 shadow-[0_12px_35px_rgba(15,23,42,0.07)]">
      <div>
        <h3 className="text-base font-black text-slate-950">Kalender Streak</h3>
        <p className="mt-1 text-[11px] font-bold text-slate-400">
          {reference.toLocaleDateString("id-ID", { month: "long", year: "numeric" })}
        </p>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[9px] font-black text-slate-400">
        {['M','S','S','R','K','J','S'].map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1.5">
        {cells.map((cell, index) => (
          <div key={`calendar-${index}`} className="grid h-7 place-items-center">
            {cell ? (
              <span
                className={`grid h-7 w-7 place-items-center rounded-full text-[10px] font-black ${
                  successSet.has(cell.key)
                    ? "bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-sm shadow-orange-200"
                    : cell.today
                      ? "border border-blue-500 bg-blue-50 text-blue-700"
                      : "text-slate-500"
                }`}
              >
                {cell.day}
              </span>
            ) : null}
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-3 text-[9px] font-bold text-slate-500">
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-orange-500" /> Target tercapai</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-slate-200" /> Belum tercapai</span>
      </div>
    </article>
  );
}

export default function WellnessMomentumDashboard({
  days,
  currentStreak,
  successDates = [],
  nutritionCount,
  nutritionCalories,
  workoutCalories,
  workoutTitle = "Kalori Workout",
  workoutSubtitle = "Target terbakar",
  workoutTargetEnabled = true,
  steps,
  nutritionTarget = 0,
  workoutTarget = 0,
  stepsTarget = 8000,
  currentWeight = 0,
  baselineWeight = 0,
  targetWeight = 0,
  bmi = null,
  systolic = null,
  diastolic = null,
  totalPoints = 0,
  healthTalkCount = 0,
}: Props) {
  const normalizedDays = days.length > 0 ? days.slice(-7) : [];
  const fillerCount = Math.max(0, 7 - normalizedDays.length);
  const fillers = Array.from({ length: fillerCount }, (_, index) => ({
    date: `empty-${index}`,
    label: "-",
    nutritionCount: 0,
    nutritionCalories: 0,
    workoutCalories: 0,
    steps: 0,
    success: false,
  }));
  const sevenDays = [...fillers, ...normalizedDays];
  const weightPct = weightProgress(currentWeight, baselineWeight, targetWeight);

  return (
    <section className="space-y-4" data-wellness-momentum-dashboard="v66">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-700/70">Progress & Momentum</div>
          <h2 className="mt-1 text-xl font-black text-slate-950">Capaian Wellness</h2>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-2 text-[10px] font-black text-slate-500">7 Hari Terakhir</span>
      </div>

      <div className="grid grid-cols-1 gap-3 min-[440px]:grid-cols-2">
        <WeeklyMetricCard
          title="Nutrisi"
          subtitle="Target harian"
          value={nutritionCount}
          target={3}
          valueLabel={`${fmt(nutritionCount)} / 3 kali`}
          icon="🍴"
          tone="teal"
          days={sevenDays}
          dayValue={(day) => day.nutritionCount}
          dayValueLabel={(value) => `${fmt(value)} kali`}
        />
        <WeeklyMetricCard
          title="Kalori Masuk"
          subtitle="Batas harian coach"
          value={nutritionCalories}
          target={nutritionTarget}
          valueLabel={nutritionTarget > 0 ? `${fmt(nutritionCalories)} / ${fmt(nutritionTarget)} kkal` : `${fmt(nutritionCalories)} kkal`}
          icon="🔥"
          tone="orange"
          days={sevenDays}
          dayValue={(day) => day.nutritionCalories}
          dayValueLabel={(value) => `${fmt(value)} kkal`}
          limitMode
        />
        <WeeklyMetricCard
          title={workoutTitle}
          subtitle={workoutSubtitle}
          value={workoutCalories}
          target={workoutTargetEnabled ? workoutTarget : 0}
          valueLabel={
            workoutTargetEnabled && workoutTarget > 0
              ? `${fmt(workoutCalories)} / ${fmt(workoutTarget)} kkal`
              : `${fmt(workoutCalories)} kkal`
          }
          icon="🏋️"
          tone="teal"
          days={sevenDays}
          dayValue={(day) => day.workoutCalories}
          dayValueLabel={(value) => `${fmt(value)} kkal`}
          showProgress={workoutTargetEnabled}
        />
        <WeeklyMetricCard
          title="Langkah"
          subtitle="Target langkah"
          value={steps}
          target={stepsTarget}
          valueLabel={`${fmt(steps)} / ${fmt(stepsTarget)}`}
          icon="👟"
          tone="blue"
          days={sevenDays}
          dayValue={(day) => day.steps}
          dayValueLabel={(value) => `${fmt(value)} langkah`}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <WeeklyStreak days={sevenDays} currentStreak={currentStreak} />
        <MonthlyCalendar successDates={successDates} />
      </div>

      <article className="rounded-[1.7rem] border border-slate-100 bg-white p-4 shadow-[0_12px_35px_rgba(15,23,42,0.07)]">
        <div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr] md:items-center">
          <div>
            <h3 className="text-base font-black text-slate-950">Progress Berat Badan</h3>
            <p className="mt-1 text-[11px] font-bold text-slate-400">Menuju target yang ditetapkan Coach</p>
            <div className="mt-4 flex items-end gap-3">
              <div>
                <div className="text-2xl font-black text-slate-950">{currentWeight > 0 ? fmt(currentWeight, 1) : "-"} kg</div>
                <div className="text-[10px] font-bold text-slate-400">saat ini</div>
              </div>
              <span className="pb-2 text-xl font-black text-slate-400">→</span>
              <div>
                <div className="text-2xl font-black text-slate-950">{targetWeight > 0 ? fmt(targetWeight, 1) : "-"} kg</div>
                <div className="text-[10px] font-bold text-slate-400">target</div>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-400" style={{ width: `${weightPct}%` }} />
              </div>
              <span className="text-xs font-black text-teal-700">{Math.round(weightPct)}%</span>
            </div>
            {currentWeight > 0 && targetWeight > 0 ? (
              <p className="mt-2 text-[10px] font-bold text-slate-400">{fmt(Math.abs(currentWeight - targetWeight), 1)} kg dari target</p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between rounded-2xl border border-violet-100 bg-violet-50/60 px-3 py-3">
              <span className="text-xs font-black text-violet-800">⚖️ BMI</span>
              <span className="text-sm font-black text-slate-950">{bmi ? fmt(Number(bmi), 1) : "-"}</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-rose-100 bg-rose-50/60 px-3 py-3">
              <span className="text-xs font-black text-rose-800">❤️ Tensi</span>
              <span className="text-sm font-black text-slate-950">{systolic ? `${fmt(Number(systolic))}/${fmt(Number(diastolic || 0))}` : "-"}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-amber-50 px-3 py-3 text-center">
                <div className="text-[9px] font-black uppercase text-amber-700">Poin</div>
                <div className="mt-1 text-base font-black text-slate-950">{fmt(totalPoints)}</div>
              </div>
              <div className="rounded-2xl bg-indigo-50 px-3 py-3 text-center">
                <div className="text-[9px] font-black uppercase text-indigo-700">Health Talk</div>
                <div className="mt-1 text-base font-black text-slate-950">{fmt(healthTalkCount)}x</div>
              </div>
            </div>
          </div>
        </div>
      </article>
    </section>
  );
}
