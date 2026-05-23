export default function AiMcuCorporatePage() {
  return (
    <main className="p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold">Corporate MCU AI</h1>

        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Halaman ini akan menjadi workflow Corporate MCU berbasis AI MCU Analyzer.
          Untuk tahap awal, fitur Corporate MCU existing tetap aman dan tidak diubah.
        </p>

        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Next step: sambungkan halaman ini ke upload Excel, mapping header,
          preview data, generate analisis, generate PDF, merge PDF print,
          dan Google Drive.
        </div>

        <div className="mt-4">
          <a
            href="/ai-mcu"
            className="text-sm font-medium text-blue-600 hover:underline"
          >
            Kembali ke AI MCU Analyzer
          </a>
        </div>
      </div>
    </main>
  );
}