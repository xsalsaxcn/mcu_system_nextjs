export const CAPASKA_SCORING_VERSION = "CAPASKA_SCORING_2026_V3_REFERENCE_RULES";

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

type DomainRule = {
  key: CapaskaDomainKey;
  label: string;
  maxScore: number;
  totalParameterName: string;
  components: string[];
};

const SCORE_RULES: Record<string, number> = {
  // MATA
  "Lensakontak/ kaca mata::Tidak menggunakan": 3,
  "Lensakontak/ kaca mata::Tidak Menggunakan": 3,
  "Lensakontak/ kaca mata::Tidak menggunakan /": 3,
  "Lensakontak/ kaca mata::Menggunakan": -1,
  "Lensakontak/ kaca mata::Menggunakan /": -1,

  "Tes buta warna::Tidak buta warna": 3,
  "Tes buta warna::Tidak buta warna /": 3,
  "Tes buta warna::Buta warna parsial": 0,
  "Tes buta warna::Buta warna total": 0,

  "Strabismus / Juling::(-)": 3,
  "Strabismus / Juling::(-) / (-)": 3,
  "Strabismus / Juling::(+) / (-)": -5,
  "Strabismus / Juling::(-) / (+)": -5,
  "Strabismus / Juling::(+) / (+)": -5,

  "Pemeriksaan Visus OD  / OS::Normal ≥6/6": 3,
  "Pemeriksaan Visus OD  / OS::Normal >=6/6": 3,
  "Pemeriksaan Visus OD  / OS::Normal 6/6": 3,
  "Pemeriksaan Visus OD  / OS::<6/6 - 6/12": 2,
  "Pemeriksaan Visus OD  / OS::<6/12": 0,

  // GIGI
  "Karang Gigi::(-)": 2,
  "Karang Gigi::(-) / (-)": 2,
  "Karang Gigi::Negative": 2,
  "Karang Gigi::Tidak ada": 2,
  "Karang Gigi::(+)": -1,
  "Karang Gigi::(+) / (-)": -1,
  "Karang Gigi::(-) / (+)": -1,
  "Karang Gigi::(+) / (+)": -1,
  "Karang Gigi::Positive": -1,
  "Karang Gigi::Ada": -1,

  "Caries Dentis::0 caries": 3,
  "Caries Dentis::1 caries": -1,
  "Caries Dentis::2 caries": -2,
  "Caries Dentis::3 caries": -3,
  "Caries Dentis::>3 caries": 0,

  "Tumpatan Gigi::0 tumpatan": 2,
  "Tumpatan Gigi::<5 tumpatan": 1,
  "Tumpatan Gigi::≤5 tumpatan": 1,
  "Tumpatan Gigi::<=5 tumpatan": 1,
  "Tumpatan Gigi::<3 tumpatan": 1,
  "Tumpatan Gigi::>5 tumpatan": -5,
  "Tumpatan Gigi::>3 tumpatan": -5,

  "Impaksi gigi::0 gigi": 3,
  "Impaksi gigi::1 gigi": 2,
  "Impaksi gigi::2 gigi impaksi / impaksi 1 gigi depan": 1,
  "Impaksi gigi::2 gigi": 1,
  "Impaksi gigi::impaksi 1 gigi depan": 1,
  "Impaksi gigi::>2 gigi impaksi atau 2 gigi depan impaksi": -5,
  "Impaksi gigi::>2 gigi": -5,
  "Impaksi gigi::>=4 gigi": 0,
  "Impaksi gigi::≥4 gigi": 0,
  "Impaksi gigi::>4 gigi": 0,

  "Kehilangan Gigi bagian depan::0 gigi": 2,
  "Kehilangan Gigi bagian depan::1 gigi": 1,
  "Kehilangan Gigi bagian depan::2 gigi": 0,
  "Kehilangan Gigi bagian depan::>2 gigi": 0,
  "Kehilangan Gigi (Baik depan maupun belakang)::0 gigi": 2,
  "Kehilangan Gigi (Baik depan maupun belakang)::1 gigi": 1,
  "Kehilangan Gigi (Baik depan maupun belakang)::2 gigi": 0,
  "Kehilangan Gigi (Baik depan maupun belakang)::>2 gigi": 0,

  "Infeksi Gusi::(-)": 1,
  "Infeksi Gusi::Negative": 1,
  "Infeksi Gusi::(+) / (-)": 1,
  "Infeksi Gusi::(-) / (+)": 1,
  "Infeksi Gusi::(+)": 1,
  "Infeksi Gusi::Positive": 1,
  "Infeksi Gusi::(+) / (+)": 0,

  "Dental panoramic::Normal": 3,
  "Dental panoramic::ditemukan kelainan": -1,
  "Dental panoramic::Ditemukan kelainan": -1,

  // THT
  "Membran timpani::Intak": 2,
  "Membran timpani::Tidak intak": 0,
  "Membran timpani::Tidak Intak": 0,

  "Serumen::Tidak ada": 2,
  "Serumen::Tidak Ada": 2,
  "Serumen::Ada serumen": 1,
  "Serumen::Ada": 1,

  "Tonsil::Sudah tonsilektomi": 2,
  "Tonsil::T0 : T1 – T1": 2,
  "Tonsil::T0 : T1 - T1": 2,
  "Tonsil::T0 - T1": 2,
  "Tonsil::T0:T1-T1": 2,
  "Tonsil::T0 : T2a- T2a": 1,
  "Tonsil::T0 : T2a - T2a": 1,
  "Tonsil::T0 - T2a": 1,
  "Tonsil::T2a - T2a": 1,
  "Tonsil::T0 : T2b- T2b": -1,
  "Tonsil::T0 : T2b - T2b": -1,
  "Tonsil::T0 - T2b": -1,
  "Tonsil::T2b - T2b": -1,
  "Tonsil::T0 : T3 – T3": 0,
  "Tonsil::T0 : T3 - T3": 0,
  "Tonsil::T2 - T3": 0,
  "Tonsil::T3 - T3": 0,

  "Rhinitis Alergi (divide)::(-)": 2,
  "Rhinitis Alergi (divide)::Negative": 2,
  "Rhinitis Alergi (lividae)::(-)": 2,
  "Rhinitis Alergi (lividae)::Negative": 2,
  "Rhinitis Alergi (divide)::(+)": 1,
  "Rhinitis Alergi (divide)::Positive": 1,
  "Rhinitis Alergi (lividae)::(+)": 1,
  "Rhinitis Alergi (lividae)::Positive": 1,

  "Epistaksis 1 tahun terakhir::Tidak Ada": 1,
  "Epistaksis 1 tahun terakhir::Tidak ada": 1,
  "Epistaksis 1 tahun terakhir::Ada": -1,

  "Tes Garputala (Weber) 512 Hz::Normal": 1,
  "Tes Garputala (Weber) 512 Hz::Tidak Normal": 0,

  // PENYAKIT DALAM
  "Berat Badan (Kg)::Sesuai juknis": 1,
  "Berat Badan (Kg)::Tidak sesuai juknis": 0,
  "TB. (Cm)::Sesuai juknis": 1,
  "TB. (Cm)::Tidak sesuai juknis": 0,
  "Tanda Vital::Normal": 2,
  "Tanda Vital::Tidak Normal": 1,
  "Tato kulit::Tidak ada tato": 1,
  "Tato kulit::Ada tato": 0,
  "Tindik (selain anting) Wanita : hanya 1 / telinga::Tidak ada": 1,
  "Tindik (selain anting) Wanita : hanya 1 / telinga::Ada (pria) Wanita >1)": 0,
  "Pemeriksaan Fisik Jantung::Normal": 2,
  "Pemeriksaan Fisik Jantung::Tidak Normal": 0,
  "Pemeriksaan Fisik Paru::Normal": 2,
  "Pemeriksaan Fisik Paru::Tidak Normal": 0,

  "NT Epigastrum::Normal": 1,
  "NT Epigastrum::Tidak Normal": -2,
  "Hernia::Tidak ada": 1,
  "Hernia::Tidak Ada": 1,
  "Hernia::Ada": 0,
  "Benjolan::Tidak ada": 1,
  "Benjolan::Tidak Ada": 1,
  "Benjolan::Ada": 0,
  "Liver::Normal": 1,
  "Liver::Tidak Normal": -2,
  "Bising Usus::Normal": 1,
  "Bising Usus::Tidak Normal": -2,
  "Bekas Operasi (>6Bulan)::Normal": 1,
  "Bekas Operasi (>6Bulan)::Tidak Normal": -2,

  "Hemoroid eksterna::(-)": 1,
  "Hemoroid eksterna::Tidak Ada": 1,
  "Hemoroid eksterna::(+)": -1,
  "Hemoroid eksterna::Ada": -1,
  "Hemoroid interna::(-)": 1,
  "Hemoroid interna::Tidak Ada": 1,
  "Hemoroid interna::(+)": -1,
  "Hemoroid interna::Ada": -1,
  "Fisura ani::(-)": 1,
  "Fisura ani::Tidak Ada": 1,
  "Fisura ani::(+)": -1,
  "Fisura ani::Ada": -1,
  "Struktur/Prolaps recti::(-)": 1,
  "Struktur/Prolaps recti::Tidak Ada": 1,
  "Struktur/Prolaps recti::(+)": 0,
  "Struktur/Prolaps recti::Ada": 0,

  "Hidronefrosis::Normal": 1,
  "Hidronefrosis::Tidak Normal": 0,
  "Hidronefrosis::(-)": 1,
  "Hidronefrosis::(+)": 0,
  "Kelainan kongenital::Normal": 1,
  "Kelainan kongenital::Tidak Normal": 0,
  "Kelainan kongenital::(-)": 1,
  "Kelainan kongenital::(+)": 0,
  "Hipospadia::Normal": 1,
  "Hipospadia::Tidak Normal": 0,
  "Hipospadia::(-)": 1,
  "Hipospadia::(+)": 0,
  "Hidrokel::Normal": 1,
  "Hidrokel::Tidak Normal": 0,
  "Hidrokel::(-)": 1,
  "Hidrokel::(+)": 0,
  "Undescensus testis::Normal": 1,
  "Undescensus testis::Tidak Normal": 0,
  "Undescensus testis::(-)": 1,
  "Undescensus testis::(+)": 0,
  "Batu sal kemih::Normal": 1,
  "Batu sal kemih::Tidak Normal": 0,
  "Batu sal kemih::(-)": 1,
  "Batu sal kemih::(+)": 0,
  "Cystitis akut / kronis::Normal": 1,
  "Cystitis akut / kronis::Tidak Normal": 0,
  "Cystitis akut / kronis::(-)": 1,
  "Cystitis akut / kronis::(+)": 0,
  "Post operasi varikokel::Normal": 1,
  "Post operasi varikokel::Tidak Normal": 0,
  "Post operasi varikokel::(-)": 1,
  "Post operasi varikokel::(+)": 0,
  "Phimosis::Normal": 1,
  "Phimosis::Tidak Normal": 0,
  "Phimosis::(-)": 1,
  "Phimosis::(+)": 0,

  // JANTUNG DAN PEMBULUH DARAH
  "Kelainan Anatomi Jantung::Tidak Ada": 2,
  "Kelainan Anatomi Jantung::Ada": 0,
  "Kelainan Irama Jantung::Tidak Ada": 2,
  "Kelainan Irama Jantung::Ada": 0,
  "Iskemik Miocardial::Tidak Ada": 2,
  "Iskemik Miocardial::Ada": 0,
  "Kelainan kongenital jantung::Tidak Ada": 2,
  "Kelainan kongenital jantung::Ada": 0,
  "Varises Tungkai (insufisiensi vena)::Tidak Ada": 2,
  "Varises Tungkai (insufisiensi vena)::Ada": 0,
  "Kelainan Arteri pada ekstremitas::Tidak Ada": 2,
  "Kelainan Arteri pada ekstremitas::Ada": 0,

  // ORTOPEDI
  "sindaktili::Tidak ada": 1,
  "sindaktili::Tidak Ada": 1,
  "sindaktili::Ada": 0,
  "polidaktili::Tidak ada": 1,
  "polidaktili::Tidak Ada": 1,
  "polidaktili::Ada": 0,
  "spina bifida::Tidak ada": 1,
  "spina bifida::Tidak Ada": 1,
  "spina bifida::Ada": 0,
  "mallet finger::Tidak ada": 1,
  "mallet finger::Tidak Ada": 1,
  "mallet finger::Ada": 0,
  "Hiperekstensi lengan::Tidak ada": 1,
  "Hiperekstensi lengan::Tidak Ada": 1,
  "Hiperekstensi lengan::Ada": 0,

  "Hammer toe::Tidak ada": 1,
  "Hammer toe::Tidak Ada": 1,
  "Hammer toe::Ada": 0,
  "Hallux valgus::Tidak ada": 1,
  "Hallux valgus::Tidak Ada": 1,
  "Hallux valgus::Ada": 0,
  "Webbed toe::Tidak ada": 1,
  "Webbed toe::Tidak Ada": 1,
  "Webbed toe::Ada": 0,
  "O/X bean::Tidak ada": 1,
  "O/X bean::Tidak Ada": 1,
  "O/X bean::O/X been toleransi": 1,
  "O/X bean::Ada": 0,
  "Pes planus / kaki datar::Tidak ada": 1,
  "Pes planus / kaki datar::Tidak Ada": 1,
  "Pes planus / kaki datar::<5cm": 1,
  "Pes planus / kaki datar::Ada": 0,
  "Polidactily::Tidak ada": 1,
  "Polidactily::Tidak Ada": 1,
  "Polidactily::Ada": 0,
  "Hiperekstensi kaki::Tidak ada": 1,
  "Hiperekstensi kaki::Tidak Ada": 1,
  "Hiperekstensi kaki::Ada": 0,
  "General Laxity::Tidak ada": 1,
  "General Laxity::Tidak Ada": 1,
  "General Laxity::Ada": 0,

  "Skoliosis::Tidak ada": 2,
  "Skoliosis::Tidak Ada": 2,
  "Skoliosis::Ringan": -1,
  "Skoliosis::Sedang / Berat": 0,
  "Skoliosis::Sedang/Berat": 0,
  "Kifosis::Tidak ada": 2,
  "Kifosis::Tidak Ada": 2,
  "Kifosis::Ringan": -1,
  "Kifosis::Sedang / Berat": 0,
  "Kifosis::Sedang/Berat": 0,
  "Lordosis::Tidak ada": 2,
  "Lordosis::Tidak Ada": 2,
  "Lordosis::Ringan": -1,
  "Lordosis::Sedang / Berat": 0,
  "Lordosis::Sedang/Berat": 0,

  // RADIOLOGI
  "Rontgen Whole Spine AP Lateral >> Skoliosis::Tidak ada": 2,
  "Rontgen Whole Spine AP Lateral >> Skoliosis::Tidak Ada": 2,
  "Rontgen Whole Spine AP Lateral >> Skoliosis::TA": 2,
  "Rontgen Whole Spine AP Lateral >> Skoliosis::Ringan": -1,
  "Rontgen Whole Spine AP Lateral >> Skoliosis::Sedang": 0,
  "Rontgen Whole Spine AP Lateral >> Skoliosis::Berat": 0,
  "Rontgen Whole Spine AP Lateral >> Skoliosis::Sedang / Berat": 0,
  "Rontgen Whole Spine AP Lateral >> Skoliosis::Sedang/Berat": 0,

  "Rontgen Whole Spine AP Lateral >> Kifosis::Tidak ada": 2,
  "Rontgen Whole Spine AP Lateral >> Kifosis::Tidak Ada": 2,
  "Rontgen Whole Spine AP Lateral >> Kifosis::TA": 2,
  "Rontgen Whole Spine AP Lateral >> Kifosis::Ringan": -1,
  "Rontgen Whole Spine AP Lateral >> Kifosis::Sedang": 0,
  "Rontgen Whole Spine AP Lateral >> Kifosis::Berat": 0,
  "Rontgen Whole Spine AP Lateral >> Kifosis::Sedang / Berat": 0,
  "Rontgen Whole Spine AP Lateral >> Kifosis::Sedang/Berat": 0,

  "Rontgen Whole Spine AP Lateral >> Lordosis::Tidak ada": 2,
  "Rontgen Whole Spine AP Lateral >> Lordosis::Tidak Ada": 2,
  "Rontgen Whole Spine AP Lateral >> Lordosis::TA": 2,
  "Rontgen Whole Spine AP Lateral >> Lordosis::Ringan": -1,
  "Rontgen Whole Spine AP Lateral >> Lordosis::Sedang": 0,
  "Rontgen Whole Spine AP Lateral >> Lordosis::Berat": 0,
  "Rontgen Whole Spine AP Lateral >> Lordosis::Sedang / Berat": 0,
  "Rontgen Whole Spine AP Lateral >> Lordosis::Sedang/Berat": 0,
};


const GENERIC_SCORE_RULES: Record<string, Record<string, number>> = {
  penyakit_dalam: {
    "Normal": 1,
    "Tidak Normal": 0,
    "Sesuai juknis": 1,
    "Tidak sesuai juknis": 0,
    "Tidak ada tato": 1,
    "Ada tato": 0,
    "Tidak ada": 1,
    "Tidak Ada": 1,
    "Ada": 0,
    "(-)": 1,
    "(+)": 0,
    "Ada (pria) Wanita >1)": 0,
  },
  ortopedi: {
    "Tidak ada": 1,
    "Tidak Ada": 1,
    "Ada": 0,
    "Ringan": -1,
    "Sedang": 0,
    "Berat": 0,
    "Sedang / Berat": 0,
    "Sedang/Berat": 0,
  },
  radiologi: {
    "Tidak ada": 2,
    "Tidak Ada": 2,
    "TA": 2,
    "Ringan": -1,
    "Sedang": 0,
    "Berat": 0,
    "Sedang / Berat": 0,
    "Sedang/Berat": 0,
  },
};

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
      "Kehilangan Gigi bagian depan",
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
      "Rhinitis Alergi (divide)",
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
      "Hidrokel",
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
      "O/X bean",
      "Pes planus / kaki datar",
      "Polidactily",
      "Hiperekstensi kaki",
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

const VALUE_FIELD_BY_PARAMETER: Record<string, string> = {
  [normalizeCapaskaKey("Lensakontak/ kaca mata")]: "Value Lensakontak/ kaca mata",
  [normalizeCapaskaKey("Tes buta warna")]: "Value buta warna",
  [normalizeCapaskaKey("Strabismus / Juling")]: "Value Strabismus / Juling",
  [normalizeCapaskaKey("Pemeriksaan Visus OD  / OS")]: "Value Pemeriksaan Visus OD  / OS",
  [normalizeCapaskaKey("Tindik (selain anting) Wanita : hanya 1 / telinga")]: "Value (selain anting) Wanita : hanya 1 / telinga",
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
    .replace(/[\s\n\r\t.,\-_\/\\><:;()]/g, "");
}

export function parseCapaskaOptions(config: any) {
  try {
    const parsed = JSON.parse(config || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function scoreCapaskaChoice(param: any, selectedValue: string) {
  const name = String(param?.name || "");
  const category = String(param?.category || "").toLowerCase();

  const exact = SCORE_RULES[`${name}::${selectedValue}`];
  if (typeof exact === "number") return exact;

  if (
    category.includes("penyakit dalam") ||
    category.includes("abdomen") ||
    category.includes("rektum") ||
    category.includes("urogenitalia")
  ) {
    return GENERIC_SCORE_RULES.penyakit_dalam[selectedValue] ?? 0;
  }

  if (category.includes("ortopedi") || category.includes("gerak") || category.includes("vertebra")) {
    return GENERIC_SCORE_RULES.ortopedi[selectedValue] ?? 0;
  }

  if (category.includes("radiologi") || category.includes("rontgen")) {
    return GENERIC_SCORE_RULES.radiologi[selectedValue] ?? 0;
  }

  return 0;
}

export function getCapaskaValueFieldName(parameterName: string) {
  return VALUE_FIELD_BY_PARAMETER[normalizeCapaskaKey(parameterName)] || `Value ${parameterName}`;
}

export function isCapaskaValueOrScoreParameter(param: any) {
  const name = String(param?.name || "").toLowerCase();
  return name.startsWith("value ") || name.startsWith("score ") || name.startsWith("total score");
}

function clampDomainScore(rawScore: number, targetMax: number) {
  return roundScore(Math.max(0, Math.min(targetMax, rawScore)));
}

const NOT_RECOMMENDED_RULES: Array<{ parameter: string; values: string[] }> = [
  // MATA
  { parameter: "Tes buta warna", values: ["Buta warna parsial", "Buta warna total"] },
  { parameter: "Pemeriksaan Visus OD  / OS", values: ["<6/12"] },

  // GIGI
  { parameter: "Caries Dentis", values: [">3 caries"] },
  { parameter: "Impaksi gigi", values: [">=4 gigi", "≥4 gigi", ">4 gigi"] },
  { parameter: "Kehilangan Gigi bagian depan", values: [">2 gigi"] },
  { parameter: "Kehilangan Gigi (Baik depan maupun belakang)", values: [">2 gigi"] },

  // THT
  { parameter: "Membran timpani", values: ["Tidak intak", "Tidak Intak"] },
  { parameter: "Tonsil", values: ["T0 : T3 – T3", "T0 : T3 - T3", "T2 - T3", "T3 - T3"] },
  { parameter: "Tes Garputala (Weber) 512 Hz", values: ["Tidak Normal"] },

  // PENYAKIT DALAM
  { parameter: "Berat Badan (Kg)", values: ["Tidak sesuai juknis"] },
  { parameter: "TB. (Cm)", values: ["Tidak sesuai juknis"] },
  { parameter: "Tato kulit", values: ["Ada tato"] },
  { parameter: "Tindik (selain anting) Wanita : hanya 1 / telinga", values: ["Ada (pria) Wanita >1)"] },
  { parameter: "Hernia", values: ["Ada"] },
  { parameter: "Benjolan", values: ["Ada"] },
  { parameter: "Struktur/Prolaps recti", values: ["Ada", "(+)"] },
  { parameter: "Undescensus testis", values: ["Tidak Normal", "(+)"] },

  // JANTUNG DAN PEMBULUH DARAH
  { parameter: "Kelainan Anatomi Jantung", values: ["Ada"] },
  { parameter: "Kelainan Irama Jantung", values: ["Ada"] },
  { parameter: "Iskemik Miocardial", values: ["Ada"] },
  { parameter: "Kelainan kongenital jantung", values: ["Ada"] },
  { parameter: "Kelainan Arteri pada ekstremitas", values: ["Ada"] },

  // ORTOPEDI
  { parameter: "polidaktili", values: ["Ada"] },
  { parameter: "Hiperekstensi lengan", values: ["Ada"] },
  { parameter: "Hallux valgus", values: ["Ada"] },
  { parameter: "Polidactily", values: ["Ada"] },
  { parameter: "Skoliosis", values: ["Sedang / Berat", "Sedang/Berat"] },
  { parameter: "Kifosis", values: ["Sedang / Berat", "Sedang/Berat"] },
  { parameter: "Lordosis", values: ["Sedang / Berat", "Sedang/Berat"] },

  // RADIOLOGI
  { parameter: "Rontgen Whole Spine AP Lateral >> Skoliosis", values: ["Sedang", "Berat", "Sedang / Berat", "Sedang/Berat"] },
  { parameter: "Rontgen Whole Spine AP Lateral >> Kifosis", values: ["Sedang", "Berat", "Sedang / Berat", "Sedang/Berat"] },
  { parameter: "Rontgen Whole Spine AP Lateral >> Lordosis", values: ["Sedang", "Berat", "Sedang / Berat", "Sedang/Berat"] },
];

function normalizeChoiceForCompare(value: any) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isPotentialRedFlag(param: any, selectedValue: string, score: number) {
  const parameterKey = normalizeCapaskaKey(param?.name || "");
  const selected = normalizeChoiceForCompare(selectedValue);

  return NOT_RECOMMENDED_RULES.some((rule) => {
    if (normalizeCapaskaKey(rule.parameter) !== parameterKey) return false;

    return rule.values.some((value) => normalizeChoiceForCompare(value) === selected);
  });
}

export function computeCapaskaDerivedValues(parameters: any[], inputValues: Record<string, string>) {
  const next = { ...inputValues };
  const byName = new Map<string, any>();

  parameters.forEach((p) => {
    byName.set(normalizeCapaskaKey(p.name), p);
  });

  parameters.forEach((p) => {
    if (String(p.input_type || "").toLowerCase() !== "radio") return;

    const selected = next[p.id];
    if (!selected) return;

    const score = scoreCapaskaChoice(p, selected);
    const valueFieldName = getCapaskaValueFieldName(String(p.name || ""));
    const valueParam = byName.get(normalizeCapaskaKey(valueFieldName));

    if (valueParam) {
      next[valueParam.id] = String(score);
    }
  });

  const scoreOf = (name: string) => {
    const p = byName.get(normalizeCapaskaKey(name));
    if (!p) return 0;
    const selected = next[p.id];
    if (!selected) return 0;
    return scoreCapaskaChoice(p, selected);
  };

  const setRawTotal = (totalName: string, names: string[]) => {
    const totalParam = byName.get(normalizeCapaskaKey(totalName));
    if (!totalParam) return;

    const total = names.reduce((sum, name) => sum + scoreOf(name), 0);
    next[totalParam.id] = String(total);
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
    "Hidrokel",
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
    "O/X bean",
    "Pes planus / kaki datar",
    "Polidactily",
    "Hiperekstensi kaki",
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
    const totalParam = byName.get(normalizeCapaskaKey(domain.totalParameterName));
    if (!totalParam) continue;

    const rawMax = domain.components.length * 2;
    const rawTotal = domain.components.reduce((sum, name) => sum + scoreOf(name), 0);
    const normalized = clampDomainScore(rawTotal, domain.maxScore);
    next[totalParam.id] = String(normalized);
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
    const param = byName.get(normalizeCapaskaKey(name));
    if (!param) return { param: null, value: "" };

    const value = String(resultMap.get(Number(param.id)) || "").trim();
    return { param, value };
  };

  for (const domain of CAPASKA_DOMAIN_RULES) {
    let rawTotal = 0;
    let rawCount = 0;
    const rawMax = domain.components.length * 2;

    for (const componentName of domain.components) {
      const { param, value } = getSelected(componentName);
      if (!param || !value) continue;

      const score = scoreCapaskaChoice(param, value);
      rawTotal += score;
      rawCount += 1;
      touched = true;

      if (isPotentialRedFlag(param, value, score)) {
        result.redFlags.push(`${domain.label}: ${String(param.name || componentName)} = ${value}`);
      }
    }

    if (rawCount > 0) {
      result.rawDomainScores[domain.key] = rawTotal;
      result.domainScores[domain.key] = clampDomainScore(rawTotal, domain.maxScore);
      continue;
    }

    const totalParam = byName.get(normalizeCapaskaKey(domain.totalParameterName));
    const totalValue = totalParam ? parseNumber(resultMap.get(Number(totalParam.id))) : null;

    if (totalValue !== null) {
      result.rawDomainScores[domain.key] = totalValue;

      if (rawMax !== domain.maxScore && totalValue <= rawMax) {
        result.domainScores[domain.key] = clampDomainScore(totalValue, domain.maxScore);
      } else {
        result.domainScores[domain.key] = roundScore(Math.max(0, Math.min(domain.maxScore, totalValue)));
      }

      touched = true;
    }
  }

  if (!touched) return result;

  const totalBeforePenalty = roundScore(
    CAPASKA_DOMAIN_RULES.reduce((sum, domain) => sum + (result.domainScores[domain.key] || 0), 0)
  );

  result.notRecommended = result.redFlags.length > 0;
  result.totalBeforePenalty = totalBeforePenalty;
  result.penalty = result.notRecommended ? 10 : 0;
  result.totalScore = roundScore(Math.max(0, totalBeforePenalty - result.penalty));

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
