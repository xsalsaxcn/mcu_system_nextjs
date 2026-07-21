$ErrorActionPreference = "Stop"

$path = "C:\Users\Lenovo\Documents\mcu_system_nextjs\app\wellness\portal\page.tsx"

if (!(Test-Path $path)) {
    throw "page.tsx tidak ditemukan"
}

Write-Host "REMOVE OLD INVALID SUMMARY CARD V38"
Write-Host "Patch ini hanya hide card lama yang muncul sebelum section Halo."
Write-Host "Tidak mengubah API, Google Sheet, Supabase, Google Fit, atau Health Connect."

$text = Get-Content $path -Raw -Encoding UTF8

$component = @'

function HideOldInvalidSummaryCardV38() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    function textOf(element: Element | null) {
      return String(element?.textContent || "").replace(/\s+/g, " ").trim();
    }

    function isCardLike(element: HTMLElement) {
      const className = element.getAttribute("class") || "";

      return (
        className.includes("rounded") ||
        className.includes("shadow") ||
        className.includes("border") ||
        className.includes("bg-white") ||
        className.includes("bg-[#")
      );
    }

    function hideElement(element: HTMLElement) {
      element.style.display = "none";
      element.setAttribute("data-hidden-by", "HideOldInvalidSummaryCardV38");
    }

    function isBefore(a: HTMLElement, b: HTMLElement) {
      return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    }

    function scan() {
      if (!document.body) return;

      const all = Array.from(
        document.body.querySelectorAll("section, div, article")
      ) as HTMLElement[];

      const haloElement =
        all.find((element) => {
          const text = textOf(element);
          return (
            text.includes("Halo,") &&
            text.includes("Ringkasan aktivitas") &&
            text.includes("Refresh Nutrisi")
          );
        }) || null;

      all.forEach((element) => {
        const text = textOf(element);
        const rect = element.getBoundingClientRect();

        if (!isCardLike(element)) return;

        const beforeHalo = haloElement ? isBefore(element, haloElement) : true;

        const isIntroHero =
          text.includes("WELLNESS PARTICIPANT PORTAL") ||
          text.includes("Portal Individu Peserta") ||
          text.includes("Portal peserta aktif. Silakan input");

        const isOldSummaryGroup =
          beforeHalo &&
          text.includes("CALORIES IN") &&
          text.includes("WORKOUT CALORIES") &&
          text.includes("STEPS") &&
          !text.includes("Halo,") &&
          text.length < 1200;

        const isEmptyOldCard =
          beforeHalo &&
          text.length === 0 &&
          rect.width > 220 &&
          rect.height > 24 &&
          rect.height < 160;

        if (isIntroHero || isOldSummaryGroup || isEmptyOldCard) {
          hideElement(element);
        }
      });
    }

    scan();

    const observer = new MutationObserver(() => {
      scan();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, []);

  return null;
}

'@

# Replace old hide components if any
if ($text.Contains("function HideParticipantIntroCardsV37(")) {
    $start = $text.IndexOf("function HideParticipantIntroCardsV37(")
    $end = $text.IndexOf("function HomeTab(", $start)

    if ($end -lt 0) {
        throw "Tidak menemukan function HomeTab setelah HideParticipantIntroCardsV37"
    }

    $text = $text.Substring(0, $start) + $component + $text.Substring($end)
    Write-Host "OK - HideParticipantIntroCardsV37 replaced by V38"
} elseif ($text.Contains("function HideOldInvalidSummaryCardV38(")) {
    Write-Host "SKIP - HideOldInvalidSummaryCardV38 sudah ada"
} else {
    $insertBefore = $text.IndexOf("function HomeTab(")

    if ($insertBefore -lt 0) {
        throw "function HomeTab tidak ditemukan"
    }

    $text = $text.Substring(0, $insertBefore) + $component + $text.Substring($insertBefore)
    Write-Host "OK - HideOldInvalidSummaryCardV38 inserted"
}

# Replace old mount
$text = $text.Replace("<HideParticipantIntroCardsV37 />", "<HideOldInvalidSummaryCardV38 />")

# Ensure V38 mounted after main
if (!$text.Contains("<HideOldInvalidSummaryCardV38 />")) {
    $mainMatch = [regex]::Match($text, "<main\b[^>]*>")

    if ($mainMatch.Success) {
        $insertPos = $mainMatch.Index + $mainMatch.Length
        $text = $text.Substring(0, $insertPos) + "`r`n      <HideOldInvalidSummaryCardV38 />" + $text.Substring($insertPos)
        Write-Host "OK - HideOldInvalidSummaryCardV38 mounted after main"
    } else {
        throw "main tag tidak ditemukan untuk mounting V38"
    }
} else {
    Write-Host "OK - HideOldInvalidSummaryCardV38 already mounted"
}

Set-Content -Path $path -Value $text -Encoding UTF8

Write-Host "DONE - REMOVE OLD INVALID SUMMARY CARD V38"