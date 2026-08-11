"use client";

import { useEffect, useMemo, useState } from "react";

// WELLNESS_GOOGLE_FIT_RAW_DIAGNOSTIC_UI_V126M58_1

function clean(v: any) { return String(v ?? "").trim(); }
function n(v: any) { const x = Number(v); return Number.isFinite(x) ? x : 0; }
function fmt(v: any, digits = 0) {
  return n(v).toLocaleString("id-ID", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
const labels: Record<string, string> = {
  "com.google.step_count.delta": "Steps",
  "com.google.distance.delta": "Distance (meter)",
  "com.google.calories.expended": "Calories Expended",
  "com.google.active_minutes": "Active Minutes",
  "com.google.activity.segment": "Activity Segment",
};

export default function GoogleFitRawDiagnosticPage() {
  const [participantId, setParticipantId] = useState("");
  const [days, setDays] = useState("3");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const id = p.get("participant_id") || "";
    const d = p.get("days") || "3";
    setParticipantId(id);
    setDays(d);
    if (id) run(id, d);
  }, []);

  async function run(id = participantId, d = days) {
    if (!clean(id)) return;
    setLoading(true); setError(""); setData(null);
    const r = await fetch(`/api/wellness/admin/google-fit-raw-diagnostic?participant_id=${encodeURIComponent(id)}&days=${encodeURIComponent(d)}&_=${Date.now()}`, { credentials: "include", cache: "no-store" })
      .then(async (res) => ({ ...(await res.json().catch(() => ({}))), http_status: res.status }))
      .catch((e) => ({ ok: false, message: e?.message || "Network error" }));
    if (r.ok) setData(r); else setError(r.message || `Diagnostic gagal (${r.http_status || "?"}).`);
    setLoading(false);
  }

  const aggregateDates = useMemo(() => {
    const map = new Map<string, any>();
    const agg = data?.cloud?.aggregates || {};
    Object.entries(agg).forEach(([type, rows]: any) => {
      (Array.isArray(rows) ? rows : []).forEach((r: any) => {
        const row = map.get(r.date) || { date: r.date };
        row[type] = r.total;
        map.set(r.date, row);
      });
    });
    return [...map.values()].sort((a, b) => clean(a.date).localeCompare(clean(b.date)));
  }, [data]);

  const verdictTone = data?.verdict === "CLOUD_HAS_DATA_BUT_DB_EMPTY"
    ? "border-rose-200 bg-rose-50 text-rose-900"
    : data?.verdict === "GOOGLE_CLOUD_NO_ACTIVITY_IN_RANGE"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : "border-emerald-200 bg-emerald-50 text-emerald-900";

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-950 md:p-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-7">
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-600">Google Fit Raw Diagnostic</div>
          <h1 className="mt-1 text-2xl font-black md:text-3xl">Cloud Google Fit vs History Wellness</h1>
          <p className="mt-2 text-sm font-semibold text-slate-500">READ ONLY. Tidak melakukan sync, normalisasi, update database, atau write ke Google Fit.</p>
          <div className="mt-5 grid gap-3 md:grid-cols-[1fr_180px_180px]">
            <input value={participantId} onChange={(e) => setParticipantId(e.target.value)} placeholder="Participant ID, contoh 92" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold outline-none focus:border-sky-400" />
            <select value={days} onChange={(e) => setDays(e.target.value)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold">
              {[1,2,3,5,7].map((x) => <option key={x} value={x}>{x} hari</option>)}
            </select>
            <button onClick={() => run()} disabled={loading || !clean(participantId)} className="rounded-2xl bg-slate-950 px-4 py-3 font-black text-white disabled:opacity-40">{loading ? "Membaca..." : "Tarik Raw Data"}</button>
          </div>
          {error ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800">{error}</div> : null}
        </section>

        {data ? <>
          <section className={`rounded-[2rem] border p-5 ${verdictTone}`}>
            <div className="text-xs font-black uppercase tracking-[0.12em]">Verdict</div>
            <div className="mt-1 text-xl font-black">{data.verdict}</div>
            <div className="mt-2 text-xs font-bold">Range {data.range?.start_date} s/d {data.range?.end_date} · {data.range?.timezone}</div>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            <Card title="Peserta">
              <b>{data.participant?.name || "-"}</b><br />Kode {data.participant?.code || "-"} · ID {data.participant?.id || "-"}<br />Email peserta: {data.participant?.participant_email || "-"}
            </Card>
            <Card title="OAuth Google Account">
              <b>{data.oauth_account?.email || "Tidak terbaca"}</b><br />{data.oauth_account?.name || "-"}<br />Signal: {data.oauth_email_signal || "-"}
            </Card>
            <Card title="Integration">
              Token: {data.integration?.token_mode || "-"}<br />Last Sync: {data.integration?.last_sync_at || "-"}<br />Scope: {data.integration?.accepted_scope || data.integration?.scope || "-"}
            </Card>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-black">Aggregate Harian dari Cloud Google Fit</h2><span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black">{aggregateDates.length} hari</span></div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-xs"><thead><tr className="border-b border-slate-200 text-slate-500"><Th>Tanggal</Th><Th>Steps</Th><Th>Distance</Th><Th>Calories</Th><Th>Active Minutes</Th></tr></thead>
              <tbody>{aggregateDates.map((r: any) => <tr key={r.date} className="border-b border-slate-100"><Td>{r.date}</Td><Td>{fmt(r["com.google.step_count.delta"])}</Td><Td>{fmt(r["com.google.distance.delta"], 1)} m</Td><Td>{fmt(r["com.google.calories.expended"], 1)} kcal</Td><Td>{fmt(r["com.google.active_minutes"], 1)}</Td></tr>)}</tbody></table>
              {!aggregateDates.length ? <div className="py-8 text-center text-sm font-bold text-slate-400">Aggregate cloud kosong.</div> : null}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Card title={`Sessions (${data.cloud?.sessions?.length || 0})`}>
              <div className="max-h-80 space-y-2 overflow-auto">
                {(data.cloud?.sessions || []).map((s: any, i: number) => <div key={s.id || i} className="rounded-xl bg-slate-50 p-3 text-xs"><b>{s.name || `Session ${i+1}`}</b><br />activityType {s.activity_type ?? "-"} · app {s.application?.name || s.application?.package_name || "-"}<br />{s.start_time_millis || "-"} → {s.end_time_millis || "-"}</div>)}
                {!data.cloud?.sessions?.length ? <div className="text-sm font-bold text-slate-400">Tidak ada session pada range ini.</div> : null}
              </div>
            </Card>
            <Card title={`History DB Google Fit (${data.db_google_fit_rows?.length || 0})`}>
              <div className="max-h-80 space-y-2 overflow-auto">
                {(data.db_google_fit_rows || []).map((r: any) => <div key={r.id} className="rounded-xl bg-slate-50 p-3 text-xs"><b>{r.log_date || "-"}</b> · {fmt(r.steps)} steps · {fmt(r.calories,1)} kcal · {fmt(r.distance_km,2)} km<br />{r.external_activity_id || "-"}</div>)}
                {!data.db_google_fit_rows?.length ? <div className="text-sm font-bold text-rose-500">Belum ada row Google Fit di wellness_activity_logs.</div> : null}
              </div>
            </Card>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black">Data Sources & Raw Points</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">Menunjukkan stream yang terlihat oleh OAuth server dan contoh point mentah. Maks. 12 stream.</p>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {(data.cloud?.raw_points || []).map((r: any, i: number) => <div key={`${r.data_stream_id}-${i}`} className="rounded-2xl border border-slate-200 p-4 text-xs"><div className="font-black">{labels[r.data_type] || r.data_type || "Unknown"}</div><div className="mt-1 break-all text-[10px] text-slate-500">{r.data_stream_id}</div><div className="mt-2 font-bold">App: {r.application?.name || r.application?.package_name || "-"} · Device: {r.device?.manufacturer || "-"} {r.device?.model || ""}</div><div className="mt-1">Points returned: <b>{r.point_count_returned || 0}</b>{r.error ? <span className="text-rose-600"> · {r.error}</span> : null}</div><div className="mt-2 max-h-40 overflow-auto rounded-xl bg-slate-50 p-2 font-mono text-[10px] whitespace-pre-wrap">{JSON.stringify(r.samples || [], null, 2)}</div></div>)}
              {!data.cloud?.raw_points?.length ? <div className="text-sm font-bold text-slate-400">Tidak ada raw data source yang terlihat.</div> : null}
            </div>
          </section>

          {Object.keys(data.errors || {}).length ? <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-5"><h2 className="font-black text-amber-900">Partial API Errors</h2><pre className="mt-3 overflow-auto whitespace-pre-wrap text-xs text-amber-900">{JSON.stringify(data.errors, null, 2)}</pre></section> : null}
        </> : null}
      </div>
    </main>
  );
}

function Card({ title, children }: { title: string; children: any }) { return <section className="rounded-[2rem] border border-slate-200 bg-white p-5 text-sm leading-6 shadow-sm"><div className="mb-2 text-xs font-black uppercase tracking-[0.1em] text-slate-500">{title}</div>{children}</section>; }
function Th({ children }: { children: any }) { return <th className="px-3 py-3 font-black">{children}</th>; }
function Td({ children }: { children: any }) { return <td className="px-3 py-3 font-bold">{children}</td>; }
