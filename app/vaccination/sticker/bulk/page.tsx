"use client";

import { useEffect, useState } from "react";

function fmtDate(value: any) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function Label({ record }: { record: any }) {
  return (
    <section className="label-card">
      <div className="label-title">Harmony Health App · Vaccination</div>

      <div className="label-name">{record.participant_name}</div>
      <div className="label-vaccine">{record.vaccine_name}</div>

      <div className="label-date-row">
        <div>
          <div className="label-caption">Tanggal Tindakan</div>
          <div className="label-date">{fmtDate(record.administered_at)}</div>
        </div>
        <div className="text-right">
          <div className="label-caption">Next Dose</div>
          <div className="label-date">{fmtDate(record.next_due_date)}</div>
        </div>
      </div>

      <div className="label-lot">Lot Number: <b>{record.lot_number || "-"}</b></div>

      <div className="label-footer">
        <span>{record.registration?.queue_number || `Record #${record.id}`}</span>
        <span>{record.session?.location || record.session?.company_name || ""}</span>
      </div>
    </section>
  );
}


export default function VaccinationBulkStickerPage() {
  const [records, setRecords] = useState<any[]>([]);
  const [error, setError] = useState("");

  async function load() {
    const params = new URLSearchParams(window.location.search);
    const ids = params.get("ids") || "";

    const json = await fetch(`/api/vaccination/sticker?ids=${encodeURIComponent(ids)}`, { cache: "no-store" }).then((r) => r.json());

    if (!json.ok) {
      setError(json.message || "Sticker tidak ditemukan.");
      return;
    }

    setRecords(json.records || []);
    setTimeout(() => window.print(), 600);
  }

  useEffect(() => {
    load();
  }, []);

  if (error) return <main className="p-6 text-red-700">{error}</main>;
  if (!records.length) return <main className="p-6">Loading sticker...</main>;

  return (
    <main className="label-page bg-white text-black">
      <style jsx global>{`
        @page {
          size: 70mm 35mm;
          margin: 0;
        }

        html,
        body {
          margin: 0 !important;
          padding: 0 !important;
          background: #fff !important;
        }

        .label-page {
          width: 70mm;
          margin: 0;
          padding: 0;
          background: #fff;
        }

        .label-card {
          width: 70mm;
          height: 35mm;
          box-sizing: border-box;
          padding: 3mm 4mm;
          overflow: hidden;
          font-family: Arial, Helvetica, sans-serif;
          color: #000;
          background: #fff;
          break-after: page;
          page-break-after: always;
        }

        .label-title {
          font-size: 8.5pt;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          border-bottom: 1px solid #000;
          padding-bottom: 1mm;
          margin-bottom: 1.5mm;
        }

        .label-name {
          font-size: 15.5pt;
          line-height: 1.02;
          font-weight: 900;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .label-vaccine {
          margin-top: 0.8mm;
          font-size: 13pt;
          line-height: 1.05;
          font-weight: 900;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .label-date-row {
          margin-top: 2mm;
          display: flex;
          justify-content: space-between;
          gap: 2mm;
        }

        .label-caption {
          font-size: 7pt;
          line-height: 1;
          font-weight: 800;
          text-transform: uppercase;
        }

        .label-date {
          margin-top: 0.5mm;
          font-size: 10pt;
          line-height: 1;
          font-weight: 900;
        }

        .label-lot {
          margin-top: 1.5mm;
          font-size: 10pt;
          line-height: 1.1;
          font-weight: 800;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .label-footer {
          margin-top: 1.3mm;
          display: flex;
          justify-content: space-between;
          gap: 2mm;
          font-size: 7pt;
          font-weight: 800;
          border-top: 1px solid #000;
          padding-top: 1mm;
        }

        .no-print {
          margin: 12px;
        }

        @media print {
          .no-print {
            display: none !important;
          }

          .label-page,
          .label-card {
            margin: 0 !important;
          }
        }
      `}</style>

      <button className="no-print rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white" onClick={() => window.print()}>
        Print Semua Sticker
      </button>

      {records.map((record) => (
        <Label key={record.id} record={record} />
      ))}
    </main>
  );
}
