"use client";

// VACCINATION_SESSION_MAPPING_PERSISTENCE_V153_2
import { useEffect } from "react";

function clean(value: any) {
  return String(value ?? "").trim();
}

function normalize(value: any) {
  return clean(value).toLowerCase().replace(/\s+/g, " ");
}

function isMappingSelect(select: HTMLSelectElement) {
  return Array.from(select.options).some((option) =>
    normalize(option.textContent).includes("pilih mapping vaksin"),
  );
}

function mappingKey(select: HTMLSelectElement) {
  const row = select.closest("tr");
  if (!row) return "";

  const cells = Array.from(row.querySelectorAll("td"));
  if (!cells.length) return "";

  // First column is BATCHNAME DI DATABASE.
  return normalize(cells[0]?.textContent);
}

/**
 * Purpose:
 * Existing source BatchName -> session vaccine/lot mapping must survive when
 * the user adds another vaccine/lot to "Daftar Vaksin & Lot untuk Session Ini".
 *
 * The current Session UI already rebuilds the mapping dropdown options when
 * session vaccines change. That is correct, but the controlled-select state can
 * be reset to blank during that rebuild. This small enhancer remembers the
 * user's existing selections and restores them only when the same option still
 * exists. It never auto-selects a new mapping and never overwrites an explicit
 * user change.
 */
export default function VaccinationSessionMappingPersistence() {
  useEffect(() => {
    const remembered = new Map<string, string>();
    let scheduled = false;
    let restoring = false;

    function scan() {
      scheduled = false;

      const selects = Array.from(
        document.querySelectorAll<HTMLSelectElement>("select"),
      ).filter(isMappingSelect);

      for (const select of selects) {
        const key = mappingKey(select);
        if (!key) continue;

        const current = clean(select.value);

        if (!remembered.has(key)) {
          remembered.set(key, current);
          continue;
        }

        const wanted = clean(remembered.get(key));

        // User intentionally chose/cleared a mapping. Native change events are
        // captured below, so do not second-guess a real user action.
        if (current === wanted) continue;

        if (!wanted) {
          // Remembered blank means user intentionally left it unmapped.
          continue;
        }

        const stillAvailable = Array.from(select.options).some(
          (option) => clean(option.value) === wanted,
        );

        if (!stillAvailable) {
          // The mapped product itself was removed. Do not resurrect an invalid
          // mapping; allow the existing UI to show it as unmapped.
          remembered.set(key, current);
          continue;
        }

        // React rerender reset the same BatchName to blank while the original
        // product is still available. Restore and dispatch change so the
        // existing React state is updated too.
        restoring = true;
        select.value = wanted;
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
        restoring = false;
      }
    }

    function scheduleScan() {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(scan);
    }

    function onChange(event: Event) {
      if (restoring) return;

      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      if (!isMappingSelect(target)) return;

      const key = mappingKey(target);
      if (!key) return;

      // Store blank too: this lets users intentionally clear a mapping.
      remembered.set(key, clean(target.value));
    }

    document.addEventListener("change", onChange, true);

    const observer = new MutationObserver(() => {
      scheduleScan();
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: false,
    });

    scheduleScan();

    return () => {
      observer.disconnect();
      document.removeEventListener("change", onChange, true);
    };
  }, []);

  return null;
}
