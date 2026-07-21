$ErrorActionPreference = "Stop"

$project = "C:\Users\Lenovo\Documents\mcu_system_nextjs"
$apiPath = Join-Path $project "app\api\wellness\portal\nutrition-direct\route.ts"

if (!(Test-Path $apiPath)) {
    throw "nutrition-direct route.ts tidak ditemukan"
}

Write-Host "PATCH NUTRITION DIRECT ACCURACY V30"
Write-Host "Patch ini hanya memperbaiki pembacaan Google Sheet, total kalori, dan URL foto."

$text = Get-Content $apiPath -Raw -Encoding UTF8

if ($text.Contains("NUTRITION_DIRECT_ACCURACY_V30")) {
    Write-Host "SKIP - V30 sudah ada"
    exit 0
}

# Tambahkan helper setelah function clean
$needle = @'
function clean(value: unknown) {
  return String(value || "").trim();
}
'@

$helper = @'
function clean(value: unknown) {
  return String(value || "").trim();
}

// NUTRITION_DIRECT_ACCURACY_V30
function extractExplicitCaloriesFromSheetRow(row: Record<string, string>) {
  const combined = Object.values(row || {}).join(" ");

  const totalMatch =
    combined.match(/total\s+([0-9.,]+)\s*(?:kalori|kkal|calories|calorie)/i) ||
    combined.match(/([0-9.,]+)\s*(?:kalori|kkal)\s*[\-–—•]*\s*breakdown/i);

  if (!totalMatch) return 0;

  const n = Number(String(totalMatch[1]).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function normalizeGoogleDriveImageUrlV30(value: unknown) {
  const raw = clean(value);

  if (!raw) return "";

  const fileMatch = raw.match(/\/file\/d\/([^/]+)/i);
  if (fileMatch?.[1]) {
    return `https://drive.google.com/thumbnail?id=${fileMatch[1]}&sz=w600`;
  }

  const idMatch =
    raw.match(/[?&]id=([^&]+)/i) ||
    raw.match(/thumbnail\?id=([^&]+)/i);

  if (idMatch?.[1]) {
    return `https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=w600`;
  }

  return raw;
}
'@

if ($text.Contains($needle)) {
    $text = $text.Replace($needle, $helper)
    Write-Host "OK - helper explicit calories and drive thumbnail inserted"
} else {
    throw "function clean exact pattern tidak ditemukan"
}

# Patch normalizeSheetFood agar explicit total dipakai
$old = @'
  const result = matchFoodCalories(mealText, foodIndex);
  const logDate = normalizeSheetDate(submissionDate);

  return {
'@

$new = @'
  const result = matchFoodCalories(mealText, foodIndex);
  const explicitCalories = extractExplicitCaloriesFromSheetRow(row);
  const finalCalories = explicitCalories > 0 ? explicitCalories : result.totalCalories;
  const logDate = normalizeSheetDate(submissionDate);

  return {
'@

if ($text.Contains($old)) {
    $text = $text.Replace($old, $new)
    Write-Host "OK - explicit calories selected before return"
} else {
    Write-Host "WARNING - block result/logDate tidak ditemukan, skip"
}

$text = $text.Replace(
    "calories: result.totalCalories,",
    "calories: finalCalories,"
)

$text = $text.Replace(
    "total_calories: result.totalCalories,",
    "total_calories: finalCalories,"
)

$text = $text.Replace(
    "photo_url: previewPhoto || uploadPhoto || \"\",",
    "photo_url: normalizeGoogleDriveImageUrlV30(previewPhoto || uploadPhoto || \"\"),"
)

# Patch supabase photo_url juga kalau ada drive file/d
$text = $text.Replace(
    "photo_url: firstText(",
    "photo_url: normalizeGoogleDriveImageUrlV30(firstText("
)

# Karena replace di atas menambah kurung, tutup pola umum pada normalizeSupabaseFood
$text = $text.Replace(
    "original?.photoUrl`r`n    ),",
    "original?.photoUrl`r`n    )),"
)

$text = $text.Replace(
    "original?.photoUrl`n    ),",
    "original?.photoUrl`n    )),"
)

Set-Content -Path $apiPath -Value $text -Encoding UTF8

Write-Host "DONE - PATCH NUTRITION DIRECT ACCURACY V30"