"use client";

import { useEffect, useMemo, useState } from "react";
import { WellnessAvatar } from "./WellnessProfile";

// WELLNESS_COACH_GROUP_LEADERBOARD_V76
// WELLNESS_RANKING_UI_POINT_FLOW_V111
// Visual redesign only. Metric values remain supplied by the ranking API.

type Metric = "overall" | "compliance" | "workout" | "nutrition" | "healthtalk";

type MetricOption = {
  key: Metric;
  label: string;
  shortLabel: string;
  icon: string;
  activeClass: string;
  softClass: string;
};

const metricOptions: MetricOption[] = [
  {
    key: "overall",
    label: "Total Point",
    shortLabel: "Total",
    icon: "🏆",
    activeClass: "bg-slate-950 text-white shadow-slate-300/50",
    softClass: "bg-amber-50 text-amber-700",
  },
  {
    key: "compliance",
    label: "Kerajinan",
    shortLabel: "Kerajinan",
    icon: "✓",
    activeClass: "bg-teal-600 text-white shadow-teal-200/60",
    softClass: "bg-teal-50 text-teal-700",
  },
  {
    key: "workout",
    label: "Point Workout",
    shortLabel: "Workout",
    icon: "↗",
    activeClass: "bg-sky-600 text-white shadow-sky-200/60",
    softClass: "bg-sky-50 text-sky-700",
  },
  {
    key: "nutrition",
    label: "Point Nutrisi",
    shortLabel: "Nutrisi",
    icon: "✦",
    activeClass: "bg-orange-500 text-white shadow-orange-200/60",
    softClass: "bg-orange-50 text-orange-700",
  },
  {
    key: "healthtalk",
    label: "Point Health Talk",
    shortLabel: "Health Talk",
    icon: "●",
    activeClass: "bg-violet-600 text-white shadow-violet-200/60",
    softClass: "bg-violet-50 text-violet-700",
  },
];

function clean(value: any) {
  return String(value ?? "").trim();
}

function fmt(value: any) {
  const number = Number(value || 0);
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(
    Number.isFinite(number) ? number : 0,
  );
}

function formatDate(value: any) {
  const text = clean(value);
  if (!text) return "-";
  const date = new Date(`${text.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return text.slice(0, 10);
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function metricSuffix(metric: Metric) {
  return metric === "compliance" ? "%" : " poin";
}

function displayMetric(value: any, metric: Metric) {
  return `${fmt(value)}${metricSuffix(metric)}`;
}

function progressWidth(value: any) {
  return `${Math.max(3, Math.min(100, Number(value || 0)))}%`;
}

function PointBreakdown({ row }: { row: any }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5 text-[9px] font-black">
      <span className="rounded-full bg-orange-50 px-2 py-1 text-orange-700">
        Nutrisi {fmt(row?.nutrition_points)}
      </span>
      <span className="rounded-full bg-sky-50 px-2 py-1 text-sky-700">
        Workout {fmt(row?.workout_points)}
      </span>
      <span className="rounded-full bg-violet-50 px-2 py-1 text-violet-700">
        Health Talk {fmt(row?.healthtalk_points)}
      </span>
    </div>
  );
}

function ChampionCard({ row, metric, metricOption }: any) {
  if (!row) return null;

  return (
    <article className="relative overflow-hidden rounded-[1.6rem] border border-amber-200/80 bg-[linear-gradient(145deg,#fffdf6_0%,#ffffff_55%,#f6fbff_100%)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.08)] sm:p-5">
      <div className="absolute -right-8 -top-10 h-28 w-28 rounded-full bg-amber-100/70 blur-2xl" />
      <div className="relative flex items-center gap-4">
        <div className="relative shrink-0">
          <WellnessAvatar
            name={row.name}
            src={row.photo_preview_url || row.photo_url}
            size="xl"
            className="ring-4 ring-amber-100"
          />
          <span className="absolute -bottom-1 -right-1 flex h-8 min-w-8 items-center justify-center rounded-full bg-amber-400 px-2 text-sm font-black text-slate-950 ring-4 ring-white">
            1
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-amber-800">
              Peringkat Utama
            </span>
            <span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${metricOption.softClass}`}>
              {metricOption.icon} {metricOption.shortLabel}
            </span>
          </div>
          <h3 className="mt-2 break-words text-lg font-black leading-6 text-slate-950 sm:text-xl">
            {row.name}
          </h3>
          <p className="mt-0.5 break-words text-xs font-bold text-slate-500">
            {row.group_name || "-"} · streak {fmt(row.current_streak)} hari
          </p>
          <div className="mt-3 flex items-end gap-2">
            <div className="text-3xl font-black leading-none text-slate-950">
              {displayMetric(row.metric_value, metric)}
            </div>
          </div>
          <PointBreakdown row={row} />
        </div>
      </div>
    </article>
  );
}

function RunnerCard({ row, rank, metric, metricOption }: any) {
  if (!row) {
    return (
      <div className="min-h-[150px] rounded-[1.35rem] border border-dashed border-slate-200 bg-slate-50" />
    );
  }

  return (
    <article className="rounded-[1.35rem] border border-slate-200/80 bg-white p-3.5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <WellnessAvatar
            name={row.name}
            src={row.photo_preview_url || row.photo_url}
            size="md"
            className="ring-2 ring-slate-100"
          />
          <span className="absolute -bottom-1 -right-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-900 px-1.5 text-[10px] font-black text-white ring-2 ring-white">
            {rank}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-sm font-black leading-5 text-slate-950">
            {row.name}
          </h3>
          <p className="mt-0.5 break-words text-[10px] font-bold text-slate-500">
            {row.group_name || "-"}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2 border-t border-slate-100 pt-3">
        <span className={`rounded-full px-2 py-1 text-[9px] font-black ${metricOption.softClass}`}>
          {metricOption.shortLabel}
        </span>
        <span className="text-base font-black text-slate-950">
          {displayMetric(row.metric_value, metric)}
        </span>
      </div>
    </article>
  );
}

export default function WellnessLeaderboard({ groups }: { groups: any[] }) {
  const [metric, setMetric] = useState<Metric>("overall");
  const [group, setGroup] = useState("all");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>({ rows: [], period: null });
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setMessage("");
    const query = new URLSearchParams({ metric, group, days: "30" });
    const result = await fetch(
      `/api/wellness/coach/ranking?${query.toString()}&t=${Date.now()}`,
      { cache: "no-store" },
    )
      .then((response) => response.json())
      .catch((error) => ({
        ok: false,
        message: error?.message || "Network error",
      }));

    if (result?.ok) setData(result);
    else setMessage(result?.message || "Ranking gagal dimuat.");
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [metric, group]);

  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const podium = useMemo(() => rows.slice(0, 3), [rows]);
  const rest = useMemo(() => rows.slice(3, 10), [rows]);
  const activeMetric =
    metricOptions.find((item) => item.key === metric) || metricOptions[0];

  return (
    <section className="space-y-4 sm:space-y-5">
      <div className="rounded-[1.7rem] border border-slate-200/80 bg-white p-4 shadow-[0_18px_45px_rgba(15,23,42,0.06)] sm:p-5 md:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-teal-700">
              Group Performance
            </div>
            <h2 className="mt-1.5 text-2xl font-black leading-tight text-slate-950 sm:text-3xl">
              Ranking Kelompok
            </h2>
            <p className="mt-1.5 text-xs font-bold leading-5 text-slate-500 sm:text-sm">
              Point peserta selama 30 hari terakhir berdasarkan rule program yang aktif.
            </p>
            {data?.period ? (
              <p className="mt-1 text-[10px] font-bold text-slate-400">
                {formatDate(data.period.from)} – {formatDate(data.period.to)}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-xl font-black text-teal-700 shadow-sm transition hover:bg-teal-50 disabled:opacity-60"
            aria-label="Refresh ranking"
          >
            {loading ? "…" : "↻"}
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[230px_minmax(0,1fr)]">
          <select
            value={group}
            onChange={(event) => setGroup(event.target.value)}
            className="min-h-[46px] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-800 outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
          >
            <option value="all">Semua Assigned Group</option>
            {(groups || []).map((item: any) => (
              <option
                key={item.id}
                value={String(item.wellness_group_unit_id || item.group_name)}
              >
                {item.group_name}
              </option>
            ))}
          </select>

          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {metricOptions.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setMetric(item.key)}
                className={`min-h-[46px] shrink-0 rounded-2xl px-3.5 py-2.5 text-xs font-black shadow-sm transition ${
                  metric === item.key
                    ? item.activeClass
                    : "border border-slate-200 bg-white text-slate-600 hover:border-teal-200 hover:bg-teal-50"
                }`}
              >
                <span className="mr-1.5">{item.icon}</span>
                {item.shortLabel}
              </button>
            ))}
          </div>
        </div>
      </div>

      {message ? (
        <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
          {message}
        </div>
      ) : null}

      {rows.length === 0 && !loading ? (
        <div className="rounded-[1.7rem] border border-dashed border-slate-200 bg-white p-10 text-center shadow-sm">
          <div className="text-3xl">🏆</div>
          <div className="mt-3 text-sm font-black text-slate-700">
            Belum cukup data untuk ranking
          </div>
          <p className="mt-1 text-xs font-bold text-slate-400">
            Ranking akan muncul setelah point peserta tersedia.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-[1.25fr_0.75fr]">
            <ChampionCard
              row={podium[0]}
              metric={metric}
              metricOption={activeMetric}
            />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
              <RunnerCard
                row={podium[1]}
                rank={2}
                metric={metric}
                metricOption={activeMetric}
              />
              <RunnerCard
                row={podium[2]}
                rank={3}
                metric={metric}
                metricOption={activeMetric}
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-[1.7rem] border border-slate-200/80 bg-white shadow-[0_14px_38px_rgba(15,23,42,0.05)]">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
              <div>
                <h3 className="text-lg font-black text-slate-950">
                  Peringkat 4–10
                </h3>
                <p className="mt-0.5 text-[10px] font-bold text-slate-500 sm:text-xs">
                  Diurutkan berdasarkan {activeMetric.label.toLowerCase()}.
                </p>
              </div>
              <span className={`rounded-full px-3 py-2 text-[10px] font-black ${activeMetric.softClass}`}>
                {rows.length} peserta
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {rest.length === 0 ? (
                <div className="px-5 py-8 text-center text-xs font-bold text-slate-400">
                  Belum ada peserta pada peringkat berikutnya.
                </div>
              ) : (
                rest.map((item: any) => (
                  <article
                    key={item.participant_id}
                    className="grid grid-cols-[30px_42px_minmax(0,1fr)_auto] items-center gap-2.5 px-3 py-3.5 sm:grid-cols-[36px_48px_minmax(0,1fr)_auto] sm:gap-3 sm:px-5"
                  >
                    <div className="text-center text-sm font-black text-slate-400">
                      {item.rank}
                    </div>
                    <WellnessAvatar
                      name={item.name}
                      src={item.photo_preview_url || item.photo_url}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <div className="break-words text-sm font-black leading-5 text-slate-950">
                        {item.name}
                      </div>
                      <div className="mt-0.5 break-words text-[10px] font-bold leading-4 text-slate-500">
                        {item.group_name || "-"} · streak {fmt(item.current_streak)} hari
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-teal-500 to-sky-500"
                          style={{ width: progressWidth(item.progress_percent) }}
                        />
                      </div>
                      <div className="hidden sm:block">
                        <PointBreakdown row={item} />
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-black text-slate-950 sm:text-base">
                        {displayMetric(item.metric_value, metric)}
                      </div>
                      <div className="mt-0.5 text-[8px] font-black uppercase tracking-wide text-slate-400">
                        {activeMetric.shortLabel}
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
