"use client";

import { useEffect, useMemo, useState } from "react";

export default function VaccinationMasterPage() {
  const [vaccines, setVaccines] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);
  const [message, setMessage] = useState("Buat master vaksin dan lot number.");
  const [error, setError] = useState("");
  const [vaccineForm, setVaccineForm] = useState({ name: "", brand: "", description: "", doseCount: 1, defaultNextDoseDays: "" });
  const [lotForm, setLotForm] = useState({ vaccineId: "", lotNumber: "", expiryDate: "", stockInitial: 0 });

  async function loadData() {
    const json = await fetch("/api/vaccination/master", { cache: "no-store" }).then((r) => r.json());
    if (!json.ok) { setError(json.message || "Gagal mengambil data."); return; }
    setVaccines(json.vaccines || []);
    setLots(json.lots || []);
    if (!lotForm.vaccineId && json.vaccines?.[0]?.id) setLotForm((s) => ({ ...s, vaccineId: String(json.vaccines[0].id) }));
  }

  async function submitVaccine() {
    setError("");
    const json = await fetch("/api/vaccination/master", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create-vaccine", ...vaccineForm }) }).then((r) => r.json());
    if (!json.ok) { setError(json.message || "Gagal menyimpan vaksin."); return; }
    setMessage(json.message); setVaccineForm({ name: "", brand: "", description: "", doseCount: 1, defaultNextDoseDays: "" }); loadData();
  }

  async function submitLot() {
    setError("");
    const json = await fetch("/api/vaccination/master", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create-lot", ...lotForm }) }).then((r) => r.json());
    if (!json.ok) { setError(json.message || "Gagal menyimpan lot."); return; }
    setMessage(json.message); setLotForm((s) => ({ ...s, lotNumber: "", expiryDate: "", stockInitial: 0 })); loadData();
  }

  useEffect(() => { loadData(); }, []);
  const activeVaccines = useMemo(() => vaccines.filter((v) => v.active), [vaccines]);

  return (
    <main className="p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:justify-between">
          <div><h1 className="text-2xl font-bold">Master Vaksin & Lot Number</h1><p className="mt-2 text-sm text-slate-600">Lot number dibuat dulu supaya medis cukup pilih vaksin dan lot saat administered.</p></div>
          <a href="/vaccination" className="rounded-xl border px-4 py-2 text-sm font-bold hover:bg-slate-50">☰ Menu Vaksinasi</a>
        </div>
        {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
        {message ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</div> : null}

        <div className="mt-6 grid gap-5 xl:grid-cols-2">
          <section className="rounded-2xl border bg-slate-50 p-5">
            <h2 className="text-lg font-bold">Tambah Vaksin</h2>
            <div className="mt-4 grid gap-3">
              <input className="rounded-xl border px-3 py-2" placeholder="Nama vaksin" value={vaccineForm.name} onChange={(e) => setVaccineForm({ ...vaccineForm, name: e.target.value })} />
              <input className="rounded-xl border px-3 py-2" placeholder="Brand / Produsen" value={vaccineForm.brand} onChange={(e) => setVaccineForm({ ...vaccineForm, brand: e.target.value })} />
              <textarea className="rounded-xl border px-3 py-2" placeholder="Deskripsi / catatan" value={vaccineForm.description} onChange={(e) => setVaccineForm({ ...vaccineForm, description: e.target.value })} />
              <div className="grid gap-3 md:grid-cols-2">
                <input type="number" className="rounded-xl border px-3 py-2" placeholder="Jumlah dosis" value={vaccineForm.doseCount} onChange={(e) => setVaccineForm({ ...vaccineForm, doseCount: Number(e.target.value || 1) })} />
                <input type="number" className="rounded-xl border px-3 py-2" placeholder="Next dose hari" value={vaccineForm.defaultNextDoseDays} onChange={(e) => setVaccineForm({ ...vaccineForm, defaultNextDoseDays: e.target.value })} />
              </div>
              <button onClick={submitVaccine} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700">Simpan Vaksin</button>
            </div>
          </section>
          <section className="rounded-2xl border bg-slate-50 p-5">
            <h2 className="text-lg font-bold">Tambah Lot Number</h2>
            <div className="mt-4 grid gap-3">
              <select className="rounded-xl border px-3 py-2" value={lotForm.vaccineId} onChange={(e) => setLotForm({ ...lotForm, vaccineId: e.target.value })}>
                <option value="">Pilih vaksin</option>
                {activeVaccines.map((v) => <option key={v.id} value={v.id}>{v.name}{v.brand ? ` · ${v.brand}` : ""}</option>)}
              </select>
              <input className="rounded-xl border px-3 py-2" placeholder="Lot Number / Batch" value={lotForm.lotNumber} onChange={(e) => setLotForm({ ...lotForm, lotNumber: e.target.value })} />
              <div className="grid gap-3 md:grid-cols-2">
                <input type="date" className="rounded-xl border px-3 py-2" value={lotForm.expiryDate} onChange={(e) => setLotForm({ ...lotForm, expiryDate: e.target.value })} />
                <input type="number" className="rounded-xl border px-3 py-2" placeholder="Stok awal" value={lotForm.stockInitial} onChange={(e) => setLotForm({ ...lotForm, stockInitial: Number(e.target.value || 0) })} />
              </div>
              <button onClick={submitLot} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700">Simpan Lot Number</button>
            </div>
          </section>
        </div>
        <section className="mt-6 rounded-2xl border">
          <div className="border-b bg-slate-50 p-4 font-bold">Daftar Lot Aktif</div>
          <div className="max-h-[420px] overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-xs uppercase text-slate-600"><tr><th className="p-3 text-left">Vaksin</th><th className="p-3 text-left">Lot</th><th className="p-3 text-left">Expired</th><th className="p-3 text-left">Stok</th><th className="p-3 text-left">Status</th></tr></thead>
              <tbody className="divide-y">{lots.map((lot) => <tr key={lot.id}><td className="p-3">{lot.vaccine?.name || "-"}</td><td className="p-3 font-bold">{lot.lot_number}</td><td className="p-3">{lot.expiry_date || "-"}</td><td className="p-3">{Number(lot.stock_initial || 0) - Number(lot.stock_used || 0)} / {lot.stock_initial}</td><td className="p-3">{lot.active ? "Aktif" : "Nonaktif"}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
