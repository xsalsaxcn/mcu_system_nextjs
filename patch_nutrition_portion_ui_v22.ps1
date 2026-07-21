$ErrorActionPreference = "Stop"

$path = "C:\Users\Lenovo\Documents\mcu_system_nextjs\app\wellness\portal\page.tsx"

if (!(Test-Path $path)) {
    throw "page.tsx tidak ditemukan"
}

Write-Host "PATCH NUTRITION PORTION UI V22"

$text = Get-Content $path -Raw -Encoding UTF8

if ($text.Contains("function IsiPiringkuPortionSelector(")) {
    Write-Host "SKIP - UI portion selector sudah ada"
    exit 0
}

$start = $text.IndexOf("function NutritionTab(")
if ($start -lt 0) {
    throw "NutritionTab tidak ditemukan"
}

$end = $text.IndexOf("function WorkoutTab(", $start)
if ($end -lt 0) {
    throw "WorkoutTab tidak ditemukan setelah NutritionTab"
}

$nutritionBlock = $text.Substring($start, $end - $start)

# Cari field Porsi existing dan tambahkan selector setelahnya
$needle = @'
                <Input label="Porsi">
                  <input
                    value={form.portion}
                    onChange={(e) => setValue("portion", e.target.value)}
                    className={fieldClass}
                    placeholder="Contoh: 1 porsi / 150 gram / 1 mangkuk"
                  />
                </Input>
'@

$insert = @'
                <Input label="Porsi">
                  <input
                    value={form.portion}
                    onChange={(e) => setValue("portion", e.target.value)}
                    className={fieldClass}
                    placeholder="Contoh: 1 porsi / 150 gram / 1 mangkuk"
                  />
                </Input>

                <IsiPiringkuPortionSelector
                  form={form}
                  setValue={setValue}
                />
'@

if ($nutritionBlock.Contains($needle)) {
    $nutritionBlock = $nutritionBlock.Replace($needle, $insert)
    Write-Host "OK - selector dipasang setelah input Porsi"
} else {
    Write-Host "WARNING - blok input Porsi exact tidak ditemukan. Akan insert sebelum Catatan."

    $needleAlt = '<Input label="Catatan">'
    $posAlt = $nutritionBlock.IndexOf($needleAlt)

    if ($posAlt -lt 0) {
        throw "Tidak bisa menemukan posisi untuk insert selector porsi."
    }

    $selector = @'

                <IsiPiringkuPortionSelector
                  form={form}
                  setValue={setValue}
                />

'@

    $nutritionBlock = $nutritionBlock.Substring(0, $posAlt) + $selector + $nutritionBlock.Substring($posAlt)
}

$text = $text.Substring(0, $start) + $nutritionBlock + $text.Substring($end)

$componentInsertBefore = $text.IndexOf("function WorkoutTab(")
if ($componentInsertBefore -lt 0) {
    throw "WorkoutTab tidak ditemukan untuk insert component"
}

$component = @'
function IsiPiringkuPortionSelector({
  form,
  setValue,
}: {
  form: any;
  setValue: (key: string, value: string) => void;
}) {
  const groups = [
    {
      key: "makanan_pokok",
      label: "Makanan Pokok",
      note: "Standar 1/3 piring",
      options: [
        { fraction: "1/6", label: "1/6", multiplier: "0.5" },
        { fraction: "1/4", label: "1/4", multiplier: "0.75" },
        { fraction: "1/3", label: "1/3", multiplier: "1" },
        { fraction: "1/2", label: "1/2", multiplier: "1.5" },
        { fraction: "1", label: "1 piring", multiplier: "3" },
      ],
    },
    {
      key: "lauk_pauk",
      label: "Lauk / Protein",
      note: "Standar 1/6 piring",
      options: [
        { fraction: "1/12", label: "1/12", multiplier: "0.5" },
        { fraction: "1/6", label: "1/6", multiplier: "1" },
        { fraction: "1/4", label: "1/4", multiplier: "1.5" },
        { fraction: "1/3", label: "1/3", multiplier: "2" },
      ],
    },
    {
      key: "sayur",
      label: "Sayur",
      note: "Standar 1/3 piring",
      options: [
        { fraction: "1/6", label: "1/6", multiplier: "0.5" },
        { fraction: "1/4", label: "1/4", multiplier: "0.75" },
        { fraction: "1/3", label: "1/3", multiplier: "1" },
        { fraction: "1/2", label: "1/2", multiplier: "1.5" },
      ],
    },
    {
      key: "buah",
      label: "Buah",
      note: "Standar 1/6 piring",
      options: [
        { fraction: "1/12", label: "1/12", multiplier: "0.5" },
        { fraction: "1/6", label: "1/6", multiplier: "1" },
        { fraction: "1/4", label: "1/4", multiplier: "1.5" },
        { fraction: "1/3", label: "1/3", multiplier: "2" },
      ],
    },
    {
      key: "umum",
      label: "Umum / Minuman",
      note: "Berdasarkan porsi standar",
      options: [
        { fraction: "1/4 porsi", label: "1/4", multiplier: "0.25" },
        { fraction: "1/2 porsi", label: "1/2", multiplier: "0.5" },
        { fraction: "1 porsi", label: "1", multiplier: "1" },
        { fraction: "1.5 porsi", label: "1.5", multiplier: "1.5" },
        { fraction: "2 porsi", label: "2", multiplier: "2" },
      ],
    },
  ];

  const selectedGroup = String(form.portion_group || "makanan_pokok");
  const group = groups.find((item) => item.key === selectedGroup) || groups[0];

  function chooseGroup(key: string) {
    const nextGroup = groups.find((item) => item.key === key) || groups[0];
    const defaultOption =
      nextGroup.options.find((item) => item.multiplier === "1") ||
      nextGroup.options[0];

    setValue("portion_group", nextGroup.key);
    setValue("portion_fraction", defaultOption.fraction);
    setValue("portion_multiplier", defaultOption.multiplier);
    setValue("portion", `${nextGroup.label} - ${defaultOption.label} piring`);
  }

  function choosePortion(option: any) {
    setValue("portion_group", group.key);
    setValue("portion_fraction", option.fraction);
    setValue("portion_multiplier", option.multiplier);
    setValue(
      "portion",
      group.key === "umum"
        ? `${group.label} - ${option.fraction}`
        : `${group.label} - ${option.label} piring`
    );
  }

  return (
    <div className="rounded-[1.8rem] border border-teal-100 bg-[#f4fbfa] p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-sm font-black text-slate-950">
            Panduan Porsi Isi Piringku
          </div>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
            Pilih kategori makanan dan estimasi bagian piring untuk menghitung kalori lebih konsisten.
          </p>
        </div>

        <div className="rounded-full bg-white px-3 py-2 text-xs font-black text-teal-700 shadow-sm">
          {group.note}
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-5">
        {groups.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => chooseGroup(item.key)}
            className={`rounded-2xl px-3 py-3 text-xs font-black transition ${
              selectedGroup === item.key
                ? "bg-teal-600 text-white shadow-lg shadow-teal-100"
                : "bg-white text-slate-600"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-[1.6rem] bg-white p-4">
        <div className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">
          Pilih porsi visual
        </div>

        <div className="grid gap-2 md:grid-cols-5">
          {group.options.map((option) => {
            const active =
              String(form.portion_fraction || "") === option.fraction &&
              String(form.portion_group || "") === group.key;

            return (
              <button
                key={`${group.key}-${option.fraction}`}
                type="button"
                onClick={() => choosePortion(option)}
                className={`rounded-2xl border px-3 py-4 text-center transition ${
                  active
                    ? "border-teal-500 bg-teal-50 text-teal-800"
                    : "border-slate-100 bg-slate-50 text-slate-600"
                }`}
              >
                <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-white text-sm font-black shadow-sm">
                  {option.label}
                </div>

                <div className="text-[11px] font-black">
                  x{option.multiplier}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3 rounded-[1.4rem] bg-white px-4 py-3 text-xs font-bold leading-5 text-slate-500">
        Tersimpan sebagai:{" "}
        <span className="font-black text-slate-900">
          {form.portion || "-"}
        </span>
      </div>
    </div>
  );
}

'@

$text = $text.Substring(0, $componentInsertBefore) + $component + $text.Substring($componentInsertBefore)

Set-Content -Path $path -Value $text -Encoding UTF8

Write-Host "OK - UI pilihan porsi Isi Piringku ditambahkan"
Write-Host "DONE - PATCH NUTRITION PORTION UI V22"