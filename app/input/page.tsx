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
  if (forcedTht.length) return capaskaThtCanonicalizeOptionsV155(param, forcedTht);
  return capaskaThtCanonicalizeOptionsV155(param, parseChoiceOptions(param?.config_json));
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
  // MCU=CAPASKA-2026-0603;NAME=CHELSE OLIVIA
  const mcuMatch = raw.match(/(?:^|[;|\s])MCU\s*=\s*([^;|]+)/i);
  if (mcuMatch?.[1]) return mcuMatch[1].trim();

  const idMatch = raw.match(/(?:^|[;|\s])ID\s*=\s*([^;|]+)/i);
  if (idMatch?.[1]) return idMatch[1].trim();

  const nameMatch = raw.match(/(?:^|[;|\s])NAME\s*=\s*([^;|]+)/i);

  // Format alternatif:
  // CAPASKA-2026-0603 | CHELSE OLIVIA
  if (raw.includes("|")) {
    const parts = raw.split("|").map((x) => x.trim()).filter(Boolean);
    if (parts[0]) return parts[0];
  }

  // Format alternatif:
  // CHELSE OLIVI - CAPASKA-2026-0603
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
    [`${norm("Karang Gigi")}::${norm("Positive")}`]: -1,
    [`${norm("Caries Dentis")}::${norm("0 caries")}`]: 3,
    [`${norm("Caries Dentis")}::${norm("1 caries")}`]: -1,
    [`${norm("Caries Dentis")}::${norm("2 caries")}`]: -2,
    [`${norm("Caries Dentis")}::${norm("3 caries")}`]: -3,
    [`${norm("Caries Dentis")}::${norm(">3 caries")}`]: -10,
    [`${norm("Tumpatan Gigi")}::${norm("0 tumpatan")}`]: 2,
    [`${norm("Tumpatan Gigi")}::${norm("<3 tumpatan")}`]: 1,
    [`${norm("Tumpatan Gigi")}::${norm("<=5 tumpatan")}`]: 1,
    [`${norm("Tumpatan Gigi")}::${norm("<5 tumpatan")}`]: 1,
    [`${norm("Tumpatan Gigi")}::${norm(">3 tumpatan")}`]: -5,
    [`${norm("Tumpatan Gigi")}::${norm(">5 tumpatan")}`]: -5,
    [`${norm("Impaksi gigi")}::${norm("0 gigi")}`]: 3,
    [`${norm("Impaksi gigi")}::${norm("1 gigi")}`]: 2,
    [`${norm("Impaksi gigi")}::${norm("2 gigi")}`]: 1,
    [`${norm("Impaksi gigi")}::${norm("1 gigi depan")}`]: 1,
    [`${norm("Impaksi gigi")}::${norm(">2 gigi")}`]: -5,
    [`${norm("Impaksi gigi")}::${norm("2 gigi depan")}`]: -5,
    [`${norm("Impaksi gigi")}::${norm(">=4 gigi")}`]: -10,
    [`${norm("Kehilangan Gigi (Baik depan maupun belakang)")}::${norm("0 gigi")}`]: 2,
    [`${norm("Kehilangan Gigi (Baik depan maupun belakang)")}::${norm("1 gigi")}`]: 1,
    [`${norm("Kehilangan Gigi (Baik depan maupun belakang)")}::${norm("2 gigi")}`]: 0,
    [`${norm("Kehilangan Gigi (Baik depan maupun belakang)")}::${norm(">2 gigi")}`]: -10,
    [`${norm("Kehilangan Gigi bagian depan")}::${norm("0 gigi")}`]: 2,
    [`${norm("Kehilangan Gigi bagian depan")}::${norm("1 gigi")}`]: 1,
    [`${norm("Kehilangan Gigi bagian depan")}::${norm("2 gigi")}`]: 0,
    [`${norm("Kehilangan Gigi bagian depan")}::${norm(">2 gigi")}`]: -10,
    [`${norm("Infeksi Gusi")}::${norm("Negative")}`]: 1,
    [`${norm("Infeksi Gusi")}::${norm("Positive")}`]: -1,
    [`${norm("Dental panoramic")}::${norm("Normal")}`]: 3,
    [`${norm("Dental panoramic")}::${norm("ditemukan kelainan")}`]: -1,
    [`${norm("Dental panoramik")}::${norm("Normal")}`]: 3,
    [`${norm("Dental panoramik")}::${norm("ditemukan kelainan")}`]: -1,
    // THT - direct CAPASK 2026 scoring.
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




/* CAPASKA scoring 2026 restore v134
   Source: SIMULASI SCORING DALAM PENILAIAN KESEHATAN CAPASKA TK PUSAT 2026.
   Central rule:
   - Tidak Direkomendasikan / red flag = -10.
   - Healthy total target = 100.
   - This helper overrides old DB option.score when a known CAPASKA rule is found.
*/
function capaskaNorm(value: any): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[â‰¥]/g, ">=")
    .replace(/[â‰¤]/g, "<=")
    .replace(/\s+/g, " ")
    .trim();
}

function capaskaParamText(param: any): string {
  return capaskaNorm([
    param?.label,
    param?.name,
    param?.title,
    param?.parameter,
    param?.param_name,
    param?.question,
    param?.category,
    param?.post_name,
    param?.stage_name,
    param?.station_name,
    param?.id,
  ].filter(Boolean).join(" "));
}

function capaskaChoiceText(optionOrValue: any): string {
  if (optionOrValue && typeof optionOrValue === "object") {
    return capaskaNorm([
      optionOrValue.label,
      optionOrValue.value,
      optionOrValue.name,
      optionOrValue.text,
      optionOrValue.option_label,
      optionOrValue.description,
    ].filter(Boolean).join(" "));
  }

  return capaskaNorm(optionOrValue);
}

function capaskaRawOptionScore(optionOrValue: any): number | null {
  if (!optionOrValue || typeof optionOrValue !== "object") return null;

  const raw =
    optionOrValue.score_new ??
    optionOrValue.new_score ??
    optionOrValue.latest_score ??
    optionOrValue.score_2026 ??
    optionOrValue.score2026 ??
    optionOrValue.capaska_score_2026 ??
    optionOrValue.capaska_score ??
    optionOrValue.value_score_new ??
    optionOrValue.skor_baru ??
    optionOrValue.score ??
    optionOrValue.skor ??
    optionOrValue.value_score;

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function capaskaHas(text: string, pattern: RegExp): boolean {
  return pattern.test(text);
}

function capaskaNo(choice: string): boolean {
  return /tidak ada|tidak menggunakan|tidak pakai|tanpa|negative|negatif|\(-\)|normal|sesuai juknis|0 /.test(choice);
}

function capaskaAda(choice: string): boolean {
  return /(^| )ada( |$)|positive|positif|tidak normal|tidak sesuai|tidak intak|buta warna|ringan|sedang|berat|\(\+\)|>/.test(choice);
}

function capaskaIsRedFlagText(text: string): boolean {
  return /tidak direkomendasi|tidak direkomendasikan|red flag|unfit|diskualifikasi/.test(text);
}

function capaskaScore2026(param: any, optionOrValue: any): number | null {
  const p = capaskaParamText(param);
  const c = capaskaChoiceText(optionOrValue);
  const t = `${p} ${c}`;

  if (!c) return null;
  if (capaskaIsRedFlagText(t)) return -10;

  // =========================
  // 1. MATA, total 12
  // =========================
  if (/lensa|kacamata|kaca mata|kontak/.test(p)) {
    if (/tidak menggunakan|tidak pakai|tanpa/.test(c)) return 3;
    if (/menggunakan|pakai/.test(c)) return -1;
  }

  if (/buta warna/.test(p)) {
    if (/tidak buta warna/.test(c)) return 3;
    if (/parsial|total|buta warna/.test(c)) return -10;
  }

  if (/strabismus|juling/.test(p)) {
    if (/\(-\)\s*\/\s*\(-\)|negatif|tidak ada|normal/.test(c)) return 3;
    if (/\(\+\)|positif|ada/.test(c)) return -5;
  }

  if (/visus|od|os/.test(p)) {
    if (/normal|6\/6/.test(c) && !/<\s*6\/6/.test(c)) return 3;
    if (/<\s*6\/6|6\/12/.test(c) && !/<\s*6\/12/.test(c)) return 2;
    if (/<\s*6\/12/.test(c)) return -10;
  }

  // =========================
  // 2. GIGI, total 16
  // =========================
  const canonicalGigiScoreV150 = capaskaGigiCanonicalScoreV150(param, optionOrValue);
  if (canonicalGigiScoreV150 !== null) return canonicalGigiScoreV150;
  // =========================
  // 3. THT, total 10
  // =========================
  const canonicalThtScoreV155 = capaskaThtHardScoreV155(param, optionOrValue);
  if (canonicalThtScoreV155 !== null) return canonicalThtScoreV155;
  // =========================
  // 4. PENYAKIT DALAM, total 28
  // =========================
  if (/berat badan|bb\b/.test(p)) {
    if (/sesuai/.test(c) && !/tidak/.test(c)) return 1;
    if (/tidak sesuai/.test(c)) return -10;
  }

  if (/tinggi badan|\btb\b|tb\./.test(p)) {
    if (/sesuai/.test(c) && !/tidak/.test(c)) return 1;
    if (/tidak sesuai/.test(c)) return -10;
  }

  if (/tanda vital|suhu|nadi|napas|tekanan darah/.test(p)) {
    if (/normal/.test(c) && !/tidak normal/.test(c)) return 2;
    if (/tidak normal/.test(c)) return 1;
  }

  if (/tato/.test(p)) {
    if (/tidak ada/.test(c)) return 1;
    if (/ada/.test(c)) return -10;
  }

  if (/tindik/.test(p)) {
    if (/tidak ada|wanita.*1|1.*telinga/.test(c)) return 1;
    if (/ada|pria|>1|lebih/.test(c)) return -10;
  }

  if (/fisik.*jantung|pemeriksaan.*jantung/.test(p)) {
    if (/normal/.test(c) && !/tidak normal/.test(c)) return 2;
    if (/tidak normal/.test(c)) return 1;
  }

  if (/fisik.*paru|pemeriksaan.*paru/.test(p)) {
    if (/normal/.test(c) && !/tidak normal/.test(c)) return 2;
    if (/tidak normal/.test(c)) return 1;
  }

  if (/nt epigastr|epigastrium|liver|bising usus|bekas operasi/.test(p)) {
    if (/normal|tidak ada/.test(c) && !/tidak normal/.test(c)) return 1;
    if (/tidak normal|ada/.test(c)) return -2;
  }

  if (/hernia/.test(p)) {
    if (/normal|tidak ada/.test(c) && !/tidak normal/.test(c)) return 1;
    if (/tidak normal|ada/.test(c)) return -10;
  }

  if (/benjolan|tumor/.test(p)) {
    if (/normal|tidak ada/.test(c) && !/tidak normal/.test(c)) return 1;
    if (/tidak normal|ada/.test(c)) return -10;
  }

  if (/hemoroid|fisura/.test(p)) {
    if (/normal|tidak ada/.test(c) && !/tidak normal/.test(c)) return 1;
    if (/tidak normal|ada/.test(c)) return 0;
  }

  if (/struktur|striktur|prolaps|recti|rektum/.test(p)) {
    if (/normal|tidak ada/.test(c) && !/tidak normal/.test(c)) return 1;
    if (/tidak normal|ada/.test(c)) return -10;
  }

  if (/hidronefrosis|kongenital|hipospadia hidrokel|hipospadia|hidrokel|undescensus|undecensus|testis|batu sal|saluran kemih|cystitis|varikokel|phimosis/.test(p)) {
    if (/normal|negatif|negative|tidak ada/.test(c) && !/tidak normal/.test(c)) return 1;
    if (/tidak normal|positif|positive|ada/.test(c)) return -10;
  }

  // =========================
  // 5. JANTUNG DAN PEMBULUH DARAH, total 12
  // =========================
  if (/jantung|miocardial|miokardial|varises|vena|arteri|ekstremitas/.test(p)) {
    if (/tidak ada/.test(c)) return 2;
    if (/ada/.test(c)) {
      if (/varises|vena|insufisiensi/.test(p)) return -1;
      return -10;
    }
  }

  // =========================
  // 6. ORTOPEDI, total target 16
  // =========================
  if (/sindaktili|polidaktili|polidact|spina bifida|mallet|hiperekstensi lengan|hammer toe|hallux|webbed toe|o\/x|bean|been|pes planus|kaki datar|hiperekstensi kaki|general laxity/.test(p)) {
    if (/tidak ada|normal|dalam toleransi|<\s*5/.test(c)) return 1;
    if (/ada|tidak normal|di luar|>\s*5/.test(c)) return -10;
  }

  if (/ortopedi/.test(p) && /skoliosis|kifosis|lordosis|vertebra|tulang belakang/.test(p)) {
    if (/tidak ada|normal/.test(c)) return 1;
    if (/ringan/.test(c)) return -1;
    if (/sedang|berat|ada|tidak normal/.test(c)) return -10;
  }

  // =========================
  // 7. RADIOLOGI / WHOLE SPINE, total 6
  // =========================
  if (/radiologi|rontgen|whole spine|ap lateral|thoracolumbosacral/.test(p)) {
    if (/tidak ada|normal|ta\b/.test(c)) return 2;
    if (/ringan/.test(c)) return -1;
    if (/sedang|berat|ada|tidak normal/.test(c)) return -10;
  }

  return null;
}


/* CAPASKA vertebra scoring fix v136
   Scope only: Ortopedi > Vertebra / Tulang Belakang
   Parameters: Skoliosis, Kifosis, Lordosis
   Reference:
   - Tidak ada = 2 untuk setiap poin
   - Ringan = -1 untuk setiap poin
   - Sedang / Berat = Tidak Direkomendasikan (-10)
   Current UI may show "Ada" instead of "Sedang/Berat"; treat "Ada" as red flag (-10).
*/
function capaskaVertebraNorm(value: any): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function capaskaVertebraParamText(param: any): string {
  return capaskaVertebraNorm([
    param?.label,
    param?.name,
    param?.title,
    param?.parameter,
    param?.param_name,
    param?.question,
    param?.category,
    param?.post_name,
    param?.stage_name,
    param?.station_name,
    param?.id,
  ].filter(Boolean).join(" "));
}

function capaskaVertebraChoiceText(optionOrValue: any): string {
  if (optionOrValue && typeof optionOrValue === "object") {
    return capaskaVertebraNorm([
      optionOrValue.label,
      optionOrValue.value,
      optionOrValue.name,
      optionOrValue.text,
      optionOrValue.option_label,
      optionOrValue.description,
    ].filter(Boolean).join(" "));
  }

  return capaskaVertebraNorm(optionOrValue);
}

function capaskaIsVertebraParam(param: any): boolean {
  const p = capaskaVertebraParamText(param);
  return /skoliosis|scoliosis|kifosis|kyphosis|lordosis/.test(p);
}

function capaskaVertebraScoreFix(param: any, optionOrValue: any): number | null {
  if (!capaskaIsVertebraParam(param)) return null;

  const c = capaskaVertebraChoiceText(optionOrValue);

  if (/tidak ada|normal/.test(c)) return 2;
  if (/ringan/.test(c)) return -1;
  if (/sedang|berat|ada/.test(c)) return -10;

  return null;
}


/* CAPASKA penyakit dalam scoring fix v137
   Scope only: Pemeriksaan Kesehatan Penyakit Dalam.
   Reference from CAPASKA 2026 table:
   - BB/TB sesuai juknis = 1, tidak sesuai juknis = -10
   - Tanda vital normal = 2, tidak normal = 1
   - Tato tidak ada = 1, ada = -10
   - Tindik tidak ada / wanita hanya 1 telinga = 1, pria ada / wanita >1 = -10
   - Fisik jantung/paru normal = 2, tidak normal = 1
   - Abdomen normal = 1, tidak normal = -2
   - Hernia/benjolan/tumor tidak ada = 1, ada = -10
   - Hemoroid/fisura tidak ada = 1, ada = 0
   - Striktur/prolaps recti tidak ada = 1, ada = -10
   - Urogenitalia normal = 1, tidak normal = -10
*/
function capaskaPenyakitDalamNorm(value: any): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[â‰¥]/g, ">=")
    .replace(/[â‰¤]/g, "<=")
    .replace(/\s+/g, " ")
    .trim();
}

function capaskaPenyakitDalamParamText(param: any): string {
  return capaskaPenyakitDalamNorm([
    param?.label,
    param?.name,
    param?.title,
    param?.parameter,
    param?.param_name,
    param?.question,
    param?.category,
    param?.post_name,
    param?.stage_name,
    param?.station_name,
    param?.id,
  ].filter(Boolean).join(" "));
}

function capaskaPenyakitDalamChoiceText(optionOrValue: any): string {
  if (optionOrValue && typeof optionOrValue === "object") {
    return capaskaPenyakitDalamNorm([
      optionOrValue.label,
      optionOrValue.value,
      optionOrValue.name,
      optionOrValue.text,
      optionOrValue.option_label,
      optionOrValue.description,
    ].filter(Boolean).join(" "));
  }

  return capaskaPenyakitDalamNorm(optionOrValue);
}

function capaskaPDChoiceIsNormal(c: string): boolean {
  return /normal/.test(c) && !/tidak normal|abnormal/.test(c);
}

function capaskaPDChoiceIsTidakNormal(c: string): boolean {
  return /tidak normal|abnormal/.test(c);
}

function capaskaPDChoiceIsTidakAda(c: string): boolean {
  return /tidak ada|tidak terdapat|\(-\)|negatif|negative/.test(c);
}

function capaskaPDChoiceIsAda(c: string): boolean {
  return /(^| )ada( |$)|\(\+\)|positif|positive/.test(c);
}

function capaskaPenyakitDalamScoreFix(param: any, optionOrValue: any): number | null {
  const p = capaskaPenyakitDalamParamText(param);
  const c = capaskaPenyakitDalamChoiceText(optionOrValue);

  if (!c) return null;

  // BB / TB
  if (/(^| )bb(\b| )|berat badan/.test(p)) {
    if (/tidak sesuai/.test(c)) return -10;
    if (/sesuai/.test(c)) return 1;
  }

  if (/(^| )tb(\b| )|tinggi badan/.test(p)) {
    if (/tidak sesuai/.test(c)) return -10;
    if (/sesuai/.test(c)) return 1;
  }

  // Tanda vital
  if (/tanda vital|suhu|nadi|napas|pernapasan|respirasi|tekanan darah|tensi/.test(p)) {
    if (capaskaPDChoiceIsTidakNormal(c)) return 1;
    if (capaskaPDChoiceIsNormal(c)) return 2;
  }

  // Tato
  if (/tato/.test(p)) {
    if (capaskaPDChoiceIsTidakAda(c) || /tidak ada tato/.test(c)) return 1;
    if (capaskaPDChoiceIsAda(c) || /ada tato/.test(c)) return -10;
  }

  // Tindik selain anting. Wanita hanya 1/telinga masih acceptable.
  if (/tindik/.test(p)) {
    if (capaskaPDChoiceIsTidakAda(c)) return 1;
    if (/pria|wanita.*>\s*1|wanita.*lebih|>\s*1|lebih dari 1/.test(c) || capaskaPDChoiceIsAda(c)) return -10;
  }

  // Pemeriksaan fisik jantung dan paru
  if (/fisik.*jantung|pemeriksaan.*jantung/.test(p)) {
    if (capaskaPDChoiceIsTidakNormal(c)) return 1;
    if (capaskaPDChoiceIsNormal(c)) return 2;
  }

  if (/fisik.*paru|pemeriksaan.*paru/.test(p)) {
    if (capaskaPDChoiceIsTidakNormal(c)) return 1;
    if (capaskaPDChoiceIsNormal(c)) return 2;
  }

  // Abdomen: NT epigastrium, liver, bising usus, bekas operasi >3 bulan
  if (/nt epigastr|epigastrium|liver|bising usus|bekas operasi/.test(p)) {
    if (capaskaPDChoiceIsTidakNormal(c)) return -2;
    if (capaskaPDChoiceIsNormal(c)) return 1;
  }

  // Hernia, benjolan, tumor
  if (/hernia/.test(p)) {
    if (capaskaPDChoiceIsTidakAda(c)) return 1;
    if (capaskaPDChoiceIsAda(c)) return -10;
  }

  if (/benjolan|tumor/.test(p)) {
    if (capaskaPDChoiceIsTidakAda(c)) return 1;
    if (capaskaPDChoiceIsAda(c)) return -10;
  }

  // Anus & rektum
  if (/striktur|struktur|prolaps|recti|rektum/.test(p)) {
    if (capaskaPDChoiceIsTidakAda(c) || capaskaPDChoiceIsNormal(c)) return 1;
    if (capaskaPDChoiceIsAda(c) || capaskaPDChoiceIsTidakNormal(c)) return -10;
  }

  if (/hemoroid|hemorrhoid|fisura/.test(p)) {
    if (capaskaPDChoiceIsTidakAda(c) || capaskaPDChoiceIsNormal(c)) return 1;
    if (capaskaPDChoiceIsAda(c) || capaskaPDChoiceIsTidakNormal(c)) return 0;
  }

  // Urogenitalia: each normal = 1, any tidak normal/positive = -10.
  if (/hidronefrosis|kelainan kongenital|hipospadia hidrokel|hipospadia|hidrokel|undescensus|undecensus|testis|batu.*kemih|batu.*sal|saluran kemih|cystitis|sistitis|varikokel|phimosis|fimosis/.test(p)) {
    if (capaskaPDChoiceIsTidakNormal(c) || capaskaPDChoiceIsAda(c)) return -10;
    if (capaskaPDChoiceIsNormal(c) || capaskaPDChoiceIsTidakAda(c)) return 1;
  }

  return null;
}


/* CAPASKA jantung scoring fix v138
   Scope only: Form Kesehatan Jantung dan Pembuluh Darah.
   Reference:
   - Kelainan Anatomi Jantung: Tidak ada = 2, Ada = -10
   - Kelainan Irama Jantung yang mengganggu latihan fisik sedang: Tidak ada = 2, Ada = -10
   - Iskemik Miocardial: Tidak ada = 2, Ada = -10
   - Kelainan kongenital jantung: Tidak ada = 2, Ada = -10
   - Varises Tungkai (insufisiensi vena): Tidak ada = 2, Ada = -1
   - Kelainan Arteri pada ekstremitas: Tidak ada = 2, Ada = -10
*/
function capaskaJantungNorm(value: any): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function capaskaJantungParamText(param: any): string {
  return capaskaJantungNorm([
    param?.label,
    param?.name,
    param?.title,
    param?.parameter,
    param?.param_name,
    param?.question,
    param?.category,
    param?.post_name,
    param?.stage_name,
    param?.station_name,
    param?.id,
  ].filter(Boolean).join(" "));
}

function capaskaJantungChoiceText(optionOrValue: any): string {
  if (optionOrValue && typeof optionOrValue === "object") {
    return capaskaJantungNorm([
      optionOrValue.label,
      optionOrValue.value,
      optionOrValue.name,
      optionOrValue.text,
      optionOrValue.option_label,
      optionOrValue.description,
    ].filter(Boolean).join(" "));
  }

  return capaskaJantungNorm(optionOrValue);
}

function capaskaJantungIsTidakAda(choice: string): boolean {
  return /tidak ada|tidak terdapat|\(-\)|negatif|negative|normal/.test(choice) && !/tidak normal/.test(choice);
}

function capaskaJantungIsAda(choice: string): boolean {
  return /(^| )ada( |$)|\(\+\)|positif|positive|tidak normal/.test(choice);
}

function capaskaJantungScoreFix(param: any, optionOrValue: any): number | null {
  const p = capaskaJantungParamText(param);
  const c = capaskaJantungChoiceText(optionOrValue);

  if (!c) return null;

  // Restrict to Jantung dan Pembuluh Darah fields only.
  const isJantungField =
    /kelainan anatomi jantung|anatomi jantung/.test(p) ||
    /kelainan irama jantung|irama jantung/.test(p) ||
    /iskemik|miocardial|miokardial/.test(p) ||
    /kelainan kongenital jantung|kongenital jantung/.test(p) ||
    /varises tungkai|insufisiensi vena|vena/.test(p) ||
    /kelainan arteri|arteri.*ekstremitas|ekstrimitas|ekstremitas/.test(p);

  if (!isJantungField) return null;

  // Varises is the only non-redflag "Ada" in this section.
  if (/varises tungkai|insufisiensi vena|vena/.test(p)) {
    if (capaskaJantungIsTidakAda(c)) return 2;
    if (capaskaJantungIsAda(c)) return -1;
    return null;
  }

  // All other Jantung/Pembuluh Darah items.
  if (capaskaJantungIsTidakAda(c)) return 2;
  if (capaskaJantungIsAda(c)) return -10;

  return null;
}


/* CAPASKA THT scoring fix v139
   Scope only: Pemeriksaan Kesehatan THT.
   Reference:
   - Membran timpani: Intak = 2, Tidak intak = -10
   - Serumen: Tidak ada = 2, Ada serumen = 1
   - Tonsil: T0/T1-T1 or Sudah tonsilektomi = 2, T2a-T2a = 1, T2b-T2b = -1, T3-T3 = -10
   - Rhinitis Alergi (lividae): Negatif/(-) = 2, Positif/(+) = 1
   - Epistaksis 1 tahun terakhir: Tidak ada = 1, Ada = -1
   - Tes Garputala Weber 512 Hz: Normal = 1, Tidak Normal = -10

   Notes:
   - If old database label says divide/dividae, treat it as lividae for scoring and display.
*/
function capaskaThtNorm(value: any): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function capaskaThtParamText(param: any): string {
  return capaskaThtNorm([
    param?.label,
    param?.name,
    param?.title,
    param?.parameter,
    param?.param_name,
    param?.question,
    param?.category,
    param?.post_name,
    param?.stage_name,
    param?.station_name,
    param?.id,
  ].filter(Boolean).join(" "));
}

function capaskaThtChoiceText(optionOrValue: any): string {
  if (optionOrValue && typeof optionOrValue === "object") {
    return capaskaThtNorm([
      optionOrValue.label,
      optionOrValue.value,
      optionOrValue.name,
      optionOrValue.text,
      optionOrValue.option_label,
      optionOrValue.description,
    ].filter(Boolean).join(" "));
  }

  return capaskaThtNorm(optionOrValue);
}

function capaskaThtDisplayLabelFix(value: any): any {
  if (typeof value !== "string") return value;
  return value
    .replace(/\(\s*dividae\s*\)/gi, "(lividae)")
    .replace(/\(\s*divide\s*\)/gi, "(lividae)")
    .replace(/Rhinitis Alergi\s+divide/gi, "Rhinitis Alergi (lividae)")
    .replace(/Rhinitis Alergi\s+dividae/gi, "Rhinitis Alergi (lividae)");
}

function capaskaThtIsTidakAda(choice: string): boolean {
  return /tidak ada|tidak terdapat|\(-\)|negatif|negative/.test(choice);
}

function capaskaThtIsAda(choice: string): boolean {
  return /(^| )ada( |$)|\(\+\)|positif|positive/.test(choice);
}

function capaskaThtIsNormal(choice: string): boolean {
  return /normal/.test(choice) && !/tidak normal|abnormal/.test(choice);
}

function capaskaThtIsTidakNormal(choice: string): boolean {
  return /tidak normal|abnormal/.test(choice);
}

function capaskaThtScoreFix(param: any, optionOrValue: any): number | null {
  return capaskaThtHardScoreV155(param, optionOrValue);
}


/* CAPASKA gigi full scoring fix v147
   Scope only: Form Kesehatan Gigi & Mulut + Dental Panoramik.
   Reference scoring:
   - Karang gigi: (+) / positive = -1, (-) / negative = 2
   - Caries dentis: 0=3, 1=-1, 2=-2, 3=-3, >3=-10
   - Tumpatan gigi: 0=2, <=5=1, >5=-5
   - Impaksi gigi depan: 0=3, 1=2, 2 gigi / 1 gigi depan=1, >2 gigi / 2 gigi depan=-5, >=4 gigi=-10
   - Kehilangan gigi bagian depan: 0=2, 1=1, 2=0, >2=-10
   - Infeksi gusi: (+)= -1, (-)=1
   - Dental panoramic: Normal=3, ditemukan kelainan=-1
*/
function capaskaGigiFullNorm(value: any): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[â‰¥]/g, ">=")
    .replace(/[â‰¤]/g, "<=")
    .replace(/\s+/g, " ")
    .trim();
}

function capaskaGigiFullParamText(param: any): string {
  return capaskaGigiFullNorm([
    param?.label,
    param?.name,
    param?.title,
    param?.parameter,
    param?.param_name,
    param?.question,
    param?.category,
    param?.post_name,
    param?.stage_name,
    param?.station_name,
    param?.id,
  ].filter(Boolean).join(" "));
}

function capaskaGigiFullChoiceText(optionOrValue: any): string {
  if (optionOrValue && typeof optionOrValue === "object") {
    return capaskaGigiFullNorm([
      optionOrValue.label,
      optionOrValue.value,
      optionOrValue.name,
      optionOrValue.text,
      optionOrValue.option_label,
      optionOrValue.description,
    ].filter(Boolean).join(" "));
  }

  return capaskaGigiFullNorm(optionOrValue);
}

function capaskaGigiChoiceDisplayLabelFix(param: any, optionOrValue: any): string {
  const p = capaskaGigiFullParamText(param);
  const raw =
    optionOrValue && typeof optionOrValue === "object"
      ? String(optionOrValue.label ?? optionOrValue.value ?? "")
      : String(optionOrValue ?? "");

  const c = capaskaGigiFullNorm(raw);

  // Display-only fix for old database labels in Gigi section.
  if (/tumpatan/.test(p)) {
    if (/<=\s*3|â‰¤\s*3|<\s*=\s*3/.test(c)) return "<=5 tumpatan";
    if (/>\s*3/.test(c)) return ">5 tumpatan";
  }

  if (/kehilangan.*gigi|gigi.*hilang/.test(p)) {
    return raw.replace(/baik depan maupun belakang/gi, "bagian depan");
  }

  return raw;
}

function capaskaGigiIsPositive(choice: string): boolean {
  return /positive|positif|\(\+\)|(^| )ada( |$)/.test(choice) && !/tidak ada/.test(choice);
}

function capaskaGigiIsNegative(choice: string): boolean {
  return /negative|negatif|\(-\)|tidak ada/.test(choice);
}

function capaskaGigiFullScoreFix(param: any, optionOrValue: any): number | null {
  return capaskaGigiCanonicalScoreV150(param, optionOrValue);
}


/* CAPASKA parameter structure cleanup v148
   Scope only: CAPASKA input form display structure.
   Fixes:
   1) THT: Rhinitis Alergi (lividae) appears once only.
   2) Penyakit Dalam: Hipospadia + Hidrokel appears as one combined question "Hipospadia Hidrokel".
   Notes:
   - Scoring functions are not changed here.
   - Other parameters keep their original structure.
*/
function capaskaParamStructureNorm(value: any): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function capaskaParamStructureText(param: any): string {
  return capaskaParamStructureNorm([
    param?.label,
    param?.name,
    param?.title,
    param?.parameter,
    param?.param_name,
    param?.question,
    param?.id,
  ].filter(Boolean).join(" "));
}

function capaskaIsRhinitisLividaeParam(param: any): boolean {
  const p = capaskaParamStructureText(param);
  return /rhinitis|rinitis/.test(p) && /lividae|divide|dividae/.test(p);
}

function capaskaIsHipospadiaParam(param: any): boolean {
  const p = capaskaParamStructureText(param);
  return /hipospadia/.test(p);
}

function capaskaIsStandaloneHidrokelParam(param: any): boolean {
  const p = capaskaParamStructureText(param);
  return /hidrokel/.test(p) && !/hipospadia/.test(p);
}

function capaskaInputDisplayLabel(param: any): string {
  const raw = String(param?.label ?? param?.name ?? param?.title ?? param?.parameter ?? param?.param_name ?? param?.question ?? "");

  if (capaskaIsRhinitisLividaeParam(param)) {
    return "Rhinitis Alergi (lividae)";
  }

  if (capaskaIsHipospadiaParam(param)) {
    return "Hipospadia Hidrokel";
  }

  return raw;
}

function capaskaCloneParamWithLabel(param: any, label: string): any {
  if (!param || typeof param !== "object") return param;

  return {
    ...param,
    label,
    name: param?.name ? label : param?.name,
    title: param?.title ? label : param?.title,
    parameter: param?.parameter ? label : param?.parameter,
    param_name: param?.param_name ? label : param?.param_name,
    question: param?.question ? label : param?.question,
  };
}

function capaskaCleanDisplayParams(params: any): any[] {
  const list = Array.isArray(params) ? params : [];
  const cleaned: any[] = [];
  let hasRhinitisLividae = false;
  let hasHipospadiaCombined = false;

  for (const param of list) {
    if (capaskaIsRhinitisLividaeParam(param)) {
      if (hasRhinitisLividae) continue;
      hasRhinitisLividae = true;
      cleaned.push(capaskaCloneParamWithLabel(param, "Rhinitis Alergi (lividae)"));
      continue;
    }

    if (capaskaIsHipospadiaParam(param)) {
      if (hasHipospadiaCombined) continue;
      hasHipospadiaCombined = true;
      cleaned.push(capaskaCloneParamWithLabel(param, "Hipospadia Hidrokel"));
      continue;
    }

    if (capaskaIsStandaloneHidrokelParam(param)) {
      continue;
    }

    cleaned.push(param);
  }

  return cleaned;
}


/* CAPASKA gigi strict score fix v149
   Scope only: Gigi & Mulut + Dental Panoramik scoring display.
   This override wins over old DB score/old patches for these exact Gigi rules:
   - Tumpatan: 0=2, <=5=1, >5=-5
   - Impaksi: 0=3, 1=2, 2 / 1 gigi depan=1, >2 / 2 gigi depan=-5, >=4=-10
   - Kehilangan Gigi: 0=2, 1=1, 2=0, >2=-10
   - Caries: 0=3, 1=-1, 2=-2, 3=-3, >3=-10
   - Karang/Infeksi/Dental panoramic kept per reference.
*/
function capaskaGigiV149Norm(value: any): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[â‰¥]/g, ">=")
    .replace(/[â‰¤]/g, "<=")
    .replace(/\s+/g, " ")
    .trim();
}

function capaskaGigiV149ParamText(param: any): string {
  return capaskaGigiV149Norm([
    param?.label,
    param?.name,
    param?.title,
    param?.parameter,
    param?.param_name,
    param?.question,
    param?.category,
    param?.post_name,
    param?.stage_name,
    param?.station_name,
    param?.id,
  ].filter(Boolean).join(" "));
}

function capaskaGigiV149ChoiceText(optionOrValue: any): string {
  if (optionOrValue && typeof optionOrValue === "object") {
    return capaskaGigiV149Norm([
      optionOrValue.label,
      optionOrValue.value,
      optionOrValue.name,
      optionOrValue.text,
      optionOrValue.option_label,
      optionOrValue.description,
    ].filter(Boolean).join(" "));
  }

  return capaskaGigiV149Norm(optionOrValue);
}

function capaskaGigiV149Positive(choice: string): boolean {
  return /positive|positif|\(\+\)|(^| )ada( |$)/.test(choice) && !/tidak ada/.test(choice);
}

function capaskaGigiV149Negative(choice: string): boolean {
  return /negative|negatif|\(-\)|tidak ada/.test(choice);
}

function capaskaGigiV149Score(param: any, optionOrValue: any): number | null {
  return capaskaGigiCanonicalScoreV150(param, optionOrValue);
}

function capaskaGigiV149DisplayScore(param: any, optionOrValue: any, fallbackValue?: any): number {
  const forced = capaskaGigiV149Score(param, optionOrValue);
  if (forced !== null) return forced;

  const fromFallback = capaskaGigiV149Score(param, fallbackValue);
  if (fromFallback !== null) return fromFallback;

  const raw =
    optionOrValue && typeof optionOrValue === "object"
      ? optionOrValue.score ?? optionOrValue.skor ?? optionOrValue.value_score
      : null;

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function capaskaGigiV149OptionLabel(param: any, optionOrValue: any): string {
  const p = capaskaGigiV149ParamText(param);
  const raw =
    optionOrValue && typeof optionOrValue === "object"
      ? String(optionOrValue.label ?? optionOrValue.value ?? "")
      : String(optionOrValue ?? "");

  const c = capaskaGigiV149Norm(raw);

  if (/tumpatan/.test(p)) {
    if (/<\s*3|<=\s*3|<\s*=\s*3|<\s*5|<=\s*5|<\s*=\s*5/.test(c)) return "<=5 tumpatan";
    if (/>\s*3|>\s*5|lebih\s*dari\s*3|lebih\s*dari\s*5/.test(c)) return ">5 tumpatan";
  }

  if (/impaksi|impacted/.test(p)) {
    if (/>=\s*4|>\s*=\s*4|4\s*gigi|lebih\s*dari\s*3/.test(c)) return ">=4 gigi";
    if (/> ?2|>\s*2|lebih\s*dari\s*2|2\s*gigi\s*depan/.test(c)) return ">2 gigi impaksi / 2 gigi depan impaksi";
    if (/2\s*gigi|1\s*gigi\s*depan/.test(c)) return "2 gigi impaksi / 1 gigi depan impaksi";
  }

  if (/kehilangan.*gigi|gigi.*hilang/.test(p)) {
    if (/> ?2|>\s*2|lebih\s*dari\s*2/.test(c)) return ">2 gigi";
  }

  return raw;
}


/* CAPASKA GIGI canonical cleanup v150
   Purpose: remove the effect of old Gigi scoring history.
   This is the single highest-priority Gigi resolver for:
   Karang, Caries, Tumpatan, Impaksi, Kehilangan Gigi, Infeksi Gusi, Dental Panoramic.
*/
function capaskaGigiCanonicalNormV150(value: any): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/â‰¥|Ã¢â€°Â¥/g, ">=")
    .replace(/â‰¤|Ã¢â€°Â¤/g, "<=")
    .replace(/[â€“â€”]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function capaskaGigiCanonicalParamTextV150(param: any): string {
  return capaskaGigiCanonicalNormV150([
    param?.label,
    param?.name,
    param?.title,
    param?.parameter,
    param?.param_name,
    param?.question,
    param?.category,
    param?.post_name,
    param?.stage_name,
    param?.station_name,
    param?.id,
  ].filter(Boolean).join(" "));
}

function capaskaGigiCanonicalChoiceTextV150(optionOrValue: any): string {
  if (optionOrValue && typeof optionOrValue === "object") {
    return capaskaGigiCanonicalNormV150([
      optionOrValue.label,
      optionOrValue.value,
      optionOrValue.name,
      optionOrValue.text,
      optionOrValue.option_label,
      optionOrValue.description,
    ].filter(Boolean).join(" "));
  }

  return capaskaGigiCanonicalNormV150(optionOrValue);
}

function capaskaGigiCanonicalIsGigiParamV150(param: any): boolean {
  const p = capaskaGigiCanonicalParamTextV150(param);
  return /karang|caries|karies|dentis|tumpatan|impaksi|kehilangan.*gigi|gigi.*hilang|infeksi.*gusi|gusi.*infeksi|dental.*panoramic|dental.*panoramik|panoramic|panoramik/.test(p);
}

function capaskaGigiCanonicalPositiveV150(choice: string): boolean {
  return /positive|positif|\(\+\)|(^| )ada( |$)/.test(choice) && !/tidak ada/.test(choice);
}

function capaskaGigiCanonicalNegativeV150(choice: string): boolean {
  return /negative|negatif|\(-\)|tidak ada/.test(choice);
}

function capaskaGigiCanonicalScoreV150(param: any, optionOrValue: any): number | null {
  const p = capaskaGigiCanonicalParamTextV150(param);
  const c = capaskaGigiCanonicalChoiceTextV150(optionOrValue);

  if (!c || !capaskaGigiCanonicalIsGigiParamV150(param)) return null;

  // Karang Gigi: (+) = -1, (-) = 2
  if (/karang/.test(p)) {
    if (capaskaGigiCanonicalPositiveV150(c)) return -1;
    if (capaskaGigiCanonicalNegativeV150(c)) return 2;
  }

  // Caries Dentis: 0=3, 1=-1, 2=-2, 3=-3, >3=-10
  if (/caries|karies|dentis/.test(p)) {
    if (/> ?3|>\s*3|lebih\s*dari\s*3|di atas\s*3|lebih\s*3/.test(c)) return -10;
    if (/(^|[^0-9])0\s*(caries|karies)?/.test(c)) return 3;
    if (/(^|[^0-9])1\s*(caries|karies)?/.test(c)) return -1;
    if (/(^|[^0-9])2\s*(caries|karies)?/.test(c)) return -2;
    if (/(^|[^0-9])3\s*(caries|karies)?/.test(c)) return -3;
  }

  // Tumpatan Gigi: 0=2, <=5=1, >5=-5.
  // Old UI labels <3 / <=3 are treated as the latest <=5 bucket.
  if (/tumpatan/.test(p)) {
    if (/(^|[^0-9])0\s*tumpatan/.test(c)) return 2;

    // IMPORTANT: high bucket must be checked before matching any number 5.
    if (/> ?5|>\s*5|lebih\s*dari\s*5|>\s*3|lebih\s*dari\s*3/.test(c)) return -5;

    if (/<= ?5|<=\s*5|<\s*=\s*5|< ?5|<\s*5|<= ?3|<=\s*3|<\s*=\s*3|< ?3|<\s*3/.test(c)) return 1;
    if (/(^|[^0-9])[1-5]\s*tumpatan/.test(c)) return 1;
  }

  // Impaksi Gigi Depan:
  // 0=3, 1=2, 2 gigi / 1 gigi depan=1,
  // >2 gigi / 2 gigi depan=-5, >=4=-10.
  if (/impaksi|impacted/.test(p)) {
    if (/>= ?4|>=\s*4|4\s*gigi|lebih\s*dari\s*3|di atas\s*3/.test(c)) return -10;
    if (/> ?2|>\s*2|lebih\s*dari\s*2|2\s*gigi\s*depan/.test(c)) return -5;
    if (/2\s*gigi|1\s*gigi\s*depan/.test(c)) return 1;
    if (/(^|[^0-9])1\s*gigi/.test(c)) return 2;
    if (/(^|[^0-9])0\s*gigi/.test(c)) return 3;
  }

  // Kehilangan Gigi bagian depan: 0=2, 1=1, 2=0, >2=-10
  if (/kehilangan.*gigi|gigi.*hilang/.test(p)) {
    if (/> ?2|>\s*2|lebih\s*dari\s*2|di atas\s*2/.test(c)) return -10;
    if (/(^|[^0-9])2\s*gigi/.test(c)) return 0;
    if (/(^|[^0-9])1\s*gigi/.test(c)) return 1;
    if (/(^|[^0-9])0\s*gigi/.test(c)) return 2;
  }

  // Infeksi Gusi: (+)=-1, (-)=1
  if (/infeksi.*gusi|gusi.*infeksi/.test(p)) {
    if (capaskaGigiCanonicalPositiveV150(c)) return -1;
    if (capaskaGigiCanonicalNegativeV150(c)) return 1;
  }

  // Dental Panoramic: Normal=3, kelainan=-1
  if (/dental.*panoramic|dental.*panoramik|panoramic|panoramik/.test(p)) {
    if (/normal/.test(c) && !/tidak normal|kelainan|abnormal/.test(c)) return 3;
    if (/kelainan|ditemukan|tidak normal|abnormal/.test(c)) return -1;
  }

  return null;
}

function capaskaGigiCanonicalLabelV150(param: any, optionOrValue: any): string {
  const raw =
    optionOrValue && typeof optionOrValue === "object"
      ? String(optionOrValue.label ?? optionOrValue.value ?? "")
      : String(optionOrValue ?? "");

  const p = capaskaGigiCanonicalParamTextV150(param);
  const c = capaskaGigiCanonicalNormV150(raw);

  if (/tumpatan/.test(p)) {
    if (/(^|[^0-9])0\s*tumpatan/.test(c)) return "0 tumpatan";
    if (/> ?5|>\s*5|lebih\s*dari\s*5|>\s*3|lebih\s*dari\s*3/.test(c)) return ">5 tumpatan";
    if (/<= ?5|<=\s*5|<\s*=\s*5|< ?5|<\s*5|<= ?3|<=\s*3|<\s*=\s*3|< ?3|<\s*3/.test(c)) return "<=5 tumpatan";
  }

  if (/impaksi|impacted/.test(p)) {
    if (/>= ?4|>=\s*4|4\s*gigi|lebih\s*dari\s*3|di atas\s*3/.test(c)) return ">=4 gigi";
    if (/> ?2|>\s*2|lebih\s*dari\s*2|2\s*gigi\s*depan/.test(c)) return ">2 gigi impaksi / 2 gigi depan impaksi";
    if (/2\s*gigi|1\s*gigi\s*depan/.test(c)) return "2 gigi impaksi / 1 gigi depan impaksi";
  }

  if (/kehilangan.*gigi|gigi.*hilang/.test(p)) {
    if (/> ?2|>\s*2|lebih\s*dari\s*2|di atas\s*2/.test(c)) return ">2 gigi";
    return raw.replace(/baik depan maupun belakang/gi, "bagian depan");
  }

  return raw;
}


/* CAPASKA progress canonical count v151
   Purpose:
   Fix stage progress/completion count so Penyakit Dalam is 28 canonical params,
   not 29 raw DB params.

   Specific canonical rules for progress:
   - Penyakit Dalam: Hipospadia + Hidrokel = 1 question "Hipospadia Hidrokel"
   - THT: duplicate Rhinitis Alergi (lividae/divide/dividae) counted once

   This does not change scoring.
*/
function capaskaProgressNormV151(value: any): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function capaskaProgressParamTextV151(param: any): string {
  return capaskaProgressNormV151([
    param?.label,
    param?.name,
    param?.title,
    param?.parameter,
    param?.param_name,
    param?.question,
    param?.id,
  ].filter(Boolean).join(" "));
}

function capaskaProgressIsRhinitisLividaeV151(param: any): boolean {
  const p = capaskaProgressParamTextV151(param);
  return /rhinitis|rinitis/.test(p) && /lividae|divide|dividae/.test(p);
}

function capaskaProgressIsHipospadiaV151(param: any): boolean {
  return /hipospadia/.test(capaskaProgressParamTextV151(param));
}

function capaskaProgressIsStandaloneHidrokelV151(param: any): boolean {
  const p = capaskaProgressParamTextV151(param);
  return /hidrokel/.test(p) && !/hipospadia/.test(p);
}

function capaskaProgressCleanParamsV151(params: any): any[] {
  const list = Array.isArray(params) ? params : [];
  const cleaned: any[] = [];
  let hasRhinitisLividae = false;
  let hasHipospadiaHidrokel = false;

  for (const param of list) {
    if (capaskaProgressIsRhinitisLividaeV151(param)) {
      if (hasRhinitisLividae) continue;
      hasRhinitisLividae = true;
      cleaned.push(param);
      continue;
    }

    if (capaskaProgressIsHipospadiaV151(param)) {
      if (hasHipospadiaHidrokel) continue;
      hasHipospadiaHidrokel = true;
      cleaned.push(param);
      continue;
    }

    if (capaskaProgressIsStandaloneHidrokelV151(param)) {
      continue;
    }

    cleaned.push(param);
  }

  return cleaned;
}

function capaskaProgressTotalV151(params: any): number {
  return capaskaProgressCleanParamsV151(params).length;
}

function capaskaProgressValueForParamV151(param: any, values: any): any {
  if (!values || !param) return "";

  const keys = [
    param?.id,
    String(param?.id ?? ""),
    param?.parameter_id,
    String(param?.parameter_id ?? ""),
    param?.key,
    param?.name,
    param?.label,
    param?.param_name,
    param?.parameter,
  ].filter((key) => key !== undefined && key !== null && String(key) !== "");

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(values, key)) return values[key];
  }

  return "";
}

function capaskaProgressIsParamAnsweredV151(param: any, values: any): boolean {
  const value = capaskaProgressValueForParamV151(param, values);
  if (value === undefined || value === null) return false;
  return String(value).trim() !== "";
}


/* CAPASKA THT final score fix v154
   Root cause fixed:
   Some THT option labels are stored/displayed without spaces, e.g. "Tidakada" and "Adaserumen".
   Old final scoring can fail to recognize those values, so UI badges can total 10 but final saved score becomes 8.

   Canonical THT rules:
   - Membran timpani: Intak=2, Tidak intak=-10
   - Serumen: Tidak ada=2, Ada serumen=1
   - Rhinitis Alergi (lividae): Negatif/(-)=2, Positif/(+)=1
   - Tonsil: T0/T1-T1=2, Sudah tonsilektomi=2, T2a=1, T2b=-1, T3=-10
   - Epistaksis 1 tahun terakhir: Tidak ada=1, Ada=-1
   - Tes Garputala Weber 512 Hz: Normal=1, Tidak normal=-10
*/
function capaskaThtFinalNormV154(value: any): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[â€“â€”]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function capaskaThtFinalCompactV154(value: any): string {
  return capaskaThtFinalNormV154(value).replace(/\s+/g, "");
}

function capaskaThtFinalParamTextV154(param: any): string {
  return capaskaThtFinalNormV154([
    param?.label,
    param?.name,
    param?.title,
    param?.parameter,
    param?.param_name,
    param?.question,
    param?.category,
    param?.post_name,
    param?.stage_name,
    param?.station_name,
    param?.id,
  ].filter(Boolean).join(" "));
}

function capaskaThtFinalChoiceTextV154(optionOrValue: any): string {
  if (optionOrValue && typeof optionOrValue === "object") {
    return capaskaThtFinalNormV154([
      optionOrValue.label,
      optionOrValue.value,
      optionOrValue.name,
      optionOrValue.text,
      optionOrValue.option_label,
      optionOrValue.description,
    ].filter(Boolean).join(" "));
  }

  return capaskaThtFinalNormV154(optionOrValue);
}

function capaskaThtFinalIsTidakAdaV154(choice: string): boolean {
  const c = capaskaThtFinalCompactV154(choice);
  return /tidakada|tidakterdapat|\(-\)|negatif|negative/.test(c);
}

function capaskaThtFinalIsAdaV154(choice: string): boolean {
  const c = capaskaThtFinalCompactV154(choice);
  return /(^| )ada( |$)|adaserumen|\(\+\)|positif|positive/.test(choice) || /adaserumen|\(\+\)|positif|positive/.test(c);
}

function capaskaThtFinalScoreV154(param: any, optionOrValue: any): number | null {
  return capaskaThtHardScoreV155(param, optionOrValue);
}


/* CAPASKA THT hard canonical score v155
   Root cause: THT final score can still become 9 even when visible badges total 10,
   because some old option.score / saved score paths still read DB score instead of
   canonical THT scoring. This block canonicalizes THT option objects and all THT
   scoring paths.

   Canonical THT max total:
   Intak 2 + Serumen Tidak ada 2 + Rhinitis Negatif 2 + Tonsil T0/T1-T1 2
   + Epistaksis Tidak ada 1 + Weber Normal 1 = 10
*/
function capaskaThtHardNormV155(value: any): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[â€“â€”]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function capaskaThtHardCompactV155(value: any): string {
  return capaskaThtHardNormV155(value).replace(/\s+/g, "");
}

function capaskaThtHardParamTextV155(param: any): string {
  return capaskaThtHardNormV155([
    param?.label,
    param?.name,
    param?.title,
    param?.parameter,
    param?.param_name,
    param?.question,
    param?.category,
    param?.post_name,
    param?.stage_name,
    param?.station_name,
    param?.id,
  ].filter(Boolean).join(" "));
}

function capaskaThtHardChoiceTextV155(optionOrValue: any): string {
  if (optionOrValue && typeof optionOrValue === "object") {
    return capaskaThtHardNormV155([
      optionOrValue.label,
      optionOrValue.value,
      optionOrValue.name,
      optionOrValue.text,
      optionOrValue.option_label,
      optionOrValue.description,
    ].filter(Boolean).join(" "));
  }

  return capaskaThtHardNormV155(optionOrValue);
}

function capaskaThtHardIsThtParamV155(param: any): boolean {
  const p = capaskaThtHardParamTextV155(param);
  return /membran.*timpani|timpani|serumen|tonsil|rhinitis|rinitis|lividae|divide|dividae|epistaksis|epistaxis|garputala|weber/.test(p);
}

function capaskaThtHardScoreV155(param: any, optionOrValue: any): number | null {
  const p = capaskaThtHardParamTextV155(param);
  const pc = capaskaThtHardCompactV155(p);
  const c = capaskaThtHardChoiceTextV155(optionOrValue);
  const cc = capaskaThtHardCompactV155(c);

  if (!c || !capaskaThtHardIsThtParamV155(param)) return null;

  // Membran timpani
  if (/membran.*timpani|timpani/.test(p)) {
    if (/tidakintak|tidakintac|tidakintact/.test(cc)) return -10;
    if (/intak|intac|intact/.test(cc)) return 2;
  }

  // Serumen. Handles old compact labels: Tidakada / Adaserumen.
  if (/serumen/.test(p) || /serumen/.test(pc)) {
    if (/tidakada|tidakterdapat|\(-\)|negatif|negative/.test(cc)) return 2;
    if (/adaserumen|ada|\(\+\)|positif|positive/.test(cc)) return 1;
  }

  // Tonsil. Handles T0/T1-T1, T0 / T1-T1, T2a, T2b, T3.
  if (/tonsil/.test(p)) {
    if (/tonsilektomi/.test(cc)) return 2;
    if (/t0\/?t1-?t1|t0\/?t1|t0-?t1|t1-?t1|t1\/?t1|t0t1t1/.test(cc)) return 2;
    if (/t2a/.test(cc)) return 1;
    if (/t2b/.test(cc)) return -1;
    if (/t3/.test(cc)) return -10;
  }

  // Rhinitis alergi lividae. Old database may say divide/dividae.
  if (/rhinitis|rinitis|lividae|divide|dividae/.test(p)) {
    if (/negatif|negative|\(-\)|tidakada/.test(cc)) return 2;
    if (/positif|positive|\(\+\)|ada/.test(cc)) return 1;
  }

  // Epistaksis 1 tahun terakhir. Handles Tidakada compact.
  if (/epistaksis|epistaxis/.test(p)) {
    if (/tidakada|tidakterdapat|\(-\)|negatif|negative/.test(cc)) return 1;
    if (/ada|\(\+\)|positif|positive/.test(cc)) return -1;
  }

  // Tes Garputala / Weber 512 Hz
  if (/garputala|weber/.test(p)) {
    if (/tidaknormal|abnormal/.test(cc)) return -10;
    if (/normal/.test(cc)) return 1;
  }

  return null;
}

function capaskaThtCanonicalizeOptionsV155(param: any, options: any): any {
  if (!Array.isArray(options) || !capaskaThtHardIsThtParamV155(param)) return options;

  return options.map((opt: any) => {
    const forcedScore = capaskaThtHardScoreV155(param, opt);
    if (forcedScore === null) return opt;

    return {
      ...opt,
      score: forcedScore,
      skor: forcedScore,
      value_score: forcedScore,
      is_critical: forcedScore <= -10,
    };
  });
}

function capaskaThtScoreForAnyValueV155(param: any, value: any, options?: any[]): number | null {
  if (!capaskaThtHardIsThtParamV155(param)) return null;

  const direct = capaskaThtHardScoreV155(param, value);
  if (direct !== null) return direct;

  const normalizedValue = capaskaThtHardNormV155(value);
  const compactValue = capaskaThtHardCompactV155(value);

  const list = Array.isArray(options) ? options : [];
  for (const opt of list) {
    const optionText = capaskaThtHardChoiceTextV155(opt);
    const optionCompact = capaskaThtHardCompactV155(opt?.label ?? opt?.value ?? optionText);
    const optionValue = capaskaThtHardNormV155(opt?.value ?? "");
    const optionLabel = capaskaThtHardNormV155(opt?.label ?? "");

    if (
      optionText === normalizedValue ||
      optionCompact === compactValue ||
      optionValue === normalizedValue ||
      optionLabel === normalizedValue
    ) {
      return capaskaThtHardScoreV155(param, opt);
    }
  }

  return null;
}

function scoreForParam(param: any, value: string) {
  const thtV155Options = capaskaThtCanonicalizeOptionsV155(param, getChoiceOptions(param)) || [];
  const thtV155Score = capaskaThtScoreForAnyValueV155(param, value, thtV155Options);
  if (thtV155Score !== null) return thtV155Score;

  const thtV154SelectedOption = getSelectedChoiceOption(param, value);
  const thtV154Score = capaskaThtFinalScoreV154(param, thtV154SelectedOption || value);
  if (thtV154Score !== null) return thtV154Score;

  const gigiV150SelectedOption = getSelectedChoiceOption(param, value);
  const gigiV150Score = capaskaGigiCanonicalScoreV150(param, gigiV150SelectedOption || value);
  if (gigiV150Score !== null) return gigiV150Score;

  const gigiV149SelectedOption = getSelectedChoiceOption(param, value);
  const gigiV149Score = capaskaGigiV149Score(param, gigiV149SelectedOption || value);
  if (gigiV149Score !== null) return gigiV149Score;

  const selectedOption = getSelectedChoiceOption(param, value);
  const gigiFullOverride = capaskaGigiFullScoreFix(param, selectedOption || value);
  if (gigiFullOverride !== null) return gigiFullOverride;
  const thtOverride = capaskaThtScoreFix(param, selectedOption || value);
  if (thtOverride !== null) return thtOverride;
  const jantungOverride = capaskaJantungScoreFix(param, selectedOption || value);
  if (jantungOverride !== null) return jantungOverride;
  const penyakitDalamOverride = capaskaPenyakitDalamScoreFix(param, selectedOption || value);
  if (penyakitDalamOverride !== null) return penyakitDalamOverride;
  const vertebraOverride = capaskaVertebraScoreFix(param, selectedOption || value);
  if (vertebraOverride !== null) return vertebraOverride;
  const overrideScore = capaskaScore2026(param, selectedOption || value);
  if (overrideScore !== null) return overrideScore;

  const rawScore = capaskaRawOptionScore(selectedOption);
  if (rawScore !== null) return rawScore;

  return 0;
}

function isCriticalChoice(param: any, value: string) {
  const thtV155CriticalOptions = capaskaThtCanonicalizeOptionsV155(param, getChoiceOptions(param)) || [];
  const thtV155CriticalScore = capaskaThtScoreForAnyValueV155(param, value, thtV155CriticalOptions);
  if (thtV155CriticalScore !== null) return thtV155CriticalScore <= -10;

  const thtV154SelectedOptionForCritical = getSelectedChoiceOption(param, value);
  const thtV154CriticalScore = capaskaThtFinalScoreV154(param, thtV154SelectedOptionForCritical || value);
  if (thtV154CriticalScore !== null) return thtV154CriticalScore <= -10;

  const gigiV150SelectedOptionForCritical = getSelectedChoiceOption(param, value);
  const gigiV150CriticalScore = capaskaGigiCanonicalScoreV150(param, gigiV150SelectedOptionForCritical || value);
  if (gigiV150CriticalScore !== null) return gigiV150CriticalScore <= -10;

  const gigiV149SelectedOptionForCritical = getSelectedChoiceOption(param, value);
  const gigiV149CriticalScore = capaskaGigiV149Score(param, gigiV149SelectedOptionForCritical || value);
  if (gigiV149CriticalScore !== null) return gigiV149CriticalScore <= -10;

  const selectedOption = getSelectedChoiceOption(param, value);
  const gigiFullOverride = capaskaGigiFullScoreFix(param, selectedOption || value);
  if (gigiFullOverride !== null) return gigiFullOverride <= -10;
  const thtOverride = capaskaThtScoreFix(param, selectedOption || value);
  if (thtOverride !== null) return thtOverride <= -10;
  const jantungOverride = capaskaJantungScoreFix(param, selectedOption || value);
  if (jantungOverride !== null) return jantungOverride <= -10;
  const penyakitDalamOverride = capaskaPenyakitDalamScoreFix(param, selectedOption || value);
  if (penyakitDalamOverride !== null) return penyakitDalamOverride <= -10;
  const vertebraOverride = capaskaVertebraScoreFix(param, selectedOption || value);
  if (vertebraOverride !== null) return vertebraOverride <= -10;
  const overrideScore = capaskaScore2026(param, selectedOption || value);
  if (overrideScore !== null) return overrideScore <= -10;

  const rawScore = capaskaRawOptionScore(selectedOption);
  if (rawScore !== null) return rawScore <= -10;

  const text = `${capaskaParamText(param)} ${capaskaChoiceText(selectedOption || value)}`;
  return capaskaIsRedFlagText(text);
}


/* CAPASKA THT score total narrow fix v157
   Root cause:
   The hidden THT score/total field can sit before Epistaksis and Weber in parameter order.
   Existing computeValues totals only candidates before the score field, so final THT score becomes 8:
   Membran 2 + Serumen 2 + Rhinitis 2 + Tonsil 2 = 8

   Narrow fix:
   Only for THT score fields, compute total from the 6 canonical THT input parameters,
   regardless of parameter order:
   Membran + Serumen + Rhinitis + Tonsil + Epistaksis + Weber = 10
*/
function capaskaThtTotalNormV157(value: any): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function capaskaThtTotalParamTextV157(param: any): string {
  return capaskaThtTotalNormV157([
    param?.name,
    param?.label,
    param?.title,
    param?.parameter,
    param?.param_name,
    param?.question,
    param?.category,
    param?.post_name,
    param?.stage_name,
    param?.station_name,
    param?.id,
  ].filter(Boolean).join(" "));
}

function capaskaIsThtScoreFieldV157(param: any): boolean {
  const text = capaskaThtTotalParamTextV157(param);
  const cat = capaskaThtTotalNormV157(param?.category);
  return /tht|telinga|hidung|tenggorokan/.test(text) || /tht|telinga|hidung|tenggorokan/.test(cat);
}

function capaskaThtCanonicalKeyV157(param: any): string | null {
  const text = capaskaThtTotalParamTextV157(param);

  if (/membran.*timpani|timpani/.test(text)) return "membran";
  if (/serumen/.test(text)) return "serumen";
  if (/rhinitis|rinitis|lividae|divide|dividae/.test(text)) return "rhinitis";
  if (/tonsil/.test(text)) return "tonsil";
  if (/epistaksis|epistaxis/.test(text)) return "epistaksis";
  if (/garputala|weber/.test(text)) return "weber";

  return null;
}

function capaskaThtTotalForScoreFieldV157(scoreField: any, parameters: any[], scores: Record<string, number>): number | null {
  if (!capaskaIsThtScoreFieldV157(scoreField)) return null;
  if (!Array.isArray(parameters)) return null;

  const seen = new Set<string>();
  let total = 0;
  let count = 0;

  for (const candidate of parameters) {
    const key = capaskaThtCanonicalKeyV157(candidate);
    if (!key || seen.has(key)) continue;

    const score = scores[String(candidate?.id)];
    if (typeof score !== "number" || !Number.isFinite(score)) continue;

    seen.add(key);
    total += score;
    count += 1;
  }

  // Only override when this is really the canonical THT form.
  // This avoids touching any partial/non-THT score field.
  return count >= 6 ? total : null;
}


/* CAPASKA THT stage based total fix v158
   v157 was inserted correctly, but it can still return null if the hidden Score/Total field
   itself does not contain the word THT in name/category.

   Safer narrow logic:
   - Do not depend on the score field label.
   - Detect the current parameter set/stage by the presence of the 6 canonical THT questions.
   - Only override when all 6 canonical THT keys are present and scored:
     membran, serumen, rhinitis, tonsil, epistaksis, weber.
   - Other stages will not match all 6 keys, so they are untouched.
*/
function capaskaThtTotalForScoreFieldV158(scoreField: any, parameters: any[], scores: Record<string, number>): number | null {
  if (!Array.isArray(parameters)) return null;

  const requiredKeys = ["membran", "serumen", "rhinitis", "tonsil", "epistaksis", "weber"];
  const seen = new Set<string>();
  let total = 0;

  for (const candidate of parameters) {
    const key = capaskaThtCanonicalKeyV157(candidate);
    if (!key || seen.has(key)) continue;

    const score = scores[String(candidate?.id)];
    if (typeof score !== "number" || !Number.isFinite(score)) continue;

    seen.add(key);
    total += score;
  }

  const hasAllThtKeys = requiredKeys.every((key) => seen.has(key));
  if (!hasAllThtKeys) return null;

  return total;
}


/* CAPASKA THT total from values fix v159
   Why v158 can still fall back to 8:
   v158 only sums scores that already exist inside the `scores` object.
   If Epistaksis or Weber are selected but not present in `scores` for any reason,
   v158 returns null and the old ordered calculation still saves 8.

   v159 computes canonical THT total from the selected values directly:
   - First use scores[id] if available.
   - If missing, read computed[id] and call scoreForParam(candidate, selected).
   - Require all 6 canonical THT keys to be answered:
     membran, serumen, rhinitis, tonsil, epistaksis, weber.
*/
function capaskaThtTotalForScoreFieldV159(scoreField: any, parameters: any[], scores: Record<string, number>, computed: Record<string, string>): number | null {
  if (!Array.isArray(parameters)) return null;

  const requiredKeys = ["membran", "serumen", "rhinitis", "tonsil", "epistaksis", "weber"];
  const seen = new Set<string>();
  let total = 0;

  for (const candidate of parameters) {
    const key = capaskaThtCanonicalKeyV157(candidate);
    if (!key || seen.has(key)) continue;

    let score = scores[String(candidate?.id)];

    if (typeof score !== "number" || !Number.isFinite(score)) {
      const selected = computed?.[candidate?.id];
      if (selected !== undefined && selected !== null && String(selected).trim() !== "") {
        score = scoreForParam(candidate, String(selected));
      }
    }

    if (typeof score !== "number" || !Number.isFinite(score)) continue;

    seen.add(key);
    total += score;
  }

  const hasAllThtKeys = requiredKeys.every((key) => seen.has(key));
  if (!hasAllThtKeys) return null;

  return total;
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

        const thtCanonicalTotalV159 = capaskaThtTotalForScoreFieldV159(p, parameters, scores, computed);
    if (thtCanonicalTotalV159 !== null) {
      computed[p.id] = String(thtCanonicalTotalV159);
      return;
    }
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


function normChoice(input: any) {
  return String(input ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
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
          {options.map((opt, index) => {
            const optionChoiceValue = String(opt.label ?? opt.value ?? "");
            return <option key={`${param.id}-select-${index}-${optionChoiceValue}`} value={optionChoiceValue}>{capaskaGigiCanonicalLabelV150(param, opt)}</option>;
          })}
        </select>
        {value && (
          <div className={`mt-1 text-xs font-semibold ${isCriticalChoice(param, value) ? "text-red-700" : "text-blue-700"}`}>
            Skor pilihan: {scoreForParam(param, value)}{isCriticalChoice(param, value) ? " · Tidak Direkomendasikan" : ""}
          </div>
        )}
      </>
    );
  }

  if (usesSingleChoice) {
    return (
      <div className="grid gap-2">
        <div className="grid gap-2 sm:grid-cols-2">
          {options.map((opt, index) => {
                        const choiceValue = String(opt.label ?? opt.value ?? "");
            const inputId = `param-${param.id}-choice-${index}`;
            const checked = normChoice(value) === normChoice(choiceValue);
            const critical = (capaskaGigiCanonicalScoreV150(param, opt) ?? scoreForParam(param, choiceValue)) <= -10;

            return (
              <label
                key={`${param.id}-${index}-${choiceValue}`}
                htmlFor={inputId}
                className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 text-sm transition ${
                  checked ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white hover:border-blue-300"
                }`}
              >
                <input
                  id={inputId}
                  type="radio"
                  className="mt-1"
                  name={`param-${param.id}`}
                  value={choiceValue}
                  checked={checked}
                  onChange={() => onChange(choiceValue)}
                />
                <span className="flex-1">
                  <span className="block font-bold text-slate-900">{capaskaGigiCanonicalLabelV150(param, opt)}</span>
                  {Number.isFinite(scoreForParam(param, choiceValue)) && (
                    <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-black ${critical ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"}`}>
                      Skor {capaskaThtHardScoreV155(param, opt) ?? capaskaGigiCanonicalScoreV150(param, opt) ?? scoreForParam(param, choiceValue)}{critical ? " · Tidak Direkomendasikan" : ""}
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </div>

        {value && (
          <div className={`text-xs font-semibold ${isCriticalChoice(param, value) ? "text-red-700" : "text-blue-700"}`}>
            Terpilih: {value || "-"} · Skor: {scoreForParam(param, value)}
            {isCriticalChoice(param, value) ? " · Tidak Direkomendasikan" : ""}
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


  // SCANNER_QR_SQUARE_FOCUS_V194
  async function applyScannerCameraSharpness(scanner: any, showMessage = false) {
    if (!scanner) return;

    // Mode QR kecil: area scan kotak, FPS tinggi, dan tuning kamera dibuat safe per device.
    try {
      await scanner.applyVideoConstraints?.({
        advanced: [
          { focusMode: "continuous" },
          { exposureMode: "continuous" },
          { whiteBalanceMode: "continuous" }
        ]
      });
    } catch {}

    try {
      const capabilities = scanner.getRunningTrackCameraCapabilities?.() || {};
      const settings = scanner.getRunningTrackSettings?.() || {};
      const zoomCap = capabilities.zoom;

      // QR label kecil lebih mudah terbaca dengan zoom sedang, supaya HP tidak perlu terlalu dekat dan tidak blur.
      if (zoomCap && typeof zoomCap === "object") {
        const minZoom = Number(zoomCap.min ?? 1);
        const maxZoom = Number(zoomCap.max ?? minZoom);
        const targetZoom = Math.min(maxZoom, Math.max(minZoom, 2));
        const currentZoom = Number(settings.zoom ?? 0);

        if (targetZoom > minZoom && Math.abs(currentZoom - targetZoom) > 0.05) {
          await scanner.applyVideoConstraints?.({ advanced: [{ zoom: targetZoom }] });
        }
      }
    } catch {}

    try {
      const video = document.querySelector("#" + scannerId + " video") as HTMLVideoElement | null;
      if (video) {
        video.setAttribute("playsinline", "true");
        video.style.objectFit = "cover";
        video.style.width = "100%";
        video.style.height = "100%";
        video.style.transform = "translateZ(0)";
      }
    } catch {}

    if (showMessage) {
      setStatus("Fokus QR dioptimalkan. Arahkan hanya QR ke kotak, jarak 20-35 cm, tahan stabil 2 detik.");
    }
  }

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
        // Fokus ke QR_CODE saja agar decoding QR kecil lebih cepat dan sensitif.
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE
        ],
        verbose: false
      });

      scannerRef.current = scanner;

      const config = {
        fps: 30,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const base = Math.min(viewfinderWidth, viewfinderHeight);
          const size = Math.max(190, Math.min(Math.floor(base * 0.72), 330));
          return { width: size, height: size };
        },
        aspectRatio: 1,
        disableFlip: false,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true
        },
        videoConstraints: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30, max: 30 },
          focusMode: "continuous",
          exposureMode: "continuous",
          whiteBalanceMode: "continuous"
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

      window.setTimeout(() => applyScannerCameraSharpness(scanner), 250);
      window.setTimeout(() => applyScannerCameraSharpness(scanner), 900);
      window.setTimeout(() => applyScannerCameraSharpness(scanner), 1800);

      setStatus("Scanner QR aktif. Arahkan QR saja ke dalam kotak, tunggu fokus 1-2 detik.");
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
            <div className="text-xs text-slate-400">Scanner v21 QR kotak + fokus lebih sensitif.</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl bg-slate-800 px-3 py-2 font-bold">
            Tutup
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl bg-black">
          <div id={scannerId} className="aspect-square w-full min-h-0" />
        </div>

        <div className="mt-3 grid gap-2 rounded-xl bg-slate-900 p-3 text-sm text-slate-200">
          <div>{isStarting ? "Menyiapkan scanner..." : status}</div>
          <div className="text-xs text-slate-400">
            Tips: arahkan kotak tepat ke QR saja, bukan seluruh label. Jarak ideal 20-35 cm, cahaya harus terang, tahan stabil 2 detik.
            Kalau tetap blur, tekan Fokus QR, mundurkan HP sedikit, lalu dekatkan pelan-pelan.
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
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
            onClick={() => applyScannerCameraSharpness(scannerRef.current, true)}
            disabled={isStarting}
          >
            Fokus Ulang
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
  const [showDoneList, setShowDoneList] = useState(false);
  const [doneParticipants, setDoneParticipants] = useState<any[]>([]);
  const [hasMoreDoneParticipants, setHasMoreDoneParticipants] = useState(false);
  const [doneSearch, setDoneSearch] = useState("");
  const [donePreviewParticipant, setDonePreviewParticipant] = useState<any>(null);
  const [stageStaffOptionsV166, setStageStaffOptionsV166] = useState<string[]>([]);
  const [selectedStageStaffV166, setSelectedStageStaffV166] = useState<string[]>([]);
  const showMcuStageStaffPickerV166 = program === "capaska" || program === "corporate";

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



  function toggleStageStaffV166(staffName: string) {
    setSelectedStageStaffV166((prev) => {
      const exists = prev.includes(staffName);
      return exists ? prev.filter((name) => name !== staffName) : [...prev, staffName];
    });
  }

  async function loadStageStaffForParticipantV166(participantId: number | string) {
    if (!showMcuStageStaffPickerV166 || !participantId || !effectivePostId) {
      setStageStaffOptionsV166([]);
      setSelectedStageStaffV166([]);
      return;
    }

    const stageName = String(effectivePostName || "").trim();

    try {
      const [optionsRes, assignmentRes] = await Promise.all([
        fetch(`/api/mcu/stage-staff/options?program_type=${encodeURIComponent(program)}&stage_name=${encodeURIComponent(stageName)}`, { cache: "no-store" }),
        fetch(`/api/mcu/stage-staff/assignment?participant_id=${participantId}&post_id=${effectivePostId}`, { cache: "no-store" }),
      ]);

      const optionsJson = await optionsRes.json().catch(() => ({}));
      const assignmentJson = await assignmentRes.json().catch(() => ({}));

      setStageStaffOptionsV166(optionsJson.staff_names || []);
      setSelectedStageStaffV166(assignmentJson.staff_names || []);
    } catch {
      setStageStaffOptionsV166([]);
      setSelectedStageStaffV166([]);
    }
  }



  function showSavePopupDomV171(mode: "processing" | "success") {
    if (typeof document === "undefined") return;

    let overlay = document.getElementById("save-popup-dom-v171");

    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "save-popup-dom-v171";
      overlay.style.position = "fixed";
      overlay.style.inset = "0";
      overlay.style.zIndex = "99999";
      overlay.style.display = "flex";
      overlay.style.alignItems = "center";
      overlay.style.justifyContent = "center";
      overlay.style.background = "rgba(15, 23, 42, 0.42)";
      overlay.style.backdropFilter = "blur(4px)";
      overlay.style.padding = "16px";
      document.body.appendChild(overlay);
    }

    const isSuccess = mode === "success";
    overlay.innerHTML = `
      <div style="width:100%;max-width:420px;border-radius:28px;border:1px solid #e2e8f0;background:#ffffff;padding:28px;text-align:center;box-shadow:0 24px 80px rgba(15,23,42,.24);font-family:inherit;">
        <div style="margin:0 auto;display:flex;height:64px;width:64px;align-items:center;justify-content:center;border-radius:999px;background:${isSuccess ? "#ecfdf5" : "#eff6ff"};font-size:34px;">
          ${isSuccess ? "✅" : "⏳"}
        </div>
        <div style="margin-top:16px;font-size:24px;line-height:1.25;font-weight:900;color:#0f172a;">
          ${isSuccess ? "Penyimpanan berhasil" : "Penyimpanan di proses"}
        </div>
        <div style="margin-top:8px;font-size:14px;line-height:1.5;font-weight:700;color:#64748b;">
          ${isSuccess ? "Kembali ke field pencarian..." : "Mohon tunggu, hasil pemeriksaan sedang disimpan."}
        </div>
      </div>
    `;
  }

  function hideSavePopupDomV171() {
    if (typeof document === "undefined") return;
    document.getElementById("save-popup-dom-v171")?.remove();
  }

  function returnToSearchAfterSaveV171() {
    hideSavePopupDomV171();

    try {
      setParticipant(null);
      setParameters([]);
      setValues({});
      setSelectedStageStaffV166([]);
      setStageStaffOptionsV166([]);
    } catch {
      // Keep UI stable even if one optional state is unavailable.
    }

    setTimeout(() => {
      const searchInput =
        document.querySelector<HTMLInputElement>('input[type="search"]') ||
        document.querySelector<HTMLInputElement>('input[placeholder*="Cari"]') ||
        document.querySelector<HTMLInputElement>('input[placeholder*="cari"]') ||
        document.querySelector<HTMLInputElement>('input[placeholder*="nama"]') ||
        document.querySelector<HTMLInputElement>('input[placeholder*="Nama"]') ||
        document.querySelector<HTMLInputElement>('input');
      searchInput?.focus();
      searchInput?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }

  function setMessageWithSavePopupV171(nextMessage: string) {
    setMessage(nextMessage);

    const text = String(nextMessage || "").toLowerCase();

    if (/berhasil|sukses|tersimpan|selesai/.test(text) && !/gagal|error|salah/.test(text)) {
      showSavePopupDomV171("success");
      setTimeout(() => {
        returnToSearchAfterSaveV171();
      }, 900);
      return;
    }

    if (/gagal|error|wajib|pilih|tidak|unauthorized|salah/.test(text)) {
      hideSavePopupDomV171();
    }
  }

  async function saveStageStaffAssignmentV166() {
    if (!showMcuStageStaffPickerV166 || !participant?.id || !effectivePostId) return;

    await fetch("/api/mcu/stage-staff/assignment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participant_id: participant.id,
        post_id: effectivePostId,
        staff_names: selectedStageStaffV166,
      }),
    }).catch(() => null);
  }

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
    await loadStageStaffForParticipantV166(p.id);
  }

  function updateValue(parameterId: number | string, nextValue: string) {
    setValues((prev) => computeValues(parameters, { ...prev, [parameterId]: nextValue }));
  }
  async function refreshDetailAfterSaveV160() {
    if (!participant?.id) return;

    try {
      const detailRes = await fetch(`/api/participant?id=${participant.id}&_=${Date.now()}`, { cache: "no-store" });
      const detailJson = await detailRes.json();
      setDetail(detailJson);
    } catch {
      // Keep save successful even if refresh fails.
    }
  }


  async function save(e: React.FormEvent) {
    e.preventDefault();
    showSavePopupDomV171("processing");
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

    // nonBlockingSaveAfterApiV175:
    // The main save is complete when /api/results/save returns ok.
    // Do not block the success popup on staff assignment, detail refresh, or list refresh.
    if (!json.ok) {
      hideSavePopupDomV171();
      setMessage(json.message || "Gagal menyimpan.");
      return;
    }

    setValues(finalValues);
    showSavePopupDomV171("success");
    setMessage("Hasil berhasil disimpan.");

    setTimeout(() => {
      returnToSearchAfterSaveV171();
    }, 650);

    void (async () => {
      try {
        await saveStageStaffAssignmentV166();
        await refreshDetailAfterSaveV160();
        setListTab("selesai");
        await refreshLists(false);
      } catch (error) {
        console.error("Background post-save refresh failed", error);
      }
    })();
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

      setShowDoneList(true);
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

  const displayedList = useMemo(() => {
    if (!showDoneList) return [];

    const q = doneSearch.trim().toLowerCase();
    const list = doneParticipants || [];

    if (!q) return list;

    return list.filter((p: any) => {
      const haystack = [
        p.name,
        p.mcu_id,
        p.external_id,
        p.province,
        p.source_name,
        p.operator_final_score_label,
        p.operator_final_score
      ]
        .filter((x) => x !== undefined && x !== null)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [showDoneList, doneParticipants, doneSearch]);
  function getChoiceValue(option: any) {
    return String(
      option?.value ??
      option?.label ??
      option?.name ??
      option?.option_label ??
      option?.text ??
      ""
    );
  }

  function isChoiceSelected(param: any, option: any) {
    return String(values[param.id] || "") === getChoiceValue(option);
  }

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
                <div className="mt-1 text-xl font-black leading-tight text-slate-950 md:text-2xl">{donePreviewParticipant.name}</div>
                <div className="mt-1 text-sm font-semibold leading-6 text-slate-500">
                  {donePreviewParticipant.mcu_id || "-"} · {donePreviewParticipant.province || "-"} · {donePreviewParticipant.source_name || "-"}
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
          AutoScore backend CAPASK aktif · pertanyaan selang-seling · value/score tersembunyi
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
            
            
            
            
            <span aria-hidden="true">{String.fromCodePoint(0x1F4F7)}</span>
            <span className="sr-only">Scan barcode</span>
          
          
          
          
          </button>
        </div>

        <button className="btn-primary">Cari Peserta</button>

        <button
          type="button"
          className="rounded-2xl bg-emerald-600 px-5 py-3 font-black text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
          onClick={async () => { setShowDoneList(true); await refreshLists(true); }}
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
                <div className="text-sm text-slate-500">{p.mcu_id || "-"} · {p.province || "-"} · {p.source_name || "-"}</div>
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
            <div className="text-sm text-slate-500">Hanya peserta yang sudah submit di stage {effectivePostName}. Klik Selesai untuk tampil/sembunyikan daftar.</div>
          </div>

          <button
            type="button"
            onClick={async () => {
              if (showDoneList) {
                setShowDoneList(false);
                return;
              }

              setShowDoneList(true);
              if (!hasLoadedList) {
                await refreshLists(true);
              }
            }}
            disabled={loadingList}
            className={`rounded-2xl px-5 py-3 font-black text-white shadow-sm transition disabled:opacity-60 ${
              showDoneList ? "bg-slate-700 hover:bg-slate-800" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {loadingList ? "Memuat..." : showDoneList ? `Sembunyikan (${doneParticipants.length})` : `Selesai (${doneParticipants.length})`}
          </button>
        </div>

        {showDoneList && (
          <>
            <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <input
                className="input w-full md:max-w-md"
                value={doneSearch}
                onChange={(e) => setDoneSearch(e.target.value)}
                placeholder="Cari peserta selesai: nama / No MCU / provinsi"
              />
              <div className="text-sm font-semibold text-slate-500">
                Menampilkan {displayedList.length} dari {doneParticipants.length} peserta
              </div>
            </div>

            <div className="mt-3 grid gap-2">
            {!displayedList.length && (
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
                {loadingList
                  ? "Memuat daftar peserta selesai..."
                  : hasLoadedList
                    ? (doneSearch.trim() ? "Tidak ada peserta selesai yang cocok dengan pencarian." : "Belum ada peserta selesai untuk operator ini.")
                    : "Klik tombol Selesai untuk menampilkan daftar."}
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
                className={`cursor-pointer rounded-2xl border p-3 transition ${
                  participant?.id === p.id
                    ? "border-emerald-400 bg-emerald-50 ring-2 ring-emerald-100"
                    : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-black">{p.name}</div>
                    <div className="text-sm text-slate-500">{p.mcu_id || "-"}{" \u00B7 "}{p.province || "-"}{" \u00B7 "}{p.source_name || "-"}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                      Skor akhir: {p.operator_final_score_label ?? p.operator_final_score ?? "-"}
                    </div>
                    <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                      Sudah submit {"\u00B7"} klik untuk edit
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
        </>
        )}
      </section>
      )}


      {participant && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/60 p-3 backdrop-blur-sm md:p-6" data-operator-form-modal="v82">
          <div className="mx-auto flex h-full max-h-[94vh] max-w-5xl flex-col overflow-hidden rounded-[2rem] bg-white text-slate-950 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4 md:p-5">
              <div>
                <div className="text-xs font-black uppercase tracking-wide text-blue-700">{effectivePostName}</div>
                <div className="mt-1 text-xl font-black leading-tight text-slate-950 md:text-2xl">{participant.name}</div>
                <div className="mt-1 text-sm font-medium leading-6 text-slate-500">
                  {participant.mcu_id || "-"} · {participant.province || "-"} · {detail?.participant?.source_name || participant.source_name || "-"}
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
            <div className="text-sm text-slate-500">{participant.mcu_id} · {participant.province || "-"} · {detail.participant.source_name || "-"}</div>
          </div>
          <StageProgress stages={detail.stages} />
        </section>
      )}

              <form onSubmit={save} className="card space-y-6 p-5">
          <div className="text-lg font-black">
            Form {effectivePostName}<br />
            <span className="text-base font-black text-slate-700">{participant?.name}</span>
          </div>
          {!capaskaProgressTotalV151(parameters) && <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-700">Tidak ada parameter untuk post ini. Jalankan SQL reference dan cek mapping package.</div>}

                    {showMcuStageStaffPickerV166 && participant && (
            <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-lg font-black">Nama Petugas Pemeriksa</div>
              <div className="mt-1 text-sm text-slate-500">
                Pilih satu atau lebih dokter/petugas yang melakukan tindakan pada stage ini.
              </div>

              {stageStaffOptionsV166.length > 0 ? (
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {stageStaffOptionsV166.map((staffName) => (
                    <label key={staffName} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold">
                      <input
                        type="checkbox"
                        checked={selectedStageStaffV166.includes(staffName)}
                        onChange={() => toggleStageStaffV166(staffName)}
                      />
                      <span>{staffName}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                  Belum ada daftar nama petugas untuk stage {effectivePostName}. Tambahkan dari halaman Import Database Peserta.
                </div>
              )}
            </section>
          )}

{groupedParameters.map((group) => (
            <div key={group.category} className="space-y-5">
              <div className="border-b border-slate-200 pb-2 text-base font-black text-slate-900">
                {group.category}
              </div>

              {capaskaCleanDisplayParams(group.params).map((param) => {
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
                    <label className="label">{capaskaThtDisplayLabelFix(param.name)}{param.unit ? ` (${param.unit})` : ""}</label>
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

          <button className="btn-primary" disabled={!capaskaProgressTotalV151(parameters)}>Simpan Hasil Pemeriksaan</button>
          {message && <div className="rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">{message}</div>}
        </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


































