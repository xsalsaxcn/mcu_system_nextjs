$ErrorActionPreference = "Stop"

$route = "C:\Users\Lenovo\Documents\mcu_system_nextjs\app\api\wellness\participant\nutrition\route.ts"

if (!(Test-Path $route)) {
    throw "route nutrition tidak ditemukan: $route"
}

Write-Host "PATCH NUTRITION API USE PORTION ESTIMATE V44"
Write-Host "Patch ini membuat backend memakai estimated_calories dari breakdown porsi bila tersedia."

$text = Get-Content $route -Raw -Encoding UTF8

if ($text.Contains("NUTRITION_API_USE_PORTION_ESTIMATE_V44")) {
    Write-Host "SKIP - API V44 sudah ada"
    exit 0
}

# ============================================================
# 1. Insert helper setelah clean/asNumber bila memungkinkan
# ============================================================

$helper = @'

// NUTRITION_API_USE_PORTION_ESTIMATE_V44
function numberFromPostedNutritionV44(value: unknown) {
  const raw = String(value || "")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function readSubmittedNutritionEstimateV44(formData: FormData) {
  const estimated = numberFromPostedNutritionV44(
    formData.get("estimated_calories") || formData.get("calories")
  );

  const breakdownText = String(
    formData.get("food_breakdown") ||
      formData.get("portion_breakdown") ||
      ""
  );

  let breakdown: any[] = [];

  if (breakdownText) {
    try {
      const parsed = JSON.parse(breakdownText);
      if (Array.isArray(parsed)) breakdown = parsed;
    } catch {
      breakdown = [];
    }
  }

  const breakdownCalories = breakdown.reduce((sum, item) => {
    return sum + numberFromPostedNutritionV44(item?.subtotal_calories);
  }, 0);

  return {
    submitted_calories: estimated > 0 ? estimated : breakdownCalories,
    submitted_breakdown: breakdown,
    submitted_breakdown_text: breakdownText,
  };
}

'@

$insertedHelper = $false

$cleanIndex = $text.IndexOf("function clean(")
if ($cleanIndex -ge 0) {
    $nextFunction = $text.IndexOf("function", $cleanIndex + 10)

    if ($nextFunction -gt $cleanIndex) {
        # cari akhir function clean secara sederhana: insert sebelum function berikutnya setelah clean
        $text = $text.Substring(0, $nextFunction) + $helper + "`r`n" + $text.Substring($nextFunction)
        $insertedHelper = $true
        Write-Host "OK - helper V44 inserted after clean area"
    }
}

if (!$insertedHelper) {
    $text = $helper + "`r`n" + $text
    Write-Host "OK - helper V44 inserted at top fallback"
}

# ============================================================
# 2. Insert read estimate setelah await request.formData()
# ============================================================

$formNeedle = "const formData = await request.formData();"

$formInsert = @'
const formData = await request.formData();

    const nutritionEstimateV44 = readSubmittedNutritionEstimateV44(formData);
'@

if ($text.Contains($formNeedle)) {
    $text = $text.Replace($formNeedle, $formInsert)
    Write-Host "OK - nutritionEstimateV44 dibaca dari FormData"
} else {
    throw "const formData = await request.formData(); tidak ditemukan"
}

# ============================================================
# 3. Setelah totalCalories dihitung, buat finalCaloriesV44
# ============================================================

$regexTotal = [regex]'(const\s+totalCalories\s*=\s*[^;]+;)'

if ($regexTotal.IsMatch($text)) {
    $text = $regexTotal.Replace($text, '$1' + "`r`n" + '    const finalCaloriesV44 = nutritionEstimateV44.submitted_calories > 0 ? nutritionEstimateV44.submitted_calories : totalCalories;', 1)
    Write-Host "OK - finalCaloriesV44 dibuat dari submitted estimate atau totalCalories"
} else {
    Write-Host "WARNING - const totalCalories tidak ditemukan, patch finalCalories manual mungkin perlu"
}

# ============================================================
# 4. Targeted replace totalCalories menjadi finalCaloriesV44 pada payload/message umum
# ============================================================

$text = $text.Replace("calories: totalCalories,", "calories: finalCaloriesV44,")
$text = $text.Replace("total_calories: totalCalories,", "total_calories: finalCaloriesV44,")
$text = $text.Replace("estimated_calories: totalCalories,", "estimated_calories: finalCaloriesV44,")
$text = $text.Replace("matched_calories: totalCalories,", "matched_calories: finalCaloriesV44,")

$text = $text.Replace("Total ${totalCalories} kalori", "Total ${finalCaloriesV44} kalori")
$text = $text.Replace("Total ${totalCalories} kkal", "Total ${finalCaloriesV44} kkal")

# Kalau ada raw_payload, sisipkan breakdown bila pattern raw_payload object ditemukan
$text = $text.Replace(
    "raw_payload: {",
    "raw_payload: { submitted_breakdown_v44: nutritionEstimateV44.submitted_breakdown, submitted_calories_v44: nutritionEstimateV44.submitted_calories,"
)

Set-Content -Path $route -Value $text -Encoding UTF8

Write-Host ""
Write-Host "VALIDATION API"
Select-String -Path $route -Pattern "NUTRITION_API_USE_PORTION_ESTIMATE_V44" -SimpleMatch | ForEach-Object {
    Write-Host ($_.LineNumber.ToString() + ": " + $_.Line.Trim())
}
Select-String -Path $route -Pattern "finalCaloriesV44" -SimpleMatch | ForEach-Object {
    Write-Host ($_.LineNumber.ToString() + ": " + $_.Line.Trim())
}
Select-String -Path $route -Pattern "nutritionEstimateV44" -SimpleMatch | ForEach-Object {
    Write-Host ($_.LineNumber.ToString() + ": " + $_.Line.Trim())
}

Write-Host ""
Write-Host "DONE - PATCH NUTRITION API USE PORTION ESTIMATE V44"