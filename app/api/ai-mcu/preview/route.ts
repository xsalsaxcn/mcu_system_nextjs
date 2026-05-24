import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = [
    {
      id: "1",
      name: "Budi Santoso",
      nomcu: "MCU-001",
      nik: "317100000001",
      gender: "Pria",
      age: "35",
      company: "PT Contoh Sehat",
      department: "Operasional",
      bb: "78",
      tb: "170",
      bmi: "26.99",
      tensi: "130/85",
      sgot: "50",
      sgpt: "52",
      conclusion: "Terdapat peningkatan SGOT dan SGPT.",
      suggestion:
        "Disarankan konsultasi dokter, evaluasi fungsi hati, dan menjaga pola makan.",
      fitStatus: "FIT WITH NOTE",
    },
    {
      id: "2",
      name: "Siti Aminah",
      nomcu: "MCU-002",
      nik: "317100000002",
      gender: "Wanita",
      age: "29",
      company: "PT Contoh Sehat",
      department: "Finance",
      bb: "55",
      tb: "160",
      bmi: "21.48",
      tensi: "110/70",
      sgot: "24",
      sgpt: "22",
      conclusion: "Dalam batas normal.",
      suggestion: "Pemeriksaan kesehatan berkala setidaknya 1 tahun sekali.",
      fitStatus: "FIT",
    },
    {
      id: "3",
      name: "Agus Pratama",
      nomcu: "MCU-003",
      nik: "317100000003",
      gender: "Pria",
      age: "42",
      company: "PT Contoh Sehat",
      department: "Produksi",
      bb: "88",
      tb: "168",
      bmi: "31.18",
      tensi: "145/92",
      sgot: "32",
      sgpt: "36",
      conclusion: "Obesitas dan tekanan darah meningkat.",
      suggestion:
        "Disarankan penurunan berat badan, diet rendah garam, olahraga teratur, dan kontrol tekanan darah.",
      fitStatus: "FIT WITH NOTE",
    },
  ];

  return NextResponse.json({
    ok: true,
    message: "Preview sample berhasil dimuat.",
    rows,
  });
}