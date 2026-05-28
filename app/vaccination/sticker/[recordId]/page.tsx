"use client";

import { useEffect, useState } from "react";

function fmtDate(value: any) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function VaccinationStickerPage({ params }: { params: { recordId: string } }) {
  const [record, setRecord] = useState<any>(null);
  const [error, setError] = useState("");

  async function load() {
    const json = await fetch(`/api/vaccination/sticker?record_id=${params.recordId}`, { cache: "no-store" }).then((r) => r.json());
    if (!json.ok) { setError(json.message || "Sticker tidak ditemukan."); return; }
    setRecord(json.record);
    setTimeout(() => window.print(), 700);
  }

  useEffect(() => { load(); }, [params.recordId]);

  if (error) return <main className="p-6 text-red-700">{error}</main>;
  if (!record) return <main className="p-6">Loading sticker...</main>;

  return (
    <main className="min-h-screen bg-white p-6">
      <style jsx global>{`@media print { body { margin: 0; } .no-print { display: none !important; } .sticker { page-break-after: always; } }`}</style>
      <button className="no-print mb-4 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white" onClick={() => window.print()}>Print Sticker</button>
      <div className="sticker w-[360px] rounded-xl border-2 border-black bg-white p-4 text-black">
        <div className="text-center text-xs font-bold uppercase tracking-wide">Vaccination Label</div>
        <div className="mt-2 text-center text-lg font-black">{record.participant_name}</div>
        <div className="mt-3 border-t border-black pt-3 text-sm">
          <div><b>Vaksin:</b> {record.vaccine_name}</div>
          <div><b>Lot:</b> {record.lot_number}</div>
          <div><b>Tanggal:</b> {fmtDate(record.administered_at)}</div>
          <div><b>Next Dose:</b> {fmtDate(record.next_due_date)}</div>
        </div>
        <div className="mt-3 text-center text-[11px]">Record #{record.id}</div>
      </div>
    </main>
  );
}
