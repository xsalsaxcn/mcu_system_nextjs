"use client";

// WELLNESS_ADMIN_STREAK_DIAGNOSTIC_V126M54
// Read-only Admin UI showing canonical streak plus Participant Portal display mirror.

import { useEffect, useMemo, useState } from "react";

type StatusFilter =
  | "all"
  | "pass"
  | "issue"
  | "steps_only"
  | "target_change"
  | "provider_warning"
  | "mirror_mismatch";

function clean(value: any) {
  return String(value ?? "").trim();
}

function fmt(value: any, maximumFractionDigits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits }).format(
    number,
  );
}

function statusTone(row: any) {
  if (row?.success) return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (row?.diagnosis_code === "WORKOUT_KURANG_STEPS_TERCAPAI") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }
  return "border-rose-200 bg-rose-50 text-rose-800";
}

function providerWarningLabel(code: string) {
  if (code === "GOOGLE_FIT_TOTAL_CALORIES_FALLBACK") {
    return "Google Fit memakai fallback total calories karena active calories tidak tersedia.";
  }
  if (code === "HEALTH_CONNECT_CALORIES_ESTIMATED_OR_FALLBACK") {
    return "Health Connect memakai estimasi/fallback kalori karena active calories tidak tersedia.";
  }
  return code;
}

export default function WellnessAdminStreakDiagnosticPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("issue");
  const [selectedParticipantId, setSelectedParticipantId] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 100;

  async function load() {
    setLoading(true);
    setError("");
    const result = await fetch(
      `/api/wellness/admin/streak-diagnostic?_=${Date.now()}`,
      {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      },
    )
      .then(async (response) => ({
        ...(await response.json().catch(() => ({}))),
        http_status: response.status,
      }))
      .catch((requestError) => ({
        ok: false,
        message: requestError?.message || "Network error",
      }));

    if (!result?.ok) {
      setData(null);
      setError(result?.message || "Diagnostik streak gagal dimuat.");
      setLoading(false);
      return;
    }

    setData(result);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [query, companyFilter, statusFilter, selectedParticipantId]);

  const participants = useMemo(() => {
    return [...(data?.participants || [])].sort((left: any, right: any) =>
      clean(left?.participant_name).localeCompare(
        clean(right?.participant_name),
        "id",
      ),
    );
  }, [data]);

  const companies = useMemo(() => {
    const map = new Map<number, string>();
    for (const item of participants) {
      const id = Number(item?.company_id || 0);
      if (!id) continue;
      map.set(id, clean(item?.company_name) || `Perusahaan ${id}`);
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name, "id"));
  }, [participants]);

  const filteredRows = useMemo(() => {
    const needle = clean(query).toLowerCase();
    return (data?.rows || []).filter((row: any) => {
      if (
        selectedParticipantId !== "all" &&
        Number(row?.participant_id || 0) !== Number(selectedParticipantId)
      ) {
        return false;
      }
      if (
        companyFilter !== "all" &&
        Number(row?.company_id || 0) !== Number(companyFilter)
      ) {
        return false;
      }
      if (needle) {
        const haystack = [
          row?.participant_name,
          row?.participant_code,
          row?.company_name,
          row?.group_name,
          row?.diagnosis_label,
          row?.date,
        ]
          .map(clean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }

      if (statusFilter === "pass" && !row?.success) return false;
      if (statusFilter === "issue" && row?.success) return false;
      if (
        statusFilter === "steps_only" &&
        !(row?.steps_ok && !row?.success)
      ) {
        return false;
      }
      if (statusFilter === "target_change" && !row?.target_changed_today) {
        return false;
      }
      if (
        statusFilter === "provider_warning" &&
        !(row?.provider_warnings || []).length
      ) {
        return false;
      }
      if (statusFilter === "mirror_mismatch" && !row?.mirror_mismatch) {
        return false;
      }
      return true;
    });
  }, [data, query, companyFilter, statusFilter, selectedParticipantId]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedRows = filteredRows.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  const selectedParticipant = useMemo(() => {
    if (selectedParticipantId === "all") return null;
    return participants.find(
      (item: any) =>
        Number(item?.participant_id || 0) === Number(selectedParticipantId),
    );
  }, [participants, selectedParticipantId]);

  return (
    <main className="min-h-screen bg-[#f4f8fb] text-slate-950">
      <div className="mx-auto w-full max-w-[1800px] px-3 py-4 sm:px-5 lg:px-8 lg:py-7">
        <section className="overflow-hidden rounded-[1.8rem] bg-gradient-to-r from-slate-950 via-blue-950 to-teal-700 p-5 text-white shadow-xl sm:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/65">
                Harmony Health Admin · Read-only
              </div>
              <h1 className="mt-1 text-2xl font-black sm:text-3xl">
                🔎 Diagnostik Streak
              </h1>
              <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-white/75">
                Membaca engine streak canonical yang sama dengan Participant dan
                Coach. Tidak mengubah target, point, workout, nutrisi, Google Fit,
                Health Connect, atau database.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="rounded-2xl bg-white px-4 py-3 text-xs font-black text-slate-950 shadow-sm disabled:opacity-60"
              >
                {loading ? "Memeriksa..." : "↻ Jalankan Ulang"}
              </button>
              <a
                href="/wellness/admin"
                className="rounded-2xl bg-white/15 px-4 py-3 text-xs font-black text-white ring-1 ring-white/20"
              >
                ← Portal Admin
              </a>
            </div>
          </div>
        </section>

        {error ? (
          <section className="mt-4 rounded-[1.5rem] border border-rose-200 bg-rose-50 p-5 text-sm font-bold text-rose-800">
            {error}
          </section>
        ) : null}

        {loading && !data ? (
          <section className="mt-4 rounded-[1.5rem] border border-slate-200 bg-white p-10 text-center shadow-sm">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-teal-600" />
            <div className="mt-4 text-sm font-black text-slate-600">
              Membaca streak seluruh peserta...
            </div>
          </section>
        ) : null}

        {data ? (
          <>
            <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
              {[
                ["Peserta", data?.summary?.participants, "👥", "bg-sky-50 text-sky-900"],
                ["PASS 7 hari", data?.summary?.pass_days, "✅", "bg-emerald-50 text-emerald-900"],
                ["Perlu cek", data?.summary?.issue_days, "⚠️", "bg-rose-50 text-rose-900"],
                [
                  "Steps tercapai, streak gagal",
                  data?.summary?.steps_reached_but_streak_failed,
                  "👟",
                  "bg-amber-50 text-amber-900",
                ],
                [
                  "Warning provider",
                  data?.summary?.provider_warning_days,
                  "⌚",
                  "bg-violet-50 text-violet-900",
                ],
                [
                  "Portal mirror beda",
                  data?.summary?.portal_mirror_mismatch_days,
                  "🔀",
                  "bg-cyan-50 text-cyan-900",
                ],
              ].map(([label, value, icon, tone]) => (
                <div
                  key={String(label)}
                  className={`rounded-[1.4rem] border border-white p-4 shadow-sm ${tone}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-[9px] font-black uppercase tracking-[0.1em] opacity-70">
                      {label}
                    </div>
                    <div>{icon}</div>
                  </div>
                  <div className="mt-2 text-2xl font-black">{fmt(value)}</div>
                </div>
              ))}
            </section>

            <section className="mt-4 rounded-[1.5rem] border border-teal-100 bg-teal-50 p-4 text-xs font-bold leading-5 text-teal-950 shadow-sm">
              <span className="font-black">Rule yang sedang diuji:</span>{" "}
              Nutrisi ≥ {fmt(data?.rule?.nutrition_min_submissions)} input DAN
              kalori workout ≥ target Coach yang berlaku pada tanggal tersebut.
              <span className="ml-1">Streak/Coach memakai pipeline canonical.</span>{" "}
              <span className="font-black">Portal mirror</span> membaca activity canonical
              ditambah workout manual durable dari Google Sheet agar angka tampilan
              peserta dapat dibandingkan tanpa mengubah rule streak.
            </section>

            <section className="mt-4 rounded-[1.6rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="grid gap-3 lg:grid-cols-5">
                <div className="lg:col-span-2">
                  <label className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                    Cari
                  </label>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Nama, kode, perusahaan, tanggal, diagnosis..."
                    className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold outline-none focus:border-teal-400"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                    Peserta
                  </label>
                  <select
                    value={selectedParticipantId}
                    onChange={(event) => setSelectedParticipantId(event.target.value)}
                    className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-black outline-none"
                  >
                    <option value="all">Semua peserta</option>
                    {participants.map((item: any) => (
                      <option
                        key={item.participant_id}
                        value={item.participant_id}
                      >
                        {item.participant_name} · {item.participant_code || "-"}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                    Perusahaan
                  </label>
                  <select
                    value={companyFilter}
                    onChange={(event) => setCompanyFilter(event.target.value)}
                    className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-black outline-none"
                  >
                    <option value="all">Semua perusahaan</option>
                    {companies.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                    Status
                  </label>
                  <select
                    value={statusFilter}
                    onChange={(event) =>
                      setStatusFilter(event.target.value as StatusFilter)
                    }
                    className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-black outline-none"
                  >
                    <option value="issue">Perlu cek</option>
                    <option value="all">Semua</option>
                    <option value="pass">PASS</option>
                    <option value="steps_only">Steps tercapai, streak gagal</option>
                    <option value="target_change">Tanggal target berubah</option>
                    <option value="provider_warning">Warning provider</option>
                    <option value="mirror_mismatch">Portal mirror berbeda</option>
                  </select>
                </div>
              </div>

              {selectedParticipant ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-slate-950">
                        {selectedParticipant.participant_name}
                      </div>
                      <div className="mt-1 text-[10px] font-bold text-slate-500">
                        Kode {selectedParticipant.participant_code || "-"} ·{" "}
                        {selectedParticipant.company_name} ·{" "}
                        {selectedParticipant.group_name}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[10px] font-black">
                      <span className="rounded-full bg-white px-3 py-1.5 text-slate-700">
                        Current streak {fmt(selectedParticipant.current_streak)} hari
                      </span>
                      <span className="rounded-full bg-white px-3 py-1.5 text-slate-700">
                        Fitness {selectedParticipant.fitness_source || "none"}
                      </span>
                      <span className="rounded-full bg-white px-3 py-1.5 text-slate-700">
                        Target revisions {fmt(selectedParticipant.target_history?.revision_count)}
                      </span>
                      <span className="rounded-full bg-white px-3 py-1.5 text-slate-700">
                        Sheet workout {selectedParticipant.portal_workout_source?.google_sheet_ok === false ? "error" : "OK"}
                        {" · "}{fmt(selectedParticipant.portal_workout_source?.manual_sheet_rows)} row
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="mt-4 overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
                <div>
                  <div className="text-sm font-black text-slate-950">
                    Hasil Diagnostik 7 Hari
                  </div>
                  <div className="mt-1 text-[10px] font-bold text-slate-500">
                    {fmt(filteredRows.length)} baris sesuai filter · Generated {clean(data?.generated_at) || "-"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setCompanyFilter("all");
                    setSelectedParticipantId("all");
                    setStatusFilter("issue");
                  }}
                  className="rounded-xl bg-slate-100 px-3 py-2 text-[10px] font-black text-slate-700"
                >
                  Reset filter
                </button>
              </div>

              <div className="hidden overflow-x-auto lg:block">
                <table className="min-w-full border-collapse text-left text-xs">
                  <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-[0.08em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Peserta</th>
                      <th className="px-3 py-3">Tanggal</th>
                      <th className="px-3 py-3">Nutrisi</th>
                      <th className="px-3 py-3">Workout · Canonical vs Portal</th>
                      <th className="px-3 py-3">Steps · Canonical vs Portal</th>
                      <th className="px-3 py-3">Target efektif</th>
                      <th className="px-3 py-3">Fitness</th>
                      <th className="px-3 py-3">Hasil</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRows.map((row: any, index: number) => (
                      <tr
                        key={`${row.participant_id}-${row.date}-${index}`}
                        className="border-t border-slate-100 align-top"
                      >
                        <td className="px-4 py-3">
                          <div className="font-black text-slate-950">
                            {row.participant_name}
                          </div>
                          <div className="mt-1 text-[9px] font-bold text-slate-500">
                            {row.participant_code || "-"} · {row.company_name} · {row.group_name}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-black">
                          {row.day_label} · {row.date}
                        </td>
                        <td className="px-3 py-3">
                          <div className={row.nutrition_ok ? "font-black text-emerald-700" : "font-black text-rose-700"}>
                            {fmt(row.nutrition_count)} / {fmt(row.nutrition_min)}
                          </div>
                          <div className="mt-1 text-[9px] font-bold text-slate-400">
                            {fmt(row.nutrition_calories)} kkal
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className={row.workout_ok ? "font-black text-emerald-700" : "font-black text-rose-700"}>
                            Streak/Coach {fmt(row.workout_calories)} / {fmt(row.workout_target)} kkal
                          </div>
                          <div className={`mt-1 text-[9px] font-black ${row.mirror_mismatch ? "text-cyan-700" : "text-slate-400"}`}>
                            Portal {fmt(row.portal_workout_calories)} kkal
                            {Number(row.portal_manual_calories || 0) > 0
                              ? ` · manual ${fmt(row.portal_manual_calories)} kkal`
                              : ""}
                          </div>
                          {Number(row.portal_manual_sheet_rows || 0) > 0 ? (
                            <div className="mt-1 text-[9px] font-bold text-cyan-700">
                              {fmt(row.portal_manual_sheet_rows)} row manual dari Google Sheet
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">
                          <div className={row.steps_ok ? "font-black text-blue-700" : "font-black text-slate-600"}>
                            Streak/Coach {fmt(row.steps)} / {fmt(row.step_target)}
                          </div>
                          <div className={`mt-1 text-[9px] font-black ${Number(row.portal_steps || 0) !== Number(row.steps || 0) ? "text-cyan-700" : "text-slate-400"}`}>
                            Portal {fmt(row.portal_steps)}
                          </div>
                          {row.steps_ok && !row.success ? (
                            <div className="mt-1 text-[9px] font-black text-amber-700">
                              bukan syarat streak
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-black text-slate-700">
                            {row.target_effective_from || "baseline/default"}
                          </div>
                          {row.target_changed_today ? (
                            <div className="mt-1 text-[9px] font-black text-violet-700">
                              target berubah hari ini
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-black text-slate-700">
                            {row.fitness_source || "none"}
                          </div>
                          <div className="mt-1 text-[9px] font-bold text-slate-400">
                            canonical {fmt(row.canonical_activity_rows)} row · portal {fmt(row.portal_activity_rows)} row
                          </div>
                          {row.mirror_mismatch ? (
                            <div className="mt-1 max-w-[14rem] text-[9px] font-black leading-4 text-cyan-700">
                              🔀 Portal display berbeda dari source streak canonical
                            </div>
                          ) : null}
                          {(row.provider_warnings || []).map((warning: string) => (
                            <div
                              key={warning}
                              className="mt-1 max-w-[14rem] text-[9px] font-bold leading-4 text-violet-700"
                            >
                              ⚠ {providerWarningLabel(warning)}
                            </div>
                          ))}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-black ${statusTone(row)}`}>
                            {row.success ? "PASS" : "FAIL"}
                          </span>
                          <div className="mt-2 max-w-[16rem] text-[10px] font-bold leading-4 text-slate-600">
                            {row.diagnosis_label}
                          </div>
                          {row.mirror_mismatch ? (
                            <div className="mt-1 max-w-[16rem] text-[9px] font-black leading-4 text-cyan-700">
                              Portal mirror berbeda: {(row.mirror_mismatch_reasons || []).join(", ")}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 p-3 lg:hidden">
                {paginatedRows.map((row: any, index: number) => (
                  <article
                    key={`${row.participant_id}-${row.date}-mobile-${index}`}
                    className="rounded-[1.3rem] border border-slate-100 bg-slate-50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="break-words text-sm font-black text-slate-950">
                          {row.participant_name}
                        </div>
                        <div className="mt-1 text-[9px] font-bold text-slate-500">
                          {row.participant_code || "-"} · {row.company_name}
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-black ${statusTone(row)}`}>
                        {row.success ? "PASS" : "FAIL"}
                      </span>
                    </div>
                    <div className="mt-3 text-xs font-black text-slate-700">
                      {row.day_label} · {row.date}
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl bg-white p-2">
                        <div className="text-[8px] font-black uppercase text-slate-400">Nutrisi</div>
                        <div className={`mt-1 text-xs font-black ${row.nutrition_ok ? "text-emerald-700" : "text-rose-700"}`}>
                          {fmt(row.nutrition_count)}/{fmt(row.nutrition_min)}
                        </div>
                      </div>
                      <div className="rounded-xl bg-white p-2">
                        <div className="text-[8px] font-black uppercase text-slate-400">Workout</div>
                        <div className={`mt-1 text-xs font-black ${row.workout_ok ? "text-emerald-700" : "text-rose-700"}`}>
                          {fmt(row.workout_calories)}/{fmt(row.workout_target)}
                        </div>
                        <div className="mt-1 text-[8px] font-bold text-cyan-700">Portal {fmt(row.portal_workout_calories)}</div>
                      </div>
                      <div className="rounded-xl bg-white p-2">
                        <div className="text-[8px] font-black uppercase text-slate-400">Steps</div>
                        <div className={`mt-1 text-xs font-black ${row.steps_ok ? "text-blue-700" : "text-slate-700"}`}>
                          {fmt(row.steps)}/{fmt(row.step_target)}
                        </div>
                        <div className="mt-1 text-[8px] font-bold text-cyan-700">Portal {fmt(row.portal_steps)}</div>
                      </div>
                    </div>
                    <div className="mt-3 rounded-xl bg-white p-3 text-[10px] font-bold leading-4 text-slate-600">
                      <div className="font-black text-slate-800">{row.diagnosis_label}</div>
                      <div className="mt-1">
                        Target efektif: {row.target_effective_from || "baseline/default"}
                        {row.target_changed_today ? " · berubah hari ini" : ""}
                      </div>
                      <div className="mt-1">Fitness: {row.fitness_source || "none"}</div>
                      <div className="mt-1">Source: canonical {fmt(row.canonical_activity_rows)} row · portal {fmt(row.portal_activity_rows)} row</div>
                      {row.mirror_mismatch ? (
                        <div className="mt-1 font-black text-cyan-700">
                          🔀 Portal display berbeda dari streak canonical.
                        </div>
                      ) : null}
                      {row.steps_ok && !row.success ? (
                        <div className="mt-1 font-black text-amber-700">
                          Steps tercapai, tetapi langkah bukan syarat streak.
                        </div>
                      ) : null}
                      {(row.provider_warnings || []).map((warning: string) => (
                        <div key={warning} className="mt-1 font-bold text-violet-700">
                          ⚠ {providerWarningLabel(warning)}
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>

              {paginatedRows.length === 0 ? (
                <div className="p-10 text-center text-sm font-bold text-slate-400">
                  Tidak ada baris yang cocok dengan filter.
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-4 text-[10px] font-black text-slate-600 sm:px-5">
                <div>
                  Halaman {safePage} dari {totalPages}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage((previous) => Math.max(1, previous - 1))}
                    className="rounded-xl bg-slate-100 px-3 py-2 disabled:opacity-40"
                  >
                    Sebelumnya
                  </button>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() =>
                      setPage((previous) => Math.min(totalPages, previous + 1))
                    }
                    className="rounded-xl bg-slate-950 px-3 py-2 text-white disabled:opacity-40"
                  >
                    Berikutnya
                  </button>
                </div>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
