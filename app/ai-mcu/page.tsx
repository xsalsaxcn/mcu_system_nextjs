import Link from "next/link";

const menuItems = [
  {
    title: "Corporate MCU AI",
    href: "/ai-mcu/corporate",
    desc: "Workflow corporate berbasis AI MCU Analyzer.",
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
    desc: "Deteksi abnormal, interpretasi penyakit, compare data lama vs baru, kesimpulan dan saran.",
  },
  {
    title: "Generate PDF",
    href: "/ai-mcu/generate",
    desc: "Generate PDF per peserta dan merge untuk print.",
  },
  // CAPASKA_GENERATE_PDF_MENU_V332_AI_PAGE
  {
    title: "Generate PDF CAPASKA",
    href: "/ai-mcu/generate?program=capaska",
    desc: "Generate PDF hasil CAPASKA langsung dengan filter program CAPASKA.",
  },
  {
    title: "Google Drive",
    href: "/ai-mcu/drive",
    desc: "Upload hasil PDF ke Google Drive.",
  },
  {
    title: "Riwayat",
    href: "/ai-mcu/history",
    desc: "Lihat riwayat file dan hasil generate.",
  },
  {
  title: "Latih AI",
  href: "/ai-mcu/train",
  desc: "Training machine learning lokal pakai scikit-learn dari data MCU dan feedback dokter.",
},
];

const drawerItems = [
  ["Dashboard", "/dashboard"],
  ["AI MCU Analyzer", "/ai-mcu"],
  ["Corporate MCU AI", "/ai-mcu/corporate"],
  ["Upload Excel", "/ai-mcu/upload"],
  ["Mapping Header", "/ai-mcu/mapping"],
  ["Preview / Edit Data", "/ai-mcu/preview"],
  ["Analisis MCU", "/ai-mcu/analyze"],
  ["Generate PDF", "/ai-mcu/generate"],
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
    <main className="p-6">
      <div className="relative rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">AI MCU Analyzer</h1>

            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Modul tambahan untuk analisis hasil MCU, mapping header Excel,
              preview/edit data, generate PDF, merge PDF print, dan integrasi Google Drive.
              Fitur MCU Capaska dan MCU Corporate existing tetap dipertahankan.
            </p>
          </div>

          <details className="relative">
            <summary className="list-none rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50 cursor-pointer">
              ☰ Menu
            </summary>

            <div className="absolute right-0 top-12 z-50 w-[340px] overflow-hidden rounded-2xl border bg-white shadow-xl">
              <div className="border-b bg-slate-50 px-4 py-3">
                <div className="text-sm font-black text-slate-900">Navigasi MCU System</div>
                <div className="mt-1 text-xs text-slate-500">
                  Akses cepat ke modul AI MCU dan fitur utama.
                </div>
              </div>

              <div className="grid max-h-[520px] gap-2 overflow-auto p-3">
                {drawerItems.map(([label, href]) => (
                  <Link
                    key={href}
                    href={href}
                    className={`rounded-xl border px-3 py-2 text-sm font-bold hover:bg-slate-50 ${
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
              className="rounded-xl border bg-slate-50 p-4 transition hover:bg-slate-100"
            >
              <div className="font-semibold text-slate-900">{item.title}</div>
              <div className="mt-1 text-sm text-slate-600">{item.desc}</div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
