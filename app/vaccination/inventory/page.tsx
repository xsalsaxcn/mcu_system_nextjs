"use client";

import VaccinationInventoryMovementEnhancer from "@/components/VaccinationInventoryMovementEnhancer";
// VACCINATION_INVENTORY_MOVEMENT_ENHANCER_V149

import { useEffect, useMemo, useState } from "react";

function diffClass(value: any) {
  if (value === null || value === undefined || value === "") return "bg-slate-100 text-slate-600";
  const n = Number(value);
  if (n === 0) return "bg-emerald-100 text-emerald-700";
  if (n < 0) return "bg-red-100 text-red-700";
  return "bg-amber-100 text-amber-700";
}

function clean(value: any) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function money(value: any) {
  if (value === null || value === undefined || value === "") return "-";
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `Rp ${new Intl.NumberFormat("id-ID").format(number)}`;
}

function sessionName(session: any) {
  return clean(session?.session_name) || clean(session?.location) || (session?.id ? `Session ${session.id}` : "-");
}

function stockTarget(row: any) {
  const scope = clean(row?.stock_scope || "GENERAL").toUpperCase();
  if (scope === "SESSION") {
    return {
      scope: "Session",
      company: clean(row?.stock_company_name) || clean(row?.stock_session?.company_name) || "-",
      session: sessionName(row?.stock_session),
    };
  }
  if (scope === "COMPANY") {
    return { scope: "Perusahaan", company: clean(row?.stock_company_name) || "-", session: "Semua Session" };
  }
  return { scope: "General", company: "Semua Perusahaan", session: "Semua Session" };
}

export default function VaccinationInventoryPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("ALL");
  const [sessionFilter, setSessionFilter] = useState("ALL");
  const [serviceFilter, setServiceFilter] = useState("ALL");
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ stockAction: "ADD_STOCK", inventoryTarget: "SYSTEM", quantity: "", inventoryNotes: "" });
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
      stockAction: "ADD_STOCK",
      inventoryTarget: "SYSTEM",
      quantity: "",
      inventoryNotes: row.inventory_notes || "",
    });
  }

  async function saveInventory() {
    if (!editing) return;
    setError("");
    const quantity = Math.max(0, Number(form.quantity || 0));
    if (form.inventoryTarget === "SYSTEM" && !quantity) { setError("Jumlah stok wajib lebih dari 0."); return; }
    if (form.inventoryTarget === "PHYSICAL" && form.quantity === "") { setError("Sisa fisik wajib diisi."); return; }

    const json = await fetch("/api/vaccination/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "stock-transaction",
        lotId: editing.id,
        stockAction: form.stockAction,
        inventoryTarget: form.inventoryTarget,
        quantity,
        inventoryNotes: form.inventoryNotes,
      }),
    }).then((r) => r.json());

    if (!json.ok) { setError(json.message || "Gagal update inventory."); return; }
    setMessage(json.message || "Inventory berhasil diupdate.");
    setEditing(null);
    await load();
    window.dispatchEvent(new Event("vaccination-inventory-updated"));
  }

  useEffect(() => { load(); }, []);

  const companyOptions = useMemo(() => {
    const values = new Set<string>();
    for (const row of rows) {
      if (clean(row?.stock_company_name)) values.add(clean(row.stock_company_name));
      for (const allocation of row?.service_allocations || []) {
        if (clean(allocation?.company_name)) values.add(clean(allocation.company_name));
      }
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b, "id"));
  }, [rows]);

  const sessionOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      const stockSessionId = Number(row?.stock_session_id || 0);
      if (stockSessionId) map.set(String(stockSessionId), sessionName(row?.stock_session));
      for (const allocation of row?.service_allocations || []) {
        const id = Number(allocation?.session_id || 0);
        if (id) map.set(String(id), clean(allocation?.session_name) || sessionName(allocation?.session));
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "id"));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return rows.filter((row) => {
      const allocations = Array.isArray(row?.service_allocations) ? row.service_allocations : [];
      const haystack = [
        row.vaccine?.name,
        row.vaccine?.brand,
        row.lot_number,
        row.inventory_notes,
        row.stock_company_name,
        row.stock_session?.session_name,
        ...allocations.flatMap((a: any) => [a.company_name, a.session_name, a.service_mode]),
      ].filter(Boolean).join(" ").toLowerCase();
      if (keyword && !haystack.includes(keyword)) return false;

      if (companyFilter !== "ALL") {
        const companyMatch = clean(row?.stock_company_name) === companyFilter || allocations.some((a: any) => clean(a?.company_name) === companyFilter);
        if (!companyMatch) return false;
      }

      if (sessionFilter !== "ALL") {
        const sessionMatch = String(row?.stock_session_id || "") === sessionFilter || allocations.some((a: any) => String(a?.session_id || "") === sessionFilter);
        if (!sessionMatch) return false;
      }

      if (serviceFilter !== "ALL") {
        if (!allocations.some((a: any) => clean(a?.service_mode).toUpperCase() === serviceFilter)) return false;
      }

      return true;
    });
  }, [rows, search, companyFilter, sessionFilter, serviceFilter]);


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
          <div className="mb-3">
            <div className="text-sm font-black text-slate-900">Pelaporan Inventory mengikuti rule Master Produk & Lot</div>
            <div className="mt-1 text-xs font-semibold text-slate-500">Tujuan stok Perusahaan/Session, bucket Healthday/Bazar, harga Paket/Non Paket, pemakaian peserta, dan movement dibaca dari sumber data yang sama dengan Master.</div>
          </div>
          <div className="grid gap-3 xl:grid-cols-[minmax(260px,1fr)_220px_280px_180px_auto]">
            <input className="rounded-xl border px-3 py-2.5" placeholder="Cari produk, lot, session, perusahaan..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold" value={companyFilter} onChange={(e) => { setCompanyFilter(e.target.value); setSessionFilter("ALL"); }}>
              <option value="ALL">Semua Perusahaan</option>
              {companyOptions.map((company) => <option key={company} value={company}>{company}</option>)}
            </select>
            <select className="rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold" value={sessionFilter} onChange={(e) => setSessionFilter(e.target.value)}>
              <option value="ALL">Semua Session</option>
              {sessionOptions.map((session) => <option key={session.id} value={session.id}>{session.name}</option>)}
            </select>
            <select className="rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold" value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)}>
              <option value="ALL">Healthday + Bazar</option>
              <option value="HEALTHDAY">Healthday</option>
              <option value="BAZAR">Bazar</option>
            </select>
            <button onClick={async () => { await load(); window.dispatchEvent(new Event("vaccination-inventory-updated")); }} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700">Refresh</button>
          </div>
        </section>

        {editing ? (
          <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <div className="text-lg font-black text-amber-900">Edit Inventory: {editing.vaccine?.name} · Lot {editing.lot_number}</div>
            <p className="mt-1 text-sm text-amber-900/80">Sisa Fisik otomatis disamakan dengan Sisa Sistem setelah transaksi. Return Stock berarti stok kembali masuk ke inventory.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <label className="grid gap-1 text-xs font-black uppercase text-slate-500">
                Stok
                <select disabled={form.inventoryTarget === "PHYSICAL"} className="rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold normal-case text-slate-900 disabled:bg-slate-100 disabled:text-slate-400" value={form.stockAction} onChange={(e) => setForm({ ...form, stockAction: e.target.value })}>
                  <option value="ADD_STOCK">Tambah Stock</option>
                  <option value="RETURN_STOCK">Return Stock</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-black uppercase text-slate-500">
                Pilih Inventory
                <select className="rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold normal-case text-slate-900" value={form.inventoryTarget} onChange={(e) => { const value = e.target.value; setForm({ ...form, inventoryTarget: value, quantity: value === "PHYSICAL" && Number(editing.stock_system_remaining || 0) >= 0 ? String(Number(editing.stock_system_remaining || 0)) : "" }); }}>
                  <option value="SYSTEM">Sistem</option>
                  <option value="PHYSICAL">Fisik</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-black uppercase text-slate-500">
                {form.inventoryTarget === "PHYSICAL" ? "Sisa Fisik" : "Jumlah Stock Masuk"}
                <input type="number" min={form.inventoryTarget === "PHYSICAL" ? 0 : 1} step={1} className="rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold normal-case text-slate-900" placeholder={form.inventoryTarget === "PHYSICAL" ? "Harus sama dengan Sisa Sistem" : "Jumlah stok"} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </label>
              <div className="rounded-xl border bg-white px-3 py-2.5">
                <div className="text-xs font-black uppercase text-slate-500">Sisa Sistem Saat Ini</div>
                <div className="mt-1 text-lg font-black text-slate-900">{Number(editing.stock_system_remaining || 0)}</div>
              </div>
              <div className="rounded-xl border bg-white px-3 py-2.5">
                <div className="text-xs font-black uppercase text-slate-500">Sisa Setelah Simpan</div>
                <div className="mt-1 text-lg font-black text-emerald-700">{form.inventoryTarget === "PHYSICAL" ? Number(editing.stock_system_remaining || 0) : Number(editing.stock_system_remaining || 0) + Math.max(0, Number(form.quantity || 0))}</div>
              </div>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
              <input className="rounded-xl border bg-white px-3 py-2.5" placeholder="Keterangan / sumber stock" value={form.inventoryNotes} onChange={(e) => setForm({ ...form, inventoryNotes: e.target.value })} />
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-800">{form.inventoryTarget === "PHYSICAL" ? "Fisik hanya bisa disimpan jika sama dengan Sisa Sistem." : "Sistem hanya disimpan jika hasil akhirnya match Sisa Fisik yang sudah tercatat."}</div>
            </div>
            <div className="mt-4 flex gap-3">
              <button onClick={saveInventory} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700">Simpan Inventory</button>
              <button onClick={() => setEditing(null)} className="rounded-xl border bg-white px-4 py-3 text-sm font-bold hover:bg-slate-50">Batal</button>
            </div>
          </section>
        ) : null}

        <section className="mt-6 overflow-hidden rounded-2xl border">
          <div className="overflow-x-auto">
            <table data-inventory-canonical-table="1" className="min-w-[2200px] text-sm">
              <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                <tr>
                  <th className="p-3 text-left">Nama Vaksin / Produk</th>
                  <th className="p-3 text-left">Brand</th>
                  <th className="p-3 text-left">Lot Number</th>
                  <th className="p-3 text-left">Non Paket</th>
                  <th className="p-3 text-left">Paket</th>
                  <th className="p-3 text-left">Dosis Paket</th>
                  <th className="p-3 text-left">Tujuan Stok</th>
                  <th className="p-3 text-left">Jenis Stok / Alokasi</th>
                  <th className="p-3 text-left">Jumlah Awal</th>
                  <th className="p-3 text-left">Tambahan Stok</th>
                  <th className="p-3 text-left">Terpakai</th>
                  <th className="p-3 text-left">IN Dari / Sumber</th>
                  <th className="p-3 text-left">OUT Ke / Perusahaan</th>
                  <th className="p-3 text-left">Sisa Sistem</th>
                  <th className="p-3 text-left">Sisa Fisik</th>
                  <th className="p-3 text-left">Selisih</th>
                  <th className="p-3 text-left">Movement</th>
                  <th className="p-3 text-left">Keterangan</th>
                  <th className="p-3 text-left">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredRows.map((row) => {
                  const target = stockTarget(row);
                  const allocations = (row?.service_allocations || []).filter((allocation: any) => serviceFilter === "ALL" || clean(allocation?.service_mode).toUpperCase() === serviceFilter);
                  return (
                    <tr key={row.id} className="align-top">
                      <td className="p-3 font-bold">{row.vaccine?.name || "-"}</td>
                      <td className="p-3">{row.vaccine?.brand || "-"}</td>
                      <td className="p-3 font-semibold">{row.lot_number || "-"}</td>
                      <td className="p-3 font-bold">{money(row.non_package_price)}</td>
                      <td className="p-3 font-bold text-emerald-700">{money(row.package_price)}</td>
                      <td className="p-3">{row.package_dose_count ? `${row.package_dose_count}x` : "-"}</td>
                      <td className="p-3">
                        <div className="max-w-[260px] rounded-xl border bg-slate-50 px-3 py-2">
                          <div className="text-[10px] font-black uppercase text-slate-500">{target.scope}</div>
                          <div className="mt-1 text-xs font-black text-slate-900">{target.company}</div>
                          <div className="mt-0.5 text-xs text-slate-600">{target.session}</div>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="min-w-[300px] space-y-1.5">
                          {allocations.length ? allocations.map((allocation: any) => (
                            <div key={`${allocation.id}-${allocation.service_mode}`} className={`rounded-lg px-2.5 py-2 text-xs font-bold ${clean(allocation.service_mode).toUpperCase() === "BAZAR" ? "bg-violet-50 text-violet-800" : "bg-blue-50 text-blue-800"}`}>
                              <div>{clean(allocation.service_mode).toUpperCase() === "BAZAR" ? "Bazar" : "Healthday"} · {clean(allocation.session_name) || "Session"}</div>
                              <div className="mt-0.5 font-semibold opacity-80">Alokasi {Number(allocation.allocated_qty || 0)} · Terpakai {Number(allocation.used_qty || 0)} · Sisa {Number(allocation.remaining_qty || 0)}</div>
                            </div>
                          )) : <span className="text-xs text-slate-400">Belum ada alokasi Healthday/Bazar</span>}
                        </div>
                      </td>
                      <td className="p-3 font-black">{row.stock_initial || 0}</td>
                      <td className="p-3">{row.stock_added || 0}</td>
                      <td className="p-3 font-bold">{row.stock_used || 0}</td>
                      <td data-inventory-in-v150="1" className="p-3">-</td>
                      <td data-inventory-out-v150="1" className="p-3">-</td>
                      <td className="p-3 font-black text-emerald-700">{row.stock_system_remaining}</td>
                      <td className="p-3">{row.stock_physical_count ?? "-"}</td>
                      <td className="p-3"><span className={`rounded-full px-3 py-1 text-xs font-black ${diffClass(row.stock_difference)}`}>{row.stock_difference ?? "Belum audit"}</span></td>
                      <td className="p-3">
                        <div className="text-xs font-black text-slate-800">{Number(row.movement_count || 0)} transaksi</div>
                        <div className="mt-1 text-[11px] text-slate-500">{row.last_movement_type || "-"}</div>
                      </td>
                      <td className="p-3">{row.inventory_notes || "-"}</td>
                      <td className="p-3"><button onClick={() => startEdit(row)} className="rounded-xl border px-3 py-2 text-xs font-bold hover:bg-slate-50">Edit</button></td>
                    </tr>
                  );
                })}
                {!filteredRows.length ? <tr><td colSpan={19} className="p-5 text-center text-slate-500">Belum ada data inventory sesuai filter.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* VACCINATION_INVENTORY_MOVEMENT_AUDIT_V149 */}
      <VaccinationInventoryMovementEnhancer />
</main>
  );
}
