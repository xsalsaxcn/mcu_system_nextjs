"use client";

import { useEffect } from "react";

type StaffOption = { id?: number; name: string };

const STAFF_STORAGE_KEY = "hha_vaccination_staff_options_v122";

function cleanText(value: any) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function pageText() {
  return cleanText(document.body?.textContent || "");
}

function isVaccinationPath() {
  return typeof window !== "undefined" && window.location.pathname.includes("/vaccination");
}

function isSessionPage() {
  if (!isVaccinationPath()) return false;
  const path = window.location.pathname;
  if (path.includes("/queue") || path.includes("/administer") || path.includes("/public")) return false;
  const text = pageText();
  return /Session Vaksinasi/i.test(text) && /Informasi Session/i.test(text);
}

function isAdministerPage() {
  return typeof window !== "undefined" && window.location.pathname.includes("/vaccination/administer");
}

function uniqStaff(items: StaffOption[]) {
  const seen = new Set<string>();
  const result: StaffOption[] = [];

  for (const item of items || []) {
    const name = cleanText(item?.name);
    if (!name) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push({ ...item, name });
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

function readLocalStaff() {
  try {
    const keys = [
      STAFF_STORAGE_KEY,
      "hha_vaccination_staff_options_v118",
      "hha_vaccination_staff_options_v117",
    ];

    const combined: StaffOption[] = [];
    for (const key of keys) {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) combined.push(...parsed);
    }

    return uniqStaff(combined);
  } catch (_error) {
    return [];
  }
}

function writeLocalStaff(items: StaffOption[]) {
  try {
    const clean = uniqStaff(items);
    window.localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(clean));
    window.localStorage.setItem("hha_vaccination_staff_options_v118", JSON.stringify(clean));
    window.localStorage.setItem("hha_vaccination_staff_options_v117", JSON.stringify(clean));
  } catch (_error) {
    // ignore localStorage failure
  }
}

async function fetchStaffOptions() {
  const local = readLocalStaff();

  try {
    const res = await fetch("/api/vaccination/staff-options", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));

    if (json?.ok) {
      const merged = uniqStaff([...(json.staff || []), ...local]);
      writeLocalStaff(merged);
      return { staff: merged, message: json.message || "", needsSetup: Boolean(json.needs_setup) };
    }

    return { staff: local, message: json?.message || "", needsSetup: Boolean(json?.needs_setup) };
  } catch (_error) {
    return { staff: local, message: "", needsSetup: false };
  }
}

async function addStaffOption(name: string) {
  const cleaned = cleanText(name);
  const local = uniqStaff([...readLocalStaff(), { name: cleaned }]);

  if (!cleaned) {
    return { ok: false, staff: local, message: "Nama petugas wajib diisi." };
  }

  writeLocalStaff(local);

  try {
    const res = await fetch("/api/vaccination/staff-options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ name: cleaned }),
    });

    const json = await res.json().catch(() => ({}));

    if (res.ok && json?.ok) {
      const fresh = await fetchStaffOptions();
      return { ok: true, staff: fresh.staff, message: "Nama petugas ditambahkan." };
    }

    return {
      ok: true,
      staff: local,
      message: json?.message ? `${json.message} Nama tetap tersimpan lokal.` : "Nama tersimpan lokal.",
    };
  } catch (_error) {
    return { ok: true, staff: local, message: "Nama tersimpan lokal." };
  }
}

function makeInput() {
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Nama petugas / dokter, contoh: dr. Simon";
  input.style.minHeight = "54px";
  input.style.border = "1px solid #e2e8f0";
  input.style.borderRadius = "18px";
  input.style.padding = "0 16px";
  input.style.fontWeight = "800";
  input.style.width = "100%";
  input.style.background = "#fff";
  return input;
}

function makeButton(label: string, danger = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.style.borderRadius = "16px";
  button.style.padding = "13px 18px";
  button.style.fontWeight = "900";
  button.style.cursor = "pointer";
  button.style.whiteSpace = "nowrap";
  button.style.border = danger ? "1px solid #fecdd3" : "0";
  button.style.color = danger ? "#be123c" : "#ffffff";
  button.style.background = danger ? "#fff1f2" : "linear-gradient(135deg, #2563eb, #1d4ed8)";
  button.style.boxShadow = danger ? "0 10px 18px rgba(225, 29, 72, 0.12)" : "0 10px 22px rgba(37, 99, 235, 0.16)";
  return button;
}

function renderStaffChips(host: HTMLElement, staff: StaffOption[]) {
  const list = host.querySelector("[data-hha-staff-list='1']") as HTMLElement | null;
  if (!list) return;

  list.innerHTML = "";

  if (!staff.length) {
    const empty = document.createElement("span");
    empty.textContent = "Belum ada nama petugas.";
    empty.style.fontSize = "13px";
    empty.style.fontWeight = "700";
    empty.style.color = "#64748b";
    list.appendChild(empty);
    return;
  }

  for (const item of staff) {
    const chip = document.createElement("span");
    chip.textContent = item.name;
    chip.style.display = "inline-flex";
    chip.style.padding = "8px 12px";
    chip.style.borderRadius = "999px";
    chip.style.background = "#eff6ff";
    chip.style.color = "#1d4ed8";
    chip.style.fontWeight = "900";
    chip.style.fontSize = "13px";
    list.appendChild(chip);
  }
}

function smallestMatchingContainer(predicate: (el: HTMLElement) => boolean) {
  const nodes = Array.from(document.querySelectorAll("section,form,div")) as HTMLElement[];
  return nodes.filter(predicate).sort((a, b) => cleanText(a.textContent).length - cleanText(b.textContent).length)[0] || null;
}

function findInfoSessionContainer() {
  return smallestMatchingContainer((el) => {
    const text = cleanText(el.textContent);
    const controls = el.querySelectorAll("input,select,textarea").length;
    return /Informasi Session/i.test(text) && /Nama session|Nama perusahaan|Lokasi|Jam \/ slot/i.test(text) && controls >= 3;
  });
}

async function ensureStaffField() {
  if (!isSessionPage()) return;
  if (document.getElementById("hha-session-staff-inline-v122")) return;

  const container = findInfoSessionContainer();
  if (!container) return;

  const box = document.createElement("div");
  box.id = "hha-session-staff-inline-v122";
  box.style.gridColumn = "1 / -1";
  box.style.marginTop = "14px";
  box.style.padding = "16px";
  box.style.border = "1px solid #e2e8f0";
  box.style.borderRadius = "22px";
  box.style.background = "#ffffff";

  const label = document.createElement("div");
  label.textContent = "Nama Petugas";
  label.style.fontSize = "15px";
  label.style.fontWeight = "950";
  label.style.marginBottom = "8px";

  const row = document.createElement("div");
  row.style.display = "grid";
  row.style.gridTemplateColumns = "minmax(220px, 1fr) auto";
  row.style.gap = "10px";
  row.style.alignItems = "center";

  const input = makeInput();
  const add = makeButton("+ Add More");

  const message = document.createElement("div");
  message.style.marginTop = "8px";
  message.style.fontSize = "12px";
  message.style.fontWeight = "800";
  message.style.color = "#64748b";

  const list = document.createElement("div");
  list.setAttribute("data-hha-staff-list", "1");
  list.style.display = "flex";
  list.style.flexWrap = "wrap";
  list.style.gap = "8px";
  list.style.marginTop = "10px";

  row.appendChild(input);
  row.appendChild(add);
  box.appendChild(label);
  box.appendChild(row);
  box.appendChild(message);
  box.appendChild(list);

  container.appendChild(box);

  const loaded = await fetchStaffOptions();
  renderStaffChips(box, loaded.staff);
  if (loaded.needsSetup && loaded.message) {
    message.textContent = loaded.message;
    message.style.color = "#b45309";
  }

  async function submit() {
    add.textContent = "Menyimpan...";
    add.setAttribute("disabled", "disabled");

    const result = await addStaffOption(input.value);

    input.value = "";
    renderStaffChips(box, result.staff);
    message.textContent = result.message;
    message.style.color = result.ok ? "#047857" : "#dc2626";

    add.textContent = "+ Add More";
    add.removeAttribute("disabled");

    await refreshDoctorDropdown();
  }

  add.addEventListener("click", submit);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  });
}

function findDoctorInput() {
  const inputs = Array.from(document.querySelectorAll("input")) as HTMLInputElement[];

  return (
    inputs.find((input) => /Nama dokter|Nama petugas|dokter|petugas/i.test(input.placeholder || "")) ||
    inputs.find((input) => /dr\.|dokter|petugas/i.test(input.value || "")) ||
    null
  );
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function refreshDoctorDropdown() {
  const select = document.getElementById("hha-doctor-staff-dropdown-v122") as HTMLSelectElement | null;
  if (!select) return;

  const current = select.value;
  const { staff } = await fetchStaffOptions();

  select.innerHTML = "";

  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = staff.length ? "Pilih nama dokter / petugas" : "Belum ada petugas";
  select.appendChild(empty);

  for (const item of staff) {
    const option = document.createElement("option");
    option.value = item.name;
    option.textContent = item.name;
    select.appendChild(option);
  }

  if (current && staff.some((item) => item.name === current)) select.value = current;
}

async function ensureDoctorDropdown() {
  if (!isAdministerPage()) return;
  if (document.getElementById("hha-doctor-staff-dropdown-v122")) return;

  const input = findDoctorInput();
  if (!input) return;

  const { staff } = await fetchStaffOptions();

  const select = document.createElement("select");
  select.id = "hha-doctor-staff-dropdown-v122";
  select.style.minHeight = "54px";
  select.style.border = "1px solid #e2e8f0";
  select.style.borderRadius = "18px";
  select.style.padding = "0 16px";
  select.style.fontWeight = "850";
  select.style.background = "#fff";
  select.style.width = "100%";

  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = staff.length ? "Pilih nama dokter / petugas" : "Belum ada petugas";
  select.appendChild(empty);

  for (const item of staff) {
    const option = document.createElement("option");
    option.value = item.name;
    option.textContent = item.name;
    select.appendChild(option);
  }

  if (input.value) {
    const existing = document.createElement("option");
    existing.value = input.value;
    existing.textContent = input.value;
    select.appendChild(existing);
    select.value = input.value;
  }

  select.addEventListener("change", () => {
    setNativeInputValue(input, select.value);
  });

  input.style.display = "none";
  input.parentElement?.insertBefore(select, input.nextSibling);
}

function findSessionTable() {
  const tables = Array.from(document.querySelectorAll("table")) as HTMLTableElement[];

  return (
    tables.find((table) => {
      const text = cleanText(table.textContent);
      return /SESSION/i.test(text) && /DATABASE/i.test(text) && /LOKASI/i.test(text) && /AKSI/i.test(text) && /Hapus/i.test(text);
    }) || null
  );
}

function getDeleteControl(row: HTMLTableRowElement) {
  const controls = Array.from(row.querySelectorAll("button,a")) as HTMLElement[];
  return controls.find((control) => /Hapus/i.test(cleanText(control.textContent))) || null;
}

function selectableRows(table: HTMLTableElement) {
  return (Array.from(table.querySelectorAll("tbody tr")) as HTMLTableRowElement[]).filter((row) => Boolean(getDeleteControl(row)));
}

function selectedRows(table: HTMLTableElement) {
  return selectableRows(table).filter((row) => Boolean((row.querySelector("input[data-hha-session-select-v122='1']") as HTMLInputElement | null)?.checked));
}

function findTableContainer(table: HTMLTableElement) {
  let node: HTMLElement | null = table;
  while (node?.parentElement && node.parentElement !== document.body) {
    if (/Daftar Session/i.test(cleanText(node.parentElement.textContent))) return node.parentElement;
    node = node.parentElement;
  }
  return table.parentElement || table;
}

function updateBulkToolbar(table: HTMLTableElement) {
  const container = findTableContainer(table);
  const count = container.querySelector("[data-hha-session-count-v122='1']") as HTMLElement | null;
  const bulk = container.querySelector("[data-hha-bulk-delete-v122='1']") as HTMLButtonElement | null;
  const all = container.querySelector("input[data-hha-select-all-v122='1']") as HTMLInputElement | null;

  const rows = selectableRows(table);
  const selected = selectedRows(table);

  if (count) count.textContent = `${selected.length} dipilih`;
  if (bulk) bulk.disabled = selected.length === 0;

  if (all) {
    all.checked = rows.length > 0 && selected.length === rows.length;
    all.indeterminate = selected.length > 0 && selected.length < rows.length;
  }
}

function ensureCheckboxColumn(table: HTMLTableElement) {
  const headerRow = table.querySelector("thead tr") as HTMLTableRowElement | null;
  if (headerRow && !headerRow.querySelector("[data-hha-select-header-v122='1']")) {
    const th = document.createElement("th");
    th.setAttribute("data-hha-select-header-v122", "1");
    th.textContent = "PILIH";
    th.style.width = "54px";
    th.style.textAlign = "center";
    th.style.fontSize = "11px";
    th.style.fontWeight = "950";
    headerRow.insertBefore(th, headerRow.firstElementChild);
  }

  for (const row of selectableRows(table)) {
    if (row.querySelector("[data-hha-select-cell-v122='1']")) continue;

    const td = document.createElement("td");
    td.setAttribute("data-hha-select-cell-v122", "1");
    td.style.textAlign = "center";
    td.style.verticalAlign = "middle";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.setAttribute("data-hha-session-select-v122", "1");
    checkbox.style.width = "18px";
    checkbox.style.height = "18px";
    checkbox.addEventListener("change", () => updateBulkToolbar(table));

    td.appendChild(checkbox);
    row.insertBefore(td, row.firstElementChild);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function bulkDelete(table: HTMLTableElement, button: HTMLButtonElement, count: HTMLElement) {
  const rows = selectedRows(table);
  if (!rows.length) return;

  if (!window.confirm(`Hapus ${rows.length} session terpilih?`)) return;

  button.disabled = true;
  button.textContent = "Menghapus...";
  count.textContent = `${rows.length} sedang dihapus`;

  const originalConfirm = window.confirm;
  let deleted = 0;

  try {
    window.confirm = () => true;

    for (const row of rows) {
      const del = getDeleteControl(row);
      if (!del) continue;

      row.style.opacity = "0.45";
      row.style.pointerEvents = "none";
      del.click();
      deleted += 1;
      await sleep(850);
    }
  } finally {
    window.confirm = originalConfirm;
  }

  button.textContent = `Selesai hapus ${deleted}`;
  count.textContent = "Refresh data...";
  window.setTimeout(() => window.location.reload(), 1200);
}

function ensureBulkToolbar(table: HTMLTableElement) {
  const container = findTableContainer(table);
  if (container.querySelector("#hha-session-bulk-toolbar-v122")) {
    updateBulkToolbar(table);
    return;
  }

  const toolbar = document.createElement("div");
  toolbar.id = "hha-session-bulk-toolbar-v122";
  toolbar.style.display = "flex";
  toolbar.style.alignItems = "center";
  toolbar.style.justifyContent = "space-between";
  toolbar.style.gap = "12px";
  toolbar.style.flexWrap = "wrap";
  toolbar.style.margin = "14px 0";
  toolbar.style.padding = "14px";
  toolbar.style.border = "1px solid #e2e8f0";
  toolbar.style.borderRadius = "18px";
  toolbar.style.background = "#fff";

  const left = document.createElement("label");
  left.style.display = "inline-flex";
  left.style.alignItems = "center";
  left.style.gap = "10px";
  left.style.fontWeight = "900";

  const all = document.createElement("input");
  all.type = "checkbox";
  all.setAttribute("data-hha-select-all-v122", "1");
  all.style.width = "18px";
  all.style.height = "18px";

  const allText = document.createElement("span");
  allText.textContent = "Select All Session";

  left.appendChild(all);
  left.appendChild(allText);

  const right = document.createElement("div");
  right.style.display = "flex";
  right.style.alignItems = "center";
  right.style.gap = "10px";
  right.style.flexWrap = "wrap";

  const count = document.createElement("span");
  count.setAttribute("data-hha-session-count-v122", "1");
  count.textContent = "0 dipilih";
  count.style.fontWeight = "850";
  count.style.color = "#64748b";

  const clear = makeButton("Clear Selection");
  const bulk = makeButton("Hapus Session Terpilih", true);
  bulk.setAttribute("data-hha-bulk-delete-v122", "1");
  bulk.disabled = true;

  right.appendChild(count);
  right.appendChild(clear);
  right.appendChild(bulk);

  toolbar.appendChild(left);
  toolbar.appendChild(right);

  container.insertBefore(toolbar, table);

  all.addEventListener("change", () => {
    for (const row of selectableRows(table)) {
      const checkbox = row.querySelector("input[data-hha-session-select-v122='1']") as HTMLInputElement | null;
      if (checkbox) checkbox.checked = all.checked;
    }
    updateBulkToolbar(table);
  });

  clear.addEventListener("click", () => {
    for (const row of selectableRows(table)) {
      const checkbox = row.querySelector("input[data-hha-session-select-v122='1']") as HTMLInputElement | null;
      if (checkbox) checkbox.checked = false;
    }
    updateBulkToolbar(table);
  });

  bulk.addEventListener("click", () => bulkDelete(table, bulk, count));
  updateBulkToolbar(table);
}

function ensureBulkDelete() {
  if (!isSessionPage()) return;

  const table = findSessionTable();
  if (!table) return;

  ensureCheckboxColumn(table);
  ensureBulkToolbar(table);
  updateBulkToolbar(table);
}

function runLightFeatures() {
  ensureStaffField();
  ensureDoctorDropdown();
  ensureBulkDelete();
}

export default function VaccinationSessionLightFeatures() {
  useEffect(() => {
    if (!isVaccinationPath()) return;

    let cancelled = false;
    let attempts = 0;
    const timers: number[] = [];

    const schedule = (delay: number) => {
      const timer = window.setTimeout(() => {
        if (cancelled) return;
        attempts += 1;
        runLightFeatures();

        if (attempts < 8) schedule(attempts < 3 ? 500 : 1500);
      }, delay);
      timers.push(timer);
    };

    schedule(300);

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  return null;
}
