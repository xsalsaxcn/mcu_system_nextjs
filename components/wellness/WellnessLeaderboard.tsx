"use client";

import { useEffect, useMemo, useState } from "react";
import { WellnessAvatar } from "./WellnessProfile";

// WELLNESS_COACH_GROUP_LEADERBOARD_V76

type Metric = "overall" | "compliance" | "workout" | "nutrition" | "healthtalk";

const metricOptions: Array<{ key: Metric; label: string; emoji: string }> = [
  { key: "overall", label: "Keseluruhan", emoji: "🏆" },
  { key: "compliance", label: "Kerajinan", emoji: "✅" },
  { key: "workout", label: "Workout", emoji: "🔥" },
  { key: "nutrition", label: "Nutrisi", emoji: "🥗" },
  { key: "healthtalk", label: "Health Talk", emoji: "🎤" },
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
      {
        cache: "no-store",
      },
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
    <section className="space-y-5">
      <div className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-950 via-violet-950 to-fuchsia-900 text-white shadow-2xl shadow-violet-200/50">
        <div className="p-5 md:p-7">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-fuchsia-200">
                Group Performance
              </div>
              <h2 className="mt-2 text-3xl font-black">Ranking Kelompok</h2>
              <p className="mt-2 max-w-xl text-sm font-bold leading-6 text-white/70">
                Top 10 peserta dari kelompok yang di-assign kepada Coach,
                dihitung dari 30 hari terakhir.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-full bg-white/15 px-5 py-3 text-xs font-black backdrop-blur"
            >
              {loading ? "Memuat..." : "Refresh Ranking"}
            </button>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-[220px_1fr]">
            <select
              value={group}
              onChange={(event) => setGroup(event.target.value)}
              className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-black text-white outline-none backdrop-blur"
            >
              <option value="all" className="text-slate-900">
                Semua Assigned Group
              </option>
              {(groups || []).map((item: any) => (
                <option
                  key={item.id}
                  value={String(item.wellness_group_unit_id || item.group_name)}
                  className="text-slate-900"
                >
                  {item.group_name}
                </option>
              ))}
            </select>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {metricOptions.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setMetric(item.key)}
                  className={`whitespace-nowrap rounded-full px-4 py-3 text-xs font-black transition ${metric === item.key ? "bg-fuchsia-500 text-white shadow-lg shadow-fuchsia-950/40" : "bg-white/10 text-white/75"}`}
                >
                  {item.emoji} {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-7 grid grid-cols-3 items-end gap-2 md:gap-5">
            {[podium[1], podium[0], podium[2]].map((item: any, index) => {
              const rank = index === 0 ? 2 : index === 1 ? 1 : 3;
              const height = rank === 1 ? "min-h-[220px]" : "min-h-[185px]";
              return (
                <div
                  key={item?.participant_id || `empty-${rank}`}
                  className={`relative flex ${height} min-w-0 flex-col items-center justify-end rounded-[1.75rem] border border-white/10 bg-white/10 p-3 text-center backdrop-blur md:p-5`}
                >
                  {rank === 1 ? (
                    <div className="absolute -top-5 text-4xl">👑</div>
                  ) : null}
                  <div className={`absolute ${rank === 1 ? "top-7" : "top-5"}`}>
                    <WellnessAvatar
                      name={item?.name || "Peserta"}
                      src={item?.photo_preview_url || item?.photo_url}
                      size={rank === 1 ? "xl" : "lg"}
                      className={
                        rank === 1 ? "ring-fuchsia-300" : "ring-white/70"
                      }
                    />
                    <span className="absolute -bottom-2 left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full bg-amber-400 text-sm font-black text-slate-950 ring-4 ring-violet-950">
                      {rank}
                    </span>
                  </div>
                  <div className="mt-24 w-full min-w-0">
                    <div className="truncate text-sm font-black md:text-base">
                      {item?.name || "-"}
                    </div>
                    <div className="mt-1 truncate text-[10px] font-bold text-white/55 md:text-xs">
                      {item?.group_name || "-"}
                    </div>
                    <div className="mt-3 text-xl font-black text-amber-300">
                      {item ? fmt(item.metric_value) : "-"}
                    </div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-white/55">
                      {activeMetric.label}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-black text-slate-950">
              Peringkat 4–10
            </h3>
            <p className="mt-1 text-xs font-bold text-slate-500">
              Nilai utama: {activeMetric.label}
            </p>
          </div>
          <span className="rounded-full bg-violet-50 px-3 py-2 text-xs font-black text-violet-700">
            {rows.length} peserta
          </span>
        </div>

        {message ? (
          <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
            {message}
          </div>
        ) : null}

        <div className="mt-4 space-y-2">
          {rest.length === 0 && !loading ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-bold text-slate-400">
              Belum cukup data untuk ranking.
            </div>
          ) : (
            rest.map((item: any) => (
              <div
                key={item.participant_id}
                className="grid grid-cols-[36px_48px_minmax(0,1fr)_auto] items-center gap-3 rounded-[1.4rem] border border-slate-100 bg-slate-50/80 p-3"
              >
                <div className="text-center text-base font-black text-slate-400">
                  {item.rank}
                </div>
                <WellnessAvatar
                  name={item.name}
                  src={item.photo_preview_url || item.photo_url}
                  size="md"
                />
                <div className="min-w-0">
                  <div className="truncate text-sm font-black text-slate-950">
                    {item.name}
                  </div>
                  <div className="mt-1 truncate text-[11px] font-bold text-slate-500">
                    {item.group_name} · 🔥 {fmt(item.current_streak)} hari
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-teal-400 to-violet-500"
                      style={{
                        width: `${Math.max(4, Math.min(100, Number(item.progress_percent || 0)))}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black text-violet-700">
                    {fmt(item.metric_value)}
                  </div>
                  <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                    {activeMetric.label}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
