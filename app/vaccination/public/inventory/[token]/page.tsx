"use client";

// V518_INVENTORY_INITIAL_STOCK_BUCKET_SYNC_PAYMENT_METHOD

import { useEffect, useMemo, useState } from "react";

function clean(value: any) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function money(value: any) {
  if (value === null || value === undefined || value === "") return "-";
  const n = Number(value);
  return Number.isFinite(n) ? `Rp ${new Intl.NumberFormat("id-ID").format(n)}` : "-";
}

function sessionLabel(value: any) {
  return clean(value?.location) || clean(value?.session_name) || (value?.id ? `Session ${value.id}` : "-");
}

function dateLabel(value: any) {
  const raw = clean(value);
  if (!raw) return "-";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString("id-ID");
}

export default function PublicVaccinationInventoryPage({ params }: { params: { token: string } }) {
  const token = clean(params?.token);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("ALL");
  const [sessionFilter, setSessionFilter] = useState("ALL");
  const [serviceFilter, setServiceFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [detail, setDetail] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [transferSessions, setTransferSessions] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [editForm, setEditForm] = useState({
    action: "ADD_STOCK",
    quantity: "",
    notes: "",
    sourceSessionId: "",
    sourceServiceMode: "HEALTHDAY",
    targetCompanyName: "",
    targetSessionId: "",
    targetServiceMode: "HEALTHDAY",
  });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ token, action: "snapshot" });
      const response = await fetch(`/api/vaccination/public-inventory?${query.toString()}`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.ok === false) throw new Error(json?.message || `HTTP ${response.status}`);
      setRows(Array.isArray(json?.rows) ? json.rows : []);
      setTransferSessions(Array.isArray(json?.transferSessions) ? json.transferSessions : []);
    } catch (e: any) {
      setRows([]);
      setTransferSessions([]);
      setError(String(e?.message || e || "Gagal memuat Portal Inventory."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token]);

  const companyOptions = useMemo(() => {
    const values = new Set<string>();
    for (const row of rows) {
      if (clean(row?.stock_company_name)) values.add(clean(row.stock_company_name));
      for (const allocation of row?.service_allocations || []) if (clean(allocation?.company_name)) values.add(clean(allocation.company_name));
    }
    for (const session of transferSessions) if (clean(session?.company_name)) values.add(clean(session.company_name));
    return Array.from(values).sort((a, b) => a.localeCompare(b, "id"));
  }, [rows, transferSessions]);

  const sessionOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      for (const allocation of row?.service_allocations || []) {
        const id = Number(allocation?.session_id || 0);
        const name = clean(allocation?.session_name) || sessionLabel(allocation?.session);
        if (id && name) map.set(String(id), name);
      }
      const id = Number(row?.stock_session_id || 0);
      if (id) map.set(String(id), sessionLabel(row?.stock_session));
    }
    for (const session of transferSessions) {
      const id = Number(session?.id || 0);
      const name = sessionLabel(session);
      if (id && name) map.set(String(id), name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "id"));
  }, [rows, transferSessions]);

  const filteredRows = useMemo(() => {
    const keyword = clean(search).toLowerCase();
    return rows.filter((row: any) => {
      const allocations = Array.isArray(row?.service_allocations) ? row.service_allocations : [];
      const haystack = [
        row?.vaccine?.name,
        row?.vaccine?.brand,
        row?.lot_number,
        row?.stock_company_name,
        row?.stock_session?.session_name,
        ...allocations.flatMap((item: any) => [item?.company_name, item?.session_name, item?.location, item?.service_mode]),
      ].filter(Boolean).join(" ").toLowerCase();
      if (keyword && !haystack.includes(keyword)) return false;
      if (companyFilter !== "ALL" && clean(row?.stock_company_name) !== companyFilter && !allocations.some((item: any) => clean(item?.company_name) === companyFilter)) return false;
      if (sessionFilter !== "ALL" && String(row?.stock_session_id || "") !== sessionFilter && !allocations.some((item: any) => String(item?.session_id || "") === sessionFilter)) return false;
      if (serviceFilter !== "ALL") {
        const hasRequestedBucket = allocations.some((item: any) => clean(item?.service_mode).toUpperCase() === serviceFilter);
        const exactSessionOwner = sessionFilter !== "ALL" && String(row?.stock_session_id || "") === sessionFilter;
        if (!hasRequestedBucket && !exactSessionOwner) return false;
      }
      return true;
    });
  }, [rows, search, companyFilter, sessionFilter, serviceFilter]);

  const summary = useMemo(() => filteredRows.reduce((acc: any, row: any) => {
    acc.initial += Number(row?.stock_initial || 0);
    acc.added += Number(row?.stock_added || 0);
    acc.used += Number(row?.stock_used || 0);
    acc.adjustmentOut += Number(row?.stock_adjustment_out || 0);
    acc.remaining += Number(row?.stock_system_remaining || 0);
    if (row?.stock_difference != null) acc.diff += Number(row.stock_difference || 0);
    return acc;
  }, { initial: 0, added: 0, used: 0, adjustmentOut: 0, remaining: 0, diff: 0 }), [filteredRows]);

  function reportParams(lotId?: number, action = "report") {
    const query = new URLSearchParams({ token, action });
    if (lotId) query.set("lot_id", String(lotId));
    if (dateFrom) query.set("from", dateFrom);
    if (dateTo) query.set("to", dateTo);
    if (companyFilter !== "ALL") query.set("company", companyFilter);
    if (serviceFilter !== "ALL") query.set("service_mode", serviceFilter);
    if (search.trim()) query.set("q", search.trim());
    if (sessionFilter !== "ALL") {
      const session = sessionOptions.find((item) => item.id === sessionFilter);
      if (session?.name) query.set("session", session.name);
    }
    return query;
  }

  async function openMovement(lotId?: number, label?: string) {
    setDetailLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/vaccination/public-inventory?${reportParams(lotId).toString()}`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.ok === false) throw new Error(json?.message || `HTTP ${response.status}`);
      setDetail({ ...json, label: label || (lotId ? `Lot ${lotId}` : "Semua Movement"), lotId: lotId || 0 });
    } catch (e: any) {
      setError(String(e?.message || e || "Gagal memuat Movement."));
    } finally {
      setDetailLoading(false);
    }
  }

  function exportFilter(lotId?: number) {
    window.location.href = `/api/vaccination/public-inventory?${reportParams(lotId, "export").toString()}`;
  }

  function allocationBucket(row: any, mode: "HEALTHDAY" | "BAZAR") {
    const allocations = (Array.isArray(row?.service_allocations) ? row.service_allocations : [])
      .filter((item: any) => clean(item?.service_mode).toUpperCase() === mode)
      .filter((item: any) => companyFilter === "ALL" || clean(item?.company_name) === companyFilter)
      .filter((item: any) => sessionFilter === "ALL" || String(item?.session_id || "") === sessionFilter);
    if (!allocations.length) {
      if (sessionFilter !== "ALL") {
        const selected = sessionOptions.find((item) => item.id === sessionFilter);
        return <div className={`rounded-xl border px-2.5 py-2 ${mode === "BAZAR" ? "border-violet-200 bg-violet-50" : "border-blue-200 bg-blue-50"}`}>
          <div className="truncate text-xs font-black">{selected?.name || "Session dipilih"}</div>
          <div className="mt-1 grid gap-1 text-[10px] font-bold sm:grid-cols-3">
            <span className="rounded-md bg-white/80 px-1.5 py-1 text-center">Alokasi 0</span>
            <span className="rounded-md bg-white/80 px-1.5 py-1 text-center">Terpakai 0</span>
            <span className="rounded-md bg-white/80 px-1.5 py-1 text-center">Sisa 0</span>
          </div>
        </div>;
      }
      return <span className="text-xs text-slate-400">-</span>;
    }
    return <div className="space-y-1.5">{allocations.map((item: any) => (
      <div key={`${mode}-${item.id}`} className={`rounded-xl border px-2.5 py-2 ${mode === "BAZAR" ? "border-violet-200 bg-violet-50" : "border-blue-200 bg-blue-50"}`}>
        <div className="truncate text-xs font-black" title={clean(item?.location) || clean(item?.session_name)}>{clean(item?.location) || clean(item?.session_name) || "Session"}</div>
        <div className="mt-1 grid gap-1 text-[10px] font-bold sm:grid-cols-3">
          <span className="rounded-md bg-white/80 px-1.5 py-1 text-center">Alokasi {Number(item?.allocated_qty || 0)}</span>
          <span className="rounded-md bg-white/80 px-1.5 py-1 text-center">Terpakai {Number(item?.used_qty || 0)}</span>
          <span className="rounded-md bg-white/80 px-1.5 py-1 text-center">Sisa {Number(item?.remaining_qty || 0)}</span>
        </div>
      </div>
    ))}</div>;
  }

  function startEdit(row: any) {
    const defaultCompany = clean(row?.stock_company_name) || clean(row?.service_allocations?.[0]?.company_name);
    setEditing(row);
    const fallbackSessionId = sessionFilter !== "ALL"
      ? sessionFilter
      : String(row?.stock_session_id || row?.service_allocations?.[0]?.session_id || "");
    const fallbackServiceMode = serviceFilter !== "ALL"
      ? serviceFilter
      : clean(row?.service_allocations?.[0]?.service_mode).toUpperCase() === "BAZAR"
        ? "BAZAR"
        : "HEALTHDAY";
    setEditForm({
      action: "ADD_STOCK",
      quantity: "",
      notes: "",
      sourceSessionId: fallbackSessionId,
      sourceServiceMode: fallbackServiceMode,
      targetCompanyName: defaultCompany,
      targetSessionId: "",
      targetServiceMode: "HEALTHDAY",
    });
    setError("");
    setMessage("");
  }

  const transferCompanyOptions = useMemo(() => {
    const values = new Set<string>();
    for (const session of transferSessions) if (clean(session?.company_name)) values.add(clean(session.company_name));
    return Array.from(values).sort((a, b) => a.localeCompare(b, "id"));
  }, [transferSessions]);

  const transferSessionOptions = useMemo(() => {
    if (!editing || !editForm.targetCompanyName) return [];
    return transferSessions
      .filter((session: any) => clean(session?.company_name) === editForm.targetCompanyName)
      .filter((session: any) => Number(session?.id || 0) !== Number(editing?.stock_session_id || 0))
      .sort((a: any, b: any) => sessionLabel(a).localeCompare(sessionLabel(b), "id"));
  }, [transferSessions, editing, editForm.targetCompanyName]);

  async function saveEdit() {
    if (!editing || saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const isTransfer = editForm.action === "TRANSFER_STOCK";
      const quantity = Math.max(0, Number(editForm.quantity || 0));
      if (!isTransfer && !quantity) throw new Error("Jumlah stok wajib lebih dari 0.");
      if (!isTransfer && !editForm.sourceSessionId) throw new Error("Pilih Session/Lokasi untuk transaksi stok.");
      if (isTransfer && (!editForm.targetCompanyName || !editForm.targetSessionId)) throw new Error("Perusahaan dan Session tujuan wajib dipilih.");

      const payload = isTransfer
        ? {
            token,
            action: "transfer-stock",
            lotId: Number(editing.id || 0),
            targetCompanyName: editForm.targetCompanyName,
            targetSessionId: Number(editForm.targetSessionId || 0),
            targetServiceMode: editForm.targetServiceMode,
          }
        : {
            token,
            action: "stock-transaction",
            lotId: Number(editing.id || 0),
            stockAction: editForm.action,
            quantity,
            inventoryNotes: editForm.notes,
            sessionId: Number(editForm.sourceSessionId || 0),
            serviceMode: editForm.sourceServiceMode,
          };

      const response = await fetch("/api/vaccination/public-inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.ok === false) throw new Error(json?.message || `HTTP ${response.status}`);
      setMessage(clean(json?.message) || "Inventory berhasil diupdate.");
      setEditing(null);
      await load();
    } catch (e: any) {
      setError(String(e?.message || e || "Gagal update Inventory."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-6">
      <section className="mx-auto max-w-[1800px] rounded-3xl border bg-white p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-wide text-blue-700">Portal Tim Inventory · Operational</div>
            <h1 className="mt-1 text-2xl font-black text-slate-900">Inventory Vaksin</h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">Bisa filter, Movement, export, serta Edit Stok: Tambah, Kurangi, dan Transfer.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void load()} className="rounded-xl border bg-white px-4 py-2.5 text-sm font-black">Refresh</button>
            <span className="rounded-xl bg-emerald-100 px-4 py-2.5 text-sm font-black text-emerald-800">OPERASIONAL</span>
          </div>
        </div>

        {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div> : null}
        {message ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</div> : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {[
            ["Jumlah Awal", summary.initial],
            ["Tambahan", summary.added],
            ["Terpakai Peserta", summary.used],
            ["Koreksi Keluar", summary.adjustmentOut],
            ["Sisa Sistem", summary.remaining],
            ["Selisih", summary.diff],
          ].map(([label, value]) => <div key={String(label)} className="rounded-2xl border bg-slate-50 p-4"><div className="text-[10px] font-black uppercase text-slate-500">{label}</div><div className="mt-1 text-2xl font-black">{value}</div></div>)}
        </div>

        <div className="mt-5 rounded-2xl border bg-slate-50 p-4">
          <div className="grid gap-3 xl:grid-cols-[minmax(260px,1fr)_220px_260px_180px_160px_160px_auto]">
            <input className="rounded-xl border bg-white px-3 py-2.5 text-sm" placeholder="Cari produk, lot, peserta, session..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold" value={companyFilter} onChange={(e) => { setCompanyFilter(e.target.value); setSessionFilter("ALL"); }}><option value="ALL">Semua Perusahaan</option>{companyOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select>
            <select className="rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold" value={sessionFilter} onChange={(e) => setSessionFilter(e.target.value)}><option value="ALL">Semua Session</option>{sessionOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <select className="rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold" value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)}><option value="ALL">Healthday + Bazar</option><option value="HEALTHDAY">Healthday</option><option value="BAZAR">Bazar</option></select>
            <input type="date" className="rounded-xl border bg-white px-3 py-2.5 text-sm" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <input type="date" className="rounded-xl border bg-white px-3 py-2.5 text-sm" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            <div className="flex gap-2"><button type="button" onClick={() => exportFilter()} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white">Export Filter</button><button type="button" onClick={() => void openMovement()} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white">Semua Movement</button></div>
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border bg-white">
          <div className="flex items-center justify-between border-b bg-slate-50 px-4 py-3"><div className="font-black">Inventory per Produk & Lot</div><div className="rounded-full border bg-white px-3 py-1 text-xs font-bold">{filteredRows.length} lot</div></div>
          <div className="overflow-x-auto">
            <table className="min-w-[1380px] w-full text-sm">
              <thead className="bg-slate-100 text-[10px] uppercase text-slate-600"><tr><th className="p-3 text-left">Produk & Lot</th><th className="p-3 text-left">Harga</th><th className="p-3 text-left">Healthday</th><th className="p-3 text-left">Bazar</th><th className="p-3">Awal</th><th className="p-3">Tambah</th><th className="p-3">Terpakai</th><th className="p-3">Sisa</th><th className="p-3 text-left">Movement</th><th className="p-3 text-left">Audit</th><th className="p-3 text-left">Aksi</th></tr></thead>
              <tbody className="divide-y">
                {filteredRows.map((row: any) => <tr key={row.id} className="align-top hover:bg-slate-50">
                  <td className="p-3"><div className="font-black">{row?.vaccine?.name || "-"}</div><div className="mt-1 text-xs text-slate-500">{row?.vaccine?.brand || "-"}</div><div className="mt-2 inline-flex rounded-lg border bg-slate-50 px-2 py-1 text-xs font-black">Lot {row?.lot_number || "-"}</div></td>
                  <td className="p-3 text-xs"><div>Non Paket <b>{money(row?.non_package_price)}</b></div><div className="mt-1">Paket <b className="text-emerald-700">{money(row?.package_price)}</b></div>{row?.package_dose_count ? <div className="mt-1 text-[10px] text-emerald-700">{row.package_dose_count} dosis/paket</div> : null}</td>
                  <td className="p-3">{allocationBucket(row, "HEALTHDAY")}</td><td className="p-3">{allocationBucket(row, "BAZAR")}</td>
                  <td className="p-3 text-center font-black">{Number(row?.stock_initial || 0)}</td><td className="p-3 text-center font-bold">{Number(row?.stock_added || 0)}</td><td className="p-3 text-center font-black">{Number(row?.stock_used || 0)}</td><td className="p-3 text-center font-black text-emerald-700">{Number(row?.stock_system_remaining || 0)}</td>
                  <td className="p-3"><button type="button" onClick={() => void openMovement(Number(row?.id || 0), `${row?.vaccine?.name || "Vaksin"} · Lot ${row?.lot_number || "-"}`)} className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-left"><div className="text-xs font-black text-blue-700 underline">{Number(row?.movement_count || 0)} transaksi</div><div className="mt-1 text-[10px] text-slate-500">Klik detail</div></button></td>
                  <td className="p-3 text-xs"><div>Fisik <b>{row?.stock_physical_count ?? "-"}</b></div><div className="mt-1">Selisih <b>{row?.stock_difference ?? "Belum audit"}</b></div></td>
                  <td className="p-3"><button type="button" onClick={() => startEdit(row)} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-800 hover:bg-amber-100">Edit Stok</button></td>
                </tr>)}
                {!loading && !filteredRows.length ? <tr><td colSpan={11} className="p-8 text-center text-slate-500">Tidak ada inventory sesuai filter.</td></tr> : null}
                {loading ? <tr><td colSpan={11} className="p-8 text-center text-slate-500">Memuat inventory...</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>


      {editing ? (
        <div className="fixed inset-0 z-[10020] flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) setEditing(null); }}>
          <div className="w-full max-w-3xl rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
              <div>
                <div className="text-xs font-black uppercase tracking-wide text-amber-700">Edit Stok · Portal Inventory</div>
                <div className="mt-1 text-xl font-black">{editing?.vaccine?.name || "Vaksin"} · Lot {editing?.lot_number || "-"}</div>
                <div className="mt-1 text-sm text-slate-500">Sisa sistem saat ini: <b>{Number(editing?.stock_system_remaining || 0)}</b></div>
              </div>
              <button type="button" disabled={saving} onClick={() => setEditing(null)} className="rounded-xl border px-4 py-2 text-sm font-black disabled:opacity-50">Tutup</button>
            </div>
            <div className="space-y-4 p-5">
              <label className="grid gap-1 text-xs font-black uppercase text-slate-500">
                Aksi
                <select className="rounded-xl border bg-white px-3 py-3 text-sm font-bold normal-case text-slate-900" value={editForm.action} onChange={(e) => setEditForm({ ...editForm, action: e.target.value, quantity: "", targetSessionId: "" })}>
                  <option value="SET_INITIAL_STOCK">Stok Awal</option>
                  <option value="ADD_STOCK">Tambah Stok</option>
                  <option value="REMOVE_STOCK">Kurangi Stok</option>
                  <option value="TRANSFER_STOCK">Transfer Stok</option>
                </select>
              </label>

              {editForm.action === "TRANSFER_STOCK" ? (
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="grid gap-1 text-xs font-black uppercase text-slate-500">
                    Perusahaan Tujuan
                    <select className="rounded-xl border bg-white px-3 py-3 text-sm font-bold normal-case text-slate-900" value={editForm.targetCompanyName} onChange={(e) => setEditForm({ ...editForm, targetCompanyName: e.target.value, targetSessionId: "" })}>
                      <option value="">Pilih perusahaan</option>
                      {transferCompanyOptions.map((company) => <option key={company} value={company}>{company}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-black uppercase text-slate-500">
                    Session / Lokasi Tujuan
                    <select className="rounded-xl border bg-white px-3 py-3 text-sm font-bold normal-case text-slate-900" value={editForm.targetSessionId} onChange={(e) => setEditForm({ ...editForm, targetSessionId: e.target.value })}>
                      <option value="">Pilih Session</option>
                      {transferSessionOptions.map((session: any) => <option key={session.id} value={session.id}>{sessionLabel(session)}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-black uppercase text-slate-500">
                    Jenis Stok Tujuan
                    <select className="rounded-xl border bg-white px-3 py-3 text-sm font-bold normal-case text-slate-900" value={editForm.targetServiceMode} onChange={(e) => setEditForm({ ...editForm, targetServiceMode: e.target.value })}>
                      <option value="HEALTHDAY">Healthday</option>
                      <option value="BAZAR">Bazar</option>
                    </select>
                  </label>
                  <div className="md:col-span-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">Transfer mengikuti rule Master: <b>seluruh sisa stok lot</b> dipindahkan ke Session dan bucket tujuan. Riwayat pemakaian lama tetap tersimpan.</div>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1 text-xs font-black uppercase text-slate-500">
                    Session / Lokasi
                    <select className="rounded-xl border bg-white px-3 py-3 text-sm font-bold normal-case text-slate-900" value={editForm.sourceSessionId} onChange={(e) => setEditForm({ ...editForm, sourceSessionId: e.target.value })}>
                      <option value="">Pilih Session</option>
                      {sessionOptions.map((session) => <option key={session.id} value={session.id}>{session.name}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-black uppercase text-slate-500">
                    Jenis Stok
                    <select className="rounded-xl border bg-white px-3 py-3 text-sm font-bold normal-case text-slate-900" value={editForm.sourceServiceMode} onChange={(e) => setEditForm({ ...editForm, sourceServiceMode: e.target.value })}>
                      <option value="HEALTHDAY">Healthday</option>
                      <option value="BAZAR">Bazar</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-black uppercase text-slate-500">
                    {editForm.action === "SET_INITIAL_STOCK" ? "Jumlah Stok Awal" : editForm.action === "REMOVE_STOCK" ? "Jumlah Stok Dikurangi" : "Jumlah Stok Ditambah"}
                    <input type="number" min={1} step={1} className="rounded-xl border bg-white px-3 py-3 text-sm font-bold normal-case text-slate-900" value={editForm.quantity} onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })} placeholder="Jumlah" />
                  </label>
                  <label className="grid gap-1 text-xs font-black uppercase text-slate-500">
                    Catatan
                    <input className="rounded-xl border bg-white px-3 py-3 text-sm font-semibold normal-case text-slate-900" value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Contoh: stock opname / retur vendor" />
                  </label>
                  {editForm.action === "SET_INITIAL_STOCK" ? <div className="md:col-span-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-800">Stok Awal hanya dapat diisi jika stok awal lot masih 0. Nilai masuk ke <b>Jumlah Awal</b>, bukan Tambahan Stok.</div> : null}
                  {editForm.action === "REMOVE_STOCK" ? <div className="md:col-span-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">Kurangi Stok dicatat sebagai koreksi keluar inventory, <b>bukan</b> sebagai pemakaian peserta.</div> : null}
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" disabled={saving} onClick={() => setEditing(null)} className="rounded-xl border px-4 py-3 text-sm font-black disabled:opacity-50">Batal</button>
                <button type="button" disabled={saving} onClick={() => void saveEdit()} className="rounded-xl bg-amber-600 px-5 py-3 text-sm font-black text-white hover:bg-amber-700 disabled:opacity-50">{saving ? "Menyimpan..." : editForm.action === "TRANSFER_STOCK" ? "Transfer Seluruh Sisa Stok" : "Simpan Perubahan"}</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {detail ? <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setDetail(null); }}><div className="max-h-[90vh] w-full max-w-7xl overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between gap-3 border-b px-5 py-4"><div><div className="text-lg font-black">{detail.label}</div><div className="text-xs text-slate-500">{detail?.details?.length || 0} baris · audit movement</div></div><div className="flex gap-2"><button type="button" onClick={() => exportFilter(detail?.lotId || undefined)} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white">Export Detail</button><button type="button" onClick={() => setDetail(null)} className="rounded-xl border px-4 py-2 text-sm font-black">Tutup</button></div></div>
        <div className="grid gap-3 border-b bg-slate-50 p-4 sm:grid-cols-5">{[["Peserta",detail?.summary?.participantRows || 0],["Healthday",detail?.summary?.healthday || 0],["Bazar",detail?.summary?.bazar || 0],["Paket",detail?.summary?.package || 0],["Non Paket",detail?.summary?.nonPackage || 0]].map(([label,value]) => <div key={String(label)} className="rounded-xl border bg-white p-3"><div className="text-[10px] font-black uppercase text-slate-500">{label}</div><div className="mt-1 text-2xl font-black">{value}</div></div>)}</div>
        <div className="max-h-[65vh] overflow-auto"><table className="min-w-[1550px] w-full text-left text-xs"><thead className="sticky top-0 bg-slate-100 text-[10px] uppercase"><tr><th className="p-3">Tanggal</th><th className="p-3">Transaksi</th><th className="p-3">Peserta</th><th className="p-3">Employee ID</th><th className="p-3">Vaksin/Lot</th><th className="p-3">Layanan</th><th className="p-3">Paket</th><th className="p-3">Harga</th><th className="p-3">Payment Method</th><th className="p-3">Session</th><th className="p-3">Perusahaan</th><th className="p-3">Qty</th><th className="p-3">Petugas</th><th className="p-3">Catatan</th></tr></thead><tbody className="divide-y">{(detail?.details || []).map((row: any, index: number) => <tr key={`${row?.record_id || row?.reference || index}-${index}`}><td className="p-3">{dateLabel(row?.date)}</td><td className="p-3 font-bold">{row?.movement_type || "-"}</td><td className="p-3 font-bold">{row?.participant || "-"}</td><td className="p-3">{row?.employee_id || "-"}</td><td className="p-3">{row?.vaccine || "-"}<div className="text-[10px] text-slate-500">Lot {row?.lot || "-"}</div></td><td className="p-3">{row?.service_mode || "-"}</td><td className="p-3">{row?.sale_mode || "-"}{row?.package_dose_count ? ` · ${row.package_dose_count} dosis` : ""}</td><td className="p-3">{money(row?.sales_price_snapshot)}</td><td className="p-3">{row?.payment_method || "-"}</td><td className="p-3">{row?.session || row?.location || "-"}</td><td className="p-3">{row?.company || "-"}</td><td className="p-3 font-black">{row?.qty ?? "-"}</td><td className="p-3">{row?.doctor || "-"}</td><td className="p-3">{row?.note || "-"}</td></tr>)}{!(detail?.details || []).length ? <tr><td colSpan={14} className="p-8 text-center text-slate-500">Belum ada detail sesuai filter.</td></tr> : null}</tbody></table></div></div></div> : null}
      {detailLoading ? <div className="fixed bottom-5 right-5 z-[10000] rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white shadow-xl">Memuat Movement...</div> : null}
    </main>
  );
}
