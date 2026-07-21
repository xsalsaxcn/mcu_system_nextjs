$ErrorActionPreference = "Stop"

$path = "C:\Users\Lenovo\Documents\mcu_system_nextjs\app\wellness\portal\page.tsx"

if (!(Test-Path $path)) {
    throw "page.tsx tidak ditemukan"
}

Write-Host "RESTORE HEALTHTALK TAB V35"

$text = Get-Content $path -Raw -Encoding UTF8

if ($text.Contains("function HealthtalkTab(")) {
    Write-Host "SKIP - HealthtalkTab sudah ada"
    exit 0
}

$insertBefore = $text.IndexOf("function HistoryTab(")

if ($insertBefore -lt 0) {
    $insertBefore = $text.IndexOf("function DevicesTab(")
}

if ($insertBefore -lt 0) {
    throw "Tidak menemukan posisi insert sebelum HistoryTab atau DevicesTab"
}

$component = @'

function HealthtalkTab(props: {
  form?: any;
  evidence?: File | null;
  setEvidence?: (file: File | null) => void;
  setValue?: (key: string, value: string) => void;
  saveHealthtalk?: () => void | Promise<void>;
  logs?: any[];
  [key: string]: any;
}) {
  const {
    form = {},
    evidence = null,
    setEvidence = () => {},
    setValue = () => {},
    saveHealthtalk = () => {},
    logs = [],
  } = props;

  return (
    <section className="w-full max-w-full space-y-5 overflow-hidden">
      <div className="overflow-hidden rounded-[2.4rem] border border-white bg-white shadow-xl shadow-slate-200/60">
        <div className="relative overflow-hidden bg-gradient-to-br from-[#e7f4fb] via-[#e1f3f0] to-[#fff0e8] p-6 md:p-7">
          <div className="text-xs font-black uppercase tracking-[0.22em] text-teal-700/70">
            Health Talk
          </div>

          <h2 className="mt-3 text-3xl font-black leading-tight text-slate-950 md:text-4xl">
            Input Health Talk
          </h2>

          <p className="mt-3 max-w-2xl text-sm font-bold leading-6 text-slate-600">
            Catat kehadiran seminar, edukasi kesehatan, atau aktivitas pembelajaran wellness.
          </p>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-[250px_1fr] md:p-6">
          <div>
            <label className="block cursor-pointer rounded-[2rem] border border-dashed border-teal-200 bg-[#f4fbfa] p-5 text-center transition hover:bg-teal-50">
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(event) => setEvidence(event.target.files?.[0] || null)}
                className="hidden"
              />

              <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-[2rem] bg-white text-sm font-black text-teal-700 shadow-sm">
                {evidence ? "FILE" : "UPLOAD"}
              </div>

              <div className="mt-4 text-sm font-black text-slate-950">
                {evidence ? evidence.name : "Upload Bukti"}
              </div>

              <div className="mt-2 text-xs font-bold leading-5 text-slate-500">
                Bisa berupa foto atau PDF bukti kehadiran.
              </div>
            </label>
          </div>

          <div className="grid gap-4">
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Tanggal
              <input
                type="date"
                value={form.event_date || form.log_date || ""}
                onChange={(e) => setValue("event_date", e.target.value)}
                className={fieldClass}
              />
            </label>

            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Judul / Topik Health Talk
              <input
                value={form.title || form.topic || ""}
                onChange={(e) => setValue("title", e.target.value)}
                className={fieldClass}
                placeholder="Contoh: Edukasi Sindrom Metabolik"
              />
            </label>

            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Jenis Kehadiran
              <select
                value={form.attendance_type || ""}
                onChange={(e) => setValue("attendance_type", e.target.value)}
                className={fieldClass}
              >
                <option value="">Pilih jenis kehadiran</option>
                <option value="Online">Online</option>
                <option value="Offline">Offline</option>
                <option value="Recording">Recording</option>
              </select>
            </label>

            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Catatan
              <textarea
                value={form.notes || ""}
                onChange={(e) => setValue("notes", e.target.value)}
                className={`${fieldClass} min-h-[110px]`}
                placeholder="Catatan tambahan atau poin edukasi yang didapat."
              />
            </label>

            <button
              type="button"
              onClick={() => saveHealthtalk()}
              className="rounded-[1.5rem] bg-teal-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-teal-100"
            >
              Simpan Health Talk
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-[2.4rem] border border-white bg-white p-5 shadow-xl shadow-slate-200/60 md:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
              Health Talk History
            </div>

            <h3 className="mt-2 text-2xl font-black text-slate-950">
              Riwayat Health Talk
            </h3>
          </div>

          <div className="rounded-full bg-teal-50 px-3 py-2 text-xs font-black text-teal-700">
            {logs.length} log
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {logs.length === 0 ? (
            <div className="rounded-[2rem] border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-bold text-slate-400">
              Belum ada input Health Talk.
            </div>
          ) : (
            logs.slice(0, 10).map((item: any, index: number) => (
              <div
                key={`${item.id || index}-${index}`}
                className="rounded-[1.7rem] bg-slate-50 p-4"
              >
                <div className="text-sm font-black text-slate-950">
                  {item.title || item.topic || "Health Talk"}
                </div>

                <div className="mt-1 text-xs font-bold text-slate-400">
                  {item.event_date || item.log_date || item.created_at || "-"}
                </div>

                <div className="mt-3 text-sm font-bold leading-6 text-slate-600">
                  {item.notes || item.description || "-"}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

'@

$text = $text.Substring(0, $insertBefore) + $component + $text.Substring($insertBefore)

Set-Content -Path $path -Value $text -Encoding UTF8

Write-Host "OK - HealthtalkTab restored"
Write-Host "DONE - RESTORE HEALTHTALK TAB V35"