"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  registration: any;
  onClose: () => void;
};

function dateLabel(value: any) {
  if (!value) return "Tanggal tidak tercatat";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}

function serviceTitle(item: any) {
  return item.product_brand
    ? `${item.service_name || "Layanan"} · ${item.product_brand}`
    : (item.service_name || item.vaccine_name || "Layanan");
}

export default function VaccinationParticipantHistoryModal({ registration, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    fetch(`/api/vaccination/history/registration?registration_id=${encodeURIComponent(String(registration?.id || ""))}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => {
        if (!active) return;
        if (!json.ok) setError(json.message || "Gagal memuat riwayat peserta.");
        else setData(json);
      })
      .catch(() => active && setError("Gagal memuat riwayat peserta."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [registration?.id]);

  const services = useMemo(() => {
    const rows: any[] = [];
    for (const item of data?.historical || []) {
      rows.push({
        source: "History Import",
        date: item.service_date,
        service_name: item.service_name,
        product_brand: item.product_brand,
        location: item.location,
        next_due_date: item.next_due_date,
        notes: item.notes,
        sortDate: item.service_date || "0000-00-00",
      });
    }
    for (const item of data?.current || []) {
      const session = Array.isArray(item.session) ? item.session[0] : item.session;
      rows.push({
        source: "Sistem Saat Ini",
        date: item.administered_at,
        service_name: item.vaccine_name || "Vaksinasi",
        product_brand: null,
        location: session?.location || session?.session_name || "",
        next_due_date: item.next_due_date,
        notes: item.notes,
        lot_number: item.lot_number,
        administered_by: item.administered_by,
        sortDate: item.administered_at || "0000-00-00",
      });
    }
    return rows.sort((a, b) => String(b.sortDate).localeCompare(String(a.sortDate)));
  }, [data]);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b bg-slate-50 px-6 py-5">
          <div>
            <div className="text-xs font-black uppercase tracking-wide text-emerald-700">Riwayat Layanan Peserta</div>
            <h2 className="mt-1 text-2xl font-black text-slate-900">{registration?.participant_name || "Peserta"}</h2>
            <div className="mt-1 text-sm font-semibold text-slate-500">
              {[registration?.employee_id || registration?.mcu_id, registration?.nik, registration?.email].filter(Boolean).join(" · ") || "Identitas tambahan belum tersedia"}
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border bg-white px-4 py-2 text-sm font-black hover:bg-slate-100">Tutup</button>
        </div>

        <div className="max-h-[calc(90vh-96px)] overflow-y-auto p-6">
          {loading ? <div className="rounded-2xl border bg-slate-50 p-6 text-sm font-bold text-slate-600">Memuat riwayat...</div> : null}
          {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-700">{error}</div> : null}

          {!loading && !error && data ? (
            <div className="space-y-5">
              <section className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase text-slate-500">Match History</div>
                  <div className="mt-2 text-lg font-black text-slate-900">{data.match?.status === "MATCHED" ? "Matched" : data.match?.status === "REVIEW" ? "Perlu Review" : "Belum Ada"}</div>
                  {data.match?.reasons?.length ? <div className="mt-1 text-xs font-semibold text-slate-500">via {data.match.reasons.join(", ")}</div> : null}
                </div>
                <div className="rounded-2xl border bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase text-slate-500">History Import</div>
                  <div className="mt-2 text-lg font-black text-slate-900">{(data.historical || []).length}</div>
                </div>
                <div className="rounded-2xl border bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase text-slate-500">Record Sistem</div>
                  <div className="mt-2 text-lg font-black text-slate-900">{(data.current || []).length}</div>
                </div>
              </section>

              {data.person?.participant_type === "DEPENDENT" && data.family?.parent ? (
                <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                  <div className="text-xs font-black uppercase text-blue-700">Anak / Tanggungan</div>
                  <div className="mt-2 font-black text-blue-950">Terikat ke parent: {data.family.parent.participant_name}</div>
                  <div className="mt-1 text-sm font-semibold text-blue-800">
                    {[data.family.parent.employee_id, data.family.parent.nik, data.family.parent.email].filter(Boolean).join(" · ") || "Identitas parent tersimpan di master history"}
                  </div>
                </section>
              ) : null}

              {data.person?.participant_type === "EMPLOYEE" && data.family?.dependents?.length ? (
                <section className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
                  <div className="text-xs font-black uppercase text-violet-700">Anak / Tanggungan Terhubung</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {data.family.dependents.map((child: any) => <span key={child.id} className="rounded-full bg-white px-3 py-1 text-xs font-black text-violet-800">{child.participant_name}</span>)}
                  </div>
                </section>
              ) : null}

              <section>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-slate-900">Timeline Layanan</h3>
                    <p className="text-sm font-medium text-slate-500">History lama dan record vaksinasi di sistem ditampilkan bersama tanpa mengubah transaksi asli.</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {services.map((item, index) => (
                    <div key={`${item.source}-${item.sortDate}-${index}`} className="rounded-2xl border p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="text-xs font-black uppercase text-emerald-700">{item.source}</div>
                          <div className="mt-1 text-lg font-black text-slate-900">{serviceTitle(item)}</div>
                          <div className="mt-1 text-sm font-semibold text-slate-600">{dateLabel(item.date)}{item.location ? ` · ${item.location}` : ""}</div>
                        </div>
                        {item.next_due_date ? <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">Next: {dateLabel(item.next_due_date)}</span> : null}
                      </div>
                      {(item.lot_number || item.administered_by || item.notes) ? (
                        <div className="mt-3 text-xs font-semibold text-slate-500">
                          {[item.lot_number ? `Lot ${item.lot_number}` : "", item.administered_by ? `Petugas: ${item.administered_by}` : "", item.notes].filter(Boolean).join(" · ")}
                        </div>
                      ) : null}
                    </div>
                  ))}
                  {!services.length ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm font-semibold text-slate-500">Belum ada riwayat layanan yang terhubung ke peserta ini.</div> : null}
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
