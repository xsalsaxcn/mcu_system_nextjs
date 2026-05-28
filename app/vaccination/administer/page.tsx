"use client";

import { useEffect, useMemo, useState } from "react";

export default function VaccinationAdministerPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [vaccines, setVaccines] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);
  const [message, setMessage] = useState("Pilih antrian, vaksin, lot number, lalu Done + Print Sticker.");
  const [error, setError] = useState("");
  const [form, setForm] = useState({ registrationId: "", vaccineId: "", lotId: "", doseNumber: 1, administeredAt: "", notes: "" });

  async function loadSessions() {
    const json = await fetch("/api/vaccination/sessions", { cache: "no-store" }).then((r) => r.json());
    if (json.ok) { setSessions(json.sessions || []); if (!sessionId && json.sessions?.[0]?.id) setSessionId(String(json.sessions[0].id)); }
  }
  async function loadData(id = sessionId) {
    const url = id ? `/api/vaccination/administer?session_id=${id}` : "/api/vaccination/administer";
    const json = await fetch(url, { cache: "no-store" }).then((r) => r.json());
    if (!json.ok) { setError(json.message || "Gagal mengambil data."); return; }
    setRegistrations(json.registrations || []); setVaccines(json.vaccines || []); setLots(json.lots || []);
  }
  async function donePrint() {
    setError("");
    const json = await fetch("/api/vaccination/administer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }).then((r) => r.json());
    if (!json.ok) { setError(json.message || "Done gagal."); return; }
    setMessage(json.message); setForm((f) => ({ ...f, registrationId: "", notes: "" })); loadData(); window.open(json.stickerUrl, "_blank");
  }
  useEffect(() => { loadSessions(); }, []);
  useEffect(() => { loadData(sessionId); }, [sessionId]);
  const filteredLots = useMemo(() => lots.filter((lot) => !form.vaccineId || String(lot.vaccine_id) === String(form.vaccineId)), [lots, form.vaccineId]);
  const selectedRegistration = registrations.find((r) => String(r.id) === String(form.registrationId));

  return (
    <main className="p-6"><div className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:justify-between"><div><h1 className="text-2xl font-bold">Administered / Medis</h1><p className="mt-2 text-sm text-slate-600">Medis cukup pilih vaksin dan lot number. Sistem hitung next dose dan buka sticker print.</p></div><a href="/vaccination" className="rounded-xl border px-4 py-2 text-sm font-bold hover:bg-slate-50">☰ Menu Vaksinasi</a></div>
      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
      {message ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</div> : null}
      <section className="mt-6 rounded-2xl border bg-slate-50 p-5"><h2 className="font-bold">Input Pemberian Vaksin</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <select className="rounded-xl border px-3 py-2" value={sessionId} onChange={(e) => setSessionId(e.target.value)}><option value="">Pilih session</option>{sessions.map((s) => <option key={s.id} value={s.id}>{s.session_name} · {s.company_name || "-"}</option>)}</select>
          <select className="rounded-xl border px-3 py-2" value={form.registrationId} onChange={(e) => setForm({ ...form, registrationId: e.target.value })}><option value="">Pilih peserta / nomor antrian</option>{registrations.map((r) => <option key={r.id} value={r.id}>{r.queue_number} · {r.participant_name} · {r.queue_status}</option>)}</select>
          <select className="rounded-xl border px-3 py-2" value={form.vaccineId} onChange={(e) => setForm({ ...form, vaccineId: e.target.value, lotId: "" })}><option value="">Pilih vaksin</option>{vaccines.map((v) => <option key={v.id} value={v.id}>{v.name}{v.brand ? ` · ${v.brand}` : ""}</option>)}</select>
          <select className="rounded-xl border px-3 py-2" value={form.lotId} onChange={(e) => setForm({ ...form, lotId: e.target.value })}><option value="">Pilih lot number</option>{filteredLots.map((lot) => { const stock = Number(lot.stock_initial || 0) - Number(lot.stock_used || 0); return <option key={lot.id} value={lot.id}>{lot.lot_number} · stok {stock} · exp {lot.expiry_date || "-"}</option>; })}</select>
          <input type="number" className="rounded-xl border px-3 py-2" value={form.doseNumber} onChange={(e) => setForm({ ...form, doseNumber: Number(e.target.value || 1) })} placeholder="Dose number" />
          <input type="datetime-local" className="rounded-xl border px-3 py-2" value={form.administeredAt} onChange={(e) => setForm({ ...form, administeredAt: e.target.value })} />
        </div>
        {selectedRegistration ? <div className="mt-4 rounded-xl border bg-white p-4 text-sm"><b>{selectedRegistration.queue_number}</b> · {selectedRegistration.participant_name} · {selectedRegistration.company_name || "-"} · {selectedRegistration.department || "-"}</div> : null}
        <textarea className="mt-3 w-full rounded-xl border px-3 py-2" placeholder="Catatan opsional" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        <button onClick={donePrint} className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700">Done + Print Sticker</button>
      </section>
    </div></main>
  );
}
