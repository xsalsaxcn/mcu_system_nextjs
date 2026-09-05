"use client";

// V148_VALIDATION_DETAIL_AND_STICKER_PRINT

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
  patient_name?: string;
  doctor_name?: string;
  product_name?: string;
  lot_number?: string;
  note?: string;
  print_status?: string;
  validation_status?: string;
  queue_status?: string;
  products?: ProductDetail[];
  record_ids?: number[];
  raw?: any;
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

function recordIds(row: Row) {
  const fromRow = Array.isArray(row.record_ids) ? row.record_ids : [];
  const fromProducts = Array.isArray(row.products)
    ? row.products.map((item) => Number(item.record_id)).filter((id) => Number.isFinite(id) && id > 0)
    : [];
  return Array.from(new Set([...fromRow, ...fromProducts].map(Number).filter((id) => Number.isFinite(id) && id > 0)));
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
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("");
  const [actor, setActor] = useState("Tim Validasi");
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});

  async function loadRows() {
    setLoading(true);
    setMessage("Memuat data validasi...");
    try {
      const res = await fetch("/api/vaccination/validation", { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || "Gagal memuat validasi.");
      setRows(json.rows || []);
      setMessage(`Data validasi dimuat: ${(json.rows || []).length} peserta.`);
    } catch (error: any) {
      setMessage(error?.message || "Gagal memuat validasi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRows();
  }, []);

  const shown = useMemo(() => {
    const keyword = filter.toLowerCase().trim();
    if (!keyword) return rows;

    return rows.filter((row) => {
      const productText = (row.products || [])
        .map((item) => [item.vaccine_name, item.lot_number, item.dose_number, item.administered_by].filter(Boolean).join(" "))
        .join(" ");
      const haystack = [
        row.patient_name,
        row.doctor_name,
        row.queue_number,
        row.product_name,
        row.lot_number,
        row.note,
        row.print_status,
        row.validation_status,
        productText,
      ].map((value) => clean(value).toLowerCase()).join(" ");
      return haystack.includes(keyword);
    });
  }, [filter, rows]);

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

  function handlePrint(row: Row) {
    const url = stickerUrlFor(row);
    if (!url) {
      setMessage("Belum ada record vaksin yang dapat dicetak untuk peserta ini.");
      return;
    }

    // Open synchronously from the click event so Chrome does not block the print window.
    // The destination page is the same V146 vaccination sticker route used by Medis.
    const printWindow = window.open("about:blank", "_blank", "width=520,height=720");
    if (!printWindow) {
      setMessage("Popup print diblokir browser. Izinkan popup lalu coba lagi.");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(
      "<!doctype html><html><head><meta charset='utf-8'><title>Menyiapkan Label Vaksin</title></head><body style='font-family:Arial,sans-serif;padding:18px'><b>Menyiapkan label vaksin...</b><br><span style='font-size:12px'>Menggunakan format sticker 50.8 x 30 mm.</span></body></html>"
    );
    printWindow.document.close();
    printWindow.location.replace(url);
    printWindow.focus();

    setMessage(`${recordIds(row).length} label disiapkan untuk ${row.patient_name || "peserta"}.`);
    void update(row, "PRINTED");
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
              Peserta yang sudah selesai tindakan dokter dan menunggu print label/final validasi.
            </p>
          </div>
          <a href="/vaccination" className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-800">☰ Menu Vaksinasi</a>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <input className="rounded-2xl border border-slate-200 px-4 py-3 font-bold outline-none" placeholder="Cari pasien / dokter / produk / lot" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <input className="rounded-2xl border border-slate-200 px-4 py-3 font-bold outline-none" placeholder="Nama petugas validasi" value={actor} onChange={(e) => setActor(e.target.value)} />
          <button type="button" onClick={loadRows} className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white">{loading ? "Memuat..." : "Refresh"}</button>
        </div>

        {message ? <div className="mt-4 rounded-2xl bg-blue-50 p-4 text-sm font-bold text-blue-700">{message}</div> : null}
      </section>

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
              {shown.length === 0 ? (
                <tr>
                  <td className="px-5 py-8 text-center text-sm font-bold text-slate-500" colSpan={7}>Belum ada data pending validasi.</td>
                </tr>
              ) : shown.map((row) => {
                const products = Array.isArray(row.products) ? row.products : [];
                const labelCount = recordIds(row).length;
                return (
                  <tr key={row.id} className="border-t border-slate-100 align-top">
                    <td className="px-5 py-4">
                      <div className="font-black text-slate-900">{row.doctor_name || "-"}</div>
                      <div className="mt-1 text-xs font-bold text-slate-500">#{row.id}</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-black text-slate-900">{row.patient_name || "-"}</div>
                      <div className="mt-1 text-sm font-bold text-slate-500">{row.queue_number || "-"}</div>
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
                        <button type="button" onClick={() => handlePrint(row)} disabled={!labelCount} className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">
                          {labelCount > 1 ? `Print ${labelCount} Label` : "Print Label"}
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
    </main>
  );
}
