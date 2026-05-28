"use client";

import { useEffect, useState } from "react";

export default function VaccinationSessionPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [form, setForm] = useState({ sessionName: "", companyName: "", location: "", sessionDate: "" });
  const [message, setMessage] = useState("Buat session/event vaksinasi perusahaan.");
  const [error, setError] = useState("");

  async function loadSessions() {
    const json = await fetch("/api/vaccination/sessions", { cache: "no-store" }).then((r) => r.json());
    if (!json.ok) { setError(json.message || "Gagal mengambil session."); return; }
    setSessions(json.sessions || []);
  }

  async function submit() {
    setError("");
    const json = await fetch("/api/vaccination/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }).then((r) => r.json());
    if (!json.ok) { setError(json.message || "Gagal membuat session."); return; }
    setMessage(json.message); setForm({ sessionName: "", companyName: "", location: "", sessionDate: "" }); loadSessions();
  }

  useEffect(() => { loadSessions(); }, []);

  return (
    <main className="p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:justify-between"><div><h1 className="text-2xl font-bold">Session Vaksinasi</h1><p className="mt-2 text-sm text-slate-600">Session memiliki token publik untuk halaman antrian QR.</p></div><a href="/vaccination" className="rounded-xl border px-4 py-2 text-sm font-bold hover:bg-slate-50">☰ Menu Vaksinasi</a></div>
        {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
        {message ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</div> : null}
        <section className="mt-6 rounded-2xl border bg-slate-50 p-5">
          <h2 className="font-bold">Tambah Session</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <input className="rounded-xl border px-3 py-2" placeholder="Nama session" value={form.sessionName} onChange={(e) => setForm({ ...form, sessionName: e.target.value })} />
            <input className="rounded-xl border px-3 py-2" placeholder="Nama perusahaan" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
            <input className="rounded-xl border px-3 py-2" placeholder="Lokasi" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            <input type="date" className="rounded-xl border px-3 py-2" value={form.sessionDate} onChange={(e) => setForm({ ...form, sessionDate: e.target.value })} />
          </div>
          <button onClick={submit} className="mt-4 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700">Simpan Session</button>
        </section>
        <section className="mt-6 overflow-hidden rounded-2xl border">
          <div className="border-b bg-slate-50 p-4 font-bold">Daftar Session</div>
          <table className="min-w-full text-sm"><thead className="bg-slate-100 text-xs uppercase text-slate-600"><tr><th className="p-3 text-left">Session</th><th className="p-3 text-left">Perusahaan</th><th className="p-3 text-left">Lokasi</th><th className="p-3 text-left">Tanggal</th><th className="p-3 text-left">Antrian Publik</th></tr></thead>
            <tbody className="divide-y">{sessions.map((s) => <tr key={s.id}><td className="p-3 font-bold">{s.session_name}</td><td className="p-3">{s.company_name || "-"}</td><td className="p-3">{s.location || "-"}</td><td className="p-3">{s.session_date || "-"}</td><td className="p-3"><a className="font-bold text-blue-600" href={`/vaccination/public/queue/${s.public_queue_token}`} target="_blank">Buka Public Queue</a></td></tr>)}</tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
