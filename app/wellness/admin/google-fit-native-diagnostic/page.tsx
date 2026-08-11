"use client";

// WELLNESS_GOOGLE_FIT_NATIVE_BRIDGE_DIAGNOSTIC_UI_V126M58_3

import { useEffect, useMemo, useState } from "react";

function clean(value: any) {
  return String(value ?? "").trim();
}

function fmt(value: any) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString("id-ID", { maximumFractionDigits: 1 })
    : "-";
}

function dateTime(value: any) {
  const text = clean(value);
  if (!text) return "-";
  const date = new Date(text);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
    : text;
}

function Badge({ children, tone = "slate" }: { children: any; tone?: string }) {
  const cls =
    tone === "green"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : tone === "red"
        ? "bg-rose-50 text-rose-700 border-rose-200"
        : tone === "amber"
          ? "bg-amber-50 text-amber-700 border-amber-200"
          : "bg-slate-50 text-slate-600 border-slate-200";
  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${cls}`}>
      {children}
    </span>
  );
}

function verdictTone(verdict: string) {
  if (verdict === "NATIVE_PUSH_AND_DB_ROW_PRESENT") return "green";
  if (verdict === "NATIVE_ACCOUNT_MISMATCH") return "red";
  if (
    verdict === "NATIVE_SNAPSHOT_SEEN_BUT_NO_DAILY_ROW" ||
    verdict === "NATIVE_SIGNAL_PRESENT_NO_DAILY_ROW"
  ) return "amber";
  return "slate";
}

export default function GoogleFitNativeBridgeDiagnosticPage() {
  const [participantId, setParticipantId] = useState("92");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = clean(params.get("participant_id")) || "92";
    setParticipantId(id);
    void load(id);
  }, []);

  async function load(id = participantId) {
    if (!Number(id)) return;
    setLoading(true);
    setError("");
    const result = await fetch(
      `/api/wellness/admin/google-fit-native-diagnostic?participant_id=${encodeURIComponent(id)}&_=${Date.now()}`,
      { credentials: "include", cache: "no-store" },
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
      setError(result.message || "Diagnostic gagal.");
      return;
    }
    setData(result);
    const url = new URL(window.location.href);
    url.searchParams.set("participant_id", id);
    window.history.replaceState(null, "", url.toString());
  }

  const nativeRows = useMemo(
    () => (Array.isArray(data?.native_rows) ? data.native_rows : []),
    [data],
  );

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 md:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-wide text-orange-500">
                Google Fit Native Bridge Diagnostic
              </div>
              <h1 className="mt-1 text-2xl font-black">
                Cek apakah HP pernah push Google Fit ke Harmony
              </h1>
              <p className="mt-2 max-w-3xl text-sm font-medium text-slate-500">
                Read-only. Tidak menjalankan sync, tidak mengubah DB, dan tidak menampilkan token OAuth.
              </p>
            </div>
            <div className="flex w-full gap-2 md:w-auto">
              <input
                value={participantId}
                onChange={(event) => setParticipantId(event.target.value)}
                className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-3 font-bold outline-none focus:border-sky-400 md:w-40"
                placeholder="Participant ID"
              />
              <button
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
            <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm md:p-7">
              <div className="flex flex-wrap items-center gap-3">
                <Badge tone={verdictTone(clean(data.verdict))}>{data.verdict}</Badge>
                <span className="text-sm font-semibold text-slate-500">{data.meaning}</span>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs font-black text-slate-400">PESERTA</div>
                  <div className="mt-2 text-lg font-black">{data.participant?.name || "-"}</div>
                  <div className="text-sm font-semibold text-slate-500">
                    Kode {data.participant?.code || "-"} · ID {data.participant?.id || "-"}
                  </div>
                </div>
                <div className="rounded-2xl bg-sky-50 p-4">
                  <div className="text-xs font-black text-sky-500">OAUTH PORTAL</div>
                  <div className="mt-2 break-all text-sm font-black">
                    {data.integration?.oauth_email || "-"}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">
                    Connected: {dateTime(data.integration?.connected_at)}
                  </div>
                </div>
                <div className="rounded-2xl bg-emerald-50 p-4">
                  <div className="text-xs font-black text-emerald-600">NATIVE HP</div>
                  <div className="mt-2 break-all text-sm font-black">
                    {data.integration?.native_account_email || "Belum pernah terdeteksi"}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">
                    Last native sync: {dateTime(data.integration?.native_last_sync_at)}
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="text-xs font-black text-slate-400">NATIVE SIGNAL</div>
                <div className="mt-2 text-2xl font-black">
                  {data.signals?.has_native_signal ? "ADA" : "BELUM ADA"}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="text-xs font-black text-slate-400">NATIVE DB ROW</div>
                <div className="mt-2 text-2xl font-black">{data.signals?.native_row_count ?? 0}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="text-xs font-black text-slate-400">ALL GOOGLE FIT ROW</div>
                <div className="mt-2 text-2xl font-black">{data.signals?.google_fit_row_count ?? 0}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="text-xs font-black text-slate-400">ACCOUNT MATCH</div>
                <div className="mt-2 text-2xl font-black">
                  {data.integration?.account_match === true
                    ? "YA"
                    : data.integration?.account_match === false
                      ? "TIDAK"
                      : "-"}
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm md:p-7">
              <h2 className="text-lg font-black">Snapshot Native Terakhir</h2>
              {data.integration?.native_last_snapshot ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ["Tanggal", data.integration.native_last_snapshot.date],
                    ["Measured", dateTime(data.integration.native_last_snapshot.measured_at)],
                    ["Steps", fmt(data.integration.native_last_snapshot.steps)],
                    ["Total Calories", `${fmt(data.integration.native_last_snapshot.total_calories)} kkal`],
                    ["Active Calories", data.integration.native_last_snapshot.active_calories == null ? "-" : `${fmt(data.integration.native_last_snapshot.active_calories)} kkal`],
                    ["Distance", `${fmt(data.integration.native_last_snapshot.distance_km)} km`],
                    ["Source", data.integration.native_last_snapshot.source || "-"],
                    ["Account", data.integration.native_last_snapshot.account_email || "-"],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-[11px] font-black uppercase text-slate-400">{label}</div>
                      <div className="mt-1 break-all font-black">{value}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-2xl bg-amber-50 p-4 font-bold text-amber-700">
                  Belum ada native_last_snapshot pada integration Google Fit peserta ini.
                </div>
              )}
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm md:p-7">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black">Row Native Google Fit di Database</h2>
                  <p className="text-sm font-medium text-slate-500">
                    Hanya metadata aman; token dan full raw payload tidak ditampilkan.
                  </p>
                </div>
                <Badge>{nativeRows.length} row</Badge>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-[900px] w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs font-black uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-3">Tanggal</th>
                      <th className="px-3 py-3">Steps</th>
                      <th className="px-3 py-3">Calories</th>
                      <th className="px-3 py-3">Distance</th>
                      <th className="px-3 py-3">Mode</th>
                      <th className="px-3 py-3">Native Email</th>
                      <th className="px-3 py-3">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nativeRows.length ? (
                      nativeRows.map((row: any, index: number) => (
                        <tr key={clean(row.id) || `${row.log_date}-${index}`} className="border-b border-slate-100">
                          <td className="px-3 py-3 font-bold">{row.log_date || "-"}</td>
                          <td className="px-3 py-3">{fmt(row.steps)}</td>
                          <td className="px-3 py-3">{fmt(row.calories)} kkal</td>
                          <td className="px-3 py-3">{fmt(row.distance_km)} km</td>
                          <td className="px-3 py-3">{row.sync_mode || (row.native_live ? "native_live" : "-")}</td>
                          <td className="px-3 py-3">{row.native_account_email || "-"}</td>
                          <td className="px-3 py-3">{dateTime(row.updated_at)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="px-3 py-8 text-center font-bold text-slate-400">
                          Belum ada row native Google Fit.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm font-semibold text-emerald-800">
              {data.security_note}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
