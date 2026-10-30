"use client";
// V520_INVENTORY_SERVICE_ASSIGNMENT_FILTER
// V519_INVENTORY_SERVICE_FILTER_CANONICAL_DEDUPE_PRODUCT_FILTER

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
  return clean(session?.location) || clean(session?.session_name) || (session?.id ? `Session ${session.id}` : "-");
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
  const [productFilter, setProductFilter] = useState("ALL");
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ stockAction: "ADD_STOCK", inventoryTarget: "SYSTEM", quantity: "", inventoryNotes: "" });
  const [message, setMessage] = useState("Inventory membaca stok terpakai dari data dokter/Administered yang sudah Done.");
  const [error, setError] = useState("");
  const [publicPortalUrl, setPublicPortalUrl] = useState("");

  async function load() {
    setError("");
    const json = await fetch("/api/vaccination/inventory", { cache: "no-store" }).then((r) => r.json());
    if (!json.ok) { setError(json.message || "Gagal mengambil inventory."); return; }
    setRows(json.rows || []);
  }

  async function generatePublicPortal() {
    setError("");
    try {
      const response = await fetch("/api/vaccination/inventory/public-link", { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.ok === false) throw new Error(json?.message || `HTTP ${response.status}`);
      const url = clean(json?.url || json?.path);
      if (!url) throw new Error("URL Portal Inventory tidak terbentuk.");
      setPublicPortalUrl(url);
      try { await navigator.clipboard.writeText(url); } catch {}
      setMessage("Link Portal Inventory berhasil dibuat dan disalin.");
    } catch (e: any) {
      setError(String(e?.message || e || "Gagal membuat link Portal Inventory."));
    }
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

  function rowMatchesService(row: any, requestedMode: string) {
    if (requestedMode === "ALL") return true;
    const catalog = Array.isArray(row?.service_catalog) ? row.service_catalog : [];
    const allocations = Array.isArray(row?.service_allocations) ? row.service_allocations : [];
    const mode = clean(requestedMode).toUpperCase();

    if (catalog.length) {
      return catalog.some((item: any) =>
        clean(item?.service_mode).toUpperCase() === mode &&
        (sessionFilter === "ALL" || String(item?.session_id || "") === sessionFilter)
      );
    }

    // Legacy fallback only when catalog assignment is unavailable. Zero-only
    // allocations do not classify a product into a service.
    return allocations.some((item: any) =>
      clean(item?.service_mode).toUpperCase() === mode &&
      (sessionFilter === "ALL" || String(item?.session_id || "") === sessionFilter) &&
      (Number(item?.allocated_qty || 0) > 0 || Number(item?.used_qty || 0) > 0)
    );
  }

  const productOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; brand: string }>();
    for (const row of rows) {
      const allocations = Array.isArray(row?.service_allocations) ? row.service_allocations : [];
      if (companyFilter !== "ALL") {
        const companyMatch = clean(row?.stock_company_name) === companyFilter || allocations.some((a: any) => clean(a?.company_name) === companyFilter);
        if (!companyMatch) continue;
      }
      if (sessionFilter !== "ALL") {
        const sessionMatch = String(row?.stock_session_id || "") === sessionFilter || allocations.some((a: any) => String(a?.session_id || "") === sessionFilter);
        if (!sessionMatch) continue;
      }
      if (!rowMatchesService(row, serviceFilter)) continue;
      const id = String(row?.vaccine_id || row?.vaccine?.id || "");
      if (!id) continue;
      map.set(id, { id, name: clean(row?.vaccine?.name) || `Produk ${id}`, brand: clean(row?.vaccine?.brand) });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "id"));
  }, [rows, companyFilter, sessionFilter, serviceFilter]);

  const showHealthday = serviceFilter !== "BAZAR";
  const showBazar = serviceFilter !== "HEALTHDAY";

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

      if (!rowMatchesService(row, serviceFilter)) return false;

      if (productFilter !== "ALL" && String(row?.vaccine_id || row?.vaccine?.id || "") !== productFilter) return false;
      return true;
    });
  }, [rows, search, companyFilter, sessionFilter, serviceFilter, productFilter]);


  const summary = useMemo(() => {
    return rows.reduce((acc, row) => {
      acc.initial += Number(row.stock_initial || 0);
      acc.added += Number(row.stock_added || 0);
      acc.used += Number(row.stock_used || 0);
      acc.adjustmentOut += Number(row.stock_adjustment_out || 0);
      acc.remaining += Number(row.stock_system_remaining || 0);
      if (row.stock_difference !== null && row.stock_difference !== undefined) acc.diff += Number(row.stock_difference || 0);
      return acc;
    }, { initial: 0, added: 0, used: 0, adjustmentOut: 0, remaining: 0, diff: 0 });
  }, [rows]);

  return (
    <main className="p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Inventory Vaksin</h1>
            <p className="mt-2 text-sm text-slate-600">Sisa Sistem = Jumlah Awal + Tambahan Stok - Terpakai Peserta - Koreksi Keluar. Selisih = Sisa Fisik - Sisa Sistem.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={generatePublicPortal} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-black text-blue-700 hover:bg-blue-100">🔗 Portal Tim Inventory</button>
            <a href="/vaccination" className="rounded-xl border px-4 py-2 text-sm font-bold hover:bg-slate-50">☰ Menu Vaksinasi</a>
          </div>
        </div>

        {publicPortalUrl ? (
          <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
            <div className="text-xs font-black uppercase tracking-wide text-blue-700">Link Portal Inventory</div>
            <div className="mt-2 flex flex-col gap-2 lg:flex-row">
              <input readOnly value={publicPortalUrl} className="min-w-0 flex-1 rounded-xl border bg-white px-3 py-2 text-sm font-semibold" />
              <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(publicPortalUrl); setMessage("Link Portal Inventory disalin."); } catch { setError("Browser tidak mengizinkan copy otomatis."); } }} className="rounded-xl border bg-white px-4 py-2 text-sm font-black">Salin Link</button>
              <a href={publicPortalUrl} target="_blank" rel="noreferrer" className="rounded-xl bg-blue-700 px-4 py-2 text-center text-sm font-black text-white">Buka Portal</a>
            </div>
            <div className="mt-2 text-xs font-semibold text-blue-800">Link ini memberikan akses operasional Inventory tanpa login. Bagikan hanya kepada tim yang berwenang.</div>
          </div>
        ) : null}

        {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
        {message ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</div> : null}

        <section className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          {[{ label: "Jumlah Awal", value: summary.initial }, { label: "Tambahan Stok", value: summary.added }, { label: "Terpakai Peserta", value: summary.used }, { label: "Koreksi Keluar", value: summary.adjustmentOut }, { label: "Sisa Sistem", value: summary.remaining }, { label: "Total Selisih", value: summary.diff }].map((card) => (
            <div key={card.label} className="rounded-2xl border bg-slate-50 p-4">
              <div className="text-xs font-black uppercase text-slate-500">{card.label}</div>
              <div className="mt-2 text-3xl font-black text-slate-900">{card.value}</div>
            </div>
          ))}
        </section>

        <section className="mt-6 rounded-2xl border bg-slate-50 p-5">
          <div className="mb-3">
            <div className="text-sm font-black text-slate-900">Ringkasan Inventory Vaksin</div>
            <div className="mt-1 text-xs font-semibold text-slate-500">Pantau stok per perusahaan, session, layanan, produk, dan lot dalam satu tampilan.</div>
          </div>
          <div className="grid gap-3 xl:grid-cols-[minmax(240px,1fr)_210px_250px_210px_170px_auto]">
            <input className="rounded-xl border px-3 py-2.5" placeholder="Cari produk, lot, session, perusahaan..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold" value={companyFilter} onChange={(e) => { setCompanyFilter(e.target.value); setSessionFilter("ALL"); setProductFilter("ALL"); }}>
              <option value="ALL">Semua Perusahaan</option>
              {companyOptions.map((company) => <option key={company} value={company}>{company}</option>)}
            </select>
            <select className="rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold" value={sessionFilter} onChange={(e) => { setSessionFilter(e.target.value); setProductFilter("ALL"); }}>
              <option value="ALL">Semua Session</option>
              {sessionOptions.map((session) => <option key={session.id} value={session.id}>{session.name}</option>)}
            </select>
            <select className="rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold" value={productFilter} onChange={(e) => setProductFilter(e.target.value)}>
              <option value="ALL">Semua Produk</option>
              {productOptions.map((product) => <option key={product.id} value={product.id}>{product.name}{product.brand ? ` · ${product.brand}` : ""}</option>)}
            </select>
            <select className="rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold" value={serviceFilter} onChange={(e) => { setServiceFilter(e.target.value); setProductFilter("ALL"); }}>
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
                  <option value="REMOVE_STOCK">Kurangi Stock</option>
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
                {form.inventoryTarget === "PHYSICAL" ? "Sisa Fisik" : form.stockAction === "REMOVE_STOCK" ? "Jumlah Stock Keluar" : "Jumlah Stock Masuk"}
                <input type="number" min={form.inventoryTarget === "PHYSICAL" ? 0 : 1} step={1} className="rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold normal-case text-slate-900" placeholder={form.inventoryTarget === "PHYSICAL" ? "Harus sama dengan Sisa Sistem" : "Jumlah stok"} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </label>
              <div className="rounded-xl border bg-white px-3 py-2.5">
                <div className="text-xs font-black uppercase text-slate-500">Sisa Sistem Saat Ini</div>
                <div className="mt-1 text-lg font-black text-slate-900">{Number(editing.stock_system_remaining || 0)}</div>
              </div>
              <div className="rounded-xl border bg-white px-3 py-2.5">
                <div className="text-xs font-black uppercase text-slate-500">Sisa Setelah Simpan</div>
                <div className="mt-1 text-lg font-black text-emerald-700">{form.inventoryTarget === "PHYSICAL" ? Number(editing.stock_system_remaining || 0) : form.stockAction === "REMOVE_STOCK" ? Math.max(0, Number(editing.stock_system_remaining || 0) - Math.max(0, Number(form.quantity || 0))) : Number(editing.stock_system_remaining || 0) + Math.max(0, Number(form.quantity || 0))}</div>
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

        <section className="mt-6 overflow-hidden rounded-2xl border bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50 px-4 py-3">
            <div>
              <div className="font-black text-slate-900">Stok per Produk & Lot</div>
              <div className="text-xs text-slate-500">Stok Healthday dan Bazar ditampilkan sesuai layanan. Detail transaksi tersedia melalui Riwayat Stok.</div>
            </div>
            <div className="rounded-full border bg-white px-3 py-1 text-xs font-bold text-slate-600">{filteredRows.length} lot</div>
          </div>
          <div className="overflow-x-auto">
            <table data-inventory-canonical-table="1" className={`${serviceFilter === "ALL" ? "min-w-[1550px]" : "min-w-[1350px]"} w-full text-sm`}>
              <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                <tr>
                  <th className="w-[260px] p-3 text-left">Produk & Lot</th>
                  <th className="w-[180px] p-3 text-left">Harga</th>
                  <th className="w-[210px] p-3 text-left">Tujuan Stok</th>
                  {showHealthday ? <th className="w-[220px] p-3 text-left">Healthday</th> : null}
                  {showBazar ? <th className="w-[220px] p-3 text-left">Bazar</th> : null}
                  <th className="w-[90px] p-3 text-left">Jumlah Awal</th>
                  <th className="w-[90px] p-3 text-left">Tambahan Stok</th>
                  <th className="w-[90px] p-3 text-left">Terpakai</th>
                  <th className="w-[90px] p-3 text-left">Sisa Sistem</th>
                  <th className="w-[180px] p-3 text-left">Arus Stok</th>
                  <th className="w-[130px] p-3 text-left">Riwayat Stok</th>
                  <th className="w-[145px] p-3 text-left">Audit / Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredRows.map((row) => {
                  const target = stockTarget(row);
                  const allocations = (row?.service_allocations || [])
                    .filter((allocation: any) => serviceFilter === "ALL" || clean(allocation?.service_mode).toUpperCase() === serviceFilter)
                    .filter((allocation: any) => sessionFilter === "ALL" || String(allocation?.session_id || "") === sessionFilter);
                  const modeRows = (mode: "HEALTHDAY" | "BAZAR") => allocations.filter((allocation: any) => clean(allocation?.service_mode).toUpperCase() === mode);
                  const renderBucket = (mode: "HEALTHDAY" | "BAZAR") => {
                    const items = modeRows(mode);
                    const shell = mode === "BAZAR" ? "border-violet-200 bg-violet-50 text-violet-900" : "border-blue-200 bg-blue-50 text-blue-900";
                    if (!items.length) {
                      if (sessionFilter !== "ALL") {
                        const selected = sessionOptions.find((item) => item.id === sessionFilter);
                        return (
                          <div className={`rounded-xl border px-2.5 py-2 ${shell}`}>
                            <div className="truncate text-xs font-black">{selected?.name || "Session dipilih"}</div>
                            <div className="mt-1 grid gap-1 text-[10px] font-bold sm:grid-cols-3">
                              <span className="rounded-md bg-white/80 px-1.5 py-1 text-center">Alokasi 0</span>
                              <span className="rounded-md bg-white/80 px-1.5 py-1 text-center">Terpakai 0</span>
                              <span className="rounded-md bg-white/80 px-1.5 py-1 text-center">Sisa 0</span>
                            </div>
                          </div>
                        );
                      }
                      return <span className="text-xs font-semibold text-slate-400">-</span>;
                    }
                    return (
                      <div className="space-y-1.5">
                        {items.map((allocation: any) => (
                          <div key={`${allocation.id}-${mode}`} className={`rounded-xl border px-2.5 py-2 ${shell}`}>
                            <div className="truncate text-xs font-black" title={clean(allocation.location) || clean(allocation.session_name) || "Session"}>
                              {clean(allocation.location) || clean(allocation.session_name) || "Session"}
                            </div>
                            <div className="mt-1 grid gap-1 text-[10px] font-bold sm:grid-cols-3">
                              <span className="rounded-md bg-white/80 px-1.5 py-1 text-center">Alokasi {Number(allocation.allocated_qty || 0)}</span>
                              <span className="rounded-md bg-white/80 px-1.5 py-1 text-center">Terpakai {Number(allocation.used_qty || 0)}</span>
                              <span className="rounded-md bg-white/80 px-1.5 py-1 text-center">Sisa {Number(allocation.remaining_qty || 0)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  };
                  return (
                    <tr
                      key={row.id}
                      className="align-top hover:bg-slate-50/60"
                      data-inventory-vaccine-name={row.vaccine?.name || ""}
                      data-inventory-lot-number={row.lot_number || ""}
                    >
                      <td className="p-3">
                        <div className="font-black text-slate-900">{row.vaccine?.name || "-"}</div>
                        <div className="mt-1 text-xs text-slate-500">{row.vaccine?.brand || "-"}</div>
                        <div className="mt-2 inline-flex rounded-lg border bg-slate-50 px-2 py-1 text-xs font-black text-slate-700">Lot {row.lot_number || "-"}</div>

                      </td>
                      <td className="p-3">
                        <div className="space-y-1 text-xs">
                          <div className="flex items-center justify-between gap-2"><span className="text-slate-500">Non Paket</span><span className="font-black">{money(row.non_package_price)}</span></div>
                          <div className="flex items-center justify-between gap-2"><span className="text-slate-500">Paket</span><span className="font-black text-emerald-700">{money(row.package_price)}</span></div>
                          {row.package_dose_count ? <div className="rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">{row.package_dose_count} dosis / paket</div> : null}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="rounded-xl border bg-slate-50 px-3 py-2">
                          <div className="text-[10px] font-black uppercase text-slate-500">{target.scope}</div>
                          <div className="mt-1 truncate text-xs font-black text-slate-900" title={target.company}>{target.company}</div>
                          <div className="mt-1 truncate text-xs text-slate-600" title={target.session}>{target.session}</div>
                        </div>
                      </td>
                      {showHealthday ? <td className="p-3">{renderBucket("HEALTHDAY")}</td> : null}
                      {showBazar ? <td className="p-3">{renderBucket("BAZAR")}</td> : null}
                      <td className="p-3 text-center font-black">{row.stock_initial || 0}</td>
                      <td className="p-3 text-center font-bold">{row.stock_added || 0}</td>
                      <td className="p-3 text-center font-black">{row.stock_used || 0}</td>
                      <td className="p-3 text-center font-black text-emerald-700">{row.stock_system_remaining}</td>
                      <td className="p-3">
                        <div className="space-y-1 text-xs">
                          <div className="rounded-lg bg-emerald-50 px-2 py-1.5"><span className="font-black text-emerald-700">IN</span> <span data-inventory-in-v150="1" className="text-slate-600">-</span></div>
                          <div className="rounded-lg bg-rose-50 px-2 py-1.5"><span className="font-black text-rose-700">OUT</span> <span data-inventory-out-v150="1" className="text-slate-600">-</span></div>
                        </div>
                      </td>
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() => {
                            window.dispatchEvent(
                              new CustomEvent("vaccination-inventory-open-lot", {
                                detail: {
                                  lotId: Number(row.id || 0),
                                  lotIds: Array.isArray(row.source_lot_ids) ? row.source_lot_ids : [Number(row.id || 0)],
                                  lotNumber: row.lot_number || "",
                                  label: `${row.vaccine?.name || "Vaksin"} · Lot ${row.lot_number || "-"}`,
                                },
                              }),
                            );
                          }}
                          className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-left hover:bg-blue-100"
                          title="Klik untuk lihat detail transaksi lot"
                        >
                          <div className="text-xs font-black text-blue-700 underline underline-offset-2">{Number(row.movement_count || 0)} transaksi</div>
                          <div className="mt-1 max-w-[110px] truncate text-[10px] text-slate-500">{row.last_movement_type || "-"}</div>
                        </button>
                      </td>
                      <td className="p-3">
                        <div className="space-y-2">
                          <div className="text-xs"><span className="text-slate-500">Fisik:</span> <b>{row.stock_physical_count ?? "-"}</b></div>
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black ${diffClass(row.stock_difference)}`}>{row.stock_difference ?? "Belum audit"}</span>
                          <button onClick={() => startEdit(row)} className="block rounded-lg border px-3 py-1.5 text-xs font-bold hover:bg-slate-50">Edit</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!filteredRows.length ? <tr><td colSpan={serviceFilter === "ALL" ? 12 : 11} className="p-5 text-center text-slate-500">Belum ada data inventory sesuai filter.</td></tr> : null}
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
