"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import QRCodeImage from "@/components/QRCodeImage";

type Participant = {
  id: number;
  name: string;
  mcu_id?: string;
  external_id?: string;
  barcode_value?: string;
  package_name?: string;
  company_name?: string;
  source_name?: string;
  institution_name?: string;
  province?: string;
  gender?: string;
  department?: string;
  label_printed_at?: string | null;
  label_printed_by?: string;
  label_print_count?: number;
  label_print_status?: string;
  [key: string]: any;
};

type LabelItem = {
  participant: Participant;
  copyIndex: number;
  labelTitle: string;
};

const DEFAULT_LABEL_TITLES = ["FISIK", "DOKTER", "LAB", "RO", "EKG", "AUDIOMETRI", "SPIROMETRI", "TREADMILL"];

export default function LabelsPage() {
  return <AuthGate>{(user) => <LabelPrinter user={user} />}</AuthGate>;
}

function sanitizeText(value: any) {
  return String(value ?? "")
    .replace(/[;\n\r]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickText(source: any, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = source?.[key];
    const text = sanitizeText(value);
    if (text) return text;
  }
  return fallback;
}

function shortGender(value: string) {
  const text = value.toLowerCase();
  if (!text) return "-";
  if (text.includes("putri") || text.includes("perempuan") || text === "p" || text.includes("female")) return "P";
  if (text.includes("putra") || text.includes("laki") || text === "l" || text.includes("male")) return "L";
  return value.slice(0, 1).toUpperCase();
}

function isLabelPrinted(participant: Participant) {
  const status = String(participant.label_print_status || participant.print_status || "").toLowerCase();
  return Boolean(
    participant.label_printed_at ||
      participant.label_printed ||
      status.includes("sudah") ||
      status.includes("printed")
  );
}

function LabelPrinter({ user }: { user: any }) {
  const [sources, setSources] = useState<any[]>([]);
  const [sourceId, setSourceId] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selectedIds, setSelectedIds] = useState<Record<number, boolean>>({});
  const [copies, setCopies] = useState(6);
  const [qrSize, setQrSize] = useState(38);
  const [fontSize, setFontSize] = useState(7);
  const [showBorder, setShowBorder] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [printReady, setPrintReady] = useState(false);
  const [loadLimit, setLoadLimit] = useState(500);
  const [pageSize, setPageSize] = useState(50);
  const [pageNumber, setPageNumber] = useState(1);
  const [tableFilters, setTableFilters] = useState<Record<string, string>>({});
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" }>({
    key: "name",
    direction: "asc"
  });

  const program = user.program_type === "all" ? "capaska" : user.program_type;

  useEffect(() => {
    fetch(`/api/sources?program=${program}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setSources(d.sources || []))
      .catch(() => setSources([]));
  }, [program]);

  const selectedParticipants = useMemo(() => {
    return participants.filter((p) => selectedIds[p.id]);
  }, [participants, selectedIds]);

  const labels = useMemo<LabelItem[]>(() => {
    const rows: LabelItem[] = [];
    for (const participant of selectedParticipants) {
      for (let i = 0; i < copies; i += 1) {
        rows.push({
          participant,
          copyIndex: i,
          labelTitle: DEFAULT_LABEL_TITLES[i] || `LABEL ${i + 1}`
        });
      }
    }
    return rows;
  }, [selectedParticipants, copies]);

  function labelTableValue(participant: Participant, key: string) {
    if (key === "selected") return selectedIds[participant.id] ? "1" : "0";
    if (key === "name") return participant.name || "";
    if (key === "mcu_id") return participant.mcu_id || participant.external_id || participant.barcode_value || "";
    if (key === "source_name") return participant.source_name || participant.database_name || participant.source || "";
    if (key === "gender") return participant.gender || participant.jenis_kelamin || participant.sex || "";
    if (key === "province") return participant.province || participant.provinsi || "";
    if (key === "print_status") return isLabelPrinted(participant) ? "Sudah print" : "Belum print";
    return String(participant[key] || "");
  }

  const filteredParticipants = useMemo(() => {
    const filters = Object.entries(tableFilters).filter(([, value]) => value.trim());
    const filtered = participants.filter((participant) => {
      return filters.every(([key, value]) =>
        labelTableValue(participant, key).toLowerCase().includes(value.toLowerCase().trim())
      );
    });

    return [...filtered].sort((a, b) => {
      const av = labelTableValue(a, sortConfig.key).toLowerCase();
      const bv = labelTableValue(b, sortConfig.key).toLowerCase();
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

  if (user.role !== "admin") {
    return <div className="card p-5 text-red-700">Hanya admin yang dapat cetak label barcode.</div>;
  }

  async function loadParticipants(e?: FormEvent) {
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
        _t: String(Date.now())
      });

      const res = await fetch(`/api/labels/participants?${params.toString()}`, { cache: "no-store" });
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
      setMessage(count ? `Ditemukan ${count} peserta. Pilih peserta lalu print label.` : json.message || "Peserta tidak ditemukan.");
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
    filteredParticipants.forEach((p) => {
      next[p.id] = checked;
    });
    setSelectedIds(next);
    setPrintReady(false);
  }

  function updateTableFilter(key: string, value: string) {
    setTableFilters((prev) => ({ ...prev, [key]: value }));
    setPageNumber(1);
  }

  function toggleSort(key: string) {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc"
    }));
    setPageNumber(1);
  }

  function sortLabel(key: string) {
    if (sortConfig.key !== key) return "↕";
    return sortConfig.direction === "asc" ? "↑" : "↓";
  }

  function FilterInput({ column, placeholder }: { column: string; placeholder: string }) {
    return (
      <input
        className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700"
        value={tableFilters[column] || ""}
        onChange={(event) => updateTableFilter(column, event.target.value)}
        placeholder={placeholder}
      />
    );
  }

  function printLabels() {
    setPrintReady(true);
    setMessage("Mode print siap. Pastikan printer memakai media 40mm x 30mm, scale 100%, margin none/default printer.");
    setTimeout(() => window.print(), 350);
  }

  async function markSelectedPrinted() {
    const ids = Array.from(
      new Set(
        Object.entries(selectedIds)
          .filter(([, checked]) => Boolean(checked))
          .map(([id]) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0)
      )
    );

    if (!ids.length) {
      const msg = "Centang peserta dulu, lalu klik Tandai Sudah Print.";
      setMessage(msg);
      window.alert(msg);
      return;
    }

    const confirmed = window.confirm("Tandai " + ids.length + " peserta sebagai Sudah print?");
    if (!confirmed) return;

    setLoading(true);
    setMessage("Menandai peserta sebagai Sudah print...");

    try {
      const res = await fetch("/api/labels/mark-printed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) throw new Error(json.message || json.error || "Gagal menandai Sudah print.");

      const printedAt = json.printed_at || new Date().toISOString();
      setParticipants((prev) =>
        prev.map((p) =>
          ids.includes(Number(p.id))
            ? {
                ...p,
                label_printed_at: printedAt,
                label_printed_by: "printed",
                label_print_count: Number(p.label_print_count || 0) + 1,
                label_print_status: "printed",
                print_status: "Sudah print",
                label_printed: true
              }
            : p
        )
      );
      setSelectedIds({});
      setPrintReady(false);
      const successMsg = "Berhasil menandai " + (json.updated || ids.length) + " peserta sebagai Sudah print.";
      setMessage(successMsg);
      window.alert(successMsg);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error || "Gagal menandai Sudah print.");
      setMessage(msg);
      window.alert(msg);
    } finally {
      setLoading(false);
    }
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
            width: 40mm !important;
            min-width: 40mm !important;
            max-width: 40mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            overflow: visible !important;
          }

          header,
          nav,
          .no-print {
            display: none !important;
          }

          main {
            max-width: none !important;
            width: 40mm !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          .print-area {
            display: block !important;
            width: 40mm !important;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
          }

          .label-page {
            width: 40mm !important;
            height: 30mm !important;
            min-width: 40mm !important;
            max-width: 40mm !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            page-break-after: always;
            break-after: page;
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
          Layout dikunci ke ukuran stiker 40mm x 30mm. QR berisi kode MCU singkat agar tetap mudah discan.
        </div>
        <div className="mt-2 w-fit rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
          Label Layout v246 · 40x30 stable · QR kanan dalam stiker
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

        {message && <div className="mt-4 rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">{message}</div>}

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
              max={10}
              className="input"
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value || 7))}
            />
          </div>

          <div>
            <label className="label">Ukuran QR</label>
            <input
              type="number"
              min={30}
              max={48}
              className="input"
              value={qrSize}
              onChange={(e) => setQrSize(Number(e.target.value || 38))}
            />
          </div>

          <div className="flex items-end gap-2">
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold">
              <input type="checkbox" checked={showBorder} onChange={(e) => setShowBorder(e.target.checked)} />
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

            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={() => toggleAll(true)}>
                Pilih Semua Terfilter
              </button>
              <button type="button" className="btn-secondary" onClick={() => toggleAll(false)}>
                Kosongkan
              </button>
              <button type="button" className="btn-primary" onClick={printLabels} disabled={!labels.length}>
                Print Label
              </button>
            </div>
          </div>

          <div className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-black text-emerald-900">Status Label Printing</div>
                <div className="text-sm font-semibold text-emerald-700">
                  Setelah label benar-benar tercetak, klik tombol ini agar peserta pindah dari Belum print ke Sudah print.
                </div>
              </div>
              <button type="button" className="btn-primary" onClick={markSelectedPrinted} disabled={loading}>
                Tandai Sudah Print
              </button>
            </div>
          </div>

          <div className="mb-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
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
            <div>
              Halaman {safePageNumber} dari {totalTablePages}
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" disabled={safePageNumber <= 1} onClick={() => setPageNumber(1)}>
                Awal
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={safePageNumber <= 1}
                onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
              >
                Sebelumnya
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={safePageNumber >= totalTablePages}
                onClick={() => setPageNumber((p) => Math.min(totalTablePages, p + 1))}
              >
                Berikutnya
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={safePageNumber >= totalTablePages}
                onClick={() => setPageNumber(totalTablePages)}
              >
                Akhir
              </button>
            </div>
          </div>

          <div className="mobile-table">
            <table>
              <thead>
                <tr>
                  <th>
                    <button type="button" className="font-black" onClick={() => toggleSort("selected")}>
                      Pilih {sortLabel("selected")}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="font-black" onClick={() => toggleSort("name")}>
                      Nama {sortLabel("name")}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="font-black" onClick={() => toggleSort("mcu_id")}>
                      Nomor MCU {sortLabel("mcu_id")}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="font-black" onClick={() => toggleSort("source_name")}>
                      Database {sortLabel("source_name")}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="font-black" onClick={() => toggleSort("gender")}>
                      Jenis Kelamin {sortLabel("gender")}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="font-black" onClick={() => toggleSort("province")}>
                      Provinsi {sortLabel("province")}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="font-black" onClick={() => toggleSort("print_status")}>
                      Status Label {sortLabel("print_status")}
                    </button>
                  </th>
                </tr>
                <tr>
                  <th></th>
                  <th>
                    <FilterInput column="name" placeholder="Filter nama" />
                  </th>
                  <th>
                    <FilterInput column="mcu_id" placeholder="Filter MCU" />
                  </th>
                  <th>
                    <FilterInput column="source_name" placeholder="Filter database" />
                  </th>
                  <th>
                    <FilterInput column="gender" placeholder="Filter gender" />
                  </th>
                  <th>
                    <FilterInput column="province" placeholder="Filter provinsi" />
                  </th>
                  <th>
                    <FilterInput column="print_status" placeholder="Sudah/Belum" />
                  </th>
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
                    <td>{p.mcu_id || p.external_id || p.barcode_value || "-"}</td>
                    <td>{p.source_name || p.database_name || "-"}</td>
                    <td>{p.gender || p.jenis_kelamin || "-"}</td>
                    <td>{p.province || p.provinsi || "-"}</td>
                    <td>
                      {isLabelPrinted(p) ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700">Sudah print</span>
                      ) : (
                        <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-black text-amber-700">Belum print</span>
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
          {labels.slice(0, 6).map((item, index) => (
            <LabelCard
              key={`${item.participant.id}-${item.copyIndex}-${index}`}
              item={item}
              qrSize={qrSize}
              fontSize={fontSize}
              showBorder={showBorder}
            />
          ))}
          {!labels.length && <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Pilih peserta untuk melihat preview.</div>}
        </div>
      </section>

      {printReady && (
        <section className="print-area hidden">
          {labels.map((item, index) => (
            <LabelCard
              key={`${item.participant.id}-print-${item.copyIndex}-${index}`}
              item={item}
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
  item,
  qrSize,
  fontSize,
  showBorder,
  printMode = false
}: {
  item: LabelItem;
  qrSize: number;
  fontSize: number;
  showBorder: boolean;
  printMode?: boolean;
}) {
  const participant = item.participant;
  const idText = pickText(participant, ["mcu_id", "external_id", "barcode_value", "id"], "-");
  const qrValue = idText;
  const nameText = pickText(participant, ["name", "nama"], "-").toUpperCase();
  const genderText = shortGender(pickText(participant, ["gender", "jenis_kelamin", "sex"], ""));
  const birthDate = pickText(participant, ["date_of_birth", "birth_date", "tanggal_lahir", "tgl_lahir", "dob"], "-");
  const nikText = pickText(participant, ["nik", "nik_ktp", "ktp", "no_ktp"], "-");
  const packageText = pickText(participant, ["package_name", "paket", "package"], "-");
  const deptText = pickText(participant, ["department", "dept", "bagian", "divisi", "division"], "-");
  const provinceText = pickText(participant, ["province", "provinsi", "location", "lokasi"], "");
  const safeFont = Math.min(10, Math.max(6, Number(fontSize || 7)));
  const nameFont = nameText.length > 34 ? 7.1 : nameText.length > 26 ? 7.8 : 8.8;
  const infoFont = Math.max(5.3, safeFont - 1.2);
  const qrPx = Math.min(48, Math.max(30, Number(qrSize || 38)));

  return (
    <section
      className={`${printMode ? "label-page" : ""} bg-white`}
      style={{
        position: "relative",
        width: "40mm",
        height: "30mm",
        minWidth: "40mm",
        maxWidth: "40mm",
        boxSizing: "border-box",
        overflow: "hidden",
        border: showBorder ? "1px solid #d4d4d8" : undefined,
        borderRadius: showBorder ? "3mm" : undefined,
        background: "#ffffff",
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
        fontFamily: "Arial, Helvetica, sans-serif",
        color: "#000000"
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "2.2mm",
          top: "1.7mm",
          width: "35.6mm",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "1mm",
          fontSize: "5.7pt",
          lineHeight: 1,
          fontWeight: 900,
          color: "#111827",
          whiteSpace: "nowrap",
          overflow: "hidden"
        }}
      >
        <div style={{ maxWidth: "17mm", overflow: "hidden", textOverflow: "ellipsis" }}>{item.labelTitle}</div>
        <div style={{ maxWidth: "17mm", overflow: "hidden", textOverflow: "ellipsis", textAlign: "right" }}>
          {genderText} / {birthDate}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: "2.2mm",
          top: "5.5mm",
          width: "25.5mm",
          maxHeight: "6.8mm",
          overflow: "hidden",
          fontSize: `${nameFont}pt`,
          lineHeight: 0.95,
          fontWeight: 900,
          letterSpacing: "-0.04em",
          wordBreak: "break-word",
          overflowWrap: "anywhere"
        }}
      >
        {nameText}
      </div>

      <div
        style={{
          position: "absolute",
          left: "2.2mm",
          top: "13mm",
          width: "25.5mm",
          maxHeight: "11.7mm",
          overflow: "hidden",
          fontSize: `${infoFont}pt`,
          lineHeight: 1.18,
          fontWeight: 800,
          color: "#1f2937",
          wordBreak: "break-word",
          overflowWrap: "anywhere"
        }}
      >
        <div>No MCU : {idText}</div>
        <div>NIK : {nikText}</div>
        <div>Lahir : {birthDate}</div>
        <div>Paket : {packageText}</div>
        <div>Dept : {deptText}</div>
      </div>

      <div
        style={{
          position: "absolute",
          right: "2.1mm",
          top: "10.3mm",
          width: "10.3mm",
          height: "10.3mm",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
          overflow: "hidden",
          zIndex: 2
        }}
      >
        <QRCodeImage value={qrValue} size={qrPx} />
      </div>

      <div
        style={{
          position: "absolute",
          right: "1.4mm",
          bottom: "3.1mm",
          width: "11.5mm",
          textAlign: "center",
          fontSize: "4.6pt",
          lineHeight: 1,
          fontWeight: 900,
          color: "#111827",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis"
        }}
      >
        {idText}
      </div>

      {provinceText ? (
        <div
          style={{
            position: "absolute",
            left: "2.2mm",
            bottom: "2mm",
            width: "25.5mm",
            maxHeight: "3.5mm",
            overflow: "hidden",
            fontSize: "5.2pt",
            lineHeight: 1,
            fontWeight: 900,
            color: "#111827",
            wordBreak: "break-word",
            overflowWrap: "anywhere"
          }}
        >
          {provinceText}
        </div>
      ) : null}
    </section>
  );
}
