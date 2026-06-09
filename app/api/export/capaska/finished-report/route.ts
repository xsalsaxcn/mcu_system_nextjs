import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail } from "@/lib/server/response";

export const runtime = "nodejs";

// CAPASKA_FINISHED_EXPORT_FULL_STATUS_NOTES_V184_CAPASKA_ONLY_TB_BB_TABLE_JUKNIS

function clean(value: any) {
  return String(value ?? "").trim();
}

function norm(value: any) {
  return clean(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value: any) {
  return clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toNumber(value: any): number | null {
  const text = clean(value).replace(",", ".");
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

function genderKey(value: any) {
  const text = norm(value);
  if (/^(l|lk|laki|laki laki|putra|pria|male|m)$/.test(text) || text.includes("laki") || text.includes("putra") || text.includes("pria")) return "putra";
  if (/^(p|pr|perempuan|putri|wanita|female|f|w)$/.test(text) || text.includes("perempuan") || text.includes("putri") || text.includes("wanita")) return "putri";
  return "";
}

function genderLabel(value: any) {
  const key = genderKey(value);
  if (key === "putra") return "PUTRA";
  if (key === "putri") return "PUTRI";
  return clean(value).toUpperCase();
}

function stageKeyFromText(value: any) {
  const text = norm(value);

  if (text.includes("mata") || text.includes("visus") || text.includes("buta warna")) return "mata";
  if (text.includes("tht") || text.includes("telinga") || text.includes("hidung") || text.includes("tenggorok") || text.includes("garputala")) return "tht";
  if (text.includes("gigi") || text.includes("mulut") || text.includes("panoramik") || text.includes("panoramic")) return "gigi";
  if (text.includes("penyakit dalam") || text.includes("abdomen") || text.includes("urogenital") || text.includes("dalam")) return "penyakit_dalam";
  if (text.includes("jantung") || text.includes("pembuluh darah") || text.includes("kardiovask")) return "jantung";
  if (text.includes("ortopedi") || text.includes("orthop") || text.includes("tulang") || text.includes("skoliosis") || text.includes("kifosis") || text.includes("lordosis")) return "ortopedi";
  if (text.includes("radiologi") || text.includes("radiology") || text.includes("thorax") || text.includes("rontgen") || text.includes("xray") || text.includes("x-ray")) return "radiologi";
  if (text.includes("tinggi") || text.includes("berat") || text === "tb" || text === "bb" || text.includes("data awal") || text.includes("registrasi")) return "data_awal";

  return "";
}

function isScoreOrAutoParam(param: any) {
  const name = norm(param?.name);
  const category = norm(param?.category);

  // Field "Value ..." adalah field angka untuk scoring otomatis, bukan catatan medis yang perlu tampil di export.
  if (name.startsWith("value ") || name.startsWith("nilai ")) return true;
  if (name.includes("skor") || name.includes("score") || name.includes("total")) return true;
  if (category.includes("skor") || category.includes("score")) return true;
  if (param?.type && norm(param.type).includes("auto")) return true;
  return false;
}

function isHeightParam(param: any) {
  const name = norm(param?.name);
  return name.includes("tinggi badan") || /\btb\b/.test(name);
}

function isWeightParam(param: any) {
  const name = norm(param?.name);
  return name.includes("berat badan") || /\bbb\b/.test(name);
}

function isNeutralValue(value: any) {
  const text = norm(value);
  if (!text) return true;

  const compact = text.replace(/\s+/g, "");
  if (compact === "-/-" || compact === "(-)/(-)") return true;

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
    "sesuai juknis",
    "sesuai",
    "t0 / t1-t1",
    "t0/t1-t1",
    "t0 / t1",
    "t0/t1",
    "6/6",
    "normal 6/6",
    "-/-",
    "(-)/(-)",
    "(-) / (-)",
    "( -) / ( -)",
    "(- ) / (- )",
    "( - ) / ( - )",
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

  // Mata: juling/strabismus -/- atau (-) / (-) berarti normal.
  if (/^\(?\s*-\s*\)?\s*\/\s*\(?\s*-\s*\)?$/.test(text)) return true;
  if (/(juling|strabismus)/.test(text) && (/\(?\s*-\s*\)?\s*\/\s*\(?\s*-\s*\)?/.test(text) || /(tidak ada|negatif|negative|normal)/.test(text))) return true;

  return false;
}

function resultSeverity(value: any, score?: number | null) {
  const text = norm(value);

  if (typeof score === "number" && score <= -10) return "red";
  if (text.includes("tidak direkomendasi") || text.includes("tidak direkomendasikan")) return "red";
  if (text.includes("red flag")) return "red";
  if (text.includes("buta warna") && !isNeutralValue(value)) return "red";
  if (text.includes("t3-t3") || text.includes("t3 / t3")) return "red";
  if (text.includes(">3 caries") || text.includes("> 3 caries") || text.includes(">3 karies")) return "red";
  if (/\b(caries|karies)\s*(4|5|6|7|8|9|10|11|12|13)\b/.test(text)) return "red";
  if (text.includes("hemorroid") || text.includes("hemoroid")) return "red";
  if (text.includes("hernia") || text.includes("undescensus") || text.includes("undecensus")) return "red";
  if (text.includes("striktur") || text.includes("prolaps")) return "red";
  if (text.includes("tidak sesuai juknis")) return "red";
  if (text.includes("kelainan darah") || text.includes("anemia")) return "red";
  if (text.includes("tidak intak") || text.includes("tidak normal")) return "red";

  if (typeof score === "number" && score < 0) return "yellow";
  if (!isNeutralValue(value) && text !== "sesuai") return "yellow";

  return "";
}

function cssStatus(status: string) {
  if (status === "Tidak Direkomendasikan") return "background:#ff0000;color:#ffffff;font-weight:bold;";
  if (status === "Dengan Catatan") return "background:#fff200;color:#111827;font-weight:bold;";
  if (status === "Normal") return "background:#e8fff4;color:#065f46;font-weight:bold;";
  return "";
}

function pairKeyForControlParam(param: any) {
  const name = norm(param?.name);

  if (!name) return "";
  if (name.startsWith("value ") || name.startsWith("nilai ")) return "";

  if (name.includes("berat badan")) return "bb";
  if (name === "bb" || /^bb\b/.test(name)) return "bb";
  if (name.includes("tinggi badan")) return "tb";
  if (name === "tb" || /^tb[\s.(]/.test(name) || name.includes("tb.")) return "tb";
  if (name === "tanda vital") return "tanda_vital";
  if (name.includes("dental panoramic")) return "dental_panoramic";

  return "";
}

function pairKeyForDetailParam(param: any) {
  const name = norm(param?.name);

  if (!name) return "";
  if (name.startsWith("value ") || name.startsWith("nilai ")) return "";

  if (name === "bb" || /^bb\b/.test(name)) return "bb";
  if (name === "tb" || /^tb[\s.(]/.test(name) || name.includes("tb.")) return "tb";
  if (name.includes("suhu") && name.includes("nadi")) return "tanda_vital";
  if (name.includes("bentuk kelainan dental")) return "dental_panoramic";

  return "";
}

function pairKeyForScoreParam(param: any) {
  const name = norm(param?.name);

  if (!name) return "";
  if (!name.startsWith("value ") && !name.startsWith("nilai ")) return "";

  const base = name.replace(/^(value|nilai)\s+/, "");
  if (base.includes("berat badan")) return "bb";
  if (base === "bb" || /^bb\b/.test(base)) return "bb";
  if (base.includes("tinggi badan")) return "tb";
  if (base === "tb" || /^tb[\s.(]/.test(base) || base.includes("tb.")) return "tb";

  return "";
}

function isPairedDetailParam(param: any) {
  return Boolean(pairKeyForDetailParam(param));
}

function sortItemsByParam(items: any[]) {
  return [...(items || [])].sort((a: any, b: any) => {
    const sa = Number(a?.param?.sort_order || 0);
    const sb = Number(b?.param?.sort_order || 0);
    if (sa !== sb) return sa - sb;
    return Number(a?.param?.id || 0) - Number(b?.param?.id || 0);
  });
}

function stageSeverity(stageKey: string, items: any[]) {
  let hasYellow = false;

  for (const item of items) {
    if (isScoreOrAutoParam(item.param)) {
      // Score BB/TB dievaluasi di kolom STATUS TB/BB, bukan sebagai catatan Penyakit Dalam.
      const scorePairKey = pairKeyForScoreParam(item.param);
      if (scorePairKey === "bb" || scorePairKey === "tb") continue;

      const n = toNumber(item.value);
      if (typeof n === "number" && n <= -10) return "red";
      if (typeof n === "number" && n < 0) hasYellow = true;
      continue;
    }

    // Field detail seperti BB, TB, dan Suhu/Nadi hanya boleh muncul jika single choice induknya bermasalah.
    // Jadi field detail sendiri tidak boleh membuat status stage menjadi catatan.
    if (isPairedDetailParam(item.param)) continue;

    // BB/TB dievaluasi di kolom STATUS TB/BB, bukan di STATUS PENYAKIT DALAM.
    const controlKey = pairKeyForControlParam(item.param);
    if (controlKey === "bb" || controlKey === "tb") continue;

    const severity = resultSeverity(item.value, null);
    if (severity === "red") return "red";
    if (severity === "yellow") hasYellow = true;
  }

  return hasYellow ? "yellow" : "";
}

function stageSummary(stageKey: string, items: any[]) {
  const findings: string[] = [];
  const sortedItems = sortItemsByParam(items);
  const detailsByKey = new Map<string, any>();

  for (const item of sortedItems) {
    if (isScoreOrAutoParam(item.param)) continue;

    const key = pairKeyForDetailParam(item.param);
    const valueText = clean(item.value);
    if (!key || !valueText) continue;

    detailsByKey.set(key, item);
  }

  for (const item of sortedItems) {
    const value = clean(item.value);
    if (!value) continue;

    const paramName = clean(item.param?.name);
    const valueText = clean(value);

    if (isScoreOrAutoParam(item.param)) continue;

    // Field detail tidak berdiri sendiri sebagai catatan; ia hanya dipakai saat single choice induknya abnormal.
    if (isPairedDetailParam(item.param)) continue;

    const controlKey = pairKeyForControlParam(item.param);

    // BB/TB punya kolom khusus STATUS TB/BB dan CATATAN TB/BB, jadi jangan dobel masuk ke Penyakit Dalam.
    if (controlKey === "bb" || controlKey === "tb") continue;

    if (stageKey === "mata") {
      if (/visus|vod|vos|tajam/i.test(paramName) && valueText) {
        if (!isNeutralValue(valueText)) findings.push(valueText);
        continue;
      }
    }

    // Jika single choice normal / sesuai juknis, catatan harus kosong.
    // Catatan hanya diisi dari single choice yang bermasalah.
    if (isNeutralValue(valueText)) continue;

    let noteLabel = paramName;
    let noteValue = valueText;

    // Untuk parameter yang punya field detail, tampilkan value/detail-nya hanya jika pilihan induknya bermasalah.
    if (controlKey) {
      const detail = detailsByKey.get(controlKey);
      const detailValue = clean(detail?.value);
      if (detailValue) {
        noteLabel = clean(detail?.param?.name) || paramName;
        noteValue = detailValue;
      }
    }

    if (noteLabel) findings.push(noteLabel + ": " + noteValue);
    else findings.push(noteValue);
  }

  const unique = Array.from(new Set(findings.map((x) => x.trim()).filter(Boolean)));
  return unique.length ? unique.join("; ") : "Normal";
}

const STAGE_MAX_SCORE_V178: Record<string, number> = {
  mata: 12,
  tht: 10,
  gigi: 16,
  penyakit_dalam: 28,
  jantung: 12,
  ortopedi: 16,
  radiologi: 6,
};

function stageDisplayLabel(stageKey: string) {
  const labels: Record<string, string> = {
    mata: "Mata",
    tht: "THT",
    gigi: "Gigi",
    penyakit_dalam: "Penyakit Dalam",
    jantung: "Jantung",
    ortopedi: "Ortopedi",
    radiologi: "Radiologi",
    tb_bb: "TB/BB",
  };
  return labels[stageKey] || stageKey;
}

function stageScore(items: any[]) {
  const totals: number[] = [];

  for (const item of items || []) {
    const name = norm(item.param?.name);
    const category = norm(item.param?.category);
    if (!name.includes("total") && !name.includes("score") && !name.includes("skor") && !category.includes("score") && !category.includes("skor")) continue;

    const n = toNumber(item.value);
    if (typeof n === "number") totals.push(n);
  }

  if (!totals.length) return null;
  if (totals.length === 1) return totals[0];
  return totals.reduce((sum, value) => sum + value, 0);
}

function splitNotes(summary: string) {
  const text = clean(summary);
  if (!text || text === "Normal") return [];
  return text
    .split(/\s*;\s*|\s*\|\s*/g)
    .map((x) => clean(x))
    .filter(Boolean);
}

function stageStatusAndNotes(stageKey: string, items: any[], summary: string, severity: string) {
  const notes = splitNotes(summary);
  const score = stageScore(items);
  const maxScore = STAGE_MAX_SCORE_V178[stageKey];

  if (severity === "red") {
    return {
      status: "Tidak Direkomendasikan",
      note: notes.length ? notes.join("; ") : "Ada red flag / skor -10",
      score,
      maxScore: maxScore || "",
    };
  }

  if (severity === "yellow" || notes.length) {
    return {
      status: "Dengan Catatan",
      note: notes.length ? notes.join("; ") : "Ada temuan ringan/catatan",
      score,
      maxScore: maxScore || "",
    };
  }

  return {
    status: "Normal",
    note: "",
    score,
    maxScore: maxScore || "",
  };
}


function formatDeltaCapaskaJuknisV184(value: number, unit: "cm" | "kg") {
  const absValue = Math.abs(value);
  const rounded = Math.round(absValue);
  const display = rounded >= 1 ? String(rounded) : String(Math.round(absValue * 10) / 10).replace(".", ",");
  return display + unit;
}

function statusTbBb(height: any, weight: any, gender: any) {
  const h = toNumber(height);
  const w = toNumber(weight);
  const g = genderKey(gender);

  if (!h || !w || !g) return "";

  const minHeight = g === "putra" ? 170 : 165;
  const maxHeight = g === "putra" ? 180 : 175;

  // Referensi tabel juknis CAPASKA:
  // Putra: TB 170-180 cm, BB per TB = TB-115 s.d. TB-105 kg.
  // Putri: TB 165-175 cm, BB per TB = TB-115 s.d. TB-105 kg.
  // Untuk TB desimal, batas BB mengikuti rumus tabel yang sama agar tetap presisi.
  const minWeight = h - 115;
  const maxWeight = h - 105;
  const issues: string[] = [];

  if (h < minHeight) issues.push(`TB < ${formatDeltaCapaskaJuknisV184(minHeight - h, "cm")}`);
  if (h > maxHeight) issues.push(`TB > ${formatDeltaCapaskaJuknisV184(h - maxHeight, "cm")}`);
  if (w < minWeight) issues.push(`BB < ${formatDeltaCapaskaJuknisV184(minWeight - w, "kg")}`);
  if (w > maxWeight) issues.push(`BB > ${formatDeltaCapaskaJuknisV184(w - maxWeight, "kg")}`);

  return issues.length ? `Tidak sesuai Juknis : ${issues.join("; ")}` : "Sesuai Juknis";
}

function tbBbStatusAndNote(tbBbStatus: string) {
  const text = clean(tbBbStatus);
  const normalized = norm(text);
  if (!text || normalized === "sesuai" || normalized === "sesuai juknis") return { status: "Normal", note: "" };
  return { status: "Dengan Catatan", note: text };
}

function totalScoreFromItems(items: any[]) {
  const totalValues: number[] = [];

  for (const item of items) {
    const name = norm(item.param?.name);
    if (!name.includes("total")) continue;
    const n = toNumber(item.value);
    if (typeof n === "number") totalValues.push(n);
  }

  if (totalValues.length === 1) return totalValues[0];
  if (totalValues.length > 1) return totalValues.reduce((a, b) => a + b, 0);

  return "";
}

function isParticipantCompleted(items: any[]) {
  const required = ["mata", "tht", "gigi", "penyakit_dalam", "jantung", "ortopedi", "radiologi"];
  const seen = new Set<string>();

  for (const item of items) {
    if (!clean(item.value)) continue;
    const stage = stageKeyFromText(`${item.param?.category || ""} ${item.postName || ""} ${item.param?.name || ""}`);
    if (stage) seen.add(stage);
  }

  return required.every((key) => seen.has(key));
}

function buildWorkbookHtml(rows: any[], meta: any) {
  const headerStyle = "background:#1f4e79;color:#ffffff;font-weight:bold;text-align:center;border:1px solid #111827;";
  const cellStyle = "border:1px solid #9ca3af;mso-number-format:'\\@';vertical-align:top;";
  const centerStyle = cellStyle + "text-align:center;";
  const titleStyle = "font-size:18pt;font-weight:bold;text-align:center;background:#ffffff;";
  const infoStyle = "font-weight:bold;background:#eef6ff;border:1px solid #dbeafe;";

  const columns: [string, string][] = [
    ["NO", "no"],
    ["PROVINSI", "province"],
    ["JENIS KELAMIN", "gender"],
    ["MCU ID / NO PESERTA", "mcu_id"],
    ["NAMA", "name"],
    ["TINGGI BADAN", "height"],
    ["BERAT BADAN", "weight"],
    ["STATUS TB/BB", "tb_bb_status_label"],
    ["CATATAN TB/BB", "tb_bb_note"],
    ["STATUS MATA", "mata_status"],
    ["CATATAN MATA", "mata_note"],
    ["STATUS THT", "tht_status"],
    ["CATATAN THT", "tht_note"],
    ["STATUS GIGI", "gigi_status"],
    ["CATATAN GIGI", "gigi_note"],
    ["STATUS PENYAKIT DALAM", "penyakit_dalam_status"],
    ["CATATAN PENYAKIT DALAM", "penyakit_dalam_note"],
    ["STATUS JANTUNG", "jantung_status"],
    ["CATATAN JANTUNG", "jantung_note"],
    ["STATUS ORTOPEDI", "ortopedi_status"],
    ["CATATAN ORTOPEDI", "ortopedi_note"],
    ["STATUS RADIOLOGI", "radiologi_status"],
    ["CATATAN RADIOLOGI", "radiologi_note"],
    ["TOTAL SKOR", "total_score"],
    ["STATUS AKHIR", "final_status"],
    ["RINGKASAN CATATAN", "all_notes"],
    ["TEMUAN MERAH / RED FLAG", "red_findings"],
  ];

  const colgroup = columns.map((_, i) => {
    const widths = [45, 150, 100, 150, 240, 90, 90, 140, 260, 130, 260, 130, 260, 130, 260, 160, 300, 140, 260, 140, 260, 140, 260, 90, 160, 420, 360];
    return `<col style="width:${widths[i] || 140}px" />`;
  }).join("");

  const dataRows = rows.map((row) => {
    const tds = columns.map(([_, key]) => {
      let style = cellStyle;
      if (["no", "gender", "height", "weight", "total_score", "final_status"].includes(key)) style = centerStyle;

      if (key.endsWith("_status") || key === "tb_bb_status_label" || key === "final_status") {
        style += cssStatus(String(row[key] || ""));
      }

      if (key.endsWith("_note") && row[key]) {
        const statusKey = key.replace("_note", "_status");
        if (key === "tb_bb_note") style += cssStatus("Dengan Catatan");
        else style += String(row[statusKey] || "").includes("Tidak Direkomendasikan") ? cssStatus("Tidak Direkomendasikan") : cssStatus("Dengan Catatan");
      }

      if (key === "all_notes" && row.all_notes) style += "background:#fff7cc;color:#111827;font-weight:bold;";
      if (key === "red_findings" && row.red_findings) style += cssStatus("Tidak Direkomendasikan");

      return `<td style="${style}">${escapeHtml(row[key])}</td>`;
    }).join("");

    return `<tr>${tds}</tr>`;
  }).join("\n");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  table { border-collapse: collapse; font-family: Calibri, Arial, sans-serif; font-size: 11pt; }
  td, th { padding: 5px; }
</style>
</head>
<body>
<table>
  <colgroup>${colgroup}</colgroup>
  <tr><td colspan="${columns.length}" style="${titleStyle}">LAPORAN VERIFIKASI KESEHATAN CAPASKA</td></tr>
  <tr><td colspan="${columns.length}" style="${titleStyle}">REKAP PESERTA SELESAI</td></tr>
  <tr><td colspan="3" style="${infoStyle}">Database / Source ID</td><td colspan="${columns.length - 3}" style="${cellStyle}">${escapeHtml(meta.source_id)}</td></tr>
  <tr><td colspan="3" style="${infoStyle}">Tanggal Export</td><td colspan="${columns.length - 3}" style="${cellStyle}">${escapeHtml(meta.exported_at)}</td></tr>
  <tr><td colspan="3" style="${infoStyle}">Total Peserta</td><td colspan="${columns.length - 3}" style="${cellStyle}">${escapeHtml(rows.length)}</td></tr>
  <tr><td colspan="${columns.length}" style="${cellStyle}"></td></tr>
  <tr>${columns.map(([label]) => `<th style="${headerStyle}">${escapeHtml(label)}</th>`).join("")}</tr>
  ${dataRows || `<tr><td colspan="${columns.length}" style="${cellStyle};text-align:center;">Tidak ada peserta untuk diexport.</td></tr>`}
</table>
</body>
</html>`;
}

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user || user.role !== "admin") return fail("Unauthorized", 401);

  const url = new URL(req.url);
  const sourceId = Number(url.searchParams.get("source_id") || 0);
  const includeAll = url.searchParams.get("all") === "1";

  if (!sourceId) return fail("source_id wajib.");

  const supabase = getSupabaseAdmin();

  const { data: participants, error: participantError } = await supabase
    .from("participants")
    .select("id,name,mcu_id,external_id,gender,province,source_id,package_id,program_type,created_at")
    .eq("source_id", sourceId)
    .order("province", { ascending: true })
    .order("gender", { ascending: true })
    .order("name", { ascending: true })
    .limit(5000);

  if (participantError) return fail(participantError.message, 500);

  const participantIds = (participants || []).map((p: any) => Number(p.id)).filter(Boolean);

  const paramsMeta = {
    source_id: sourceId,
    exported_at: new Date().toLocaleString("id-ID"),
  };

  if (!participantIds.length) {
    const html = buildWorkbookHtml([], paramsMeta);
    return new Response(html, {
      headers: {
        "Content-Type": "application/vnd.ms-excel; charset=utf-8",
        "Content-Disposition": `attachment; filename="CAPASKA_Rekap_Peserta_Selesai_Source_${sourceId}.xls"`,
      },
    });
  }

  const { data: params, error: paramsError } = await supabase
    .from("parameters")
    .select("id,name,category,post_id,type,sort_order,is_active")
    .order("post_id", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (paramsError) return fail(paramsError.message, 500);

  const postIds = Array.from(new Set((params || []).map((p: any) => Number(p.post_id)).filter(Boolean)));
  let postsById = new Map<number, string>();

  if (postIds.length) {
    const { data: posts } = await supabase
      .from("posts")
      .select("id,name")
      .in("id", postIds);

    postsById = new Map((posts || []).map((p: any) => [Number(p.id), clean(p.name)]));
  }

  const paramById = new Map<number, any>();
  for (const p of params || []) paramById.set(Number(p.id), p);

  const allResults: any[] = [];
  const chunkSize = 500;

  for (let i = 0; i < participantIds.length; i += chunkSize) {
    const chunk = participantIds.slice(i, i + chunkSize);
    const { data: results, error: resultsError } = await supabase
      .from("examination_results")
      .select("participant_id,parameter_id,value")
      .in("participant_id", chunk);

    if (resultsError) return fail(resultsError.message, 500);
    allResults.push(...(results || []));
  }

  const resultsByParticipant = new Map<number, any[]>();

  for (const result of allResults) {
    const participantId = Number(result.participant_id);
    const param = paramById.get(Number(result.parameter_id));
    if (!param) continue;

    const item = {
      ...result,
      param,
      postName: postsById.get(Number(param.post_id)) || "",
    };

    if (!resultsByParticipant.has(participantId)) resultsByParticipant.set(participantId, []);
    resultsByParticipant.get(participantId)!.push(item);
  }

  const rows: any[] = [];

  for (const participant of participants || []) {
    const items = resultsByParticipant.get(Number(participant.id)) || [];
    if (!includeAll && !isParticipantCompleted(items)) continue;

    const byStage: Record<string, any[]> = {
      mata: [],
      tht: [],
      gigi: [],
      penyakit_dalam: [],
      jantung: [],
      ortopedi: [],
      radiologi: [],
      data_awal: [],
    };

    let height = "";
    let weight = "";

    for (const item of items) {
      const stage = stageKeyFromText(`${item.param?.category || ""} ${item.postName || ""} ${item.param?.name || ""}`) || "data_awal";
      if (byStage[stage]) byStage[stage].push(item);

      if (isHeightParam(item.param) && toNumber(item.value) !== null) height = clean(item.value);
      if (isWeightParam(item.param) && toNumber(item.value) !== null) weight = clean(item.value);
    }

    const summaries = {
      mata: stageSummary("mata", byStage.mata),
      tht: stageSummary("tht", byStage.tht),
      gigi: stageSummary("gigi", byStage.gigi),
      penyakit_dalam: stageSummary("penyakit_dalam", byStage.penyakit_dalam),
      jantung: stageSummary("jantung", byStage.jantung),
      ortopedi: stageSummary("ortopedi", byStage.ortopedi),
      radiologi: stageSummary("radiologi", byStage.radiologi),
    };

    const severities = {
      mata: stageSeverity("mata", byStage.mata),
      tht: stageSeverity("tht", byStage.tht),
      gigi: stageSeverity("gigi", byStage.gigi),
      penyakit_dalam: stageSeverity("penyakit_dalam", byStage.penyakit_dalam),
      jantung: stageSeverity("jantung", byStage.jantung),
      ortopedi: stageSeverity("ortopedi", byStage.ortopedi),
      radiologi: stageSeverity("radiologi", byStage.radiologi),
    };

    const tbBb = statusTbBb(height, weight, participant.gender);
    const tbBbEval = tbBbStatusAndNote(tbBb);

    const stageEvaluations = {
      mata: stageStatusAndNotes("mata", byStage.mata, summaries.mata, severities.mata),
      tht: stageStatusAndNotes("tht", byStage.tht, summaries.tht, severities.tht),
      gigi: stageStatusAndNotes("gigi", byStage.gigi, summaries.gigi, severities.gigi),
      penyakit_dalam: stageStatusAndNotes("penyakit_dalam", byStage.penyakit_dalam, summaries.penyakit_dalam, severities.penyakit_dalam),
      jantung: stageStatusAndNotes("jantung", byStage.jantung, summaries.jantung, severities.jantung),
      ortopedi: stageStatusAndNotes("ortopedi", byStage.ortopedi, summaries.ortopedi, severities.ortopedi),
      radiologi: stageStatusAndNotes("radiologi", byStage.radiologi, summaries.radiologi, severities.radiologi),
    };

    const redFindings: string[] = [];
    const allNotes: string[] = [];

    if (tbBbEval.note) allNotes.push(`TB/BB: ${tbBbEval.note}`);

    for (const [stage, evaluation] of Object.entries(stageEvaluations)) {
      const label = stageDisplayLabel(stage);
      if (evaluation.note) {
        const noteText = `${label}: ${evaluation.note}`;
        allNotes.push(noteText);
        if (evaluation.status === "Tidak Direkomendasikan") redFindings.push(noteText);
      }
    }

    const totalScore = totalScoreFromItems(items);
    const hasRed = redFindings.length > 0;
    const hasNotes = allNotes.length > 0;
    const finalStatus = hasRed ? "Tidak Direkomendasikan" : hasNotes ? "Dengan Catatan" : "Normal";

    rows.push({
      no: rows.length + 1,
      province: clean(participant.province),
      gender: genderLabel(participant.gender),
      mcu_id: clean(participant.mcu_id || participant.external_id || participant.id),
      name: clean(participant.name),
      height,
      weight,
      tb_bb_status_label: tbBbEval.status,
      tb_bb_note: tbBbEval.note,
      mata_status: stageEvaluations.mata.status,
      mata_note: stageEvaluations.mata.note,
      tht_status: stageEvaluations.tht.status,
      tht_note: stageEvaluations.tht.note,
      gigi_status: stageEvaluations.gigi.status,
      gigi_note: stageEvaluations.gigi.note,
      penyakit_dalam_status: stageEvaluations.penyakit_dalam.status,
      penyakit_dalam_note: stageEvaluations.penyakit_dalam.note,
      jantung_status: stageEvaluations.jantung.status,
      jantung_note: stageEvaluations.jantung.note,
      ortopedi_status: stageEvaluations.ortopedi.status,
      ortopedi_note: stageEvaluations.ortopedi.note,
      radiologi_status: stageEvaluations.radiologi.status,
      radiologi_note: stageEvaluations.radiologi.note,
      total_score: totalScore,
      final_status: finalStatus,
      all_notes: allNotes.join(" | "),
      red_findings: redFindings.join(" | "),
    });
  }

  rows.sort((a, b) =>
    String(a.province).localeCompare(String(b.province), "id") ||
    String(a.gender).localeCompare(String(b.gender), "id") ||
    String(a.name).localeCompare(String(b.name), "id")
  );

  rows.forEach((row, index) => {
    row.no = index + 1;
  });

  const html = buildWorkbookHtml(rows, paramsMeta);
  const suffix = includeAll ? "Semua_Peserta" : "Peserta_Selesai";
  const filename = `CAPASKA_Rekap_${suffix}_Source_${sourceId}.xls`;

  return new Response(html, {
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
