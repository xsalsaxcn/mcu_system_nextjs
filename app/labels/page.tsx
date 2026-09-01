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
  nik?: string;
  employee_nik?: string;
  gender?: string;
  birth_date?: string;
  date_of_birth?: string;
  age?: number | string;
  examination_date?: string;
  exam_date?: string;
  department?: string;
};

type StationOption = {
  key: string;
  label: string;
  shortCode: string;
  defaultCopies: number;
};

const STATIONS: StationOption[] = [
  { key: "registrasi_ulang", label: "REGISTRASI ULANG", shortCode: "REG", defaultCopies: 1 },
  { key: "fisik", label: "PEMERIKSAAN FISIK", shortCode: "FISIK", defaultCopies: 1 },
  { key: "darah", label: "DARAH", shortCode: "DRH", defaultCopies: 1 },
  { key: "urine", label: "URINE", shortCode: "URN", defaultCopies: 1 },
  { key: "dokter", label: "DOKTER", shortCode: "DOK", defaultCopies: 1 },
  { key: "rontgen", label: "RONTGEN", shortCode: "RO", defaultCopies: 1 },
  { key: "ekg_hasil", label: "EKG - HASIL", shortCode: "EKG", defaultCopies: 1 },
  { key: "ekg_nakes", label: "EKG - NAKES", shortCode: "EKG", defaultCopies: 1 },
  { key: "audio", label: "AUDIO", shortCode: "AUD", defaultCopies: 1 },
  { key: "mata", label: "MATA", shortCode: "MATA", defaultCopies: 1 },
  { key: "tht", label: "THT", shortCode: "THT", defaultCopies: 1 },
  { key: "gigi", label: "GIGI", shortCode: "GIGI", defaultCopies: 2 },
  { key: "penyakit_dalam", label: "PENYAKIT DALAM", shortCode: "PD", defaultCopies: 1 },
  { key: "jantung", label: "JANTUNG", shortCode: "JTG", defaultCopies: 1 },
  { key: "radiologi", label: "RADIOLOGI", shortCode: "RAD", defaultCopies: 1 },
  { key: "ortopedi", label: "ORTOPEDI", shortCode: "ORT", defaultCopies: 1 }
];

export default function LabelsPage() {
  return (
    <AuthGate>
      {(user) => <LabelPrinter user={user} />}
    </AuthGate>
  );
}

function safeText(value: any, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function formatDate(value: any) {
  if (!value) return "-";

  const raw = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const [year, month, day] = raw.slice(0, 10).split("-");
    return `${day}-${month}-${year}`;
  }

  return raw;
}

function getParticipantAge(participant: Participant) {
  if (participant.age !== undefined && participant.age !== null && String(participant.age).trim()) {
    return String(participant.age);
  }

  const birth = participant.birth_date || participant.date_of_birth;
  if (!birth) return "-";

  const date = new Date(birth);
  if (Number.isNaN(date.getTime())) return "-";

  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const monthDiff = today.getMonth() - date.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
    age -= 1;
  }

  return age > 0 ? String(age) : "-";
}

function getGenderShort(value: any) {
  const text = String(value || "").toLowerCase();

  if (text.startsWith("l") || text.includes("male") || text.includes("pria")) return "L";
  if (text.startsWith("p") || text.includes("female") || text.includes("wanita")) return "P";

  return safeText(value, "-").slice(0, 1).toUpperCase();
}

function getExamDate(participant: Participant) {
  return formatDate(participant.examination_date || participant.exam_date || new Date().toISOString().slice(0, 10));
}

function getExamTime() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function LabelPrinter({ user }: { user: any }) {
  const [sources, setSources] = useState<any[]>([]);
  const [sourceId, setSourceId] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selectedIds, setSelectedIds] = useState<Record<number, boolean>>({});
  const [stationKey, setStationKey] = useState("fisik");
  const [copies, setCopies] = useState(1);
  const [fontSize, setFontSize] = useState(9);
  const [showBorder, setShowBorder] = useState(false);
  const [showQr, setShowQr] = useState(true);
  const [showBarcodeText, setShowBarcodeText] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [printReady, setPrintReady] = useState(false);

  const program = user.program_type === "all" ? "capaska" : user.program_type;
  const selectedStation = STATIONS.find((s) => s.key === stationKey) || STATIONS[1];

  useEffect(() => {
    fetch(`/api/sources?program=${program}`)
      .then((r) => r.json())
      .then((d) => setSources(d.sources || []));
  }, [program]);

  useEffect(() => {
    const station = STATIONS.find((s) => s.key === stationKey);
    if (station) {
      setCopies(station.defaultCopies);
      setPrintReady(false);
    }
  }, [stationKey]);

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

      setParticipants(json.participants || {});
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
        /*
          v41 anti-rotate:
          Xprinter kadang membaca label 40x30 sebagai kertas portrait 30x40.
          Karena itu page dibuat 30x40, lalu kanvas label 40x30 diputar 90 derajat
          supaya hasil tidak terbelah ke dua stiker.
        */
        @page {
          size: 30mm 40mm;
          margin: 0;
        }

        @media print {
          html,
          body {
            width: 30mm !important;
            height: 40mm !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            background: white !important;
            color: black !important;
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
            padding: 0 !important;
            background: white !important;
            color: black !important;
            border-radius: 0 !important;
            transform-origin: top left !important;
            transform: rotate(90deg) translateY(-30mm) !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .label-page * {
            box-sizing: border-box;
          }

          .label-page:last-child {
            page-break-after: auto;
            break-after: auto;
          }
        }
      `}</style>

      <section className="card p-5 no-print">
        <div className="text-2xl font-black">Cetak Stiker Station Pemeriksaan</div>
        <div className="mt-1 text-sm text-slate-500">
          Layout stiker final 40mm × 30mm: data peserta lengkap, QR Kecil, No MCU footer, tanpa border default.
        </div>
        <div className="mt-2 w-fit rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
          Label v41 · anti rotate printer · 30x40 page
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

        <div className="mt-5 grid gap-4 md:grid-cols-5">
          <div>
            <label className="label">Station Pemeriksaan</label>
            <select
              className="input"
              value={stationKey}
              onChange={(e) => {
                setStationKey(e.target.value);
                setPrintReady(false);
              }}
            >
              {STATIONS.map((station) => (
                <option key={station.key} value={station.key}>
                  {station.label} ({station.defaultCopies} label)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Jumlah print</label>
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
            <div className="mt-1 text-xs text-slate-500">EKG default 2 label.</div>
          </div>

          <div>
            <label className="label">Ukuran font</label>
            <input
              type="number"
              min={7}
              max={12}
              className="input"
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value || 8))}
            />
          </div>

          <div className="flex items-end gap-2">
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold">
              <input
                type="checkbox"
                checked={showBorder}
                onChange={(e) => setShowBorder(e.target.checked)}
              />
              Border Label
            </label>
          </div>

          <div className="flex flex-col justify-end gap-2">
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold">
              <input
                type="checkbox"
                checked={showBarcodeText}
                onChange={(e) => setShowBarcodeText(e.target.checked)}
              />
              No MCU Footer
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold">
              <input
                type="checkbox"
                checked={showQr}
                onChange={(e) => setShowQr(e.target.checked)}
              />
              QR Kecil
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
                Terpilih {selectedParticipants.length} peserta × {copies} label = {labels.length} label station {selectedStation.label}
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
                  <th>No. MCU</th>
                  <th>NIK Karyawan</th>
                  <th>JK</th>
                  <th>Tgl Lahir</th>
                  <th>Usia</th>
                  <th>Database</th>
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
                    <td>{p.employee_nik || p.nik || "-"}</td>
                    <td>{getGenderShort(p.gender)}</td>
                    <td>{formatDate(p.birth_date || p.date_of_birth)}</td>
                    <td>{getParticipantAge(p)}</td>
                    <td>{p.source_name || "-"}</td>
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
              station={selectedStation}
              fontSize={fontSize}
              showBorder={showBorder}
              showQr={showQr}
              showBarcodeText={showBarcodeText}
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
              station={selectedStation}
              fontSize={fontSize}
              showBorder={showBorder}
              showQr={showQr}
              showBarcodeText={showBarcodeText}
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
  station,
  fontSize,
  showBorder,
  showQr,
  showBarcodeText,
  printMode = false
}: {
  participant: Participant;
  station: StationOption;
  fontSize: number;
  showBorder: boolean;
  showQr: boolean;
  showBarcodeText: boolean;
  printMode?: boolean;
}) {
  const idText = safeText(participant.mcu_id || participant.external_id || String(participant.id));
  const nameText = safeText(participant.name);
  const nikText = safeText(participant.employee_nik || participant.nik);
  const genderText = getGenderShort(participant.gender);
  const birthText = formatDate(participant.birth_date || participant.date_of_birth);
  const ageText = getParticipantAge(participant);
  const examDate = getExamDate(participant);
  const departmentText = safeText(participant.department, "");
  const packageText = safeText(participant.package_name || participant.company_name || participant.institution_name || participant.source_name || "MCU");

  const shortStation =
    station.label === "PENYAKIT DALAM"
      ? "P. DALAM"
      : station.label === "PEMERIKSAAN FISIK"
        ? "FISIK"
        : station.label.replace(" - ", " ");

  const metaFont = Math.max(fontSize - 2, 7);
  const headerFont = Math.max(fontSize - 2, 7);
  const nameFont = Math.max(fontSize + 1, 10);
  const footerFont = Math.max(fontSize - 2, 7);

  return (
    <div
      className={`${printMode ? "label-page" : ""} bg-white text-black`}
      style={{
        width: "40mm",
        height: "30mm",
        padding: "0.7mm 0.8mm 0.6mm 0.8mm",
        boxSizing: "border-box",
        border: showBorder ? "0.18mm solid #111" : "none",
        borderRadius: 0,
        overflow: "hidden",
        fontFamily: "Arial, Helvetica, sans-serif",
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact"
      }}
    >
      <div
        className="grid h-full w-full"
        style={{
          gridTemplateRows: "3.6mm 4.3mm 1fr 3.5mm",
          rowGap: "0.25mm"
        }}
      >
        <div
          className="grid items-center"
          style={{
            gridTemplateColumns: "1fr auto auto",
            columnGap: "1mm",
            fontSize: `${headerFont}px`,
            lineHeight: 1,
            whiteSpace: "nowrap",
            overflow: "hidden"
          }}
        >
          <div className="truncate font-black tracking-wide">{shortStation}</div>
          <div className="font-black">{genderText} / {ageText}</div>
          <div className="font-black">{examDate}</div>
        </div>

        <div
          className="truncate font-black uppercase"
          style={{
            fontSize: `${nameFont}px`,
            lineHeight: 1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis"
          }}
        >
          {nameText}
        </div>

        <div
          className="grid min-h-0"
          style={{
            gridTemplateColumns: showQr ? "1fr 9.6mm" : "1fr",
            columnGap: "0.8mm"
          }}
        >
          <div
            className="grid min-w-0"
            style={{
              gridTemplateRows: "repeat(5, 1fr)",
              rowGap: "0.1mm",
              fontSize: `${metaFont}px`,
              lineHeight: 1,
              overflow: "hidden"
            }}
          >
            {[
              ["No MCU", idText],
              ["NIK K", nikText],
              ["Lahir", birthText],
              ["Paket", packageText],
              ["Dept", departmentText || "-"]
            ].map(([label, value]) => (
              <div
                key={label}
                className="grid min-w-0 items-center"
                style={{
                  gridTemplateColumns: "7.6mm 1mm 1fr",
                  columnGap: "0.3mm",
                  whiteSpace: "nowrap",
                  overflow: "hidden"
                }}
              >
                <div className="truncate font-bold">{label}</div>
                <div className="font-bold">:</div>
                <div className="truncate font-bold">{value}</div>
              </div>
            ))}
          </div>

          {showQr && (
            <div className="flex items-start justify-end overflow-hidden">
              <QRCodeImage value={idText} size={34} />
            </div>
          )}
        </div>

        <div
          className="grid min-w-0 items-end"
          style={{
            gridTemplateColumns: "1fr auto",
            columnGap: "1mm",
            fontSize: `${footerFont}px`,
            lineHeight: 1,
            whiteSpace: "nowrap",
            overflow: "hidden"
          }}
        >
          <div
            className="truncate font-mono font-black tracking-[0.06em]"
            style={{ visibility: showBarcodeText ? "visible" : "hidden" }}
          >
            {idText}
          </div>

          <div
            className="font-black"
            style={{
              fontSize: `${Math.max(fontSize + 2, 11)}px`,
              lineHeight: 1
            }}
          >
            {station.shortCode}
          </div>
        </div>
      </div>
    </div>
  );
}
