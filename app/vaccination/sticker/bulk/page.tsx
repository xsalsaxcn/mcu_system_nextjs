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

export default function VaccinationBulkStickerPage() {
  const [records, setRecords] = useState<any[]>([]);
  const [error, setError] = useState("");
  const printedRef = useRef(false);

  async function load() {
    const params = new URLSearchParams(window.location.search);
    const ids = params.get("ids") || "";
    const json = await fetch(`/api/vaccination/sticker?ids=${encodeURIComponent(ids)}`, { cache: "no-store" }).then((r) => r.json());

    if (!json.ok) {
      setError(json.message || "Sticker tidak ditemukan.");
      return;
    }

    setRecords(json.records || []);
  }

  useEffect(() => {
    load();
  }, []);

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
        /* VACCINATION STICKER V138 CONTENT FILL + V137 ORIENTATION LOCK
           Restore exact last-known-good V135/V133 orientation and layout. No geometry changes.
           IMPORTANT: rotation geometry is LOCKED and must not be changed here.
           Physical media: 40mm x 30mm.
           Xprinter workstation currently needs 90deg CW pre-rotation. */
        @page {
          size: 40mm 30mm;
          margin: 0;
        }

        html,
        body {
          margin: 0 !important;
          padding: 0 !important;
          background: #fff !important;
        }

        .vaccination-sticker-page {
          width: 40mm;
          margin: 0;
          padding: 0;
          background: #fff;
        }

        .label-card {
          width: 40mm;
          height: 30mm;
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
          width: 40mm;
          height: 30mm;
          box-sizing: border-box;
          overflow: hidden;
          padding: 0.7mm 0.85mm;
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
          padding-bottom: 0.3mm;
          margin-bottom: 0.5mm;
          white-space: nowrap;
          overflow: hidden;
        }

        .label-name {
          font-size: 11.6pt;
          line-height: 0.98;
          font-weight: 900;
          letter-spacing: -0.025em;
          max-height: 9.6mm;
          overflow: hidden;
          overflow-wrap: anywhere;
        }

        .label-vaccine {
          margin-top: 0.3mm;
          font-size: 9.2pt;
          line-height: 1;
          font-weight: 900;
          letter-spacing: -0.015em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .label-date-row {
          margin-top: 0.75mm;
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 0.7mm;
        }

        .label-date-right {
          text-align: right;
        }

        .label-caption {
          font-size: 5.0pt;
          line-height: 1;
          font-weight: 900;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .label-date {
          margin-top: 0.2mm;
          font-size: 7.1pt;
          line-height: 1;
          font-weight: 900;
          letter-spacing: -0.02em;
          white-space: nowrap;
        }

        .label-lot {
          margin-top: 0.5mm;
          font-size: 6.3pt;
          line-height: 1;
          font-weight: 900;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .label-footer {
          margin-top: 0.45mm;
          border-top: 0.15mm solid #222;
          padding-top: 0.3mm;
          display: flex;
          justify-content: space-between;
          gap: 0.7mm;
          font-size: 5.0pt;
          line-height: 1;
          font-weight: 900;
          white-space: nowrap;
          overflow: hidden;
        }

        .label-footer span:last-child {
          max-width: 18mm;
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
            min-width: 40mm;
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
            width: 40mm !important;
            min-width: 40mm !important;
            max-width: 40mm !important;
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
            width: 40mm !important;
            min-width: 40mm !important;
            max-width: 40mm !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .label-card {
            width: 40mm !important;
            height: 30mm !important;
            min-height: 30mm !important;
            max-height: 30mm !important;
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
            /* LAST VISUALLY ACCEPTED V133 GEOMETRY. DO NOT MODIFY ROTATION HERE. */
            position: absolute !important;
            left: 50% !important;
            top: 50% !important;
            width: 30mm !important;
            height: 40mm !important;
            transform: translate(-50%, -50%) rotate(90deg) !important;
            transform-origin: center center !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: center !important;
            align-items: stretch !important;
            padding: 0.45mm 0.55mm !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
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
