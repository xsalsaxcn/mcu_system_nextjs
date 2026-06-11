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
  gender?: string;
  province?: string;
  label_printed_at?: string | null;
  label_printed_by?: string;
  label_print_count?: number;
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


function buildIphoneCameraQrValueV220(value: any) {
  const code = sanitizeQrText(value);
  if (!code) return "";

  // iPhone Camera lebih stabil membaca QR yang berisi URL.
  // Scanner Harmony tetap mengambil nomor MCU dari parameter scan.
  if (typeof window === "undefined") return code;
  const origin = String(window.location?.origin || "").trim();
  if (!origin) return code;
  return `${origin}/input?scan=${encodeURIComponent(code)}`;
}


function buildShortQrUrlV221(value: any) {
  const cleanCode = sanitizeQrText(value);
  if (!cleanCode) return "";
  const baseUrl = String(process.env.NEXT_PUBLIC_APP_URL || "https://inharmony-health.vercel.app").replace(/\/+$/, "");
  return baseUrl + "/q/" + encodeURIComponent(cleanCode);
}

function buildCombinedQrValue(participant: Participant) {
  const idText = sanitizeQrText(participant.mcu_id || participant.external_id || String(participant.id));
  const nameText = sanitizeQrText(participant.name);
  return `MCU=${idText};NAME=${nameText}`;
}

function normalizeGenderLabel(value: any) {
  const raw = String(value || "").trim();
  const compact = raw.toLowerCase().replace(/[^a-z]/g, "");

  if (!compact) return "";
  if (["putra", "pria", "lakilaki", "laki", "male", "m", "lk"].includes(compact)) return "PUTRA";
  if (["putri", "wanita", "perempuan", "female", "f", "pr"].includes(compact)) return "PUTRI";

  return raw.toUpperCase();
}

function LabelPrinter({ user }: { user: any }) {
  const [sources, setSources] = useState<any[]>([]);
  const [sourceId, setSourceId] = useState("all");
  const [labelPrintStatus, setLabelPrintStatus] = useState("unprinted");
  const [keyword, setKeyword] = useState("");
  const [loadLimit, setLoadLimit] = useState(500);
  const [pageSize, setPageSize] = useState(50);
  const [pageNumber, setPageNumber] = useState(1);
  const [tableFilters, setTableFilters] = useState<Record<string, string>>({});
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" }>({ key: "name", direction: "asc" });
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
  function labelTableValueV230(participant: Participant, key: string) {
    const anyParticipant = participant as any;
    if (key === "selected") return selectedIds[participant.id] ? "1" : "0";
    if (key === "name") return participant.name || "";
    if (key === "mcu_id") return participant.mcu_id || participant.external_id || anyParticipant.barcode_value || "";
    if (key === "source_name") return participant.source_name || anyParticipant.database_name || anyParticipant.source || "";
    if (key === "gender") return participant.gender || anyParticipant.jenis_kelamin || "";
    if (key === "province") return participant.province || anyParticipant.provinsi || "";
    if (key === "print_status") return anyParticipant.label_printed_at ? "Sudah print" : "Belum print";
    return String(anyParticipant[key] || "");
  }

  function updateTableFilterV230(key: string, value: string) {
    setTableFilters((prev) => ({ ...prev, [key]: value }));
    setPageNumber(1);
  }

  function toggleSortV230(key: string) {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc"
    }));
    setPageNumber(1);
  }

  function sortLabelV230(key: string) {
    if (sortConfig.key !== key) return "↕";
    return sortConfig.direction === "asc" ? "↑" : "↓";
  }

  const filteredParticipants = useMemo(() => {
    const filters = Object.entries(tableFilters).filter(([, value]) => String(value || "").trim());
    const filtered = participants.filter((participant) => {
      return filters.every(([key, value]) =>
        labelTableValueV230(participant, key).toLowerCase().includes(String(value).toLowerCase().trim())
      );
    });

    return [...filtered].sort((a, b) => {
      const av = labelTableValueV230(a, sortConfig.key).toLowerCase();
      const bv = labelTableValueV230(b, sortConfig.key).toLowerCase();
      const cmp = av.localeCompare(bv, "id", { numeric: true, sensitivity: "base" });
      return sortConfig.direction === "asc" ? cmp : -cmp;
    });
  }, [participants, tableFilters, sortConfig, selectedIds]);

  const totalTablePages = Math.max(1, Math.ceil(filteredParticipants.length / Math.max(1, pageSize)));
  const safePageNumber = Math.min(pageNumber, totalTablePages);

  const pagedParticipants = useMemo(() => {
    const start = (safePageNumber - 1) * pageSize;
    return filteredParticipants.slice(start, start + pageSize);
  }, [filteredParticipants, safePageNumber, pageSize]);

  function FilterInputV230({ column, placeholder }: { column: string; placeholder: string }) {
    return (
      <input
        className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700"
        value={tableFilters[column] || ""}
        onChange={(event) => updateTableFilterV230(column, event.target.value)}
        placeholder={placeholder}
      />
    );
  }


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
        limit: String(loadLimit),
        label_print_status: labelPrintStatus
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

      setPageNumber(1);
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

  async function markSelectedPrinted() {
    const ids = selectedParticipants.map((p) => p.id);
    if (!ids.length) {
      setMessage("Pilih peserta yang sudah dicetak dulu.");
      return;
    }

    setLoading(true);
    setMessage("Menandai label sebagai sudah print...");

    try {
      const res = await fetch("/api/labels/mark-printed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids })
      });
      const json = await res.json();
      if (!json.ok) {
        setMessage(json.message || "Gagal menandai sudah print.");
        return;
      }
      setMessage(`Berhasil menandai ${json.updated || ids.length} peserta sebagai Sudah print.`);
      setSelectedIds({});
      await loadParticipants();
    } catch (error: any) {
      setMessage(error?.message || "Gagal menandai sudah print.");
    } finally {
      setLoading(false);
    }
  }

  function printLabels() {
    setPrintReady(true);
    setTimeout(() => window.print(), 350);
    setMessage("Jika label sudah tercetak, klik tombol Tandai Sudah Print supaya peserta tidak muncul lagi di filter Belum print.");
  }

  return (
    <div className="space-y-5">
      <style jsx global>{`
        @page {
          size: 50mm 30mm;
          margin: 0;
        }

        @media print {
          html,
          body {
            width: 50mm;
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
            width: 50mm !important;
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
          Search dibuat ringan. QR/barcode berisi kode singkat agar lebih mudah discan Android dan iPhone.
        </div>
        <div className="mt-2 w-fit rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
          Label Search v230 · data lengkap · filter & sort header
        </div>
      </section>

      <section className="card p-5 no-print">
        <form onSubmit={loadParticipants} className="grid gap-3 lg:grid-cols-[1fr_1fr_220px_auto]">
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
              max={160}
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
                Terpilih {selectedParticipants.length} peserta x {copies} stiker = {labels.length} label
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

          <div className="mb-3 rounded-2xl border border-slate-200 bg-slate-50 p-3" data-label="Data ditampilkan v230">
            <div className="grid gap-3 md:grid-cols-4">
              <div>
                <label className="label">Ambil data maksimal</label>
                <select
                  className="input"
                  value={loadLimit}
                  onChange={(event) => {
                    setLoadLimit(Number(event.target.value || 500));
                    setParticipants([]);
                    setSelectedIds({});
                    setPrintReady(false);
                  }}
                >
                  <option value={100}>100 data</option>
                  <option value={250}>250 data</option>
                  <option value={500}>500 data</option>
                  <option value={1000}>1000 data</option>
                </select>
              </div>
              <div>
                <label className="label">Baris per halaman</label>
                <select
                  className="input"
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value || 50));
                    setPageNumber(1);
                  }}
                >
                  <option value={25}>25 baris</option>
                  <option value={50}>50 baris</option>
                  <option value={100}>100 baris</option>
                  <option value={250}>250 baris</option>
                  <option value={1000}>Semua yang terambil</option>
                </select>
              </div>
              <div className="md:col-span-2 flex items-end justify-between gap-2 text-sm font-semibold text-slate-600">
                <div>
                  Menampilkan {pagedParticipants.length} dari {filteredParticipants.length} data terfilter
                  {participants.length !== filteredParticipants.length ? ` · total terambil ${participants.length}` : ""}
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setTableFilters({});
                    setSortConfig({ key: "name", direction: "asc" });
                    setPageNumber(1);
                  }}
                >
                  Reset Filter
                </button>
              </div>
            </div>
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-slate-600">
            <div>Halaman {safePageNumber} dari {totalTablePages}</div>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" disabled={safePageNumber <= 1} onClick={() => setPageNumber(1)}>
                Awal
              </button>
              <button type="button" className="btn-secondary" disabled={safePageNumber <= 1} onClick={() => setPageNumber((p) => Math.max(1, p - 1))}>
                Sebelumnya
              </button>
              <button type="button" className="btn-secondary" disabled={safePageNumber >= totalTablePages} onClick={() => setPageNumber((p) => Math.min(totalTablePages, p + 1))}>
                Berikutnya
              </button>
              <button type="button" className="btn-secondary" disabled={safePageNumber >= totalTablePages} onClick={() => setPageNumber(totalTablePages)}>
                Akhir
              </button>
            </div>
          </div>

          <div className="mobile-table">
            <table>
              <thead>
                <tr>
                  <th>
                    <button type="button" className="font-black" onClick={() => toggleSortV230("selected")}>Pilih {sortLabelV230("selected")}</button>
                  </th>
                  <th>
                    <button type="button" className="font-black" onClick={() => toggleSortV230("name")}>Nama {sortLabelV230("name")}</button>
                  </th>
                  <th>
                    <button type="button" className="font-black" onClick={() => toggleSortV230("mcu_id")}>Nomor MCU {sortLabelV230("mcu_id")}</button>
                  </th>
                  <th>
                    <button type="button" className="font-black" onClick={() => toggleSortV230("source_name")}>Database {sortLabelV230("source_name")}</button>
                  </th>
                  <th>
                    <button type="button" className="font-black" onClick={() => toggleSortV230("gender")}>Jenis Kelamin {sortLabelV230("gender")}</button>
                  </th>
                  <th>
                    <button type="button" className="font-black" onClick={() => toggleSortV230("province")}>Provinsi {sortLabelV230("province")}</button>
                  </th>
                  <th>
                    <button type="button" className="font-black" onClick={() => toggleSortV230("print_status")}>Status Label {sortLabelV230("print_status")}</button>
                  </th>
                </tr>
                <tr>
                  <th></th>
                  <th><FilterInputV230 column="name" placeholder="Filter nama" /></th>
                  <th><FilterInputV230 column="mcu_id" placeholder="Filter MCU" /></th>
                  <th><FilterInputV230 column="source_name" placeholder="Filter database" /></th>
                  <th><FilterInputV230 column="gender" placeholder="Filter gender" /></th>
                  <th><FilterInputV230 column="province" placeholder="Filter provinsi" /></th>
                  <th><FilterInputV230 column="print_status" placeholder="Sudah/Belum" /></th>
                </tr>
              </thead>
              <tbody>
                {pagedParticipants.map((p) => (
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
                    <td>{normalizeGenderLabel((p as any).gender) || "-"}</td>
                    <td>{p.province || "-"}</td>
                    <td>
                      {(p as any).label_printed_at ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">Sudah print</span>
                      ) : (
                        <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">Belum print</span>
                      )}
                    </td>
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
  showQr = true,
  showBarcodeText = false,
  printMode = false
}: {
  participant: Participant;
  qrSize: number;
  fontSize: number;
  showBorder: boolean;
  showQr?: boolean;
  showBarcodeText?: boolean;
  printMode?: boolean;
}) {
  const idText = sanitizeQrText(participant.mcu_id || participant.external_id || String(participant.id));
  const qrValue = idText;
  const nameText = sanitizeQrText(participant.name).toUpperCase();
  const institution = participant.company_name || participant.institution_name || "BPIP / CAPASKA";
  const participantAny = participant as any;
  const birthDate = participantAny.date_of_birth || participantAny.birth_date || participantAny.tanggal_lahir || participantAny.dob || "";
  const genderText = normalizeGenderLabel(participantAny.gender || participantAny.jenis_kelamin || participantAny.sex || "");
  const provinceText = participantAny.province || participantAny.provinsi || participantAny.location || participantAny.lokasi || participantAny.department || "";

  const safeFont = Number(fontSize || 10);
  const nameFont =
    nameText.length > 34 ? Math.max(12, safeFont + 2) :
    nameText.length > 24 ? Math.max(14, safeFont + 4) :
    Math.max(16, safeFont + 6);

  const qrPx = Math.min(160, Math.max(38, Number(qrSize || 46)));
  const labelInfoFont = Math.max(9, safeFont);
  const genderProvinceFont = Math.max(10, safeFont + 2);

  return (
    <section
      className={`${printMode ? "label-page" : ""} bg-white`}
      style={{
        position: "relative",
        overflow: "hidden",
        border: showBorder ? "1px solid #d4d4d8" : undefined,
        borderRadius: showBorder ? "18px" : undefined,
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact"
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "8%",
          top: "8%",
          right: "8%",
          zIndex: 2
        }}
      >
        <div
          style={{
            fontSize: `${nameFont}px`,
            lineHeight: 1.03,
            fontWeight: 900,
            color: "#000000",
            whiteSpace: "normal",
            wordBreak: "break-word",
            overflowWrap: "anywhere",
            letterSpacing: "-0.03em",
            maxHeight: "36%",
            overflow: "hidden"
          }}
        >
          {nameText || "-"}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: "8%",
          top: "39%",
          right: showQr ? "34%" : "8%",
          zIndex: 2,
          fontSize: `${labelInfoFont}px`,
          lineHeight: 1.12,
          fontWeight: 700,
          color: "#111827",
          whiteSpace: "normal",
          wordBreak: "break-word",
          overflowWrap: "anywhere"
        }}
      >
        <div>MCU: {idText || "-"}</div>
        <div style={{ marginTop: "4px" }}>{institution || "-"}</div>
        {birthDate ? <div style={{ marginTop: "4px" }}>TTL: {birthDate}</div> : null}
        {genderText ? (
          <div
            style={{
              marginTop: "4px",
              fontSize: `${genderProvinceFont}px`,
              lineHeight: 1.05,
              fontWeight: 900,
              color: "#000000",
              textTransform: "uppercase"
            }}
          >
            {genderText}
          </div>
        ) : null}
        {provinceText ? (
          <div
            style={{
              marginTop: "2px",
              fontSize: `${genderProvinceFont}px`,
              lineHeight: 1.05,
              fontWeight: 900,
              color: "#000000",
              whiteSpace: "normal",
              overflow: "visible",
              textOverflow: "clip",
              wordBreak: "break-word",
              overflowWrap: "anywhere",
              maxWidth: "100%"
            }}
          >
            {provinceText}
          </div>
        ) : null}
      </div>

      {showQr && (
        <div
          style={{
            position: "absolute",
            right: "auto",
            bottom: showBarcodeText ? "12%" : "5%",
            width: `${qrPx}px`,
            height: `${qrPx}px`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#ffffff",
            padding: "1px",
            zIndex: 5,
            left: `calc(50mm - ${qrPx}px - 0.5mm)`,
          }}
        >
          <QRCodeImage value={qrValue} size={qrPx} />
        </div>
      )}

      {showQr && showBarcodeText && (
        <div
          style={{
            position: "absolute",
            right: "1%",
            bottom: "3%",
            width: "34%",
            textAlign: "center",
            fontSize: "9px",
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
