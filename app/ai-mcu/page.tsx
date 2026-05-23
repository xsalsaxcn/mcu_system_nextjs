export default function AiMcuPage() {
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
      title: "Generate PDF",
      href: "/ai-mcu/generate",
      desc: "Generate PDF per peserta dan merge untuk print.",
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
  ];

  return (
    <main className="p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold">AI MCU Analyzer</h1>

        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Modul tambahan untuk analisis hasil MCU, mapping header Excel,
          preview/edit data, generate PDF, merge PDF print, dan integrasi Google Drive.
          Fitur MCU Capaska dan MCU Corporate existing tetap dipertahankan.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {menuItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-xl border bg-slate-50 p-4 transition hover:bg-slate-100"
            >
              <div className="font-semibold text-slate-900">{item.title}</div>
              <div className="mt-1 text-sm text-slate-600">{item.desc}</div>
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}