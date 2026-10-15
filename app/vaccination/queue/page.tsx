"use client";

import { useEffect, useMemo, useState } from "react";

const LOCK_KEY = "harmony_vaccination_locked_register_context_v65";

const colors: Record<string, string> = {
  IMPORTED: "bg-slate-900 text-white",
  REGISTERED: "bg-slate-900 text-white",
  WAITING: "bg-red-100 text-red-700",
  WAITING_WITH_NOTE: "bg-orange-100 text-orange-700",
  CALLED: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  ADMINISTERED: "bg-emerald-100 text-emerald-700",
  DONE: "bg-emerald-100 text-emerald-700",
  SKIPPED: "bg-amber-100 text-amber-800",
};


function queueNote(registration: any) {
  const base = String(registration?.status_note || registration?.payment_note || "").trim();
  const items = Array.isArray(registration?.items) ? registration.items : [];
  const notDone = items.filter((item: any) => !["ADMINISTERED", "DONE"].includes(String(item?.status || "").toUpperCase()));
  const productText = notDone.map((item: any) => {
    const product = item?.vaccine?.name || "Produk";
    const category = item?.price_category ? ` · ${item.price_category}` : "";
    const pay = item?.payment_note || item?.payment_method ? ` · ${item.payment_note || item.payment_method}` : "";
    return `${product}${category}${pay}`;
  }).filter(Boolean).join("; ");
  return [base, productText ? `Produk Not Done: ${productText}` : ""].filter(Boolean).join(" | ") || "-";
}

function sessionLabel(session: any) {
  const eventName = session?.source_name || String(session?.session_name || "").split(" - ")[0] || "Session";
  return [eventName, session?.location, session?.session_date]
    .filter(Boolean)
    .join(" · ");
}

function label(status: string) {
  const s = String(status || "").toUpperCase();
  if (["IMPORTED", "REGISTERED"].includes(s)) return "Belum Datang";
  if (s === "WAITING") return "Waiting";
  if (s === "WAITING_WITH_NOTE") return "Waiting With Note";
  if (s === "CALLED") return "Dipanggil";
  if (s === "IN_PROGRESS") return "Dokter";
  if (["ADMINISTERED", "DONE"].includes(s)) return "Selesai";
  if (s === "SKIPPED") return "Skipped";
  return status || "-";
}

const VACCINATION_QUEUE_MOJIBAKE_REPLACEMENTS: Array<[string, string]> = [
  ["\u00C3\u0192\u00E2\u20AC\u0161\u00C3\u201A\u00C2\u00B7", " · "],
  ["\u00C3\u201A\u00C2\u00B7", " · "],
  ["\u00C2\u00B7", " · "],
  ["\u00C3\u0192\u00E2\u20AC\u0161", ""],
  ["\u00C3\u201A", ""],
  ["\u00C3\u00A2\u00E2\u201A\u00AC\u00C2\u00A2", " - "],
  ["\u00E2\u20AC\u00A2", " - "],
  ["\u00C3\u00A2\u00E2\u201A\u00AC\u00E2\u20AC\u0153", "-"],
  ["\u00E2\u20AC\u201C", "-"],
  ["\u00C3\u00A2\u00E2\u201A\u00AC\u00E2\u20AC\u009D", "-"],
  ["\u00E2\u20AC\u201D", "-"],
  ["\u00C3\u00A2\u00E2\u201A\u00AC\u00CB\u0153", "'"],
  ["\u00C3\u00A2\u00E2\u201A\u00AC\u00E2\u201E\u00A2", "'"],
  ["\u00E2\u20AC\u2122", "'"],
  ["\u00C3\u00A2\u00E2\u201A\u00AC\u00C5\u201C", "\""],
  ["\u00C3\u00A2\u00E2\u201A\u00AC\u00EF\u00BF\u00BD", "\""],
  ["\u00E2\u20AC\u0153", "\""],
  ["\u00E2\u20AC\u009D", "\""],
  ["\u00C3\u00A2\u00E2\u20AC\u017E\u00C2\u00A2", ""],
  ["\u00C3\u00A2\u00CB\u0153\u00C2\u00B0", "☰"],
  ["\u00E2\u02DC\u00B0", "☰"],
  ["\u00C3\u00B0\u00C5\u00B8\u00E2\u20AC\u009D\u00E2\u20AC\u2122", "🔒"],
  ["\u00C3\u00B0\u00C5\u00B8\u00E2\u20AC\u009D", "🔒"],
  ["\u00F0\u0178\u201D\u2019", "🔒"],
  ["\u00C3\u00B0\u00C5\u00B8\u00C5\u00A1", ""],
  ["\u00E2\u201D\u00AC\u00E2\u2022\u2013", " - "],
];

function cleanVaccinationQueueText(value: any) {
  let text = String(value ?? "");

  for (const [bad, replacement] of VACCINATION_QUEUE_MOJIBAKE_REPLACEMENTS) {
    if (text.includes(bad)) text = text.split(bad).join(replacement);
  }

  return text
    .replace(/\s+·\s+/g, " · ")
    .replace(/\s+-\s+/g, " - ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanVaccinationSession(session: any) {
  if (!session) return session;
  return {
    ...session,
    session_name: cleanVaccinationQueueText(session.session_name),
    company_name: cleanVaccinationQueueText(session.company_name),
    location_name: cleanVaccinationQueueText(session.location_name),
    display_name: cleanVaccinationQueueText(session.display_name),
  };
}

function cleanVaccinationSessions(items: any) {
  return Array.isArray(items) ? items.map(cleanVaccinationSession) : [];
}
export default function VaccinationQueuePage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [contextLocked, setContextLocked] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [message, setMessage] = useState("Pilih session untuk menjalankan antrian.");
  const [error, setError] = useState("");

  async function loadSessions() {
    const json = await fetch("/api/vaccination/sessions", { cache: "no-store" }).then((r) => r.json());
    if (json.ok) {
      const loadedSessions = json.sessions || [];
      setSessions(cleanVaccinationSessions(loadedSessions));
      let saved: any = null;
      if (typeof window !== "undefined") {
        try { saved = JSON.parse(window.localStorage.getItem(LOCK_KEY) || "null"); } catch { saved = null; }
      }
      const savedSession = saved?.locked ? loadedSessions.find((item: any) => String(item.id) === String(saved.sessionId)) : null;
      setContextLocked(Boolean(saved?.locked && savedSession));
      if (!sessionId && (savedSession?.id || loadedSessions?.[0]?.id)) setSessionId(String(savedSession?.id || loadedSessions[0].id));
    }
  }

  async function loadQueue(id = sessionId) {
    if (!id) return;
    const json = await fetch(`/api/vaccination/queue?session_id=${id}`, { cache: "no-store" }).then((r) => r.json());
    if (!json.ok) { setError(json.message || "Gagal mengambil antrian."); return; }
    setSession(cleanVaccinationSession(json.session));
    setRegistrations(cleanVaccinationSessions(json.registrations || []));
  }

  async function action(actionName: string, registrationId?: number, track: "A" | "B" = "A") {
    setError("");
    const json = await fetch("/api/vaccination/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: actionName, sessionId: Number(sessionId), registrationId, track }),
    }).then((r) => r.json());
    if (!json.ok) { setError(json.message || "Action gagal."); return; }
    setMessage(json.message);
    loadQueue();
  }

  useEffect(() => { loadSessions(); }, []);
  useEffect(() => { loadQueue(sessionId); const t = setInterval(() => loadQueue(sessionId), 5000); return () => clearInterval(t); }, [sessionId]);

  const dualQueue = String(session?.existing_queue_profile || "LEGACY").toUpperCase() === "HEALTHDAY_BAZAR";
  const doctorEnabled = session?.existing_flow_config?.doctor !== false;

  function serviceHasTrack(row: any, track: "A" | "B") {
    const status = String(row?.patient_service_status || "HEALTHDAY").toUpperCase();
    return track === "A"
      ? status === "HEALTHDAY" || status === "COMBINATION"
      : status === "BAZAR" || status === "COMBINATION";
  }

  function trackStatus(row: any, track: "A" | "B") {
    return String(track === "A" ? row?.queue_status : row?.bazar_queue_status || "REGISTERED").toUpperCase();
  }

  function trackNumber(row: any, track: "A" | "B") {
    return track === "A" ? row?.queue_number : row?.bazar_queue_number;
  }

  function queueSortValue(value: any) {
    const match = String(value || "").match(/(\d+)$/);
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
  }

  function rowsForTrack(track: "A" | "B") {
    return registrations
      .filter((row) => serviceHasTrack(row, track))
      .sort((a, b) => queueSortValue(trackNumber(a, track)) - queueSortValue(trackNumber(b, track)) || Number(a.id || 0) - Number(b.id || 0));
  }

  function trackStats(trackRows: any[], track: "A" | "B") {
    const result = { waiting: 0, active: 0, skipped: 0, done: 0 };
    trackRows.forEach((row) => {
      const s = trackStatus(row, track);
      if (["WAITING", "WAITING_WITH_NOTE", "REGISTERED"].includes(s)) result.waiting += 1;
      if (["CALLED", "IN_PROGRESS"].includes(s)) result.active += 1;
      if (s === "SKIPPED") result.skipped += 1;
      if (["ADMINISTERED", "DONE", "FINISHED"].includes(s)) result.done += 1;
    });
    return result;
  }

  const legacyStats = useMemo(() => {
    const r = { waiting: 0, doctor: 0, skipped: 0, done: 0 };
    registrations.forEach((x) => {
      const s = String(x.queue_status || "").toUpperCase();
      if (["WAITING", "WAITING_WITH_NOTE", "REGISTERED"].includes(s)) r.waiting += 1;
      if (["CALLED", "IN_PROGRESS"].includes(s)) r.doctor += 1;
      if (s === "SKIPPED") r.skipped += 1;
      if (["ADMINISTERED", "DONE"].includes(s)) r.done += 1;
    });
    return r;
  }, [registrations]);

  const legacySkipped = useMemo(
    () => registrations.filter((r) => String(r.queue_status || "").toUpperCase() === "SKIPPED"),
    [registrations],
  );
  const legacyActive = useMemo(
    () => registrations.filter((r) => String(r.queue_status || "").toUpperCase() !== "SKIPPED"),
    [registrations],
  );

  if (!dualQueue) {
    return (
      <main className="p-6"><div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:justify-between"><div><h1 className="text-2xl font-bold">Antrian Vaksin</h1><p className="mt-2 text-sm text-slate-600">Mode Existing tetap aktif. Skipped dipisahkan agar tidak ikut Call Next sampai diaktifkan kembali.</p><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white">Mode Existing</span><a href="/vaccination/queue/onsite" className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-700 hover:bg-violet-100">Mode Onsite Rolling QR</a></div></div><a href="/vaccination" className="rounded-xl border px-4 py-2 text-sm font-bold hover:bg-slate-50">☰ Menu Vaksinasi</a></div>
        {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
        {message ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</div> : null}
        <section className="mt-6 rounded-2xl border bg-slate-50 p-5">
          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-center">
            <div><select disabled={contextLocked} className="w-full rounded-xl border px-3 py-2 disabled:bg-slate-100" value={sessionId} onChange={(e) => setSessionId(e.target.value)}><option value="">Pilih session</option>{sessions.map((s) => <option key={s.id} value={s.id}>{sessionLabel(s)}</option>)}</select>{contextLocked ? <div className="mt-1 text-xs font-bold text-amber-700">🔒 Session terkunci dari Registrasi</div> : null}</div>
            <button onClick={() => action("call-next")} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700">Panggil Nomor Berikutnya</button>
            {session?.public_queue_token ? <a target="_blank" className="rounded-xl border bg-white px-5 py-3 text-sm font-bold text-blue-700" href={`/vaccination/public/queue/${session.public_queue_token}`}>Public Queue</a> : null}
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-5">
            <div className="rounded-2xl border bg-white p-5"><div className="text-sm text-slate-500">Nomor Dipanggil</div><div className="mt-2 text-5xl font-black text-blue-700">{session?.current_queue_number || "-"}</div></div>
            <div className="rounded-2xl border bg-white p-5"><div className="text-sm text-slate-500">Menunggu</div><div className="mt-2 text-5xl font-black text-red-700">{legacyStats.waiting}</div></div>
            <div className="rounded-2xl border bg-white p-5"><div className="text-sm text-slate-500">Dalam Tindakan</div><div className="mt-2 text-5xl font-black text-blue-700">{legacyStats.doctor}</div></div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><div className="text-sm text-amber-700">Skipped</div><div className="mt-2 text-5xl font-black text-amber-700">{legacyStats.skipped}</div></div>
            <div className="rounded-2xl border bg-white p-5"><div className="text-sm text-slate-500">Selesai</div><div className="mt-2 text-5xl font-black text-emerald-700">{legacyStats.done}</div></div>
          </div>
        </section>
        <section className="mt-6 overflow-hidden rounded-2xl border">
          <table className="min-w-full text-sm"><thead className="bg-slate-100 text-xs uppercase text-slate-600"><tr><th className="p-3 text-left">No</th><th className="p-3 text-left">Nama</th><th className="p-3 text-left">Status</th><th className="p-3 text-left">Note</th><th className="p-3 text-left">Aksi</th></tr></thead>
            <tbody className="divide-y">{legacyActive.map((r) => { const s=String(r.queue_status || "").toUpperCase(); return <tr key={r.id}><td className="p-3 text-xl font-black">{r.queue_number || "-"}</td><td className="p-3 font-bold">{r.participant_name}</td><td className="p-3"><span className={`rounded-full px-3 py-1 text-xs font-black ${colors[s] || "bg-slate-100 text-slate-700"}`}>{label(s)}</span></td><td className="p-3 text-xs font-semibold text-orange-700">{queueNote(r)}</td><td className="p-3"><div className="flex flex-wrap gap-2"><button onClick={() => action("recall", r.id)} className="rounded-lg border px-3 py-1 text-xs font-bold">Call</button><button onClick={() => action("start", r.id)} className="rounded-lg border px-3 py-1 text-xs font-bold">Start</button><button onClick={() => action("skip", r.id)} className="rounded-lg border px-3 py-1 text-xs font-bold">Skip</button></div></td></tr>; })}</tbody>
          </table>
        </section>
        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-black text-amber-900">Skipped</h2><p className="text-xs font-semibold text-amber-700">Nomor yang di-skip tidak ikut Panggil Nomor Berikutnya. Jika peserta datang, klik Aktifkan Kembali. Nomor lama tetap dipakai dan akan kembali ke waiting.</p></div><div className="rounded-full bg-amber-200 px-3 py-1 text-sm font-black text-amber-900">{legacySkipped.length}</div></div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{legacySkipped.map((r) => (<div key={r.id} className="rounded-xl border border-amber-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><div className="text-2xl font-black text-amber-800">{r.queue_number || "-"}</div><div className="mt-1 font-bold text-slate-900">{r.participant_name}</div></div><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">SKIPPED</span></div><div className="mt-2 text-xs font-semibold text-slate-500">{queueNote(r)}</div><button onClick={() => action("waiting", r.id)} className="mt-4 w-full rounded-xl bg-amber-600 px-4 py-2 text-sm font-black text-white hover:bg-amber-700">Aktifkan Kembali</button></div>))}{!legacySkipped.length ? <div className="text-sm font-semibold text-amber-700">Belum ada antrean skipped.</div> : null}</div>
        </section>
      </div></main>
    );
  }

  const aRows = rowsForTrack("A");
  const bRows = rowsForTrack("B");

  function renderTrackColumn(track: "A" | "B", rows: any[]) {
    const statusKey = track === "A" ? "queue_status" : "bazar_queue_status";
    const numberKey = track === "A" ? "queue_number" : "bazar_queue_number";
    const stats = trackStats(rows, track);
    const skipped = rows.filter((row) => trackStatus(row, track) === "SKIPPED");
    const active = rows.filter((row) => trackStatus(row, track) !== "SKIPPED");
    const current = rows.find((row) => ["CALLED", "IN_PROGRESS"].includes(trackStatus(row, track)));
    const title = track === "A" ? "A · Healthday" : "B · Bazar";
    const accent = track === "A" ? "text-blue-700" : "text-violet-700";
    const callClass = track === "A" ? "bg-blue-600 hover:bg-blue-700" : "bg-violet-600 hover:bg-violet-700";

    return (
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><div className={`text-lg font-black ${accent}`}>{title}</div><div className="text-xs font-semibold text-slate-500">Antrean berjalan independen.</div></div>
          <button onClick={() => action("call-next", undefined, track)} className={`rounded-xl px-4 py-2 text-sm font-black text-white ${callClass}`}>Panggil Berikutnya {track}</button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border bg-slate-50 p-3"><div className="text-xs text-slate-500">Dipanggil</div><div className={`mt-1 text-3xl font-black ${accent}`}>{current?.[numberKey] || "-"}</div><div className="mt-1 truncate text-xs font-bold text-slate-700">{current?.participant_name || "-"}</div></div>
          <div className="rounded-xl border bg-slate-50 p-3"><div className="text-xs text-slate-500">Menunggu</div><div className="mt-1 text-3xl font-black text-red-700">{stats.waiting}</div></div>
          <div className="rounded-xl border bg-slate-50 p-3"><div className="text-xs text-slate-500">Proses</div><div className="mt-1 text-3xl font-black text-blue-700">{stats.active}</div></div>
          <div className="rounded-xl border bg-slate-50 p-3"><div className="text-xs text-slate-500">Selesai</div><div className="mt-1 text-3xl font-black text-emerald-700">{stats.done}</div></div>
        </div>
        <div className="mt-4 overflow-auto rounded-xl border">
          <table className="min-w-full text-sm"><thead className="bg-slate-100 text-xs uppercase text-slate-600"><tr><th className="p-2 text-left">No</th><th className="p-2 text-left">Nama</th><th className="p-2 text-left">Status</th><th className="p-2 text-left">Aksi</th></tr></thead>
            <tbody className="divide-y">{active.map((row) => { const s = String(row?.[statusKey] || "REGISTERED").toUpperCase(); return <tr key={`${track}-${row.id}`}><td className={`p-2 text-lg font-black ${accent}`}>{row?.[numberKey] || "-"}</td><td className="p-2"><div className="font-bold">{row.participant_name}</div><div className="mt-1 max-w-[260px] truncate text-[11px] font-semibold text-slate-500">{queueNote(row)}</div></td><td className="p-2"><span className={`rounded-full px-2 py-1 text-[11px] font-black ${colors[s] || "bg-slate-100 text-slate-700"}`}>{track === "B" && s === "IN_PROGRESS" ? "Proses Bazar" : label(s)}</span></td><td className="p-2"><div className="flex flex-wrap gap-1"><button onClick={() => action("recall", row.id, track)} className="rounded-lg border px-2 py-1 text-[11px] font-bold">Call</button>{track === "B" || doctorEnabled ? <button onClick={() => action("start", row.id, track)} className="rounded-lg border px-2 py-1 text-[11px] font-bold">Start</button> : null}{track === "B" ? <button onClick={() => action("finish", row.id, track)} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700">Selesai</button> : null}<button onClick={() => action("skip", row.id, track)} className="rounded-lg border px-2 py-1 text-[11px] font-bold">Skip</button></div></td></tr>; })}</tbody>
          </table>
        </div>
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center justify-between"><div className="text-sm font-black text-amber-900">Skipped {track}</div><div className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-black text-amber-900">{skipped.length}</div></div>
          <div className="mt-2 space-y-2">{skipped.map((row) => <div key={`skip-${track}-${row.id}`} className="flex items-center justify-between gap-2 rounded-lg bg-white p-2"><div><div className="font-black text-amber-800">{row?.[numberKey] || "-"} · {row.participant_name}</div></div><button onClick={() => action("waiting", row.id, track)} className="rounded-lg bg-amber-600 px-2 py-1 text-[11px] font-black text-white">Aktifkan</button></div>)}{!skipped.length ? <div className="text-xs font-semibold text-amber-700">Belum ada antrean skipped.</div> : null}</div>
        </div>
      </section>
    );
  }

  return (
    <main className="p-6"><div className="rounded-2xl border bg-slate-50 p-6 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><h1 className="text-2xl font-bold">Antrian Healthday + Bazar</h1><p className="mt-2 text-sm text-slate-600">A untuk Healthday, B untuk Bazar. Peserta Kombinasi berada di kedua antrean dengan status yang independen.</p><div className="mt-3"><span className="rounded-xl bg-violet-700 px-3 py-2 text-xs font-black text-white">Dual Queue A/B</span></div></div><a href="/vaccination" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold hover:bg-slate-50">☰ Menu Vaksinasi</a></div>
      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
      {message ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</div> : null}
      <section className="mt-6 rounded-2xl border bg-white p-4"><div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center"><div><select disabled={contextLocked} className="w-full rounded-xl border px-3 py-2 disabled:bg-slate-100" value={sessionId} onChange={(e) => setSessionId(e.target.value)}><option value="">Pilih session</option>{sessions.map((s) => <option key={s.id} value={s.id}>{sessionLabel(s)}</option>)}</select>{contextLocked ? <div className="mt-1 text-xs font-bold text-amber-700">🔒 Session terkunci dari Registrasi</div> : null}</div>{session?.public_queue_token ? <a target="_blank" className="rounded-xl border bg-white px-5 py-3 text-sm font-bold text-blue-700" href={`/vaccination/public/queue/${session.public_queue_token}`}>Public Queue A/B</a> : null}</div></section>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">{renderTrackColumn("A", aRows)}{renderTrackColumn("B", bRows)}</div>
    </div></main>
  );
}
