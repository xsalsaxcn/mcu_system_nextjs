"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";

function fmt(value: any, suffix = "") {
  if (value === null || value === undefined || value === "") return "-";
  return `${value}${suffix}`;
}

function StatCard({ label, value, tone = "slate" }: { label: string; value: any; tone?: "slate" | "emerald" | "blue" | "amber" | "rose" }) {
  const cls = {
    slate: "border-slate-200 bg-white text-slate-950",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-950",
    blue: "border-blue-100 bg-blue-50 text-blue-950",
    amber: "border-amber-100 bg-amber-50 text-amber-950",
    rose: "border-rose-100 bg-rose-50 text-rose-950",
  }[tone];
  return (
    <div className={`rounded-3xl border p-5 shadow-sm ${cls}`}>
      <div className="text-xs font-black uppercase tracking-wide opacity-60">{label}</div>
      <div className="mt-2 text-3xl font-black">{value ?? 0}</div>
    </div>
  );
}

export default function WellnessDashboardPage() {
  return <AuthGate>{() => <WellnessDashboard />}</AuthGate>;
}

function WellnessDashboard() {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<any>({});
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
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
    return rows.filter((row) => [row.name, row.code, row.group_name, row.bmi_status].filter(Boolean).join(" ").toLowerCase().includes(keyword));
  }, [rows, search]);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] bg-gradient-to-r from-fuchsia-600 via-rose-600 to-orange-500 shadow-sm">
        <div className="p-7 text-white">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-3xl font-black">Wellness - Pemantauan Berat Badan</div>
              <div className="mt-2 max-w-3xl text-sm font-medium text-rose-50">
                Pantau berat badan, BMI, input makanan harian, aktivitas, dan estimasi kalori otomatis dari database makanan internal.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href="/wellness/input" className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-rose-700 shadow-sm">Input Harian</a>
              <a href="/wellness/profile" className="rounded-2xl bg-white/15 px-4 py-3 text-sm font-black text-white ring-1 ring-white/25">Profil</a>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Peserta" value={summary.total || 0} />
        <StatCard label="Rata-rata BMI" value={summary.avg_bmi || 0} tone="blue" />
        <StatCard label="Kalori Makanan Hari Ini" value={summary.total_food_calories_today || 0} tone="amber" />
        <StatCard label="Kalori Aktivitas Hari Ini" value={summary.total_activity_calories_today || 0} tone="emerald" />
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-black uppercase tracking-wide text-slate-400">Aksi</div>
          <div className="mt-3 grid gap-2">
            <button onClick={load} disabled={loading} className="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60">{loading ? "Memuat..." : "Refresh"}</button>
            <a href="/api/wellness/export" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-center text-sm font-black text-emerald-700">Export Excel</a>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xl font-black text-slate-900">Dashboard Peserta Wellness</div>
            <div className="mt-1 text-sm font-semibold text-slate-500">{message}</div>
          </div>
          <input className="min-w-[260px] rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" placeholder="Cari peserta / kelompok / status BMI" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Nama</th>
                <th className="px-4 py-3 text-left">Kelompok</th>
                <th className="px-4 py-3 text-left">BB Awal</th>
                <th className="px-4 py-3 text-left">BB Saat Ini</th>
                <th className="px-4 py-3 text-left">Perubahan</th>
                <th className="px-4 py-3 text-left">BMI</th>
                <th className="px-4 py-3 text-left">Kalori Hari Ini</th>
                <th className="px-4 py-3 text-left">Update Terakhir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-black text-slate-900">{row.name}<div className="text-xs font-semibold text-slate-400">{row.code || "-"}</div></td>
                  <td className="px-4 py-3 text-slate-600">{row.group_name || "-"}</td>
                  <td className="px-4 py-3 font-bold">{fmt(row.initial_weight_kg, " kg")}</td>
                  <td className="px-4 py-3 font-bold">{fmt(row.current_weight_kg, " kg")}</td>
                  <td className={`px-4 py-3 font-black ${Number(row.weight_delta_kg || 0) <= 0 ? "text-emerald-700" : "text-rose-700"}`}>{fmt(row.weight_delta_kg, " kg")}</td>
                  <td className="px-4 py-3"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700">{fmt(row.bmi)} · {row.bmi_status || "-"}</span></td>
                  <td className="px-4 py-3 text-slate-600">Makan {row.calories_today || 0} / Aktivitas {row.activity_calories_today || 0}</td>
                  <td className="px-4 py-3 text-slate-600">{row.latest_weight_date || row.latest_food_date || row.latest_activity_date || "-"}</td>
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
