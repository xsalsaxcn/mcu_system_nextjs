$ErrorActionPreference = "Stop"

$path = "C:\Users\Lenovo\Documents\mcu_system_nextjs\app\wellness\portal\page.tsx"

if (!(Test-Path $path)) {
    throw "page.tsx tidak ditemukan"
}

Write-Host "FIX PORTAL PAGE RETURN V12"

$text = Get-Content $path -Raw -Encoding UTF8

$old = @'
return (
    <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-orange-400 via-orange-500 to-amber-500 p-6 text-white shadow-xl shadow-orange-100 md:p-8">
'@

$new = @'
return (
    <main className="min-h-screen bg-[#f4fbfa] pb-28 pt-16 text-slate-900 md:bg-[#f6fbff] md:pb-0 md:pt-0">
'@

if ($text.Contains($old)) {
    $text = $text.Replace($old, $new)
    Write-Host "OK - return utama diganti dari section ke main"
} else {
    Write-Host "Exact old return tidak ditemukan. Coba patch pola line-by-line..."

    $lines = Get-Content $path -Encoding UTF8
    $out = New-Object System.Collections.Generic.List[string]
    $fixed = $false

    for ($i = 0; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]

        if (!$fixed -and $line.Trim() -eq "return (" -and ($i + 1) -lt $lines.Count) {
            $next = $lines[$i + 1]

            if ($next -like '*from-orange-400 via-orange-500 to-amber-500*') {
                $out.Add($line)
                $out.Add('    <main className="min-h-screen bg-[#f4fbfa] pb-28 pt-16 text-slate-900 md:bg-[#f6fbff] md:pb-0 md:pt-0">')
                $i++
                $fixed = $true
                continue
            }
        }

        $out.Add($line)
    }

    if (!$fixed) {
        throw "Gagal menemukan return utama yang rusak. Kirim line 815-830 dari page.tsx."
    }

    $text = $out -join "`r`n"
    Write-Host "OK - return utama berhasil diperbaiki dengan patch line-by-line"
}

# Ubah hero dalam portal dari biru/orange keras menjadi pastel green-blue
$text = $text.Replace(
  'bg-gradient-to-r from-blue-700 via-indigo-600 to-emerald-500 p-6 text-white shadow-xl shadow-blue-100',
  'bg-gradient-to-br from-teal-400 via-sky-400 to-blue-500 p-6 text-white shadow-xl shadow-sky-100'
)

$text = $text.Replace(
  'bg-gradient-to-br from-orange-400 via-orange-500 to-amber-500',
  'bg-gradient-to-br from-teal-400 via-sky-400 to-blue-500'
)

Set-Content -Path $path -Value $text -Encoding UTF8

Write-Host "DONE - page.tsx fixed"