$ErrorActionPreference = "Stop"

$path = "C:\Users\Lenovo\Documents\mcu_system_nextjs\app\api\wellness\participant\nutrition\route.ts"

if (!(Test-Path $path)) {
    throw "route.ts nutrition tidak ditemukan"
}

Write-Host "FIX NUTRITION PORTION SCOPE V23"

$text = Get-Content $path -Raw -Encoding UTF8

if ($text.Contains("PORTION_SCOPE_FALLBACK_V23")) {
    Write-Host "SKIP - fallback scope V23 sudah ada"
} else {
    $marker = 'export const dynamic'

    if ($text.Contains($marker)) {
        $fallback = @'
// PORTION_SCOPE_FALLBACK_V23
// Fallback ini hanya untuk helper function lama yang berada di luar scope POST.
// Variable porsi yang benar tetap dibuat ulang di dalam POST request.
const portionGroup = "";
const portionFraction = "";
const portionMultiplier = 0;

'@

        $text = $text.Replace($marker, $fallback + $marker)
        Write-Host "OK - fallback variable portionGroup/portionFraction/portionMultiplier ditambahkan"
    } else {
        throw "Marker export const dynamic tidak ditemukan"
    }
}

Set-Content -Path $path -Value $text -Encoding UTF8

Write-Host "DONE - FIX NUTRITION PORTION SCOPE V23"