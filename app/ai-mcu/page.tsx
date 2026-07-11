import Link from "next/link";

type MenuItem = {
  title: string;
  href: string;
  desc: string;
};

const menuItems: MenuItem[] = [
  {
    title: "Corporate MCU AI",
    href: "/ai-mcu/corporate",
    desc: "Workflow Corporate berbasis AI MCU Analyzer.",
  },
  {
    title: "Upload Excel",
    href: "/ai-mcu/upload",
    desc: "Upload file hasil MCU dari Excel.",
  },
  {
    title: "Mapping Header",
    href: "/ai-mcu/mapping",
    desc: "Auto Detect atau Manual Mapping seperti Autocrat.",
  },
  {
    title: "Preview / Edit Data",
    href: "/ai-mcu/preview",
    desc: "Review dan edit data sebelum generate PDF.",
  },
  {
    title: "Analisis MCU",
    href: "/ai-mcu/analyze",
    desc: "Deteksi hasil abnormal, interpretasi penyakit, perbandingan data, kesimpulan, dan saran.",
  },
  {
    title: "Generate PDF MCU Corporate",
    href: "/ai-mcu/corporate/generate",
    desc: "Pilih peserta, parameter pemeriksaan, penanggung jawab, foto, dan lampiran sebelum generate PDF Corporate.",
  },
  {
    title: "Generate PDF CAPASKA",
    href: "/ai-mcu/generate?program=capaska",
    desc: "Generate PDF hasil CAPASKA langsung dengan filter program CAPASKA.",
  },
  {
    title: "Google Drive",
    href: "/ai-mcu/drive",
    desc: "Upload dan kelola hasil PDF di Google Drive.",
  },
  {
    title: "Riwayat",
    href: "/ai-mcu/history",
    desc: "Lihat riwayat file dan hasil generate.",
  },
  {
    title: "Latih AI",
    href: "/ai-mcu/train",
    desc: "Training machine learning lokal menggunakan data MCU dan feedback dokter.",
  },
];

const drawerItems: Array<[string, string]> = [
  ["Dashboard", "/dashboard"],
  ["AI MCU Analyzer", "/ai-mcu"],
  ["Corporate MCU AI", "/ai-mcu/corporate"],
  ["Upload Excel", "/ai-mcu/upload"],
  ["Mapping Header", "/ai-mcu/mapping"],
  ["Preview / Edit Data", "/ai-mcu/preview"],
  ["Analisis MCU", "/ai-mcu/analyze"],
  ["Generate PDF MCU Corporate", "/ai-mcu/corporate/generate"],
  ["Generate PDF CAPASKA", "/ai-mcu/generate?program=capaska"],
  ["Google Drive", "/ai-mcu/drive"],
  ["Riwayat", "/ai-mcu/history"],
  ["Import Peserta", "/import"],
  ["Setup Parameter", "/setup-parameters"],
  ["Setup Label Paket", "/setup-label-paket"],
  ["Parameter Kelulusan", "/parameter-kelulusan"],
  ["Input CAPASKA", "/input"],
  ["Input Corporate", "/input-corporate"],
  ["Cetak Label", "/labels"],
  ["Review Hasil", "/review"],
  ["Hapus Database", "/cleanup"],
  ["Master Users", "/master"],
];

export default function AiMcuPage() {
  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">
              AI MCU Analyzer
            </h1>

            <p className="mt-2 max-w-4xl text-sm leading-relaxed text-slate-600">
              Modul tambahan untuk analisis hasil MCU, mapping header Excel,
              preview dan edit data, generate PDF, merge PDF untuk print, serta
              integrasi Google Drive. Modul MCU CAPASKA dan MCU Corporate tetap
              terpisah.
            </p>
          </div>

          <details className="relative shrink-0">
            <summary className="cursor-pointer list-none rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50">
              ☰ Menu
            </summary>

            <div className="absolute right-0 top-12 z-50 w-[340px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-sm font-black text-slate-900">
                  Navigasi MCU System
                </div>

                <div className="mt-1 text-xs text-slate-500">
                  Akses cepat ke modul AI MCU dan fitur utama.
                </div>
              </div>

              <div className="grid max-h-[520px] gap-2 overflow-auto p-3">
                {drawerItems.map(([label, href]) => (
                  <Link
                    key={`${label}-${href}`}
                    href={href}
                    className={`rounded-xl border px-3 py-2 text-sm font-bold transition hover:bg-slate-50 ${
                      href === "/ai-mcu"
                        ? "border-blue-300 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          </details>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {menuItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`group rounded-xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md ${
                item.href === "/ai-mcu/corporate/generate"
                  ? "border-emerald-300 bg-emerald-50 hover:bg-emerald-100"
                  : "border-slate-200 bg-slate-50 hover:bg-slate-100"
              }`}
            >
              <div
                className={`font-semibold ${
                  item.href === "/ai-mcu/corporate/generate"
                    ? "text-emerald-900"
                    : "text-slate-900"
                }`}
              >
                {item.title}
              </div>

              <div
                className={`mt-1 text-sm leading-relaxed ${
                  item.href === "/ai-mcu/corporate/generate"
                    ? "text-emerald-700"
                    : "text-slate-600"
                }`}
              >
                {item.desc}
              </div>

              {item.href === "/ai-mcu/corporate/generate" ? (
                <div className="mt-3 text-xs font-bold uppercase tracking-wide text-emerald-700">
                  Buka Generator Corporate →
                </div>
              ) : null}
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}