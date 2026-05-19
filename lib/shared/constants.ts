export const PROGRAM_CAPASKA = "capaska";
export const PROGRAM_CORPORATE = "corporate";
export const PROGRAM_ALL = "all";

export const CAPASKA_STAGES = [
  {
    post_name: "Registrasi CAPASKA",
    description: "Registrasi dan verifikasi identitas peserta CAPASKA",
    username: "capaska_registrasi",
    password: "registrasi123",
    operator_name: "Operator CAPASKA Registrasi",
    parameter_name: "Status Registrasi CAPASKA",
    sort_order: 10
  },
  {
    post_name: "Kesehatan Mata",
    description: "Input pemeriksaan kesehatan mata CAPASKA",
    username: "capaska_mata",
    password: "mata123",
    operator_name: "Operator CAPASKA Mata",
    parameter_name: "Status Pemeriksaan Mata",
    sort_order: 20
  },
  {
    post_name: "Penyakit Dalam",
    description: "Input pemeriksaan penyakit dalam CAPASKA",
    username: "capaska_pd",
    password: "pd123",
    operator_name: "Operator CAPASKA Penyakit Dalam",
    parameter_name: "Status Pemeriksaan Penyakit Dalam",
    sort_order: 30
  },
  {
    post_name: "Kesehatan Gigi & Mulut + Dental panoramik",
    description: "Input pemeriksaan kesehatan gigi, mulut, dan dental panoramik CAPASKA",
    username: "capaska_gigi",
    password: "gigi123",
    operator_name: "Operator CAPASKA Gigi",
    parameter_name: "Status Pemeriksaan Gigi & Mulut",
    sort_order: 40
  },
  {
    post_name: "Kesehatan THT",
    description: "Input pemeriksaan THT CAPASKA",
    username: "capaska_tht",
    password: "tht123",
    operator_name: "Operator CAPASKA THT",
    parameter_name: "Status Pemeriksaan THT",
    sort_order: 50
  },
  {
    post_name: "Kesehatan Jantung dan Pembuluh Darah",
    description: "Input pemeriksaan kesehatan jantung dan pembuluh darah CAPASKA",
    username: "capaska_jantung",
    password: "jantung123",
    operator_name: "Operator CAPASKA Jantung",
    parameter_name: "Status Pemeriksaan Jantung dan Pembuluh Darah",
    sort_order: 60
  },
  {
    post_name: "Ortopedi",
    description: "Input pemeriksaan ortopedi CAPASKA",
    username: "capaska_ortopedi",
    password: "ortopedi123",
    operator_name: "Operator CAPASKA Ortopedi",
    parameter_name: "Status Pemeriksaan Ortopedi",
    sort_order: 70
  },
  {
    post_name: "Radiologi",
    description: "Input pemeriksaan radiologi CAPASKA",
    username: "capaska_radiologi",
    password: "radiologi123",
    operator_name: "Operator CAPASKA Radiologi",
    parameter_name: "Status Pemeriksaan Radiologi",
    sort_order: 80
  }
];

export function stageOrder(postName: string) {
  const found = CAPASKA_STAGES.find((x) => x.post_name.toLowerCase() === String(postName || "").toLowerCase());
  return found?.sort_order ?? 500;
}
