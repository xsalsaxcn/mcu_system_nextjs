"use client";

// V520_SERVICE_SPECIFIC_QUEUE_MODE
// V518_RECORD_ONLY_VALIDATION_WORKFLOW
// V148_VALIDATION_DETAIL_AND_STICKER_PRINT
// V148_5_LOCATION_DATE_SEARCH_AND_EXACT_ADMINISTERED_LABEL
// V148_6_RECOVER_PRINT_AND_SESSION_LOCATIONS

import { useEffect, useMemo, useState } from "react";

type ProductDetail = {
  record_id?: number | null;
  vaccine_name?: string;
  lot_number?: string;
  dose_number?: number;
  administered_at?: string | null;
  administered_by?: string;
  note?: string;
  status?: string;
};

type Row = {
  id: number;
  session_id?: number | string;
  queue_number?: string;
  employee_id?: string;
  payment_method?: string;
  company_name?: string;
  internal_queue_enabled?: boolean;
  patient_name?: string;
  doctor_name?: string;
  product_name?: string;
  lot_number?: string;
  note?: string;
  print_status?: string;
  validation_status?: string;
  validation_service_mode?: string;
  validated_at?: string | null;
  validated_by?: string;
  queue_status?: string;
  location?: string;
  session_date?: string | null;
  session_name?: string;
  products?: ProductDetail[];
  record_ids?: number[];
  raw?: any;
};

type SessionOption = {
  session_id: number;
  session_name: string;
  company_name?: string;
  location?: string;
  session_date?: string | null;
  existing_flow_config?: { registration?: boolean; queue?: boolean; queue_healthday?: boolean; queue_bazar?: boolean; doctor?: boolean } | null;
  status?: string;
};

function clean(value: any) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function fmtDate(value: any) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return clean(value);
  return date.toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" });
}

function dateKey(value: any) {
  const raw = clean(value);
  if (!raw) return "";
  const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function recordIds(row: Row) {
  const fromRow = Array.isArray(row.record_ids) ? row.record_ids : [];
  const fromProducts = Array.isArray(row.products)
    ? row.products.map((item) => Number(item.record_id)).filter((id) => Number.isFinite(id) && id > 0)
    : [];
  return Array.from(new Set([...fromRow, ...fromProducts].map(Number).filter((id) => Number.isFinite(id) && id > 0)));
}


function csvCell(value: any) {
  const text = String(value ?? "").replace(/\r?\n/g, " ").trim();
  return `"${text.replace(/"/g, '""')}"`;
}

function exportValidationRows(rows: Row[], label: string) {
  if (!rows.length) return false;
  const header = [
    "Status", "No. Antrean Vendor", "Nama Peserta", "NIK Karyawan / BINUSIAN ID",
    "Perusahaan", "Session", "Lokasi", "Tanggal Session", "Layanan", "Produk / Lot",
    "Payment Method", "Petugas Validasi", "Waktu Selesai", "Catatan",
  ];
  const body = rows.map((row) => {
    const products = (row.products || [])
      .map((item) => `${clean(item.vaccine_name) || "Vaksin"} / Lot ${clean(item.lot_number) || "-"}`)
      .join(" | ");
    return [
      clean(row.validation_status || row.queue_status || "PENDING"),
      clean(row.queue_number), clean(row.patient_name), clean(row.employee_id),
      clean(row.company_name), clean(row.session_name), clean(row.location), dateKey(row.session_date),
      clean(row.validation_service_mode), products || clean(row.product_name), clean(row.payment_method),
      clean(row.validated_by), fmtDate(row.validated_at), clean(row.note),
    ].map(csvCell).join(",");
  });
  const csv = `\uFEFF${[header.map(csvCell).join(","), ...body].join("\r\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `validasi-vaksin-${label}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
}

function stickerUrlFor(row: Row) {
  const ids = recordIds(row);
  if (!ids.length) return "";
  return ids.length === 1
    ? `/vaccination/sticker/${ids[0]}`
    : `/vaccination/sticker/bulk?ids=${encodeURIComponent(ids.join(","))}`;
}

export default function VaccinationValidationPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [sessionLocations, setSessionLocations] = useState<string[]>([]);
  const [sessionOptions, setSessionOptions] = useState<SessionOption[]>([]);
  const [companyFilter, setCompanyFilter] = useState("all");
  const [sessionFilter, setSessionFilter] = useState("all");
  const [contextLocked, setContextLocked] = useState(false);
  const [cancelRowId, setCancelRowId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [actor, setActor] = useState("Tim Validasi");
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});

  async function loadRows() {
    setLoading(true);
    setMessage("Memuat data validasi...");
    try {
      const params = new URLSearchParams();
      if (sessionFilter !== "all") params.set("session_id", sessionFilter);
      const res = await fetch(`/api/vaccination/validation${params.toString() ? `?${params.toString()}` : ""}`, { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || "Gagal memuat validasi.");
      setRows(json.rows || []);
      setSessionOptions(Array.isArray(json.sessions) ? json.sessions : []);
      setSessionLocations(
        Array.from(
          new Set(
            (Array.isArray(json.session_locations) ? json.session_locations : [])
              .map((session: any) => clean(session?.location))
              .filter((location: string) => location && location !== "-")
          )
        ) as string[]
      );
      setMessage(`Data validasi dimuat: ${(json.rows || []).length} peserta.`);
    } catch (error: any) {
      setMessage(error?.message || "Gagal memuat validasi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRows();
  }, [sessionFilter]);

  const companyOptions = useMemo<string[]>(() =>
    Array.from(
      new Set<string>(
        sessionOptions.map((item) => clean(item.company_name)).filter((value): value is string => Boolean(value)),
      ),
    ).sort((a, b) => a.localeCompare(b, "id")),
  [sessionOptions]);

  const visibleSessionOptions = useMemo(() =>
    sessionOptions
      .filter((item) => companyFilter === "all" || clean(item.company_name) === companyFilter)
      .sort((a, b) => `${b.session_date || ""}${b.session_id}`.localeCompare(`${a.session_date || ""}${a.session_id}`)),
  [companyFilter, sessionOptions]);

  const selectedSession = useMemo(() =>
    sessionOptions.find((item) => String(item.session_id) === String(sessionFilter)) || null,
  [sessionFilter, sessionOptions]);
  const selectedFlow = selectedSession?.existing_flow_config || null;
  const selectedLegacyQueue = selectedFlow?.queue !== false;
  const selectedHealthdayQueue = selectedFlow?.queue_healthday === undefined
    ? selectedLegacyQueue
    : selectedFlow?.queue_healthday !== false;
  const selectedBazarQueue = selectedFlow?.queue_bazar === undefined
    ? selectedLegacyQueue
    : selectedFlow?.queue_bazar !== false;
  const recordOnlyMode = Boolean(selectedSession) && (!selectedHealthdayQueue || !selectedBazarQueue);

  const locations = useMemo(() => {
    return Array.from(
      new Set([
        ...sessionLocations,
        ...rows.map((row) => clean(row.location)).filter((value) => value && value !== "-"),
      ])
    ).sort((a, b) => a.localeCompare(b));
  }, [rows, sessionLocations]);

  const shown = useMemo(() => {
    const keyword = filter.toLowerCase().trim();

    return rows.filter((row) => {
      const productText = (row.products || [])
        .map((item) => [item.vaccine_name, item.lot_number, item.dose_number, item.administered_by].filter(Boolean).join(" "))
        .join(" ");
      const haystack = [
        row.patient_name,
        row.doctor_name,
        row.queue_number,
        row.employee_id,
        row.payment_method,
        row.company_name,
        row.product_name,
        row.lot_number,
        row.note,
        row.print_status,
        row.validation_status,
        row.location,
        row.session_name,
        productText,
      ].map((value) => clean(value).toLowerCase()).join(" ");

      const companyOk = companyFilter === "all" || clean(row.company_name) === companyFilter;
      const sessionOk = sessionFilter === "all" || String(row.session_id || "") === sessionFilter;
      const locationOk = locationFilter === "all" || clean(row.location) === locationFilter;
      const effectiveDate = dateKey(row.session_date || row.products?.[0]?.administered_at);
      const fromOk = !dateFrom || (effectiveDate && effectiveDate >= dateFrom);
      const toOk = !dateTo || (effectiveDate && effectiveDate <= dateTo);
      const searchOk = !keyword || haystack.includes(keyword);

      return companyOk && sessionOk && locationOk && fromOk && toOk && searchOk;
    });
  }, [companyFilter, dateFrom, dateTo, filter, locationFilter, rows, sessionFilter]);

  const pendingShown = useMemo(() => shown.filter((row) => clean(row.validation_status).toUpperCase() !== "DONE"), [shown]);
  const doneShown = useMemo(() => shown.filter((row) => clean(row.validation_status).toUpperCase() === "DONE"), [shown]);

  function runExport(targetRows: Row[], label: string) {
    if (!exportValidationRows(targetRows, label)) setMessage("Tidak ada data sesuai filter untuk diekspor.");
  }

  async function update(row: Row, action: string, note?: string) {
    setMessage("Mengubah status...");
    try {
      const res = await fetch("/api/vaccination/validation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ id: row.id, action, actor, note }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.message || "Gagal update status.");
      await loadRows();
    } catch (error: any) {
      setMessage(error?.message || "Gagal update status.");
    }
  }

  async function handlePrint(row: Row) {
    // Popup dibuka sinkron dari click agar Chrome tidak memblokir setelah request async.
    const printWindow = window.open("about:blank", "_blank", "width=520,height=720");
    if (!printWindow) {
      setMessage("Popup print diblokir browser. Izinkan popup lalu coba lagi.");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(
      "<!doctype html><html><head><meta charset='utf-8'><title>Menyiapkan Label</title></head><body style='font-family:Arial,sans-serif;padding:18px'><b>Menyiapkan label vaksin...</b></body></html>"
    );
    printWindow.document.close();

    try {
      let ids = recordIds(row);
      let url = stickerUrlFor(row);

      // Legacy/test data bisa sudah PENDING_VALIDATION tetapi belum punya vaccination_records.
      // Buat record label dari registration_items TANPA mengurangi stok lagi.
      if (!url) {
        setMessage(`Membuat record label untuk ${row.patient_name || "peserta"}...`);
        const res = await fetch("/api/vaccination/validation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ id: row.id, action: "ENSURE_LABEL_RECORDS", actor }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.message || "Gagal menyiapkan record label.");

        ids = Array.isArray(json.record_ids)
          ? json.record_ids.map(Number).filter((id: number) => Number.isFinite(id) && id > 0)
          : [];
        url = clean(json.stickerUrl);

        if (!url && ids.length) {
          url = ids.length === 1
            ? `/vaccination/sticker/${ids[0]}`
            : `/vaccination/sticker/bulk?ids=${encodeURIComponent(ids.join(","))}`;
        }
      }

      if (!url) throw new Error("URL sticker belum tersedia setelah record label disiapkan.");

      // Hasil akhir tetap route Sticker V146 yang SAMA dengan Administered.
      printWindow.location.replace(url);
      printWindow.focus();
      setMessage(`${ids.length || recordIds(row).length} label dibuka dengan layout Administered.`);
      await update(row, "PRINTED");
    } catch (error: any) {
      if (!printWindow.closed) printWindow.close();
      setMessage(error?.message || "Gagal menyiapkan label vaksin.");
    }
  }

  async function saveStatus(row: Row) {
    const status = draft[row.id] || "";
    if (!status) {
      setMessage("Pilih status dulu: Selesai atau Batal.");
      return;
    }
    if (status === "BATAL" && !clean(notes[row.id])) {
      setMessage("Note wajib diisi jika status Batal.");
      return;
    }
    await update(row, status, notes[row.id]);
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      <section className="mx-auto max-w-7xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950">Tim Validasi</h1>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              {recordOnlyMode
                ? "Validasi peserta yang menggunakan nomor antrean vendor. Perbarui status peserta melalui aksi yang tersedia."
                : "Peserta yang sudah selesai tindakan dokter dan menunggu print label/final validasi."}
            </p>
          </div>
          <a href="/vaccination" className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-800">☰ Menu Vaksinasi</a>
        </div>

        <div className="mt-6 rounded-2xl border border-cyan-100 bg-cyan-50/50 p-4">
          <div className="grid gap-3 lg:grid-cols-[220px_minmax(280px,1fr)_auto]">
            <select
              className="rounded-xl border bg-white px-3 py-3 text-sm font-black"
              value={companyFilter}
              disabled={contextLocked}
              onChange={(e) => { setCompanyFilter(e.target.value); setSessionFilter("all"); }}
            >
              <option value="all">Semua Perusahaan</option>
              {companyOptions.map((company) => <option key={company} value={company}>{company}</option>)}
            </select>
            <select
              className="rounded-xl border bg-white px-3 py-3 text-sm font-black"
              value={sessionFilter}
              disabled={contextLocked}
              onChange={(e) => setSessionFilter(e.target.value)}
            >
              <option value="all">Semua Session</option>
              {visibleSessionOptions.map((session) => (
                <option key={session.session_id} value={session.session_id}>
                  {session.session_name}{session.location ? ` · ${session.location}` : ""}{session.session_date ? ` · ${session.session_date}` : ""}
                </option>
              ))}
            </select>
            <label className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-black ${contextLocked ? "border-amber-200 bg-amber-50 text-amber-800" : "bg-white text-slate-700"}`}>
              <input type="checkbox" checked={contextLocked} onChange={(e) => setContextLocked(e.target.checked)} />
              Kunci Pilihan
            </label>
          </div>
          <div className="mt-2 text-xs font-bold text-slate-600">
            {selectedSession
              ? `${recordOnlyMode ? "Pencatatan / Antrean Vendor" : "Antrean Internal"} · ${selectedSession.session_name}`
              : "Pilih Session untuk mengunci meja validasi pada satu event."}
          </div>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-6">
          <input className="rounded-2xl border border-slate-200 px-4 py-3 font-bold outline-none lg:col-span-2" placeholder="Cari pasien / dokter / produk / lot / lokasi" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <select className="rounded-2xl border border-slate-200 px-4 py-3 font-bold outline-none" value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}>
            <option value="all">Semua Lokasi</option>
            {locations.map((location) => <option key={location} value={location}>{location}</option>)}
          </select>
          <input type="date" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold outline-none" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="Tanggal mulai" />
          <input type="date" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold outline-none" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="Tanggal akhir" />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={loadRows} className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white">{loading ? "Memuat..." : "Refresh"}</button>
            <button type="button" onClick={() => runExport(shown, "filter")} className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">Export Filter</button>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
          <input className="rounded-2xl border border-slate-200 px-4 py-3 font-bold outline-none" placeholder="Nama petugas validasi" value={actor} onChange={(e) => setActor(e.target.value)} />
          <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-700">
            Menunggu {pendingShown.length} · Selesai {doneShown.length} · Total {shown.length}
          </div>
        </div>

        {message ? <div className="mt-4 rounded-2xl bg-blue-50 p-4 text-sm font-bold text-blue-700">{message}</div> : null}
      </section>

      {recordOnlyMode ? (
        <>
        <section className="mx-auto mt-6 max-w-7xl overflow-hidden rounded-[28px] border border-cyan-100 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b bg-cyan-50 px-5 py-4">
            <div>
              <div className="font-black text-slate-900">Menunggu Validasi</div>
              <div className="mt-1 text-xs font-semibold text-slate-500">Peserta yang masih membutuhkan tindakan dari Tim Validasi.</div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => runExport(pendingShown, "menunggu")} className="rounded-xl border border-cyan-200 bg-white px-3 py-2 text-xs font-black text-cyan-700">Export Menunggu</button>
              <div className="rounded-full border bg-white px-3 py-1 text-xs font-black text-cyan-700">{pendingShown.length} peserta</div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">No. Antrean Vendor</th>
                  <th className="px-4 py-3">Peserta</th>
                  <th className="px-4 py-3">NIK Karyawan / BINUSIAN ID</th>
                  <th className="px-4 py-3">Layanan / Produk</th>
                  <th className="px-4 py-3">Payment Method</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pendingShown.map((row) => (
                  <tr key={row.id} className="align-top hover:bg-slate-50">
                    <td className="px-4 py-4"><span className="rounded-xl bg-cyan-50 px-3 py-2 font-black text-cyan-800">{row.queue_number || "-"}</span></td>
                    <td className="px-4 py-4"><div className="font-black">{row.patient_name || "-"}</div><div className="mt-1 text-xs text-slate-500">{row.company_name || "-"}</div></td>
                    <td className="px-4 py-4 font-bold">{row.employee_id || "-"}</td>
                    <td className="px-4 py-4">
                      <div className="space-y-1">{(row.products || []).map((item, index) => <div key={`${row.id}-${index}`} className="rounded-lg bg-slate-50 px-2 py-1 text-xs font-bold">{item.vaccine_name || "Vaksin"} · Lot {item.lot_number || "-"}</div>)}</div>
                    </td>
                    <td className="px-4 py-4 font-bold">{row.payment_method || "-"}</td>
                    <td className="px-4 py-4"><span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-black text-cyan-700">{row.validation_status || row.queue_status || "PENDING"}</span></td>
                    <td className="px-4 py-4">
                      <div className="flex min-w-[250px] flex-wrap gap-2">
                        <button type="button" onClick={() => void update(row, "DONE")} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">Done</button>
                        <a href={`/vaccination/register?edit_registration_id=${row.id}`} className="rounded-xl border bg-white px-3 py-2 text-xs font-black text-slate-700">Edit</a>
                        <button type="button" onClick={() => setCancelRowId(cancelRowId === row.id ? null : row.id)} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700">Cancel</button>
                      </div>
                      {cancelRowId === row.id ? (
                        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3">
                          <textarea className="min-h-20 w-full rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-semibold" placeholder="Alasan cancel wajib diisi" value={notes[row.id] || ""} onChange={(e) => setNotes((prev) => ({ ...prev, [row.id]: e.target.value }))} />
                          <div className="mt-2 flex justify-end gap-2">
                            <button type="button" onClick={() => setCancelRowId(null)} className="rounded-lg border bg-white px-3 py-2 text-xs font-black">Tutup</button>
                            <button type="button" onClick={() => { if (!clean(notes[row.id])) { setMessage("Alasan Cancel wajib diisi."); return; } void update(row, "BATAL", notes[row.id]); setCancelRowId(null); }} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-black text-white">Simpan Cancel</button>
                          </div>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {!pendingShown.length ? <tr><td colSpan={7} className="p-8 text-center font-bold text-slate-500">Belum ada peserta menunggu validasi pada Session ini.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mx-auto mt-6 max-w-7xl overflow-hidden rounded-[28px] border border-emerald-100 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b bg-emerald-50 px-5 py-4">
            <div>
              <div className="font-black text-slate-900">Sudah Selesai</div>
              <div className="mt-1 text-xs font-semibold text-slate-500">Riwayat peserta yang sudah diselesaikan oleh Tim Validasi.</div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => runExport(doneShown, "selesai")} className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-700">Export Selesai</button>
              <div className="rounded-full border bg-white px-3 py-1 text-xs font-black text-emerald-700">{doneShown.length} peserta</div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">No. Antrean Vendor</th>
                  <th className="px-4 py-3">Peserta</th>
                  <th className="px-4 py-3">NIK Karyawan / BINUSIAN ID</th>
                  <th className="px-4 py-3">Layanan / Produk</th>
                  <th className="px-4 py-3">Payment Method</th>
                  <th className="px-4 py-3">Selesai</th>
                  <th className="px-4 py-3">Petugas</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {doneShown.map((row) => (
                  <tr key={`done-${row.id}`} className="align-top hover:bg-slate-50">
                    <td className="px-4 py-4"><span className="rounded-xl bg-slate-100 px-3 py-2 font-black text-slate-700">{row.queue_number || "-"}</span></td>
                    <td className="px-4 py-4"><div className="font-black">{row.patient_name || "-"}</div><div className="mt-1 text-xs text-slate-500">{row.company_name || "-"}</div></td>
                    <td className="px-4 py-4 font-bold">{row.employee_id || "-"}</td>
                    <td className="px-4 py-4"><div className="space-y-1">{(row.products || []).map((item, index) => <div key={`done-${row.id}-${index}`} className="rounded-lg bg-slate-50 px-2 py-1 text-xs font-bold">{item.vaccine_name || "Vaksin"} · Lot {item.lot_number || "-"}</div>)}</div></td>
                    <td className="px-4 py-4 font-bold">{row.payment_method || "-"}</td>
                    <td className="px-4 py-4"><div className="font-bold">{fmtDate(row.validated_at) || "-"}</div></td>
                    <td className="px-4 py-4 font-bold">{row.validated_by || "-"}</td>
                    <td className="px-4 py-4"><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">Selesai</span></td>
                  </tr>
                ))}
                {!doneShown.length ? <tr><td colSpan={8} className="px-4 py-8 text-center font-bold text-slate-400">Belum ada peserta selesai sesuai filter.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
        </>
      ) : (
      <section className="mx-auto mt-6 max-w-7xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse text-left">
            <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-4">Dokter</th>
                <th className="px-5 py-4">Pasien</th>
                <th className="px-5 py-4">Layanan / Produk</th>
                <th className="px-5 py-4">Note</th>
                <th className="px-5 py-4">Print</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {pendingShown.length === 0 ? (
                <tr>
                  <td className="px-5 py-8 text-center text-sm font-bold text-slate-500" colSpan={7}>Belum ada data pending validasi.</td>
                </tr>
              ) : pendingShown.map((row) => {
                const products = Array.isArray(row.products) ? row.products : [];
                const labelCount = recordIds(row).length;
                const canPrepareLabel = labelCount > 0 || products.length > 0;
                return (
                  <tr key={row.id} className="border-t border-slate-100 align-top">
                    <td className="px-5 py-4">
                      <div className="font-black text-slate-900">{row.doctor_name || "-"}</div>
                      <div className="mt-1 text-xs font-bold text-slate-500">#{row.id}</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-black text-slate-900">{row.patient_name || "-"}</div>
                      <div className="mt-1 text-sm font-bold text-slate-500">{row.queue_number || "-"}</div>
                      <div className="mt-2 text-xs font-bold text-slate-500">{row.location || "-"}{row.session_date ? ` · ${dateKey(row.session_date)}` : ""}</div>
                    </td>
                    <td className="px-5 py-4">
                      {products.length ? (
                        <div className="space-y-2">
                          {products.map((item, index) => (
                            <div key={`${item.record_id || index}-${item.vaccine_name || "vaksin"}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                              <div className="font-black text-slate-900">{index + 1}. {item.vaccine_name || "Vaksin"}</div>
                              <div className="mt-1 text-xs font-bold text-slate-600">
                                Lot {item.lot_number || "-"} · Dose {item.dose_number || 1}
                                {item.administered_at ? ` · ${fmtDate(item.administered_at)}` : ""}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div>
                          <div className="font-black text-slate-900">{row.product_name || "Vaksin"}</div>
                          <div className="mt-1 text-sm font-bold text-slate-500">{row.lot_number || "-"}</div>
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4"><div className="max-w-xs text-sm font-semibold text-slate-600">{row.note || "-"}</div></td>
                    <td className="px-5 py-4"><span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-black text-orange-700">{row.print_status || "NOT_PRINTED"}</span></td>
                    <td className="px-5 py-4"><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{row.validation_status || row.queue_status || "PENDING"}</span></td>
                    <td className="px-5 py-4">
                      <div className="flex min-w-[280px] flex-col gap-2">
                        <button type="button" onClick={() => handlePrint(row)} disabled={!canPrepareLabel} className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">
                          {!canPrepareLabel
                            ? "Data Label Belum Ada"
                            : !labelCount
                              ? "Buat & Print Label"
                              : labelCount > 1
                                ? `Print ${labelCount} Label`
                                : "Print Label"}
                        </button>
                        <select className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black" value={draft[row.id] || ""} onChange={(e) => setDraft((prev) => ({ ...prev, [row.id]: e.target.value }))}>
                          <option value="">Ubah Status</option>
                          <option value="SELESAI">Selesai</option>
                          <option value="BATAL">Batal</option>
                        </select>
                        {draft[row.id] === "BATAL" ? (
                          <textarea className="min-h-20 rounded-2xl border border-rose-200 px-4 py-3 text-sm font-bold outline-none" placeholder="Note wajib jika batal" value={notes[row.id] || ""} onChange={(e) => setNotes((prev) => ({ ...prev, [row.id]: e.target.value }))} />
                        ) : null}
                        <button type="button" onClick={() => saveStatus(row)} className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white">Simpan Status</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      )}
    </main>
  );
}
