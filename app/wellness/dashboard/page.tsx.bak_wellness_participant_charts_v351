"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import { WELLNESS_FOCUS_ITEMS, WELLNESS_GROUPS } from "@/lib/wellness/riskRules";

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

export default function WellnessDashboardPage() {
  return <AuthGate>{() => <WellnessDashboard />}</AuthGate>;
}

function WellnessDashboard() {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<any>({});
  const [rows, setRows] = useState<any[]>([]);
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
