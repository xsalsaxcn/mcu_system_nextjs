"use client";

import { useEffect, useMemo, useState } from "react";

export default function VaccinationQueuePage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [session, setSession] = useState<any>(null);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [message, setMessage] = useState("Pilih session untuk menjalankan antrian.");
  const [error, setError] = useState("");

  async function loadSessions() {
    const json = await fetch("/api/vaccination/sessions", { cache: "no-store" }).then((r) => r.json());
    if (json.ok) { setSessions(json.sessions || []); if (!sessionId && json.sessions?.[0]?.id) setSessionId(String(json.sessions[0].id)); }
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
  const waitingCount = useMemo(() => registrations.filter((r) => ["WAITING", "REGISTERED"].includes(r.queue_status)).length, [registrations]);

  return (
    <main className="p-6"><div className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:justify-between"><div><h1 className="text-2xl font-bold">Antrian Vaksin</h1><p className="mt-2 text-sm text-slate-600">Operator memanggil nomor antrian berjalan. Pasien bisa melihat dari QR public queue.</p></div><a href="/vaccination" className="rounded-xl border px-4 py-2 text-sm font-bold hover:bg-slate-50">☰ Menu Vaksinasi</a></div>
      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
      {message ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</div> : null}
      <section className="mt-6 rounded-2xl border bg-slate-50 p-5">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-center">
          <select className="rounded-xl border px-3 py-2" value={sessionId} onChange={(e) => setSessionId(e.target.value)}><option value="">Pilih session</option>{sessions.map((s) => <option key={s.id} value={s.id}>{s.session_name} · {s.company_name || "-"}</option>)}</select>
          <button onClick={() => action("call-next")} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700">Panggil Nomor Berikutnya</button>
          {session?.public_queue_token ? <a target="_blank" className="rounded-xl border bg-white px-5 py-3 text-sm font-bold text-blue-700" href={`/vaccination/public/queue/${session.public_queue_token}`}>Public Queue</a> : null}
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border bg-white p-5"><div className="text-sm text-slate-500">Nomor Dipanggil</div><div className="mt-2 text-5xl font-black text-blue-700">{session?.current_queue_number || "-"}</div></div>
          <div className="rounded-2xl border bg-white p-5"><div className="text-sm text-slate-500">Menunggu</div><div className="mt-2 text-5xl font-black">{waitingCount}</div></div>
          <div className="rounded-2xl border bg-white p-5"><div className="text-sm text-slate-500">Total</div><div className="mt-2 text-5xl font-black">{registrations.length}</div></div>
        </div>
      </section>
      <section className="mt-6 overflow-hidden rounded-2xl border">
        <table className="min-w-full text-sm"><thead className="bg-slate-100 text-xs uppercase text-slate-600"><tr><th className="p-3 text-left">No</th><th className="p-3 text-left">Nama</th><th className="p-3 text-left">Status</th><th className="p-3 text-left">Aksi</th></tr></thead>
          <tbody className="divide-y">{registrations.map((r) => <tr key={r.id}><td className="p-3 text-xl font-black">{r.queue_number}</td><td className="p-3">{r.participant_name}</td><td className="p-3">{r.queue_status}</td><td className="p-3"><div className="flex flex-wrap gap-2"><button onClick={() => action("recall", r.id)} className="rounded-lg border px-3 py-1 text-xs font-bold">Call</button><button onClick={() => action("start", r.id)} className="rounded-lg border px-3 py-1 text-xs font-bold">Start</button><button onClick={() => action("skip", r.id)} className="rounded-lg border px-3 py-1 text-xs font-bold">Skip</button></div></td></tr>)}</tbody>
        </table>
      </section>
    </div></main>
  );
}
