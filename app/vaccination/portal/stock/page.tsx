"use client";

import { useEffect, useMemo, useState } from "react";

function clean(value: any) {
  return String(value ?? "").trim();
}

export default function VaccinationStockAllocationPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [vaccines, setVaccines] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);
  const [message, setMessage] = useState("Atur stock yang didedikasikan untuk session tertentu.");
  const [error, setError] = useState("");
  const [form, setForm] = useState({ sessionId: "", vaccineId: "", lotId: "", allocatedQty: 0, threshold: 5, dedicated: true, notes: "" });

  async function load() {
    setError("");
    const res = await fetch("/api/vaccination/stock-allocations", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) {
      setError(json.message || "Gagal mengambil alokasi stock.");
      setSessions(json.sessions || []);
      setVaccines(json.vaccines || []);
      setLots(json.lots || []);
      return;
    }
    setRows(json.rows || []);
    setSessions(json.sessions || []);
    setVaccines(json.vaccines || []);
    setLots(json.lots || []);
  }

  useEffect(() => { load(); }, []);

  const filteredLots = useMemo(() => {
    return lots.filter((lot) => !form.vaccineId || String(lot.vaccine_id) === String(form.vaccineId));
  }, [lots, form.vaccineId]);

  function stockOf(lot: any) {
    return Number(lot.stock_initial || 0) + Number(lot.stock_added || 0) - Number(lot.stock_used || 0);
  }

  async function save() {
    setError("");
    const res = await fetch("/api/vaccination/stock-allocations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: Number(form.sessionId),
        lotId: Number(form.lotId),
        allocatedQty: Number(form.allocatedQty),
        lowStockThreshold: Number(form.threshold),
        dedicated: form.dedicated,
        notes: form.notes,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) {
      setError(json.message || "Gagal menyimpan alokasi.");
      return;
    }
    setMessage(json.message || "Alokasi berhasil disimpan.");
    setForm({ sessionId: "", vaccineId: "", lotId: "", allocatedQty: 0, threshold: 5, dedicated: true, notes: "" });
    await load();
  }

  async function disable(id: number) {
    if (!window.confirm("Nonaktifkan alokasi stock session ini?")) return;
    const res = await fetch("/api/vaccination/stock-allocations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disable", id }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) {
      setError(json.message || "Gagal menonaktifkan alokasi.");
      return;
    }
    setMessage(json.message || "Alokasi dinonaktifkan.");
    await load();
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-3 rounded-3xl bg-gradient-to-br from-blue-950 via-blue-800 to-emerald-600 p-6 text-white shadow-lg md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-100">Vaccination Portal</div>
            <h1 className="mt-1 text-2xl font-black">Alokasi Stock per Session</h1>
            <p className="mt-1 text-sm text-blue-100">Lot dedicated tidak boleh dipakai oleh session lain. Guard juga dijalankan di API Administer.</p>
          </div>
          <a href="/vaccination/portal" className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-blue-900">Kembali ke Portal</a>
        </div>

        {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
        {message ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</div> : null}

        <section className="mt-5 rounded-3xl border bg-white p-5 shadow-sm">
          <div className="text-lg font-black">Tambah / Update Alokasi</div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <select className="rounded-xl border px-3 py-3" value={form.sessionId} onChange={(e) => setForm({ ...form, sessionId: e.target.value })}>
              <option value="">Pilih session</option>
              {sessions.map((session) => <option key={session.id} value={session.id}>{session.session_name} - {session.company_name || "-"} - {session.location || "-"}</option>)}
            </select>

            <select className="rounded-xl border px-3 py-3" value={form.vaccineId} onChange={(e) => setForm({ ...form, vaccineId: e.target.value, lotId: "" })}>
              <option value="">Pilih vaksin</option>
              {vaccines.filter((v) => v.active !== false).map((vaccine) => <option key={vaccine.id} value={vaccine.id}>{vaccine.name}{vaccine.brand ? ` - ${vaccine.brand}` : ""}</option>)}
            </select>

            <select className="rounded-xl border px-3 py-3" value={form.lotId} onChange={(e) => setForm({ ...form, lotId: e.target.value })}>
              <option value="">Pilih lot</option>
              {filteredLots.filter((lot) => lot.active !== false).map((lot) => <option key={lot.id} value={lot.id}>Lot {lot.lot_number} - sisa global {stockOf(lot)} - exp {lot.expiry_date || "-"}</option>)}
            </select>

            <input type="number" min={1} className="rounded-xl border px-3 py-3" placeholder="Jumlah alokasi" value={form.allocatedQty} onChange={(e) => setForm({ ...form, allocatedQty: Number(e.target.value || 0) })} />
            <input type="number" min={0} className="rounded-xl border px-3 py-3" placeholder="Low stock threshold" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: Number(e.target.value || 0) })} />
            <input className="rounded-xl border px-3 py-3" placeholder="Catatan / sumber stock" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm font-bold text-slate-700">
            <input type="checkbox" checked={form.dedicated} onChange={(e) => setForm({ ...form, dedicated: e.target.checked })} />
            Dedicated untuk session ini. Session lain tidak boleh menggunakan lot ini.
          </label>
          <button type="button" onClick={save} className="mt-4 rounded-xl bg-blue-700 px-5 py-3 text-sm font-black text-white hover:bg-blue-800">Simpan Alokasi</button>
        </section>

        <section className="mt-5 overflow-hidden rounded-3xl border bg-white shadow-sm">
          <div className="border-b p-5 text-lg font-black">Daftar Alokasi Aktif</div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                <tr>
                  <th className="p-3 text-left">Session</th>
                  <th className="p-3 text-left">Perusahaan</th>
                  <th className="p-3 text-left">Vaksin</th>
                  <th className="p-3 text-left">Lot</th>
                  <th className="p-3 text-right">Alokasi</th>
                  <th className="p-3 text-right">Terpakai</th>
                  <th className="p-3 text-right">Sisa</th>
                  <th className="p-3 text-right">Threshold</th>
                  <th className="p-3 text-left">Mode</th>
                  <th className="p-3 text-left">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.filter((row) => row.active !== false).map((row) => (
                  <tr key={row.id}>
                    <td className="p-3 font-bold">{row.session?.session_name || row.session_id}</td>
                    <td className="p-3">{row.session?.company_name || "-"}</td>
                    <td className="p-3">{row.vaccine?.name || "-"}</td>
                    <td className="p-3">{row.lot?.lot_number || "-"}</td>
                    <td className="p-3 text-right">{row.allocated_qty}</td>
                    <td className="p-3 text-right">{row.used_qty}</td>
                    <td className={`p-3 text-right font-black ${Number(row.remaining_qty) <= Number(row.low_stock_threshold) ? "text-red-600" : "text-emerald-700"}`}>{row.remaining_qty}</td>
                    <td className="p-3 text-right">{row.low_stock_threshold}</td>
                    <td className="p-3">{row.dedicated ? "Dedicated" : "Shared"}</td>
                    <td className="p-3"><button type="button" onClick={() => disable(row.id)} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700">Nonaktifkan</button></td>
                  </tr>
                ))}
                {!rows.filter((row) => row.active !== false).length ? <tr><td colSpan={10} className="p-8 text-center text-slate-500">Belum ada alokasi aktif.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
