export const PROGRAM_CAPASKA = "capaska";
export const PROGRAM_CORPORATE = "corporate";
export const PROGRAM_ALL = "all";

export type ParameterSeed = {
  name: string;
  category?: string;
  unit?: string;
  input_type?: "text" | "number" | "select" | "radio" | "textarea" | "date";
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
      {
        name: "Status Registrasi CAPASKA",
        input_type: "radio",
        config_json: [
          "Done",
          "Belum",
          "Perlu Verifikasi"
        ],
        sort_order: 10
      },
      {
        name: "Identitas Terverifikasi",
        input_type: "radio",
        config_json: [
          "Ya",
          "Tidak"
        ],
        sort_order: 20
      },
      {
        name: "Barcode / Label Terpasang",
        input_type: "radio",
        config_json: [
          "Ya",
          "Tidak"
        ],
        sort_order: 30
      },
      {
        name: "Catatan Registrasi",
        input_type: "textarea",
        sort_order: 40
      }
    ]
  },
  {
    post_name: "Kesehatan Mata",
    description: "Input pemeriksaan kesehatan mata CAPASKA sesuai form reference",
    username: "capaska_mata",
    password: "mata123",
    operator_name: "Operator CAPASKA Mata",
    sort_order: 20,
    parameters: [
      {
        name: "Lensakontak / kaca mata",
        input_type: "radio",
        config_json: [
          "Menggunakan",
          "Tidak menggunakan"
        ],
        sort_order: 10
      },
      {
        name: "Value Lensakontak / kaca mata",
        input_type: "text",
        sort_order: 20
      },
      {
        name: "Tes buta warna",
        input_type: "radio",
        config_json: [
          "Tidak buta warna",
          "Buta warna parsial",
          "Buta warna total"
        ],
        sort_order: 30
      },
      {
        name: "Value buta warna",
        input_type: "text",
        sort_order: 40
      },
      {
        name: "Strabismus / Juling",
        input_type: "radio",
        config_json: [
          "(+)/(-)",
          "(-)/(+)",
          "(+)/(+)",
          "(-)/(-)"
        ],
        sort_order: 50
      },
      {
        name: "Value Strabismus / Juling",
        input_type: "text",
        sort_order: 60
      },
      {
        name: "Pemeriksaan Visus OD / OS",
        input_type: "radio",
        config_json: [
          "Normal 6/6",
          "<6/6 - 6/12",
          "<6/12"
        ],
        sort_order: 70
      },
      {
        name: "Value Pemeriksaan Visus OD / OS",
        input_type: "text",
        sort_order: 80
      },
      {
        name: "Total Score Kesehatan mata",
        input_type: "number",
        normal_value: "0",
        sort_order: 90
      }
    ]
  },
  {
    post_name: "Penyakit Dalam",
    description: "Input pemeriksaan penyakit dalam CAPASKA sesuai form reference",
    username: "capaska_pd",
    password: "pd123",
    operator_name: "Operator CAPASKA Penyakit Dalam",
    sort_order: 30,
    parameters: [
      {
        name: "Berat Badan (Kg)",
        input_type: "radio",
        config_json: [
          "Sesuai juknis",
          "Tidak sesuai juknis"
        ],
        sort_order: 10
      },
      {
        name: "BB (Kg)",
        unit: "Kg",
        input_type: "number",
        sort_order: 20
      },
      {
        name: "Value Berat Badan (Kg)",
        input_type: "text",
        sort_order: 30
      },
      {
        name: "TB. (Cm)",
        input_type: "radio",
        config_json: [
          "Sesuai juknis",
          "Tidak sesuai juknis"
        ],
        sort_order: 40
      },
      {
        name: "Tb (Cm)",
        unit: "Cm",
        input_type: "number",
        sort_order: 50
      },
      {
        name: "Value TB. (Cm)",
        input_type: "text",
        sort_order: 60
      },
      {
        name: "Tanda Vital",
        input_type: "radio",
        config_json: [
          "Normal",
          "Tidak Normal"
        ],
        sort_order: 70
      },
      {
        name: "Suhu/Nadi/Napas/tekanan darah",
        input_type: "text",
        sort_order: 80
      },
      {
        name: "Value Tanda Vital",
        input_type: "text",
        sort_order: 90
      },
      {
        name: "Tato kulit",
        input_type: "radio",
        config_json: [
          "Tidak ada tato",
          "Ada tato"
        ],
        sort_order: 100
      },
      {
        name: "Value Tato kulit",
        input_type: "text",
        sort_order: 110
      },
      {
        name: "Tindik (selain anting) Wanita : hanya 1 / telinga",
        input_type: "radio",
        config_json: [
          "Tidak ada",
          "Ada (pria) (Wanita >1)"
        ],
        sort_order: 120
      },
      {
        name: "Value (selain anting) Wanita : hanya 1 / telinga",
        input_type: "text",
        sort_order: 130
      },
      {
        name: "Pemeriksaan Fisik Jantung",
        input_type: "radio",
        config_json: [
          "Normal",
          "Tidak Normal"
        ],
        sort_order: 140
      },
      {
        name: "Value Pemeriksaan Fisik Jantung",
        input_type: "text",
        sort_order: 150
      },
      {
        name: "Pemeriksaan Fisik Paru",
        input_type: "radio",
        config_json: [
          "Normal",
          "Tidak Normal"
        ],
        sort_order: 160
      },
      {
        name: "Value Pemeriksaan Fisik Paru",
        input_type: "text",
        sort_order: 170
      },
      {
        name: "Abdomen - Hernia",
        category: "Pemeriksaan Abdomen",
        input_type: "radio",
        config_json: [
          "Normal",
          "Tidak Normal"
        ],
        sort_order: 180
      },
      {
        name: "Abdomen - NT Epigastrium",
        category: "Pemeriksaan Abdomen",
        input_type: "radio",
        config_json: [
          "Normal",
          "Tidak Normal"
        ],
        sort_order: 190
      },
      {
        name: "Abdomen - Benjolan",
        category: "Pemeriksaan Abdomen",
        input_type: "radio",
        config_json: [
          "Normal",
          "Tidak Normal"
        ],
        sort_order: 200
      },
      {
        name: "Abdomen - Liver",
        category: "Pemeriksaan Abdomen",
        input_type: "radio",
        config_json: [
          "Normal",
          "Tidak Normal"
        ],
        sort_order: 210
      },
      {
        name: "Abdomen - Bising Usus",
        category: "Pemeriksaan Abdomen",
        input_type: "radio",
        config_json: [
          "Normal",
          "Tidak Normal"
        ],
        sort_order: 220
      },
      {
        name: "Abdomen - Bekas Operasi (> 8 Bulan)",
        category: "Pemeriksaan Abdomen",
        input_type: "radio",
        config_json: [
          "Normal",
          "Tidak Normal"
        ],
        sort_order: 230
      },
      {
        name: "Score Abdomen",
        input_type: "number",
        normal_value: "0",
        sort_order: 240
      },
      {
        name: "Anus & Rektum - Hemoroid eksterna",
        category: "Pemeriksaan Anus & Rektum (Colok Dubur)",
        input_type: "radio",
        config_json: [
          "Normal",
          "Tidak Normal"
        ],
        sort_order: 250
      },
      {
        name: "Anus & Rektum - Hemoroid interna",
        category: "Pemeriksaan Anus & Rektum (Colok Dubur)",
        input_type: "radio",
        config_json: [
          "Normal",
          "Tidak Normal"
        ],
        sort_order: 260
      },
      {
        name: "Anus & Rektum - Fissura ani",
        category: "Pemeriksaan Anus & Rektum (Colok Dubur)",
        input_type: "radio",
        config_json: [
          "Normal",
          "Tidak Normal"
        ],
        sort_order: 270
      },
      {
        name: "Anus & Rektum - Striktur/Prolaps recti",
        category: "Pemeriksaan Anus & Rektum (Colok Dubur)",
        input_type: "radio",
        config_json: [
          "Normal",
          "Tidak Normal"
        ],
        sort_order: 280
      },
      {
        name: "Score Pemeriksaan Anus & Rektum (Colok Dubur)",
        input_type: "number",
        normal_value: "0",
        sort_order: 290
      },
      {
        name: "Urogenitalia - Hidronefrosis",
        category: "Pemeriksaan Urogenitalia",
        input_type: "radio",
        config_json: [
          "Normal",
          "Tidak Normal"
        ],
        sort_order: 300
      },
      {
        name: "Urogenitalia - Kelainan kongenital",
        category: "Pemeriksaan Urogenitalia",
        input_type: "radio",
        config_json: [
          "Normal",
          "Tidak Normal"
        ],
        sort_order: 310
      },
      {
        name: "Urogenitalia - Hipospadia",
        category: "Pemeriksaan Urogenitalia",
        input_type: "radio",
        config_json: [
          "Normal",
          "Tidak Normal"
        ],
        sort_order: 320
      },
      {
        name: "Urogenitalia - Hidrokel",
        category: "Pemeriksaan Urogenitalia",
        input_type: "radio",
        config_json: [
          "Normal",
          "Tidak Normal"
        ],
        sort_order: 330
      },
      {
        name: "Urogenitalia - Undescensus testis",
        category: "Pemeriksaan Urogenitalia",
        input_type: "radio",
        config_json: [
          "Normal",
          "Tidak Normal"
        ],
        sort_order: 340
      },
      {
        name: "Urogenitalia - Batu sal kemih",
        category: "Pemeriksaan Urogenitalia",
        input_type: "radio",
        config_json: [
          "Normal",
          "Tidak Normal"
        ],
        sort_order: 350
      },
      {
        name: "Urogenitalia - Cystitis akut/kronis",
        category: "Pemeriksaan Urogenitalia",
        input_type: "radio",
        config_json: [
          "Normal",
          "Tidak Normal"
        ],
        sort_order: 360
      },
      {
        name: "Urogenitalia - Post operasi varikokel",
        category: "Pemeriksaan Urogenitalia",
        input_type: "radio",
        config_json: [
          "Normal",
          "Tidak Normal"
        ],
        sort_order: 370
      },
      {
        name: "Urogenitalia - Phimosis",
        category: "Pemeriksaan Urogenitalia",
        input_type: "radio",
        config_json: [
          "Normal",
          "Tidak Normal"
        ],
        sort_order: 380
      },
      {
        name: "Score Urogenitalia",
        input_type: "number",
        normal_value: "0",
        sort_order: 390
      },
      {
        name: "Score total Pemeriksaan Penyakit Dalam",
        input_type: "number",
        normal_value: "0",
        sort_order: 400
      }
    ]
  },
  {
    post_name: "Kesehatan Gigi & Mulut + Dental panoramik",
    description: "Input pemeriksaan kesehatan gigi, mulut, dan dental panoramik CAPASKA sesuai form reference",
    username: "capaska_gigi",
    password: "gigi123",
    operator_name: "Operator CAPASKA Gigi",
    sort_order: 40,
    parameters: [
      {
        name: "Karang Gigi",
        input_type: "radio",
        config_json: [
          "Positive",
          "Negative"
        ],
        sort_order: 10
      },
      {
        name: "Value Karang Gigi",
        input_type: "text",
        sort_order: 20
      },
      {
        name: "Caries Dentis",
        input_type: "radio",
        config_json: [
          "0 caries",
          "1 caries",
          "2 caries",
          "3 caries",
          ">3 caries"
        ],
        sort_order: 30
      },
      {
        name: "Value Caries Dentis",
        input_type: "text",
        sort_order: 40
      },
      {
        name: "Tumpatan Gigi",
        input_type: "radio",
        config_json: [
          "0 tumpatan",
          "<5 tumpatan",
          ">5 tumpatan"
        ],
        sort_order: 50
      },
      {
        name: "Value Tumpatan Gigi",
        input_type: "text",
        sort_order: 60
      },
      {
        name: "Impaksi gigi",
        input_type: "radio",
        config_json: [
          "0 gigi",
          "1 gigi",
          "2 gigi",
          ">2 gigi"
        ],
        sort_order: 70
      },
      {
        name: "Value Impaksi gigi",
        input_type: "text",
        sort_order: 80
      },
      {
        name: "Kehilangan Gigi (Baik depan maupun belakang)",
        input_type: "radio",
        config_json: [
          "0 gigi",
          "1 gigi",
          "2 gigi",
          ">2 gigi"
        ],
        sort_order: 90
      },
      {
        name: "Value Kehilangan Gigi (Baik depan maupun belakang)",
        input_type: "text",
        sort_order: 100
      },
      {
        name: "Infeksi Gusi",
        input_type: "radio",
        config_json: [
          "Positive",
          "Negative"
        ],
        sort_order: 110
      },
      {
        name: "Value Infeksi Gusi",
        input_type: "text",
        sort_order: 120
      },
      {
        name: "Dental panoramik",
        input_type: "radio",
        config_json: [
          "Normal",
          "ditemukan kelainan"
        ],
        sort_order: 130
      },
      {
        name: "Value Dental panoramic",
        input_type: "text",
        sort_order: 140
      },
      {
        name: "bentuk kelainan Dental Panoramik",
        input_type: "text",
        sort_order: 150
      },
      {
        name: "Score total Pemeriksaan Kesehatan Gigi dan Mulut",
        input_type: "number",
        normal_value: "0",
        sort_order: 160
      }
    ]
  },
  {
    post_name: "Kesehatan THT",
    description: "Input pemeriksaan THT CAPASKA sesuai form reference",
    username: "capaska_tht",
    password: "tht123",
    operator_name: "Operator CAPASKA THT",
    sort_order: 50,
    parameters: [
      {
        name: "Membran timpani",
        input_type: "radio",
        config_json: [
          "Intak",
          "Tidak Intak"
        ],
        sort_order: 10
      },
      {
        name: "Value Membran timpani",
        input_type: "text",
        sort_order: 20
      },
      {
        name: "Serumen",
        input_type: "radio",
        config_json: [
          "Tidak ada",
          "Ada serumen"
        ],
        sort_order: 30
      },
      {
        name: "Value Serumen",
        input_type: "text",
        sort_order: 40
      },
      {
        name: "Tonsil",
        input_type: "radio",
        config_json: [
          "T0:T1 - T1 / Sudah tonsilektomi",
          "T1:T2 - T1",
          "T2:T2 - T2b",
          "T0:T2 - T2"
        ],
        sort_order: 50
      },
      {
        name: "Value Tonsil",
        input_type: "text",
        sort_order: 60
      },
      {
        name: "Rhinitis Alergi (Bividas)",
        input_type: "radio",
        config_json: [
          "Positive",
          "Negative"
        ],
        sort_order: 70
      },
      {
        name: "Value Rhinitis Alergi (Bividas)",
        input_type: "text",
        sort_order: 80
      },
      {
        name: "Epistaksis 1 tahun terakhir",
        input_type: "radio",
        config_json: [
          "Ada",
          "Tidak Ada"
        ],
        sort_order: 90
      },
      {
        name: "Value Epistaksis 1 tahun terakhir",
        input_type: "text",
        sort_order: 100
      },
      {
        name: "Tes Garputala (Weber) 512 Hz",
        input_type: "radio",
        config_json: [
          "Normal",
          "Tidak Normal"
        ],
        sort_order: 110
      },
      {
        name: "Value Garputala (Weber) 512 Hz",
        input_type: "text",
        sort_order: 120
      },
      {
        name: "Score total Pemeriksaan Kesehatan THT",
        input_type: "number",
        normal_value: "0",
        sort_order: 130
      }
    ]
  },
  {
    post_name: "Kesehatan Jantung dan Pembuluh Darah",
    description: "Input pemeriksaan kesehatan jantung dan pembuluh darah CAPASKA sesuai form reference",
    username: "capaska_jantung",
    password: "jantung123",
    operator_name: "Operator CAPASKA Jantung",
    sort_order: 60,
    parameters: [
      {
        name: "Kelainan Anatomi Jantung",
        input_type: "radio",
        config_json: [
          "Tidak Ada",
          "Ada"
        ],
        sort_order: 10
      },
      {
        name: "Value Kelainan Anatomi Jantung",
        input_type: "text",
        sort_order: 20
      },
      {
        name: "Kelainan Irama Jantung",
        input_type: "radio",
        config_json: [
          "Tidak Ada",
          "Ada"
        ],
        sort_order: 30
      },
      {
        name: "Value Kelainan Irama Jantung",
        input_type: "text",
        sort_order: 40
      },
      {
        name: "Iskemik Miocardial",
        input_type: "radio",
        config_json: [
          "Tidak Ada",
          "Ada"
        ],
        sort_order: 50
      },
      {
        name: "Value Iskemik Miocardial",
        input_type: "text",
        sort_order: 60
      },
      {
        name: "Kelainan kongenital jantung",
        input_type: "radio",
        config_json: [
          "Tidak Ada",
          "Ada"
        ],
        sort_order: 70
      },
      {
        name: "Value Kelainan kongenital jantung",
        input_type: "text",
        sort_order: 80
      },
      {
        name: "Varises Tungkai (insufisiensi vena)",
        input_type: "radio",
        config_json: [
          "Tidak Ada",
          "Ada"
        ],
        sort_order: 90
      },
      {
        name: "Value Varises Tungkai (insufisiensi vena)",
        input_type: "text",
        sort_order: 100
      },
      {
        name: "Kelainan Arteri pada ekstremitas",
        input_type: "radio",
        config_json: [
          "Tidak Ada",
          "Ada"
        ],
        sort_order: 110
      },
      {
        name: "Value Kelainan Arteri pada ekstremitas",
        input_type: "text",
        sort_order: 120
      },
      {
        name: "Score total Pemeriksaan Kesehatan Jantung dan Pembuluh Darah",
        input_type: "number",
        normal_value: "0",
        sort_order: 130
      }
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
      {
        name: "Pemeriksaan Ortopedi",
        input_type: "radio",
        config_json: [
          "Normal",
          "Tidak Normal"
        ],
        sort_order: 10
      },
      {
        name: "Catatan Ortopedi",
        input_type: "textarea",
        sort_order: 20
      },
      {
        name: "Score total Pemeriksaan Ortopedi",
        input_type: "number",
        normal_value: "0",
        sort_order: 30
      }
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
      {
        name: "Foto Thorax",
        input_type: "radio",
        config_json: [
          "Normal",
          "Abnormal",
          "Belum Ada"
        ],
        sort_order: 10
      },
      {
        name: "Catatan Radiologi",
        input_type: "textarea",
        sort_order: 20
      },
      {
        name: "Score total Pemeriksaan Radiologi",
        input_type: "number",
        normal_value: "0",
        sort_order: 30
      }
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
      {
        name: "Status Registrasi Corporate",
        input_type: "radio",
        config_json: [
          "Done",
          "Belum",
          "Perlu Verifikasi"
        ],
        sort_order: 10
      },
      {
        name: "Identitas Terverifikasi",
        input_type: "radio",
        config_json: [
          "Ya",
          "Tidak"
        ],
        sort_order: 20
      }
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
      {
        name: "Berat Badan",
        unit: "kg",
        input_type: "number",
        sort_order: 10
      },
      {
        name: "Tinggi Badan",
        unit: "cm",
        input_type: "number",
        sort_order: 20
      },
      {
        name: "BMI",
        unit: "kg/m2",
        input_type: "number",
        sort_order: 30
      },
      {
        name: "Lingkar Perut",
        unit: "cm",
        input_type: "number",
        sort_order: 40
      }
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
      {
        name: "Tekanan Darah Sistolik",
        unit: "mmHg",
        input_type: "number",
        sort_order: 10
      },
      {
        name: "Tekanan Darah Diastolik",
        unit: "mmHg",
        input_type: "number",
        sort_order: 20
      },
      {
        name: "Nadi",
        unit: "x/menit",
        input_type: "number",
        sort_order: 30
      },
      {
        name: "Suhu",
        unit: "°C",
        input_type: "number",
        sort_order: 40
      },
      {
        name: "Respirasi",
        unit: "x/menit",
        input_type: "number",
        sort_order: 50
      }
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
      {
        name: "Hemoglobin",
        unit: "g/dL",
        input_type: "number",
        sort_order: 10
      },
      {
        name: "Leukosit",
        unit: "/uL",
        input_type: "number",
        sort_order: 20
      },
      {
        name: "Gula Darah Puasa",
        unit: "mg/dL",
        input_type: "number",
        sort_order: 30
      },
      {
        name: "Kolesterol Total",
        unit: "mg/dL",
        input_type: "number",
        sort_order: 40
      },
      {
        name: "Asam Urat",
        unit: "mg/dL",
        input_type: "number",
        sort_order: 50
      },
      {
        name: "Kesimpulan Laboratorium",
        input_type: "radio",
        config_json: [
          "Normal",
          "Abnormal",
          "Perlu Review"
        ],
        sort_order: 60
      }
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
      {
        name: "Keluhan Utama",
        input_type: "textarea",
        sort_order: 10
      },
      {
        name: "Anamnesis",
        input_type: "textarea",
        sort_order: 20
      },
      {
        name: "Pemeriksaan Fisik",
        input_type: "textarea",
        sort_order: 30
      },
      {
        name: "Diagnosis",
        input_type: "textarea",
        sort_order: 40
      },
      {
        name: "Saran",
        input_type: "textarea",
        sort_order: 50
      },
      {
        name: "Kesimpulan MCU",
        input_type: "radio",
        config_json: [
          "Fit",
          "Fit dengan Catatan",
          "Unfit",
          "Perlu Pemeriksaan Lanjutan"
        ],
        sort_order: 60
      }
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
      {
        name: "Status Gigi",
        input_type: "textarea",
        sort_order: 10
      },
      {
        name: "Karies",
        input_type: "radio",
        config_json: [
          "Tidak Ada",
          "Ada"
        ],
        sort_order: 20
      },
      {
        name: "Kesimpulan Gigi Corporate",
        input_type: "radio",
        config_json: [
          "Normal",
          "Abnormal",
          "Perlu Review"
        ],
        sort_order: 30
      }
    ]
  }
];

export function stageOrder(postName: string) {
  const allStages = [...CAPASKA_STAGES, ...CORPORATE_STAGES];
  const found = allStages.find((x) => x.post_name.toLowerCase() === String(postName || "").toLowerCase());
  return found?.sort_order ?? 500;
}
