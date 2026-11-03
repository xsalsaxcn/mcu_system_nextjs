"use client";

import { useEffect, useMemo, useState } from "react";

function clean(value: any) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export default function VaccinationInventoryReturnPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [serviceMode, setServiceMode] = useState<"HEALTHDAY" | "BAZAR">("HEALTHDAY");
  const [search, setSearch] = useState("");
  const [returning, setReturning] = useState<any | null>(null);
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setError("");
    const json = await fetch("/api/vaccination/inventory-return", { cache: "no-store" }).then((r) => r.json());
    if (!json.ok) {
      setError(json.message || "Gagal memuat Portal Retur.");
      if (String(json.message || "").toLowerCase().includes("unauthorized")) window.location.href = "/vaccination/login";
      return;
    }
    setRows(Array.isArray(json.rows) ? json.rows : []);
    setSessions(Array.isArray(json.transferSessions) ? json.transferSessions : Array.isArray(json.sessions) ? json.sessions : []);
  }

  useEffect(() => { void load(); }, []);

  const sessionOptions = useMemo(
    () => sessions
      .filter((row: any) => clean(row.status).toUpperCase() !== "CANCELLED")
      .sort((a: any, b: any) => `${a.session_date || ""}${a.location || ""}`.localeCompare(`${b.session_date || ""}${b.location || ""}`)),
    [sessions],
  );

  const visibleRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return rows.filter((row: any) => {
      if (sessionId && Number(row.stock_session_id || 0) !== Number(sessionId)) return false;
      const allocations = Array.isArray(row.service_allocations) ? row.service_allocations : [];
      if (sessionId && !allocations.some((a: any) => Number(a.session_id || 0) === Number(sessionId) && clean(a.service_mode).toUpperCase() === serviceMode)) return false;
      const haystack = [row?.vaccine?.name, row?.vaccine?.brand, row?.lot_number, row?.stock_session?.location, row?.stock_session?.session_name].filter(Boolean).join(" ").toLowerCase();
      return !keyword || haystack.includes(keyword);
    });
  }, [rows, sessionId, serviceMode, search]);

  async function submitReturn() {
    if (!returning || !sessionId) return;
    const qty = Math.max(0, Number(quantity || 0));
    if (!qty) { setError("Jumlah retur wajib lebih dari 0."); return; }
    setSaving(true); setError(""); setMessage("");
    try {
      const json = await fetch("/api/vaccination/inventory-return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "return-stock",
          lotId: Number(returning.id || 0),
          sessionId: Number(sessionId),
          serviceMode,
          quantity: qty,
          note,
        }),
      }).then((r) => r.json());
      if (!json.ok) { setError(json.message || "Retur gagal."); return; }
      setMessage(json.message || "Retur berhasil.");
      setReturning(null); setQuantity(""); setNote("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        <section className="rounded-3xl bg-gradient-to-br from-blue-950 via-blue-800 to-emerald-600 p-6 text-white shadow-lg">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-100">Portal Inventory · AIA</div>
              <h1 className="mt-1 text-2xl font-black">Retur Inventory</h1>
              <p className="mt-1 text-sm text-blue-100">Akun ini hanya dapat melakukan Retur stok ke Session/Lokasi yang dipilih.</p>
            </div>
            <div className="flex gap-2">
              <a href="/vaccination/portal" className="rounded-xl bg-white px-4 py-2.5 text-sm font-black text-blue-900">Kembali</a>
              <button type="button" onClick={() => void load()} className="rounded-xl bg-white/15 px-4 py-2.5 text-sm font-black">Refresh</button>
            </div>
          </div>
        </section>

        {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
        {message ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</div> : null}

        <section className="mt-5 rounded-3xl border bg-white p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-4">
            <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} className="rounded-xl border px-3 py-3 text-sm font-semibold">
              <option value="">Pilih Session / Lokasi</option>
              {sessionOptions.map((session: any) => (
                <option key={session.id} value={session.id}>{session.session_date || "-"} · {session.location || session.session_name} · {session.company_name || "-"}</option>
              ))}
            </select>
            <select value={serviceMode} onChange={(e) => setServiceMode(e.target.value === "BAZAR" ? "BAZAR" : "HEALTHDAY")} className="rounded-xl border px-3 py-3 text-sm font-semibold">
              <option value="HEALTHDAY">Healthday</option>
              <option value="BAZAR">Bazar</option>
            </select>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari produk / lot..." className="rounded-xl border px-3 py-3 text-sm" />
            <div className="rounded-xl border bg-slate-50 px-3 py-3 text-sm font-bold text-slate-600">{visibleRows.length} lot</div>
          </div>
        </section>

        <section className="mt-5 overflow-hidden rounded-3xl border bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                <tr><th className="p-3 text-left">Produk</th><th className="p-3 text-left">Lot</th><th className="p-3 text-left">Lokasi</th><th className="p-3 text-center">Awal</th><th className="p-3 text-center">Tambahan</th><th className="p-3 text-center">Terpakai</th><th className="p-3 text-center">Sisa</th><th className="p-3 text-left">Aksi</th></tr>
              </thead>
              <tbody className="divide-y">
                {visibleRows.map((row: any) => (
                  <tr key={row.id}>
                    <td className="p-3 font-black">{row?.vaccine?.name || "-"}</td>
                    <td className="p-3">{row.lot_number || "-"}</td>
                    <td className="p-3">{row?.stock_session?.location || row?.stock_session?.session_name || "-"}</td>
                    <td className="p-3 text-center">{Number(row.stock_initial || 0)}</td>
                    <td className="p-3 text-center">{Number(row.stock_added || 0)}</td>
                    <td className="p-3 text-center">{Number(row.stock_used || 0)}</td>
                    <td className="p-3 text-center font-black text-emerald-700">{Number(row.stock_system_remaining || 0)}</td>
                    <td className="p-3"><button disabled={!sessionId} onClick={() => { setReturning(row); setQuantity(""); setNote(""); setError(""); }} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-40">Retur</button></td>
                  </tr>
                ))}
                {!visibleRows.length ? <tr><td colSpan={8} className="p-8 text-center text-slate-500">Pilih Session/Lokasi untuk melihat stok yang dapat diretur.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {returning ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) setReturning(null); }}>
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <div className="text-xs font-black uppercase text-emerald-700">Retur Stock</div>
            <div className="mt-1 text-xl font-black">{returning?.vaccine?.name || "Produk"} · Lot {returning?.lot_number || "-"}</div>
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1 text-xs font-black uppercase text-slate-500">Jumlah Retur<input type="number" min={1} step={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} className="rounded-xl border px-3 py-3 text-sm font-semibold normal-case text-slate-900" /></label>
              <label className="grid gap-1 text-xs font-black uppercase text-slate-500">Keterangan<textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="rounded-xl border px-3 py-3 text-sm font-semibold normal-case text-slate-900" placeholder="Contoh: sisa vaksin dikembalikan AIA" /></label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button disabled={saving} onClick={() => setReturning(null)} className="rounded-xl border px-4 py-2.5 text-sm font-black">Batal</button>
              <button disabled={saving} onClick={() => void submitReturn()} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-black text-white disabled:opacity-50">{saving ? "Menyimpan..." : "Simpan Retur"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
