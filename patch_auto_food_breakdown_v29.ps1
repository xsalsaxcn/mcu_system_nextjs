$ErrorActionPreference = "Stop"

$path = "C:\Users\Lenovo\Documents\mcu_system_nextjs\app\wellness\portal\page.tsx"

if (!(Test-Path $path)) {
    throw "page.tsx tidak ditemukan"
}

Write-Host "PATCH AUTO FOOD BREAKDOWN V29"
Write-Host "Patch ini hanya mengganti NutritionTab UI."
Write-Host "Tidak mengubah API insert, Google Sheet, Supabase table, Google Fit, atau Health Connect."

$text = Get-Content $path -Raw -Encoding UTF8

$start = $text.IndexOf("function NutritionTab(")
if ($start -lt 0) {
    throw "function NutritionTab tidak ditemukan"
}

$end = $text.IndexOf("function WorkoutTab(", $start)
if ($end -lt 0) {
    throw "function WorkoutTab tidak ditemukan setelah NutritionTab"
}

$newNutritionBlock = @'
function NutritionTab({
  participant,
  form,
  photo,
  setPhoto,
  setValue,
  saveNutrition,
  logs,
}: {
  participant?: any;
  form: any;
  photo: File | null;
  setPhoto: (file: File | null) => void;
  setValue: (key: string, value: string) => void;
  saveNutrition: () => void;
  logs: any[];
}) {
  const participantId = Number(
    participant?.id ||
      participant?.participant_id ||
      participant?.wellness_participant_id ||
      form?.participant_id ||
      form?.participantId ||
      form?.wellness_participant_id ||
      0
  );

  const [foodMaster, setFoodMaster] = useState<any[]>([]);
  const [portionMap, setPortionMap] = useState<Record<string, string>>({});
  const [directNutrition, setDirectNutrition] = useState<any>({
    ok: false,
    logs: [],
    today_logs: [],
    latest_logs: [],
    today_count: 0,
    today_calories: 0,
    sources: null,
  });
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [savingSmart, setSavingSmart] = useState(false);

  const foodText = clean(
    form.food_name ||
      form.foodName ||
      form.meal_text ||
      form.mealText ||
      form.makanan
  );

  const mealChips = [
    { value: "Breakfast / Sarapan", label: "Sarapan" },
    { value: "Lunch / Makan Siang", label: "Makan Siang" },
    { value: "Dinner / Makan Malam", label: "Makan Malam" },
    { value: "Snack", label: "Snack" },
  ];

  async function loadFoodMaster() {
    const result = await fetch("/api/wellness/reference/foods?limit=2000", {
      cache: "no-store",
    })
      .then((response) => response.json())
      .catch(() => null);

    const rows = Array.isArray(result)
      ? result
      : Array.isArray(result?.data)
        ? result.data
        : Array.isArray(result?.foods)
          ? result.foods
          : Array.isArray(result?.items)
            ? result.items
            : [];

    setFoodMaster(rows);
  }

  async function loadDirectNutrition() {
    if (!participantId) return;

    setLoadingHistory(true);

    const result = await fetch(
      `/api/wellness/portal/nutrition-direct?participant_id=${participantId}&t=${Date.now()}`,
      { cache: "no-store" }
    )
      .then((response) => response.json())
      .catch(() => null);

    if (result?.ok) {
      setDirectNutrition(result);
    }

    setLoadingHistory(false);
  }

  useEffect(() => {
    loadFoodMaster();
  }, []);

  useEffect(() => {
    loadDirectNutrition();
  }, [participantId]);

  const parsedFoods = useMemo(() => {
    return buildAutoFoodBreakdownV29(foodText, foodMaster, portionMap);
  }, [foodText, foodMaster, portionMap]);

  const totalEstimatedCalories = parsedFoods.reduce((sum, item) => {
    return sum + Number(item.subtotal_calories || 0);
  }, 0);

  const breakdownPayload = useMemo(() => {
    return parsedFoods.map((item) => ({
      input_name: item.input_name,
      matched_name: item.matched_name,
      category: item.category,
      portion_fraction: item.portion_fraction,
      portion_multiplier: item.portion_multiplier,
      base_calories: item.base_calories,
      subtotal_calories: item.subtotal_calories,
      match_status: item.match_status,
    }));
  }, [parsedFoods]);

  useEffect(() => {
    const payloadText = JSON.stringify(breakdownPayload);
    const portionText = parsedFoods
      .map((item) => `${item.input_name} ${item.portion_fraction}`)
      .join(", ");

    if (clean(form.food_breakdown) !== payloadText) {
      setValue("food_breakdown", payloadText);
    }

    if (clean(form.portion_breakdown) !== payloadText) {
      setValue("portion_breakdown", payloadText);
    }

    if (clean(form.estimated_calories) !== String(totalEstimatedCalories)) {
      setValue("estimated_calories", String(totalEstimatedCalories));
    }

    if (clean(form.calories) !== String(totalEstimatedCalories)) {
      setValue("calories", String(totalEstimatedCalories));
    }

    if (portionText && clean(form.portion) !== portionText) {
      setValue("portion", portionText);
    }

    if (clean(form.portion_group) !== "auto_breakdown") {
      setValue("portion_group", "auto_breakdown");
    }

    if (clean(form.portion_fraction) !== "multi_food") {
      setValue("portion_fraction", "multi_food");
    }
  }, [JSON.stringify(breakdownPayload), totalEstimatedCalories]);

  const historyLogs =
    directNutrition?.today_logs?.length > 0
      ? directNutrition.today_logs
      : directNutrition?.latest_logs?.length > 0
        ? directNutrition.latest_logs
        : logs || [];

  const historyTitle =
    directNutrition?.today_logs?.length > 0
      ? "Riwayat Nutrisi Hari Ini"
      : directNutrition?.latest_logs?.length > 0
        ? "Riwayat Nutrisi Terakhir"
        : "Riwayat Nutrisi";

  async function submitNutritionSmart() {
    setSavingSmart(true);

    await Promise.resolve(saveNutrition());

    setTimeout(() => {
      loadDirectNutrition();
      setSavingSmart(false);
    }, 1600);
  }

  function changePortion(key: string, value: string) {
    setPortionMap((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

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
                  Ketik beberapa makanan sekaligus, sistem akan otomatis memecah item makanan dan menghitung estimasi kalori.
                </p>
              </div>

              <div className="rounded-[1.6rem] bg-white/70 px-5 py-4 shadow-sm">
                <div className="text-xs font-black uppercase tracking-wide text-slate-400">
                  Estimasi Kalori
                </div>
                <div className="mt-1 text-2xl font-black text-slate-950">
                  {fmtNumber(totalEstimatedCalories, 0)}
                </div>
                <div className="text-xs font-bold text-slate-500">
                  kkal dari breakdown
                </div>
              </div>
            </div>
          </div>

          <div className="p-5 md:p-6">
            <div className="grid gap-5 md:grid-cols-[250px_1fr]">
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
                    Cara input
                  </div>
                  <p className="mt-2 text-xs font-bold leading-5 text-slate-500">
                    Contoh: Nasi putih, sayur sop, ayam goreng. Pisahkan makanan dengan koma.
                  </p>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm font-bold text-slate-700">
                    Tanggal
                    <input
                      type="date"
                      value={form.log_date}
                      onChange={(e) => setValue("log_date", e.target.value)}
                      className={fieldClass}
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-bold text-slate-700">
                    Waktu Makan
                    <div className="grid grid-cols-2 gap-2">
                      {mealChips.map((item) => (
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
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </label>
                </div>

                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Nama Makanan
                  <textarea
                    value={form.food_name}
                    onChange={(e) => setValue("food_name", e.target.value)}
                    className={`${fieldClass} min-h-[96px]`}
                    placeholder="Contoh: Nasi putih, sayur sop, ayam goreng"
                  />
                </label>

                <AutoFoodBreakdownV29
                  foods={parsedFoods}
                  onChangePortion={changePortion}
                />

                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Catatan
                  <textarea
                    value={form.notes}
                    onChange={(e) => setValue("notes", e.target.value)}
                    className={`${fieldClass} min-h-[90px]`}
                    placeholder="Catatan tambahan, misalnya makan di luar, minuman manis, dll."
                  />
                </label>

                <div className="rounded-[1.7rem] bg-teal-50 p-4 text-xs font-bold leading-5 text-teal-900">
                  Sistem mencocokkan nama makanan dengan Master KaloriData. Jika ada item belum match, peserta tetap bisa simpan, tetapi kalori item tersebut akan dihitung 0 sampai master datanya ditambahkan.
                </div>

                <button
                  type="button"
                  onClick={submitNutritionSmart}
                  disabled={savingSmart}
                  className="rounded-[1.5rem] bg-teal-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-teal-100 disabled:opacity-50"
                >
                  {savingSmart ? "Menyimpan..." : "Simpan Nutrisi"}
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
                {historyTitle}
              </h3>

              {directNutrition?.sources ? (
                <p className="mt-2 text-xs font-bold leading-5 text-slate-500">
                  Source: Supabase {directNutrition.sources.supabase_rows || 0} row | Google Sheet{" "}
                  {directNutrition.sources.google_sheet_rows || 0} row
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={loadDirectNutrition}
              className="rounded-full bg-teal-50 px-3 py-2 text-xs font-black text-teal-700"
            >
              {loadingHistory ? "..." : "Refresh"}
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {historyLogs.length === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                <div className="text-base font-black text-slate-900">
                  Belum ada input nutrisi.
                </div>
                <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
                  Input pertama akan muncul di sini.
                </p>
              </div>
            ) : (
              historyLogs.slice(0, 10).map((item: any, index: number) => (
                <NutritionHistoryItemV29 key={`${item.id || index}-${index}`} item={item} />
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function AutoFoodBreakdownV29({
  foods,
  onChangePortion,
}: {
  foods: any[];
  onChangePortion: (key: string, value: string) => void;
}) {
  const total = foods.reduce((sum, item) => sum + Number(item.subtotal_calories || 0), 0);

  if (!foods.length) {
    return (
      <div className="rounded-[1.8rem] border border-dashed border-slate-200 bg-slate-50 p-5">
        <div className="text-sm font-black text-slate-900">
          Breakdown makanan akan muncul otomatis.
        </div>
        <p className="mt-2 text-xs font-bold leading-5 text-slate-500">
          Tulis nama makanan dan pisahkan dengan koma.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[1.8rem] border border-teal-100 bg-[#f4fbfa] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-black text-slate-950">
            Auto Breakdown Kalori
          </div>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
            Pilih porsi untuk setiap item makanan.
          </p>
        </div>

        <div className="rounded-full bg-white px-4 py-2 text-xs font-black text-teal-700 shadow-sm">
          Total {fmtNumber(total, 0)} kkal
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        {foods.map((item) => (
          <div
            key={item.key}
            className="rounded-[1.5rem] bg-white p-4 shadow-sm"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="truncate text-sm font-black text-slate-950">
                  {item.input_name}
                </div>

                <div className="mt-1 text-xs font-bold text-slate-500">
                  {item.match_status === "matched"
                    ? `Match: ${item.matched_name} • ${item.category || "Umum"} • ${fmtNumber(item.base_calories, 0)} kkal dasar`
                    : "Belum match di Master KaloriData"}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <select
                  value={item.portion_fraction}
                  onChange={(event) => onChangePortion(item.key, event.target.value)}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-black text-slate-700 outline-none"
                >
                  <option value="1/4">1/4 porsi</option>
                  <option value="1/3">1/3 porsi</option>
                  <option value="1/2">1/2 porsi</option>
                  <option value="1">1 porsi</option>
                </select>

                <div className="rounded-2xl bg-teal-50 px-3 py-3 text-xs font-black text-teal-700">
                  {fmtNumber(item.subtotal_calories, 0)} kkal
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NutritionHistoryItemV29({ item }: { item: any }) {
  const sourceLabel =
    item.source === "google_sheet"
      ? "Google Sheet"
      : item.source === "supabase"
        ? "Supabase"
        : item.source || "Food log";

  return (
    <div className="rounded-[1.7rem] bg-slate-50 p-3">
      <div className="flex items-center gap-3">
        {item.photo_url ? (
          <img
            src={item.photo_url}
            alt="Foto makanan"
            className="h-16 w-16 shrink-0 rounded-2xl object-cover"
          />
        ) : (
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white text-xs font-black text-teal-700">
            FOOD
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-black text-slate-950">
            {item.food_name || item.meal_text || "-"}
          </div>

          <div className="mt-1 text-xs font-bold capitalize text-slate-500">
            {item.log_date || "-"} • {item.meal_time || item.meal_type || "-"}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-teal-50 px-3 py-1 text-[11px] font-black text-teal-700">
              {fmtNumber(item.calories || item.total_calories || 0, 0)} kkal
            </span>

            <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-slate-500">
              {sourceLabel}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function buildAutoFoodBreakdownV29(
  foodText: string,
  foodMaster: any[],
  portionMap: Record<string, string>
) {
  const tokens = splitFoodInputV29(foodText);
  const masterIndex = buildFoodMasterIndexV29(foodMaster);

  return tokens.map((token) => {
    const key = normalizeFoodTextV29(token);
    const matched = matchFoodMasterV29(token, masterIndex);
    const category = matched?.category || guessFoodCategoryV29(token);
    const defaultPortion = defaultPortionByCategoryV29(category);
    const portionFraction = portionMap[key] || defaultPortion;
    const multiplier = portionMultiplierV29(portionFraction);
    const baseCalories = Number(matched?.calories || 0);
    const subtotal = Math.round(baseCalories * multiplier);

    return {
      key,
      input_name: token,
      matched_name: matched?.name || "",
      category,
      portion_fraction: portionFraction,
      portion_multiplier: multiplier,
      base_calories: baseCalories,
      subtotal_calories: subtotal,
      match_status: matched ? "matched" : "unmatched",
    };
  });
}

function splitFoodInputV29(value: string) {
  return clean(value)
    .split(/,|;|\bdan\b|\+/i)
    .map((item) => clean(item))
    .filter(Boolean);
}

function normalizeFoodTextV29(value: any) {
  return clean(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildFoodMasterIndexV29(rows: any[]) {
  const items: Array<{
    name: string;
    normalized: string;
    calories: number;
    category: string;
    raw: any;
  }> = [];

  for (const row of rows || []) {
    const calories = Number(row.calories || row.calorie || row.kcal || 0);
    const category = clean(row.category || row.kategori || "Umum");

    const aliases = Array.isArray(row.aliases)
      ? row.aliases
      : clean(row.aliases)
          .split(",")
          .map((item) => clean(item))
          .filter(Boolean);

    const names = [
      row.food_name,
      row.name,
      ...aliases,
    ]
      .map((item) => clean(item))
      .filter(Boolean);

    for (const name of names) {
      const normalized = normalizeFoodTextV29(name);

      if (!normalized) continue;

      items.push({
        name,
        normalized,
        calories,
        category,
        raw: row,
      });
    }
  }

  return items;
}

function matchFoodMasterV29(
  input: string,
  index: Array<{
    name: string;
    normalized: string;
    calories: number;
    category: string;
    raw: any;
  }>
) {
  const normalized = normalizeFoodTextV29(input);

  if (!normalized) return null;

  return (
    index.find((item) => item.normalized === normalized) ||
    index.find((item) => normalized.includes(item.normalized)) ||
    index.find((item) => item.normalized.includes(normalized)) ||
    null
  );
}

function guessFoodCategoryV29(value: string) {
  const text = normalizeFoodTextV29(value);

  if (
    text.includes("nasi") ||
    text.includes("mie") ||
    text.includes("bihun") ||
    text.includes("kwetiau") ||
    text.includes("roti") ||
    text.includes("kentang") ||
    text.includes("ubi") ||
    text.includes("singkong") ||
    text.includes("jagung") ||
    text.includes("oat")
  ) {
    return "Makanan Pokok";
  }

  if (
    text.includes("ayam") ||
    text.includes("ikan") ||
    text.includes("telur") ||
    text.includes("daging") ||
    text.includes("sapi") ||
    text.includes("tempe") ||
    text.includes("tahu") ||
    text.includes("udang")
  ) {
    return "Lauk / Protein";
  }

  if (
    text.includes("sayur") ||
    text.includes("sop") ||
    text.includes("capcay") ||
    text.includes("kangkung") ||
    text.includes("bayam") ||
    text.includes("lalap")
  ) {
    return "Sayur";
  }

  if (
    text.includes("apel") ||
    text.includes("pisang") ||
    text.includes("jeruk") ||
    text.includes("pepaya") ||
    text.includes("mangga") ||
    text.includes("buah")
  ) {
    return "Buah";
  }

  return "Umum / Minuman";
}

function defaultPortionByCategoryV29(category: string) {
  const text = normalizeFoodTextV29(category);

  if (text.includes("makanan pokok")) return "1/3";
  if (text.includes("sayur")) return "1/3";
  if (text.includes("lauk") || text.includes("protein")) return "1/3";
  if (text.includes("buah")) return "1/3";

  return "1";
}

function portionMultiplierV29(value: string) {
  if (value === "1/4") return 0.25;
  if (value === "1/3") return 1 / 3;
  if (value === "1/2") return 0.5;
  if (value === "1") return 1;

  return 1;
}

'@

$text = $text.Substring(0, $start) + $newNutritionBlock + $text.Substring($end)

# Pastikan caller NutritionTab menerima participant
$text = $text -replace '<NutritionTab(?![^>]*participant=)', '<NutritionTab participant={participant}'

Set-Content -Path $path -Value $text -Encoding UTF8

Write-Host "OK - NutritionTab diganti dengan auto food breakdown"
Write-Host "DONE - PATCH AUTO FOOD BREAKDOWN V29"