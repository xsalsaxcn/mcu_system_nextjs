"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import StageProgress from "@/components/StageProgress";

type LoadMode = "blank" | "edit";
type ListTab = "selesai";

function norm(text: any) {
  return String(text || "")
    .toLowerCase()
    .replace(/[\s\n\r\t.,\-_\/\\><:;()]/g, "");
}

type ChoiceOption = {
  label: string;
  value: string;
  score?: number | null;
  is_critical?: boolean;
  note?: string;
};

function normalizeChoiceOption(option: any): ChoiceOption | null {
  if (typeof option === "string") {
    const label = option.trim();
    return label ? { label, value: label, score: null, is_critical: false, note: "" } : null;
  }

  if (!option || typeof option !== "object") return null;

  const label = String(option.label ?? option.option_label ?? option.text ?? option.value ?? "").trim();
  if (!label) return null;

  const value = String(option.value ?? option.option_value ?? label).trim() || label;
  const rawScore = option.score ?? option.skor ?? option.value_score;
  const numericScore = rawScore === null || rawScore === undefined || rawScore === "" ? null : Number(rawScore);

  return {
    label,
    value,
    score: Number.isFinite(numericScore) ? numericScore : null,
    is_critical: Boolean(option.is_critical ?? option.critical ?? option.tidak_direkomendasikan ?? false),
    note: String(option.note ?? option.recommendation_text ?? "").trim(),
  };
}

function parseChoiceOptions(config: any): ChoiceOption[] {
  try {
    if (!config) return [];
    const parsed = typeof config === "string" ? JSON.parse(config) : config;
    const rawOptions = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.options) ? parsed.options : [];
    return rawOptions.map(normalizeChoiceOption).filter(Boolean) as ChoiceOption[];
  } catch {
    return [];
  }
}

function getForcedThtOptions(param: any): ChoiceOption[] {
  const name = norm(param?.name);

  const optionMap: Record<string, ChoiceOption[]> = {
    [norm("Membran timpani")]: [
      { label: "Intak", value: "Intak", score: 2, is_critical: false },
      { label: "Tidak intak", value: "Tidak intak", score: -10, is_critical: true },
    ],
    [norm("Serumen")]: [
      { label: "Tidak ada", value: "Tidak ada", score: 2, is_critical: false },
      { label: "Ada serumen", value: "Ada serumen", score: 1, is_critical: false },
    ],
    [norm("Tonsil")]: [
      { label: "T0 / T1-T1", value: "T0 / T1-T1", score: 2, is_critical: false },
      { label: "Sudah tonsilektomi", value: "Sudah tonsilektomi", score: 2, is_critical: false },
      { label: "T2a-T2a", value: "T2a-T2a", score: 1, is_critical: false },
      { label: "T2b-T2b", value: "T2b-T2b", score: -1, is_critical: false },
      { label: "T3-T3", value: "T3-T3", score: -10, is_critical: true },
    ],
    [norm("Rhinitis Alergi (divide)")]: [
      { label: "Negatif / (-)", value: "Negatif", score: 2, is_critical: false },
      { label: "Positif / (+)", value: "Positif", score: 1, is_critical: false },
    ],
    [norm("Rhinitis Alergi (lividae)")]: [
      { label: "Negatif / (-)", value: "Negatif", score: 2, is_critical: false },
      { label: "Positif / (+)", value: "Positif", score: 1, is_critical: false },
    ],
    [norm("Rhinitis Alergi (Bividas)")]: [
      { label: "Negatif / (-)", value: "Negatif", score: 2, is_critical: false },
      { label: "Positif / (+)", value: "Positif", score: 1, is_critical: false },
    ],
    [norm("Epistaksis 1 tahun terakhir")]: [
      { label: "Tidak ada", value: "Tidak Ada", score: 1, is_critical: false },
      { label: "Ada", value: "Ada", score: -1, is_critical: false },
    ],
    [norm("Tes Garputala (Weber) 512 Hz")]: [
      { label: "Normal", value: "Normal", score: 1, is_critical: false },
      { label: "Tidak normal", value: "Tidak Normal", score: -10, is_critical: true },
    ],
  };

  return optionMap[name] || [];
}

function getChoiceOptions(param: any): ChoiceOption[] {
  const forcedTht = getForcedThtOptions(param);
  if (forcedTht.length) return forcedTht;
  return parseChoiceOptions(param?.config_json);
}

function parseOptions(config: any): string[] {
  return parseChoiceOptions(config).map((option) => option.label);
}

function hasChoiceOptions(param: any) {
  return getChoiceOptions(param).length > 0;
}

function getSelectedChoiceOption(param: any, selectedValue: string) {
  const selectedKey = norm(selectedValue);
  if (!selectedKey) return null;

  return getChoiceOptions(param).find((option) => (
    norm(option.label) === selectedKey || norm(option.value) === selectedKey
  )) || null;
}

function extractBarcodeKeyword(rawCode: string) {
  const raw = String(rawCode || "").trim();

  if (!raw) return "";

  // Format QR rekomendasi:
  // MCU=CAPASKA-2026-0603;NAME=CHELSEA OLIVIA
  const mcuMatch = raw.match(/(?:^|[;|\s])MCU\s*=\s*([^;|]+)/i);
  if (mcuMatch?.[1]) return mcuMatch[1].trim();

  const idMatch = raw.match(/(?:^|[;|\s])ID\s*=\s*([^;|]+)/i);
  if (idMatch?.[1]) return idMatch[1].trim();

  const nameMatch = raw.match(/(?:^|[;|\s])NAME\s*=\s*([^;|]+)/i);

  // Format alternatif:
  // CAPASKA-2026-0603 | CHELSEA OLIVIA
  if (raw.includes("|")) {
    const parts = raw.split("|").map((x) => x.trim()).filter(Boolean);
    if (parts[0]) return parts[0];
  }

  // Format alternatif:
  // CHELSEA OLIVIA - CAPASKA-2026-0603
  // Tetap fallback raw karena search API bisa cari nama juga.
  if (nameMatch?.[1]) return nameMatch[1].trim();

  return raw;
}

function isValueField(param: any) {
  return String(param.name || "").toLowerCase().trim().startsWith("value ");
}

function isScoreField(param: any) {
  const name = String(param.name || "").toLowerCase().trim();
  return name.startsWith("score ") || name.startsWith("total score") || name.includes("score total");
}

function isAutoField(param: any) {
  return isValueField(param) || isScoreField(param);
}

function scoreByChoice(parameterName: string, selectedValue: string): number {
  const key = `${norm(parameterName)}::${norm(selectedValue)}`;

  const exact: Record<string, number> = {
    // MATA
    [`${norm("Lensakontak/ kaca mata")}::${norm("Tidak menggunakan")}`]: 2,
    [`${norm("Lensakontak/ kaca mata")}::${norm("Menggunakan")}`]: 1,
    [`${norm("Lensakontak / kaca mata")}::${norm("Tidak menggunakan")}`]: 2,
    [`${norm("Lensakontak / kaca mata")}::${norm("Menggunakan")}`]: 1,
    [`${norm("Tes buta warna")}::${norm("Tidak buta warna")}`]: 2,
    [`${norm("Tes buta warna")}::${norm("Buta warna parsial")}`]: 1,
    [`${norm("Tes buta warna")}::${norm("Buta warna total")}`]: 0,
    [`${norm("Strabismus / Juling")}::${norm("(+) / (-)")}`]: 1,
    [`${norm("Strabismus / Juling")}::${norm("(-) / (+)")}`]: 1,
    [`${norm("Strabismus / Juling")}::${norm("(+) / (+)")}`]: 0,
    [`${norm("Strabismus / Juling")}::${norm("(-) / (-)")}`]: 2,
    [`${norm("Strabismus / Juling")}::${norm("(+)/(-)")}`]: 1,
    [`${norm("Strabismus / Juling")}::${norm("(-)/(+)")}`]: 1,
    [`${norm("Strabismus / Juling")}::${norm("(+)/(+)")}`]: 0,
    [`${norm("Strabismus / Juling")}::${norm("(-)/(-)")}`]: 2,
    [`${norm("Pemeriksaan Visus OD / OS")}::${norm("Normal 6/6")}`]: 2,
    [`${norm("Pemeriksaan Visus OD / OS")}::${norm("<6/6 - 6/12")}`]: 1,
    [`${norm("Pemeriksaan Visus OD / OS")}::${norm("<6/12")}`]: 0,
    [`${norm("Pemeriksaan Visus OD  / OS")}::${norm("Normal 6/6")}`]: 2,
    [`${norm("Pemeriksaan Visus OD  / OS")}::${norm("<6/6 - 6/12")}`]: 1,
    [`${norm("Pemeriksaan Visus OD  / OS")}::${norm("<6/12")}`]: 0,

    // GIGI
    [`${norm("Karang Gigi")}::${norm("Negative")}`]: 2,
    [`${norm("Karang Gigi")}::${norm("Positive")}`]: 0,
    [`${norm("Caries Dentis")}::${norm("0 caries")}`]: 2,
    [`${norm("Caries Dentis")}::${norm("1 caries")}`]: 1,
    [`${norm("Caries Dentis")}::${norm("2 caries")}`]: 1,
    [`${norm("Caries Dentis")}::${norm("3 caries")}`]: 0,
    [`${norm("Caries Dentis")}::${norm(">3 caries")}`]: 0,
    [`${norm("Tumpatan Gigi")}::${norm("0 tumpatan")}`]: 2,
    [`${norm("Tumpatan Gigi")}::${norm("<3 tumpatan")}`]: 1,
    [`${norm("Tumpatan Gigi")}::${norm(">3 tumpatan")}`]: 0,
    [`${norm("Tumpatan Gigi")}::${norm("<5 tumpatan")}`]: 1,
    [`${norm("Tumpatan Gigi")}::${norm(">5 tumpatan")}`]: 0,
    [`${norm("Impaksi gigi")}::${norm("0 gigi")}`]: 2,
    [`${norm("Impaksi gigi")}::${norm("1 gigi")}`]: 1,
    [`${norm("Impaksi gigi")}::${norm("2 gigi")}`]: 0,
    [`${norm("Impaksi gigi")}::${norm(">2 gigi")}`]: 0,
    [`${norm("Kehilangan Gigi (Baik depan maupun belakang)")}::${norm("0 gigi")}`]: 2,
    [`${norm("Kehilangan Gigi (Baik depan maupun belakang)")}::${norm("1 gigi")}`]: 1,
    [`${norm("Kehilangan Gigi (Baik depan maupun belakang)")}::${norm("2 gigi")}`]: 0,
    [`${norm("Kehilangan Gigi (Baik depan maupun belakang)")}::${norm(">2 gigi")}`]: 0,
    [`${norm("Infeksi Gusi")}::${norm("Negative")}`]: 2,
    [`${norm("Infeksi Gusi")}::${norm("Positive")}`]: 0,
    [`${norm("Dental panoramic")}::${norm("Normal")}`]: 2,
    [`${norm("Dental panoramic")}::${norm("ditemukan kelainan")}`]: 0,
    [`${norm("Dental panoramik")}::${norm("Normal")}`]: 2,
    [`${norm("Dental panoramik")}::${norm("ditemukan kelainan")}`]: 0,

    // THT - direct CAPASKA 2026 scoring.
    [`${norm("Membran timpani")}::${norm("Intak")}`]: 2,
    [`${norm("Membran timpani")}::${norm("Tidak Intak")}`]: -10,
    [`${norm("Membran timpani")}::${norm("Tidak intak")}`]: -10,
    [`${norm("Serumen")}::${norm("Tidak ada")}`]: 2,
    [`${norm("Serumen")}::${norm("Ada serumen")}`]: 1,
    [`${norm("Tonsil")}::${norm("T0 - T1")}`]: 2,
    [`${norm("Tonsil")}::${norm("T0 / T1-T1")}`]: 2,
    [`${norm("Tonsil")}::${norm("Sudah tonsilektomi")}`]: 2,
    [`${norm("Tonsil")}::${norm("T0 - T2a")}`]: 1,
    [`${norm("Tonsil")}::${norm("T2a-T2a")}`]: 1,
    [`${norm("Tonsil")}::${norm("T0 - T2b")}`]: -1,
    [`${norm("Tonsil")}::${norm("T2b-T2b")}`]: -1,
    [`${norm("Tonsil")}::${norm("T2 - T3")}`]: -10,
    [`${norm("Tonsil")}::${norm("T3-T3")}`]: -10,
    [`${norm("Rhinitis Alergi (divide)")}::${norm("Negative")}`]: 2,
    [`${norm("Rhinitis Alergi (divide)")}::${norm("Negatif")}`]: 2,
    [`${norm("Rhinitis Alergi (divide)")}::${norm("Positive")}`]: 1,
    [`${norm("Rhinitis Alergi (divide)")}::${norm("Positif")}`]: 1,
    [`${norm("Rhinitis Alergi (lividae)")}::${norm("Negative")}`]: 2,
    [`${norm("Rhinitis Alergi (lividae)")}::${norm("Negatif")}`]: 2,
    [`${norm("Rhinitis Alergi (lividae)")}::${norm("Positive")}`]: 1,
    [`${norm("Rhinitis Alergi (lividae)")}::${norm("Positif")}`]: 1,
    [`${norm("Rhinitis Alergi (Bividas)")}::${norm("Negative")}`]: 2,
    [`${norm("Rhinitis Alergi (Bividas)")}::${norm("Negatif")}`]: 2,
    [`${norm("Rhinitis Alergi (Bividas)")}::${norm("Positive")}`]: 1,
    [`${norm("Rhinitis Alergi (Bividas)")}::${norm("Positif")}`]: 1,
    [`${norm("Epistaksis 1 tahun terakhir")}::${norm("Tidak Ada")}`]: 1,
    [`${norm("Epistaksis 1 tahun terakhir")}::${norm("Tidak ada")}`]: 1,
    [`${norm("Epistaksis 1 tahun terakhir")}::${norm("Ada")}`]: -1,
    [`${norm("Tes Garputala (Weber) 512 Hz")}::${norm("Normal")}`]: 1,
    [`${norm("Tes Garputala (Weber) 512 Hz")}::${norm("Tidak Normal")}`]: -10,
    [`${norm("Tes Garputala (Weber) 512 Hz")}::${norm("Tidak normal")}`]: -10,

    // PENYAKIT DALAM
    [`${norm("Berat Badan (Kg)")}::${norm("Sesuai juknis")}`]: 2,
    [`${norm("Berat Badan (Kg)")}::${norm("Tidak sesuai juknis")}`]: 0,
    [`${norm("TB. (Cm)")}::${norm("Sesuai juknis")}`]: 2,
    [`${norm("TB. (Cm)")}::${norm("Tidak sesuai juknis")}`]: 0,
    [`${norm("Tanda Vital")}::${norm("Normal")}`]: 2,
    [`${norm("Tanda Vital")}::${norm("Tidak Normal")}`]: 0,
    [`${norm("Tato kulit")}::${norm("Tidak ada tato")}`]: 2,
    [`${norm("Tato kulit")}::${norm("Ada tato")}`]: 0,
    [`${norm("Tindik (selain anting) Wanita : hanya 1 / telinga")}::${norm("Tidak ada")}`]: 2,
    [`${norm("Tindik (selain anting) Wanita : hanya 1 / telinga")}::${norm("Ada (pria) Wanita >1)")}`]: 0,
    [`${norm("Pemeriksaan Fisik Jantung")}::${norm("Normal")}`]: 2,
    [`${norm("Pemeriksaan Fisik Jantung")}::${norm("Tidak Normal")}`]: 0,
    [`${norm("Pemeriksaan Fisik Paru")}::${norm("Normal")}`]: 2,
    [`${norm("Pemeriksaan Fisik Paru")}::${norm("Tidak Normal")}`]: 0,

    // JANTUNG
    [`${norm("Kelainan Anatomi Jantung")}::${norm("Tidak Ada")}`]: 2,
    [`${norm("Kelainan Anatomi Jantung")}::${norm("Ada")}`]: 0,
    [`${norm("Kelainan Irama Jantung")}::${norm("Tidak Ada")}`]: 2,
    [`${norm("Kelainan Irama Jantung")}::${norm("Ada")}`]: 0,
    [`${norm("Iskemik Miocardial")}::${norm("Tidak Ada")}`]: 2,
    [`${norm("Iskemik Miocardial")}::${norm("Ada")}`]: 0,
    [`${norm("Kelainan kongenital jantung")}::${norm("Tidak Ada")}`]: 2,
    [`${norm("Kelainan kongenital jantung")}::${norm("Ada")}`]: 0,
    [`${norm("Varises Tungkai (insufisiensi vena)")}::${norm("Tidak Ada")}`]: 2,
    [`${norm("Varises Tungkai (insufisiensi vena)")}::${norm("Ada")}`]: 0,
    [`${norm("Kelainan Arteri pada ekstremitas")}::${norm("Tidak Ada")}`]: 2,
    [`${norm("Kelainan Arteri pada ekstremitas")}::${norm("Ada")}`]: 0
  };

  if (typeof exact[key] === "number") return exact[key];

  const selected = norm(selectedValue);
  if (selected === norm("Normal")) return 2;
  if (selected === norm("Tidak Normal")) return 0;
  if (selected === norm("Tidak Ada")) return 2;
  if (selected === norm("Ada")) return 0;
  if (selected === norm("Ringan")) return 1;
  if (selected === norm("Sedang")) return 0;
  if (selected === norm("Berat")) return 0;
  if (selected === norm("Sesuai juknis")) return 2;
  if (selected === norm("Tidak sesuai juknis")) return 0;
  if (selected === norm("Positive")) return 0;
  if (selected === norm("Negative")) return 2;

  return 0;
}

function scoreForParam(param: any, selectedValue: string): number {
  const selectedOption = getSelectedChoiceOption(param, selectedValue);
  if (selectedOption && typeof selectedOption.score === "number") return selectedOption.score;
  return scoreByChoice(String(param?.name || ""), selectedValue);
}

function isCriticalChoice(param: any, selectedValue: string): boolean {
  const selectedOption = getSelectedChoiceOption(param, selectedValue);
  if (selectedOption?.is_critical) return true;
  return scoreForParam(param, selectedValue) <= -10;
}

function computeValues(parameters: any[], rawValues: Record<string, string>) {
  const computed: Record<string, string> = { ...rawValues };
  const scores: Record<string, number> = {};

  parameters.forEach((p) => {
    if (isAutoField(p)) return;
    if (!hasChoiceOptions(p)) return;
    const selected = computed[p.id];
    if (!selected) return;
    scores[String(p.id)] = scoreForParam(p, selected);
  });

  parameters.forEach((p) => {
    if (isAutoField(p)) computed[p.id] = "";
  });

  parameters.forEach((p, idx) => {
    if (!isValueField(p)) return;
    for (let i = idx - 1; i >= 0; i--) {
      const prev = parameters[i];
      if (isAutoField(prev)) continue;
      if (!hasChoiceOptions(prev)) continue;
      const score = scores[String(prev.id)];
      computed[p.id] = typeof score === "number" ? String(score) : "";
      break;
    }
  });

  parameters.forEach((p, idx) => {
    if (!isScoreField(p)) return;
    const pName = String(p.name || "").toLowerCase();
    const pCat = norm(p.category);
    const totalAll = pName.includes("total");

    let total = 0;
    let hasAny = false;

    parameters.forEach((candidate, candidateIdx) => {
      if (candidateIdx >= idx) return;
      if (isAutoField(candidate)) return;
      if (!hasChoiceOptions(candidate)) return;

      const score = scores[String(candidate.id)];
      if (typeof score !== "number") return;

      if (totalAll || norm(candidate.category) === pCat) {
        total += score;
        hasAny = true;
      }
    });

    computed[p.id] = hasAny ? String(total) : "";
  });

  return computed;
}

function findCurrentStage(detail: any, postName: string) {
  const stages = Array.isArray(detail?.stages) ? detail.stages : [];
  const target = norm(postName);

  return stages.find((stage: any) => {
    return norm(stage?.name || stage?.post_name || stage?.post || stage?.title || stage?.label) === target;
  }) || stages.find((stage: any) => {
    return JSON.stringify(stage || {}).toLowerCase().includes(String(postName || "").toLowerCase());
  });
}

function stageIsDone(stage: any) {
  if (!stage) return false;

  const text = JSON.stringify(stage).toLowerCase();
  if (text.includes('"done"') || text.includes("selesai") || text.includes("complete")) return true;

  if (stage.done === true || stage.completed === true || stage.is_done === true || stage.is_completed === true) return true;

  const doneCount = Number(stage.done_count ?? stage.completed_count ?? stage.filled_count ?? stage.completed ?? NaN);
  const totalCount = Number(stage.total_count ?? stage.total ?? stage.parameter_count ?? NaN);
  if (Number.isFinite(doneCount) && Number.isFinite(totalCount) && totalCount > 0 && doneCount >= totalCount) return true;

  return false;
}

function ParameterInput({
  param,
  value,
  onChange
}: {
  param: any;
  value: string;
  onChange: (value: string) => void;
}) {
  const options = getChoiceOptions(param);
  const inputType = String(param.input_type || "text").toLowerCase();
  const auto = isAutoField(param);
  const usesSingleChoice = options.length > 0 && !["textarea", "number", "date"].includes(inputType);

  if (usesSingleChoice && inputType === "select" && getForcedThtOptions(param).length === 0) {
    return (
      <>
        <select className="input" value={value || ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">-- Pilih --</option>
          {options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
        {value && (
          <div className={`mt-1 text-xs font-semibold ${isCriticalChoice(param, value) ? "text-red-700" : "text-blue-700"}`}>
            Skor pilihan: {scoreForParam(param, value)}{isCriticalChoice(param, value) ? " Â· Tidak Direkomendasikan" : ""}
          </div>
        )}
      </>
    );
  }

  if (usesSingleChoice) {
    return (
      <div className="grid gap-2">
        <div className="grid gap-2 sm:grid-cols-2">
          {options.map((opt) => {
            const checked = norm(value) === norm(opt.value) || norm(value) === norm(opt.label);
            const critical = Boolean(opt.is_critical) || Number(opt.score ?? 0) <= -10;

            return (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 text-sm transition ${
                  checked ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white hover:border-blue-300"
                }`}
              >
                <input
                  type="radio"
                  className="mt-1"
                  name={`param-${param.id}`}
                  value={opt.value}
                  checked={checked}
                  onChange={() => onChange(opt.value)}
                />
                <span className="flex-1">
                  <span className="block font-bold text-slate-900">{opt.label}</span>
                  {typeof opt.score === "number" && (
                    <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-black ${critical ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"}`}>
                      Skor {opt.score}{critical ? " Â· Tidak Direkomendasikan" : ""}
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </div>

        {value && (
          <div className={`text-xs font-semibold ${isCriticalChoice(param, value) ? "text-red-700" : "text-blue-700"}`}>
            Terpilih: {getSelectedChoiceOption(param, value)?.label || value} Â· Skor: {scoreForParam(param, value)}
            {isCriticalChoice(param, value) ? " Â· Tidak Direkomendasikan" : ""}
          </div>
        )}
      </div>
    );
  }

  if (inputType === "textarea") {
    return <textarea className="input min-h-24" value={value || ""} onChange={(e) => onChange(e.target.value)} />;
  }

  return (
    <input
      type={inputType === "number" ? "number" : inputType === "date" ? "date" : "text"}
      className={`input ${auto ? "bg-blue-50 font-bold text-blue-800" : ""}`}
      placeholder={auto ? "auto score" : ""}
      value={value || ""}
      readOnly={auto}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}


function ScannerModal({
  open,
  onClose,
  onDetected
}: {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
}) {
  const scannerId = "mcu-html5-qrcode-reader";
  const scannerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [manualCode, setManualCode] = useState("");
  const [status, setStatus] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [scanMode, setScanMode] = useState<"camera" | "manual">("camera");

  async function stopScanner() {
    try {
      await scannerRef.current?.stop?.();
    } catch {}

    try {
      await scannerRef.current?.clear?.();
    } catch {}

    scannerRef.current = null;
  }

  function finishDetected(code: string) {
    const clean = String(code || "").trim();
    if (!clean) return;

    stopScanner();
    onDetected(clean);
    onClose();
  }

  async function startScanner() {
    if (!open) return;

    setIsStarting(true);
    setStatus("Membuka kamera dan scanner sensitif...");
    setScanMode("camera");

    try {
      await stopScanner();

      const mod = await import("html5-qrcode");
      const Html5Qrcode = mod.Html5Qrcode;
      const Html5QrcodeSupportedFormats = mod.Html5QrcodeSupportedFormats;

      const scanner = new Html5Qrcode(scannerId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.ITF
        ],
        verbose: false
      });

      scannerRef.current = scanner;

      const config = {
        fps: 15,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const width = Math.floor(viewfinderWidth * 0.92);
          const height = Math.max(110, Math.floor(viewfinderHeight * 0.28));
          return { width, height };
        },
        aspectRatio: 1.7777778,
        disableFlip: false,
        videoConstraints: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
          focusMode: "continuous"
        }
      };

      await scanner.start(
        { facingMode: "environment" },
        config,
        (decodedText: string) => {
          finishDetected(decodedText);
        },
        () => {
          // ignore frame scan failures; continuous scanner will retry
        }
      );

      setStatus("Scanner aktif. Letakkan barcode/QR di dalam kotak. Tahan 1-2 detik.");
    } catch (err: any) {
      const msg = String(err?.message || err || "");
      if (msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("notallowed")) {
        setStatus("Izin kamera ditolak. Aktifkan camera permission atau input barcode manual.");
      } else if (msg.toLowerCase().includes("notfound")) {
        setStatus("Kamera tidak ditemukan. Gunakan input barcode manual.");
      } else {
        setStatus("Scanner kamera tidak berhasil dibuka. Coba Chrome Android, refresh halaman, atau input barcode manual.");
      }
    } finally {
      setIsStarting(false);
    }
  }

  async function scanUploadedImage(file: File) {
    if (!file) return;

    setStatus("Membaca barcode dari foto...");
    setScanMode("manual");

    try {
      await stopScanner();

      const mod = await import("html5-qrcode");
      const Html5Qrcode = mod.Html5Qrcode;
      const scanner = new Html5Qrcode(scannerId, { verbose: false });
      scannerRef.current = scanner;

      const decodedText = await scanner.scanFile(file, true);
      finishDetected(decodedText);
    } catch {
      setStatus("Barcode dari foto belum terbaca. Coba foto lebih dekat/terang atau input manual.");
    }
  }

  useEffect(() => {
    if (!open) return;

    const timer = setTimeout(() => {
      startScanner();
    }, 250);

    return () => {
      clearTimeout(timer);
      stopScanner();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-4 md:items-center">
      <div className="w-full max-w-lg rounded-3xl border border-slate-700 bg-slate-950 p-4 text-white shadow-2xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-black">Scan Barcode / QR</div>
            <div className="text-xs text-slate-400">Scanner v19 pakai html5-qrcode, lebih sensitif di mobile.</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl bg-slate-800 px-3 py-2 font-bold">
            Tutup
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl bg-black">
          <div id={scannerId} className="min-h-80 w-full" />
        </div>

        <div className="mt-3 grid gap-2 rounded-xl bg-slate-900 p-3 text-sm text-slate-200">
          <div>{isStarting ? "Menyiapkan scanner..." : status}</div>
          <div className="text-xs text-slate-400">
            Tips: pakai Chrome Android, landscape untuk barcode panjang, jarak 10-25 cm, cahaya cukup, tahan 1-2 detik.
            Untuk label kecil, QR code lebih mudah terbaca daripada barcode garis.
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            className="rounded-xl bg-slate-800 px-3 py-2 font-black"
            onClick={startScanner}
            disabled={isStarting}
          >
            Scan Ulang
          </button>

          <button
            type="button"
            className="rounded-xl bg-slate-800 px-3 py-2 font-black"
            onClick={() => fileInputRef.current?.click()}
          >
            Scan dari Foto
          </button>
        </div>

        <input
          ref={fileInputRef}
          className="hidden"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) scanUploadedImage(file);
            e.currentTarget.value = "";
          }}
        />

        <div className="mt-3 grid gap-2">
          <input
            className="input bg-white text-slate-900"
            placeholder="Input barcode manual jika scanner belum terbaca"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
          />
          <button
            type="button"
            className="btn-primary"
            onClick={() => finishDetected(manualCode)}
          >
            Gunakan Kode Manual
          </button>
        </div>
      </div>
    </div>
  );
}


export default function InputPage() {
  return (
    <AuthGate>
      {(user) => <InputForm user={user} />}
    </AuthGate>
  );
}

function InputForm({ user }: { user: any }) {
  const searchParams = useSearchParams();
  const program = user.program_type === "all" ? "capaska" : user.program_type;
  const adminParticipantId = Number(searchParams.get("participant_id") || 0);
  const adminPostId = Number(searchParams.get("post_id") || 0);
  const adminPostName = String(searchParams.get("post_name") || "").trim();
  const isAdminStageAssist = String(user.role || "").toLowerCase() === "admin" && adminParticipantId > 0 && adminPostId > 0;
  const effectivePostId = isAdminStageAssist ? adminPostId : Number(user.post_id);
  const effectivePostName = isAdminStageAssist ? (adminPostName || `Post ${adminPostId}`) : user.post_name;
  const autoLoadRef = useRef(false);
  const [sources, setSources] = useState<any[]>([]);
  const [sourceId, setSourceId] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [participant, setParticipant] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [parameters, setParameters] = useState<any[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [listTab, setListTab] = useState<ListTab>("selesai");
  const [loadingList, setLoadingList] = useState(false);
  const [hasLoadedList, setHasLoadedList] = useState(false);
  const [doneParticipants, setDoneParticipants] = useState<any[]>([]);
  const [hasMoreDoneParticipants, setHasMoreDoneParticipants] = useState(false);
  const [donePreviewParticipant, setDonePreviewParticipant] = useState<any>(null);

  const groupedParameters = useMemo(() => {
    const groups: { category: string; params: any[] }[] = [];

    parameters.filter((param) => !isAutoField(param)).forEach((param) => {
      const category = param.category || effectivePostName || "Pemeriksaan";
      const last = groups[groups.length - 1];

      if (!last || last.category !== category) {
        groups.push({ category, params: [param] });
      } else {
        last.params.push(param);
      }
    });

    return groups;
  }, [parameters, effectivePostName]);

  const questionIndexByParamId = useMemo(() => {
    const indexMap: Record<string, number> = {};
    let index = 0;

    groupedParameters.forEach((group) => {
      group.params.forEach((param) => {
        indexMap[String(param.id)] = index;
        index += 1;
      });
    });

    return indexMap;
  }, [groupedParameters]);

  useEffect(() => {
    fetch(`/api/sources?program=${program}`)
      .then((r) => r.json())
      .then((d) => setSources(d.sources || []));
  }, [program]);


  useEffect(() => {
    if (!isAdminStageAssist || !adminParticipantId || autoLoadRef.current) return;

    autoLoadRef.current = true;
    setMessage(`Membuka ${effectivePostName} untuk peserta...`);

    fetch(`/api/participant?id=${adminParticipantId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (!json.ok || !json.participant) {
          setMessage(json.message || "Peserta tidak ditemukan.");
          return;
        }

        const nextParticipant = json.participant;
        if (nextParticipant.source_id) setSourceId(String(nextParticipant.source_id));
        setKeyword(nextParticipant.name || nextParticipant.mcu_id || "");
        loadParticipant(nextParticipant, "edit");
      })
      .catch((error) => setMessage(error?.message || "Gagal membuka peserta."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminStageAssist, adminParticipantId, effectivePostId]);

  async function search(e?: React.FormEvent, overrideKeyword?: string) {
    e?.preventDefault();
    setParticipant(null);
    setDetail(null);
    setMessage("");

    const activeKeyword = typeof overrideKeyword === "string" ? overrideKeyword : keyword;

    const res = await fetch(`/api/search/participants?program=${program}&source_id=${sourceId}&keyword=${encodeURIComponent(activeKeyword)}&limit=50`);
    const json = await res.json();

    setResults(json.participants || []);

    if (!json.participants?.length) {
      setMessage("Peserta tidak ditemukan.");
    }
  }

  async function loadParticipant(p: any, mode: LoadMode) {
    setParticipant(p);
    setMessage("");

    const detailRes = await fetch(`/api/participant?id=${p.id}`);
    const detailJson = await detailRes.json();
    setDetail(detailJson);

    const paramRes = await fetch(`/api/parameters?participant_id=${p.id}&package_id=${p.package_id}&post_id=${effectivePostId}`);
    const paramJson = await paramRes.json();
    const nextParameters = paramJson.parameters || [];
    setParameters(nextParameters);

    const nextValues: Record<string, string> = {};
    nextParameters.forEach((x: any) => {
      if (mode === "edit") {
        nextValues[x.id] = x.current_value || "";
      } else {
        nextValues[x.id] = "";
      }
    });

    setValues(computeValues(nextParameters, nextValues));
  }

  function updateValue(parameterId: number | string, nextValue: string) {
    setValues((prev) => computeValues(parameters, { ...prev, [parameterId]: nextValue }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");

    const finalValues = computeValues(parameters, values);

    const res = await fetch("/api/results/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participant_id: participant.id,
        post_id: effectivePostId,
        values: finalValues
      })
    });

    const json = await res.json();
    setMessage(json.ok ? "Hasil berhasil disimpan." : json.message || "Gagal menyimpan.");
    if (json.ok) {
      setValues(finalValues);
      setListTab("selesai");
      await refreshLists(false);
    }
  }

  async function refreshLists(showMessage = true) {
    setLoadingList(true);
    if (showMessage) setMessage("Memuat daftar peserta selesai...");

    try {
      // Optimized backend list: hanya ambil peserta yang sudah selesai untuk post operator ini.
      // Tidak lagi melakukan request /api/participant satu per satu karena itu berat saat data banyak.
      const params = new URLSearchParams({
        program,
        source_id: sourceId,
        keyword: "",
        limit: "80",
        list: "1",
        status: "done",
        done: "1",
      });

      const res = await fetch(`/api/search/participants?${params.toString()}`);
      const json = await res.json();
      const doneList = json.participants || [];

      setDoneParticipants(doneList);
      setHasMoreDoneParticipants(Boolean(json.has_more));
      setHasLoadedList(true);

      if (showMessage) {
        setMessage(`Daftar selesai dimuat: ${doneList.length} peserta${json.has_more ? " teratas. Gunakan cari peserta untuk data lama lainnya." : "."}`);
      }
    } catch {
      setHasLoadedList(true);
      setMessage("Gagal memuat daftar peserta selesai.");
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    setDoneParticipants([]);
    setHasMoreDoneParticipants(false);
    setHasLoadedList(false);
    setDonePreviewParticipant(null);
  }, [program, sourceId, effectivePostId]);

  const displayedList = hasLoadedList ? doneParticipants : [];

  function openFromOperatorList(p: any) {
    setDonePreviewParticipant(p);
  }

  return (
    <div className="space-y-5">
      <ScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={(code) => {
          const keywordFromQr = extractBarcodeKeyword(code);
          setKeyword(keywordFromQr);
          search(undefined, keywordFromQr);
        }}
      />

      
      {donePreviewParticipant && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Tutup detail peserta selesai"
            className="absolute inset-0"
            onClick={() => setDonePreviewParticipant(null)}
          />
          <div className="relative z-10 w-full max-w-xl rounded-[2rem] border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-wide text-emerald-600">Preview peserta selesai</div>
                <div className="mt-1 text-2xl font-black text-slate-950">{donePreviewParticipant.name}</div>
                <div className="mt-1 text-sm font-semibold leading-6 text-slate-500">
                  {donePreviewParticipant.mcu_id || "-"} Â· {donePreviewParticipant.province || "-"} Â· {donePreviewParticipant.source_name || "-"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDonePreviewParticipant(null)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
              >
                Tutup
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-blue-50 p-4">
                <div className="text-xs font-black uppercase tracking-wide text-blue-500">Stage Operator</div>
                <div className="mt-1 text-lg font-black text-blue-950">{effectivePostName}</div>
              </div>
              <div className="rounded-2xl bg-emerald-50 p-4">
                <div className="text-xs font-black uppercase tracking-wide text-emerald-600">Skor Akhir</div>
                <div className="mt-1 text-lg font-black text-emerald-950">
                  {donePreviewParticipant.operator_final_score_label ?? donePreviewParticipant.operator_final_score ?? "-"}
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-600">
              Data ini sudah submit di stage {effectivePostName}. Klik tombol di bawah untuk membuka form edit. Form tidak akan otomatis scroll turun sampai tombol edit diklik.
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"
                onClick={() => setDonePreviewParticipant(null)}
              >
                Batal
              </button>
              <button
                type="button"
                className="rounded-2xl bg-amber-500 px-5 py-3 text-sm font-black text-white hover:bg-amber-600"
                onClick={() => {
                  const selected = donePreviewParticipant;
                  setDonePreviewParticipant(null);
                  loadParticipant(selected, "edit");
                }}
              >
                Lihat / Edit Hasil
              </button>
            </div>
          </div>
        </div>
      )}<section className="card p-5">
        <div className="text-2xl font-black">Input CAPASKA</div>
        <div className="mt-1 text-sm text-slate-500">Login sebagai {effectivePostName}. Operator hanya melihat parameter post masing-masing.</div>
        <div className="mt-2 w-fit rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
          AutoScore backend CAPASKA aktif Â· pertanyaan selang-seling Â· value/score tersembunyi
        </div>
        {isAdminStageAssist && (
          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">
            Mode bantuan admin aktif: membuka peserta langsung pada stage {effectivePostName}. Simpan akan masuk ke backend post/stage ini.
          </div>
        )}
      </section>

      <form onSubmit={(e) => search(e)} className="card grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_minmax(280px,1fr)_auto_auto] xl:items-stretch">
        <select className="input" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
          <option value="all">Semua Database Instansi</option>
          {sources.map((s) => <option key={s.id} value={s.id}>{s.name} - {s.institution_name || "-"}</option>)}
        </select>

        <div className="flex min-w-0 gap-2">
          <input className="input flex-1" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Cari nama / scan barcode / ID" />
          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            className="shrink-0 rounded-2xl border border-slate-300 px-4 py-3 text-sm font-black shadow-sm"
            title="Scan barcode"
          >
            Scan
          </button>
        </div>

        <button className="btn-primary">Cari Peserta</button>

        <button
          type="button"
          className="rounded-2xl bg-emerald-600 px-5 py-3 font-black text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
          onClick={() => refreshLists(true)}
          disabled={loadingList}
        >
          {loadingList ? "Memuat..." : "Selesai"}
        </button>
      </form>

      {message && <div className="rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">{message}</div>}

      {!!results.length && (
        <section className="card p-4">
          <div className="mb-3 font-black">Hasil Pencarian</div>
          <div className="grid gap-2">
            {results.map((p) => (
              <div
                key={p.id}
                className={`rounded-xl border p-3 transition ${
                  participant?.id === p.id
                    ? "border-emerald-300 bg-emerald-50 ring-2 ring-emerald-100"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="font-bold">{p.name}</div>
                <div className="text-sm text-slate-500">{p.mcu_id || "-"} Â· {p.province || "-"} Â· {p.source_name || "-"}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => loadParticipant(p, "blank")} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white">
                    Input Baru
                  </button>
                  <button type="button" onClick={() => loadParticipant(p, "edit")} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-black text-white">
                    Edit Hasil
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {!isAdminStageAssist && (
      <section className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-black">Daftar Peserta Selesai Operator Ini</div>
            <div className="text-sm text-slate-500">Hanya peserta yang sudah submit di stage {effectivePostName}. Klik peserta untuk lihat/edit hasil.</div>
          </div>

          <button
            type="button"
            className="rounded-2xl bg-blue-600 px-4 py-2 font-black text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
            onClick={() => refreshLists(true)}
            disabled={loadingList}
          >
            {loadingList ? "Memuat..." : `Selesai (${doneParticipants.length})`}
          </button>
        </div>

        <div className="mt-4 grid gap-2">
          {!displayedList.length && (
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
              {loadingList
                ? "Memuat daftar peserta selesai..."
                : hasLoadedList
                  ? "Belum ada peserta selesai untuk operator ini."
                  : "Klik tombol Selesai untuk menampilkan daftar peserta yang sudah submit."}
            </div>
          )}

          {displayedList.map((p: any) => (
            <div
              key={`${listTab}-${p.id}`}
              role="button"
              tabIndex={0}
              onClick={() => openFromOperatorList(p)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") openFromOperatorList(p);
              }}
              className={`cursor-pointer rounded-2xl border p-3 transition ${donePreviewParticipant?.id === p.id || participant?.id === p.id ? "border-emerald-300 bg-emerald-50 ring-2 ring-emerald-100" : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-black">{p.name}</div>
                  <div className="text-sm text-slate-500">{p.mcu_id || "-"} Â· {p.province || "-"} Â· {p.source_name || "-"}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                    Skor akhir: {p.operator_final_score_label ?? p.operator_final_score ?? "-"}
                  </div>
                  <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                    Sudah submit Â· klik untuk edit
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-black text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    openFromOperatorList(p);
                  }}
                >
                  Lihat / Edit Hasil
                </button>
              </div>
            </div>
          ))}

          {hasMoreDoneParticipants && (
            <div className="rounded-2xl bg-amber-50 p-3 text-sm font-semibold text-amber-700">
              Data selesai dibatasi 80 peserta terbaru supaya halaman tetap ringan. Gunakan kolom pencarian untuk membuka peserta tertentu yang tidak tampil di daftar.
            </div>
          )}
        </div>
      </section>
      )}


      {participant && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/60 p-3 backdrop-blur-sm md:p-6" data-operator-form-modal="v82">
          <div className="mx-auto flex h-full max-h-[94vh] max-w-5xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4 md:p-5">
              <div>
                <div className="text-sm font-black uppercase tracking-wide text-blue-700">{effectivePostName}</div>
                <div className="mt-1 text-2xl font-black text-slate-950">{participant.name}</div>
                <div className="mt-1 text-sm font-semibold text-slate-500">
                  {participant.mcu_id || "-"} Â· {participant.province || "-"} Â· {detail?.participant?.source_name || participant.source_name || "-"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setParticipant(null);
                  setDetail(null);
                  setParameters([]);
                  setValues({});
                }}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Tutup
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 md:p-5">
              {detail?.ok && (
        <section className="card space-y-4 p-5">
          <div>
            <div className="text-xl font-black">{participant.name}</div>
            <div className="text-sm text-slate-500">{participant.mcu_id} Â· {participant.province || "-"} Â· {detail.participant.source_name || "-"}</div>
          </div>
          <StageProgress stages={detail.stages} />
        </section>
      )}

              <form onSubmit={save} className="card space-y-6 p-5">
          <div className="text-lg font-black">
            Form {effectivePostName}<br />
            <span className="text-base font-black text-slate-700">{participant?.name}</span>
          </div>
          {!parameters.length && <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-700">Tidak ada parameter untuk post ini. Jalankan SQL reference dan cek mapping package.</div>}

          {groupedParameters.map((group) => (
            <div key={group.category} className="space-y-5">
              <div className="border-b border-slate-200 pb-2 text-base font-black text-slate-900">
                {group.category}
              </div>

              {group.params.map((param) => {
                const questionIndex = questionIndexByParamId[String(param.id)] ?? 0;
                const isCreamRow = questionIndex % 2 === 0;

                return (
                  <div
                    key={param.id}
                    className={`rounded-2xl border p-4 shadow-sm transition ${
                      isCreamRow
                        ? "border-amber-100 bg-amber-50/70"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <label className="label">{param.name}{param.unit ? ` (${param.unit})` : ""}</label>
                    {param.reference_text && <div className="mb-2 text-xs text-slate-500">{param.reference_text}</div>}
                    <ParameterInput
                      param={param}
                      value={values[param.id] || ""}
                      onChange={(nextValue) => updateValue(param.id, nextValue)}
                    />
                  </div>
                );
              })}
            </div>
          ))}

          <button className="btn-primary" disabled={!parameters.length}>Simpan Hasil Pemeriksaan</button>
          {message && <div className="rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">{message}</div>}
        </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



