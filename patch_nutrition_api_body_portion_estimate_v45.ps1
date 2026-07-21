$ErrorActionPreference = "Stop"

$route = "C:\Users\Lenovo\Documents\mcu_system_nextjs\app\api\wellness\participant\nutrition\route.ts"

if (!(Test-Path $route)) {
    throw "route nutrition tidak ditemukan: $route"
}

Write-Host "PATCH NUTRITION API BODY PORTION ESTIMATE V45"
Write-Host "Patch ini memakai estimated_calories / food_breakdown dari body parseRequestBody."
Write-Host "Tidak mengubah Google Sheet, webhook, Supabase table, Google Fit, atau Health Connect."

$text = Get-Content $route -Raw -Encoding UTF8

# ============================================================
# 1. Bersihkan helper V44 gagal bila sudah sempat masuk
# ============================================================

$beforeClean = $text

$text = [regex]::Replace(
    $text,
    '(?s)\s*// NUTRITION_API_USE_PORTION_ESTIMATE_V44.*?(?=function toNumberOrNull\()',
    "`r`n",
    1
)

if ($text -ne $beforeClean) {
    Write-Host "OK - helper V44 gagal dibersihkan"
} else {
    Write-Host "INFO - helper V44 gagal tidak ditemukan atau sudah bersih"
}

# ============================================================
# 2. Insert helper V45 sebelum toNumberOrNull
# ============================================================

if ($text.Contains("NUTRITION_API_BODY_PORTION_ESTIMATE_V45")) {
    Write-Host "SKIP - helper V45 sudah ada"
} else {
    $helper = @'

// NUTRITION_API_BODY_PORTION_ESTIMATE_V45
function numberFromPostedNutritionV45(value: any) {
  const raw = String(value ?? "")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function parseSubmittedBreakdownV45(value: any) {
  const text = clean(value);

  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readSubmittedNutritionEstimateV45(body: any) {
  const directCalories =
    numberFromPostedNutritionV45(body?.estimated_calories) ||
    numberFromPostedNutritionV45(body?.estimatedCalories) ||
    numberFromPostedNutritionV45(body?.calories) ||
    numberFromPostedNutritionV45(body?.total_calories) ||
    0;

  const breakdown =
    parseSubmittedBreakdownV45(body?.food_breakdown) ||
    parseSubmittedBreakdownV45(body?.portion_breakdown) ||
    [];

  const activeBreakdown = Array.isArray(breakdown) ? breakdown : [];

  const breakdownCalories = activeBreakdown.reduce((sum: number, item: any) => {
    const subtotal =
      numberFromPostedNutritionV45(item?.subtotal_calories) ||
      numberFromPostedNutritionV45(item?.total_calories) ||
      numberFromPostedNutritionV45(item?.calories) ||
      0;

    return sum + subtotal;
  }, 0);

  return {
    submitted_calories: directCalories > 0 ? directCalories : breakdownCalories,
    submitted_breakdown: activeBreakdown,
  };
}

function normalizeSubmittedBreakdownV45(items: any[]) {
  return (items || [])
    .map((item: any) => {
      const inputName = clean(
        item?.input_name ||
          item?.food_name ||
          item?.name ||
          item?.matched_name ||
          "Makanan"
      );

      const matchedName = clean(item?.matched_name || item?.food_name || "");
      const portionFraction = clean(item?.portion_fraction || item?.portion || "");
      const portionMultiplier = numberFromPostedNutritionV45(item?.portion_multiplier) || null;
      const baseCalories = numberFromPostedNutritionV45(item?.base_calories);
      const subtotalCalories =
        numberFromPostedNutritionV45(item?.subtotal_calories) ||
        numberFromPostedNutritionV45(item?.total_calories) ||
        numberFromPostedNutritionV45(item?.calories) ||
        0;

      return {
        input_name: inputName,
        matched: clean(item?.match_status || item?.status).toLowerCase() !== "unmatched",
        matched_name: matchedName || null,
        calories: subtotalCalories,
        base_calories: baseCalories || null,
        portion_fraction: portionFraction || null,
        portion_multiplier: portionMultiplier,
        reference_id: item?.reference_id || item?.id || null,
        category: clean(item?.category) || null,
        status: "matched_master_portion_ui",
      };
    })
    .filter((item: any) => clean(item.input_name));
}

function submittedBreakdownTextV45(items: any[]) {
  return (items || [])
    .map((item: any) => {
      const portion = clean(item.portion_fraction);
      const matched = clean(item.matched_name);
      const calories = numberFromPostedNutritionV45(item.calories);

      if (portion && matched) {
        return `${item.input_name}: ${calories} kkal (${portion} porsi, ${matched})`;
      }

      if (portion) {
        return `${item.input_name}: ${calories} kkal (${portion} porsi)`;
      }

      if (matched) {
        return `${item.input_name}: ${calories} kkal (${matched})`;
      }

      return `${item.input_name}: ${calories} kkal`;
    })
    .join(" | ");
}

function applySubmittedEstimateToCalorieResultV45(calorieResult: any, body: any) {
  const submitted = readSubmittedNutritionEstimateV45(body);
  const submittedCalories = numberFromPostedNutritionV45(submitted.submitted_calories);
  const submittedBreakdown = normalizeSubmittedBreakdownV45(submitted.submitted_breakdown);

  if (submittedCalories <= 0 && submittedBreakdown.length === 0) {
    return calorieResult;
  }

  const breakdownCalories = submittedBreakdown.reduce((sum: number, item: any) => {
    return sum + numberFromPostedNutritionV45(item.calories);
  }, 0);

  const finalCalories =
    submittedCalories > 0
      ? submittedCalories
      : breakdownCalories > 0
        ? breakdownCalories
        : calorieResult?.total_calories;

  const finalBreakdown =
    submittedBreakdown.length > 0 ? submittedBreakdown : calorieResult?.breakdown || [];

  const detectedText =
    submittedBreakdown.length > 0
      ? submittedBreakdownTextV45(finalBreakdown)
      : calorieResult?.detected_foods_text;

  return {
    ...calorieResult,
    total_calories: finalCalories,
    breakdown: finalBreakdown,
    detected_foods_text: detectedText,
    calorie_match_status: "matched_master_portion_ui",
    portion_estimate_source: "client_portion_breakdown_v45",
    submitted_calories_v45: submittedCalories,
  };
}

'@

    $needle = "function toNumberOrNull("
    $idx = $text.IndexOf($needle)

    if ($idx -lt 0) {
        throw "function toNumberOrNull tidak ditemukan"
    }

    $text = $text.Substring(0, $idx) + $helper + "`r`n" + $text.Substring($idx)
    Write-Host "OK - helper V45 inserted sebelum toNumberOrNull"
}

# ============================================================
# 3. Patch call calorieResult di POST
# ============================================================

if ($text.Contains("PORTION_ESTIMATE_APPLIED_V45")) {
    Write-Host "SKIP - calorieResult sudah memakai body portion estimate V45"
} else {
    $old1 = "const calorieResult = await calculateMultiFoodCalories(supabase, foodName);"
    $new1 = @'
let calorieResult = await calculateMultiFoodCalories(supabase, foodName);

// PORTION_ESTIMATE_APPLIED_V45
// Route ini membaca request lewat parseRequestBody(req), jadi estimasi porsi diambil dari body.
calorieResult = applySubmittedEstimateToCalorieResultV45(calorieResult, body);
'@

    if ($text.Contains($old1)) {
        $text = $text.Replace($old1, $new1)
        Write-Host "OK - const calorieResult diganti let + applySubmittedEstimate"
    } else {
        $old2 = "const calorieResult = await calculateMultiFoodCalories("
        if ($text.Contains($old2)) {
            throw "calorieResult pattern beda. Perlu inspect bagian calculateMultiFoodCalories call."
        } else {
            throw "const calorieResult = await calculateMultiFoodCalories(supabase, foodName); tidak ditemukan"
        }
    }
}

# ============================================================
# 4. Pastikan returnedLog dan response pakai calorieResult final
# ============================================================

$text = $text.Replace(
    "const total = calorieResult.total_calories;",
    "const total = calorieResult.total_calories;"
)

# Marker tambahan ke returnedLog kalau pattern food_breakdown ada
if (!$text.Contains("portion_estimate_source: calorieResult.portion_estimate_source")) {
    $text = $text.Replace(
        "food_breakdown: calorieResult.breakdown,",
        "food_breakdown: calorieResult.breakdown,`r`n      portion_estimate_source: calorieResult.portion_estimate_source || null,`r`n      submitted_calories_v45: calorieResult.submitted_calories_v45 || null,"
    )
}

# ============================================================
# 5. Simpan dan validasi
# ============================================================

Set-Content -Path $route -Value $text -Encoding UTF8

Write-Host ""
Write-Host "VALIDATION API"
Write-Host "V45 markers:"
Select-String -Path $route -Pattern "NUTRITION_API_BODY_PORTION_ESTIMATE_V45" -SimpleMatch | ForEach-Object {
    Write-Host ($_.LineNumber.ToString() + ": " + $_.Line.Trim())
}
Select-String -Path $route -Pattern "PORTION_ESTIMATE_APPLIED_V45" -SimpleMatch | ForEach-Object {
    Write-Host ($_.LineNumber.ToString() + ": " + $_.Line.Trim())
}
Select-String -Path $route -Pattern "applySubmittedEstimateToCalorieResultV45" -SimpleMatch | ForEach-Object {
    Write-Host ($_.LineNumber.ToString() + ": " + $_.Line.Trim())
}

Write-Host ""
Write-Host "Old failed V44 helper:"
Select-String -Path $route -Pattern "readSubmittedNutritionEstimateV44" -SimpleMatch | ForEach-Object {
    Write-Host ($_.LineNumber.ToString() + ": " + $_.Line.Trim())
}

Write-Host ""
Write-Host "DONE - PATCH NUTRITION API BODY PORTION ESTIMATE V45"