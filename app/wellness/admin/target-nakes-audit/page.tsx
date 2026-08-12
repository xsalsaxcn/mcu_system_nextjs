"use client";

// WELLNESS_TARGET_NAKES_IDENTITY_AUDIT_UI_V126M60

import { useEffect, useMemo, useState } from "react";

function clean(value: any) {
  return String(value ?? "").trim();
}

function numberText(value: any, digits = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "-";
  return n.toLocaleString("id-ID", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function tone(verdict: string) {
  if (verdict === "TARGET_OK") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (verdict === "TARGET_HISTORY_OK_PARTICIPANT_FIELD_STALE") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function targetSummary(target: any) {
  if (!target) return "-";
  return `BB ${numberText(target.weight_kg, 1)} kg · workout ${numberText(
    target.workout,
  )} · nutrisi ${numberText(target.nutrition)} · langkah ${numberText(target.steps)}`;
}

export default function TargetNakesAuditPage() {
  const [date, setDate] = useState("2026-08-12");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(nextDate = date) {
    setLoading(true);
    setError("");
    const result = await fetch(
      `/api/wellness/admin/target-nakes-audit?date=${encodeURIComponent(nextDate)}&_=${Date.now()}`,
      { cache: "no-store", credentials: "include" },
    )
      .then(async (response) => ({
        ...(await response.json().catch(() => ({}))),
        http_status: response.status,
      }))
      .catch((err) => ({
        ok: false,
        message: err?.message || "Network error",
      }));
    setLoading(false);
    if (!result.ok) {
      setData(null);
      setError(result.message || "Audit gagal.");
      return;
    }
    setData(result);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initial = clean(params.get("date")) || "2026-08-12";
    setDate(initial);
    void load(initial);
  }, []);

  const rows = useMemo(
    () => (Array.isArray(data?.rows) ? data.rows : []),
    [data],
  );

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 md:px-8">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-wide text-teal-700">
                Wellness Admin · Read Only
              </div>
              <h1 className="mt-1 text-2xl font-black md:text-3xl">
                Audit Target BB + Identitas NAKES
              </h1>
              <p className="mt-2 max-w-4xl text-sm font-semibold text-slate-500">
                Membandingkan target effective-dated canonical dengan kolom participant,
                serta BB/TB NAKES berdasarkan Participant ID + kode. Tidak mengubah data.
              </p>
            </div>
            <div className="flex gap-2">
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="rounded-xl border border-slate-200 px-4 py-3 font-bold"
              />
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
              >
                {loading ? "Mengecek..." : "Cek Ulang"}
              </button>
            </div>
          </div>
        </section>

        {error ? (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5 font-bold text-rose-700">
            {error}
          </section>
        ) : null}

        {data ? (
          <>
            <section className="rounded-2xl border border-sky-200 bg-sky-50 p-5 text-sm font-semibold text-sky-900">
              Tanggal audit <strong>{data.selected_date}</strong> · {data.watched_count} peserta.
              Target memakai helper effective-dated V126M44 yang sama dengan pipeline canonical.
            </section>

            <section className="grid gap-4">
              {rows.map((row: any) => {
                const latest = row?.nakes?.canonical_latest;
                const selectedTarget = row?.effective_target_on_date;
                const fieldWeight = row?.participant_target_fields?.weight_kg;
                const revision = row?.effective_revision_on_date;
                return (
                  <article
                    key={row?.expected?.id}
                    className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                      <div>
                        <h2 className="text-xl font-black">
                          {row?.identity?.name || row?.expected?.name || "Peserta"}
                        </h2>
                        <div className="mt-1 text-sm font-bold text-slate-500">
                          Kode {row?.identity?.code || row?.expected?.code} · Participant ID{" "}
                          {row?.identity?.participant_id || row?.expected?.id}
                        </div>
                      </div>
                      <span className={`w-fit rounded-full border px-3 py-1 text-xs font-black ${tone(clean(row?.verdict))}`}>
                        {row?.verdict}
                      </span>
                    </div>

                    <div className="mt-5 grid gap-3 lg:grid-cols-4">
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <div className="text-[11px] font-black uppercase text-slate-400">
                          Target canonical {data.selected_date}
                        </div>
                        <div className="mt-2 text-sm font-black">
                          {targetSummary(selectedTarget)}
                        </div>
                        <div className="mt-2 text-xs font-semibold text-slate-500">
                          Revision: {revision?.effective_from || "-"} · note #{revision?.note_id || "-"}
                        </div>
                      </div>

                      <div className="rounded-2xl bg-amber-50 p-4">
                        <div className="text-[11px] font-black uppercase text-amber-600">
                          Participant field
                        </div>
                        <div className="mt-2 text-2xl font-black text-amber-950">
                          {numberText(fieldWeight, 1)} kg
                        </div>
                        <div className="mt-1 text-xs font-semibold text-amber-700">
                          Jika berbeda dengan canonical, field ini stale dan tidak boleh mengalahkan history.
                        </div>
                      </div>

                      <div className="rounded-2xl bg-emerald-50 p-4">
                        <div className="text-[11px] font-black uppercase text-emerald-600">
                          NAKES terbaru
                        </div>
                        <div className="mt-2 text-sm font-black text-emerald-950">
                          BB {numberText(latest?.weight_kg, 1)} kg · TB{" "}
                          {numberText(latest?.height_cm, 1)} cm
                        </div>
                        <div className="mt-1 text-xs font-semibold text-emerald-700">
                          {latest?.date || "Belum ada tanggal"} · {latest?.source || "source canonical"}
                        </div>
                      </div>

                      <div className="rounded-2xl bg-sky-50 p-4">
                        <div className="text-[11px] font-black uppercase text-sky-600">
                          Identity NAKES
                        </div>
                        <div className="mt-2 text-2xl font-black text-sky-950">
                          {row?.nakes?.identity_mismatch_count || 0}
                        </div>
                        <div className="mt-1 text-xs font-semibold text-sky-700">
                          row history dengan ID/kode tidak cocok
                        </div>
                      </div>
                    </div>

                    <details className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <summary className="cursor-pointer font-black">
                        Lihat target history + NAKES recent
                      </summary>
                      <div className="mt-4 grid gap-4 xl:grid-cols-2">
                        <div>
                          <div className="mb-2 text-xs font-black uppercase text-slate-500">
                            Target revisions
                          </div>
                          <pre className="max-h-[420px] overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-white">
                            {JSON.stringify(row?.target_timeline?.revisions || [], null, 2)}
                          </pre>
                        </div>
                        <div>
                          <div className="mb-2 text-xs font-black uppercase text-slate-500">
                            NAKES canonical recent
                          </div>
                          <pre className="max-h-[420px] overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-white">
                            {JSON.stringify(row?.nakes?.canonical_recent || [], null, 2)}
                          </pre>
                        </div>
                      </div>
                    </details>
                  </article>
                );
              })}
            </section>

            <section className="rounded-[26px] border border-violet-200 bg-violet-50 p-5">
              <h2 className="font-black text-violet-950">Kontrol dua Teguh Santoso</h2>
              <pre className="mt-3 overflow-auto rounded-xl bg-white p-4 text-xs text-slate-700">
                {JSON.stringify(data.duplicate_name_control, null, 2)}
              </pre>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
