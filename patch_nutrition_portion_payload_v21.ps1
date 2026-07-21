$ErrorActionPreference = "Stop"

$path = "C:\Users\Lenovo\Documents\mcu_system_nextjs\app\api\wellness\participant\nutrition\route.ts"

if (!(Test-Path $path)) {
    throw "route.ts nutrition tidak ditemukan"
}

Write-Host "PATCH NUTRITION PORTION PAYLOAD V21"

$text = Get-Content $path -Raw -Encoding UTF8

if ($text.Contains("PORTION_PAYLOAD_V21")) {
    Write-Host "SKIP - patch V21 sudah ada"
    exit 0
}

# Tambahkan parser body setelah mealType
$needle = 'const mealType = clean(body?.meal_type || body?.mealType) || "meal";'

$insert = @'
const mealType = clean(body?.meal_type || body?.mealType) || "meal";

// PORTION_PAYLOAD_V21
const portionGroup = clean(
  body?.portion_group ||
    body?.portionGroup ||
    body?.plate_group ||
    body?.plateGroup ||
    body?.isi_piringku_group
);

const portionFraction = clean(
  body?.portion_fraction ||
    body?.portionFraction ||
    body?.plate_fraction ||
    body?.plateFraction ||
    body?.isi_piringku_fraction
);

const portionMultiplierRaw = Number(
  body?.portion_multiplier ||
    body?.portionMultiplier ||
    body?.plate_multiplier ||
    body?.plateMultiplier ||
    0
);

const portionMultiplier = Number.isFinite(portionMultiplierRaw)
  ? portionMultiplierRaw
  : 0;
'@

if ($text.Contains($needle)) {
    $text = $text.Replace($needle, $insert)
    Write-Host "OK - portion parser inserted"
} else {
    Write-Host "WARNING - mealType needle tidak ditemukan. Parser tidak disisipkan."
}

# Sisipkan data porsi ke raw_payload dengan cara aman
$needle2 = 'original_food_name: clean(foodName),'

$insert2 = @'
original_food_name: clean(foodName),
portion_group: portionGroup || null,
portion_fraction: portionFraction || null,
portion_multiplier: portionMultiplier || null,
plate_group: portionGroup || null,
plate_fraction: portionFraction || null,
isi_piringku_group: portionGroup || null,
isi_piringku_fraction: portionFraction || null,
'@

if ($text.Contains($needle2)) {
    $text = $text.Replace($needle2, $insert2)
    Write-Host "OK - portion fields inserted into raw payload object"
} else {
    Write-Host "WARNING - original_food_name needle tidak ditemukan. raw_payload belum dipatch."
}

# Kalau payload insert punya portion, tidak perlu ubah. Kalau belum, tambahkan field porsi setelah portion.
$needle3 = 'portion: portion,'

$insert3 = @'
portion: portion,
portion_group: portionGroup || null,
portion_fraction: portionFraction || null,
portion_multiplier: portionMultiplier || null,
'@

if ($text.Contains($needle3)) {
    $text = $text.Replace($needle3, $insert3)
    Write-Host "OK - portion columns inserted into payload when available"
} else {
    Write-Host "INFO - field portion tidak ditemukan, raw_payload tetap cukup untuk trigger."
}

Set-Content -Path $path -Value $text -Encoding UTF8

Write-Host "DONE - PATCH NUTRITION PORTION PAYLOAD V21"