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
  if (["CALLED", "IN_PROGRESS"].includes(s)) return "Dokter";
  if (["ADMINISTERED", "DONE"].includes(s)) return "Selesai";
  return status || "-";
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
      setSessions(loadedSessions);
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
    setSession(json.session); setRegistrations(json.registrations || []);
  }
  async function action(actionName: string, registrationId?: number) {
    setError("");
    const json = await fetch("/api/vaccination/queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: actionName, sessionId: Number(sessionId), registrationId }) }).then((r) => r.json());
    if (!json.ok) { setError(json.message || "Action gagal."); return; }
    setMessage(json.message); loadQueue();
  }
  useEffect(() => { loadSessions(); }, []);
  useEffect(() => { loadQueue(sessionId); const t = setInterval(() => loadQueue(sessionId), 5000); return () => clearInterval(t); }, [sessionId]);

  const stats = useMemo(() => {
    const r = { waiting: 0, doctor: 0, done: 0 };
    registrations.forEach((x) => {
      const s = String(x.queue_status || "").toUpperCase();
      if (["WAITING", "WAITING_WITH_NOTE", "REGISTERED"].includes(s)) r.waiting += 1;
      if (["CALLED", "IN_PROGRESS"].includes(s)) r.doctor += 1;
      if (["ADMINISTERED", "DONE"].includes(s)) r.done += 1;
    });
    return r;
  }, [registrations]);

  return (
    <main className="p-6"><div className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:justify-between"><div><h1 className="text-2xl font-bold">Antrian Vaksin</h1><p className="mt-2 text-sm text-slate-600">Kode warna: Waiting merah, Dokter biru, Selesai hijau, Belum Datang hitam.</p></div><a href="/vaccination" className="rounded-xl border px-4 py-2 text-sm font-bold hover:bg-slate-50">☰ Menu Vaksinasi</a></div>
      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
      {message ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</div> : null}
      <section className="mt-6 rounded-2xl border bg-slate-50 p-5">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-center">
          <div>
            <select disabled={contextLocked} className="w-full rounded-xl border px-3 py-2 disabled:bg-slate-100" value={sessionId} onChange={(e) => setSessionId(e.target.value)}><option value="">Pilih session</option>{sessions.map((s) => <option key={s.id} value={s.id}>{sessionLabel(s)}</option>)}</select>
            {contextLocked ? <div className="mt-1 text-xs font-bold text-amber-700">🔒 Session terkunci dari Registrasi</div> : null}
          </div>
          <button onClick={() => action("call-next")} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700">Panggil Nomor Berikutnya</button>
          {session?.public_queue_token ? <a target="_blank" className="rounded-xl border bg-white px-5 py-3 text-sm font-bold text-blue-700" href={`/vaccination/public/queue/${session.public_queue_token}`}>Public Queue</a> : null}
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border bg-white p-5"><div className="text-sm text-slate-500">Nomor Dipanggil</div><div className="mt-2 text-5xl font-black text-blue-700">{session?.current_queue_number || "-"}</div></div>
          <div className="rounded-2xl border bg-white p-5"><div className="text-sm text-slate-500">Menunggu</div><div className="mt-2 text-5xl font-black text-red-700">{stats.waiting}</div></div>
          <div className="rounded-2xl border bg-white p-5"><div className="text-sm text-slate-500">Dalam Tindakan</div><div className="mt-2 text-5xl font-black text-blue-700">{stats.doctor}</div></div>
          <div className="rounded-2xl border bg-white p-5"><div className="text-sm text-slate-500">Selesai</div><div className="mt-2 text-5xl font-black text-emerald-700">{stats.done}</div></div>
        </div>
      </section>
      <section className="mt-6 overflow-hidden rounded-2xl border">
        <table className="min-w-full text-sm"><thead className="bg-slate-100 text-xs uppercase text-slate-600"><tr><th className="p-3 text-left">No</th><th className="p-3 text-left">Nama</th><th className="p-3 text-left">Status</th><th className="p-3 text-left">Note</th><th className="p-3 text-left">Aksi</th></tr></thead>
          <tbody className="divide-y">{registrations.map((r) => { const s=String(r.queue_status || "").toUpperCase(); return <tr key={r.id}><td className="p-3 text-xl font-black">{r.queue_number || "-"}</td><td className="p-3 font-bold">{r.participant_name}</td><td className="p-3"><span className={`rounded-full px-3 py-1 text-xs font-black ${colors[s] || "bg-slate-100 text-slate-700"}`}>{label(s)}</span></td><td className="p-3 text-xs font-semibold text-orange-700">{queueNote(r)}</td><td className="p-3"><div className="flex flex-wrap gap-2"><button onClick={() => action("recall", r.id)} className="rounded-lg border px-3 py-1 text-xs font-bold">Call</button><button onClick={() => action("start", r.id)} className="rounded-lg border px-3 py-1 text-xs font-bold">Start</button><button onClick={() => action("skip", r.id)} className="rounded-lg border px-3 py-1 text-xs font-bold">Skip</button></div></td></tr>; })}</tbody>
        </table>
      </section>
    </div></main>
  );
}
