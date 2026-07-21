$ErrorActionPreference = "Stop"

$path = "C:\Users\Lenovo\Documents\mcu_system_nextjs\app\wellness\portal\page.tsx"

if (!(Test-Path $path)) {
    throw "page.tsx tidak ditemukan"
}

Write-Host "PATCH NUTRITION FITNESS UI V16"

$text = Get-Content $path -Raw -Encoding UTF8

$start = $text.IndexOf("function NutritionTab(")
if ($start -lt 0) {
    throw "function NutritionTab tidak ditemukan"
}

$end = $text.IndexOf("function WorkoutTab(", $start)
if ($end -lt 0) {
    throw "function WorkoutTab tidak ditemukan setelah NutritionTab"
}

$newNutrition = @'
function NutritionTab({
  form,
  photo,
  setPhoto,
  setValue,
  saveNutrition,
  logs,
}: {
  form: any;
  photo: File | null;
  setPhoto: (file: File | null) => void;
  setValue: (key: string, value: string) => void;
  saveNutrition: () => void;
  logs: any[];
}) {
  const todayLogs = (logs || []).filter(
    (item) => clean(item.log_date).slice(0, 10) === form.log_date
  );

  const totalCalories = todayLogs.reduce((sum, item) => {
    const value = Number(item.calories);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);

  return (
    <section className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[1fr_390px]">
        <div className="overflow-hidden rounded-[2.4rem] border border-white bg-white shadow-xl shadow-slate-200/60">
          <div className="relative overflow-hidden bg-gradient-to-br from-[#e1f3f0] via-[#e7f4fb] to-[#fff0e8] p-6 md:p-7">
            <div className="absolute right-[-50px] top-[-40px] h-40 w-40 rounded-full bg-white/45 blur-2xl" />
            <div className="absolute bottom-[-50px] left-[-30px] h-36 w-36 rounded-full bg-teal-200/35 blur-2xl" />

            <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.22em] text-teal-700/70">
                  Food Diary
                </div>

                <h2 className="mt-3 text-3xl font-black leading-tight text-slate-950 md:text-4xl">
                  Input Nutrisi Harian
                </h2>

                <p className="mt-3 max-w-2xl text-sm font-bold leading-6 text-slate-600">
                  Catat makanan dengan foto, porsi, dan waktu makan. Kalori otomatis dicocokkan dari Master KaloriData.
                </p>
              </div>

              <div className="rounded-[1.6rem] bg-white/70 px-5 py-4 shadow-sm">
                <div className="text-xs font-black uppercase tracking-wide text-slate-400">
                  Calories In
                </div>
                <div className="mt-1 text-2xl font-black text-slate-950">
                  {fmtNumber(totalCalories, 0)}
                </div>
                <div className="text-xs font-bold text-slate-500">
                  kkal di tanggal ini
                </div>
              </div>
            </div>
          </div>

          <div className="p-5 md:p-6">
            <div className="grid gap-5 md:grid-cols-[260px_1fr]">
              <div>
                <label className="block cursor-pointer rounded-[2rem] border border-dashed border-teal-200 bg-[#f4fbfa] p-5 text-center transition hover:bg-teal-50">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => setPhoto(event.target.files?.[0] || null)}
                    className="hidden"
                  />

                  <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-[2rem] bg-white text-sm font-black text-teal-700 shadow-sm">
                    {photo ? "PHOTO" : "UPLOAD"}
                  </div>

                  <div className="mt-4 text-sm font-black text-slate-950">
                    {photo ? photo.name : "Upload Foto Makanan"}
                  </div>

                  <div className="mt-2 text-xs font-bold leading-5 text-slate-500">
                    Klik untuk pilih foto dari galeri atau file.
                  </div>
                </label>

                <div className="mt-4 rounded-[1.7rem] bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase tracking-wide text-slate-400">
                    Tips Input
                  </div>
                  <p className="mt-2 text-xs font-bold leading-5 text-slate-500">
                    Gunakan nama makanan yang umum, misalnya nasi putih, ayam bakar, telur rebus, apel, atau ubi.
                  </p>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Input label="Tanggal">
                    <input
                      type="date"
                      value={form.log_date}
                      onChange={(e) => setValue("log_date", e.target.value)}
                      className={fieldClass}
                    />
                  </Input>

                  <Input label="Waktu Makan">
                    <div className="grid grid-cols-2 gap-2">
                      {mealOptions.map((item) => (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => setValue("meal_type", item.value)}
                          className={`rounded-2xl px-3 py-3 text-xs font-black transition ${
                            form.meal_type === item.value
                              ? "bg-teal-600 text-white shadow-lg shadow-teal-100"
                              : "bg-slate-50 text-slate-600"
                          }`}
                        >
                          {item.label.replace(" / ", " ")}
                        </button>
                      ))}
                    </div>
                  </Input>
                </div>

                <Input label="Nama Makanan">
                  <input
                    value={form.food_name}
                    onChange={(e) => setValue("food_name", e.target.value)}
                    className={fieldClass}
                    placeholder="Contoh: ayam bakar, nasi merah, apel"
                  />
                </Input>

                <Input label="Porsi">
                  <input
                    value={form.portion}
                    onChange={(e) => setValue("portion", e.target.value)}
                    className={fieldClass}
                    placeholder="Contoh: 1 porsi / 150 gram / 1 mangkuk"
                  />
                </Input>

                <Input label="Catatan">
                  <textarea
                    value={form.notes}
                    onChange={(e) => setValue("notes", e.target.value)}
                    className={`${fieldClass} min-h-[110px]`}
                    placeholder="Catatan tambahan, misalnya makan di luar, minuman manis, dll."
                  />
                </Input>

                <div className="rounded-[1.7rem] bg-teal-50 p-4 text-xs font-bold leading-5 text-teal-900">
                  Peserta tidak perlu mengisi kalori, protein, karbohidrat, atau lemak. Sistem akan mencocokkan nama makanan dengan Master KaloriData.
                </div>

                <button
                  type="button"
                  onClick={saveNutrition}
                  className="rounded-[1.5rem] bg-teal-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-teal-100"
                >
                  Simpan Nutrisi
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[2.4rem] border border-white bg-white p-5 shadow-xl shadow-slate-200/60 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                Meal History
              </div>

              <h3 className="mt-2 text-2xl font-black text-slate-950">
                Riwayat Nutrisi
              </h3>
            </div>

            <div className="rounded-full bg-teal-50 px-3 py-2 text-xs font-black text-teal-700">
              {logs.length} log
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {logs.length === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                <div className="text-base font-black text-slate-900">
                  Belum ada input nutrisi.
                </div>
                <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
                  Input pertama akan muncul di sini.
                </p>
              </div>
            ) : (
              logs.slice(0, 10).map((item, index) => (
                <NutritionLogCard key={`${item.id || index}-${index}`} item={item} />
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

'@

$updated = $text.Substring(0, $start) + $newNutrition + $text.Substring($end)

Set-Content -Path $path -Value $updated -Encoding UTF8

Write-Host "OK - NutritionTab diganti menjadi food diary style"
Write-Host "DONE - PATCH NUTRITION FITNESS UI V16"