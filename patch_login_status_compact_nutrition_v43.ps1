$ErrorActionPreference = "Stop"

$path = "C:\Users\Lenovo\Documents\mcu_system_nextjs\app\wellness\portal\page.tsx"

if (!(Test-Path $path)) {
    throw "page.tsx tidak ditemukan"
}

Write-Host "PATCH LOGIN STATUS + COMPACT NUTRITION V43"
Write-Host "Patch ini hanya mengubah tampilan login dan input nutrisi."
Write-Host "Tidak mengubah API, Google Sheet, Supabase, Google Fit, atau Health Connect."

$text = Get-Content $path -Raw -Encoding UTF8

function Replace-BlockBetweenFunctions {
    param(
        [string]$Text,
        [string]$StartFunction,
        [string[]]$NextFunctions,
        [string]$Replacement
    )

    $start = $Text.IndexOf("function " + $StartFunction + "(")

    if ($start -lt 0) {
        throw "function $StartFunction tidak ditemukan"
    }

    $end = -1

    foreach ($fn in $NextFunctions) {
        $candidate = $Text.IndexOf("function " + $fn + "(", $start + 1)

        if ($candidate -gt 0) {
            if ($end -lt 0 -or $candidate -lt $end) {
                $end = $candidate
            }
        }
    }

    if ($end -lt 0) {
        throw "Akhir function $StartFunction tidak ditemukan"
    }

    return $Text.Substring(0, $start) + $Replacement + $Text.Substring($end)
}

# ============================================================
# 1. Add professional login status component
# ============================================================

if (!$text.Contains("function PortalLoginStatusNoticeV43(")) {
    $insertBefore = $text.IndexOf("function SummaryCard(")

    if ($insertBefore -lt 0) {
        $insertBefore = $text.IndexOf("function HomeTab(")
    }

    if ($insertBefore -lt 0) {
        throw "Tidak menemukan posisi insert untuk PortalLoginStatusNoticeV43"
    }

    $loginNotice = @'

function PortalLoginStatusNoticeV43({
  message,
  isWarning,
  step,
}: {
  message: string;
  isWarning: boolean;
  step: Step;
}) {
  const text = clean(message);

  const isOtpStep = step === "verify";
  const isSuccess =
    text.toLowerCase().includes("berhasil") ||
    text.toLowerCase().includes("otp dikirim") ||
    text.toLowerCase().includes("dikirim") ||
    text.toLowerCase().includes("memuat portal");

  const title = isWarning
    ? "Perlu diperiksa"
    : isOtpStep
      ? "OTP sudah dikirim"
      : isSuccess
        ? "Status berhasil"
        : "Informasi akses";

  const body = isOtpStep
    ? text || "Kode OTP sudah dikirim. Silakan cek email/WhatsApp dan masukkan kode OTP untuk masuk ke portal."
    : text || "Masukkan kode karyawan, username, email, dan nomor HP untuk aktivasi portal peserta.";

  const toneClass = isWarning
    ? "border-red-100 bg-red-50 text-red-900"
    : isOtpStep || isSuccess
      ? "border-teal-100 bg-teal-50 text-teal-900"
      : "border-sky-100 bg-sky-50 text-sky-900";

  const dotClass = isWarning
    ? "bg-red-500"
    : isOtpStep || isSuccess
      ? "bg-teal-500"
      : "bg-sky-500";

  return (
    <div className={`mt-4 rounded-[1.5rem] border p-4 ${toneClass}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${dotClass}`} />

        <div className="min-w-0">
          <div className="text-sm font-black">
            {title}
          </div>

          <div className="mt-1 text-xs font-bold leading-5 opacity-80">
            {body}
          </div>

          {isOtpStep ? (
            <div className="mt-3 rounded-2xl bg-white/65 px-3 py-2 text-[11px] font-black">
              Masukkan OTP 6 digit lalu klik Verifikasi OTP & Masuk.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

'@

    $text = $text.Substring(0, $insertBefore) + $loginNotice + $text.Substring($insertBefore)
    Write-Host "OK - PortalLoginStatusNoticeV43 inserted"
} else {
    Write-Host "SKIP - PortalLoginStatusNoticeV43 sudah ada"
}

# Insert notice after login intro paragraph
$oldLoginIntro = @'
              <p className="mt-1 text-sm font-bold text-slate-500">
                Gunakan Kode Karyawan sesuai data program wellness. Username
                digunakan sebagai identitas portal peserta.
              </p>
'@

$newLoginIntro = @'
              <p className="mt-1 text-sm font-bold text-slate-500">
                Gunakan Kode Karyawan sesuai data program wellness. Username
                digunakan sebagai identitas portal peserta.
              </p>

              <PortalLoginStatusNoticeV43
                message={message}
                isWarning={isWarningMessage}
                step={step}
              />
'@

if ($text.Contains($oldLoginIntro) -and !$text.Contains("<PortalLoginStatusNoticeV43")) {
    $text = $text.Replace($oldLoginIntro, $newLoginIntro)
    Write-Host "OK - login status notice mounted"
} elseif ($text.Contains("<PortalLoginStatusNoticeV43")) {
    Write-Host "SKIP - login status notice already mounted"
} else {
    Write-Host "WARNING - login intro exact block tidak ditemukan"
}

# ============================================================
# 2. Replace NutritionTab with compact mobile-first layout
# ============================================================

$newNutritionTab = @'
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
    { value: "Dinner / Makan Malam", label: "Malam" },
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

  async function submitNutritionSmart() {
    setSavingSmart(true);
    await Promise.resolve(saveNutrition());

    window.setTimeout(() => {
      loadDirectNutrition();
      setSavingSmart(false);
    }, 1200);
  }

  function changePortion(key: string, value: string) {
    setPortionMap((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  return (
    <section className="w-full max-w-full space-y-4 overflow-hidden">
      <div className="rounded-[1.8rem] border border-white bg-white p-4 shadow-lg shadow-slate-200/50">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-teal-700/70">
              Food Diary
            </div>

            <h2 className="mt-2 text-2xl font-black leading-tight text-slate-950">
              Input Nutrisi
            </h2>

            <p className="mt-2 text-xs font-bold leading-5 text-slate-500">
              Ketik makanan dengan koma. Sistem otomatis membuat breakdown dan estimasi kalori.
            </p>
          </div>

          <div className="shrink-0 rounded-[1.3rem] bg-teal-50 px-4 py-3 text-right">
            <div className="text-[10px] font-black uppercase tracking-wide text-teal-700/70">
              Estimasi
            </div>
            <div className="text-xl font-black text-teal-900">
              {fmtNumber(totalEstimatedCalories, 0)}
            </div>
            <div className="text-[10px] font-bold text-teal-700/70">
              kkal
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          <label className="grid gap-2 text-xs font-black text-slate-700">
            Tanggal
            <input
              type="date"
              value={form.log_date}
              onChange={(e) => setValue("log_date", e.target.value)}
              className={`${fieldClass} w-full text-sm`}
            />
          </label>

          <div className="grid gap-2">
            <div className="text-xs font-black text-slate-700">
              Waktu Makan
            </div>

            <div className="grid grid-cols-4 gap-2">
              {mealChips.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setValue("meal_type", item.value)}
                  className={`rounded-2xl px-2 py-3 text-[11px] font-black transition ${
                    form.meal_type === item.value
                      ? "bg-teal-600 text-white shadow-md shadow-teal-100"
                      : "bg-slate-50 text-slate-600"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <label className="grid gap-2 text-xs font-black text-slate-700">
            Nama Makanan
            <textarea
              value={form.food_name}
              onChange={(e) => setValue("food_name", e.target.value)}
              className={`${fieldClass} min-h-[92px] w-full resize-none text-sm`}
              placeholder="Contoh: Nasi putih, sayur sop, ayam goreng"
            />
          </label>

          <CompactAutoFoodBreakdownV43
            foods={parsedFoods}
            onChangePortion={changePortion}
          />

          <label className="grid gap-2 text-xs font-black text-slate-700">
            Upload Foto
            <div className="flex items-center gap-3 rounded-[1.4rem] border border-dashed border-teal-200 bg-[#f4fbfa] p-3">
              <label className="shrink-0 cursor-pointer rounded-2xl bg-white px-4 py-3 text-xs font-black text-teal-700 shadow-sm">
                Pilih Foto
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => setPhoto(event.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>

              <div className="min-w-0 flex-1 truncate text-xs font-bold text-slate-500">
                {photo ? photo.name : "Belum ada foto dipilih"}
              </div>
            </div>
          </label>

          <label className="grid gap-2 text-xs font-black text-slate-700">
            Catatan
            <textarea
              value={form.notes}
              onChange={(e) => setValue("notes", e.target.value)}
              className={`${fieldClass} min-h-[78px] w-full resize-none text-sm`}
              placeholder="Contoh: makan di luar, minuman manis, porsi besar, dll."
            />
          </label>

          <div className="rounded-[1.4rem] bg-teal-50 p-3 text-[11px] font-bold leading-5 text-teal-900">
            Peserta tidak perlu mengisi kalori manual. Sistem mencocokkan makanan dengan Master KaloriData.
          </div>

          <button
            type="button"
            onClick={submitNutritionSmart}
            disabled={savingSmart}
            className="w-full rounded-[1.4rem] bg-teal-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-teal-100 disabled:opacity-50"
          >
            {savingSmart ? "Menyimpan..." : "Simpan Nutrisi"}
          </button>
        </div>
      </div>

      <div className="rounded-[1.8rem] border border-white bg-white p-4 shadow-lg shadow-slate-200/50">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
              Meal History
            </div>

            <h3 className="mt-2 text-xl font-black text-slate-950">
              Riwayat Nutrisi
            </h3>

            {directNutrition?.sources ? (
              <p className="mt-1 text-[11px] font-bold leading-5 text-slate-500">
                Supabase {directNutrition.sources.supabase_rows || 0} row | Google Sheet{" "}
                {directNutrition.sources.google_sheet_rows || 0} row
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={loadDirectNutrition}
            className="rounded-full bg-teal-50 px-3 py-2 text-[11px] font-black text-teal-700"
          >
            {loadingHistory ? "..." : "Refresh"}
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {historyLogs.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs font-bold text-slate-400">
              Belum ada input nutrisi.
            </div>
          ) : (
            historyLogs.slice(0, 6).map((item: any, index: number) => (
              <CompactNutritionHistoryItemV43 key={`${item.id || index}-${index}`} item={item} />
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function CompactAutoFoodBreakdownV43({
  foods,
  onChangePortion,
}: {
  foods: any[];
  onChangePortion: (key: string, value: string) => void;
}) {
  const total = foods.reduce((sum, item) => sum + Number(item.subtotal_calories || 0), 0);

  if (!foods.length) {
    return (
      <div className="rounded-[1.4rem] border border-dashed border-slate-200 bg-slate-50 p-4">
        <div className="text-xs font-black text-slate-900">
          Breakdown otomatis akan muncul di sini.
        </div>
        <p className="mt-1 text-[11px] font-bold leading-5 text-slate-500">
          Pisahkan makanan dengan koma.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[1.4rem] border border-teal-100 bg-[#f4fbfa] p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-black text-slate-950">
            Auto Breakdown
          </div>
          <div className="text-[11px] font-bold text-slate-500">
            {foods.length} item makanan
          </div>
        </div>

        <div className="rounded-full bg-white px-3 py-2 text-[11px] font-black text-teal-700">
          {fmtNumber(total, 0)} kkal
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {foods.map((item) => (
          <div key={item.key} className="rounded-[1.2rem] bg-white p-3 shadow-sm">
            <div className="text-sm font-black text-slate-950">
              {item.input_name}
            </div>

            <div className="mt-1 text-[11px] font-bold leading-5 text-slate-500">
              {item.match_status === "matched"
                ? `${item.matched_name} | ${item.category || "Umum"} | ${fmtNumber(item.base_calories, 0)} kkal dasar`
                : "Belum match di Master KaloriData"}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <select
                value={item.portion_fraction}
                onChange={(event) => onChangePortion(item.key, event.target.value)}
                className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-black text-slate-700 outline-none"
              >
                <option value="1/4">1/4 porsi</option>
                <option value="1/3">1/3 porsi</option>
                <option value="1/2">1/2 porsi</option>
                <option value="1">1 porsi</option>
              </select>

              <div className="shrink-0 rounded-2xl bg-teal-50 px-3 py-3 text-xs font-black text-teal-700">
                {fmtNumber(item.subtotal_calories, 0)} kkal
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompactNutritionHistoryItemV43({ item }: { item: any }) {
  const photo = normalizeImageUrlV37 ? normalizeImageUrlV37(item.photo_url) : clean(item.photo_url);
  const sourceLabel =
    item.source === "google_sheet"
      ? "Google Sheet"
      : item.source === "supabase"
        ? "Supabase"
        : item.source || "Food log";

  return (
    <div className="rounded-[1.4rem] bg-slate-50 p-3">
      <div className="flex items-center gap-3">
        {photo ? (
          <img
            src={photo}
            alt="Foto makanan"
            className="h-14 w-14 shrink-0 rounded-2xl object-cover"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white text-[10px] font-black text-teal-700">
            FOOD
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-black text-slate-950">
            {item.food_name || item.meal_text || "-"}
          </div>

          <div className="mt-1 truncate text-[11px] font-bold capitalize text-slate-500">
            {item.log_date || "-"} | {item.meal_time || item.meal_type || "-"}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-teal-50 px-3 py-1 text-[10px] font-black text-teal-700">
              {fmtNumber(item.calories || item.total_calories || 0, 0)} kkal
            </span>

            <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black text-slate-500">
              {sourceLabel}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

'@

$text = Replace-BlockBetweenFunctions -Text $text -StartFunction "NutritionTab" -NextFunctions @("AutoFoodBreakdownV29", "WorkoutTab") -Replacement $newNutritionTab

Write-Host "OK - NutritionTab replaced with compact mobile layout"

# ============================================================
# 3. Normalize mojibake globally
# ============================================================

$text = $text.Replace("Â€¢", "|")
$text = $text.Replace("â€¢", "|")
$text = $text.Replace("Ã¢â‚¬Â¢", "|")
$text = $text.Replace("•", "|")

Write-Host "OK - mojibake separators normalized"

# ============================================================
# 4. Make input field full width
# ============================================================

$text = $text.Replace(
    'const fieldClass =\r\n  "rounded-2xl border border-slate-200 px-4 py-3 font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100";',
    'const fieldClass =\r\n  "w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100";'
)

$text = $text.Replace(
    'const fieldClass =\n  "rounded-2xl border border-slate-200 px-4 py-3 font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100";',
    'const fieldClass =\n  "w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100";'
)

# ============================================================
# 5. Validation
# ============================================================

Set-Content -Path $path -Value $text -Encoding UTF8

Write-Host ""
Write-Host "VALIDATION"
Write-Host "Login notice:"
Select-String -Path $path -Pattern "PortalLoginStatusNoticeV43" -SimpleMatch | ForEach-Object {
    Write-Host ($_.LineNumber.ToString() + ": " + $_.Line.Trim())
}

Write-Host ""
Write-Host "Compact nutrition:"
Select-String -Path $path -Pattern "CompactAutoFoodBreakdownV43" -SimpleMatch | ForEach-Object {
    Write-Host ($_.LineNumber.ToString() + ": " + $_.Line.Trim())
}

Write-Host ""
Write-Host "Old nutrition big header:"
Select-String -Path $path -Pattern "Input Nutrisi Harian" -SimpleMatch | ForEach-Object {
    Write-Host ($_.LineNumber.ToString() + ": " + $_.Line.Trim())
}

Write-Host ""
Write-Host "DONE - PATCH LOGIN STATUS + COMPACT NUTRITION V43"