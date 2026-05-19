export const PROGRAM_CAPASKA = "capaska";
export const PROGRAM_CORPORATE = "corporate";
export const PROGRAM_ALL = "all";

export type ParameterSeed = {
  name: string;
  category?: string;
  unit?: string;
  input_type?: "text" | "number" | "select" | "textarea";
  normal_value?: string;
  reference_text?: string;
  config_json?: string[];
  is_required?: number;
  sort_order?: number;
};

export type StageSeed = {
  post_name: string;
  description: string;
  username: string;
  password: string;
  operator_name: string;
  sort_order: number;
  parameters: ParameterSeed[];
};

export const CAPASKA_STAGES: StageSeed[] = [
  {
    post_name: "Registrasi CAPASKA",
    description: "Registrasi dan verifikasi identitas peserta CAPASKA",
    username: "capaska_registrasi",
    password: "registrasi123",
    operator_name: "Operator CAPASKA Registrasi",
    sort_order: 10,
    parameters: [
      { name: "Status Registrasi CAPASKA", input_type: "select", config_json: ["", "Done", "Belum", "Perlu Verifikasi"], sort_order: 10 },
      { name: "Identitas Terverifikasi", input_type: "select", config_json: ["", "Ya", "Tidak"], sort_order: 20 },
      { name: "Barcode / Label Terpasang", input_type: "select", config_json: ["", "Ya", "Tidak"], sort_order: 30 },
      { name: "Catatan Registrasi", input_type: "textarea", sort_order: 40 }
    ]
  },
  {
    post_name: "Kesehatan Mata",
    description: "Input pemeriksaan kesehatan mata CAPASKA",
    username: "capaska_mata",
    password: "mata123",
    operator_name: "Operator CAPASKA Mata",
    sort_order: 20,
    parameters: [
      { name: "Visus OD", input_type: "text", sort_order: 10 },
      { name: "Visus OS", input_type: "text", sort_order: 20 },
      { name: "Buta Warna", input_type: "select", config_json: ["", "Normal", "Tidak Normal"], sort_order: 30 },
      { name: "Kelainan Mata", input_type: "textarea", sort_order: 40 },
      { name: "Kesimpulan Mata", input_type: "select", config_json: ["", "Normal", "Abnormal", "Perlu Review"], sort_order: 50 }
    ]
  },
  {
    post_name: "Penyakit Dalam",
    description: "Input pemeriksaan penyakit dalam CAPASKA",
    username: "capaska_pd",
    password: "pd123",
    operator_name: "Operator CAPASKA Penyakit Dalam",
    sort_order: 30,
    parameters: [
      { name: "Tekanan Darah", unit: "mmHg", input_type: "text", sort_order: 10 },
      { name: "Nadi", unit: "x/menit", input_type: "number", sort_order: 20 },
      { name: "Riwayat Penyakit", input_type: "textarea", sort_order: 30 },
      { name: "Pemeriksaan Fisik Penyakit Dalam", input_type: "textarea", sort_order: 40 },
      { name: "Kesimpulan Penyakit Dalam", input_type: "select", config_json: ["", "Normal", "Abnormal", "Perlu Review"], sort_order: 50 }
    ]
  },
  {
    post_name: "Kesehatan Gigi & Mulut + Dental panoramik",
    description: "Input pemeriksaan kesehatan gigi, mulut, dan dental panoramik CAPASKA",
    username: "capaska_gigi",
    password: "gigi123",
    operator_name: "Operator CAPASKA Gigi",
    sort_order: 40,
    parameters: [
      { name: "Karies", input_type: "select", config_json: ["", "Tidak Ada", "Ada"], sort_order: 10 },
      { name: "Kebersihan Mulut", input_type: "select", config_json: ["", "Baik", "Cukup", "Kurang"], sort_order: 20 },
      { name: "Dental Panoramik", input_type: "select", config_json: ["", "Normal", "Abnormal", "Belum Ada"], sort_order: 30 },
      { name: "Catatan Gigi dan Mulut", input_type: "textarea", sort_order: 40 },
      { name: "Kesimpulan Gigi", input_type: "select", config_json: ["", "Normal", "Abnormal", "Perlu Review"], sort_order: 50 }
    ]
  },
  {
    post_name: "Kesehatan THT",
    description: "Input pemeriksaan THT CAPASKA",
    username: "capaska_tht",
    password: "tht123",
    operator_name: "Operator CAPASKA THT",
    sort_order: 50,
    parameters: [
      { name: "Telinga", input_type: "textarea", sort_order: 10 },
      { name: "Hidung", input_type: "textarea", sort_order: 20 },
      { name: "Tenggorokan", input_type: "textarea", sort_order: 30 },
      { name: "Audiometri", input_type: "select", config_json: ["", "Normal", "Abnormal", "Belum Ada"], sort_order: 40 },
      { name: "Kesimpulan THT", input_type: "select", config_json: ["", "Normal", "Abnormal", "Perlu Review"], sort_order: 50 }
    ]
  },
  {
    post_name: "Kesehatan Jantung dan Pembuluh Darah",
    description: "Input pemeriksaan kesehatan jantung dan pembuluh darah CAPASKA",
    username: "capaska_jantung",
    password: "jantung123",
    operator_name: "Operator CAPASKA Jantung",
    sort_order: 60,
    parameters: [
      { name: "EKG", input_type: "select", config_json: ["", "Normal", "Abnormal", "Belum Ada"], sort_order: 10 },
      { name: "Tekanan Darah Jantung", unit: "mmHg", input_type: "text", sort_order: 20 },
      { name: "Keluhan Jantung", input_type: "textarea", sort_order: 30 },
      { name: "Pemeriksaan Jantung", input_type: "textarea", sort_order: 40 },
      { name: "Kesimpulan Jantung dan Pembuluh Darah", input_type: "select", config_json: ["", "Normal", "Abnormal", "Perlu Review"], sort_order: 50 }
    ]
  },
  {
    post_name: "Ortopedi",
    description: "Input pemeriksaan ortopedi CAPASKA",
    username: "capaska_ortopedi",
    password: "ortopedi123",
    operator_name: "Operator CAPASKA Ortopedi",
    sort_order: 70,
    parameters: [
      { name: "Postur", input_type: "select", config_json: ["", "Normal", "Tidak Normal"], sort_order: 10 },
      { name: "Range of Motion", input_type: "textarea", sort_order: 20 },
      { name: "Kelainan Tulang / Sendi", input_type: "textarea", sort_order: 30 },
      { name: "Kesimpulan Ortopedi", input_type: "select", config_json: ["", "Normal", "Abnormal", "Perlu Review"], sort_order: 40 }
    ]
  },
  {
    post_name: "Radiologi",
    description: "Input pemeriksaan radiologi CAPASKA",
    username: "capaska_radiologi",
    password: "radiologi123",
    operator_name: "Operator CAPASKA Radiologi",
    sort_order: 80,
    parameters: [
      { name: "Foto Thorax", input_type: "select", config_json: ["", "Normal", "Abnormal", "Belum Ada"], sort_order: 10 },
      { name: "Catatan Radiologi", input_type: "textarea", sort_order: 20 },
      { name: "Kesimpulan Radiologi", input_type: "select", config_json: ["", "Normal", "Abnormal", "Perlu Review"], sort_order: 30 }
    ]
  }
];

export const CORPORATE_STAGES: StageSeed[] = [
  {
    post_name: "Registrasi Corporate",
    description: "Registrasi peserta MCU corporate",
    username: "corp_registrasi",
    password: "registrasi123",
    operator_name: "Operator Corporate Registrasi",
    sort_order: 10,
    parameters: [
      { name: "Status Registrasi Corporate", input_type: "select", config_json: ["", "Done", "Belum", "Perlu Verifikasi"], sort_order: 10 },
      { name: "Identitas Terverifikasi", input_type: "select", config_json: ["", "Ya", "Tidak"], sort_order: 20 }
    ]
  },
  {
    post_name: "Antropometri",
    description: "Input antropometri MCU corporate",
    username: "antro",
    password: "antro123",
    operator_name: "Operator Antropometri",
    sort_order: 20,
    parameters: [
      { name: "Berat Badan", unit: "kg", input_type: "number", sort_order: 10 },
      { name: "Tinggi Badan", unit: "cm", input_type: "number", sort_order: 20 },
      { name: "BMI", unit: "kg/m2", input_type: "number", sort_order: 30 },
      { name: "Lingkar Perut", unit: "cm", input_type: "number", sort_order: 40 }
    ]
  },
  {
    post_name: "Vital Sign",
    description: "Input vital sign MCU corporate",
    username: "vital",
    password: "vital123",
    operator_name: "Operator Vital Sign",
    sort_order: 30,
    parameters: [
      { name: "Tekanan Darah Sistolik", unit: "mmHg", input_type: "number", sort_order: 10 },
      { name: "Tekanan Darah Diastolik", unit: "mmHg", input_type: "number", sort_order: 20 },
      { name: "Nadi", unit: "x/menit", input_type: "number", sort_order: 30 },
      { name: "Suhu", unit: "°C", input_type: "number", sort_order: 40 },
      { name: "Respirasi", unit: "x/menit", input_type: "number", sort_order: 50 }
    ]
  },
  {
    post_name: "Laboratorium",
    description: "Input laboratorium MCU corporate",
    username: "lab",
    password: "lab123",
    operator_name: "Operator Laboratorium",
    sort_order: 40,
    parameters: [
      { name: "Hemoglobin", unit: "g/dL", input_type: "number", sort_order: 10 },
      { name: "Leukosit", unit: "/uL", input_type: "number", sort_order: 20 },
      { name: "Gula Darah Puasa", unit: "mg/dL", input_type: "number", sort_order: 30 },
      { name: "Kolesterol Total", unit: "mg/dL", input_type: "number", sort_order: 40 },
      { name: "Asam Urat", unit: "mg/dL", input_type: "number", sort_order: 50 },
      { name: "Kesimpulan Laboratorium", input_type: "select", config_json: ["", "Normal", "Abnormal", "Perlu Review"], sort_order: 60 }
    ]
  },
  {
    post_name: "Pemeriksaan Dokter",
    description: "Input pemeriksaan dokter MCU corporate",
    username: "dokter",
    password: "dokter123",
    operator_name: "Dokter Pemeriksa Corporate",
    sort_order: 50,
    parameters: [
      { name: "Keluhan Utama", input_type: "textarea", sort_order: 10 },
      { name: "Anamnesis", input_type: "textarea", sort_order: 20 },
      { name: "Pemeriksaan Fisik", input_type: "textarea", sort_order: 30 },
      { name: "Diagnosis", input_type: "textarea", sort_order: 40 },
      { name: "Saran", input_type: "textarea", sort_order: 50 },
      { name: "Kesimpulan MCU", input_type: "select", config_json: ["", "Fit", "Fit dengan Catatan", "Unfit", "Perlu Pemeriksaan Lanjutan"], sort_order: 60 }
    ]
  },
  {
    post_name: "Gigi Corporate",
    description: "Input pemeriksaan gigi MCU corporate",
    username: "gigi",
    password: "gigi123",
    operator_name: "Operator Gigi Corporate",
    sort_order: 60,
    parameters: [
      { name: "Status Gigi", input_type: "textarea", sort_order: 10 },
      { name: "Karies", input_type: "select", config_json: ["", "Tidak Ada", "Ada"], sort_order: 20 },
      { name: "Kesimpulan Gigi Corporate", input_type: "select", config_json: ["", "Normal", "Abnormal", "Perlu Review"], sort_order: 30 }
    ]
  }
];

export function stageOrder(postName: string) {
  const allStages = [...CAPASKA_STAGES, ...CORPORATE_STAGES];
  const found = allStages.find((x) => x.post_name.toLowerCase() === String(postName || "").toLowerCase());
  return found?.sort_order ?? 500;
}
