$ErrorActionPreference = "Stop"

$path = "C:\Users\Lenovo\Documents\mcu_system_nextjs\app\wellness\portal\page.tsx"

if (!(Test-Path $path)) {
    throw "page.tsx tidak ditemukan"
}

Write-Host "REMOVE LEGACY METRIC GRID V39"
Write-Host "Patch ini hanya hide metric grid lama di atas section Halo."
Write-Host "Tidak mengubah API, Google Sheet, Supabase, Google Fit, atau Health Connect."

$text = Get-Content $path -Raw -Encoding UTF8

$component = @'

function HideOldInvalidSummaryCardV39() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    function compactText(element: Element | null) {
      return String(element?.textContent || "").replace(/\s+/g, " ").trim();
    }

    function hide(element: HTMLElement | null, reason: string) {
      if (!element) return;
      element.style.display = "none";
      element.setAttribute("data-hidden-by", "HideOldInvalidSummaryCardV39");
      element.setAttribute("data-hidden-reason", reason);
    }

    function isLegacyCaloriesCard(element: HTMLElement) {
      const text = compactText(element);

      return (
        text.includes("CALORIES IN") &&
        text.includes("0 kkal") &&
        text.includes("0 input nutrisi hari ini") &&
        !text.includes("Halo,")
      );
    }

    function findMetricGridFromCaloriesCard(card: HTMLElement) {
      let current: HTMLElement | null = card;

      for (let level = 0; current && level < 8; level++) {
        const text = compactText(current);
        const className = current.getAttribute("class") || "";

        const hasLegacySummary =
          text.includes("CALORIES IN") &&
          text.includes("WORKOUT CALORIES") &&
          text.includes("STEPS") &&
          text.includes("BMI / TENSI") &&
          !text.includes("Halo,");

        const looksLikeLayout =
          className.includes("grid") ||
          className.includes("space-y") ||
          className.includes("rounded") ||
          className.includes("shadow") ||
          className.includes("border");

        if (hasLegacySummary && looksLikeLayout) {
          return current;
        }

        current = current.parentElement;
      }

      return card;
    }

    function hideEmptyIntroArtifacts() {
      const candidates = Array.from(
        document.body.querySelectorAll("section, div, article")
      ) as HTMLElement[];

      candidates.forEach((element) => {
        const text = compactText(element);
        const rect = element.getBoundingClientRect();
        const className = element.getAttribute("class") || "";

        const cardLike =
          className.includes("rounded") ||
          className.includes("shadow") ||
          className.includes("border") ||
          className.includes("bg-white");

        if (
          cardLike &&
          text.length === 0 &&
          rect.width > 220 &&
          rect.height > 20 &&
          rect.height < 160
        ) {
          hide(element, "empty-intro-artifact");
        }
      });
    }

    function scan() {
      if (!document.body) return;

      const all = Array.from(
        document.body.querySelectorAll("section, div, article")
      ) as HTMLElement[];

      all.forEach((element) => {
        if (!isLegacyCaloriesCard(element)) return;

        const grid = findMetricGridFromCaloriesCard(element);
        hide(grid, "legacy-metric-grid");

        let parent = grid.parentElement as HTMLElement | null;

        if (parent) {
          const parentText = compactText(parent);

          if (
            parentText.includes("CALORIES IN") &&
            parentText.includes("0 input nutrisi hari ini") &&
            parentText.includes("Halo,") &&
            parentText.length < 2500
          ) {
            Array.from(parent.children).forEach((child) => {
              const childElement = child as HTMLElement;
              const childText = compactText(childElement);

              if (
                childText.includes("CALORIES IN") &&
                childText.includes("0 input nutrisi hari ini") &&
                !childText.includes("Halo,")
              ) {
                hide(childElement, "legacy-summary-child");
              }
            });
          }
        }
      });

      hideEmptyIntroArtifacts();
    }

    scan();

    const observer = new MutationObserver(() => {
      scan();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    const timer = window.setInterval(scan, 800);

    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, []);

  return null;
}

'@

# Replace any previous hide component V37/V38/V39
$patterns = @(
    "function HideParticipantIntroCardsV37(",
    "function HideOldInvalidSummaryCardV38(",
    "function HideOldInvalidSummaryCardV39("
)

$replaced = $false

foreach ($pattern in $patterns) {
    $start = $text.IndexOf($pattern)

    if ($start -ge 0) {
        $nextHome = $text.IndexOf("function HomeTab(", $start)

        if ($nextHome -lt 0) {
            throw "Tidak menemukan function HomeTab setelah hide component"
        }

        $text = $text.Substring(0, $start) + $component + $text.Substring($nextHome)
        $replaced = $true
        Write-Host "OK - previous hide component replaced with V39"
        break
    }
}

if (!$replaced) {
    $insertBefore = $text.IndexOf("function HomeTab(")

    if ($insertBefore -lt 0) {
        throw "function HomeTab tidak ditemukan"
    }

    $text = $text.Substring(0, $insertBefore) + $component + $text.Substring($insertBefore)
    Write-Host "OK - HideOldInvalidSummaryCardV39 inserted"
}

# Replace old mounts
$text = $text.Replace("<HideParticipantIntroCardsV37 />", "<HideOldInvalidSummaryCardV39 />")
$text = $text.Replace("<HideOldInvalidSummaryCardV38 />", "<HideOldInvalidSummaryCardV39 />")

# Ensure V39 mounted
if (!$text.Contains("<HideOldInvalidSummaryCardV39 />")) {
    $mainMatch = [regex]::Match($text, "<main\b[^>]*>")

    if ($mainMatch.Success) {
        $insertPos = $mainMatch.Index + $mainMatch.Length
        $text = $text.Substring(0, $insertPos) + "`r`n      <HideOldInvalidSummaryCardV39 />" + $text.Substring($insertPos)
        Write-Host "OK - HideOldInvalidSummaryCardV39 mounted after main"
    } else {
        throw "main tag tidak ditemukan untuk mounting V39"
    }
} else {
    Write-Host "OK - HideOldInvalidSummaryCardV39 mounted"
}

Set-Content -Path $path -Value $text -Encoding UTF8

Write-Host "DONE - REMOVE LEGACY METRIC GRID V39"