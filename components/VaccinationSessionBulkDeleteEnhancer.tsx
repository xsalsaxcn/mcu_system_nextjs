"use client";

import { useEffect } from "react";

function cleanText(value: any) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isVaccinationSessionPage() {
  if (typeof window === "undefined") return false;

  const path = window.location.pathname;
  const bodyText = cleanText(document.body?.textContent || "");

  if (!path.includes("/vaccination")) return false;
  if (path.includes("/vaccination/administer")) return false;
  if (path.includes("/vaccination/queue")) return false;
  if (path.includes("/vaccination/public")) return false;

  return /Daftar Session/i.test(bodyText) && /Session Vaksinasi|Informasi Session|Vaksin Session/i.test(bodyText);
}

function findSessionTable() {
  const tables = Array.from(document.querySelectorAll("table")) as HTMLTableElement[];

  return (
    tables.find((table) => {
      const text = cleanText(table.textContent || "");
      return /SESSION/i.test(text) && /DATABASE/i.test(text) && /LOKASI/i.test(text) && /AKSI/i.test(text) && /Hapus/i.test(text);
    }) || null
  );
}

function findTableContainer(table: HTMLTableElement) {
  let node: HTMLElement | null = table;

  while (node && node.parentElement && node.parentElement !== document.body) {
    const text = cleanText(node.parentElement.textContent || "");
    if (/Daftar Session/i.test(text)) return node.parentElement;
    node = node.parentElement;
  }

  return table.parentElement || table;
}

function getDeleteControl(row: HTMLTableRowElement) {
  const controls = Array.from(row.querySelectorAll("button,a")) as HTMLElement[];
  return controls.find((control) => /^ðŸ—‘?\s*Hapus$/i.test(cleanText(control.textContent || "")) || /Hapus/i.test(cleanText(control.textContent || ""))) || null;
}

function getRowCheckbox(row: HTMLTableRowElement) {
  return row.querySelector("input[data-hha-session-select='1']") as HTMLInputElement | null;
}

function selectableRows(table: HTMLTableElement) {
  return Array.from(table.querySelectorAll("tbody tr")).filter((row) => {
    const tr = row as HTMLTableRowElement;
    return Boolean(getDeleteControl(tr));
  }) as HTMLTableRowElement[];
}

function selectedRows(table: HTMLTableElement) {
  return selectableRows(table).filter((row) => Boolean(getRowCheckbox(row)?.checked));
}

function updateToolbar(table: HTMLTableElement) {
  const container = findTableContainer(table);
  const countEl = container.querySelector("[data-hha-selected-count='1']") as HTMLElement | null;
  const bulkButton = container.querySelector("[data-hha-bulk-delete='1']") as HTMLButtonElement | null;
  const selectAll = container.querySelector("input[data-hha-select-all='1']") as HTMLInputElement | null;

  const rows = selectableRows(table);
  const selected = selectedRows(table);

  if (countEl) countEl.textContent = `${selected.length} dipilih`;
  if (bulkButton) bulkButton.disabled = selected.length === 0;

  if (selectAll) {
    selectAll.checked = rows.length > 0 && selected.length === rows.length;
    selectAll.indeterminate = selected.length > 0 && selected.length < rows.length;
  }
}

function makeButton(label: string, danger = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.style.border = "0";
  button.style.borderRadius = "14px";
  button.style.padding = "11px 16px";
  button.style.fontWeight = "900";
  button.style.cursor = "pointer";
  button.style.boxShadow = danger ? "0 10px 20px rgba(225, 29, 72, 0.12)" : "0 10px 20px rgba(37, 99, 235, 0.12)";
  button.style.color = danger ? "#be123c" : "#1d4ed8";
  button.style.background = danger ? "#fff1f2" : "#eff6ff";
  button.style.border = danger ? "1px solid #fecdd3" : "1px solid #bfdbfe";
  return button;
}

function ensureToolbar(table: HTMLTableElement) {
  const container = findTableContainer(table);
  if (container.querySelector("#hha-session-bulk-delete-toolbar")) {
    updateToolbar(table);
    return;
  }

  const toolbar = document.createElement("div");
  toolbar.id = "hha-session-bulk-delete-toolbar";
  toolbar.style.display = "flex";
  toolbar.style.alignItems = "center";
  toolbar.style.justifyContent = "space-between";
  toolbar.style.gap = "12px";
  toolbar.style.flexWrap = "wrap";
  toolbar.style.margin = "14px 0";
  toolbar.style.padding = "14px";
  toolbar.style.border = "1px solid #e2e8f0";
  toolbar.style.borderRadius = "18px";
  toolbar.style.background = "#ffffff";

  const left = document.createElement("label");
  left.style.display = "inline-flex";
  left.style.alignItems = "center";
  left.style.gap = "10px";
  left.style.fontWeight = "900";
  left.style.color = "#0f172a";

  const selectAll = document.createElement("input");
  selectAll.type = "checkbox";
  selectAll.setAttribute("data-hha-select-all", "1");
  selectAll.style.width = "18px";
  selectAll.style.height = "18px";

  const selectText = document.createElement("span");
  selectText.textContent = "Select All Session";

  left.appendChild(selectAll);
  left.appendChild(selectText);

  const right = document.createElement("div");
  right.style.display = "flex";
  right.style.alignItems = "center";
  right.style.gap = "10px";
  right.style.flexWrap = "wrap";

  const count = document.createElement("span");
  count.setAttribute("data-hha-selected-count", "1");
  count.textContent = "0 dipilih";
  count.style.fontWeight = "850";
  count.style.color = "#64748b";

  const clear = makeButton("Clear Selection");
  clear.setAttribute("data-hha-clear-selection", "1");

  const bulkDelete = makeButton("Hapus Session Terpilih", true);
  bulkDelete.setAttribute("data-hha-bulk-delete", "1");
  bulkDelete.setAttribute("disabled", "disabled");

  right.appendChild(count);
  right.appendChild(clear);
  right.appendChild(bulkDelete);

  toolbar.appendChild(left);
  toolbar.appendChild(right);

  container.insertBefore(toolbar, table);

  selectAll.addEventListener("change", () => {
    const rows = selectableRows(table);
    rows.forEach((row) => {
      const cb = getRowCheckbox(row);
      if (cb) cb.checked = selectAll.checked;
    });
    updateToolbar(table);
  });

  clear.addEventListener("click", () => {
    selectableRows(table).forEach((row) => {
      const cb = getRowCheckbox(row);
      if (cb) cb.checked = false;
    });
    updateToolbar(table);
  });

  bulkDelete.addEventListener("click", async () => {
    await bulkDeleteSelected(table, bulkDelete, count);
  });

  updateToolbar(table);
}

function ensureCheckboxColumn(table: HTMLTableElement) {
  const headerRow = table.querySelector("thead tr") as HTMLTableRowElement | null;
  if (headerRow && !headerRow.querySelector("[data-hha-select-header='1']")) {
    const th = document.createElement("th");
    th.setAttribute("data-hha-select-header", "1");
    th.textContent = "PILIH";
    th.style.width = "54px";
    th.style.textAlign = "center";
    th.style.fontSize = "11px";
    th.style.fontWeight = "950";
    th.style.color = "#475569";
    headerRow.insertBefore(th, headerRow.firstElementChild);
  }

  selectableRows(table).forEach((row) => {
    if (row.querySelector("[data-hha-select-cell='1']")) return;

    const td = document.createElement("td");
    td.setAttribute("data-hha-select-cell", "1");
    td.style.textAlign = "center";
    td.style.verticalAlign = "middle";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.setAttribute("data-hha-session-select", "1");
    checkbox.style.width = "18px";
    checkbox.style.height = "18px";
    checkbox.title = "Pilih session ini";

    checkbox.addEventListener("change", () => updateToolbar(table));

    td.appendChild(checkbox);
    row.insertBefore(td, row.firstElementChild);
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function bulkDeleteSelected(table: HTMLTableElement, button: HTMLButtonElement, countEl: HTMLElement) {
  const rows = selectedRows(table);

  if (!rows.length) {
    updateToolbar(table);
    return;
  }

  const ok = window.confirm(`Hapus ${rows.length} session terpilih?`);
  if (!ok) return;

  button.disabled = true;
  button.textContent = "Menghapus...";
  countEl.textContent = `${rows.length} session sedang dihapus`;

  const originalConfirm = window.confirm;
  let deleted = 0;

  try {
    window.confirm = () => true;

    for (const row of rows) {
      const deleteControl = getDeleteControl(row);
      if (!deleteControl) continue;

      row.style.opacity = "0.45";
      row.style.pointerEvents = "none";

      deleteControl.click();
      deleted += 1;

      await sleep(900);
    }
  } finally {
    window.confirm = originalConfirm;
  }

  button.textContent = `Selesai hapus ${deleted} session`;
  countEl.textContent = "Refresh untuk memastikan data terbaru";

  window.setTimeout(() => {
    window.location.reload();
  }, 1200);
}

function runEnhancer() {
  if (!isVaccinationSessionPage()) return;

  const table = findSessionTable();
  if (!table) return;

  ensureToolbar(table);
  ensureCheckboxColumn(table);
  updateToolbar(table);
}

export default function VaccinationSessionBulkDeleteEnhancer() {
  useEffect(() => {
    if (!isVaccinationSessionPage()) return;

    const run = () => runEnhancer();

    run();

    const observer = new MutationObserver(run);
    observer.observe(document.body, { childList: true, subtree: true });

    const interval = window.setInterval(run, 2500);

    return () => {
      observer.disconnect();
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
