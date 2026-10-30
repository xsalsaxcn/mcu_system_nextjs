"use client";

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

  async function load() {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ token, action: "snapshot" });
      const response = await fetch(`/api/vaccination/public-inventory?${query.toString()}`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.ok === false) throw new Error(json?.message || `HTTP ${response.status}`);
      setRows(Array.isArray(json?.rows) ? json.rows : []);
    } catch (e: any) {
      setRows([]);
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
    return Array.from(values).sort((a, b) => a.localeCompare(b, "id"));
  }, [rows]);

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
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "id"));
  }, [rows]);

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
      if (serviceFilter !== "ALL" && !allocations.some((item: any) => clean(item?.service_mode).toUpperCase() === serviceFilter)) return false;
      return true;
    });
  }, [rows, search, companyFilter, sessionFilter, serviceFilter]);

  const summary = useMemo(() => filteredRows.reduce((acc: any, row: any) => {
    acc.initial += Number(row?.stock_initial || 0);
    acc.added += Number(row?.stock_added || 0);
    acc.used += Number(row?.stock_used || 0);
    acc.remaining += Number(row?.stock_system_remaining || 0);
    if (row?.stock_difference != null) acc.diff += Number(row.stock_difference || 0);
    return acc;
  }, { initial: 0, added: 0, used: 0, remaining: 0, diff: 0 }), [filteredRows]);

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
    if (!allocations.length) return <span className="text-xs text-slate-400">-</span>;
    return <div className="space-y-1.5">{allocations.map((item: any) => (
      <div key={`${mode}-${item.id}`} className={`rounded-xl border px-2.5 py-2 ${mode === "BAZAR" ? "border-violet-200 bg-violet-50" : "border-blue-200 bg-blue-50"}`}>
        <div className="truncate text-xs font-black" title={clean(item?.location) || clean(item?.session_name)}>{clean(item?.location) || clean(item?.session_name) || "Session"}</div>
        <div className="mt-1 grid grid-cols-3 gap-1 text-center text-[10px] font-bold">
          <span className="rounded-md bg-white/80 px-1 py-1">A {Number(item?.allocated_qty || 0)}</span>
          <span className="rounded-md bg-white/80 px-1 py-1">P {Number(item?.used_qty || 0)}</span>
          <span className="rounded-md bg-white/80 px-1 py-1">S {Number(item?.remaining_qty || 0)}</span>
        </div>
      </div>
    ))}</div>;
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-6">
      <section className="mx-auto max-w-[1800px] rounded-3xl border bg-white p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-wide text-blue-700">Portal Tim Inventory · Read Only</div>
            <h1 className="mt-1 text-2xl font-black text-slate-900">Inventory Vaksin</h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">Bisa filter, buka Movement, dan export. Portal ini tidak memiliki aksi Edit.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void load()} className="rounded-xl border bg-white px-4 py-2.5 text-sm font-black">Refresh</button>
            <span className="rounded-xl bg-emerald-100 px-4 py-2.5 text-sm font-black text-emerald-800">READ ONLY</span>
          </div>
        </div>

        {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div> : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ["Jumlah Awal", summary.initial],
            ["Tambahan", summary.added],
            ["Terpakai", summary.used],
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
              <thead className="bg-slate-100 text-[10px] uppercase text-slate-600"><tr><th className="p-3 text-left">Produk & Lot</th><th className="p-3 text-left">Harga</th><th className="p-3 text-left">Healthday</th><th className="p-3 text-left">Bazar</th><th className="p-3">Awal</th><th className="p-3">Tambah</th><th className="p-3">Terpakai</th><th className="p-3">Sisa</th><th className="p-3 text-left">Movement</th><th className="p-3 text-left">Audit</th></tr></thead>
              <tbody className="divide-y">
                {filteredRows.map((row: any) => <tr key={row.id} className="align-top hover:bg-slate-50">
                  <td className="p-3"><div className="font-black">{row?.vaccine?.name || "-"}</div><div className="mt-1 text-xs text-slate-500">{row?.vaccine?.brand || "-"}</div><div className="mt-2 inline-flex rounded-lg border bg-slate-50 px-2 py-1 text-xs font-black">Lot {row?.lot_number || "-"}</div></td>
                  <td className="p-3 text-xs"><div>Non Paket <b>{money(row?.non_package_price)}</b></div><div className="mt-1">Paket <b className="text-emerald-700">{money(row?.package_price)}</b></div>{row?.package_dose_count ? <div className="mt-1 text-[10px] text-emerald-700">{row.package_dose_count} dosis/paket</div> : null}</td>
                  <td className="p-3">{allocationBucket(row, "HEALTHDAY")}</td><td className="p-3">{allocationBucket(row, "BAZAR")}</td>
                  <td className="p-3 text-center font-black">{Number(row?.stock_initial || 0)}</td><td className="p-3 text-center font-bold">{Number(row?.stock_added || 0)}</td><td className="p-3 text-center font-black">{Number(row?.stock_used || 0)}</td><td className="p-3 text-center font-black text-emerald-700">{Number(row?.stock_system_remaining || 0)}</td>
                  <td className="p-3"><button type="button" onClick={() => void openMovement(Number(row?.id || 0), `${row?.vaccine?.name || "Vaksin"} · Lot ${row?.lot_number || "-"}`)} className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-left"><div className="text-xs font-black text-blue-700 underline">{Number(row?.movement_count || 0)} transaksi</div><div className="mt-1 text-[10px] text-slate-500">Klik detail</div></button></td>
                  <td className="p-3 text-xs"><div>Fisik <b>{row?.stock_physical_count ?? "-"}</b></div><div className="mt-1">Selisih <b>{row?.stock_difference ?? "Belum audit"}</b></div></td>
                </tr>)}
                {!loading && !filteredRows.length ? <tr><td colSpan={10} className="p-8 text-center text-slate-500">Tidak ada inventory sesuai filter.</td></tr> : null}
                {loading ? <tr><td colSpan={10} className="p-8 text-center text-slate-500">Memuat inventory...</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {detail ? <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setDetail(null); }}><div className="max-h-[90vh] w-full max-w-7xl overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between gap-3 border-b px-5 py-4"><div><div className="text-lg font-black">{detail.label}</div><div className="text-xs text-slate-500">{detail?.details?.length || 0} baris · read-only</div></div><div className="flex gap-2"><button type="button" onClick={() => exportFilter(detail?.lotId || undefined)} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white">Export Detail</button><button type="button" onClick={() => setDetail(null)} className="rounded-xl border px-4 py-2 text-sm font-black">Tutup</button></div></div>
        <div className="grid gap-3 border-b bg-slate-50 p-4 sm:grid-cols-5">{[["Peserta",detail?.summary?.participantRows || 0],["Healthday",detail?.summary?.healthday || 0],["Bazar",detail?.summary?.bazar || 0],["Paket",detail?.summary?.package || 0],["Non Paket",detail?.summary?.nonPackage || 0]].map(([label,value]) => <div key={String(label)} className="rounded-xl border bg-white p-3"><div className="text-[10px] font-black uppercase text-slate-500">{label}</div><div className="mt-1 text-2xl font-black">{value}</div></div>)}</div>
        <div className="max-h-[65vh] overflow-auto"><table className="min-w-[1550px] w-full text-left text-xs"><thead className="sticky top-0 bg-slate-100 text-[10px] uppercase"><tr><th className="p-3">Tanggal</th><th className="p-3">Transaksi</th><th className="p-3">Peserta</th><th className="p-3">Employee ID</th><th className="p-3">Vaksin/Lot</th><th className="p-3">Layanan</th><th className="p-3">Paket</th><th className="p-3">Harga</th><th className="p-3">Session</th><th className="p-3">Perusahaan</th><th className="p-3">Qty</th><th className="p-3">Petugas</th><th className="p-3">Catatan</th></tr></thead><tbody className="divide-y">{(detail?.details || []).map((row: any, index: number) => <tr key={`${row?.record_id || row?.reference || index}-${index}`}><td className="p-3">{dateLabel(row?.date)}</td><td className="p-3 font-bold">{row?.movement_type || "-"}</td><td className="p-3 font-bold">{row?.participant || "-"}</td><td className="p-3">{row?.employee_id || "-"}</td><td className="p-3">{row?.vaccine || "-"}<div className="text-[10px] text-slate-500">Lot {row?.lot || "-"}</div></td><td className="p-3">{row?.service_mode || "-"}</td><td className="p-3">{row?.sale_mode || "-"}{row?.package_dose_count ? ` · ${row.package_dose_count} dosis` : ""}</td><td className="p-3">{money(row?.sales_price_snapshot)}</td><td className="p-3">{row?.session || row?.location || "-"}</td><td className="p-3">{row?.company || "-"}</td><td className="p-3 font-black">{row?.qty ?? "-"}</td><td className="p-3">{row?.doctor || "-"}</td><td className="p-3">{row?.note || "-"}</td></tr>)}{!(detail?.details || []).length ? <tr><td colSpan={13} className="p-8 text-center text-slate-500">Belum ada detail sesuai filter.</td></tr> : null}</tbody></table></div></div></div> : null}
      {detailLoading ? <div className="fixed bottom-5 right-5 z-[10000] rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white shadow-xl">Memuat Movement...</div> : null}
    </main>
  );
}
