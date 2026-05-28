"use client";

import { useEffect, useMemo, useState } from "react";

type SourceItem = { id: number; name: string; institution_name?: string | null; program_type?: string | null };

export default function VaccinationSessionPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [vaccines, setVaccines] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);
  const [message, setMessage] = useState("Buat session vaksinasi perusahaan dan link ke database corporate.");
  const [error, setError] = useState("");
  const [form, setForm] = useState({ sessionName: "", sourceId: "", companyName: "", location: "", sessionDate: "", defaultVaccineId: "", defaultLotId: "" });

  const selectedSource = sources.find((source) => String(source.id) === String(form.sourceId));
  const filteredLots = useMemo(() => lots.filter((lot) => !form.defaultVaccineId || String(lot.vaccine_id) === String(form.defaultVaccineId)), [lots, form.defaultVaccineId]);

  async function loadBase() {
    const [sourceJson, masterJson, sessionJson] = await Promise.all([
      fetch("/api/sources?program=corporate", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/vaccination/master", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/vaccination/sessions", { cache: "no-store" }).then((r) => r.json()),
    ]);
    if (sourceJson.ok) setSources(sourceJson.sources || []);
    if (masterJson.ok) { setVaccines((masterJson.vaccines || []).filter((v: any) => v.active !== false)); setLots((masterJson.lots || []).filter((lot: any) => lot.active !== false)); }
    if (sessionJson.ok) setSessions(sessionJson.sessions || []);
  }

  async function submit() {
    setError("");
    const source = sources.find((item) => String(item.id) === String(form.sourceId));
    const companyName = form.companyName || source?.institution_name || source?.name || "";
    const res = await fetch("/api/vaccination/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, companyName, sourceName: source ? `${source.name}${source.institution_name ? ` · ${source.institution_name}` : ""}` : "" }) });
    const json = await res.json();
    if (!res.ok || !json.ok) { setError(json.message || "Gagal membuat session."); return; }
    setMessage(json.message);
    setForm({ sessionName: "", sourceId: "", companyName: "", location: "", sessionDate: "", defaultVaccineId: "", defaultLotId: "" });
    loadBase();
  }

  useEffect(() => { loadBase(); }, []);
  useEffect(() => { if (selectedSource && !form.companyName) setForm((prev) => ({ ...prev, companyName: selectedSource.institution_name || selectedSource.name || "" })); }, [form.sourceId]);

  return <main className="p-6"><div className="rounded-2xl border bg-white p-6 shadow-sm"><div className="flex flex-col gap-3 md:flex-row md:justify-between"><div><h1 className="text-2xl font-bold">Session Vaksinasi</h1><p className="mt-2 text-sm text-slate-600">Link session ke database corporate, default vaksin, dan default lot number.</p></div><a href="/vaccination" className="rounded-xl border px-4 py-2 text-sm font-bold hover:bg-slate-50">☰ Menu Vaksinasi</a></div>{error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}{message ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</div> : null}<section className="mt-6 rounded-2xl border bg-slate-50 p-5"><h2 className="font-bold">Tambah Session</h2><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3"><input className="rounded-xl border px-3 py-2.5" placeholder="Nama session" value={form.sessionName} onChange={(e) => setForm({ ...form, sessionName: e.target.value })} /><select className="rounded-xl border px-3 py-2.5" value={form.sourceId} onChange={(e) => setForm({ ...form, sourceId: e.target.value })}><option value="">Pilih database corporate</option>{sources.map((s) => <option key={s.id} value={s.id}>{s.name}{s.institution_name ? ` · ${s.institution_name}` : ""}</option>)}</select><input className="rounded-xl border px-3 py-2.5" placeholder="Nama perusahaan" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} /><input className="rounded-xl border px-3 py-2.5" placeholder="Lokasi" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /><input type="date" className="rounded-xl border px-3 py-2.5" value={form.sessionDate} onChange={(e) => setForm({ ...form, sessionDate: e.target.value })} /><select className="rounded-xl border px-3 py-2.5" value={form.defaultVaccineId} onChange={(e) => setForm({ ...form, defaultVaccineId: e.target.value, defaultLotId: "" })}><option value="">Default vaksin opsional</option>{vaccines.map((v) => <option key={v.id} value={v.id}>{v.name}{v.brand ? ` · ${v.brand}` : ""}</option>)}</select><select className="rounded-xl border px-3 py-2.5 xl:col-span-3" value={form.defaultLotId} onChange={(e) => setForm({ ...form, defaultLotId: e.target.value })}><option value="">Default lot number opsional</option>{filteredLots.map((lot) => <option key={lot.id} value={lot.id}>{lot.vaccine?.name || "Vaksin"} · Lot {lot.lot_number} · exp {lot.expiry_date || "-"}</option>)}</select></div><button onClick={submit} className="mt-4 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700">Simpan Session</button></section><section className="mt-6 overflow-hidden rounded-2xl border"><div className="border-b bg-slate-50 p-4 font-bold">Daftar Session</div><table className="min-w-full text-sm"><thead className="bg-slate-100 text-xs uppercase text-slate-600"><tr><th className="p-3 text-left">Session</th><th className="p-3 text-left">Database</th><th className="p-3 text-left">Perusahaan</th><th className="p-3 text-left">Tanggal</th><th className="p-3 text-left">Public</th></tr></thead><tbody className="divide-y">{sessions.map((s) => <tr key={s.id}><td className="p-3 font-bold">{s.session_name}</td><td className="p-3">{s.source_name || s.source_id || "-"}</td><td className="p-3">{s.company_name || "-"}</td><td className="p-3">{s.session_date || "-"}</td><td className="p-3"><a className="font-bold text-blue-600" href={`/vaccination/public/queue/${s.public_queue_token}`} target="_blank">Public Queue</a></td></tr>)}</tbody></table></section></div></main>;
}
