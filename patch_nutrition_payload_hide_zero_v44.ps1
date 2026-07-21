$ErrorActionPreference = "Stop"

$page = "C:\Users\Lenovo\Documents\mcu_system_nextjs\app\wellness\portal\page.tsx"

if (!(Test-Path $page)) {
    throw "page.tsx tidak ditemukan"
}

Write-Host "PATCH NUTRITION PAYLOAD + HIDE ZERO ESTIMATE V44"
Write-Host "Patch ini mengirim breakdown porsi ke backend dan hide estimasi 0."
Write-Host "Tidak mengubah Google Sheet, Supabase table, Google Fit, atau Health Connect."

$text = Get-Content $page -Raw -Encoding UTF8

# ============================================================
# 1. Kirim estimated_calories dan breakdown ke endpoint saveNutrition
# ============================================================

$needle = 'body.append("notes", nutritionForm.notes);'

$insert = @'
body.append("notes", nutritionForm.notes);

    // NUTRITION_PORTION_PAYLOAD_V44
    // Kirim hasil breakdown porsi dari UI ke backend agar 1/2 porsi tidak dihitung sebagai 1 porsi.
    body.append("estimated_calories", String(nutritionForm.estimated_calories || nutritionForm.calories || ""));
    body.append("calories", String(nutritionForm.calories || nutritionForm.estimated_calories || ""));
    body.append("food_breakdown", String(nutritionForm.food_breakdown || ""));
    body.append("portion_breakdown", String(nutritionForm.portion_breakdown || nutritionForm.food_breakdown || ""));
    body.append("portion_group", String(nutritionForm.portion_group || ""));
    body.append("portion_fraction", String(nutritionForm.portion_fraction || ""));
'@

if ($text.Contains("NUTRITION_PORTION_PAYLOAD_V44")) {
    Write-Host "SKIP - payload nutrisi V44 sudah ada"
} elseif ($text.Contains($needle)) {
    $text = $text.Replace($needle, $insert)
    Write-Host "OK - payload estimated_calories dan breakdown ditambahkan ke saveNutrition"
} else {
    throw "body.append notes nutritionForm tidak ditemukan"
}

# ============================================================
# 2. Hide box Estimasi kalau masih 0
# ============================================================

$oldBox = @'
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
'@

$newBox = @'
          {totalEstimatedCalories > 0 ? (
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
          ) : null}
'@

if ($text.Contains($oldBox)) {
    $text = $text.Replace($oldBox, $newBox)
    Write-Host "OK - box Estimasi 0 di-hide"
} else {
    Write-Host "INFO - exact box Estimasi tidak ditemukan, coba regex"

    $pattern = '(?s)\s*<div className="shrink-0 rounded-\[1\.3rem\] bg-teal-50 px-4 py-3 text-right">\s*<div className="text-\[10px\] font-black uppercase tracking-wide text-teal-700/70">\s*Estimasi\s*</div>\s*<div className="text-xl font-black text-teal-900">\s*\{fmtNumber\(totalEstimatedCalories,\s*0\)\}\s*</div>\s*<div className="text-\[10px\] font-bold text-teal-700/70">\s*kkal\s*</div>\s*</div>'

    $newText = [regex]::Replace($text, $pattern, "`r`n          {totalEstimatedCalories > 0 ? (`r`n            <div className=`"shrink-0 rounded-[1.3rem] bg-teal-50 px-4 py-3 text-right`">`r`n              <div className=`"text-[10px] font-black uppercase tracking-wide text-teal-700/70`">Estimasi</div>`r`n              <div className=`"text-xl font-black text-teal-900`">{fmtNumber(totalEstimatedCalories, 0)}</div>`r`n              <div className=`"text-[10px] font-bold text-teal-700/70`">kkal</div>`r`n            </div>`r`n          ) : null}", 1)

    if ($newText -eq $text) {
        Write-Host "WARNING - box Estimasi belum berhasil di-hide"
    } else {
        $text = $newText
        Write-Host "OK - box Estimasi 0 di-hide via regex"
    }
}

Set-Content -Path $page -Value $text -Encoding UTF8

Write-Host ""
Write-Host "VALIDATION PAGE"
Select-String -Path $page -Pattern "NUTRITION_PORTION_PAYLOAD_V44" -SimpleMatch | ForEach-Object {
    Write-Host ($_.LineNumber.ToString() + ": " + $_.Line.Trim())
}
Select-String -Path $page -Pattern "totalEstimatedCalories > 0" -SimpleMatch | ForEach-Object {
    Write-Host ($_.LineNumber.ToString() + ": " + $_.Line.Trim())
}

Write-Host ""
Write-Host "DONE - PATCH NUTRITION PAYLOAD + HIDE ZERO ESTIMATE V44"