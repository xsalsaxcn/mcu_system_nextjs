"use client";

import { useEffect, useState } from "react";

export default function VaccinationRegisterPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [vaccines, setVaccines] = useState<any[]>([]);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [message, setMessage] = useState("Registrasi peserta vaksin dan generate nomor antrian.");
  const [error, setError] = useState("");
  const [form, setForm] = useState({ sessionId: "", vaccineId: "", participantName: "", employeeId: "", nik: "", email: "", phone: "", companyName: "", department: "" });

  async function loadBase() {
    const s = await fetch("/api/vaccination/sessions", { cache: "no-store" }).then((r) => r.json());
    const m = await fetch("/api/vaccination/master", { cache: "no-store" }).then((r) => r.json());
    if (s.ok) { setSessions(s.sessions || []); if (!form.sessionId && s.sessions?.[0]?.id) setForm((f) => ({ ...f, sessionId: String(s.sessions[0].id) })); }
    if (m.ok) setVaccines((m.vaccines || []).filter((v: any) => v.active));
  }

  async function loadRegistrations(sessionId = form.sessionId) {
    if (!sessionId) return;
    const json = await fetch(`/api/vaccination/register?session_id=${sessionId}`, { cache: "no-store" }).then((r) => r.json());
    if (json.ok) setRegistrations(json.registrations || []);
  }

  async function submit() {
    setError("");
    const json = await fetch("/api/vaccination/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }).then((r) => r.json());
    if (!json.ok) { setError(json.message || "Registrasi gagal."); return; }
    setMessage(json.message); setForm((f) => ({ ...f, participantName: "", employeeId: "", nik: "", email: "", phone: "", department: "" })); loadRegistrations(form.sessionId);
  }

  useEffect(() => { loadBase(); }, []);
  useEffect(() => { loadRegistrations(form.sessionId); }, [form.sessionId]);

  return (
    <main className="p-6"><div className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:justify-between"><div><h1 className="text-2xl font-bold">Registrasi Vaksin</h1><p className="mt-2 text-sm text-slate-600">Mirip registrasi MCU, tapi output utamanya nomor antrian vaksin.</p></div><a href="/vaccination" className="rounded-xl border px-4 py-2 text-sm font-bold hover:bg-slate-50">☰ Menu Vaksinasi</a></div>
      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
      {message ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</div> : null}
      <section className="mt-6 rounded-2xl border bg-slate-50 p-5"><h2 className="font-bold">Form Registrasi</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <select className="rounded-xl border px-3 py-2" value={form.sessionId} onChange={(e) => setForm({ ...form, sessionId: e.target.value })}><option value="">Pilih session</option>{sessions.map((s) => <option key={s.id} value={s.id}>{s.session_name} · {s.company_name || "-"}</option>)}</select>
          <select className="rounded-xl border px-3 py-2" value={form.vaccineId} onChange={(e) => setForm({ ...form, vaccineId: e.target.value })}><option value="">Vaksin dipilih saat medis</option>{vaccines.map((v) => <option key={v.id} value={v.id}>{v.name}{v.brand ? ` · ${v.brand}` : ""}</option>)}</select>
          <input className="rounded-xl border px-3 py-2" placeholder="Nama peserta *" value={form.participantName} onChange={(e) => setForm({ ...form, participantName: e.target.value })} />
          <input className="rounded-xl border px-3 py-2" placeholder="Employee ID" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} />
          <input className="rounded-xl border px-3 py-2" placeholder="NIK" value={form.nik} onChange={(e) => setForm({ ...form, nik: e.target.value })} />
          <input className="rounded-xl border px-3 py-2" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="rounded-xl border px-3 py-2" placeholder="Nomor HP" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input className="rounded-xl border px-3 py-2" placeholder="Perusahaan" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
          <input className="rounded-xl border px-3 py-2" placeholder="Departemen" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
        </div>
        <button onClick={submit} className="mt-4 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700">Registrasi + Ambil Nomor</button>
      </section>
      <section className="mt-6 overflow-hidden rounded-2xl border"><div className="border-b bg-slate-50 p-4 font-bold">Registrasi Session Ini</div>
        <table className="min-w-full text-sm"><thead className="bg-slate-100 text-xs uppercase text-slate-600"><tr><th className="p-3 text-left">Antrian</th><th className="p-3 text-left">Nama</th><th className="p-3 text-left">Vaksin</th><th className="p-3 text-left">Status</th></tr></thead>
          <tbody className="divide-y">{registrations.map((r) => <tr key={r.id}><td className="p-3 text-xl font-black">{r.queue_number}</td><td className="p-3">{r.participant_name}</td><td className="p-3">{r.vaccine?.name || "Dipilih saat medis"}</td><td className="p-3">{r.queue_status}</td></tr>)}</tbody>
        </table>
      </section>
    </div></main>
  );
}
