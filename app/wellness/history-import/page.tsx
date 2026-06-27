"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import AuthGate from "@/components/AuthGate";

// WELLNESS_HISTORY_IMPORT_V352_PAGE
// WELLNESS_HISTORY_AUTO_MAPPING_V353_PAGE
// WELLNESS_HISTORY_GROUP_FILTER_V354_PAGE

const requiredColumns = [
  ["KODE", "Kunci cocok ke peserta Wellness. Bisa juga No Karyawan / Employee ID."],
  ["Nama Karyawan", "Nama peserta untuk validasi dan tampilan hasil import."],
  ["Tanggal Periksa", "Tanggal MCU / Mini MCU / Final MCU."],
];

const clinicalColumns = [
  ["NO. LAB", "Opsional. Nomor lab / nomor pemeriksaan."],
  ["Nama Grup", "Risk Cluster klinis, misalnya Grup A - Triple Risk."],
  ["Risk Level", "Low / Medium / High / prioritas."],
  ["Selection Reason", "Alasan peserta masuk program Wellness."],
  ["HbA1c Raw", "Teks mentah dari lab bila ada."],
  ["HbA1c %", "Nilai HbA1c angka, contoh 7.1."],
  ["Tensi Raw", "Contoh 156/101."],
  ["Sistolik", "Angka sistolik."],
  ["Diastolik", "Angka diastolik."],
  ["BMI", "Nilai BMI/IMT."],
  ["BB", "Berat badan kg, opsional."],
  ["TB", "Tinggi badan cm, opsional."],
  ["Lingkar Perut", "Waist circumference cm, opsional."],
  ["Gula Darah", "GDP/GDS/glucose, opsional."],
  ["Risk Score", "Skor risiko awal/akhir."],
  ["Fokus Intervensi", "Treatment plan awal."],
  ["Monitoring Day-by-Day", "Rencana monitoring."],
  ["Catatan Validasi Medis", "Catatan dokter/nakes."],
  ["Status Program", "Status awal/final program."],
];

type MappingTarget = {
  key: string;
  label: string;
  required?: boolean;
  aliases: string[];
};

const mappingTargets: MappingTarget[] = [
  { key: "employee_code", label: "KODE / No Karyawan", required: true, aliases: ["KODE", "Kode", "No Karyawan", "Nomor Karyawan", "Employee No", "Employee ID", "NIK", "Nomor Induk"] },
  { key: "participant_name", label: "Nama Karyawan", required: true, aliases: ["Nama Karyawan", "Nama", "Nama Peserta", "Nama Lengkap", "Name"] },
  { key: "checkup_date", label: "Tanggal Periksa", required: true, aliases: ["Tanggal Periksa", "Tanggal Pemeriksaan", "Tanggal MCU", "MCU Date", "Exam Date", "Checkup Date"] },
  { key: "lab_no", label: "NO. LAB", aliases: ["NO. LAB", "No Lab", "Nomor Lab", "Lab No"] },
  { key: "sex", label: "Jenis Kelamin", aliases: ["Sex", "Jenis Kelamin", "Gender"] },
  { key: "department", label: "Departemen / Divisi", aliases: ["Departemen", "Department", "Divisi", "Unit"] },
  { key: "position", label: "Jabatan", aliases: ["Jabatan", "Position", "Job Title"] },
  { key: "group_name", label: "Group saat create peserta", aliases: ["Kelompok", "Group", "Nama Grup", "Divisi", "Departemen"] },
  { key: "history_type", label: "Jenis History", aliases: ["Jenis History", "History Type", "Visit Type", "Tipe Pemeriksaan"] },
  { key: "visit_label", label: "Visit Label", aliases: ["Visit Label", "Label Pemeriksaan", "Periode", "Week", "Minggu"] },
  { key: "risk_cluster", label: "Risk Cluster / Nama Grup", aliases: ["Nama Grup", "Risk Cluster", "Risk Group", "Kelompok Risiko", "Kategori Risiko"] },
  { key: "risk_level", label: "Risk Level", aliases: ["Risk Level", "Level Risiko", "Prioritas"] },
  { key: "selection_reason", label: "Selection Reason", aliases: ["Selection Reason", "Alasan Seleksi", "Alasan Masuk Program"] },
  { key: "hba1c_raw", label: "HbA1c Raw", aliases: ["HbA1c Raw", "HBA1C Raw", "A1C Raw"] },
  { key: "hba1c_percent", label: "HbA1c %", aliases: ["HbA1c %", "HbA1c", "HBA1C", "A1C", "Hb A1c"] },
  { key: "hba1c_flag", label: "HbA1c >6.4?", aliases: ["HbA1c >6.4?", "HbA1c Tinggi", "A1C High"] },
  { key: "bp_raw", label: "Tensi Raw", aliases: ["Tensi Raw", "Tekanan Darah", "Tensi", "BP", "Blood Pressure"] },
  { key: "systolic", label: "Sistolik", aliases: ["Sistolik", "Sistol", "SBP", "Systolic", "Systolic BP"] },
  { key: "diastolic", label: "Diastolik", aliases: ["Diastolik", "Diastol", "DBP", "Diastolic", "Diastolic BP"] },
  { key: "height_cm", label: "TB / Tinggi Badan", aliases: ["Tinggi Badan", "TB", "Height", "Height Cm"] },
  { key: "weight_kg", label: "BB / Berat Badan", aliases: ["Berat Badan", "BB", "BB Awal", "Berat Badan Awal", "Weight", "Initial Weight"] },
  { key: "bmi", label: "BMI / IMT", aliases: ["BMI", "IMT", "Body Mass Index"] },
  { key: "bmi_flag", label: "BMI >30?", aliases: ["BMI >30?", "BMI Tinggi", "Obesity"] },
  { key: "waist_cm", label: "Lingkar Perut", aliases: ["Lingkar Perut", "Waist", "Waist Cm", "Waist Circumference"] },
  { key: "glucose_value", label: "Gula Darah", aliases: ["Gula Darah", "Glucose", "GDP", "GDS", "Fasting Glucose", "Random Glucose", "Blood Glucose"] },
  { key: "bp_flag", label: "Tensi >150/100?", aliases: ["Tensi >150/100?", "Tekanan Darah Tinggi", "BP High"] },
  { key: "criteria_count", label: "Jumlah Kriteria", aliases: ["Jumlah Kriteria", "Criteria Count", "Jumlah Risk"] },
  { key: "risk_score", label: "Risk Score", aliases: ["Risk Score", "Skor Risiko"] },
  { key: "intervention_focus", label: "Fokus Intervensi", aliases: ["Fokus Intervensi", "Intervention Focus", "Treatment Plan"] },
  { key: "monitoring_plan", label: "Monitoring Day-by-Day", aliases: ["Monitoring Day-by-Day", "Monitoring Plan", "Rencana Monitoring"] },
  { key: "medical_validation_notes", label: "Catatan Validasi Medis", aliases: ["Catatan Validasi Medis", "Catatan MCU", "Catatan", "Notes", "Remark"] },
  { key: "program_status", label: "Status Program", aliases: ["Status Program", "Program Status", "Status"] },
];

const knownHeaderWords = [
  "kode",
  "no lab",
  "nama karyawan",
  "tanggal periksa",
  "hba1c",
  "sistolik",
  "diastolik",
  "tensi",
  "bmi",
  "risk score",
  "fokus intervensi",
];

function clean(value: any) {
  return String(value ?? "").trim();
}

function norm(value: any) {
  return clean(value)
    .toLowerCase()
    .replace(/[._\-\/()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function chooseHeaderRow(rows: any[][]) {
  let bestIndex = 0;
  let bestScore = -1;
  rows.slice(0, 25).forEach((row, index) => {
    const values = row.map(norm);
    const score = values.reduce((sum, value) => sum + (knownHeaderWords.some((item) => value.includes(item)) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function detectColumn(headers: string[], aliases: string[]) {
  const normalizedHeaders = headers.map(norm);
  const normalizedAliases = aliases.map(norm);

  for (const alias of normalizedAliases) {
    const index = normalizedHeaders.findIndex((header) => header === alias);
    if (index >= 0) return { header: headers[index], confidence: "Exact" };
  }

  for (const alias of normalizedAliases) {
    const index = normalizedHeaders.findIndex((header) => header.includes(alias) || alias.includes(header));
    if (index >= 0) return { header: headers[index], confidence: "Mirip" };
  }

  return { header: "", confidence: "Belum ketemu" };
}

export default function WellnessHistoryImportPage() {
  return <AuthGate>{() => <WellnessHistoryImport />}</AuthGate>;
}

function WellnessHistoryImport() {
  const [file, setFile] = useState<File | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [historyType, setHistoryType] = useState("baseline_mcu");
  const [visitLabel, setVisitLabel] = useState("Baseline MCU");
  const [checkupDate, setCheckupDate] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [companies, setCompanies] = useState<any[]>([]);
  const [groupUnits, setGroupUnits] = useState<any[]>([]);
  const [selectedKelompokId, setSelectedKelompokId] = useState("");
  const [selectedGroupUnitId, setSelectedGroupUnitId] = useState("");
  const [createMissing, setCreateMissing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mappingLoading, setMappingLoading] = useState(false);
  const [message, setMessage] = useState("Upload history pemeriksaan MCU agar baseline/mini MCU/final MCU terbaca di grafik before-after peserta.");
  const [result, setResult] = useState<any>(null);
  const [availableHeaders, setAvailableHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [autoMapInfo, setAutoMapInfo] = useState<any>(null);

  const requiredMappedCount = useMemo(() => mappingTargets.filter((target) => target.required && columnMapping[target.key]).length, [columnMapping]);
  const totalMappedCount = useMemo(() => Object.values(columnMapping).filter(Boolean).length, [columnMapping]);

  async function loadSettings() {
    try {
      const json = await fetch("/api/wellness/settings", { cache: "no-store" }).then((res) => res.json());
      if (json.ok) {
        const loaded = json.companies || [];
        const loadedGroups = json.groupUnits || [];
        setCompanies(loaded);
        setGroupUnits(loadedGroups);
        if (!companyId && loaded[0]?.id) setCompanyId(String(loaded[0].id));
      }
    } catch {
      setCompanies([]);
    }
  }

  useEffect(() => { loadSettings(); }, []);

  const kelompokList = useMemo(
    () => groupUnits.filter((item) => String(item.company_id) === String(companyId) && item.unit_type === "kelompok"),
    [groupUnits, companyId]
  );

  const childGroupList = useMemo(
    () => groupUnits.filter((item) => String(item.company_id) === String(companyId) && item.unit_type === "group" && (!selectedKelompokId || String(item.parent_id) === String(selectedKelompokId))),
    [groupUnits, companyId, selectedKelompokId]
  );

  function handleCompanyChange(value: string) {
    setCompanyId(value);
    setSelectedKelompokId("");
    setSelectedGroupUnitId("");
  }

  function handleKelompokChange(value: string) {
    setSelectedKelompokId(value);
    setSelectedGroupUnitId("");
  }

  function resetMapping() {
    setAvailableHeaders([]);
    setColumnMapping({});
    setAutoMapInfo(null);
  }

  function handleHistoryType(value: string) {
    setHistoryType(value);
    const labelMap: Record<string, string> = {
      baseline_mcu: "Baseline MCU",
      mini_mcu_week_4: "Mini MCU Week 4",
      mini_mcu_week_8: "Mini MCU Week 8",
      final_mcu: "Final MCU",
      mini_mcu: "Mini MCU",
      other: "Pemeriksaan Lain",
    };
    setVisitLabel(labelMap[value] || value);
  }

  async function autoMapping() {
    if (!file) {
      setMessage("Pilih file Excel history MCU dulu, lalu klik Auto Mapping.");
      return;
    }

    setMappingLoading(true);
    setResult(null);
    setMessage("Membaca header Excel dan membuat auto mapping...");

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const selectedSheetName = sheetName.trim() || workbook.SheetNames[0];
      const sheet = workbook.Sheets[selectedSheetName];
      if (!sheet) {
        setMessage(`Sheet ${selectedSheetName} tidak ditemukan.`);
        return;
      }

      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
      if (!rows.length) {
        setMessage("Sheet kosong, tidak bisa auto mapping.");
        return;
      }

      const headerRowIndex = chooseHeaderRow(rows);
      const headers = (rows[headerRowIndex] || []).map((item, index) => clean(item) || `Column ${index + 1}`);
      const nonEmptyHeaders = headers.filter((header) => clean(header));
      const nextMapping: Record<string, string> = {};
      const confidence: Record<string, string> = {};

      mappingTargets.forEach((target) => {
        const detected = detectColumn(nonEmptyHeaders, target.aliases);
        if (detected.header) nextMapping[target.key] = detected.header;
        confidence[target.key] = detected.confidence;
      });

      setSheetName(selectedSheetName);
      setAvailableHeaders(nonEmptyHeaders);
      setColumnMapping(nextMapping);
      setAutoMapInfo({
        sheetName: selectedSheetName,
        headerRow: headerRowIndex + 1,
        dataRows: Math.max(rows.length - headerRowIndex - 1, 0),
        confidence,
      });

      const requiredOk = mappingTargets.filter((target) => target.required && nextMapping[target.key]).length;
      const totalOk = Object.values(nextMapping).filter(Boolean).length;
      setMessage(`Auto mapping selesai. ${requiredOk}/3 kolom wajib dan ${totalOk} total parameter berhasil dikenali.`);
    } catch (error: any) {
      setMessage(error?.message || "Auto mapping gagal. Pastikan file Excel valid.");
    } finally {
      setMappingLoading(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) {
      setMessage("Pilih file Excel history MCU terlebih dahulu.");
      return;
    }
    setLoading(true);
    setResult(null);
    setMessage("Mengimport history MCU...");

    const form = new FormData();
    form.set("file", file);
    form.set("history_type", historyType);
    form.set("visit_label", visitLabel);
    if (sheetName.trim()) form.set("sheet_name", sheetName.trim());
    if (checkupDate) form.set("checkup_date", checkupDate);
    if (companyId) form.set("company_id", companyId);
    if (selectedKelompokId) form.set("kelompok_id", selectedKelompokId);
    if (selectedGroupUnitId) form.set("group_unit_id", selectedGroupUnitId);
    if (createMissing) form.set("create_missing_participants", "1");
    if (Object.keys(columnMapping).length) form.set("column_mapping", JSON.stringify(columnMapping));

    const json = await fetch("/api/wellness/history/import", { method: "POST", body: form })
      .then((res) => res.json())
      .catch(() => ({ ok: false, message: "Gagal menghubungi server." }));

    setLoading(false);
    setResult(json);
    setMessage(json.message || (json.ok ? "Import history MCU selesai." : "Import history MCU gagal."));
  }

  return (
    <div className="space-y-6">
      {/* WELLNESS_NAKES_MENU_BUTTON_V373 */}
      <div className="rounded-[2rem] border border-blue-100 bg-blue-50 p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-black uppercase tracking-wide text-blue-700">Menu Wellness</div>
            <div className="mt-1 text-sm font-semibold text-slate-600">Gunakan Input NAKES untuk pemeriksaan klinis, mini MCU, follow-up, dan evaluasi program.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/wellness/dashboard" className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">Dashboard</a>
            <a href="/wellness/input" className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">Input Harian</a>
            <a href="/wellness/nakes-input" className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-blue-700">Input NAKES</a>
            <a href="/wellness/history-import" className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">Import History MCU</a>
          </div>
        </div>
      </div>
      <section className="overflow-hidden rounded-[2rem] bg-gradient-to-r from-blue-700 via-indigo-700 to-fuchsia-600 shadow-sm">
        <div className="p-7 text-white">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-3xl font-black">Import History Pemeriksaan MCU</div>
              <div className="mt-2 max-w-3xl text-sm font-medium text-blue-50">Import baseline MCU, mini MCU, atau final MCU agar grafik before-after per peserta terbaca.</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href="/wellness/import" className="rounded-2xl bg-white/15 px-4 py-3 text-sm font-black text-white ring-1 ring-white/25">Import Peserta</a>
              <a href="/wellness/dashboard" className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-blue-800 shadow-sm">Dashboard</a>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <form onSubmit={submit} className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4">
            <label className="grid gap-2 text-sm font-black text-slate-700">
              File Excel history MCU
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold"
                onChange={(event) => {
                  setFile(event.target.files?.[0] || null);
                  resetMapping();
                  setResult(null);
                  setMessage("File dipilih. Klik Auto Mapping agar sistem membaca kolom baseline/history MCU.");
                }}
                required
              />
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-black text-slate-700">
                Company / Main Entity
                <select className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" value={companyId} onChange={(event) => handleCompanyChange(event.target.value)}>
                  <option value="">Tanpa filter company</option>
                  {companies.map((company) => <option key={company.id} value={String(company.id)}>{company.name}</option>)}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-black text-slate-700">
                Jenis history
                <select className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" value={historyType} onChange={(event) => handleHistoryType(event.target.value)}>
                  <option value="baseline_mcu">Baseline MCU</option>
                  <option value="mini_mcu_week_4">Mini MCU Week 4</option>
                  <option value="mini_mcu_week_8">Mini MCU Week 8</option>
                  <option value="final_mcu">Final MCU</option>
                  <option value="mini_mcu">Mini MCU lainnya</option>
                  <option value="other">Pemeriksaan lain</option>
                </select>
              </label>
            </div>

            <div className="rounded-3xl border border-blue-100 bg-blue-50 p-4">
              <div className="text-sm font-black text-blue-950">Filter pencocokan peserta</div>
              <div className="mt-2 text-xs font-bold leading-5 text-blue-700">Pilih Kelompok dan Group supaya KODE peserta dicocokkan hanya ke peserta di struktur tersebut. Ini membantu mencegah history baseline masuk ke peserta yang salah bila ada KODE mirip/duplikat antar program.</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="grid gap-2 text-xs font-black text-blue-900">
                  Kelompok
                  <select className="rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm font-bold text-slate-900" value={selectedKelompokId} onChange={(event) => handleKelompokChange(event.target.value)} disabled={!companyId}>
                    <option value="">Semua kelompok</option>
                    {kelompokList.map((item) => <option key={item.id} value={String(item.id)}>{item.name} {item.coach_name ? `- Coach ${item.coach_name}` : ""}</option>)}
                  </select>
                </label>
                <label className="grid gap-2 text-xs font-black text-blue-900">
                  Group
                  <select className="rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm font-bold text-slate-900" value={selectedGroupUnitId} onChange={(event) => setSelectedGroupUnitId(event.target.value)} disabled={!companyId}>
                    <option value="">Semua group</option>
                    {childGroupList.map((item) => <option key={item.id} value={String(item.id)}>{item.name}</option>)}
                  </select>
                </label>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="grid gap-2 text-sm font-black text-slate-700">
                Visit Label
                <input className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" value={visitLabel} onChange={(event) => setVisitLabel(event.target.value)} />
              </label>
              <label className="grid gap-2 text-sm font-black text-slate-700">
                Tanggal default, opsional
                <input type="date" className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" value={checkupDate} onChange={(event) => setCheckupDate(event.target.value)} />
              </label>
              <label className="grid gap-2 text-sm font-black text-slate-700">
                Nama Sheet, opsional
                <input className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" placeholder="Kosongkan untuk sheet pertama" value={sheetName} onChange={(event) => { setSheetName(event.target.value); resetMapping(); }} />
              </label>
            </div>

            <label className="flex items-start gap-3 rounded-3xl border border-amber-100 bg-amber-50 p-4 text-sm font-bold text-amber-900">
              <input type="checkbox" className="mt-1" checked={createMissing} onChange={(event) => setCreateMissing(event.target.checked)} />
              <span>Buat peserta baru bila KODE belum ditemukan. Default sebaiknya tidak dicentang supaya history tidak salah masuk peserta.</span>
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <button type="button" disabled={!file || mappingLoading || loading} onClick={autoMapping} className="rounded-2xl bg-emerald-600 px-4 py-4 text-sm font-black text-white shadow-sm disabled:opacity-60">
                {mappingLoading ? "Auto mapping..." : "Auto Mapping"}
              </button>
              <button disabled={loading} className="rounded-2xl bg-blue-600 px-4 py-4 text-sm font-black text-white shadow-sm disabled:opacity-60">
                {loading ? "Mengimport..." : "Import History MCU"}
              </button>
            </div>

            <div className="rounded-3xl bg-slate-100 px-5 py-4 text-sm font-bold text-slate-700">{message}</div>
          </div>
        </form>

        <aside className="space-y-4">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-lg font-black text-slate-900">Mekanisme</div>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm font-semibold leading-6 text-slate-600">
              <li>Import peserta dulu di /wellness/import.</li>
              <li>Upload file history MCU di halaman ini.</li>
              <li>Klik Auto Mapping untuk membaca kolom Excel.</li>
              <li>Pilih Kelompok/Group bila ingin pencocokan peserta lebih spesifik.</li>
              <li>Cek mapping kolom wajib dan parameter klinis.</li>
              <li>Klik Import History MCU.</li>
            </ol>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-lg font-black text-slate-900">Kolom Wajib</div>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              {requiredColumns.map(([name, description]) => (
                <div key={name} className="rounded-2xl bg-slate-50 p-3"><b>{name}</b><br />{description}</div>
              ))}
            </div>
          </div>
        </aside>
      </section>

      {autoMapInfo ? (
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xl font-black text-slate-900">Auto Mapping Kolom Baseline / History MCU</div>
              <div className="mt-1 text-sm font-semibold text-slate-500">
                Sheet: <b>{autoMapInfo.sheetName}</b> · Header row: <b>{autoMapInfo.headerRow}</b> · Data rows: <b>{autoMapInfo.dataRows}</b>
              </div>
            </div>
            <div className="grid gap-2 text-sm font-black md:grid-cols-2">
              <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-emerald-900">Kolom wajib: {requiredMappedCount}/3</div>
              <div className="rounded-2xl bg-blue-50 px-4 py-3 text-blue-900">Total mapped: {totalMappedCount}</div>
            </div>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Field Sistem</th>
                  <th className="px-4 py-3 text-left">Kolom Excel Terbaca</th>
                  <th className="px-4 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mappingTargets.map((target) => {
                  const mapped = columnMapping[target.key] || "";
                  const confidence = autoMapInfo.confidence?.[target.key] || (mapped ? "Manual" : "Belum ketemu");
                  const isMissingRequired = target.required && !mapped;
                  return (
                    <tr key={target.key}>
                      <td className="px-4 py-3 font-black text-slate-900">
                        {target.label} {target.required ? <span className="text-rose-600">*</span> : null}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700"
                          value={mapped}
                          onChange={(event) => setColumnMapping((current) => ({ ...current, [target.key]: event.target.value }))}
                        >
                          <option value="">Tidak dipetakan</option>
                          {availableHeaders.map((header) => <option key={`${target.key}-${header}`} value={header}>{header}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-3 py-1 text-xs font-black ${isMissingRequired ? "bg-rose-50 text-rose-700" : mapped ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                          {isMissingRequired ? "Wajib belum ketemu" : mapped ? confidence : "Opsional kosong"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 rounded-3xl border border-blue-100 bg-blue-50 p-4 text-sm font-semibold text-blue-900">
            Mapping ini akan dikirim ke API saat Import History MCU. Jadi kalau nama kolom Excel tidak standar, pilih kolom yang benar secara manual sebelum import.
          </div>
        </section>
      ) : null}

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-xl font-black text-slate-900">Format Kolom yang Didukung</div>
        <div className="mt-1 text-sm font-semibold text-slate-500">Format ini cocok untuk file history karyawan yang berisi faktor risiko MCU.</div>
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3 text-left">Kolom</th><th className="px-4 py-3 text-left">Keterangan</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...requiredColumns, ...clinicalColumns].map(([name, description]) => (
                <tr key={name}><td className="px-4 py-3 font-black text-slate-900">{name}</td><td className="px-4 py-3 text-slate-600">{description}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        {result ? (
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl bg-emerald-50 p-4 text-sm font-black text-emerald-900">Imported: {result.inserted || 0}</div>
            <div className="rounded-2xl bg-blue-50 p-4 text-sm font-black text-blue-900">Baseline updated: {result.updatedBaseline || 0}</div>
            <div className="rounded-2xl bg-purple-50 p-4 text-sm font-black text-purple-900">Peserta baru: {result.createdParticipants || 0}</div>
            <div className="rounded-2xl bg-amber-50 p-4 text-sm font-black text-amber-900">Skipped: {result.skipped || 0}</div>
          </div>
        ) : (
          <div className="rounded-3xl bg-slate-100 px-5 py-4 text-sm font-bold text-slate-700">Hasil import akan muncul di sini setelah proses selesai.</div>
        )}
        {result?.missingParticipants?.length ? (
          <div className="mt-4 rounded-3xl border border-amber-100 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
            <div className="font-black">Peserta belum ditemukan, contoh:</div>
            <div className="mt-2">{result.missingParticipants.join(", ")}</div>
          </div>
        ) : null}
        {result?.errors?.length ? (
          <div className="mt-4 rounded-3xl border border-rose-100 bg-rose-50 p-4 text-sm font-semibold text-rose-900">
            <div className="font-black">Error:</div>
            <ul className="mt-2 list-disc pl-5">{result.errors.slice(0, 8).map((item: string) => <li key={item}>{item}</li>)}</ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}
