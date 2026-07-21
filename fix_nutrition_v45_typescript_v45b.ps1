$ErrorActionPreference = "Stop"

$route = "C:\Users\Lenovo\Documents\mcu_system_nextjs\app\api\wellness\participant\nutrition\route.ts"

if (!(Test-Path $route)) {
    throw "route nutrition tidak ditemukan: $route"
}

Write-Host "FIX NUTRITION V45 TYPESCRIPT V45B"
Write-Host "Patch ini hanya memperbaiki type error TypeScript."
Write-Host "Tidak mengubah Google Sheet, webhook, Supabase table, Google Fit, atau Health Connect."

$text = Get-Content $route -Raw -Encoding UTF8

$text = $text.Replace(
    "portion_estimate_source: calorieResult.portion_estimate_source || null,",
    "portion_estimate_source: (calorieResult as any).portion_estimate_source || null,"
)

$text = $text.Replace(
    "submitted_calories_v45: calorieResult.submitted_calories_v45 || null,",
    "submitted_calories_v45: (calorieResult as any).submitted_calories_v45 || null,"
)

$text = $text.Replace(
    "calorieResult.portion_estimate_source || null",
    "(calorieResult as any).portion_estimate_source || null"
)

$text = $text.Replace(
    "calorieResult.submitted_calories_v45 || null",
    "(calorieResult as any).submitted_calories_v45 || null"
)

Set-Content -Path $route -Value $text -Encoding UTF8

Write-Host ""
Write-Host "VALIDATION"
Select-String -Path $route -Pattern "portion_estimate_source" -SimpleMatch | ForEach-Object {
    Write-Host ($_.LineNumber.ToString() + ": " + $_.Line.Trim())
}

Select-String -Path $route -Pattern "submitted_calories_v45" -SimpleMatch | ForEach-Object {
    Write-Host ($_.LineNumber.ToString() + ": " + $_.Line.Trim())
}

Write-Host ""
Write-Host "DONE - FIX NUTRITION V45 TYPESCRIPT V45B"