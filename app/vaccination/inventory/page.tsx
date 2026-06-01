"use client";

import { useEffect, useMemo, useState } from "react";

function diffClass(value: any) {
  if (value === null || value === undefined || value === "") return "bg-slate-100 text-slate-600";
  const n = Number(value);
  if (n === 0) return "bg-emerald-100 text-emerald-700";
  if (n < 0) return "bg-red-100 text-red-700";
  return "bg-amber-100 text-amber-700";
}

export default function VaccinationInventoryPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ stockAdded: 0, stockPhysicalCount: "", inventoryNotes: "" });
  const [message, setMessage] = useState("Inventory membaca stok terpakai dari data dokter/Administered yang sudah Done.");
  const [error, setError] = useState("");

  async function load() {
    setError("");
    const json = await fetch("/api/vaccination/inventory", { cache: "no-store" }).then((r) => r.json());
    if (!json.ok) { setError(json.message || "Gagal mengambil inventory."); return; }
    setRows(json.rows || []);
  }

  function startEdit(row: any) {
    setEditing(row);
    setForm({
      stockAdded: Number(row.stock_added || 0),
      stockPhysicalCount: row.stock_physical_count == null ? "" : String(row.stock_physical_count),
      inventoryNotes: row.inventory_notes || "",
    });
  }

  async function saveInventory() {
    if (!editing) return;
    setError("");
    const json = await fetch("/api/vaccination/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lotId: editing.id, ...form }),
    }).then((r) => r.json());

    if (!json.ok) { setError(json.message || "Gagal update inventory."); return; }
    setMessage(json.message || "Inventory berhasil diupdate.");
    setEditing(null);
    await load();
  }

  useEffect(() => { load(); }, []);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter((row) => [row.vaccine?.name, row.vaccine?.brand, row.lot_number, row.inventory_notes].filter(Boolean).join(" ").toLowerCase().includes(keyword));
  }, [rows, search]);

  const summary = useMemo(() => {
    return rows.reduce((acc, row) => {
      acc.initial += Number(row.stock_initial || 0);
      acc.added += Number(row.stock_added || 0);
      acc.used += Number(row.stock_used || 0);
      acc.remaining += Number(row.stock_system_remaining || 0);
      if (row.stock_difference !== null && row.stock_difference !== undefined) acc.diff += Number(row.stock_difference || 0);
      return acc;
    }, { initial: 0, added: 0, used: 0, remaining: 0, diff: 0 });
  }, [rows]);

  return (
    <main className="p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Inventory Vaksin</h1>
            <p className="mt-2 text-sm text-slate-600">Sisa Sistem = Jumlah Awal + Tambahan Stok - Terpakai. Selisih = Sisa Fisik - Sisa Sistem.</p>
          </div>
          <a href="/vaccination" className="rounded-xl border px-4 py-2 text-sm font-bold hover:bg-slate-50">☰ Menu Vaksinasi</a>
        </div>

        {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
        {message ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</div> : null}

        <section className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {[{ label: "Jumlah Awal", value: summary.initial }, { label: "Tambahan Stok", value: summary.added }, { label: "Terpakai", value: summary.used }, { label: "Sisa Sistem", value: summary.remaining }, { label: "Total Selisih", value: summary.diff }].map((card) => (
            <div key={card.label} className="rounded-2xl border bg-slate-50 p-4">
              <div className="text-xs font-black uppercase text-slate-500">{card.label}</div>
              <div className="mt-2 text-3xl font-black text-slate-900">{card.value}</div>
            </div>
          ))}
        </section>

        <section className="mt-6 rounded-2xl border bg-slate-50 p-5">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <input className="rounded-xl border px-3 py-2.5" placeholder="Cari produk, lot, keterangan..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <button onClick={load} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700">Refresh</button>
          </div>
        </section>

        {editing ? (
          <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <div className="text-lg font-black text-amber-900">Edit Inventory: {editing.vaccine?.name} · Lot {editing.lot_number}</div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <input type="number" className="rounded-xl border px-3 py-2.5" placeholder="Tambahan stok" value={form.stockAdded} onChange={(e) => setForm({ ...form, stockAdded: Number(e.target.value || 0) })} />
              <input type="number" className="rounded-xl border px-3 py-2.5" placeholder="Sisa fisik" value={form.stockPhysicalCount} onChange={(e) => setForm({ ...form, stockPhysicalCount: e.target.value })} />
              <input className="rounded-xl border px-3 py-2.5" placeholder="Keterangan" value={form.inventoryNotes} onChange={(e) => setForm({ ...form, inventoryNotes: e.target.value })} />
            </div>
            <div className="mt-4 flex gap-3">
              <button onClick={saveInventory} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700">Simpan Inventory</button>
              <button onClick={() => setEditing(null)} className="rounded-xl border bg-white px-4 py-3 text-sm font-bold hover:bg-slate-50">Batal</button>
            </div>
          </section>
        ) : null}

        <section className="mt-6 overflow-hidden rounded-2xl border">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-600">
              <tr>
                <th className="p-3 text-left">Nama Vaksin / Produk</th>
                <th className="p-3 text-left">Lot Number</th>
                <th className="p-3 text-left">Jumlah Awal</th>
                <th className="p-3 text-left">Tambahan Stok</th>
                <th className="p-3 text-left">Terpakai</th>
                <th className="p-3 text-left">Sisa Sistem</th>
                <th className="p-3 text-left">Sisa Fisik</th>
                <th className="p-3 text-left">Selisih</th>
                <th className="p-3 text-left">Keterangan</th>
                <th className="p-3 text-left">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredRows.map((row) => (
                <tr key={row.id}>
                  <td className="p-3 font-bold">{row.vaccine?.name || "-"}</td>
                  <td className="p-3">{row.lot_number}</td>
                  <td className="p-3">{row.stock_initial || 0}</td>
                  <td className="p-3">{row.stock_added || 0}</td>
                  <td className="p-3">{row.stock_used || 0}</td>
                  <td className="p-3 font-bold">{row.stock_system_remaining}</td>
                  <td className="p-3">{row.stock_physical_count ?? "-"}</td>
                  <td className="p-3"><span className={`rounded-full px-3 py-1 text-xs font-black ${diffClass(row.stock_difference)}`}>{row.stock_difference ?? "Belum audit"}</span></td>
                  <td className="p-3">{row.inventory_notes || "-"}</td>
                  <td className="p-3"><button onClick={() => startEdit(row)} className="rounded-xl border px-3 py-2 text-xs font-bold hover:bg-slate-50">Edit</button></td>
                </tr>
              ))}
              {!filteredRows.length ? <tr><td colSpan={10} className="p-5 text-center text-slate-500">Belum ada data inventory.</td></tr> : null}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
