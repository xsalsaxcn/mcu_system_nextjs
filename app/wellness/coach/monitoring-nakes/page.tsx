"use client";

// WELLNESS_COACH_NAKES_MONITORING_V126M57_1
// Read-only clinical monitoring for Coach. Participant scope always comes from
// /api/wellness/coach/dashboard and /api/wellness/coach/participant-detail.
// No Admin endpoint, database write, target, streak, point, or fitness sync change.

import { useEffect, useMemo, useState } from "react";

type RiskFilter = "all" | "high" | "medium" | "low" | "unclassified";

function clean(value: any) {
  return String(value ?? "").trim();
}

function num(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function fmt(value: any, digits = 1) {
  const parsed = num(value);
  if (parsed === null) return "-";
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: digits }).format(parsed);
}

function metricText(value: any) {
  const text = clean(value);
  if (text.includes("/")) return text;
  return fmt(value);
}

function formatDate(value: any) {
  const text = clean(value);
  if (!text) return "Belum ada";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text.slice(0, 10);
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function initials(value: any) {
  const parts = clean(value).split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] || "P"}${parts[1]?.[0] || ""}`.toUpperCase();
}

function participantId(item: any) {
  return Number(item?.id || item?.participant_id || item?.raw?.id || 0);
}

function clinicalValue(row: any, ...keys: string[]) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return null;
}

function participantMatchesGroup(item: any, selectedGroup: string) {
  const selected = clean(selectedGroup);
  if (!selected || selected === "all") return true;

  const accessIds = Array.isArray(item?.access_group_ids)
    ? item.access_group_ids.map((value: any) => clean(value)).filter(Boolean)
    : [];

  const rawIds = [
    item?.assigned_group_unit_id,
    item?.group_unit_id,
    item?.raw?.wellness_group_unit_id,
    item?.raw?.group_unit_id,
    item?.raw?.wellness_kelompok_id,
  ]
    .map(clean)
    .filter(Boolean);

  return accessIds.includes(selected) || rawIds.includes(selected);
}

function riskLevel(item: any): Exclude<RiskFilter, "all"> {
  const clinical = item?.clinical || {};
  const text = [
    clinical?.risk_level,
    clinical?.risk_label,
    clinical?.risk_category,
    clinical?.compliance_status,
    clinical?.intervention_focus,
    item?.risk,
    item?.flag,
    item?.flag_label,
  ]
    .map((value) => clean(value).toLowerCase())
    .join(" ");

  if (/high|tinggi|red|hipertensi|hypertension|diabetes|obes|urgent/.test(text)) return "high";
  if (/medium|sedang|yellow|perhatian|pantau|monitor/.test(text)) return "medium";
  if (/low|rendah|green|baik|normal|terkendali|patuh/.test(text)) return "low";
  return "unclassified";
}

function riskLabel(level: Exclude<RiskFilter, "all">) {
  if (level === "high") return "RISIKO TINGGI";
  if (level === "medium") return "PERLU PERHATIAN";
  if (level === "low") return "TERKENDALI";
  return "BELUM DINILAI";
}

function riskTone(level: Exclude<RiskFilter, "all">) {
  if (level === "high") return "border-rose-200 bg-rose-50 text-rose-700";
  if (level === "medium") return "border-orange-200 bg-orange-50 text-orange-700";
  if (level === "low") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function chartRows(detail: any, key: string) {
  const rows = detail?.charts?.[key];
  return Array.isArray(rows) ? rows : [];
}

function metricRange(detail: any, key: string, fallbackCurrent: any = null) {
  const rows = chartRows(detail, key);
  const first = rows[0] || null;
  const last = rows.at?.(-1) || rows[rows.length - 1] || null;
  return {
    baseline: first?.value ?? null,
    current: last?.value ?? fallbackCurrent,
    rows,
  };
}

function SummaryCard({ label, value, note, icon, tone }: any) {
  return (
    <div className={`rounded-[1.4rem] border p-4 shadow-sm ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.12em] opacity-65">{label}</div>
          <div className="mt-1 text-3xl font-black">{fmt(value, 0)}</div>
          <div className="mt-1 text-[10px] font-bold opacity-65">{note}</div>
        </div>
        <div className="text-2xl">{icon}</div>
      </div>
    </div>
  );
}

function MetricCard({ label, baseline, current, unit, tone = "text-slate-900" }: any) {
  const b = num(baseline);
  const c = num(current);
  const delta = b !== null && c !== null ? Math.round((c - b) * 10) / 10 : null;
  return (
    <div className="rounded-[1.25rem] border border-slate-200 bg-white p-3.5">
      <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">{label}</div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <div className={`text-xl font-black ${tone}`}>
            {metricText(current)}{unit ? <span className="ml-1 text-[9px] font-bold text-slate-400">{unit}</span> : null}
          </div>
          <div className="mt-1 text-[9px] font-bold text-slate-400">
            Baseline: {metricText(baseline)}{unit ? ` ${unit}` : ""}
          </div>
        </div>
        {delta !== null ? (
          <span className={`rounded-full px-2 py-1 text-[9px] font-black ${delta < 0 ? "bg-emerald-50 text-emerald-700" : delta > 0 ? "bg-orange-50 text-orange-700" : "bg-slate-100 text-slate-500"}`}>
            {delta > 0 ? "+" : ""}{fmt(delta)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function MiniChart({ title, rows, secondaryKey }: { title: string; rows: any[]; secondaryKey?: string }) {
  const values = rows.map((row) => num(row?.value)).filter((value): value is number => value !== null);
  const secondary = secondaryKey
    ? rows.map((row) => num(row?.[secondaryKey])).filter((value): value is number => value !== null)
    : [];
  const all = [...values, ...secondary];
  if (!all.length) {
    return (
      <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4">
        <div className="text-sm font-black text-slate-900">{title}</div>
        <div className="mt-4 flex h-24 items-center justify-center rounded-xl bg-slate-50 text-[10px] font-bold text-slate-300">Belum ada data</div>
      </div>
    );
  }
  const width = 320, height = 90, pad = 10;
  const min = Math.min(...all), max = Math.max(...all), range = max - min || 1;
  const points = (series: number[]) => series.map((value, index) => {
    const x = series.length <= 1 ? width / 2 : pad + (index / (series.length - 1)) * (width - pad * 2);
    const y = pad + ((max - value) / range) * (height - pad * 2);
    return `${x},${y}`;
  }).join(" ");
  return (
    <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-black text-slate-900">{title}</div>
        <span className="rounded-full bg-slate-50 px-2 py-1 text-[9px] font-black text-slate-500">{rows.length} data</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 h-24 w-full" role="img" aria-label={title}>
        <polyline points={points(values)} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600" />
        {secondary.length ? <polyline points={points(secondary)} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-sky-500" /> : null}
      </svg>
      <div className="mt-1 flex justify-between text-[9px] font-bold text-slate-400">
        <span>{rows[0]?.label || formatDate(rows[0]?.date)}</span>
        <span>{rows.at?.(-1)?.label || formatDate(rows.at?.(-1)?.date)}</span>
      </div>
    </div>
  );
}

export default function CoachMonitoringNakesPage() {
  const [dashboard, setDashboard] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [message, setMessage] = useState("Memuat monitoring NAKES Coach...");
  const [query, setQuery] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("all");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");

  async function loadDashboard() {
    setLoading(true);
    const result = await fetch(`/api/wellness/coach/dashboard?t=${Date.now()}`, {
      cache: "no-store",
      credentials: "include",
    })
      .then(async (response) => ({ ...(await response.json().catch(() => ({}))), http_status: response.status }))
      .catch((error) => ({ ok: false, http_status: 0, message: error?.message || "Tidak dapat terhubung ke server." }));

    if (!result?.ok) {
      setDashboard(null);
      setParticipants([]);
      setGroups([]);
      setMessage(result?.message || "Monitoring NAKES Coach gagal dimuat.");
      setLoading(false);
      return;
    }

    const nextParticipants = Array.isArray(result?.participants) ? result.participants : [];
    const nextGroups = Array.isArray(result?.groups) ? result.groups : [];
    setDashboard(result);
    setParticipants(nextParticipants);
    setGroups(nextGroups);
    setMessage(`Monitoring NAKES aktif untuk ${nextParticipants.length} member Coach.`);
    setSelectedId((current) => {
      if (current && nextParticipants.some((item: any) => participantId(item) === current)) return current;
      const firstClinical = nextParticipants.find((item: any) => Boolean(item?.clinical)) || nextParticipants[0];
      return firstClinical ? participantId(firstClinical) : null;
    });
    setLoading(false);
  }

  useEffect(() => { void loadDashboard(); }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let active = true;
    setDetailLoading(true);
    fetch(`/api/wellness/coach/participant-detail?participant_id=${encodeURIComponent(String(selectedId))}&days=30&t=${Date.now()}`, {
      cache: "no-store",
      credentials: "include",
    })
      .then(async (response) => ({ ...(await response.json().catch(() => ({}))), http_status: response.status }))
      .then((result) => {
        if (!active) return;
        setDetail(result?.ok ? result : null);
        if (!result?.ok && result?.message) setMessage(result.message);
      })
      .catch((error) => {
        if (!active) return;
        setDetail(null);
        setMessage(error?.message || "Detail NAKES gagal dimuat.");
      })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [selectedId]);

  const groupRows = useMemo(
    () => participants.filter((item) => participantMatchesGroup(item, selectedGroup)),
    [participants, selectedGroup],
  );

  useEffect(() => {
    if (selectedId && groupRows.some((item) => participantId(item) === selectedId)) return;
    const first = groupRows.find((item) => Boolean(item?.clinical)) || groupRows[0];
    setSelectedId(first ? participantId(first) : null);
  }, [selectedGroup, participants]);

  const filteredRows = useMemo(() => {
    const keyword = clean(query).toLowerCase();
    return groupRows
      .filter((item) => {
        const risk = riskLevel(item);
        const keywordMatch = !keyword || [item?.name, item?.code, item?.group_name, item?.kelompok_name, item?.clinical?.risk_label]
          .map((value) => clean(value).toLowerCase()).join(" ").includes(keyword);
        const riskMatch = riskFilter === "all" || risk === riskFilter;
        return keywordMatch && riskMatch;
      })
      .sort((a, b) => clean(a?.name).localeCompare(clean(b?.name), "id"));
  }, [groupRows, query, riskFilter]);

  const selectedParticipant = participants.find((item) => participantId(item) === selectedId) || null;
  const selectedClinical = selectedParticipant?.clinical || {};
  const selectedRisk = selectedParticipant ? riskLevel(selectedParticipant) : "unclassified";
  const examinedCount = groupRows.filter((item) => Boolean(item?.clinical)).length;
  const highRiskCount = groupRows.filter((item) => riskLevel(item) === "high").length;
  const mediumRiskCount = groupRows.filter((item) => riskLevel(item) === "medium").length;

  const weight = metricRange(detail, "weight_kg", clinicalValue(selectedClinical, "weight_kg", "current_weight_kg"));
  const bmi = metricRange(detail, "bmi", clinicalValue(selectedClinical, "bmi"));
  const waist = metricRange(detail, "waist_cm", clinicalValue(selectedClinical, "waist_cm", "waist_circumference"));
  const hba1c = metricRange(detail, "hba1c", clinicalValue(selectedClinical, "hba1c_percent", "hba1c", "hba1c_value"));
  const glucose = metricRange(detail, "glucose", clinicalValue(selectedClinical, "glucose_value", "blood_glucose", "fasting_glucose"));
  const bpRows = chartRows(detail, "blood_pressure");
  const bpFirst = bpRows[0] || {};
  const bpLast = bpRows.at?.(-1) || bpRows[bpRows.length - 1] || {};
  const bpBaseline = num(bpFirst?.value) !== null || num(bpFirst?.secondary) !== null ? `${fmt(bpFirst?.value, 0)}/${fmt(bpFirst?.secondary, 0)}` : "-";
  const bpCurrent = num(bpLast?.value) !== null || num(bpLast?.secondary) !== null
    ? `${fmt(bpLast?.value, 0)}/${fmt(bpLast?.secondary, 0)}`
    : (() => {
        const sbp = clinicalValue(selectedClinical, "sbp", "systolic", "systolic_bp");
        const dbp = clinicalValue(selectedClinical, "dbp", "diastolic", "diastolic_bp");
        return num(sbp) !== null || num(dbp) !== null ? `${fmt(sbp, 0)}/${fmt(dbp, 0)}` : "-";
      })();

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8fbfc_0%,#f1f7fa_45%,#f8fafc_100%)] pb-10 text-slate-950">
      <div className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-5 lg:px-7">
        <header className="rounded-[1.5rem] border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <a href="/wellness/coach" className="flex h-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50">← Coach</a>
              <div className="min-w-0">
                <div className="text-[9px] font-black uppercase tracking-[0.18em] text-teal-700">Harmony Health Coach</div>
                <h1 className="truncate text-lg font-black text-slate-950 sm:text-xl">Monitoring NAKES</h1>
              </div>
            </div>
            <button type="button" onClick={() => void loadDashboard()} disabled={loading} className="rounded-xl bg-teal-700 px-4 py-3 text-xs font-black text-white shadow-sm disabled:cursor-wait disabled:opacity-60">
              {loading ? "Memuat..." : "↻ Sync Data"}
            </button>
          </div>
        </header>

        <section className="mt-4 overflow-hidden rounded-[1.65rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-teal-700">Monitoring Klinis Coach</div>
              <h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Kemajuan Kesehatan Member</h2>
              <p className="mt-2 max-w-3xl text-xs font-bold leading-5 text-slate-500 sm:text-sm">
                Read-only. Hanya member yang termasuk assignment group Coach aktif yang dapat ditampilkan.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[720px]">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama, kode, grup..." className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100" />
              <select value={selectedGroup} onChange={(event) => setSelectedGroup(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100">
                <option value="all">Semua Assigned Group</option>
                {groups.map((group: any, index: number) => {
                  const id = clean(group?.wellness_group_unit_id || group?.group_unit_id);
                  if (!id) return null;
                  return <option key={`${id}-${index}`} value={id}>{clean(group?.group_name) || `Group ${id}`}</option>;
                })}
              </select>
              <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value as RiskFilter)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100">
                <option value="all">Semua Risiko</option>
                <option value="high">Risiko Tinggi</option>
                <option value="medium">Perlu Perhatian</option>
                <option value="low">Terkendali</option>
                <option value="unclassified">Belum Dinilai</option>
              </select>
            </div>
          </div>
          <div className={`mt-3 text-[10px] font-bold ${/gagal|session|tidak/i.test(message) ? "text-rose-600" : "text-slate-400"}`}>{message}</div>
        </section>

        <section className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <SummaryCard label="Total Member" value={groupRows.length} note={selectedGroup === "all" ? "Semua assignment Coach" : "Assigned group terpilih"} icon="👥" tone="border-emerald-100 bg-emerald-50 text-emerald-950" />
          <SummaryCard label="Pemeriksaan NAKES" value={examinedCount} note="Memiliki data klinis" icon="🩺" tone="border-sky-100 bg-sky-50 text-sky-950" />
          <SummaryCard label="Perlu Perhatian" value={mediumRiskCount} note="Perlu evaluasi berkala" icon="⚠️" tone="border-orange-100 bg-orange-50 text-orange-950" />
          <SummaryCard label="Risiko Tinggi" value={highRiskCount} note="Prioritas intervensi" icon="❤️" tone="border-rose-100 bg-rose-50 text-rose-950" />
        </section>

        <section className="mt-4 grid items-start gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <section className="overflow-hidden rounded-[1.55rem] border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-4">
              <div className="flex items-center justify-between gap-3">
                <div><h3 className="text-sm font-black">Daftar Member Coach</h3><div className="mt-1 text-[10px] font-bold text-slate-400">{filteredRows.length} member tampil</div></div>
                <span className="rounded-full bg-teal-50 px-3 py-1.5 text-[9px] font-black text-teal-700">READ ONLY</span>
              </div>
            </div>
            <div className="max-h-[820px] divide-y divide-slate-100 overflow-y-auto">
              {loading ? <div className="p-8 text-center text-xs font-bold text-slate-400">Memuat member...</div> : filteredRows.length === 0 ? <div className="p-10 text-center text-xs font-bold text-slate-400">Tidak ada member pada filter ini.</div> : filteredRows.map((item: any, index: number) => {
                const id = participantId(item), active = id === selectedId, level = riskLevel(item);
                return (
                  <button key={id || `${clean(item?.code)}-${index}`} type="button" onClick={() => setSelectedId(id)} className={`block w-full p-3 text-left transition ${active ? "bg-teal-50/70" : "bg-white hover:bg-slate-50"}`}>
                    <div className={`rounded-[1.2rem] border p-3 ${active ? "border-teal-300 bg-white shadow-sm" : "border-transparent"}`}>
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 text-sm font-black text-white">{initials(item?.name)}</div>
                        <div className="min-w-0 flex-1">
                          <div className="break-words text-sm font-black leading-5">{item?.name || "Member Wellness"}</div>
                          <div className="mt-1 break-words text-[10px] font-bold leading-4 text-slate-400">{item?.code || "-"} · {item?.group_name || item?.assigned_group_name || "-"}</div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <span className={`rounded-full border px-2 py-1 text-[8px] font-black ${riskTone(level)}`}>{riskLabel(level)}</span>
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-[8px] font-black text-slate-500">{formatDate(clinicalValue(item?.clinical, "checkup_date", "exam_date", "log_date", "created_at"))}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {!selectedParticipant ? (
            <section className="rounded-[1.55rem] border border-dashed border-slate-200 bg-white p-12 text-center shadow-sm"><div className="text-4xl">🩺</div><div className="mt-4 text-lg font-black">Pilih member</div><p className="mt-2 text-xs font-bold text-slate-400">Pilih member Coach untuk melihat hasil pemeriksaan NAKES.</p></section>
          ) : (
            <div className="space-y-4">
              <section className="rounded-[1.55rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-xl font-black text-white">{initials(selectedParticipant?.name)}</div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><h3 className="break-words text-xl font-black">{selectedParticipant?.name}</h3><span className={`rounded-full border px-2.5 py-1 text-[9px] font-black ${riskTone(selectedRisk)}`}>{riskLabel(selectedRisk)}</span></div>
                      <div className="mt-1 break-words text-xs font-bold text-slate-500">{selectedParticipant?.code || "-"} · {selectedParticipant?.group_name || selectedParticipant?.assigned_group_name || "-"}</div>
                      <div className="mt-2 text-[10px] font-bold text-slate-400">Pemeriksaan terakhir: {formatDate(clinicalValue(selectedClinical, "checkup_date", "exam_date", "log_date", "created_at"))}</div>
                    </div>
                  </div>
                  <div className="rounded-[1.2rem] bg-teal-50 px-4 py-3 text-teal-900"><div className="text-[9px] font-black uppercase tracking-[0.12em] opacity-70">Scope</div><div className="mt-1 text-sm font-black">Member assignment Coach</div></div>
                </div>
              </section>

              <section className="rounded-[1.55rem] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-black">Ringkasan Hasil Pemeriksaan</h3><div className="mt-1 text-[10px] font-bold text-slate-400">Baseline dibandingkan hasil terbaru dari data Coach canonical.</div></div><span className="rounded-full bg-emerald-50 px-3 py-1.5 text-[9px] font-black text-emerald-700">{detailLoading ? "MEMUAT" : "READ ONLY"}</span></div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <MetricCard label="Berat Badan" baseline={weight.baseline} current={weight.current} unit="kg" tone="text-emerald-700" />
                  <MetricCard label="BMI" baseline={bmi.baseline} current={bmi.current} tone="text-violet-700" />
                  <MetricCard label="Lingkar Perut" baseline={waist.baseline} current={waist.current} unit="cm" tone="text-orange-700" />
                  <MetricCard label="Tekanan Darah" baseline={bpBaseline} current={bpCurrent} unit="mmHg" tone="text-sky-700" />
                  <MetricCard label="HbA1c" baseline={hba1c.baseline} current={hba1c.current} unit="%" tone="text-rose-700" />
                  <MetricCard label="Gula Darah" baseline={glucose.baseline} current={glucose.current} unit="mg/dL" tone="text-blue-700" />
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-2">
                <MiniChart title="Berat Badan" rows={weight.rows} />
                <MiniChart title="BMI" rows={bmi.rows} />
                <MiniChart title="Lingkar Perut" rows={waist.rows} />
                <MiniChart title="Tekanan Darah" rows={bpRows} secondaryKey="secondary" />
                <MiniChart title="HbA1c" rows={hba1c.rows} />
                <MiniChart title="Gula Darah" rows={glucose.rows} />
              </section>
            </div>
          )}
        </section>

        <section className="mt-4 rounded-[1.4rem] border border-teal-100 bg-teal-50 p-4 text-xs font-bold leading-5 text-teal-900">
          Source contract: daftar member berasal dari Portal Coach dan detail peserta hanya dapat dibaca bila participant termasuk assignment Coach. Halaman ini read-only.
          {dashboard?.coach?.name ? ` Coach aktif: ${clean(dashboard.coach.name)}.` : ""}
        </section>
      </div>
    </main>
  );
}
