import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { computeStagesForParticipant } from "@/lib/server/progress";
import {
  CAPASKA_DOMAIN_RULES,
  computeMcuParticipantScoring2026,
  evaluateMcuGraduation2026,
  isCapaskaValueOrScoreParameter,
  scoreCapaskaDirectChoice,
} from "@/lib/shared/capaskaDirectScoring2026";

function isActive(value: any) {
  return value === 1 || value === true || value === "1" || value === null || value === undefined;
}

function normalizeProgram(value: any) {
  return String(value || "").trim().toLowerCase();
}

function getRuleForPackage(packageId: number, program: string, rules: any[]) {
  const specific = rules.find((rule) => Number(rule.package_id) === Number(packageId) && isActive(rule.is_active));
  if (specific) return specific;

  const programDefault = rules.find((rule) => !rule.package_id && normalizeProgram(rule.program_type) === normalizeProgram(program) && isActive(rule.is_active));
  if (programDefault) return programDefault;

  return {
    pass_min_score: 0,
    pass_max_score: 999999,
    description: "Default"
  };
}

function isRegistrasiUlangDone(participant: any) {
  return participant?.registrasi_ulang_done === 1 ||
    participant?.registrasi_ulang_done === true ||
    participant?.registrasi_ulang_done === "1";
}


function capaskaDashboardProgressNormV153(value: any) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function capaskaDashboardParamTextV153(param: any) {
  return capaskaDashboardProgressNormV153([
    param?.name,
    param?.label,
    param?.title,
    param?.parameter,
    param?.param_name,
    param?.question,
    param?.id,
  ].filter(Boolean).join(" "));
}

function canonicalCapaskaDashboardStageParamsV153(params: any[]) {
  const list = Array.isArray(params) ? params : [];
  const cleaned: any[] = [];
  let seenRhinitisLividae = false;
  let seenHipospadiaHidrokel = false;

  for (const param of list) {
    const text = capaskaDashboardParamTextV153(param);

    if ((/rhinitis|rinitis/.test(text)) && (/lividae|divide|dividae/.test(text))) {
      if (seenRhinitisLividae) continue;
      seenRhinitisLividae = true;
      cleaned.push(param);
      continue;
    }

    if (/hipospadia/.test(text)) {
      if (seenHipospadiaHidrokel) continue;
      seenHipospadiaHidrokel = true;
      cleaned.push(param);
      continue;
    }

    if (/hidrokel/.test(text) && !/hipospadia/.test(text)) {
      continue;
    }

    cleaned.push(param);
  }

  return cleaned;
}
function normalizeDashboardStages(stages: any[], participant: any) {
  return (stages || [])
    .filter((stage) => {
      const name = String(stage.post_name || "").toLowerCase().trim();
      return !(name === "registrasi capaska" || name.startsWith("registrasi capaska"));
    })
    .map((stage) => {
      const name = String(stage.post_name || "").toLowerCase().trim();

      if (name === "registrasi ulang" && isRegistrasiUlangDone(participant)) {
        return {
          ...stage,
          filled_parameters: stage.total_parameters || 1,
          is_done: true,
          status_text: "Done",
          progress_text: "Done"
        };
      }

      return stage;
    });
}

function safeSheetName(name: string) {
  return name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31);
}

function formatTimestamp(value: any) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const pick = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${pick("day")}/${pick("month")}/${pick("year")} ${pick("hour")}:${pick("minute")}:${pick("second")} WIB`;
}

function makeKey(...parts: any[]) {
  return parts.map((part) => String(part || "").trim()).join("::");
}

function numericSort(value: any, fallback = 999999) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function setWorksheetLayout(ws: XLSX.WorkSheet, headerCount: number, rowCount: number) {
  ws["!cols"] = Array.from({ length: headerCount }).map((_, index) => ({
    wch: index < 2 ? 22 : 18,
  }));

  if (headerCount > 0 && rowCount >= 0) {
    ws["!autofilter"] = {
      ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(rowCount, 1), c: headerCount - 1 } })
    };
  }
}

function appendJsonSheet(workbook: XLSX.WorkBook, rows: any[], sheetName: string, headers?: string[]) {
  const headerList = headers || Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headerList });
  setWorksheetLayout(worksheet, headerList.length, rows.length);
  XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName(sheetName));
}

function uniqueCleanValuesV185(values: any[]) {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values || []) {
    const text = String(value ?? "").trim();
    const key = text.toLowerCase().replace(/\s+/g, " ");
    if (!text || seen.has(key)) continue;
    seen.add(key);
    output.push(text);
  }

  return output;
}

function makeGroupedWideSheet(args: {
  rows: any[];
  identityHeaders: string[];
  resultHeaders: string[];
  doctorHeaders?: string[];
  scoreHeaders: string[];
  domainHeaders: string[];
  infoHeaders: string[];
  finalHeaders: string[];
}) {
  const { rows, identityHeaders, resultHeaders, doctorHeaders = [], scoreHeaders, domainHeaders, infoHeaders, finalHeaders } = args;
  const headers = [...identityHeaders, ...resultHeaders, ...doctorHeaders, ...scoreHeaders, ...domainHeaders, ...infoHeaders, ...finalHeaders];

  const groupRow: string[] = [];
  const addGroup = (label: string, count: number) => {
    for (let i = 0; i < count; i += 1) groupRow.push(i === 0 ? label : "");
  };

  addGroup("Data Peserta", identityHeaders.length);
  addGroup("Hasil Pertanyaan", resultHeaders.length);
  addGroup("Nama Dokter", doctorHeaders.length);
  addGroup("Skor Per Pertanyaan", scoreHeaders.length);
  addGroup("Skor Pemeriksaan", domainHeaders.length);
  addGroup("Info", infoHeaders.length);
  addGroup("Final", finalHeaders.length);

  const dataRows = rows.map((row) => headers.map((header) => row[header] ?? ""));
  const worksheet = XLSX.utils.aoa_to_sheet([groupRow, headers, ...dataRows]);

  const merges: XLSX.Range[] = [];
  let cursor = 0;
  for (const count of [identityHeaders.length, resultHeaders.length, doctorHeaders.length, scoreHeaders.length, domainHeaders.length, infoHeaders.length, finalHeaders.length]) {
    if (count > 1) merges.push({ s: { r: 0, c: cursor }, e: { r: 0, c: cursor + count - 1 } });
    cursor += count;
  }
  worksheet["!merges"] = merges;
  worksheet["!cols"] = headers.map((header) => {
    if (header === "Red Flag") return { wch: 42 };
    if (header.startsWith("Hasil - ")) return { wch: 28 };
    if (header.startsWith("Dokter - ")) return { wch: 26 };
    if (header.startsWith("Skor - ")) return { wch: 22 };
    if (header === "Total Skor Akhir") return { wch: 18 };
    return { wch: 18 };
  });
  worksheet["!autofilter"] = {
    ref: XLSX.utils.encode_range({ s: { r: 1, c: 0 }, e: { r: Math.max(rows.length + 1, 1), c: Math.max(headers.length - 1, 0) } })
  };

  return worksheet;
}


// DASHBOARD_EXPORT_WIDE_DOCTORS_TS_FIX_V187
// DASHBOARD_EXPORT_WIDE_SELESAI_PROVINCE_GENDER_DOCTORS_V185
// DASHBOARD_EXPORT_STATUS_CATATAN_SHEET_V200_EYE_NEUTRAL
function cleanStatusSheetV179(value: any) {
  return String(value ?? "").trim();
}

function normStatusSheetV179(value: any) {
  return cleanStatusSheetV179(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function numberFromStatusSheetV179(value: any): number | null {
  const text = cleanStatusSheetV179(value).replace(",", ".");
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

function genderKeyStatusSheetV179(value: any) {
  const text = normStatusSheetV179(value);
  if (text.includes("laki") || text.includes("putra") || text === "l" || text === "lk" || text === "male") return "putra";
  if (text.includes("perempuan") || text.includes("putri") || text === "p" || text === "pr" || text === "female") return "putri";
  return "";
}

function genderLabelStatusSheetV179(value: any) {
  const key = genderKeyStatusSheetV179(value);
  if (key === "putra") return "PUTRA";
  if (key === "putri") return "PUTRI";
  return cleanStatusSheetV179(value).toUpperCase();
}

function stageKeyStatusSheetV179(value: any) {
  const text = normStatusSheetV179(value);
  if (text.includes("mata") || text.includes("visus") || text.includes("buta warna")) return "mata";
  if (text.includes("tht") || text.includes("telinga") || text.includes("hidung") || text.includes("tenggorok") || text.includes("garputala")) return "tht";
  if (text.includes("gigi") || text.includes("mulut") || text.includes("panoramik") || text.includes("panoramic")) return "gigi";
  if (text.includes("penyakit dalam") || text.includes("abdomen") || text.includes("urogenital") || text.includes("dalam")) return "penyakit_dalam";
  if (text.includes("jantung") || text.includes("pembuluh darah") || text.includes("kardiovask")) return "jantung";
  if (text.includes("ortopedi") || text.includes("orthop") || text.includes("tulang") || text.includes("skoliosis") || text.includes("kifosis") || text.includes("lordosis")) return "ortopedi";
  if (text.includes("radiologi") || text.includes("radiology") || text.includes("thorax") || text.includes("rontgen") || text.includes("xray") || text.includes("x-ray")) return "radiologi";
  return "";
}

function isHeightParamStatusSheetV179(param: any) {
  const name = normStatusSheetV179([param?.label, param?.name, param?.title, param?.parameter, param?.param_name, param?.question].filter(Boolean).join(" "));
  return name.includes("tinggi badan") || /\btb\b/.test(name) || name.includes("tb.");
}

function isWeightParamStatusSheetV179(param: any) {
  const name = normStatusSheetV179([param?.label, param?.name, param?.title, param?.parameter, param?.param_name, param?.question].filter(Boolean).join(" "));
  return name.includes("berat badan") || /\bbb\b/.test(name) || name.includes("bb.");
}

function isNeutralStatusSheetV179(value: any) {
  const text = normStatusSheetV179(value);
  if (!text) return true;

  // DASHBOARD_EXPORT_STATUS_NOTES_NEUTRAL_VALUES_V295
  // Values like N/A, dot, dash, or an explicit "Tidak" for free-note questions are not medical notes.
  const neutralBlankLikeV295 = new Set([
    ".",
    "-",
    "n/a",
    "na",
    "n.a",
    "n.a.",
    "tidak",
    "tidak ada catatan",
    "tidak ada catatan khusus",
    "tidak ada kondisi khusus",
    "tidak ada keluhan",
    "tidak ada temuan",
    "tidak ada kelainan",
    "tanpa catatan",
    "nihil"
  ]);
  if (neutralBlankLikeV295.has(text)) return true;

  const neutralExact = new Set([
    "normal",
    "tidak ada",
    "ga ada",
    "gak ada",
    "nggak ada",
    "ngga ada",
    "negatif",
    "negative",
    "intak",
    "0",
    "0 caries",
    "0 karies",
    "0 gigi",
    "0 tumpatan",
    "tidak ditemukan",
    "tidak menggunakan",
    "tidak pakai",
    "tanpa",
    "sesuai juknis",
    "sesuai",
    "6/6",
    "normal 6/6",
    "t0 / t1-t1",
    "t0/t1-t1",
    "t0 / t1",
    "t0/t1",
    "-/-",
    "(-)/(-)",
    "(-) / (-)",
  ]);

  if (neutralExact.has(text)) return true;

  if (/^normal\b/.test(text)) return true;
  if (/^tidak ada\b/.test(text)) return true;
  if (/^(ga|gak|nggak|ngga) ada\b/.test(text)) return true;
  if (/^tidak menggunakan\b/.test(text)) return true;
  if (/^tidak pakai\b/.test(text)) return true;
  if (/^tanpa\b/.test(text)) return true;
  if (/^negatif\b/.test(text)) return true;
  if (/^vod:? ?6\/6.*vos:? ?6\/6$/.test(text)) return true;
  if (/^6\/6$/.test(text)) return true;

  // Mata: tidak memakai kontak lens/kacamata berarti normal.
  if (/(kontak|contact|lensa|lens|softlens|kacamata|kaca mata)/.test(text) && /(tidak menggunakan|tidak pakai|tanpa|tidak ada|ga ada|gak ada|nggak ada|ngga ada|negatif|negative)/.test(text)) return true;

  // Mata: buta warna tidak ada / tidak buta warna berarti normal.
  if (/buta warna/.test(text) && /(tidak buta warna|tidak ada|ga ada|gak ada|nggak ada|ngga ada|negatif|negative|\btidak\b)/.test(text)) return true;

  // Mata: juling / strabismus -/- berarti normal.
  if (/^\(?-\)?\s*\/\s*\(?-\)?$/.test(text)) return true;
  if (/(juling|strabismus)/.test(text) && (/\(?-\)?\s*\/\s*\(?-\)?/.test(text) || /(tidak ada|negatif|negative|normal)/.test(text))) return true;

  return false;
}

function severityStatusSheetV179(value: any, score: any) {
  const text = normStatusSheetV179(value);
  const n = typeof score === "number" ? score : numberFromStatusSheetV179(score);
  if (typeof n === "number" && n <= -10) return "red";
  if (text.includes("tidak direkomendasi") || text.includes("tidak direkomendasikan")) return "red";
  if (text.includes("red flag")) return "red";
  if (text.includes("t3-t3") || text.includes("t3 / t3")) return "red";
  if (text.includes(">3 caries") || text.includes("> 3 caries") || text.includes(">3 karies")) return "red";
  if (/\b(caries|karies)\s*(4|5|6|7|8|9|10|11|12|13)\b/.test(text)) return "red";
  if (text.includes("hemorroid") || text.includes("hemoroid")) return "red";
  if (text.includes("hernia") || text.includes("undescensus") || text.includes("undecensus")) return "red";
  if (text.includes("striktur") || text.includes("prolaps")) return "red";
  if (text.includes("tidak sesuai juknis")) return "red";
  if (text.includes("kelainan darah") || text.includes("anemia")) return "red";
  if (text.includes("tidak intak") || text.includes("tidak normal")) return "red";
  if (typeof n === "number" && n < 0) return "yellow";
  if (!isNeutralStatusSheetV179(value) && text !== "sesuai") return "yellow";
  return "";
}


// DASHBOARD_EXPORT_BACKEND_JUKNIS_RULES_V315
// Minimal backend/export overrides based on Juknis.
// Keeps the previous stable note filter, then only upgrades known Juknis findings.
function stageKeyFromPostStatusSheetV315(param: any, postNameMap?: any, fallbackText?: any) {
  const postId = Number(param?.post_id ?? param?.postId ?? param?.post ?? 0);
  if (postId === 4) return "mata";
  if (postId === 5) return "penyakit_dalam";
  if (postId === 6) return "gigi";
  if (postId === 7) return "tht";
  if (postId === 8) return "jantung";
  if (postId === 9) return "ortopedi";
  if (postId === 10) return "radiologi";

  const postLabel = postNameMap && typeof postNameMap.get === "function" ? postNameMap.get(postId) : "";
  const text = [postLabel, fallbackText, param?.category, param?.name, param?.label, param?.title, param?.parameter, param?.param_name, param?.question].filter(Boolean).join(" ");
  return stageKeyStatusSheetV179(text);
}

function textJuknisV315(value: any) {
  return normStatusSheetV179(value).replace(/\s+/g, " ").trim();
}

function rawTextJuknisV315(value: any) {
  return cleanStatusSheetV179(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function paramNameJuknisV315(param: any) {
  return paramNameStatusSheetV295(param);
}

function compactTextJuknisV315(value: any) {
  return textJuknisV315(value).replace(/\s+/g, "").replace(/[.,;:]/g, "");
}

function isBlankJuknisV315(value: any) {
  const text = textJuknisV315(value);
  return !text || ["-", "--", ".", "n/a", "na", "nihil", "kosong", "tidak ada catatan", "tidak ada catatan khusus"].includes(text);
}

function isNormalValueJuknisV315(value: any) {
  const text = textJuknisV315(value);
  const compact = compactTextJuknisV315(value);
  if (isBlankJuknisV315(value)) return true;
  if (["normal", "sesuai", "sesuaijuknis", "intak", "ta", "t/a", "tidakada", "tidakmenggunakan", "tidakbutawarna", "tidakhamil", "negatif", "(-)", "-"].includes(compact)) return true;
  if (compact === "0" || compact === "0gigi" || compact === "0caries" || compact === "0karies" || compact === "0tumpatan" || compact === "0impaksi") return true;
  if (text.includes("tidak ada") && !text.includes("tidak ada catatan")) return true;
  if (text.includes("normal") && !text.includes("tidak normal") && !text.includes("abnormal")) return true;
  if (text.includes("sesuai juknis") && !text.includes("tidak sesuai")) return true;
  if ((text.includes("(-)") || text.includes("negatif")) && !text.includes("(+)") && !text.includes("positif")) return true;
  return false;
}

function isProblemValueJuknisV315(value: any) {
  const text = textJuknisV315(value);
  const compact = compactTextJuknisV315(value);
  if (isNormalValueJuknisV315(value)) return false;
  if (compact === "ada" || compact === "(+)" || compact === "+" || text.includes("positif") || text.includes("tidak normal") || text.includes("abnormal") || text.includes("kelainan")) return true;
  return Boolean(text);
}

function scoreRedJuknisV315(score: any) {
  const scoreNum = typeof score === "number" ? score : numberFromStatusSheetV179(score);
  return scoreNum !== null && scoreNum <= -10;
}

function numericValueJuknisV315(value: any) {
  const text = textJuknisV315(value);
  const match = text.match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const num = Number(match[0].replace(",", "."));
  return Number.isFinite(num) ? num : null;
}

function isTbBbRedFlagJuknisV315(stageKey: any, param: any, value: any) {
  if (stageKey !== "penyakit_dalam") return false;
  const name = paramNameJuknisV315(param);
  const text = textJuknisV315(value);
  const looksTbBb = name.includes("tb") || name.includes("tinggi badan") || name.includes("bb") || name.includes("berat badan");
  return (looksTbBb || text.includes("juknis")) && text.includes("tidak sesuai") && text.includes("juknis");
}

function isAnusRectumRedFlagJuknisV315(stageKey: any, param: any, value: any) {
  if (stageKey !== "penyakit_dalam") return false;
  const name = paramNameJuknisV315(param);
  const isAnusRectumParam = name.includes("hemoroid") || name.includes("haemoroid") || name.includes("ambeyen") || name.includes("fisura") || name.includes("fissura") || name.includes("striktur") || name.includes("prolaps") || name.includes("recti") || name.includes("rektum") || name.includes("anus");
  if (!isAnusRectumParam) return false;
  const text = textJuknisV315(value);
  return text.includes("tidak normal") || text.includes("ada") || text.includes("(+)") || text.includes("positif");
}

function gigiDecisionJuknisV315(param: any, value: any, score: any) {
  const name = paramNameJuknisV315(param);
  const text = textJuknisV315(value);
  const n = numericValueJuknisV315(value);
  if (isNormalValueJuknisV315(value)) return { include: false, red: false };

  if (name.includes("caries") || name.includes("karies")) {
    if (text.includes(">3") || text.includes("lebih dari 3") || (n !== null && n > 3)) return { include: true, red: true };
    if (n !== null && n >= 1) return { include: true, red: false };
    if (isProblemValueJuknisV315(value)) return { include: true, red: scoreRedJuknisV315(score) };
  }

  if (name.includes("karang") || name.includes("infeksi") || name.includes("gusi")) {
    return isProblemValueJuknisV315(value) ? { include: true, red: scoreRedJuknisV315(score) } : { include: false, red: false };
  }

  if (name.includes("tumpatan")) {
    if (n !== null && n > 0) return { include: true, red: scoreRedJuknisV315(score) };
    if (text.includes("<5") || text.includes(">5") || isProblemValueJuknisV315(value)) return { include: true, red: scoreRedJuknisV315(score) };
  }

  if (name.includes("impaksi")) {
    if (text.includes(">4") || text.includes("lebih dari 4") || (n !== null && n > 4)) return { include: true, red: true };
    if (n !== null && n > 0) return { include: true, red: false };
    if (text.includes(">2") || text.includes("lebih dari 2")) return { include: true, red: scoreRedJuknisV315(score) };
    if (isProblemValueJuknisV315(value)) return { include: true, red: scoreRedJuknisV315(score) };
  }

  if (name.includes("kehilangan") || name.includes("hilang")) {
    if (text.includes(">2") || text.includes("lebih dari 2") || (n !== null && n > 2)) return { include: true, red: true };
    if (n !== null && n > 0) return { include: true, red: false };
    if (isProblemValueJuknisV315(value)) return { include: true, red: scoreRedJuknisV315(score) };
  }

  if (name.includes("panoramic") || name.includes("panoramik") || name.includes("dental panoramic")) {
    if (text.includes("normal") && !text.includes("tidak normal") && !text.includes("kelainan")) return { include: false, red: false };
    return isProblemValueJuknisV315(value) ? { include: true, red: scoreRedJuknisV315(score) } : { include: false, red: false };
  }

  return isProblemValueJuknisV315(value) ? { include: true, red: scoreRedJuknisV315(score) } : { include: false, red: false };
}

function ortopediDecisionJuknisV315(param: any, value: any, score: any) {
  if (isNormalValueJuknisV315(value)) return { include: false, red: false };
  const name = paramNameJuknisV315(param);
  const severeClinical = ["sindaktili", "polidaktili", "polidactily", "spina bifida", "mallet", "hiperekstensi lengan", "hammer", "hallux", "webbed", "o/x", "ox knee", "o x knee", "pes planus", "kaki datar", "hiperekstensi lutut", "general laxity"];
  const isSevereClinical = severeClinical.some((term) => name.includes(term));
  const isVertebraClinical = name.includes("skoliosis") || name.includes("kifosis") || name.includes("lordosis") || name.includes("vertebra") || name.includes("tulang belakang");
  if (isSevereClinical && isProblemValueJuknisV315(value)) return { include: true, red: true };
  if (isVertebraClinical && isProblemValueJuknisV315(value)) return { include: true, red: scoreRedJuknisV315(score) };
  return isProblemValueJuknisV315(value) ? { include: true, red: scoreRedJuknisV315(score) } : { include: false, red: false };
}

function radiologiDecisionJuknisV315(param: any, value: any, score: any) {
  const text = textJuknisV315(value);
  if (isNormalValueJuknisV315(value)) return { include: false, red: false };
  if (text.includes("sedang") || text.includes("berat")) return { include: true, red: true };
  if (text.includes("ringan")) return { include: true, red: false };
  return isProblemValueJuknisV315(value) ? { include: true, red: scoreRedJuknisV315(score) } : { include: false, red: false };
}

function noteDecisionJuknisOverrideV315(stageKey: any, param: any, value: any, score: any) {
  if (isBlankJuknisV315(value)) return { include: false, red: false };
  if (isTbBbRedFlagJuknisV315(stageKey, param, value)) return { include: true, red: true };
  if (isAnusRectumRedFlagJuknisV315(stageKey, param, value)) return { include: true, red: true };
  if (stageKey === "gigi") return gigiDecisionJuknisV315(param, value, score);
  if (stageKey === "ortopedi") return ortopediDecisionJuknisV315(param, value, score);
  if (stageKey === "radiologi") return radiologiDecisionJuknisV315(param, value, score);
  if (scoreRedJuknisV315(score) && !isNormalValueJuknisV315(value)) return { include: true, red: true };
  return { include: false, red: false };
}



// DASHBOARD_EXPORT_JUKNIS_SCORE_NOTES_V319
// Read-only export helpers: Juknis red flags force export score to -10 and normal values are hidden from notes.
function stageKeyFromPostStatusSheetV319(param: any, postNameMap?: any, fallbackText?: any) {
  const postId = Number(param?.post_id ?? 0);
  if (postId === 4) return "mata";
  if (postId === 5) return "penyakit_dalam";
  if (postId === 6) return "gigi";
  if (postId === 7) return "tht";
  if (postId === 8) return "jantung";
  if (postId === 9) return "ortopedi";
  if (postId === 10) return "radiologi";
  const postLabel = postNameMap && typeof postNameMap.get === "function" ? postNameMap.get(postId) : "";
  const text = [postLabel, fallbackText, param?.category, param?.name, param?.label, param?.title, param?.parameter, param?.param_name, param?.question].filter(Boolean).join(" ");
  return stageKeyStatusSheetV179(text);
}

function textExportJuknisV319(value: any) {
  return normStatusSheetV179(value).replace(/s+/g, " ").trim();
}

function rawExportJuknisV319(value: any) {
  return cleanStatusSheetV179(value).toLowerCase().replace(/s+/g, " ").trim();
}

function paramNameExportJuknisV319(param: any) {
  return normStatusSheetV179([param?.category, param?.name, param?.label, param?.title, param?.parameter, param?.param_name, param?.question].filter(Boolean).join(" "));
}

function numericValueExportJuknisV319(value: any) {
  const text = rawExportJuknisV319(value);
  const match = text.match(/-?d+(?:[.,]d+)?/);
  if (!match) return null;
  return Number(match[0].replace(",", "."));
}

function isPositiveFindingExportJuknisV319(value: any) {
  const text = textExportJuknisV319(value);
  const raw = rawExportJuknisV319(value);
  const compact = raw.replace(/s+/g, "");
  if (!text) return false;
  if (isNormalValueExportJuknisV319(value)) return false;
  if (compact === "(+)" || compact === "+") return true;
  if (raw.includes("tidak normal") || raw.includes("abnormal") || raw.includes("kelainan")) return true;
  if (raw === "ada" || raw.startsWith("ada ") || raw.includes(" ada ")) return true;
  if (raw.includes("positif") || raw.includes("positive")) return true;
  return false;
}

function isNormalValueExportJuknisV319(value: any) {
  const text = textExportJuknisV319(value);
  const raw = rawExportJuknisV319(value);
  const compact = raw.replace(/[s.]/g, "");
  if (!text) return true;
  const normalSet = new Set([
    "-", "--", ".", "n/a", "na", "nihil", "kosong",
    "normal", "negative", "negatif", "tidak", "tidak ada", "tidakada",
    "tidak ada catatan", "tidak ada catatan khusus", "tidak ada kondisi khusus", "tidak ada keluhan", "tidak ada temuan",
    "sesuai", "sesuai juknis", "intak", "ta", "t/a", "tidak menggunakan", "tidak buta warna", "tidak hamil"
  ]);
  if (normalSet.has(text) || normalSet.has(raw) || normalSet.has(compact)) return true;
  if (compact === "(-)" || compact === "-/-" || compact === "(-)/(-)") return true;
  if ((raw.includes("negative") || raw.includes("negatif") || raw.includes("(-)")) && !raw.includes("positive") && !raw.includes("positif") && !raw.includes("(+)")) return true;
  if (raw.includes("tidak ada") && !raw.includes("tidak ada catatan tambahan")) return true;
  if (raw.includes("normal") && !raw.includes("tidak normal") && !raw.includes("abnormal")) return true;
  if (/^0(?:[s-]*(caries|karies|tumpatan|gigi|impaksi))?$/i.test(text)) return true;
  // DASHBOARD_EXPORT_CLEAN_ZERO_CARIES_V320_NORMAL_VALUE_PATCH
  if (raw.includes("0 caries") || raw.includes("0 karies") || raw.includes("0 tumpatan") || raw.includes("0 gigi") || raw.includes("0 impaksi")) return true;
  const zeroDentalCompactV320 = raw.replace(/[^0-9a-z]/g, "");
  if (["0caries", "0karies", "0tumpatan", "0gigi", "0impaksi"].includes(zeroDentalCompactV320)) return true;
  return false;
}



// DASHBOARD_EXPORT_CLEAN_ZERO_CARIES_V320
// Extra note cleanup for normal dental values and boolean-only special-note fields.
function isNormalNoteByParamExportJuknisV320(param: any, value: any) {
  const postId = Number(param?.post_id ?? 0);
  const name = paramNameExportJuknisV319(param);
  const text = textExportJuknisV319(value);
  const raw = rawExportJuknisV319(value);
  const compact = raw.replace(/[\s.;:_/\-]+/g, "");
  const num = numericValueExportJuknisV319(value);

  if (!text) return true;

  // Yes/no fields that only indicate whether a separate note exists should not be rendered as notes.
  const isBooleanOnlyNoteQuestion =
    name.includes("apakah terdapat catatan") ||
    name.includes("catatan untuk kondisi khusus") ||
    name.includes("ada catatan") ||
    name.includes("kondisi khusus ?") ||
    name.includes("kondisi khusus?");
  if (isBooleanOnlyNoteQuestion) {
    const booleanLike = new Set(["ada", "ya", "yes", "true", "tidak", "tidak ada", "no", "false", "negative", "negatif", "-"]);
    if (booleanLike.has(text) || booleanLike.has(raw) || booleanLike.has(compact)) return true;
  }

  if (postId === 6) {
    // Gigi normal values: these must never be included in CATATAN/RINGKASAN.
    if ((name.includes("caries") || name.includes("karies") || name.includes("caries dentis")) &&
        (num === 0 || raw.includes("0 caries") || raw.includes("0 karies") || compact.includes("0caries") || compact.includes("0karies"))) return true;
    if (name.includes("tumpatan") &&
        (num === 0 || raw.includes("0 tumpatan") || compact.includes("0tumpatan"))) return true;
    if (name.includes("impaksi") &&
        (num === 0 || raw.includes("0 gigi") || raw.includes("0 impaksi") || compact.includes("0gigi") || compact.includes("0impaksi"))) return true;
    if ((name.includes("kehilangan") || name.includes("gigi depan") || name.includes("bagian depan")) &&
        (num === 0 || raw.includes("0 gigi") || compact.includes("0gigi"))) return true;
    if ((name.includes("karang") || name.includes("infeksi")) &&
        (text === "negative" || text === "negatif" || text === "(-)" || text === "tidak" || text === "tidak ada" || compact === "-" || compact === "()")) return true;
  }

  return false;
}
function isTbBbRedFlagExportJuknisV319(value: any) {
  const text = textExportJuknisV319(value);
  return text.includes("tidak sesuai juknis") || text.includes("tidak sesuai") || text.includes("tidak memenuhi juknis");
}

function isDentalProblemExportJuknisV319(param: any, value: any) {
  const name = paramNameExportJuknisV319(param);
  const text = textExportJuknisV319(value);
  if (Number(param?.post_id) !== 6) return false;
  if (isNormalValueExportJuknisV319(value)) return false;
  if (name.includes("karang") || name.includes("infeksi") || name.includes("panoramic") || name.includes("panoramik") || name.includes("dental")) return true;
  if (name.includes("caries") || name.includes("karies") || name.includes("caries dentis")) return true;
  if (name.includes("tumpatan")) return true;
  if (name.includes("impaksi")) return true;
  if (name.includes("kehilangan") || name.includes("gigi bagian depan") || name.includes("gigi depan")) return true;
  return text.includes("caries") || text.includes("karies") || text.includes("tumpatan") || text.includes("impaksi") || text.includes("gigi");
}

function isDentalRedFlagExportJuknisV319(param: any, value: any) {
  const name = paramNameExportJuknisV319(param);
  const text = textExportJuknisV319(value);
  const num = numericValueExportJuknisV319(value);
  if (Number(param?.post_id) !== 6) return false;
  if ((name.includes("caries") || name.includes("karies") || text.includes("caries") || text.includes("karies")) && (text.includes(">3") || text.includes("lebih dari 3") || (num !== null && num > 3))) return true;
  if ((name.includes("impaksi") || text.includes("impaksi")) && (text.includes(">4") || text.includes("lebih dari 4") || (num !== null && num > 4))) return true;
  if ((name.includes("kehilangan") || name.includes("gigi depan") || text.includes("kehilangan")) && (text.includes(">2") || text.includes("lebih dari 2") || (num !== null && num > 2))) return true;
  return false;
}

function isPenyakitDalamRedFlagExportJuknisV319(param: any, value: any) {
  const name = paramNameExportJuknisV319(param);
  if (Number(param?.post_id) !== 5) return false;
  if (isTbBbRedFlagExportJuknisV319(value)) return true;
  const anusRectum = name.includes("hemoroid") || name.includes("haemoroid") || name.includes("fisura") || name.includes("striktur") || name.includes("prolaps") || name.includes("rect") || name.includes("rektum") || name.includes("anus");
  if (anusRectum && isPositiveFindingExportJuknisV319(value)) return true;
  const otherRed = name.includes("hernia") || name.includes("tumor") || name.includes("benjolan") || name.includes("tato") || name.includes("tindik") || name.includes("hidronefrosis") || name.includes("hipospadia") || name.includes("hidrokel") || name.includes("undec") || name.includes("batu sal") || name.includes("cystitis") || name.includes("varikokel") || name.includes("phimosis") || name.includes("fimosis");
  return otherRed && isPositiveFindingExportJuknisV319(value);
}

function isOrtopediProblemExportJuknisV319(param: any, value: any) {
  if (Number(param?.post_id) !== 9) return false;
  if (isNormalValueExportJuknisV319(value)) return false;
  const name = paramNameExportJuknisV319(param);
  return name.includes("sindaktili") || name.includes("polidaktili") || name.includes("polidact") || name.includes("spina bifida") || name.includes("mallet") || name.includes("hiperekstensi") || name.includes("hammer") || name.includes("hallux") || name.includes("webbed") || name.includes("o/x") || name.includes("ox knee") || name.includes("o x knee") || name.includes("pes planus") || name.includes("kaki datar") || name.includes("general laxity") || name.includes("skoliosis") || name.includes("kifosis") || name.includes("lordosis");
}

function isOrtopediRedFlagExportJuknisV319(param: any, value: any) {
  if (Number(param?.post_id) !== 9) return false;
  const name = paramNameExportJuknisV319(param);
  const isVertebra = name.includes("skoliosis") || name.includes("kifosis") || name.includes("lordosis") || name.includes("vertebra") || name.includes("tulang belakang");
  if (isVertebra) return false;
  return isOrtopediProblemExportJuknisV319(param, value) && isPositiveFindingExportJuknisV319(value);
}

function isRadiologiProblemExportJuknisV319(param: any, value: any) {
  if (Number(param?.post_id) !== 10) return false;
  const text = textExportJuknisV319(value);
  if (isNormalValueExportJuknisV319(value)) return false;
  return text.includes("ringan") || text.includes("sedang") || text.includes("berat") || isPositiveFindingExportJuknisV319(value);
}

function isRadiologiRedFlagExportJuknisV319(param: any, value: any) {
  if (Number(param?.post_id) !== 10) return false;
  const text = textExportJuknisV319(value);
  return text.includes("sedang") || text.includes("berat");
}

function isJuknisRedFlagExportV319(stageKey: any, param: any, value: any) {
  if (isTbBbRedFlagExportJuknisV319(value) && (stageKey === "penyakit_dalam" || isHeightParamStatusSheetV179(param) || isWeightParamStatusSheetV179(param))) return true;
  return isPenyakitDalamRedFlagExportJuknisV319(param, value) || isDentalRedFlagExportJuknisV319(param, value) || isOrtopediRedFlagExportJuknisV319(param, value) || isRadiologiRedFlagExportJuknisV319(param, value);
}

function scoreCapaskaExportJuknisV319(stageKey: any, param: any, value: any, baseScore: any) {
  if (isJuknisRedFlagExportV319(stageKey, param, value)) return -10;
  return baseScore;
}

function scoreDeltaExportJuknisV319(stageKey: any, param: any, value: any, baseScore: any, exportScore: any) {
  const baseNum = numberFromStatusSheetV179(baseScore);
  const exportNum = numberFromStatusSheetV179(exportScore);
  if (baseNum === null || exportNum === null) return 0;
  return exportNum - baseNum;
}

function noteDecisionExportJuknisV319(stageKey: any, param: any, value: any, score: any, baseDecision: any) {
  // DASHBOARD_EXPORT_SUM_SCORES_V323_NOTE_DECISION_PATCH
  if (isNormalNoteByParamExportJuknisV320(param, value)) return { include: false, red: false };
  // DASHBOARD_EXPORT_CLEAN_ZERO_CARIES_V320_NOTE_DECISION_PATCH
  if (isNormalNoteByParamExportJuknisV320(param, value)) return { include: false, red: false };
  if (isNormalValueExportJuknisV319(value)) return { include: false, red: false };
  if (isJuknisRedFlagExportV319(stageKey, param, value)) return { include: true, red: true };
  if (stageKey === "gigi" && isDentalProblemExportJuknisV319(param, value)) return { include: true, red: false };
  if (stageKey === "ortopedi" && isOrtopediProblemExportJuknisV319(param, value)) return { include: true, red: false };
  if (stageKey === "radiologi" && isRadiologiProblemExportJuknisV319(param, value)) return { include: true, red: false };
  const safeBase = baseDecision || { include: false, red: false };
  return safeBase;
}
const STAGE_CONFIG_STATUS_SHEET_V179: any = {
  mata: { label: "Mata", max: 12, scoreKey: "Mata" },
  tht: { label: "THT", max: 10, scoreKey: "THT" },
  gigi: { label: "Gigi", max: 16, scoreKey: "Gigi Mulut" },
  penyakit_dalam: { label: "Penyakit Dalam", max: 28, scoreKey: "Penyakit Dalam" },
  jantung: { label: "Jantung", max: 12, scoreKey: "Jantung Pembuluh Darah" },
  ortopedi: { label: "Ortopedi", max: 16, scoreKey: "Ortopedi" },
  radiologi: { label: "Radiologi", max: 6, scoreKey: "Radiologi" },
};

function tbBbDeltaStatusSheetV201(value: number) {
  const rounded = Math.round(value);
  if (rounded >= 1) return String(rounded);
  return String(Math.round(value * 10) / 10).replace(".", ",");
}

function isTbBbSesuaiJuknisStatusSheetV201(value: any) {
  const text = normStatusSheetV179(value);
  if (!text) return false;
  return !text.includes("tidak sesuai") && (text === "sesuai" || text === "sesuai juknis" || text.includes("sesuai juknis"));
}

function isTbBbTidakSesuaiJuknisStatusSheetV201(value: any) {
  const text = normStatusSheetV179(value);
  return text.includes("tidak sesuai");
}

function tbBbNoteStatusSheetV179(height: any, weight: any, gender: any) {
  const h = numberFromStatusSheetV179(height);
  const w = numberFromStatusSheetV179(weight);
  const g = genderKeyStatusSheetV179(gender);
  if (!h || !w || !g) return "";

  const minHeight = g === "putra" ? 170 : 165;
  const maxHeight = g === "putra" ? 180 : 175;

  // Tabel juknis CAPASKA: BB minimum = TB - 115, BB maksimum = TB - 105.
  const minWeight = h - 115;
  const maxWeight = h - 105;
  const issues: string[] = [];

  if (h < minHeight) issues.push(`TB < ${tbBbDeltaStatusSheetV201(minHeight - h)}cm`);
  if (h > maxHeight) issues.push(`TB > ${tbBbDeltaStatusSheetV201(h - maxHeight)}cm`);
  if (w < minWeight) issues.push(`BB < ${tbBbDeltaStatusSheetV201(minWeight - w)}kg`);
  if (w > maxWeight) issues.push(`BB > ${tbBbDeltaStatusSheetV201(w - maxWeight)}kg`);

  return issues.length ? `Tidak sesuai Juknis : ${issues.join("; ")}` : "";
}

// DASHBOARD_EXPORT_STATUS_NOTES_CLEAN_V295
// Rekap Status & Catatan must be based on abnormal form answers, not on score-max fallback.
function paramNameStatusSheetV295(param: any) {
  return normStatusSheetV179([param?.label, param?.name, param?.title, param?.parameter, param?.param_name, param?.question].filter(Boolean).join(" "));
}

function isVitalOrNumericInfoStatusSheetV295(param: any) {
  const name = paramNameStatusSheetV295(param);
  return isHeightParamStatusSheetV179(param) ||
    isWeightParamStatusSheetV179(param) ||
    name.includes("suhu") ||
    name.includes("nadi") ||
    name.includes("napas") ||
    name.includes("nafas") ||
    name.includes("tekanan darah") ||
    name.includes("tensi") ||
    name.includes("tanda vital");
}

function isFreeNoteParamStatusSheetV295(param: any) {
  const name = paramNameStatusSheetV295(param);
  return name.includes("catatan") ||
    name.includes("keterangan") ||
    name.includes("sebutkan") ||
    name.includes("kondisi khusus");
}

function isIgnorableStatusNoteValueV295(param: any, value: any) {
  const text = normStatusSheetV179(value);
  if (!text) return true;

  const blankLike = new Set([
    ".",
    "-",
    "n/a",
    "na",
    "n.a",
    "n.a.",
    "tidak",
    "tidak ada catatan",
    "tidak ada catatan khusus",
    "tidak ada kondisi khusus",
    "tidak ada keluhan",
    "tidak ada temuan",
    "tanpa catatan",
    "nihil"
  ]);
  if (blankLike.has(text)) return true;

  if (isFreeNoteParamStatusSheetV295(param)) {
    if (text.includes("n/a") || text.includes("tidak ada catatan") || text.includes("tidak ada kondisi") || text.includes("tidak ada keluhan")) return true;
    return false;
  }

  // TB, BB, vital sign, and raw numeric entries are not notes by themselves.
  // TB/BB compatibility is evaluated separately by tbBbNoteStatusSheetV179.
  if (isVitalOrNumericInfoStatusSheetV295(param) && /^[-+]?\d[\d\s.,/:;-]*$/.test(text)) return true;
  if (isVitalOrNumericInfoStatusSheetV295(param) && !text.includes("tidak normal") && !text.includes("tidak sesuai")) return true;

  return false;
}

function shouldAddStatusNoteV295(param: any, value: any, score: any) {
  if (isIgnorableStatusNoteValueV295(param, value)) return false;
  const text = normStatusSheetV179(value);
  const severity = severityStatusSheetV179(value, score);
  if (severity) return true;
  if (isNeutralStatusSheetV179(value)) return false;
  if (/^[-+]?\d[\d\s.,/:;-]*$/.test(text)) return false;
  return true;
}

// DASHBOARD_EXPORT_REKAP_SUPABASE_RULES_V301
// Rekap Status & Catatan uses Supabase examination_results values with per-parameter normal/abnormal rules.
// It does not use score-max fallback and does not create Normal rows for participants with no medical results.
function statusSheetParamNameV301(param: any) {
  return normStatusSheetV179([param?.label, param?.name, param?.title, param?.parameter, param?.param_name, param?.question].filter(Boolean).join(" "));
}

function statusSheetRawTextV301(value: any) {
  return cleanStatusSheetV179(value).toLowerCase().trim();
}

function statusSheetScoreNumberV301(score: any): number | null {
  if (typeof score === "number" && Number.isFinite(score)) return score;
  return numberFromStatusSheetV179(score);
}

function isBlankStatusValueV301(value: any) {
  const text = normStatusSheetV179(value);
  if (!text) return true;
  return new Set([".", "-", "n/a", "na", "n a", "nihil", "kosong", "tidak", "tidak ada catatan", "tidak ada catatan khusus", "tidak ada kondisi khusus", "tidak ada keluhan", "tidak ada temuan", "tanpa catatan"]).has(text);
}

function isFreeNoteParamV301(param: any) {
  const name = statusSheetParamNameV301(param);
  return name.includes("catatan") || name.includes("keterangan") || name.includes("sebutkan") || name.includes("kondisi khusus");
}

function isNumericOrVitalParamV301(param: any) {
  const name = statusSheetParamNameV301(param);
  return isHeightParamStatusSheetV179(param) ||
    isWeightParamStatusSheetV179(param) ||
    name.includes("suhu") ||
    name.includes("nadi") ||
    name.includes("napas") ||
    name.includes("nafas") ||
    name.includes("tekanan darah") ||
    name.includes("tensi") ||
    name.includes("tanda vital");
}

function isNumericOnlyValueV301(value: any) {
  const text = statusSheetRawTextV301(value);
  return /^[-+]?d[ds.,/:;-]*$/.test(text);
}

function hasMinusWithoutPlusV301(value: any) {
  const raw = statusSheetRawTextV301(value);
  return (raw.includes("(-)") || raw.includes("negatif")) && !raw.includes("(+)") && !raw.includes("positif");
}

function isTonsilNormalV301(value: any) {
  const text = normStatusSheetV179(value);
  if (text.includes("tonsilektomi")) return true;
  if (text.includes("t3") || text.includes("t2")) return false;
  return /(^|\b)t0(\b|$)/.test(text) || /(^|\b)t1(\b|$)/.test(text);
}

function isDentalZeroNormalV301(param: any, value: any) {
  const name = statusSheetParamNameV301(param);
  const text = normStatusSheetV179(value);
  if (!(name.includes("caries") || name.includes("karies") || name.includes("tumpatan") || name.includes("impaksi") || name.includes("kehilangan") || name.includes("gigi"))) return false;
  return text === "0" || text.includes("0 caries") || text.includes("0 karies") || text.includes("0 tumpatan") || text.includes("0 gigi") || text.includes("0 impaksi");
}

function isNormalFormValueV301(stageKey: string, param: any, value: any) {
  if (isBlankStatusValueV301(value)) return true;
  const name = statusSheetParamNameV301(param);
  const text = normStatusSheetV179(value);
  const raw = statusSheetRawTextV301(value);

  if (isFreeNoteParamV301(param)) return false;
  if (isNumericOrVitalParamV301(param)) {
    if (text.includes("tidak normal") || text.includes("tidak sesuai")) return false;
    return true;
  }

  if (text === "normal" || text.includes("dalam batas normal") || text === "dbn" || text === "baik") return true;
  if (!text.includes("tidak sesuai") && (text === "sesuai" || text === "sesuai juknis" || text.includes("sesuai juknis"))) return true;
  if (text.includes("tidak ada") || text.includes("tidak ditemukan") || text.includes("tidak menggunakan") || text.includes("tidak buta warna")) return true;
  if (text === "intak" || (text.includes("intak") && !text.includes("tidak intak"))) return true;
  if (text === "ta" || text === "tidak ada ta") return true;
  if (hasMinusWithoutPlusV301(value)) return true;
  if (isDentalZeroNormalV301(param, value)) return true;
  if (name.includes("tonsil") && isTonsilNormalV301(value)) return true;
  if ((name.includes("rhinitis") || name.includes("strabismus") || name.includes("juling")) && hasMinusWithoutPlusV301(value)) return true;
  if (name.includes("dental") && name.includes("panor") && text === "normal") return true;
  if (stageKey === "radiologi" && (text === "ta" || text.includes("tidak ada"))) return true;

  return false;
}

function noteDecisionV301(stageKey: string, param: any, value: any, score: any) {
  const text = normStatusSheetV179(value);
  const name = statusSheetParamNameV301(param);
  const scoreNum = statusSheetScoreNumberV301(score);

  if (isNormalFormValueV301(stageKey, param, value)) return { include: false, red: false };
  if (isFreeNoteParamV301(param)) {
    const raw = statusSheetRawTextV301(value);
    const red = raw.includes("tidak direkomendasi") || raw.includes("red flag");
    return { include: true, red };
  }
  if (isNumericOrVitalParamV301(param) && isNumericOnlyValueV301(value)) return { include: false, red: false };

  const explicitRed = text.includes("tidak direkomendasi") || text.includes("red flag");
  if (scoreNum !== null && scoreNum <= -10) return { include: true, red: true };
  if (explicitRed) return { include: true, red: true };
  if (stageKey === "radiologi" && (text.includes("sedang") || text.includes("berat"))) return { include: true, red: true };
  if (name.includes("tonsil") && text.includes("t3")) return { include: true, red: true };

  if (scoreNum !== null && scoreNum < 0) return { include: true, red: false };
  if (text.includes("tidak normal") || text.includes("tidak sesuai")) return { include: true, red: false };
  if (stageKey === "radiologi" && text.includes("ringan")) return { include: true, red: false };
  if (name.includes("tonsil") && text.includes("t2")) return { include: true, red: false };
  if (text.includes("buta warna")) return { include: true, red: false };
  if (text.includes("ada") && !text.includes("tidak ada")) return { include: true, red: false };
  if (!isNeutralStatusSheetV179(value)) return { include: true, red: false };

  return { include: false, red: false };
}
function evaluateStageStatusSheetV179(stageKey: string, notes: string[], redNotes: string[], progressInfo: any) {
  // DASHBOARD_EXPORT_STATUS_NOTES_EVALUATE_V295
  // Status/catatan follows actual abnormal answers from the form.
  // Do not mark "Dengan Catatan" only because total post score is below a max value.
  const uniqueNotes = Array.from(new Set((notes || []).map((item: any) => cleanStatusSheetV179(item)).filter(Boolean)));
  const uniqueRedNotes = Array.from(new Set((redNotes || []).map((item: any) => cleanStatusSheetV179(item)).filter(Boolean)));

  if (uniqueRedNotes.length) return { status: "Tidak Direkomendasikan", note: uniqueRedNotes.join("; ") || "Ada red flag / skor -10" };
  if (uniqueNotes.length) return { status: "Dengan Catatan", note: uniqueNotes.join("; ") };
  return { status: "Normal", note: "" };
}

function buildCapaskaStatusCatatanRowsV179(args: any) {
  const { participantRows, completedProgressRows, sourceMap, packageName, postName, exportParameters, resultByParticipantParam, makeKey, scoreCapaskaDirectChoice } = args;
  const progressById = new Map((completedProgressRows || []).map((row: any) => [Number(row["Participant ID"]), row]));
  // DASHBOARD_EXPORT_REKAP_SUPABASE_RULES_V301
  // Only generate rekap rows for completed/export-eligible participants that have medical result values.
  const completedParticipantIdsV301 = new Set((completedProgressRows || []).map((row: any) => Number(row["Participant ID"])));
  const statusParticipantRowsV301 = (participantRows || []).filter((participant: any) => {
    const participantId = Number(participant.id);
    if (completedParticipantIdsV301.size && !completedParticipantIdsV301.has(participantId)) return false;
    return (exportParameters || []).some((param: any) => {
      const postLabel = postName.get(Number(param.post_id)) || "";
      // RESTORE_EXPORT_PARAMTEXT_V314
      const paramText = `${postLabel} ${param.category || ""} ${param.name || ""}`;
      const stageKey = stageKeyFromPostStatusSheetV319(param, postName, paramText);
      // DASHBOARD_EXPORT_REKAP_V301_TYPE_FIX
      if (!stageKey || !STAGE_CONFIG_STATUS_SHEET_V179[stageKey]) return false;
      const result = resultByParticipantParam.get(makeKey(participantId, Number(param.id)));
      return !!cleanStatusSheetV179(result?.value ?? "");
    });
  });
  return statusParticipantRowsV301.map((participant: any, index: number) => {
    const progressInfo = progressById.get(Number(participant.id)) || {};
    const source = sourceMap.get(Number(participant.source_id));
    const notesByStage: any = { mata: [], tht: [], gigi: [], penyakit_dalam: [], jantung: [], ortopedi: [], radiologi: [] };
    const redNotesByStage: any = { mata: [], tht: [], gigi: [], penyakit_dalam: [], jantung: [], ortopedi: [], radiologi: [] };
    let height = "";
    let weight = "";
    let tbJuknisChoiceV201 = "";
    let bbJuknisChoiceV201 = "";
    // DASHBOARD_EXPORT_JUKNIS_SCORE_NOTES_V319_SCORE_ADJUST
    let scoreAdjustmentJuknisV319 = 0;
    // DASHBOARD_EXPORT_SUM_SCORES_V323_REKAP_SUM_INIT
    let scoreSumExportJuknisV323 = 0;

    for (const param of exportParameters || []) {
      const result = resultByParticipantParam.get(makeKey(Number(participant.id), Number(param.id)));
      const value = cleanStatusSheetV179(result?.value ?? "");
      if (!value) continue;
      const postLabel = postName.get(Number(param.post_id)) || "";
      const paramText = `${postLabel} ${param.category || ""} ${param.name || ""}`;
      if (isHeightParamStatusSheetV179(param)) {
        if (isTbBbSesuaiJuknisStatusSheetV201(value) || isTbBbTidakSesuaiJuknisStatusSheetV201(value)) tbJuknisChoiceV201 = value;
        if (numberFromStatusSheetV179(value) !== null) height = value;
      }
      if (isWeightParamStatusSheetV179(param)) {
        if (isTbBbSesuaiJuknisStatusSheetV201(value) || isTbBbTidakSesuaiJuknisStatusSheetV201(value)) bbJuknisChoiceV201 = value;
        if (numberFromStatusSheetV179(value) !== null) weight = value;
      }
      const stageKey = stageKeyFromPostStatusSheetV319(param, postName, paramText);
      if (!stageKey || !notesByStage[stageKey]) continue;
      const baseScoreV319 = value ? scoreCapaskaDirectChoice(param, value) : "";
      const score = scoreCapaskaExportJuknisV319(stageKey, param, value, baseScoreV319);
      // DASHBOARD_EXPORT_SUM_SCORES_V323_REKAP_SUM_ADD
      const scoreNumExportJuknisV323 = numberFromStatusSheetV179(score);
      if (scoreNumExportJuknisV323 !== null) scoreSumExportJuknisV323 += scoreNumExportJuknisV323;
      scoreAdjustmentJuknisV319 += scoreDeltaExportJuknisV319(stageKey, param, value, baseScoreV319, score);
      // DASHBOARD_EXPORT_RESTORE_TO_STAFF_MAP_V306_V312// DASHBOARD_EXPORT_JUKNIS_SCORE_NOTES_V319_APPLY
      const baseDecisionV319 = noteDecisionV301(stageKey, param, value, score);
      const decisionV319 = noteDecisionExportJuknisV319(stageKey, param, value, score, baseDecisionV319);
      if (decisionV319.include) {
        const note = `${param.name}: ${value}`;
        notesByStage[stageKey].push(note);
        if (decisionV319.red) redNotesByStage[stageKey].push(note);
      }
    }

    const tbBbChoicesSesuaiV201 = isTbBbSesuaiJuknisStatusSheetV201(tbJuknisChoiceV201) && isTbBbSesuaiJuknisStatusSheetV201(bbJuknisChoiceV201);
    const tbBbManualTidakSesuaiV201 = isTbBbTidakSesuaiJuknisStatusSheetV201(tbJuknisChoiceV201) || isTbBbTidakSesuaiJuknisStatusSheetV201(bbJuknisChoiceV201);
    const computedTbBbNoteV201 = tbBbNoteStatusSheetV179(height, weight, participant.gender);
    const tbBbNote = tbBbChoicesSesuaiV201 ? "" : (computedTbBbNoteV201 || (tbBbManualTidakSesuaiV201 ? "Tidak sesuai Juknis" : ""));
    const tbBbRedFlagV319 = !!tbBbNote && isTbBbRedFlagExportJuknisV319(tbBbNote);
    const tbBbStatus = tbBbRedFlagV319 ? "Tidak Direkomendasikan" : tbBbNote ? "Dengan Catatan" : "Normal";
    if (tbBbRedFlagV319) redNotesByStage.penyakit_dalam.push(`TB/BB: ${tbBbNote}`);
    const stageEval: any = {};
    for (const stageKey of Object.keys(STAGE_CONFIG_STATUS_SHEET_V179)) {
      stageEval[stageKey] = evaluateStageStatusSheetV179(stageKey, Array.from(new Set(notesByStage[stageKey] || [])), Array.from(new Set(redNotesByStage[stageKey] || [])), progressInfo);
    }

    const allNotes: string[] = [];
    const redFindings: string[] = [];
    if (tbBbNote) allNotes.push(`TB/BB: ${tbBbNote}`);
    for (const stageKey of Object.keys(STAGE_CONFIG_STATUS_SHEET_V179)) {
      const evaluation = stageEval[stageKey];
      const label = STAGE_CONFIG_STATUS_SHEET_V179[stageKey].label;
      if (evaluation.note) {
        const noteText = `${label}: ${evaluation.note}`;
        allNotes.push(noteText);
        if (evaluation.status === "Tidak Direkomendasikan") redFindings.push(noteText);
      }
    }
    const finalStatus = redFindings.length ? "Tidak Direkomendasikan" : allNotes.length ? "Dengan Catatan" : "Normal";
    const totalScoreBaseJuknisV319 = numberFromStatusSheetV179(progressInfo?.["Total Score"]);
    // DASHBOARD_EXPORT_SUM_SCORES_V323_REKAP_TOTAL_SUM
    const totalScoreExportJuknisV319 = scoreSumExportJuknisV323 > 0 ? scoreSumExportJuknisV323 : (totalScoreBaseJuknisV319 !== null ? totalScoreBaseJuknisV319 + scoreAdjustmentJuknisV319 : (progressInfo?.["Total Score"] ?? ""));
    return {
      "NO": index + 1,
      "PROVINSI": participant.province || "-",
      "JENIS KELAMIN": genderLabelStatusSheetV179(participant.gender || "-"),
      "MCU ID / NO PESERTA": participant.mcu_id || participant.external_id || "-",
      "NAMA": participant.name || "-",
      "TINGGI BADAN": height,
      "BERAT BADAN": weight,
      "STATUS TB/BB": tbBbStatus,
      "CATATAN TB/BB": tbBbNote,
      "STATUS MATA": stageEval.mata.status,
      "CATATAN MATA": stageEval.mata.note,
      "STATUS THT": stageEval.tht.status,
      "CATATAN THT": stageEval.tht.note,
      "STATUS GIGI": stageEval.gigi.status,
      "CATATAN GIGI": stageEval.gigi.note,
      "STATUS PENYAKIT DALAM": stageEval.penyakit_dalam.status,
      "CATATAN PENYAKIT DALAM": stageEval.penyakit_dalam.note,
      "STATUS JANTUNG": stageEval.jantung.status,
      "CATATAN JANTUNG": stageEval.jantung.note,
      "STATUS ORTOPEDI": stageEval.ortopedi.status,
      "CATATAN ORTOPEDI": stageEval.ortopedi.note,
      "STATUS RADIOLOGI": stageEval.radiologi.status,
      "CATATAN RADIOLOGI": stageEval.radiologi.note,
      "TOTAL SKOR": totalScoreExportJuknisV319,
      "STATUS AKHIR": finalStatus,
      "RINGKASAN CATATAN": allNotes.join(" | "),
      "TEMUAN MERAH / RED FLAG": redFindings.join(" | ") || progressInfo?.["Red Flag"] || "",
      "DATABASE": source?.name || "-",
      "INSTANSI": source?.institution_name || "-",
      "PAKET": packageName.get(Number(participant.package_id)) || "-",
    };
  });
}

const CAPASKA_STATUS_CATATAN_HEADERS_V179 = [
  "NO", "PROVINSI", "JENIS KELAMIN", "MCU ID / NO PESERTA", "NAMA", "TINGGI BADAN", "BERAT BADAN",
  "STATUS TB/BB", "CATATAN TB/BB", "STATUS MATA", "CATATAN MATA", "STATUS THT", "CATATAN THT",
  "STATUS GIGI", "CATATAN GIGI", "STATUS PENYAKIT DALAM", "CATATAN PENYAKIT DALAM", "STATUS JANTUNG",
  "CATATAN JANTUNG", "STATUS ORTOPEDI", "CATATAN ORTOPEDI", "STATUS RADIOLOGI", "CATATAN RADIOLOGI",
  "TOTAL SKOR", "STATUS AKHIR", "RINGKASAN CATATAN", "TEMUAN MERAH / RED FLAG", "DATABASE", "INSTANSI", "PAKET"
];


// DASHBOARD_EXPORT_TB_BB_STATUS_V201
// DASHBOARD_EXPORT_LULUS_LABEL_V199
function displayKelulusanExportV199(value: any) {
  const text = String(value ?? '').trim();
  if (text === 'Lulus') return 'Direkomendasikan';
  return text;
}


/* DASHBOARD_EXPORT_FETCH_ALL_RESULTS_V302
   Export lengkap CAPASKA harus mengambil semua examination_results.
   Supabase/PostgREST query .select().in() bisa kembali hanya batch terbatas,
   sehingga hanya sebagian peserta yang punya value di Excel. Helper ini membaca
   results per chunk participant_id dan per halaman 1000 row. Read-only.
*/
async function fetchAllDashboardExportResultsV302(supabase: any, participantIds: number[]) {
  const ids = Array.from(new Set((participantIds || []).map((id: any) => Number(id)).filter((id: number) => Number.isFinite(id) && id > 0)));
  const allRows: any[] = [];
  const chunkSize = 150;
  const pageSize = 1000;
  const maxPages = 100;

  if (!ids.length) return { data: allRows, error: null };

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    for (let page = 0; page < maxPages; page++) {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const { data, error } = await supabase
        .from("examination_results")
        .select("*")
        .in("participant_id", chunk)
        .order("id", { ascending: true })
        .range(from, to);

      if (error) return { data: allRows, error };
      const rows = Array.isArray(data) ? data : [];
      allRows.push(...rows);
      if (rows.length < pageSize) break;
    }
  }

  return { data: allRows, error: null };
}

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const program = req.nextUrl.searchParams.get("program") || user.program_type || "capaska";
  const isCapaskaProgram = normalizeProgram(program) === "capaska";
  const sourceId = req.nextUrl.searchParams.get("source_id") || "all";
  const statusRawV293 = req.nextUrl.searchParams.get("status") || "Semua";
  const status = req.nextUrl.searchParams.get("selected_full") === "1" ? "Semua" : statusRawV293;
  const requestedTypeV293 = req.nextUrl.searchParams.get("type") || "progress";
  const type = requestedTypeV293 === "selected_full" ? "full" : requestedTypeV293;
  // DASHBOARD_EXPORT_SELECTED_OVERRIDE_V293
  // Optional selected participant export: selected rows become the final export set, while existing workbook builders stay unchanged.
  const participantIdsParamV293 = String(req.nextUrl.searchParams.get("participant_ids") || "").trim();
  const selectedParticipantIdsV293 = Array.from(new Set(
    participantIdsParamV293
      .split(",")
      .map((value) => Number(String(value).trim()))
      .filter((value) => Number.isFinite(value) && value > 0)
  ));
  const selectedParticipantIdSetV293 = new Set(selectedParticipantIdsV293.map((value) => Number(value)));
  const selectedFullExportV293 = req.nextUrl.searchParams.get("selected_full") === "1" || selectedParticipantIdsV293.length > 0;

  // DASHBOARD_EXPORT_SELECTED_FULL_V289
  // Optional selected participant IDs from dashboard table. Used by Export Terpilih.
  const participantIdsParamV289 = req.nextUrl.searchParams.get("participant_ids") || "";
  const selectedParticipantIdsV289 = Array.from(new Set(participantIdsParamV289
    .split(",")
    .map((value) => Number(String(value).trim()))
    .filter((value) => Number.isFinite(value) && value > 0)));
  const hasSelectedParticipantIdsV289 = selectedParticipantIdsV289.length > 0;

  let query = supabase
    .from("participants")
    .select("*")
    .order("id", { ascending: false })
    .limit(2000);

  if (program !== "all") query = query.eq("program_type", program);
  if (sourceId && sourceId !== "all") query = query.eq("source_id", Number(sourceId));
  if (hasSelectedParticipantIdsV289) query = query.in("id", selectedParticipantIdsV289);


  // DASHBOARD_EXPORT_SELECTED_QUERY_FILTER_V293
  if (selectedParticipantIdsV293.length) query = query.in("id", selectedParticipantIdsV293);
  const { data: participants, error } = await query;
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });

  const participantRows = participants || [];
  const participantIds = participantRows.map((p: any) => Number(p.id));
  const packageIds = [...new Set(participantRows.map((p: any) => Number(p.package_id)).filter(Boolean))];

  const [
    packageParameters,
    parameters,
    posts,
    results,
    packages,
    sources,
    graduationRules
  ] = await Promise.all([
    packageIds.length ? supabase.from("package_parameters").select("*").in("package_id", packageIds) : Promise.resolve({ data: [] }),
    supabase.from("parameters").select("*").eq("is_active", 1),
    supabase.from("posts").select("*"),
    fetchAllDashboardExportResultsV302(supabase, participantIds),
    supabase.from("packages").select("id,name,program_type"),
    supabase.from("participant_sources").select("id,name,institution_name"),
    supabase.from("graduation_rules").select("*")
  ]);

  const packageName = new Map((packages.data || []).map((p: any) => [Number(p.id), p.name]));
  const sourceMap = new Map((sources.data || []).map((s: any) => [Number(s.id), s]));
  const postName = new Map((posts.data || []).map((p: any) => [Number(p.id), p.name]));
  const postById = new Map((posts.data || []).map((p: any) => [Number(p.id), p]));
  const paramById = new Map((parameters.data || []).map((p: any) => [Number(p.id), p]));
  const participantById = new Map(participantRows.map((p: any) => [Number(p.id), p]));

  const resultByParticipantParam = new Map<string, any>();
  (results.data || []).forEach((result: any) => {
    resultByParticipantParam.set(makeKey(Number(result.participant_id), Number(result.parameter_id)), result);
  });

  // DASHBOARD_EXPORT_FETCH_ALL_STAFF_ASSIGNMENTS_V305
// Fetch every staff/doctor assignment for selected CAPASKA participants.
// Supabase can page/limit large result sets, so export must fetch by chunk and range.
async function fetchAllDashboardExportStageStaffAssignmentsV305(supabaseClient: any, ids: any[]) {
  const numericIds = Array.from(new Set((ids || [])
    .map((value: any) => Number(value))
    .filter((value: number) => Number.isFinite(value) && value > 0)));
  const rows: any[] = [];
  const chunkSize = 200;
  const pageSize = 1000;

  for (let i = 0; i < numericIds.length; i += chunkSize) {
    const chunk = numericIds.slice(i, i + chunkSize);
    let from = 0;

    while (true) {
      const to = from + pageSize - 1;
      const { data, error } = await supabaseClient
        .from("mcu_stage_staff_assignments")
        .select("id, participant_id, post_id, staff_name, input_by, created_at, updated_at")
        .in("participant_id", chunk)
        .range(from, to);

      if (error) throw error;
      const pageRows = Array.isArray(data) ? data : [];
      rows.push(...pageRows);
      if (pageRows.length < pageSize) break;
      from += pageSize;
    }
  }

  return rows;
}

const stageStaffAssignmentsData = isCapaskaProgram && participantIds.length
  ? await fetchAllDashboardExportStageStaffAssignmentsV305(supabase, participantIds)
  : [];

  // DASHBOARD_EXPORT_STAFF_MAP_V306
  // Map dokter/staff per participant + post for wide export.
  const staffByParticipantPostV185 = new Map<string, string[]>();
  for (const row of stageStaffAssignmentsData || []) {
    const key = makeKey(Number(row.participant_id), Number(row.post_id));
    const current = staffByParticipantPostV185.get(key) || [];
    current.push(row.staff_name);
    staffByParticipantPostV185.set(key, uniqueCleanValuesV185(current));
  }

  // DASHBOARD_EXPORT_RESULT_BASED_COMPLETED_V288
  // Export full CAPASKA follows dashboard/operator completion by medical post results.
  // Registrasi Ulang is bypassed. A participant is export-complete when all 7 medical posts have saved results.
  const requiredMedicalPostIdsV288 = [4, 5, 6, 7, 8, 9, 10];
  const requiredMedicalPostIdSetV288 = new Set(requiredMedicalPostIdsV288);
  const parameterPostIdMapV288 = new Map<number, number>();
  for (const param of (parameters.data || [])) {
    const paramId = Number((param as any)?.id);
    const postId = Number((param as any)?.post_id);
    if (paramId && postId) parameterPostIdMapV288.set(paramId, postId);
  }
  const resultMedicalPostIdsByParticipantV288 = new Map<number, Set<number>>();
  for (const result of (results.data || [])) {
    const participantId = Number((result as any)?.participant_id);
    const parameterId = Number((result as any)?.parameter_id);
    const postId = Number((result as any)?.input_post_id || parameterPostIdMapV288.get(parameterId) || 0);
    if (!participantId || !requiredMedicalPostIdSetV288.has(postId)) continue;
    const valueText = String((result as any)?.value ?? "").trim();
    if (!valueText) continue;
    if (!resultMedicalPostIdsByParticipantV288.has(participantId)) resultMedicalPostIdsByParticipantV288.set(participantId, new Set<number>());
    resultMedicalPostIdsByParticipantV288.get(participantId)!.add(postId);
  }

  const progressRows = participantRows.map((p: any) => {
    const stages = normalizeDashboardStages(
      computeStagesForParticipant(
        Number(p.id),
        Number(p.package_id),
        packageParameters.data || [],
        parameters.data || [],
        posts.data || [],
        results.data || []
      ),
      p
    );
    // DASHBOARD_EXPORT_MEDICAL_COMPLETED_V287
    // Export completed participants follows dashboard medical/operator completion.
    // Registrasi Ulang and non-medical stages are not required for hasil-pemeriksaan-lengkap.xlsx.
    const stageNormV287 = (stage: any) => capaskaDashboardProgressNormV153([
      stage?.post_name,
      stage?.name,
      stage?.title,
      stage?.stage_name,
      stage?.label,
      stage?.key
    ].filter(Boolean).join(" "));
    const medicalPostIdsV287 = new Set([4, 5, 6, 7, 8, 9, 10]);
    const isMedicalStageV287 = (stage: any) => {
      const postId = Number(stage?.post_id ?? stage?.id ?? 0);
      if (medicalPostIdsV287.has(postId)) return true;
      const text = stageNormV287(stage);
      if (!text) return false;
      if (text.includes("registrasi") && text.includes("ulang")) return false;
      return text.includes("mata") ||
        (text.includes("penyakit") && text.includes("dalam")) ||
        text.includes("gigi") ||
        text.includes("dental") ||
        text.includes("tht") ||
        text.includes("jantung") ||
        text.includes("pembuluh") ||
        text.includes("ortopedi") ||
        text.includes("radiologi") ||
        text.includes("rontgen");
    };
    const medicalStagesV287 = isCapaskaProgram
      ? (Array.isArray(stages) ? stages : []).filter(isMedicalStageV287)
      : stages;
    const fallbackStagesV287 = isCapaskaProgram
      ? (Array.isArray(stages) ? stages : []).filter((stage: any) => {
          const text = stageNormV287(stage);
          return !(text.includes("registrasi") && text.includes("ulang"));
        })
      : stages;
    const effectiveStagesV287 = medicalStagesV287.length ? medicalStagesV287 : fallbackStagesV287;
    // DASHBOARD_EXPORT_RESULT_BASED_COMPLETED_V288
    // Use saved medical-post results as the completion source for CAPASKA export.
    // This matches the operator/dashboard done state and bypasses Registrasi Ulang.
    const medicalDonePostIdsV288 = resultMedicalPostIdsByParticipantV288.get(Number(p.id)) || new Set<number>();
    const stageDoneFallbackV288 = effectiveStagesV287.filter((stage: any) => stage.is_done).length;
    const stageTotalFallbackV288 = effectiveStagesV287.length;
    const done = isCapaskaProgram ? requiredMedicalPostIdsV288.filter((postId) => medicalDonePostIdsV288.has(postId)).length : stageDoneFallbackV288;
    const total = isCapaskaProgram ? requiredMedicalPostIdsV288.length : stageTotalFallbackV288;
    const complete = total > 0 && done >= total;
    const scoreResult = computeMcuParticipantScoring2026({
      participantId: Number(p.id),
      packageId: Number(p.package_id),
      packageParameters: packageParameters.data || [],
      parameters: parameters.data || [],
      results: results.data || [],
      program: String(p.program_type || program || ""),
    });
    const totalScore = scoreResult.totalScore;
    const rule = getRuleForPackage(Number(p.package_id), program, graduationRules.data || []);
    const selectedFullExportV289 = hasSelectedParticipantIdsV289 && isCapaskaProgram && type === "full";
    const effectiveCompleteForExportV289 = selectedFullExportV289 ? true : complete;
    const kelulusan = evaluateMcuGraduation2026(totalScore, effectiveCompleteForExportV289, rule, scoreResult);
    const source = sourceMap.get(Number(p.source_id));

    return {
      "Participant ID": Number(p.id),
      "Package ID": Number(p.package_id),
      "Nama": p.name,
      "No MCU": p.mcu_id || p.external_id || "-",
      "NIK": p.nik || "-",
      "NIK Karyawan": p.employee_nik || "-",
      "Jenis Kelamin": p.gender || "-",
      "Tanggal Lahir": p.birth_date || p.date_of_birth || "-",
      "Tanggal MCU": p.mcu_date || p.service_date || p.examination_date || p.exam_date || "-",
      "Database": source?.name || "-",
      "Instansi": source?.institution_name || "-",
      "Paket": packageName.get(Number(p.package_id)) || "-",
      "Status Progress": effectiveCompleteForExportV289 ? "Selesai" : "Belum Selesai",
      "Kelulusan": displayKelulusanExportV199(kelulusan),
      "Total Score": totalScore ?? "",
      "Score Sebelum Penalti": scoreResult.totalBeforePenalty ?? "",
      "Penalti Red Flag": scoreResult.penalty || 0,
      "Mata": scoreResult.domainScores.mata ?? "",
      "Gigi Mulut": scoreResult.domainScores.gigi_mulut ?? "",
      "THT": scoreResult.domainScores.tht ?? "",
      "Penyakit Dalam": scoreResult.domainScores.penyakit_dalam ?? "",
      "Jantung Pembuluh Darah": scoreResult.domainScores.jantung_pembuluh_darah ?? "",
      "Ortopedi": scoreResult.domainScores.ortopedi ?? "",
      "Radiologi": scoreResult.domainScores.radiologi ?? "",
      "Red Flag": scoreResult.redFlags.join(" | "),
      "Scoring Version": scoreResult.version,
      "Range Lulus Min": Number(rule?.pass_min_score ?? 0),
      "Range Lulus Max": Number(rule?.pass_max_score ?? 999999),
      "Stage Selesai": selectedFullExportV289 ? total : done,
      "Total Stage": total,
      "Progress %": selectedFullExportV289 ? 100 : (total ? Math.round((done / total) * 1000) / 10 : 0)
    };
  }).filter((r: any) => {
    if (status === "Selesai") return r["Status Progress"] === "Selesai";
    if (status === "Belum Selesai") return r["Status Progress"] !== "Selesai";
    if (status === "Lulus" || status === "Direkomendasikan") return r["Kelulusan"] === "Lulus" || r["Kelulusan"] === "Direkomendasikan";
    if (status === "Tidak Lulus") return r["Kelulusan"] === "Tidak Lulus" || r["Kelulusan"] === "Tidak Direkomendasikan";
    if (status === "Belum Dinilai") return r["Kelulusan"] === "Belum Dinilai";
    return true;
  });

  const workbook = XLSX.utils.book_new();

  const summaryRows = [
    { Metric: "Total Peserta", Value: progressRows.length },
    { Metric: "Selesai", Value: progressRows.filter((r: any) => r["Status Progress"] === "Selesai").length },
    { Metric: "Belum Selesai", Value: progressRows.filter((r: any) => r["Status Progress"] !== "Selesai").length },
    { Metric: "Direkomendasikan", Value: progressRows.filter((r: any) => r["Kelulusan"] === "Lulus" || r["Kelulusan"] === "Direkomendasikan").length },
    { Metric: "Tidak Lulus", Value: progressRows.filter((r: any) => r["Kelulusan"] === "Tidak Lulus" || r["Kelulusan"] === "Tidak Direkomendasikan").length },
    { Metric: "Tidak Direkomendasikan", Value: progressRows.filter((r: any) => r["Kelulusan"] === "Tidak Direkomendasikan").length },
    { Metric: "Belum Dinilai", Value: progressRows.filter((r: any) => r["Kelulusan"] === "Belum Dinilai").length }
  ];

  appendJsonSheet(workbook, summaryRows, "Ringkasan", ["Metric", "Value"]);

  // Sheet Progress Peserta sengaja tidak dibuat untuk export CAPASKA supaya file lebih ringkas.
  // Corporate MCU / Vaksinasi tetap memakai sheet progress lama agar flow lain tidak berubah.
  if (!isCapaskaProgram) {
    const progressHeaders = Object.keys(progressRows[0] || {}).filter((header) => header !== "Participant ID" && header !== "Package ID");
    appendJsonSheet(workbook, progressRows.map(({ "Participant ID": _pid, "Package ID": _pkg, ...row }: any) => row), "Progress Peserta", progressHeaders);
  }

  if (type === "full") {
    const resultRows = (results.data || [])
      .map((r: any) => {
        const parameter = paramById.get(Number(r.parameter_id));
        const participant = participantById.get(Number(r.participant_id));
        if (!participant || !parameter) return null;
        if (isCapaskaProgram && isCapaskaValueOrScoreParameter(parameter)) return null;

        const source = sourceMap.get(Number(participant?.source_id));
        const post = parameter ? postName.get(Number(parameter.post_id)) : "-";
        const value = r.value ?? "";

        return {
          "Nama": participant?.name || "-",
          "No MCU": participant?.mcu_id || participant?.external_id || "-",
          "Database": source?.name || "-",
          "Paket": packageName.get(Number(participant?.package_id)) || "-",
          "Post/Station": post || "-",
          "Kategori": parameter?.category || "-",
          "Parameter": parameter?.name || "-",
          "Hasil": value,
          ...(isCapaskaProgram ? { "Skor": value ? scoreCapaskaDirectChoice(parameter, String(value)) : "" } : {}),
          "Updated At": formatTimestamp(r.updated_at || r.created_at || "")
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => {
        const nameCompare = String(a["Nama"]).localeCompare(String(b["Nama"]));
        if (nameCompare) return nameCompare;
        const postA = String(a["Post/Station"] || "");
        const postB = String(b["Post/Station"] || "");
        const postCompare = postA.localeCompare(postB);
        if (postCompare) return postCompare;
        return String(a["Parameter"] || "").localeCompare(String(b["Parameter"] || ""));
      });

    const resultHeaders = isCapaskaProgram
      ? ["Nama", "No MCU", "Database", "Paket", "Post/Station", "Kategori", "Parameter", "Hasil", "Skor", "Updated At"]
      : ["Nama", "No MCU", "Database", "Paket", "Post/Station", "Kategori", "Parameter", "Hasil", "Updated At"];



    // DASHBOARD_EXPORT_RESTORE_HISTORY_V282
    // Export hasil-pemeriksaan-lengkap keeps historical meaning:
    // only fully completed participants appear in Hasil Pemeriksaan, Hasil Wide Selesai, and Rekap Status & Catatan.
    let completedProgressRows = hasSelectedParticipantIdsV289
      ? progressRows
      : progressRows.filter((row: any) =>
          row["Status Progress"] === "Selesai" && Number(row["Progress %"] || 0) >= 100
        );

    const completedNoMcuForResultRowsV282 = new Set(
      completedProgressRows
        .map((row: any) => String(row["No MCU"] || "").trim())
        .filter(Boolean)
    );
    const resultRowsForSheetV282 = (isCapaskaProgram && type === "full")
      ? (resultRows as any[]).filter((row: any) => completedNoMcuForResultRowsV282.has(String(row["No MCU"] || "").trim()))
      : resultRows;
    appendJsonSheet(workbook, resultRowsForSheetV282 as any[], "Hasil Pemeriksaan", resultHeaders);

    // DASHBOARD_EXPORT_RESTORE_HISTORY_V282
    // No V273 include-all override here; wide and recap sheets remain completed-only.

    // DASHBOARD_EXPORT_SELECTED_COMPLETED_ROWS_V293
    // For Export Terpilih, trust the selected dashboard rows as the final completed export set.
    if (selectedFullExportV293) {
      completedProgressRows = progressRows
        .filter((row: any) => selectedParticipantIdsV293.length ? selectedParticipantIdSetV293.has(Number(row["Participant ID"])) : true)
        .map((row: any) => ({
          ...row,
          "Status Progress": "Selesai",
          "Progress %": 100,
          "Stage Selesai": row["Total Stage"] || row["Stage Selesai"],
        }));
    }
    const completedParticipantIds = new Set(completedProgressRows.map((row: any) => Number(row["Participant ID"])));

    const exportParameters = Array.from(new Map(
      (packageParameters.data || [])
        .filter((pp: any) => packageIds.includes(Number(pp.package_id)))
        .map((pp: any) => paramById.get(Number(pp.parameter_id)))
        .filter((param: any) => param && (!isCapaskaProgram || !isCapaskaValueOrScoreParameter(param)))
        .sort((a: any, b: any) => {
          const postA = postById.get(Number(a.post_id));
          const postB = postById.get(Number(b.post_id));
          const postOrderCompare = numericSort(postA?.sort_order) - numericSort(postB?.sort_order);
          if (postOrderCompare) return postOrderCompare;
          const postNameCompare = String(postA?.name || "").localeCompare(String(postB?.name || ""));
          if (postNameCompare) return postNameCompare;
          const paramOrderCompare = numericSort(a.sort_order) - numericSort(b.sort_order);
          if (paramOrderCompare) return paramOrderCompare;
          return String(a.name || "").localeCompare(String(b.name || ""));
        })
        .map((param: any) => [Number(param.id), param])
    ).values());

    if (isCapaskaProgram) {
      const identityHeaders = ["Nama", "No MCU", "NIK", "Asal Provinsi", "Jenis Kelamin", "Database", "Instansi", "Paket", "Status Progress", "Kelulusan"];
      const resultWideHeaders = exportParameters.map((param: any) => `Hasil - ${postName.get(Number(param.post_id)) || "Post"} - ${param.name}`);
      const doctorPostMapV187 = new Map<number, { id: number; name: string }>();
      exportParameters.forEach((param: any) => {
        const postId = Number(param.post_id);
        if (!postId || doctorPostMapV187.has(postId)) return;
        doctorPostMapV187.set(postId, { id: postId, name: String(postName.get(postId) || "Post") });
      });
      const doctorPostsV185 = Array.from(doctorPostMapV187.values());
      const doctorWideHeaders = doctorPostsV185.map((post: any) => `Dokter - ${post.name}`);
      const scoreWideHeaders = exportParameters.map((param: any) => `Skor - ${postName.get(Number(param.post_id)) || "Post"} - ${param.name}`);
      const domainHeaders = [
        "Skor Mata",
        "Skor Gigi Mulut",
        "Skor THT",
        "Skor Penyakit Dalam",
        "Skor Jantung Pembuluh Darah",
        "Skor Ortopedi",
        "Skor Radiologi",
      ];
      const infoHeaders = ["Red Flag", "Scoring Version", "Progress %"];
      const finalHeaders = ["Total Skor Akhir"];

      const wideRows = participantRows
        .filter((participant: any) => completedParticipantIds.has(Number(participant.id)))
        .map((participant: any) => {
          const progressInfo = completedProgressRows.find((row: any) => Number(row["Participant ID"]) === Number(participant.id));
          const row: any = {
            "Nama": participant.name,
            "No MCU": participant.mcu_id || participant.external_id || "-",
            "NIK": participant.nik || "-",
            "Asal Provinsi": participant.province || "-",
            "Jenis Kelamin": genderLabelStatusSheetV179(participant.gender || "-"),
            "Database": sourceMap.get(Number(participant.source_id))?.name || "-",
            "Instansi": sourceMap.get(Number(participant.source_id))?.institution_name || "-",
            "Paket": packageName.get(Number(participant.package_id)) || "-",
            "Status Progress": progressInfo?.["Status Progress"] || "Selesai",
            "Kelulusan": progressInfo?.["Kelulusan"] || "",
          };

          // DASHBOARD_EXPORT_WIDE_JUKNIS_SCORE_V322_INIT
          let wideScoreAdjustmentJuknisV321 = 0;
          // DASHBOARD_EXPORT_SUM_SCORES_V323_WIDE_SUM_INIT
          let wideScoreSumJuknisV323 = 0;
          const wideDomainScoreSumJuknisV323: any = {};
          const wideDomainAdjustmentJuknisV321: any = {};
          const wideRedFindingsJuknisV321: string[] = [];

          exportParameters.forEach((param: any) => {
            const postLabel = postName.get(Number(param.post_id)) || "Post";
            const valueHeader = `Hasil - ${postLabel} - ${param.name}`;
            const scoreHeader = `Skor - ${postLabel} - ${param.name}`;
            const result = resultByParticipantParam.get(makeKey(Number(participant.id), Number(param.id)));
            const value = String(result?.value ?? "").trim();
            row[valueHeader] = value;
            // DASHBOARD_EXPORT_WIDE_JUKNIS_SCORE_V321_PARAM_SCORE
            const paramTextWideV321 = `${postLabel} ${param.category || ""} ${param.name || ""}`;
            const stageKeyWideV321 = stageKeyFromPostStatusSheetV319(param, postName, paramTextWideV321);
            const baseScoreWideV321 = value ? scoreCapaskaDirectChoice(param, value) : "";
            const scoreWideV321 = scoreCapaskaExportJuknisV319(stageKeyWideV321, param, value, baseScoreWideV321);
            const scoreDeltaWideV321 = scoreDeltaExportJuknisV319(stageKeyWideV321, param, value, baseScoreWideV321, scoreWideV321);
            // DASHBOARD_EXPORT_SUM_SCORES_V323_WIDE_SUM_ADD
            const scoreNumWideV323 = numberFromStatusSheetV179(scoreWideV321);
            if (scoreNumWideV323 !== null) {
              wideScoreSumJuknisV323 += scoreNumWideV323;
              if (stageKeyWideV321) wideDomainScoreSumJuknisV323[stageKeyWideV321] = (wideDomainScoreSumJuknisV323[stageKeyWideV321] || 0) + scoreNumWideV323;
            }
            wideScoreAdjustmentJuknisV321 += scoreDeltaWideV321;
            if (stageKeyWideV321) wideDomainAdjustmentJuknisV321[stageKeyWideV321] = (wideDomainAdjustmentJuknisV321[stageKeyWideV321] || 0) + scoreDeltaWideV321;
            if (isJuknisRedFlagExportV319(stageKeyWideV321, param, value)) {
              const stageLabelWideV321 = STAGE_CONFIG_STATUS_SHEET_V179?.[stageKeyWideV321]?.label || postLabel;
              wideRedFindingsJuknisV321.push(`${stageLabelWideV321}: ${param.name}: ${value}`);
            }
            row[scoreHeader] = scoreWideV321;
          });

          doctorPostsV185.forEach((post: any) => {
            const names = staffByParticipantPostV185.get(makeKey(Number(participant.id), Number(post.id))) || [];
            row[`Dokter - ${post.name}`] = names.join(", ");
          });

          // DASHBOARD_EXPORT_WIDE_JUKNIS_SCORE_V321_DOMAIN_HELPER
          const addWideDomainScoreJuknisV321 = (base: any, stageKey: string) => {
            // DASHBOARD_EXPORT_SUM_SCORES_V323_WIDE_DOMAIN_SUM
            if (Object.prototype.hasOwnProperty.call(wideDomainScoreSumJuknisV323, stageKey)) return wideDomainScoreSumJuknisV323[stageKey];
            const baseNum = numberFromStatusSheetV179(base);
            const adj = wideDomainAdjustmentJuknisV321[stageKey] || 0;
            return baseNum !== null ? baseNum + adj : (base ?? "");
          };
          row["Skor Mata"] = addWideDomainScoreJuknisV321(progressInfo?.["Mata"], "mata");
          row["Skor Gigi Mulut"] = addWideDomainScoreJuknisV321(progressInfo?.["Gigi Mulut"], "gigi");
          row["Skor THT"] = addWideDomainScoreJuknisV321(progressInfo?.["THT"], "tht");
          row["Skor Penyakit Dalam"] = addWideDomainScoreJuknisV321(progressInfo?.["Penyakit Dalam"], "penyakit_dalam");
          row["Skor Jantung Pembuluh Darah"] = addWideDomainScoreJuknisV321(progressInfo?.["Jantung Pembuluh Darah"], "jantung");
          row["Skor Ortopedi"] = addWideDomainScoreJuknisV321(progressInfo?.["Ortopedi"], "ortopedi");
          row["Skor Radiologi"] = addWideDomainScoreJuknisV321(progressInfo?.["Radiologi"], "radiologi");
          // DASHBOARD_EXPORT_WIDE_JUKNIS_SCORE_V321_RED_FLAG
          const baseRedFlagWideV321 = String(progressInfo?.["Red Flag"] || "").trim();
          row["Red Flag"] = Array.from(new Set([baseRedFlagWideV321, ...wideRedFindingsJuknisV321].filter(Boolean))).join(" | ");
          row["Scoring Version"] = progressInfo?.["Scoring Version"] || "";
          row["Progress %"] = progressInfo?.["Progress %"] ?? 100;
          // Sengaja diletakkan paling akhir sesuai request.
          // DASHBOARD_EXPORT_WIDE_JUKNIS_SCORE_V321_TOTAL
          const totalScoreBaseWideV321 = numberFromStatusSheetV179(progressInfo?.["Total Score"]);
          // DASHBOARD_EXPORT_SUM_SCORES_V323_WIDE_TOTAL_SUM
          row["Total Skor Akhir"] = wideScoreSumJuknisV323 > 0 ? wideScoreSumJuknisV323 : (totalScoreBaseWideV321 !== null ? totalScoreBaseWideV321 + wideScoreAdjustmentJuknisV321 : (progressInfo?.["Total Score"] ?? ""));

          return row;
        });

      const wideWorksheet = makeGroupedWideSheet({
        rows: wideRows,
        identityHeaders,
        resultHeaders: resultWideHeaders,
        doctorHeaders: doctorWideHeaders,
        scoreHeaders: scoreWideHeaders,
        domainHeaders,
        infoHeaders,
        finalHeaders,
      });
      XLSX.utils.book_append_sheet(workbook, wideWorksheet, safeSheetName("Hasil Wide Selesai"));
      const capaskaStatusCatatanRowsV179 = buildCapaskaStatusCatatanRowsV179({
        participantRows: participantRows.filter((participant: any) => completedParticipantIds.has(Number(participant.id))),
        completedProgressRows,
        sourceMap,
        packageName,
        postName,
        exportParameters,
        resultByParticipantParam,
        makeKey,
        scoreCapaskaDirectChoice,
      });

      appendJsonSheet(
        workbook,
        capaskaStatusCatatanRowsV179,
        "Rekap Status & Catatan",
        CAPASKA_STATUS_CATATAN_HEADERS_V179
      );
    } else {
      const completedParticipantCodes = new Set(
        completedProgressRows.map((row: any) => String(row["No MCU"]))
      );

      const wideRows = participantRows
        .filter((participant: any) => {
          const participantCode = String(participant.mcu_id || participant.external_id || "-");
          return completedParticipantCodes.has(participantCode);
        })
        .map((participant: any) => {
          const participantCode = participant.mcu_id || participant.external_id || "-";
          const progressInfo = completedProgressRows.find((row: any) => String(row["No MCU"]) === String(participantCode));

          const row: any = {
            "Nama": participant.name,
            "No MCU": participantCode,
            "Database": sourceMap.get(Number(participant.source_id))?.name || "-",
            "Paket": packageName.get(Number(participant.package_id)) || "-",
            "Status Progress": progressInfo?.["Status Progress"] || "Selesai",
            "Kelulusan": progressInfo?.["Kelulusan"] || "",
            "Total Score": progressInfo?.["Total Score"] ?? "",
            "Progress %": progressInfo?.["Progress %"] ?? 100
          };

          (results.data || [])
            .filter((r: any) => Number(r.participant_id) === Number(participant.id))
            .forEach((r: any) => {
              const parameter = paramById.get(Number(r.parameter_id));
              const post = parameter ? postName.get(Number(parameter.post_id)) : "-";
              const key = `${post || "-"} - ${parameter?.name || r.parameter_id}`;
              row[key] = r.value ?? "";
            });

          return row;
        });

      appendJsonSheet(workbook, wideRows, "Hasil Wide Selesai");
    }
  }

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const filename = type === "full" ? "hasil-pemeriksaan-lengkap.xlsx" : "dashboard-progress-kelulusan.xlsx";

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
}


