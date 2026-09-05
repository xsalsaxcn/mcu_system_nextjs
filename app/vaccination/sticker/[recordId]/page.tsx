"use client";

import { useEffect, useRef, useState } from "react";

function fmtDate(value: any) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function Label({ record }: { record: any }) {
  return (
    <section className="label-card">
      <div className="label-rotator">
        <div className="label-title">Harmony Health · Vaccine</div>

        <div className="label-name">{record.participant_name}</div>
        <div className="label-vaccine">{record.vaccine_name}</div>

        <div className="label-date-row">
          <div>
            <div className="label-caption">Tanggal</div>
            <div className="label-date">{fmtDate(record.administered_at)}</div>
          </div>
          <div className="label-date-right">
            <div className="label-caption">Next Dose</div>
            <div className="label-date">{fmtDate(record.next_due_date)}</div>
          </div>
        </div>

        <div className="label-lot">Lot: <b>{record.lot_number || "-"}</b></div>

        <div className="label-footer">
          <span>{record.registration?.queue_number || `#${record.id}`}</span>
          <span>{record.session?.location || record.session?.company_name || ""}</span>
        </div>
      </div>
    </section>
  );
}

export default function VaccinationStickerPage({ params }: { params: { recordId: string } }) {
  const [records, setRecords] = useState<any[]>([]);
  const [error, setError] = useState("");
  const printedRef = useRef(false);

  async function load() {
    const json = await fetch(`/api/vaccination/sticker?record_id=${params.recordId}`, { cache: "no-store" }).then((r) => r.json());

    if (!json.ok) {
      setError(json.message || "Sticker tidak ditemukan.");
      return;
    }

    setRecords(json.records || (json.record ? [json.record] : []));
  }

  useEffect(() => {
    load();
  }, [params.recordId]);

  useEffect(() => {
    if (!records.length || printedRef.current) return;
    printedRef.current = true;
    const timer = window.setTimeout(() => window.print(), 650);
    return () => window.clearTimeout(timer);
  }, [records]);

  if (error) return <main className="p-6 text-red-700">{error}</main>;
  if (!records.length) return <main className="p-6">Loading sticker...</main>;

  return (
    <main className="vaccination-sticker-page bg-white text-black">
      <style jsx global>{`
        /* VACCINATION STICKER V144 ACTUAL STOCK 50.8x39.878 + V137 ORIENTATION LOCK
           Same V138 visual hierarchy and +90deg CW orientation.
           Only physical canvas + typography are scaled to the REAL label stock.
           Physical media: 2.00in x 1.57in = 50.8mm x 39.878mm.
           Xprinter workstation keeps Portrait + 90deg CW pre-rotation. */
        @page {
          size: 50.8mm 39.878mm;
          margin: 0;
        }

        html,
        body {
          margin: 0 !important;
          padding: 0 !important;
          background: #fff !important;
        }

        .vaccination-sticker-page {
          width: 50.8mm;
          margin: 0;
          padding: 0;
          background: #fff;
        }

        .label-card {
          width: 50.8mm;
          height: 39.878mm;
          position: relative;
          box-sizing: border-box;
          overflow: hidden;
          margin: 0;
          padding: 0;
          background: #fff;
          color: #000;
          font-family: Arial, Helvetica, sans-serif;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .label-rotator {
          width: 50.8mm;
          height: 39.878mm;
          box-sizing: border-box;
          overflow: hidden;
          padding: 0.9mm 1.05mm;
          background: #fff;
          color: #000;
        }

        .label-title {
          font-size: 5.9pt;
          line-height: 1;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.005em;
          border-bottom: 0.18mm solid #111;
          padding-bottom: 0.38mm;
          margin-bottom: 0.62mm;
          white-space: nowrap;
          overflow: hidden;
        }

        .label-name {
          font-size: 14.2pt;
          line-height: 0.97;
          font-weight: 900;
          letter-spacing: -0.025em;
          max-height: 12.2mm;
          overflow: hidden;
          overflow-wrap: anywhere;
        }

        .label-vaccine {
          margin-top: 0.38mm;
          font-size: 11.3pt;
          line-height: 1;
          font-weight: 900;
          letter-spacing: -0.015em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .label-date-row {
          margin-top: 0.95mm;
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 0.9mm;
        }

        .label-date-right {
          text-align: right;
        }

        .label-caption {
          font-size: 6.1pt;
          line-height: 1;
          font-weight: 900;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .label-date {
          margin-top: 0.25mm;
          font-size: 8.7pt;
          line-height: 1;
          font-weight: 900;
          letter-spacing: -0.02em;
          white-space: nowrap;
        }

        .label-lot {
          margin-top: 0.62mm;
          font-size: 7.7pt;
          line-height: 1;
          font-weight: 900;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .label-footer {
          margin-top: 0.58mm;
          border-top: 0.18mm solid #222;
          padding-top: 0.38mm;
          display: flex;
          justify-content: space-between;
          gap: 0.7mm;
          font-size: 6.1pt;
          line-height: 1;
          font-weight: 900;
          white-space: nowrap;
          overflow: hidden;
        }

        .label-footer span:last-child {
          max-width: 23mm;
          overflow: hidden;
          text-overflow: ellipsis;
          text-align: right;
        }

        .no-print {
          margin: 10px;
        }

        #hha-validation-menu-link-v129,
        #hha-validation-menu-link-v128,
        [id^="hha-validation-menu-link-"] {
          display: none !important;
        }

        @media screen {
          .vaccination-sticker-page {
            width: auto;
            min-width: 50.8mm;
            padding: 10px;
          }

          .label-card {
            border: 1px solid #cbd5e1;
            border-radius: 8px;
          }
        }

        @media print {
          html,
          body {
            width: 50.8mm !important;
            min-width: 50.8mm !important;
            max-width: 50.8mm !important;
            min-height: 0 !important;
            height: auto !important;
            overflow: visible !important;
          }

          body > * {
            margin: 0 !important;
          }

          .no-print,
          #hha-validation-menu-link-v129,
          #hha-validation-menu-link-v128,
          [id^="hha-validation-menu-link-"] {
            display: none !important;
          }

          .vaccination-sticker-page {
            width: 50.8mm !important;
            min-width: 50.8mm !important;
            max-width: 50.8mm !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .label-card {
            width: 50.8mm !important;
            height: 39.878mm !important;
            min-height: 39.878mm !important;
            max-height: 39.878mm !important;
            margin: 0 !important;
            padding: 0 !important;
            break-after: auto !important;
            page-break-after: auto !important;
          }

          .label-card + .label-card {
            break-before: page !important;
            page-break-before: always !important;
          }

          .label-rotator {
            /* V138 POSITION/ROTATION PRESERVED; canvas expanded to actual stock only. */
            position: absolute !important;
            left: 50% !important;
            top: 50% !important;
            width: 39.878mm !important;
            height: 50.8mm !important;
            transform: translate(-50%, -50%) rotate(90deg) !important;
            transform-origin: center center !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: center !important;
            align-items: stretch !important;
            padding: 0.58mm 0.72mm !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
          }
        }
      `}</style>

      <button className="no-print rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white" onClick={() => window.print()}>
        Print Sticker
      </button>

      {records.map((record) => (
        <Label key={record.id} record={record} />
      ))}
    </main>
  );
}
