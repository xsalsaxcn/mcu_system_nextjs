"use client";

// WELLNESS_READ_ONLY_SYSTEM_AUDIT_UI_V126M36_1

import { useEffect, useMemo, useState } from "react";

const MODULES = [
  ["all", "Semua Modul"],
  ["system", "System"],
  ["identity", "Identitas"],
  ["nutrition", "Nutrisi"],
  ["workout", "Workout"],
  ["fitness", "Fitness Device"],
  ["targets", "Target"],
  ["streak", "Streak"],
  ["nakes", "NAKES"],
];

const SEVERITIES = [
  ["all", "Semua Severity"],
  ["critical", "Critical"],
  ["high", "High"],
  ["medium", "Medium"],
  ["low", "Low"],
];

function clean(value: any) {
  return String(value ?? "").trim();
}

function fmt(value: any) {
  const number = Number(value);
  return new Intl.NumberFormat("id-ID").format(Number.isFinite(number) ? number : 0);
}

function formatDate(value: any) {
  const text = clean(value);
  if (!text) return "-";
  const parsed = new Date(text.length === 10 ? `${text}T12:00:00+07:00` : text);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: text.length > 10 ? "2-digit" : undefined,
    minute: text.length > 10 ? "2-digit" : undefined,
    timeZone: "Asia/Jakarta",
  });
}

function severityTone(value: string) {
  if (value === "critical") return "border-rose-200 bg-rose-50 text-rose-800";
  if (value === "high") return "border-orange-200 bg-orange-50 text-orange-800";
  if (value === "medium") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-sky-200 bg-sky-50 text-sky-800";
}

function statusTone(value: string) {
  if (value === "passed") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (value === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  if (value === "critical") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-orange-200 bg-orange-50 text-orange-800";
}

export default function WellnessSystemAuditPage() {
  const [days, setDays] = useState("14");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Menjalankan audit read-only...");

  async function runAudit() {
    setLoading(true);
    setMessage("Membaca sumber data tanpa mengubah production...");
    try {
      const response = await fetch(
        `/api/wellness/admin/system-audit?days=${encodeURIComponent(days)}&max_issues=500`,
        { cache: "no-store" },
      );
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) {
        throw new Error(json?.message || `Audit gagal (HTTP ${response.status}).`);
      }
      setData(json.audit);
      setMessage(
        `Audit selesai ${formatDate(json.audit?.generated_at)}. Tidak ada data yang diubah.`,
      );
    } catch (error: any) {
      setData(null);
      setMessage(error?.message || "System Audit gagal dijalankan.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    runAudit();
    // Audit sengaja dijalankan sekali saat halaman dibuka.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const issues = useMemo(() => {
    const text = clean(query).toLowerCase();
    return (data?.issues || []).filter((issue: any) => {
      if (moduleFilter !== "all" && issue.module !== moduleFilter) return false;
      if (severityFilter !== "all" && issue.severity !== severityFilter) return false;
      if (!text) return true;
      return [
        issue.id,
        issue.code,
        issue.title,
        issue.finding,
        issue.participant_name,
        issue.participant_code,
        issue.participant_id,
        issue.date,
      ]
        .map((value) => clean(value).toLowerCase())
        .some((value) => value.includes(text));
    });
  }, [data, moduleFilter, severityFilter, query]);

  function downloadJson() {
    if (!data || typeof window === "undefined") return;
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `wellness-system-audit-${data?.period?.end_date || "report"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const summary = data?.summary || {};
  const sources = data?.sources || {};

  return (
    <main className="min-h-screen bg-[#f4f8fb] pb-16 text-slate-950">
      <div className="mx-auto w-full max-w-[1500px] px-3 py-4 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[1.8rem] bg-gradient-to-br from-slate-950 via-blue-900 to-teal-600 p-5 text-white shadow-xl sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/65">
                Wellness Reliability Control
              </div>
              <h1 className="mt-2 text-2xl font-black sm:text-3xl">
                Read-only System Audit
              </h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-white/80">
                Sistem memeriksa konsistensi Nutrisi, Workout, Fitness Device,
                Target, Streak, identitas peserta, serta NAKES tanpa melakukan
                insert, update, delete, retry, atau koreksi data production.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href="/wellness/admin"
                className="rounded-2xl bg-white/15 px-4 py-3 text-xs font-black text-white ring-1 ring-white/20"
              >
                Kembali ke Admin
              </a>
              <button
                type="button"
                onClick={downloadJson}
                disabled={!data}
                className="rounded-2xl bg-white px-4 py-3 text-xs font-black text-slate-950 disabled:opacity-50"
              >
                Export JSON
              </button>
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[180px_180px_180px_1fr_auto]">
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                Periode Audit
              </span>
              <select
                value={days}
                onChange={(event) => setDays(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold"
              >
                <option value="7">7 hari</option>
                <option value="14">14 hari</option>
                <option value="30">30 hari</option>
                <option value="60">60 hari</option>
                <option value="90">90 hari</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                Modul
              </span>
              <select
                value={moduleFilter}
                onChange={(event) => setModuleFilter(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold"
              >
                {MODULES.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                Severity
              </span>
              <select
                value={severityFilter}
                onChange={(event) => setSeverityFilter(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold"
              >
                {SEVERITIES.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                Cari Temuan/Peserta
              </span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nama, kode, Participant ID, issue ID..."
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold"
              />
            </label>
            <button
              type="button"
              onClick={runAudit}
              disabled={loading}
              className="self-end rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
            >
              {loading ? "Audit berjalan..." : "Jalankan Audit"}
            </button>
          </div>
          <div className={`mt-3 rounded-xl px-3 py-2 text-xs font-bold ${
            loading ? "bg-blue-50 text-blue-800" : data ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"
          }`}>
            {message}
          </div>
        </section>

        {data ? (
          <>
            <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <div className={`rounded-[1.4rem] border p-4 ${statusTone(summary.status)}`}>
                <div className="text-[10px] font-black uppercase tracking-wide opacity-70">Status</div>
                <div className="mt-2 text-xl font-black uppercase">{summary.status}</div>
              </div>
              <div className="rounded-[1.4rem] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">Checks</div>
                <div className="mt-2 text-2xl font-black">{fmt(summary.checks_run)}</div>
              </div>
              <div className="rounded-[1.4rem] border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
                <div className="text-[10px] font-black uppercase tracking-wide opacity-70">Passed</div>
                <div className="mt-2 text-2xl font-black">{fmt(summary.passed_checks)}</div>
              </div>
              <div className="rounded-[1.4rem] border border-rose-200 bg-rose-50 p-4 text-rose-800">
                <div className="text-[10px] font-black uppercase tracking-wide opacity-70">Failed</div>
                <div className="mt-2 text-2xl font-black">{fmt(summary.failed_checks)}</div>
              </div>
              <div className="rounded-[1.4rem] border border-amber-200 bg-amber-50 p-4 text-amber-800">
                <div className="text-[10px] font-black uppercase tracking-wide opacity-70">Warning</div>
                <div className="mt-2 text-2xl font-black">{fmt(summary.warning_checks)}</div>
              </div>
              <div className="rounded-[1.4rem] border border-violet-200 bg-violet-50 p-4 text-violet-800">
                <div className="text-[10px] font-black uppercase tracking-wide opacity-70">Peserta</div>
                <div className="mt-2 text-2xl font-black">{fmt(data?.scope?.participants)}</div>
              </div>
            </section>

            <section className="mt-4 rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-black">Kesehatan Sumber Data</h2>
                  <div className="mt-1 text-xs font-bold text-slate-500">
                    Periode {formatDate(data?.period?.start_date)} - {formatDate(data?.period?.end_date)}
                  </div>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-slate-700">
                  Mode {data.mode}
                </span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {[
                  ["Peserta", sources?.participants?.ok, sources?.participants?.row_count],
                  ["Workout", sources?.activities?.ok, sources?.activities?.row_count],
                  ["Point", sources?.points?.ok, sources?.points?.row_count],
                  ["Target Coach", sources?.coach_notes?.ok, sources?.coach_notes?.row_count],
                  ["NAKES", sources?.nakes?.ok, sources?.nakes?.row_count],
                  ["Sheet Nutrisi", sources?.nutrition?.google_sheet_ok, sources?.nutrition?.google_sheet_rows],
                ].map(([label, ok, rows]) => (
                  <div key={String(label)} className={`rounded-xl border px-3 py-3 ${ok ? "border-emerald-100 bg-emerald-50" : "border-rose-100 bg-rose-50"}`}>
                    <div className="text-xs font-black text-slate-800">{label}</div>
                    <div className={`mt-1 text-[10px] font-black uppercase ${ok ? "text-emerald-700" : "text-rose-700"}`}>
                      {ok ? "Connected" : "Failed"} · {fmt(rows)} row
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-4">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="text-lg font-black">Temuan Audit</h2>
                  <div className="mt-1 text-xs font-bold text-slate-500">
                    Menampilkan {fmt(issues.length)} dari {fmt(summary.issue_count)} temuan.
                  </div>
                </div>
                {summary.truncated_issue_count > 0 ? (
                  <div className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-black text-amber-900">
                    {fmt(summary.truncated_issue_count)} temuan lain tidak ditampilkan
                  </div>
                ) : null}
              </div>

              {issues.length === 0 ? (
                <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 px-5 py-12 text-center text-emerald-900">
                  <div className="text-4xl">✓</div>
                  <div className="mt-3 text-lg font-black">Tidak ada temuan pada filter ini</div>
                  <div className="mt-1 text-sm font-bold opacity-75">Seluruh pemeriksaan yang tampil lulus audit.</div>
                </div>
              ) : (
                <div className="grid gap-3">
                  {issues.map((issue: any) => (
                    <article key={issue.id} className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${severityTone(issue.severity)}`}>
                              {issue.severity}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-slate-700">
                              {issue.module}
                            </span>
                            <span className="text-[10px] font-black text-slate-400">{issue.id}</span>
                          </div>
                          <h3 className="mt-3 text-base font-black text-slate-950 sm:text-lg">{issue.title}</h3>
                          <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{issue.finding}</p>
                        </div>
                        <div className="shrink-0 rounded-xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-700">
                          {formatDate(issue.date)}
                        </div>
                      </div>

                      {issue.participant_id ? (
                        <div className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-900">
                          {issue.participant_name || "Peserta"} · kode {issue.participant_code || "-"} · Participant ID {issue.participant_id}
                        </div>
                      ) : null}

                      <div className="mt-3 grid gap-3 lg:grid-cols-3">
                        <div className="rounded-xl bg-emerald-50 p-3">
                          <div className="text-[9px] font-black uppercase tracking-wide text-emerald-700">Expected</div>
                          <div className="mt-1 text-xs font-bold leading-5 text-emerald-950">{issue.expected}</div>
                        </div>
                        <div className="rounded-xl bg-rose-50 p-3">
                          <div className="text-[9px] font-black uppercase tracking-wide text-rose-700">Actual</div>
                          <div className="mt-1 text-xs font-bold leading-5 text-rose-950">{issue.actual}</div>
                        </div>
                        <div className="rounded-xl bg-violet-50 p-3">
                          <div className="text-[9px] font-black uppercase tracking-wide text-violet-700">Rekomendasi</div>
                          <div className="mt-1 text-xs font-bold leading-5 text-violet-950">{issue.recommendation}</div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
