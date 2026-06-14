export const CAPASKA_SCORING_VERSION = "CAPASKA_SCORING_2026_BACKEND_DIRECT_OPTION_V45";
// CAPASKA THT domain alias fix v163

export type CapaskaDomainKey =
  | "mata"
  | "gigi_mulut"
  | "tht"
  | "penyakit_dalam"
  | "jantung_pembuluh_darah"
  | "ortopedi"
  | "radiologi";

export type CapaskaScoringResult = {
  version: string;
  totalScore: number | null;
  totalBeforePenalty: number | null;
  penalty: number;
  notRecommended: boolean;
  redFlags: string[];
  domainScores: Record<string, number>;
  rawDomainScores: Record<string, number>;
  domainMaxScores: Record<string, number>;
};

export type CapaskaScoringOption = {
  label: string;
  value: string;
  score?: number | null;
  is_critical?: boolean;
  note?: string;
};

export type CapaskaScoringConfig = {
  options: CapaskaScoringOption[];
  max_score?: number | null;
  scoring_type?: string;
  include_in_total_score?: boolean;
};

type DomainRule = {
  key: CapaskaDomainKey;
  label: string;
  maxScore: number;
  totalParameterName: string;
  components: string[];
};

type ScoreRule = {
  score: number;
  critical?: boolean;
  note?: string;
};

function roundScore(value: number) {
  return Math.round(value * 100) / 100;
}

function parseNumber(value: any): number | null {
  if (value === null || value === undefined) return null;

  const cleaned = String(value)
    .replace(",", ".")
    .replace(/[^0-9.\-]/g, "")
    .trim();

  if (!cleaned) return null;

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function normalizeCapaskaKey(text: any) {
  return String(text || "")
    .toLowerCase()
    .replace(/\(\s*\+\s*\)/g, "positif")
    .replace(/\(\s*-\s*\)/g, "negatif")
    .replace(/â‰¥/g, "gte")
    .replace(/â‰¤/g, "lte")
    .replace(/>=/g, "gte")
    .replace(/<=/g, "lte")
    .replace(/>/g, "gt")
    .replace(/</g, "lt")
    .replace(/[\s\n\r\t.,\-_\/\\:;()\[\]+]/g, "");
}

function scoreKey(parameterName: string, selectedValue: string) {
  return `${normalizeCapaskaKey(parameterName)}::${normalizeCapaskaKey(selectedValue)}`;
}

function addRule(
  target: Record<string, ScoreRule>,
  parameterNames: string | string[],
  selectedValues: string | string[],
  score: number,
  critical = false,
  note = ""
) {
  const names = Array.isArray(parameterNames) ? parameterNames : [parameterNames];
  const values = Array.isArray(selectedValues) ? selectedValues : [selectedValues];

  for (const name of names) {
    for (const value of values) {
      target[scoreKey(name, value)] = { score, critical, note };
    }
  }
}

function buildBuiltinScoreRules() {
  const rules: Record<string, ScoreRule> = {};

  // MATA, max 12.
  addRule(rules, ["Lensakontak/ kaca mata", "Lensakontak / kaca mata"], "Tidak menggunakan", 3);
  addRule(rules, ["Lensakontak/ kaca mata", "Lensakontak / kaca mata"], "Menggunakan", -1);
  addRule(rules, "Tes buta warna", "Tidak buta warna", 3);
  addRule(rules, "Tes buta warna", ["Buta warna parsial", "Buta warna total"], -10, true);
  addRule(rules, "Strabismus / Juling", ["(-) / (-)", "(-)/(-)", "Negatif", "Tidak ada"], 3);
  addRule(rules, "Strabismus / Juling", ["(+) / (-)", "(-) / (+)", "(+) / (+)", "(+)/(-)", "(-)/(+)", "(+)/(+)", "Positif", "Ada"], -5);
  addRule(rules, ["Pemeriksaan Visus OD / OS", "Pemeriksaan Visus OD  / OS"], ["Normal 6/6", "Normal >= 6/6", "Normal â‰¥ 6/6"], 3);
  addRule(rules, ["Pemeriksaan Visus OD / OS", "Pemeriksaan Visus OD  / OS"], ["<6/6 - 6/12", "<6/6-6/12", "<6/6 sampai 6/12"], 2);
  addRule(rules, ["Pemeriksaan Visus OD / OS", "Pemeriksaan Visus OD  / OS"], "<6/12", -10, true);

  // GIGI, max 16.
  addRule(rules, "Karang Gigi", ["Negative", "Negatif", "(-)", "Tidak ada"], 2);
  addRule(rules, "Karang Gigi", ["Positive", "Positif", "(+)", "Ada"], -1);
  addRule(rules, "Caries Dentis", "0 caries", 3);
  addRule(rules, "Caries Dentis", "1 caries", -1);
  addRule(rules, "Caries Dentis", "2 caries", -2);
  addRule(rules, "Caries Dentis", "3 caries", -3);
  addRule(rules, "Caries Dentis", ">3 caries", -10, true);
  addRule(rules, "Tumpatan Gigi", "0 tumpatan", 2);
  addRule(rules, "Tumpatan Gigi", ["<=5 tumpatan", "â‰¤5 tumpatan", "<5 tumpatan", "<3 tumpatan"], 1);
  addRule(rules, "Tumpatan Gigi", [">5 tumpatan", ">3 tumpatan"], -5);
  addRule(rules, ["Impaksi gigi", "Impaksi gigi depan"], "0 gigi", 3);
  addRule(rules, ["Impaksi gigi", "Impaksi gigi depan"], "1 gigi", 2);
  addRule(rules, ["Impaksi gigi", "Impaksi gigi depan"], ["2 gigi", "2 gigi impaksi / impaksi 1 gigi depan"], 1);
  addRule(rules, ["Impaksi gigi", "Impaksi gigi depan"], [">2 gigi", ">2 gigi impaksi", ">2 gigi impaksi atau 2 gigi depan impaksi"], -5);
  addRule(rules, ["Impaksi gigi", "Impaksi gigi depan"], [">=4 gigi", "â‰¥4 gigi"], -10, true);
  addRule(rules, ["Kehilangan Gigi (Baik depan maupun belakang)", "Kehilangan Gigi bagian depan", "Kehilangan Gigi Bagian depan"], "0 gigi", 2);
  addRule(rules, ["Kehilangan Gigi (Baik depan maupun belakang)", "Kehilangan Gigi bagian depan", "Kehilangan Gigi Bagian depan"], "1 gigi", 1);
  addRule(rules, ["Kehilangan Gigi (Baik depan maupun belakang)", "Kehilangan Gigi bagian depan", "Kehilangan Gigi Bagian depan"], "2 gigi", 0);
  addRule(rules, ["Kehilangan Gigi (Baik depan maupun belakang)", "Kehilangan Gigi bagian depan", "Kehilangan Gigi Bagian depan"], ">2 gigi", -10, true);
  addRule(rules, "Infeksi Gusi", ["Negative", "Negatif", "(-)", "Tidak ada"], 1);
  addRule(rules, "Infeksi Gusi", ["Positive", "Positif", "(+)", "Ada"], -1);
  addRule(rules, ["Dental panoramic", "Dental panoramik"], "Normal", 3);
  addRule(rules, ["Dental panoramic", "Dental panoramik"], "ditemukan kelainan", -1);

  // THT, max 10.
  addRule(rules, "Membran timpani", "Intak", 2);
  addRule(rules, "Membran timpani", ["Tidak Intak", "Tidak intak"], -10, true);
  addRule(rules, "Serumen", "Tidak ada", 2);
  addRule(rules, "Serumen", "Ada serumen", 1);
  addRule(rules, "Tonsil", ["T0 - T1", "T0-T1", "T0 / T1-T1", "T0: T1-T1"], 2);
  addRule(rules, "Tonsil", ["Sudah tonsilektomi", "tonsilektomi"], 2);
  addRule(rules, "Tonsil", ["T0 - T2a", "T2a-T2a", "T0: T2a-T2a"], 1);
  addRule(rules, "Tonsil", ["T0 - T2b", "T2b-T2b", "T0: T2b-T2b"], -1);
  addRule(rules, "Tonsil", ["T2 - T3", "T3-T3", "T0: T3-T3"], -10, true);
  addRule(rules, ["Rhinitis Alergi (divide)", "Rhinitis Alergi (lividae)", "Rhinitis Alergi (dividae)", "Rhinitis Alergi (Bividas)", "Rhinitis alergi / lividae"], ["Negative", "Negatif", "(-)"], 2);
  addRule(rules, ["Rhinitis Alergi (divide)", "Rhinitis Alergi (lividae)", "Rhinitis Alergi (dividae)", "Rhinitis Alergi (Bividas)", "Rhinitis alergi / lividae"], ["Positive", "Positif", "(+)"], 1);
  addRule(rules, "Epistaksis 1 tahun terakhir", "Tidak Ada", 1);
  addRule(rules, "Epistaksis 1 tahun terakhir", "Ada", -1);
  addRule(rules, ["Tes Garputala (Weber) 512 Hz", "Tes Garputala Weber 512 Hz", "Tes Garputala (Weber) 512Hz", "Tes Garputala / Weber 512 Hz"], "Normal", 1);
  addRule(rules, ["Tes Garputala (Weber) 512 Hz", "Tes Garputala Weber 512 Hz", "Tes Garputala (Weber) 512Hz", "Tes Garputala / Weber 512 Hz"], "Tidak Normal", -10, true);

  // PENYAKIT DALAM, max 28.
  addRule(rules, ["Berat Badan (Kg)", "BB. (Kg)", "BB (Kg)"], "Sesuai juknis", 1);
  addRule(rules, ["Berat Badan (Kg)", "BB. (Kg)", "BB (Kg)"], "Tidak sesuai juknis", -10, true);
  addRule(rules, ["TB. (Cm)", "Tb (Cm)", "TB (Cm)"], "Sesuai juknis", 1);
  addRule(rules, ["TB. (Cm)", "Tb (Cm)", "TB (Cm)"], "Tidak sesuai juknis", -10, true);
  addRule(rules, "Tanda Vital", "Normal", 2);
  addRule(rules, "Tanda Vital", "Tidak Normal", 1);
  addRule(rules, "Tato kulit", "Tidak ada tato", 1);
  addRule(rules, "Tato kulit", "Ada tato", -10, true);
  addRule(rules, "Tindik (selain anting) Wanita : hanya 1 / telinga", ["Tidak ada", "Wanita hanya 1 / telinga", "Wanita hanya 1/telinga"], 1);
  addRule(rules, "Tindik (selain anting) Wanita : hanya 1 / telinga", ["Ada (pria) Wanita >1)", "Ada (pria)", "Wanita >1"], -10, true);
  addRule(rules, ["Pemeriksaan Fisik Jantung", "Pemeriksaan Fisik Paru"], "Normal", 2);
  addRule(rules, ["Pemeriksaan Fisik Jantung", "Pemeriksaan Fisik Paru"], "Tidak Normal", 1);

  addRule(rules, "Hernia", ["Tidak ada", "Tidak Ada", "Normal"], 1);
  addRule(rules, "Hernia", ["Ada", "Tidak Normal"], -10, true);
  addRule(rules, ["NT Epigastrum", "NT Epigastrium", "Liver", "Bising Usus", "Bekas Operasi (>6Bulan)", "Bekas operasi (>3bulan)", "Bekas operasi (>6bulan)"], "Normal", 1);
  addRule(rules, ["NT Epigastrum", "NT Epigastrium", "Liver", "Bising Usus", "Bekas Operasi (>6Bulan)", "Bekas operasi (>3bulan)", "Bekas operasi (>6bulan)"], "Tidak Normal", -2);
  addRule(rules, ["Benjolan", "Benjolan / Tumor", "Benjolan/Tumor"], ["Tidak ada", "Tidak Ada", "Normal"], 1);
  addRule(rules, ["Benjolan", "Benjolan / Tumor", "Benjolan/Tumor"], ["Ada", "Tidak Normal"], -10, true);

  addRule(rules, ["Hemoroid eksterna", "Hemoroid interna", "Fisura ani"], ["Tidak ada", "Tidak Ada", "Normal", "(-)"], 1);
  addRule(rules, ["Hemoroid eksterna", "Hemoroid interna", "Fisura ani"], ["Ada", "Tidak Normal", "(+)"], 0);
  addRule(rules, ["Struktur/Prolaps recti", "Striktur/Prolaps recti", "Striktur / Prolaps recti"], ["Tidak ada", "Tidak Ada", "Normal", "(-)"], 1);
  addRule(rules, ["Struktur/Prolaps recti", "Striktur/Prolaps recti", "Striktur / Prolaps recti"], ["Ada", "Tidak Normal", "(+)"], -10, true);

  addRule(rules, ["Hidronefrosis", "Kelainan kongenital", "Hipospadia", "Hidrokel", "Undescensus testis", "Undecensus testis", "Batu sal kemih", "Batu saluran kemih", "Cystitis akut / kronis", "Post operasi varikokel", "Phimosis"], ["Normal", "Tidak ada", "Tidak Ada", "(-)"], 1);
  addRule(rules, ["Hidronefrosis", "Kelainan kongenital", "Hipospadia", "Hidrokel", "Undescensus testis", "Undecensus testis", "Batu sal kemih", "Batu saluran kemih", "Cystitis akut / kronis", "Post operasi varikokel", "Phimosis"], ["Tidak Normal", "Ada", "(+)"], -10, true);

  // JANTUNG DAN PEMBULUH DARAH, max 12.
  addRule(rules, ["Kelainan Anatomi Jantung", "Kelainan Irama Jantung", "Kelainan Irama Jantung yang mengganggu latihan fisik sedang", "Iskemik Miocardial", "Iskemik Miokardial", "Kelainan kongenital jantung", "Kelainan Arteri pada ekstremitas"], "Tidak Ada", 2);
  addRule(rules, ["Kelainan Anatomi Jantung", "Kelainan Irama Jantung", "Kelainan Irama Jantung yang mengganggu latihan fisik sedang", "Iskemik Miocardial", "Iskemik Miokardial", "Kelainan kongenital jantung", "Kelainan Arteri pada ekstremitas"], "Ada", -10, true);
  addRule(rules, "Varises Tungkai (insufisiensi vena)", "Tidak Ada", 2);
  addRule(rules, "Varises Tungkai (insufisiensi vena)", "Ada", -1);

  // ORTOPEDI, max 16 mengikuti rekap 100. Vertebra klinis dibuat 1 poin per normal.
  addRule(rules, ["sindaktili", "polidaktili", "spina bifida", "mallet finger", "Hiperekstensi lengan", "Hammer toe", "Hallux valgus", "Webbed toe", "OX Knee", "O/X been", "Pes planus / kaki datar", "Polidactily", "Polidactyly", "Hiperekstensi Lutut", "General Laxity"], "Tidak Ada", 1);
  addRule(rules, ["sindaktili", "polidaktili", "spina bifida", "mallet finger", "Hiperekstensi lengan", "Hammer toe", "Hallux valgus", "Webbed toe", "OX Knee", "O/X been", "Pes planus / kaki datar", "Polidactily", "Polidactyly", "Hiperekstensi Lutut", "General Laxity"], "Ada", -10, true);
  addRule(rules, ["Skoliosis", "Kifosis", "Lordosis"], ["Tidak Ada", "Tidak ada"], 1);
  addRule(rules, ["Skoliosis", "Kifosis", "Lordosis"], ["Ada", "Ringan", "Sedang", "Berat", "Sedang / Berat", "Sedang/Berat"], -10, true);

  // RADIOLOGI / WHOLE SPINE, max 6.
  addRule(rules, ["Rontgen Whole Spine AP Lateral >> Skoliosis", "Rontgen Whole Spine AP Lateral >> Kifosis", "Rontgen Whole Spine AP Lateral >> Lordosis"], ["Tidak Ada", "Tidak ada", "TA", "Tidak ada (TA)"], 2);
  addRule(rules, ["Rontgen Whole Spine AP Lateral >> Skoliosis", "Rontgen Whole Spine AP Lateral >> Kifosis", "Rontgen Whole Spine AP Lateral >> Lordosis"], "Ringan", -1);
  addRule(rules, ["Rontgen Whole Spine AP Lateral >> Skoliosis", "Rontgen Whole Spine AP Lateral >> Kifosis", "Rontgen Whole Spine AP Lateral >> Lordosis"], ["Sedang", "Berat", "Sedang / Berat", "Sedang/Berat"], -10, true);

  return rules;
}

const BUILTIN_SCORE_RULES = buildBuiltinScoreRules();

export const CAPASKA_DOMAIN_RULES: DomainRule[] = [
  {
    key: "mata",
    label: "Mata",
    maxScore: 12,
    totalParameterName: "Total Score Kesehatan mata",
    components: [
      "Lensakontak/ kaca mata",
      "Tes buta warna",
      "Strabismus / Juling",
      "Pemeriksaan Visus OD  / OS",
    ],
  },
  {
    key: "gigi_mulut",
    label: "Gigi & Mulut + Dental Panoramik",
    maxScore: 16,
    totalParameterName: "Score total Pemeriksaan Kesehatan Gigi dan Mulut",
    components: [
      "Karang Gigi",
      "Caries Dentis",
      "Tumpatan Gigi",
      "Impaksi gigi",
      "Kehilangan Gigi (Baik depan maupun belakang)",
      "Infeksi Gusi",
      "Dental panoramic",
    ],
  },
  {
    key: "tht",
    label: "THT",
    maxScore: 10,
    totalParameterName: "Score total Pemeriksaan Kesehatan THT",
    components: [
      "Membran timpani",
      "Serumen",
      "Tonsil",
      "Rhinitis Alergi (lividae)",
      "Epistaksis 1 tahun terakhir",
      "Tes Garputala (Weber) 512 Hz",
    ],
  },
  {
    key: "penyakit_dalam",
    label: "Penyakit Dalam",
    maxScore: 28,
    totalParameterName: "Score total Pemeriksaan Penyakit Dalam",
    components: [
      "Berat Badan (Kg)",
      "TB. (Cm)",
      "Tanda Vital",
      "Tato kulit",
      "Tindik (selain anting) Wanita : hanya 1 / telinga",
      "Pemeriksaan Fisik Jantung",
      "Pemeriksaan Fisik Paru",
      "Hernia",
      "NT Epigastrum",
      "Benjolan",
      "Liver",
      "Bising Usus",
      "Bekas Operasi (>6Bulan)",
      "Hemoroid eksterna",
      "Hemoroid interna",
      "Fisura ani",
      "Struktur/Prolaps recti",
      "Hidronefrosis",
      "Kelainan kongenital",
      "Hipospadia",
      "Undescensus testis",
      "Batu sal kemih",
      "Cystitis akut / kronis",
      "Post operasi varikokel",
      "Phimosis",
    ],
  },
  {
    key: "jantung_pembuluh_darah",
    label: "Jantung & Pembuluh Darah",
    maxScore: 12,
    totalParameterName: "Score total Pemeriksaan Kesehatan Jantung dan Pembuluh Darah",
    components: [
      "Kelainan Anatomi Jantung",
      "Kelainan Irama Jantung",
      "Iskemik Miocardial",
      "Kelainan kongenital jantung",
      "Varises Tungkai (insufisiensi vena)",
      "Kelainan Arteri pada ekstremitas",
    ],
  },
  {
    key: "ortopedi",
    label: "Ortopedi",
    maxScore: 16,
    totalParameterName: "Score total Pemeriksaan Ortopedi",
    components: [
      "sindaktili",
      "polidaktili",
      "spina bifida",
      "mallet finger",
      "Hiperekstensi lengan",
      "Hammer toe",
      "Hallux valgus",
      "Webbed toe",
      "OX Knee",
      "Pes planus / kaki datar",
      "Polidactily",
      "Hiperekstensi Lutut",
      "General Laxity",
      "Skoliosis",
      "Kifosis",
      "Lordosis",
    ],
  },
  {
    key: "radiologi",
    label: "Radiologi / Whole Spine",
    maxScore: 6,
    totalParameterName: "Score total Pemeriksaan Penunjang Radiologi",
    components: [
      "Rontgen Whole Spine AP Lateral >> Skoliosis",
      "Rontgen Whole Spine AP Lateral >> Kifosis",
      "Rontgen Whole Spine AP Lateral >> Lordosis",
    ],
  },
];

const PARAMETER_ALIASES: Record<string, string[]> = {
  [normalizeCapaskaKey("Lensakontak/ kaca mata")]: ["Lensakontak / kaca mata"],
  [normalizeCapaskaKey("Pemeriksaan Visus OD  / OS")]: ["Pemeriksaan Visus OD / OS"],
  [normalizeCapaskaKey("Berat Badan (Kg)")]: ["BB (Kg)", "BB. (Kg)"],
  [normalizeCapaskaKey("TB. (Cm)")]: ["TB (Cm)", "Tb (Cm)"],
  [normalizeCapaskaKey("NT Epigastrum")]: ["NT Epigastrium"],
  [normalizeCapaskaKey("Benjolan")]: ["Benjolan / Tumor", "Benjolan/Tumor"],
  [normalizeCapaskaKey("Bekas Operasi (>6Bulan)")]: ["Bekas operasi (>3bulan)", "Bekas operasi (>6bulan)"],
  [normalizeCapaskaKey("Struktur/Prolaps recti")]: ["Striktur/Prolaps recti", "Striktur / Prolaps recti"],
  [normalizeCapaskaKey("Undescensus testis")]: ["Undecensus testis"],
  [normalizeCapaskaKey("Batu sal kemih")]: ["Batu saluran kemih"],
  [normalizeCapaskaKey("OX Knee")]: ["O/X bean", "O/X been"],
  [normalizeCapaskaKey("Polidactily")]: ["Polidactyly"],
  [normalizeCapaskaKey("Hiperekstensi Lutut")]: ["Hiperekstensi kaki"],
  // CAPASKA THT domain alias fix v163:
  // Final scoring uses CAPASKA_DOMAIN_RULES components and getParameterByName().
  // Treat old "divide/dividae/Bividas" names as the reference "lividae".
  [normalizeCapaskaKey("Rhinitis Alergi (lividae)")]: ["Rhinitis Alergi (lividae)", "Rhinitis Alergi (dividae)", "Rhinitis Alergi (Bividas)", "Rhinitis alergi / lividae"],
  [normalizeCapaskaKey("Rhinitis Alergi (divide)")]: ["Rhinitis Alergi (lividae)", "Rhinitis Alergi (dividae)", "Rhinitis Alergi (Bividas)", "Rhinitis alergi / lividae"],
  [normalizeCapaskaKey("Rhinitis Alergi (dividae)")]: ["Rhinitis Alergi (lividae)", "Rhinitis Alergi (lividae)", "Rhinitis Alergi (Bividas)", "Rhinitis alergi / lividae"],
  [normalizeCapaskaKey("Rhinitis Alergi (Bividas)")]: ["Rhinitis Alergi (lividae)", "Rhinitis Alergi (lividae)", "Rhinitis Alergi (dividae)", "Rhinitis alergi / lividae"],
  [normalizeCapaskaKey("Tes Garputala (Weber) 512 Hz")]: ["Tes Garputala Weber 512 Hz", "Tes Garputala (Weber) 512Hz", "Tes Garputala / Weber 512 Hz"],
  [normalizeCapaskaKey("Tes Garputala Weber 512 Hz")]: ["Tes Garputala (Weber) 512 Hz", "Tes Garputala (Weber) 512Hz", "Tes Garputala / Weber 512 Hz"],
};

const VALUE_FIELD_BY_PARAMETER: Record<string, string> = {
  [normalizeCapaskaKey("Lensakontak/ kaca mata")]: "Value Lensakontak/ kaca mata",
  [normalizeCapaskaKey("Tes buta warna")]: "Value buta warna",
  [normalizeCapaskaKey("Strabismus / Juling")]: "Value Strabismus / Juling",
  [normalizeCapaskaKey("Pemeriksaan Visus OD  / OS")]: "Value Pemeriksaan Visus OD  / OS",
  [normalizeCapaskaKey("Tindik (selain anting) Wanita : hanya 1 / telinga")]: "Value (selain anting) Wanita : hanya 1 / telinga",
};

function normalizeScoringOption(option: any): CapaskaScoringOption | null {
  if (typeof option === "string") {
    const label = option.trim();
    return label ? { label, value: label, score: null, is_critical: false, note: "" } : null;
  }

  if (!option || typeof option !== "object") return null;

  const label = String(option.label ?? option.option_label ?? option.text ?? option.value ?? "").trim();
  if (!label) return null;

  const value = String(option.value ?? option.option_value ?? label).trim() || label;
  const score = parseNumber(option.score);

  return {
    label,
    value,
    score,
    is_critical: Boolean(option.is_critical ?? option.critical ?? false),
    note: String(option.note ?? option.recommendation_text ?? "").trim(),
  };
}

export function parseCapaskaScoringConfig(config: any): CapaskaScoringConfig {
  let parsed = config;

  try {
    if (typeof config === "string") parsed = JSON.parse(config || "[]");
  } catch {
    parsed = [];
  }

  if (Array.isArray(parsed)) {
    return {
      options: parsed.map(normalizeScoringOption).filter(Boolean) as CapaskaScoringOption[],
      max_score: null,
      scoring_type: "by_option",
      include_in_total_score: true,
    };
  }

  if (parsed && typeof parsed === "object") {
    const rawOptions = Array.isArray(parsed.options) ? parsed.options : [];
    return {
      options: rawOptions.map(normalizeScoringOption).filter(Boolean) as CapaskaScoringOption[],
      max_score: parseNumber(parsed.max_score),
      scoring_type: String(parsed.scoring_type || "by_option"),
      include_in_total_score: parsed.include_in_total_score === false ? false : true,
    };
  }

  return { options: [], max_score: null, scoring_type: "by_option", include_in_total_score: true };
}

export function parseCapaskaOptions(config: any) {
  return parseCapaskaScoringConfig(config).options.map((option) => option.label);
}

function findConfigOption(param: any, selectedValue: string) {
  const options = parseCapaskaScoringConfig(param?.config_json).options;
  const selectedKey = normalizeCapaskaKey(selectedValue);

  return options.find((option) => (
    normalizeCapaskaKey(option.label) === selectedKey || normalizeCapaskaKey(option.value) === selectedKey
  )) || null;
}

function getBuiltinRule(parameterName: string, selectedValue: string) {
  return BUILTIN_SCORE_RULES[scoreKey(parameterName, selectedValue)] || null;
}

export function scoreCapaskaDirectChoice(param: any, selectedValue: string) {
  const selected = String(selectedValue || "").trim();
  if (!selected) return 0;

  // CAPASKA_GIGI_RADIOLOGI_CANONICAL_V163
  // Keep this narrow: only known Gigi/Dental and Radiologi Whole Spine parameters.
  // It prevents these stages from falling back to older DB/Ortopedi scoring paths.
  const gigiCanonicalScoreV163 = capaskaSharedGigiScoreV163(param, selected);
  if (gigiCanonicalScoreV163 !== null) return gigiCanonicalScoreV163;

  const radiologiCanonicalScoreV163 = capaskaSharedRadiologiScoreV163(param, selected);
  if (radiologiCanonicalScoreV163 !== null) return radiologiCanonicalScoreV163;

  // CAPASKA_ORTHOPEDI_VERTEBRA_V232
  const selectedKeyForOrtopediV232 = normalizeCapaskaKey(selected);
  const parameterKeyForOrtopediV232 = normalizeCapaskaKey(String(param?.name || ""));
  const categoryKeyForOrtopediV232 = normalizeCapaskaKey(String(param?.category || ""));

  // CAPASKA_ORTHOPEDI_VERTEBRA_CONFIG_SCORE_V242
  // Prioritaskan skor dari Setup Parameter untuk Ortopedi Vertebra.
  // Dengan ini, perubahan skor dari aplikasi langsung dipakai backend/dashboard/export.
  const ortopediVertebraConfigOptionV242 = findConfigOption(param, selected);
  if (
    ["skoliosis", "kifosis", "lordosis"].includes(parameterKeyForOrtopediV232) &&
    categoryKeyForOrtopediV232.includes("vertebra") &&
    ortopediVertebraConfigOptionV242 &&
    typeof ortopediVertebraConfigOptionV242.score === "number"
  ) {
    return ortopediVertebraConfigOptionV242.score;
  }
  if (["skoliosis", "kifosis", "lordosis"].includes(parameterKeyForOrtopediV232) && categoryKeyForOrtopediV232.includes("vertebra")) {
    if (selectedKeyForOrtopediV232 === "tidakada" || selectedKeyForOrtopediV232 === "normal") return 1;
    if (["ada", "ringan", "sedang", "berat", "sedangberat", "tidaknormal"].includes(selectedKeyForOrtopediV232)) return -10;
  }

  const configOption = findConfigOption(param, selected);
  if (configOption && typeof configOption.score === "number") return configOption.score;

  const name = String(param?.name || "");
  const category = String(param?.category || "").toLowerCase();
  const exact = getBuiltinRule(name, selected);
  if (exact) return exact.score;

  const selectedKey = normalizeCapaskaKey(selected);

  if (
    category.includes("penyakit dalam") ||
    category.includes("abdomen") ||
    category.includes("rektum") ||
    category.includes("urogenitalia")
  ) {
    if (["normal", "tidakada", "negative", "negatif"].includes(selectedKey)) return 1;
    if (selectedKey === "tidaknormal") return -2;
    if (selectedKey === "ada") return -10;
  }

  if (category.includes("ortopedi") || category.includes("gerak") || category.includes("vertebra")) {
    if (selectedKey === "tidakada") return 1;
    if (selectedKey === "ringan") return -10;
    if (["ada", "sedang", "berat", "sedangberat"].includes(selectedKey)) return -10;
  }

  if (category.includes("radiologi") || category.includes("rontgen")) {
    if (["tidakada", "ta"].includes(selectedKey)) return 2;
    if (selectedKey === "ringan") return -1;
    if (["sedang", "berat", "sedangberat"].includes(selectedKey)) return -10;
  }

  return 0;
}

export function isCapaskaCriticalChoice(param: any, selectedValue: string) {
  const configOption = findConfigOption(param, selectedValue);
  if (configOption?.is_critical) return true;

  const exact = getBuiltinRule(String(param?.name || ""), String(selectedValue || ""));
  if (exact?.critical) return true;

  const score = scoreCapaskaDirectChoice(param, selectedValue);
  return score <= -10;
}

export function getCapaskaValueFieldName(parameterName: string) {
  return VALUE_FIELD_BY_PARAMETER[normalizeCapaskaKey(parameterName)] || `Value ${parameterName}`;
}

export function isCapaskaValueOrScoreParameter(param: any) {
  const name = String(param?.name || "").toLowerCase();
  return name.startsWith("value ") || name.startsWith("score ") || name.startsWith("total score");
}

function getParameterByName(byName: Map<string, any>, name: string) {
  const key = normalizeCapaskaKey(name);
  const direct = byName.get(key);
  if (direct) return direct;

  const aliases = PARAMETER_ALIASES[key] || [];
  for (const alias of aliases) {
    const found = byName.get(normalizeCapaskaKey(alias));
    if (found) return found;
  }

  return null;
}

function computeCapaskaDerivedValuesBaseV162(parameters: any[], inputValues: Record<string, string>) {
  const next = { ...inputValues };
  const byName = new Map<string, any>();

  parameters.forEach((p) => {
    byName.set(normalizeCapaskaKey(p.name), p);
    if (isCapaskaValueOrScoreParameter(p)) {
      next[p.id] = "";
    }
  });

  parameters.forEach((p) => {
    if (isCapaskaValueOrScoreParameter(p)) return;

    const selected = next[p.id];
    if (!selected) return;

    // Some legacy CAPASKA parameters are still stored as text inputs in the DB,
    // but their values are actually fixed choices. Score them when either a
    // config option exists or a built-in CAPASKA rule recognizes the selection.
    const hasConfiguredOptions = parseCapaskaScoringConfig(p.config_json).options.length > 0;
    const hasBuiltinRule = Boolean(getBuiltinRule(String(p.name || ""), selected));
    if (!hasConfiguredOptions && !hasBuiltinRule) return;

    const score = scoreCapaskaDirectChoice(p, selected);
    const valueFieldName = getCapaskaValueFieldName(String(p.name || ""));
    const valueParam = getParameterByName(byName, valueFieldName);

    if (valueParam) {
      next[valueParam.id] = String(score);
    }
  });

  const scoreOf = (name: string) => {
    const p = getParameterByName(byName, name);
    if (!p) return 0;
    const selected = next[p.id];
    if (!selected) return 0;
    return scoreCapaskaDirectChoice(p, selected);
  };

  const setRawTotal = (totalName: string, names: string[]) => {
    const totalParam = getParameterByName(byName, totalName);
    if (!totalParam) return;

    const total = names.reduce((sum, name) => sum + scoreOf(name), 0);
    next[totalParam.id] = String(roundScore(total));
  };

  setRawTotal("Score Abdomen", [
    "Hernia",
    "NT Epigastrum",
    "Benjolan",
    "Liver",
    "Bising Usus",
    "Bekas Operasi (>6Bulan)",
  ]);

  setRawTotal("Score Pemeriksaan Anus & Rektum (Colok Dubur)", [
    "Hemoroid eksterna",
    "Hemoroid interna",
    "Fisura ani",
    "Struktur/Prolaps recti",
  ]);

  setRawTotal("Score Urogenitalia", [
    "Hidronefrosis",
    "Kelainan kongenital",
    "Hipospadia",
    "Undescensus testis",
    "Batu sal kemih",
    "Cystitis akut / kronis",
    "Post operasi varikokel",
    "Phimosis",
  ]);

  setRawTotal("Score Anggota Gerak Atas", [
    "sindaktili",
    "polidaktili",
    "spina bifida",
    "mallet finger",
    "Hiperekstensi lengan",
  ]);

  setRawTotal("Score Anggota Gerak Bawah", [
    "Hammer toe",
    "Hallux valgus",
    "Webbed toe",
    "OX Knee",
    "Pes planus / kaki datar",
    "Polidactily",
    "Hiperekstensi Lutut",
    "General Laxity",
  ]);

  setRawTotal("Score Vertebra / Tulang Belakang", [
    "Skoliosis",
    "Kifosis",
    "Lordosis",
  ]);

  setRawTotal("Score Rontgen Whole Spine AP Lateral", [
    "Rontgen Whole Spine AP Lateral >> Skoliosis",
    "Rontgen Whole Spine AP Lateral >> Kifosis",
    "Rontgen Whole Spine AP Lateral >> Lordosis",
  ]);

  for (const domain of CAPASKA_DOMAIN_RULES) {
    const totalParam = getParameterByName(byName, domain.totalParameterName);
    if (!totalParam) continue;

    const total = domain.components.reduce((sum, name) => sum + scoreOf(name), 0);
    next[totalParam.id] = String(roundScore(Math.min(domain.maxScore, total)));
  }

  return next;
}

function emptyScoring(): CapaskaScoringResult {
  const domainScores: Record<string, number> = {};
  const rawDomainScores: Record<string, number> = {};
  const domainMaxScores: Record<string, number> = {};

  for (const domain of CAPASKA_DOMAIN_RULES) {
    domainScores[domain.key] = 0;
    rawDomainScores[domain.key] = 0;
    domainMaxScores[domain.key] = domain.maxScore;
  }

  return {
    version: CAPASKA_SCORING_VERSION,
    totalScore: null,
    totalBeforePenalty: null,
    penalty: 0,
    notRecommended: false,
    redFlags: [],
    domainScores,
    rawDomainScores,
    domainMaxScores,
  };
}

function computeGenericParticipantScore(
  participantId: number,
  packageId: number,
  packageParameters: any[],
  parameters: any[],
  results: any[]
) {
  const parameterIds = new Set(
    packageParameters
      .filter((pp) => Number(pp.package_id) === Number(packageId))
      .map((pp) => Number(pp.parameter_id))
  );

  const paramsForPackage = parameters.filter((p) => parameterIds.has(Number(p.id)));
  const resultMap = new Map<number, string>();

  results
    .filter((r) => Number(r.participant_id) === Number(participantId))
    .forEach((r) => resultMap.set(Number(r.parameter_id), String(r.value ?? "").trim()));

  const isTotalScoreParameter = (parameter: any) => {
    const name = String(parameter?.name || "").toLowerCase();
    return (
      name.includes("total score") ||
      name.includes("score total") ||
      name.includes("skor total") ||
      name.includes("total skor")
    );
  };

  const isValueScoreParameter = (parameter: any) => {
    const name = String(parameter?.name || "").toLowerCase().trim();
    return name.startsWith("value ") || name.startsWith("nilai ");
  };

  const scoreParams = paramsForPackage.filter(isTotalScoreParameter);
  const fallbackParams = paramsForPackage.filter(isValueScoreParameter);
  const selectedParams = scoreParams.length ? scoreParams : fallbackParams;

  let total = 0;
  let count = 0;

  for (const parameter of selectedParams) {
    const n = parseNumber(resultMap.get(Number(parameter.id)));
    if (n !== null) {
      total += n;
      count += 1;
    }
  }

  return count > 0 ? roundScore(total) : null;
}

export function computeMcuParticipantScoring2026(args: {
  participantId: number;
  packageId: number;
  packageParameters: any[];
  parameters: any[];
  results: any[];
  program?: string;
}) {
  const program = String(args.program || "").toLowerCase();

  if (program !== "capaska") {
    const totalScore = computeGenericParticipantScore(
      args.participantId,
      args.packageId,
      args.packageParameters,
      args.parameters,
      args.results
    );

    return {
      ...emptyScoring(),
      version: "GENERIC_SCORE_SUM",
      totalScore,
      totalBeforePenalty: totalScore,
    };
  }

  const parameterIds = new Set(
    args.packageParameters
      .filter((pp) => Number(pp.package_id) === Number(args.packageId))
      .map((pp) => Number(pp.parameter_id))
  );

  const paramsForPackage = args.parameters.filter((p) => parameterIds.has(Number(p.id)));
  const resultMap = new Map<number, string>();

  args.results
    .filter((r) => Number(r.participant_id) === Number(args.participantId))
    .forEach((r) => resultMap.set(Number(r.parameter_id), String(r.value ?? "").trim()));

  const byName = new Map<string, any>();
  paramsForPackage.forEach((p) => byName.set(normalizeCapaskaKey(p.name), p));

  const result = emptyScoring();
  let touched = false;

  const getSelected = (name: string) => {
    const param = getParameterByName(byName, name);
    if (!param) return { param: null, value: "" };

    const value = String(resultMap.get(Number(param.id)) || "").trim();
    return { param, value };
  };

  for (const domain of CAPASKA_DOMAIN_RULES) {
    let domainTotal = 0;
    let answeredCount = 0;

    for (const componentName of domain.components) {
      const { param, value } = getSelected(componentName);
      if (!param || !value) continue;

      const score = scoreCapaskaDirectChoice(param, value);
      domainTotal += score;
      answeredCount += 1;
      touched = true;

      if (isCapaskaCriticalChoice(param, value)) {
        result.redFlags.push(`${domain.label}: ${String(param.name || componentName)} = ${value}`);
      }
    }

    if (answeredCount > 0) {
      result.rawDomainScores[domain.key] = roundScore(domainTotal);
      result.domainScores[domain.key] = roundScore(Math.min(domain.maxScore, domainTotal));
      continue;
    }

    const totalParam = getParameterByName(byName, domain.totalParameterName);
    const totalValue = totalParam ? parseNumber(resultMap.get(Number(totalParam.id))) : null;

    if (totalValue !== null) {
      result.rawDomainScores[domain.key] = roundScore(totalValue);
      result.domainScores[domain.key] = roundScore(Math.min(domain.maxScore, totalValue));
      touched = true;
    }
  }

  const gigiCanonicalV163 = capaskaSharedComputeCanonicalDomainFromResultsV163(
    paramsForPackage,
    resultMap,
    capaskaSharedGigiScoreV163
  );
  if (gigiCanonicalV163.count > 0) {
    result.rawDomainScores.gigi_mulut = gigiCanonicalV163.total;
    result.domainScores.gigi_mulut = roundScore(Math.min(16, gigiCanonicalV163.total));
    for (const item of gigiCanonicalV163.redFlags) result.redFlags.push(`Gigi & Mulut + Dental Panoramik: ${item}`);
    touched = true;
  }

  const radiologiCanonicalV163 = capaskaSharedComputeCanonicalDomainFromResultsV163(
    paramsForPackage,
    resultMap,
    capaskaSharedRadiologiScoreV163
  );
  if (radiologiCanonicalV163.count > 0) {
    result.rawDomainScores.radiologi = radiologiCanonicalV163.total;
    result.domainScores.radiologi = roundScore(Math.min(6, radiologiCanonicalV163.total));
    for (const item of radiologiCanonicalV163.redFlags) result.redFlags.push(`Radiologi: ${item}`);
    touched = true;
  }

  if (!touched) return result;

  const total = roundScore(
    CAPASKA_DOMAIN_RULES.reduce((sum, domain) => sum + (result.domainScores[domain.key] || 0), 0)
  );

  result.notRecommended = result.redFlags.length > 0;
  result.totalBeforePenalty = total;
  result.penalty = 0;
  result.totalScore = total;

  return result;
}

export function evaluateMcuGraduation2026(
  totalScore: number | null,
  isComplete: boolean,
  rule: any,
  scoring?: Pick<CapaskaScoringResult, "notRecommended">
) {
  if (!isComplete) return "Belum Selesai";
  if (totalScore === null) return "Belum Dinilai";
  if (scoring?.notRecommended) return "Tidak Direkomendasikan";

  const min = Number(rule?.pass_min_score ?? 0);
  const max = Number(rule?.pass_max_score ?? 999999);

  return totalScore >= min && totalScore <= max ? "Lulus" : "Tidak Lulus";
}

function capaskaSharedThtNormV162(value: any) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[â€“â€”]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function capaskaSharedThtCompactV162(value: any) {
  return capaskaSharedThtNormV162(value).replace(/\s+/g, "");
}

function capaskaSharedThtParamTextV162(param: any) {
  return capaskaSharedThtNormV162([
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

function capaskaSharedThtCanonicalKeyV162(param: any): string | null {
  const text = capaskaSharedThtParamTextV162(param);

  if (/membran.*timpani|timpani/.test(text)) return "membran";
  if (/serumen/.test(text)) return "serumen";
  if (/rhinitis|rinitis|lividae|divide|dividae|bividas/.test(text)) return "rhinitis";
  if (/tonsil/.test(text)) return "tonsil";
  if (/epistaksis|epistaxis/.test(text)) return "epistaksis";
  if (/garputala|weber/.test(text)) return "weber";

  return null;
}

function capaskaSharedIsScoreFieldV162(param: any) {
  const name = String(param?.name || "").toLowerCase().trim();
  const text = capaskaSharedThtParamTextV162(param);
  return (
    name.startsWith("score ") ||
    name.startsWith("total score") ||
    name.includes("score total") ||
    /score/.test(text)
  );
}

function capaskaSharedThtScoreV162(param: any, rawValue: any): number | null {
  const key = capaskaSharedThtCanonicalKeyV162(param);
  if (!key) return null;

  const value = capaskaSharedThtNormV162(rawValue);
  const compact = capaskaSharedThtCompactV162(rawValue);

  if (!value) return null;

  if (key === "membran") {
    if (/tidakintak|tidakintac|tidakintact/.test(compact)) return -10;
    if (/intak|intac|intact/.test(compact)) return 2;
  }

  if (key === "serumen") {
    if (/tidakada|tidakterdapat|\(-\)|negatif|negative/.test(compact)) return 2;
    if (/adaserumen|ada|\(\+\)|positif|positive/.test(compact)) return 1;
  }

  if (key === "rhinitis") {
    if (/negatif|negative|\(-\)|tidakada/.test(compact)) return 2;
    if (/positif|positive|\(\+\)|ada/.test(compact)) return 1;
  }

  if (key === "tonsil") {
    if (/tonsilektomi/.test(compact)) return 2;
    if (/t0\/?t1-?t1|t0\/?t1|t0-?t1|t1-?t1|t1\/?t1|t0t1t1/.test(compact)) return 2;
    if (/t2a/.test(compact)) return 1;
    if (/t2b/.test(compact)) return -1;
    if (/t3/.test(compact)) return -10;
  }

  if (key === "epistaksis") {
    if (/tidakada|tidakterdapat|\(-\)|negatif|negative/.test(compact)) return 1;
    if (/ada|\(\+\)|positif|positive/.test(compact)) return -1;
  }

  if (key === "weber") {
    if (/tidaknormal|abnormal/.test(compact)) return -10;
    if (/normal/.test(compact)) return 1;
  }

  return null;
}

function capaskaApplyThtCanonicalTotalV162(parameters: any[], baseValues: Record<string, string>, rawValues: Record<string, string>) {
  const list = Array.isArray(parameters) ? parameters : [];
  const nextValues: Record<string, string> = { ...(baseValues || {}) };
  const sourceValues: Record<string, string> = { ...(rawValues || {}), ...(baseValues || {}) };

  const requiredKeys = ["membran", "serumen", "rhinitis", "tonsil", "epistaksis", "weber"];
  const seen = new Set<string>();
  let total = 0;

  for (const param of list) {
    const key = capaskaSharedThtCanonicalKeyV162(param);
    if (!key || seen.has(key)) continue;

    const selected = sourceValues[String(param?.id)];
    const score = capaskaSharedThtScoreV162(param, selected);

    if (typeof score !== "number" || !Number.isFinite(score)) continue;

    seen.add(key);
    total += score;
  }

  const hasAllThtKeys = requiredKeys.every((key) => seen.has(key));
  if (!hasAllThtKeys) return nextValues;

  const scoreFields = list.filter((param) => capaskaSharedIsScoreFieldV162(param));

  for (const scoreField of scoreFields) {
    nextValues[String(scoreField.id)] = String(total);
  }

  return nextValues;
}


/* CAPASKA Gigi/Radiologi backend canonical totals v163
   Scope only:
   - Gigi & Mulut + Dental Panoramik: healthy max 16
   - Radiologi Whole Spine AP Lateral: healthy max 6
   Purpose:
   - Save/dashboard must not trust a misplaced hidden Score field.
   - Radiologi Skoliosis/Kifosis/Lordosis must not fall into Ortopedi Vertebra scoring.
*/
function capaskaSharedStageNormV163(value: any) {
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

function capaskaSharedStageCompactV163(value: any) {
  return capaskaSharedStageNormV163(value).replace(/\s+/g, "");
}

function capaskaSharedStageParamTextV163(param: any) {
  return capaskaSharedStageNormV163([
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

function capaskaSharedIsAutoOrScoreParamV163(param: any) {
  const name = String(param?.name || "").toLowerCase().trim();
  return (
    name.startsWith("value ") ||
    name.startsWith("nilai ") ||
    name.startsWith("score ") ||
    name.startsWith("total score") ||
    name.includes("score total") ||
    name.includes("skor total") ||
    name.includes("total skor")
  );
}

function capaskaSharedGigiKeyV163(param: any): string | null {
  if (!param || capaskaSharedIsAutoOrScoreParamV163(param)) return null;
  const text = capaskaSharedStageParamTextV163(param);

  if (/karang/.test(text)) return "karang";
  if (/caries|karies|dentis/.test(text)) return "caries";
  if (/tumpatan|tambalan/.test(text)) return "tumpatan";
  if (/impaksi|impacted/.test(text)) return "impaksi";
  if (/kehilangan.*gigi|gigi.*hilang/.test(text)) return "kehilangan";
  if (/infeksi.*gusi|gusi.*infeksi/.test(text)) return "infeksi";
  if (/dental.*panoramic|dental.*panoramik|panoramic|panoramik|panorama/.test(text)) return "dental";

  return null;
}

function capaskaSharedGigiScoreV163(param: any, rawValue: any): number | null {
  const key = capaskaSharedGigiKeyV163(param);
  if (!key) return null;

  const c = capaskaSharedStageNormV163(rawValue);
  const compact = capaskaSharedStageCompactV163(rawValue);
  if (!c) return null;

  if (key === "karang") {
    if (/positive|positif|\(\+\)|(^| )ada( |$)/.test(c) && !/tidak ada/.test(c)) return -1;
    if (/negative|negatif|\(-\)|tidak ada|tidakada/.test(c)) return 2;
  }

  if (key === "caries") {
    if (/> ?3|>\s*3|lebih\s*dari\s*3|di atas\s*3|lebih\s*3/.test(c)) return -10;
    if (/(^|[^0-9])0\s*(caries|karies)?/.test(c)) return 3;
    if (/(^|[^0-9])1\s*(caries|karies)?/.test(c)) return -1;
    if (/(^|[^0-9])2\s*(caries|karies)?/.test(c)) return -2;
    if (/(^|[^0-9])3\s*(caries|karies)?/.test(c)) return -3;
  }

  if (key === "tumpatan") {
    if (/(^|[^0-9])0\s*tumpatan|0tumpatan/.test(c) || compact === "0") return 2;
    if (/> ?5|>\s*5|lebih\s*dari\s*5|>\s*3|lebih\s*dari\s*3/.test(c)) return -5;
    if (/<= ?5|<=\s*5|<\s*=\s*5|< ?5|<\s*5|<= ?3|<=\s*3|<\s*=\s*3|< ?3|<\s*3/.test(c)) return 1;
    if (/(^|[^0-9])[1-5]\s*tumpatan/.test(c)) return 1;
  }

  if (key === "impaksi") {
    if (/>= ?4|>=\s*4|4\s*gigi|lebih\s*dari\s*3|di atas\s*3/.test(c)) return -10;
    if (/> ?2|>\s*2|lebih\s*dari\s*2|2\s*gigi\s*depan/.test(c)) return -5;
    if (/2\s*gigi|1\s*gigi\s*depan/.test(c)) return 1;
    if (/(^|[^0-9])1\s*gigi/.test(c)) return 2;
    if (/(^|[^0-9])0\s*gigi/.test(c)) return 3;
  }

  if (key === "kehilangan") {
    if (/> ?2|>\s*2|lebih\s*dari\s*2|di atas\s*2/.test(c)) return -10;
    if (/(^|[^0-9])2\s*gigi/.test(c)) return 0;
    if (/(^|[^0-9])1\s*gigi/.test(c)) return 1;
    if (/(^|[^0-9])0\s*gigi/.test(c)) return 2;
  }

  if (key === "infeksi") {
    if (/positive|positif|\(\+\)|(^| )ada( |$)/.test(c) && !/tidak ada/.test(c)) return -1;
    if (/negative|negatif|\(-\)|tidak ada|tidakada/.test(c)) return 1;
  }

  if (key === "dental") {
    if (/normal/.test(c) && !/tidak normal|kelainan|abnormal/.test(c)) return 3;
    if (/kelainan|ditemukan|tidak normal|abnormal/.test(c)) return -1;
  }

  return null;
}

function capaskaSharedRadiologiKeyV163(param: any): string | null {
  if (!param || capaskaSharedIsAutoOrScoreParamV163(param)) return null;
  const text = capaskaSharedStageParamTextV163(param);
  const hasRadiologyContext = /radiologi|rontgen|whole spine|ap lateral|thoracolumbosacral/.test(text);

  if (!hasRadiologyContext) return null;
  if (/skoliosis|scoliosis/.test(text)) return "skoliosis";
  if (/kifosis|kyphosis/.test(text)) return "kifosis";
  if (/lordosis/.test(text)) return "lordosis";

  return null;
}

function capaskaSharedRadiologiScoreV163(param: any, rawValue: any): number | null {
  const key = capaskaSharedRadiologiKeyV163(param);
  if (!key) return null;

  const c = capaskaSharedStageNormV163(rawValue);
  const compact = capaskaSharedStageCompactV163(rawValue);
  if (!c) return null;

  if (/tidakada|tidakterdapat|normal|\(-\)|negatif|negative|^ta$/.test(compact)) return 2;
  if (/ringan/.test(c)) return -1;
  if (/sedang|berat|ada|tidak normal|abnormal|positif|positive|\(\+\)/.test(c)) return -10;

  return null;
}

function capaskaSharedApplyStageCanonicalTotalV163(parameters: any[], baseValues: Record<string, string>, rawValues: Record<string, string>) {
  const list = Array.isArray(parameters) ? parameters : [];
  const nextValues: Record<string, string> = { ...(baseValues || {}) };
  const sourceValues: Record<string, string> = { ...(rawValues || {}), ...(baseValues || {}) };

  const computeTotal = (scoreFn: (param: any, value: any) => number | null) => {
    let total = 0;
    let count = 0;

    for (const param of list) {
      if (capaskaSharedIsAutoOrScoreParamV163(param)) continue;
      const selected = String(sourceValues[String(param?.id)] ?? "").trim();
      if (!selected) continue;

      const score = scoreFn(param, selected);
      if (typeof score !== "number" || !Number.isFinite(score)) continue;

      total += score;
      count += 1;
    }

    return count ? { total: roundScore(total), count } : null;
  };

  const gigi = computeTotal(capaskaSharedGigiScoreV163);
  const radiologi = computeTotal(capaskaSharedRadiologiScoreV163);

  const stage = radiologi && radiologi.count >= 1 ? radiologi : gigi && gigi.count >= 1 ? gigi : null;
  if (!stage) return nextValues;

  const scoreFields = list.filter((param) => capaskaSharedIsScoreFieldV162(param) || capaskaSharedIsAutoOrScoreParamV163(param));
  for (const scoreField of scoreFields) {
    const name = String(scoreField?.name || "").toLowerCase().trim();
    if (name.startsWith("value ") || name.startsWith("nilai ")) continue;
    nextValues[String(scoreField.id)] = String(stage.total);
  }

  return nextValues;
}

function capaskaSharedComputeCanonicalDomainFromResultsV163(
  paramsForPackage: any[],
  resultMap: Map<number, string>,
  scoreFn: (param: any, value: any) => number | null,
) {
  let total = 0;
  let count = 0;
  const redFlags: string[] = [];

  for (const param of paramsForPackage || []) {
    if (capaskaSharedIsAutoOrScoreParamV163(param)) continue;
    const value = String(resultMap.get(Number(param?.id)) || "").trim();
    if (!value) continue;

    const score = scoreFn(param, value);
    if (typeof score !== "number" || !Number.isFinite(score)) continue;

    total += score;
    count += 1;
    if (score <= -10) redFlags.push(`${String(param?.name || "Parameter")} = ${value}`);
  }

  return { total: roundScore(total), count, redFlags };
}

export function computeCapaskaDerivedValues(parameters: any[], values: Record<string, string>) {
  const baseValues = computeCapaskaDerivedValuesBaseV162(parameters, values);
  const thtValues = capaskaApplyThtCanonicalTotalV162(parameters, baseValues, values);
  return capaskaSharedApplyStageCanonicalTotalV163(parameters, thtValues, values);
}


