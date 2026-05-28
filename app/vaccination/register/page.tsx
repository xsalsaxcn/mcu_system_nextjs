"use client";

import { useEffect, useMemo, useState } from "react";

export default function VaccinationRegisterPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [vaccines, setVaccines] = useState<any[]>([]);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [message, setMessage] = useState("Pilih session/database, lalu import peserta corporate atau registrasi manual.");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [form, setForm] = useState({ sessionId: "", sourceId: "", vaccineId: "", participantName: "", employeeId: "", nik: "", email: "", phone: "", companyName: "", department: "" });
  const selectedSession = sessions.find((s) => String(s.id) === String(form.sessionId));
  const selectedSourceId = useMemo(() => form.sourceId || selectedSession?.source_id || "", [form.sourceId, selectedSession?.source_id]);

  async function loadBase() {
    const [sessionJson, sourceJson, masterJson] = await Promise.all([
      fetch("/api/vaccination/sessions", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/sources?program=corporate", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/vaccination/master", { cache: "no-store" }).then((r) => r.json()),
    ]);
    if (sessionJson.ok) { setSessions(sessionJson.sessions || []); if (!form.sessionId && sessionJson.sessions?.[0]?.id) { const first = sessionJson.sessions[0]; setForm((p) => ({ ...p, sessionId: String(first.id), sourceId: first.source_id ? String(first.source_id) : "", vaccineId: first.default_vaccine_id ? String(first.default_vaccine_id) : "", companyName: first.company_name || "" })); } }
    if (sourceJson.ok) setSources(sourceJson.sources || []);
    if (masterJson.ok) setVaccines((masterJson.vaccines || []).filter((v: any) => v.active !== false));
  }
  async function loadRegistrations(sessionId = form.sessionId, sourceId = selectedSourceId) {
    if (!sessionId) return;
    const params = new URLSearchParams(); params.set("session_id", sessionId); if (sourceId) params.set("source_id", String(sourceId));
    const json = await fetch(`/api/vaccination/register?${params.toString()}`, { cache: "no-store" }).then((r) => r.json());
    if (json.ok) setRegistrations(json.registrations || []);
  }
  async function importCorporate() {
    if (!form.sessionId) { setError("Pilih session terlebih dahulu."); return; }
    if (!selectedSourceId) { setError("Session belum terhubung ke database corporate. Pilih database corporate dulu."); return; }
    setImporting(true); setError(""); setMessage("Mengimport peserta dari database corporate...");
    try {
      const res = await fetch("/api/vaccination/import-corporate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: Number(form.sessionId), sourceId: Number(selectedSourceId) }) });
      const json = await res.json();
      if (!res.ok || !json.ok) { setError(json.message || "Import corporate gagal."); setMessage("Import corporate gagal."); return; }
      setMessage(json.message || "Import corporate berhasil."); await loadRegistrations(form.sessionId, String(selectedSourceId));
    } catch (err: any) { setError(err?.message || "Import corporate gagal."); setMessage("Import corporate gagal."); } finally { setImporting(false); }
  }
  async function submit() {
    setError("");
    const res = await fetch("/api/vaccination/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, sourceId: selectedSourceId }) });
    const json = await res.json();
    if (!res.ok || !json.ok) { setError(json.message || "Registrasi gagal."); return; }
    setMessage(json.message); setForm((p) => ({ ...p, participantName: "", employeeId: "", nik: "", email: "", phone: "", department: "" })); loadRegistrations(form.sessionId, selectedSourceId);
  }
  useEffect(() => { loadBase(); }, []);
  useEffect(() => { if (!selectedSession) return; setForm((p) => ({ ...p, sourceId: selectedSession.source_id ? String(selectedSession.source_id) : p.sourceId, vaccineId: selectedSession.default_vaccine_id ? String(selectedSession.default_vaccine_id) : p.vaccineId, companyName: selectedSession.company_name || p.companyName })); }, [selectedSession?.id]);
  useEffect(() => { loadRegistrations(form.sessionId, selectedSourceId); }, [form.sessionId, selectedSourceId]);

  return <main className="p-6"><div className="rounded-2xl border bg-white p-6 shadow-sm"><div className="flex flex-col gap-3 md:flex-row md:justify-between"><div><h1 className="text-2xl font-bold">Registrasi Vaksin</h1><p className="mt-2 text-sm text-slate-600">Pilih session dan database corporate. Peserta bisa diimport massal dan otomatis mendapat nomor antrian.</p></div><a href="/vaccination" className="rounded-xl border px-4 py-2 text-sm font-bold hover:bg-slate-50">☰ Menu Vaksinasi</a></div>{error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}{message ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</div> : null}<section className="mt-6 rounded-2xl border bg-slate-50 p-5"><h2 className="font-bold">1. Pilih Session & Database</h2><div className="mt-4 grid gap-3 md:grid-cols-3"><select className="rounded-xl border px-3 py-2.5" value={form.sessionId} onChange={(e) => setForm({ ...form, sessionId: e.target.value })}><option value="">Pilih session</option>{sessions.map((s) => <option key={s.id} value={s.id}>{s.session_name} · {s.company_name || "-"}</option>)}</select><select className="rounded-xl border px-3 py-2.5" value={selectedSourceId} onChange={(e) => setForm({ ...form, sourceId: e.target.value })}><option value="">Pilih database corporate</option>{sources.map((s) => <option key={s.id} value={s.id}>{s.name}{s.institution_name ? ` · ${s.institution_name}` : ""}</option>)}</select><select className="rounded-xl border px-3 py-2.5" value={form.vaccineId} onChange={(e) => setForm({ ...form, vaccineId: e.target.value })}><option value="">Vaksin default dari session / pilih manual</option>{vaccines.map((v) => <option key={v.id} value={v.id}>{v.name}{v.brand ? ` · ${v.brand}` : ""}</option>)}</select></div><div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={importCorporate} disabled={importing || !form.sessionId || !selectedSourceId} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60">{importing ? "Importing..." : "Import Peserta dari Database Corporate"}</button><a href="/vaccination/session" className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">Setup Session</a></div></section><section className="mt-6 rounded-2xl border bg-slate-50 p-5"><h2 className="font-bold">2. Registrasi Manual Opsional</h2><div className="mt-4 grid gap-3 md:grid-cols-3"><input className="rounded-xl border px-3 py-2.5" placeholder="Nama peserta *" value={form.participantName} onChange={(e) => setForm({ ...form, participantName: e.target.value })} /><input className="rounded-xl border px-3 py-2.5" placeholder="Employee ID" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} /><input className="rounded-xl border px-3 py-2.5" placeholder="NIK" value={form.nik} onChange={(e) => setForm({ ...form, nik: e.target.value })} /><input className="rounded-xl border px-3 py-2.5" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /><input className="rounded-xl border px-3 py-2.5" placeholder="Nomor HP" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /><input className="rounded-xl border px-3 py-2.5" placeholder="Perusahaan" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} /><input className="rounded-xl border px-3 py-2.5" placeholder="Departemen" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></div><button onClick={submit} className="mt-4 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700">Registrasi Manual + Ambil Nomor</button></section><section className="mt-6 overflow-hidden rounded-2xl border"><div className="border-b bg-slate-50 p-4 font-bold">Registrasi Session Ini · {registrations.length} peserta</div><div className="max-h-[520px] overflow-auto"><table className="min-w-full text-sm"><thead className="sticky top-0 bg-slate-100 text-xs uppercase text-slate-600"><tr><th className="p-3 text-left">Antrian</th><th className="p-3 text-left">Nama</th><th className="p-3 text-left">MCU ID</th><th className="p-3 text-left">Vaksin</th><th className="p-3 text-left">Status</th></tr></thead><tbody className="divide-y">{registrations.map((r) => <tr key={r.id}><td className="p-3 text-xl font-black">{r.queue_number}</td><td className="p-3">{r.participant_name}</td><td className="p-3">{r.mcu_id || r.employee_id || "-"}</td><td className="p-3">{r.vaccine?.name || "Dipilih saat medis"}</td><td className="p-3">{r.queue_status}</td></tr>)}</tbody></table></div></section></div></main>;
}
