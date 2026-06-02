"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import QRCodeImage from "@/components/QRCodeImage";

type Participant = {
  id: number;
  name: string;
  mcu_id: string;
  external_id?: string;
  barcode_value?: string;
  package_name?: string;
  company_name?: string;
  source_name?: string;
  institution_name?: string;
  province?: string;
};

export default function LabelsPage() {
  return (
    <AuthGate>
      {(user) => <LabelPrinter user={user} />}
    </AuthGate>
  );
}

function sanitizeQrText(value: any) {
  return String(value || "")
    .replace(/[;\n\r]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildCombinedQrValue(participant: Participant) {
  const idText = sanitizeQrText(participant.mcu_id || participant.external_id || String(participant.id));
  const nameText = sanitizeQrText(participant.name);
  return `MCU=${idText};NAME=${nameText}`;
}

function LabelPrinter({ user }: { user: any }) {
  const [sources, setSources] = useState<any[]>([]);
  const [sourceId, setSourceId] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selectedIds, setSelectedIds] = useState<Record<number, boolean>>({});
  const [copies, setCopies] = useState(6);
  const [qrSize, setQrSize] = useState(46);
  const [fontSize, setFontSize] = useState(7);
  const [showBorder, setShowBorder] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [printReady, setPrintReady] = useState(false);

  const program = user.program_type === "all" ? "capaska" : user.program_type;

  useEffect(() => {
    fetch(`/api/sources?program=${program}`)
      .then((r) => r.json())
      .then((d) => setSources(d.sources || []));
  }, [program]);

  const selectedParticipants = useMemo(() => {
    return participants.filter((p) => selectedIds[p.id]);
  }, [participants, selectedIds]);

  const labels = useMemo(() => {
    const rows: Participant[] = [];

    for (const participant of selectedParticipants) {
      for (let i = 0; i < copies; i += 1) {
        rows.push(participant);
      }
    }

    return rows;
  }, [selectedParticipants, copies]);

  if (user.role !== "admin") {
    return (
      <div className="card p-5 text-red-700">
        Hanya admin yang dapat cetak label barcode.
      </div>
    );
  }

  async function loadParticipants(e?: React.FormEvent) {
    e?.preventDefault();

    const trimmedKeyword = keyword.trim();

    if (sourceId === "all" && trimmedKeyword.length < 2) {
      setMessage("Pilih database atau ketik minimal 2 karakter supaya pencarian tidak berat.");
      setParticipants([]);
      setSelectedIds({});
      return;
    }

    setLoading(true);
    setMessage("Mencari peserta...");
    setPrintReady(false);

    try {
      const params = new URLSearchParams({
        program,
        source_id: sourceId,
        keyword: trimmedKeyword,
        limit: "25"
      });

      const res = await fetch(`/api/labels/participants?${params.toString()}`, {
        cache: "no-store"
      });

      const json = await res.json();

      if (!json.ok) {
        setMessage(json.message || "Gagal memuat peserta.");
        setParticipants([]);
        setSelectedIds({});
        return;
      }

      setParticipants(json.participants || []);
      setSelectedIds({});

      const count = json.participants?.length || 0;
      if (count) {
        setMessage(`Ditemukan ${count} peserta. Pilih peserta lalu print label.`);
      } else {
        setMessage(json.message || "Peserta tidak ditemukan.");
      }
    } catch (error: any) {
      setMessage(error?.message || "Gagal memuat peserta.");
      setParticipants([]);
      setSelectedIds({});
    } finally {
      setLoading(false);
    }
  }

  function toggleAll(checked: boolean) {
    const next: Record<number, boolean> = {};
    participants.forEach((p) => {
      next[p.id] = checked;
    });
    setSelectedIds(next);
    setPrintReady(false);
  }

  function printLabels() {
    setPrintReady(true);
    setTimeout(() => window.print(), 350);
  }

  return (
    <div className="space-y-5">
      <style jsx global>{`
        @page {
          size: 40mm 30mm;
          margin: 0;
        }

        @media print {
          html,
          body {
            width: 40mm;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }

          header,
          nav,
          .no-print {
            display: none !important;
          }

          main {
            max-width: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          .print-area {
            display: block !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          .label-page {
            width: 40mm !important;
            height: 30mm !important;
            page-break-after: always;
            break-after: page;
            box-sizing: border-box;
            overflow: hidden;
            margin: 0 !important;
            background: white !important;
          }

          .label-page:last-child {
            page-break-after: auto;
            break-after: auto;
          }
        }
      `}</style>

      <section className="card p-5 no-print">
        <div className="text-2xl font-black">Cetak Label QR / Barcode</div>
        <div className="mt-1 text-sm text-slate-500">
          Search dibuat ringan. QR/barcode berisi Nomor MCU saja agar lebih mudah discan.
        </div>
        <div className="mt-2 w-fit rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
          Label Search v22 Â· fast search Â· QR MCU saja
        </div>
      </section>

      <section className="card p-5 no-print">
        <form onSubmit={loadParticipants} className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
          <select className="input" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
            <option value="all">Semua Database Instansi</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} - {s.institution_name || "-"}
              </option>
            ))}
          </select>

          <input
            className="input"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Cari nama / nomor MCU / barcode"
          />

          <button className="btn-primary" disabled={loading}>
            {loading ? "Mencari..." : "Cari Peserta"}
          </button>
        </form>

        {message && (
          <div className="mt-4 rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">
            {message}
          </div>
        )}

        <div className="mt-5 grid gap-4 md:grid-cols-4">
          <div>
            <label className="label">Jumlah stiker per peserta</label>
            <input
              type="number"
              min={1}
              max={20}
              className="input"
              value={copies}
              onChange={(e) => {
                setCopies(Number(e.target.value || 1));
                setPrintReady(false);
              }}
            />
          </div>

          <div>
            <label className="label">Ukuran font</label>
            <input
              type="number"
              min={6}
              max={12}
              className="input"
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value || 7))}
            />
          </div>

          <div>
            <label className="label">Ukuran QR</label>
            <input
              type="number"
              min={32}
              max={72}
              className="input"
              value={qrSize}
              onChange={(e) => setQrSize(Number(e.target.value || 46))}
            />
          </div>

          <div className="flex items-end gap-2">
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold">
              <input
                type="checkbox"
                checked={showBorder}
                onChange={(e) => setShowBorder(e.target.checked)}
              />
              Garis batas
            </label>
          </div>
        </div>
      </section>

      {!!participants.length && (
        <section className="card p-4 no-print">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-lg font-black">Pilih Peserta</div>
              <div className="text-sm text-slate-500">
                Terpilih {selectedParticipants.length} peserta Ã— {copies} stiker = {labels.length} label
              </div>
            </div>

            <div className="flex gap-2">
              <button type="button" className="btn-secondary" onClick={() => toggleAll(true)}>
                Pilih Semua
              </button>
              <button type="button" className="btn-secondary" onClick={() => toggleAll(false)}>
                Kosongkan
              </button>
              <button type="button" className="btn-primary" onClick={printLabels} disabled={!labels.length}>
                Print Label
              </button>
            </div>
          </div>

          <div className="mobile-table">
            <table>
              <thead>
                <tr>
                  <th>Pilih</th>
                  <th>Nama</th>
                  <th>Nomor MCU</th>
                  <th>Database</th>
                  <th>Provinsi</th>
                </tr>
              </thead>
              <tbody>
                {participants.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={!!selectedIds[p.id]}
                        onChange={(e) => {
                          setSelectedIds({ ...selectedIds, [p.id]: e.target.checked });
                          setPrintReady(false);
                        }}
                      />
                    </td>
                    <td className="font-bold">{p.name}</td>
                    <td>{p.mcu_id || p.external_id || "-"}</td>
                    <td>{p.source_name || "-"}</td>
                    <td>{p.province || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card p-5 no-print">
        <div className="mb-3 text-lg font-black">Preview Label</div>
        <div className="flex flex-wrap gap-3">
          {labels.slice(0, 4).map((participant, index) => (
            <LabelCard
              key={`${participant.id}-${index}`}
              participant={participant}
              qrSize={qrSize}
              fontSize={fontSize}
              showBorder={showBorder}
            />
          ))}
          {!labels.length && (
            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              Pilih peserta untuk melihat preview.
            </div>
          )}
        </div>
      </section>

      {printReady && (
        <section className="print-area hidden">
          {labels.map((participant, index) => (
            <LabelCard
              key={`${participant.id}-print-${index}`}
              participant={participant}
              qrSize={qrSize}
              fontSize={fontSize}
              showBorder={showBorder}
              printMode
            />
          ))}
        </section>
      )}
    </div>
  );
}

function LabelCard({
  participant,
  qrSize,
  fontSize,
  showBorder,
  showQr,
  showBarcodeText,
  printMode = false
}: {
  participant: Participant;
  qrSize: number;
  fontSize: number;
  showBorder: boolean;
  showQr: boolean;
  showBarcodeText: boolean;
  printMode?: boolean;
}) {
  const idText = sanitizeQrText(participant.mcu_id || participant.external_id || String(participant.id));
  const qrValue = idText;
  const nameText = sanitizeQrText(participant.name).toUpperCase();
  const institution = participant.company_name || participant.institution_name || "BPIP / CAPASKA";
  const location = participant.province || participant.location || participant.department || "";

  const safeFont = Number(fontSize || 10);
  const nameFont =
    nameText.length > 34 ? Math.max(13, safeFont + 5) :
    nameText.length > 24 ? Math.max(15, safeFont + 7) :
    Math.max(18, safeFont + 10);

  return (
    <section
      className={`${printMode ? "label-page" : ""} bg-white`}
      style={{
        position: "relative",
        width: "58mm",
        minHeight: "38mm",
        padding: "4.5mm 4.5mm 3.8mm 4.5mm",
        boxSizing: "border-box",
        overflow: "hidden",
        border: showBorder ? "0.45mm solid #d4d4d8" : "0.35mm solid #d4d4d8",
        borderRadius: "5mm",
        background: "#ffffff",
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact"
      }}
    >
      <div
        style={{
          width: "100%",
          paddingRight: 0,
          fontSize: `${nameFont}px`,
          lineHeight: 1.02,
          fontWeight: 900,
          color: "#000",
          whiteSpace: "normal",
          wordBreak: "break-word",
          overflowWrap: "anywhere",
          letterSpacing: "-0.03em"
        }}
      >
        {nameText || "-"}
      </div>

      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          maxWidth: showQr ? "calc(100% - 23mm)" : "100%",
          marginTop: "1.6mm",
          marginBottom: "1.8mm",
          padding: "1mm 2.2mm",
          borderRadius: "999px",
          background: "#dbeafe",
          color: "#1e3a8a",
          fontSize: "9.5px",
          lineHeight: 1,
          fontWeight: 900,
          whiteSpace: "normal",
          overflowWrap: "anywhere"
        }}
      >
        LABEL PESERTA
      </div>

      <div
        style={{
          width: showQr ? "calc(100% - 23mm)" : "100%",
          fontSize: `${Math.max(10, safeFont + 2)}px`,
          lineHeight: 1.18,
          fontWeight: 700,
          color: "#111827",
          whiteSpace: "normal",
          wordBreak: "break-word",
          overflowWrap: "anywhere"
        }}
      >
        <div>MCU: {idText || "-"}</div>
        <div style={{ marginTop: "1.2mm" }}>{institution || "-"}</div>
        {location ? <div style={{ marginTop: "1.2mm", color: "#4b5563" }}>{location}</div> : null}
      </div>

      {showQr && (
        <div
          style={{
            position: "absolute",
            right: "4mm",
            bottom: showBarcodeText ? "5.5mm" : "4mm",
            width: "20mm",
            height: "20mm",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#fff"
          }}
        >
          <QRCodeImage value={qrValue} size={76} />
        </div>
      )}

      {showQr && showBarcodeText && (
        <div
          style={{
            position: "absolute",
            right: "3.2mm",
            bottom: "2mm",
            width: "21.5mm",
            textAlign: "center",
            fontSize: "7.5px",
            lineHeight: 1,
            fontWeight: 800,
            color: "#111827",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis"
          }}
        >
          {idText || "-"}
        </div>
      )}
    </section>
  );
}

