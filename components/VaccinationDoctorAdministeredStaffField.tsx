"use client";

import { useEffect } from "react";

type StaffOption = { id?: number; name?: string };

const FIELD_ID = "hha-administered-doctor-staff-v125";
const WRAPPER_ID = "hha-administered-doctor-staff-wrapper-v125";
const HIDDEN_PREFIX = "hha-administered-doctor-staff-hidden-v125";
const SELECTED_STORAGE_KEY = "hha_vaccination_selected_doctor_staff_v125";

const STAFF_STORAGE_KEYS = [
  "hha_vaccination_staff_options_v122",
  "hha_vaccination_staff_options_v121",
  "hha_vaccination_staff_options_v120",
  "hha_vaccination_staff_options_v119",
  "hha_vaccination_staff_options_v118",
  "hha_vaccination_staff_options_v117",
];

const HIDDEN_INPUT_NAMES = [
  "doctorStaff",
  "doctor_staff",
  "doctorName",
  "doctor_name",
  "staffName",
  "staff_name",
  "petugasDokter",
  "petugas_dokter",
  "administeredBy",
  "administered_by",
];

function cleanText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function pageLooksLikeVaccinationAdministered() {
  if (typeof window === "undefined") return false;

  const path = window.location.pathname.toLowerCase();
  if (
    path.includes("/vaccination/administer") ||
    path.includes("/vaccination/administered") ||
    path.includes("/vaccination/medis")
  ) {
    return true;
  }

  const bodyText = cleanText(document.body?.textContent || "");
  return /Administered|Proses Tindakan|Pilih Peserta|Pilih Sesi|Riwayat Vaksin/i.test(bodyText);
}

function isStaffLikeSelect(select: HTMLSelectElement) {
  if (select.id === FIELD_ID) return true;

  const text = cleanText(select.textContent);
  const value = cleanText(select.value);
  const id = cleanText(select.id);
  const name = cleanText(select.name);
  const labelText = cleanText(select.closest("label, div, section")?.textContent || "");

  return (
    /doctor|dokter|staff|petugas|administered/i.test(`${id} ${name} ${text} ${value} ${labelText}`) ||
    /Pilih nama dokter|Nama dokter|Nama petugas|Belum ada petugas|Petugas Dokter/i.test(text)
  );
}

function collectNamesFromLocalStorage() {
  const names: string[] = [];

  try {
    for (const key of STAFF_STORAGE_KEYS) {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) continue;

      for (const item of parsed) {
        const record = item as StaffOption | string;
        const name = typeof record === "string" ? cleanText(record) : cleanText(record?.name);
        if (name) names.push(name);
      }
    }
  } catch (_error) {
    // Ignore localStorage parse errors.
  }

  return names;
}

function collectNamesFromExistingSelects() {
  const names: string[] = [];
  const selects = Array.from(document.querySelectorAll("select")) as HTMLSelectElement[];

  for (const select of selects) {
    if (!isStaffLikeSelect(select)) continue;

    const options = Array.from(select.options || []);
    for (const option of options) {
      const name = cleanText(option.value || option.textContent || "");
      if (!name) continue;
      if (/pilih|belum ada|select/i.test(name)) continue;
      names.push(name);
    }
  }

  return names;
}

async function fetchStaffNames() {
  const localNames = collectNamesFromLocalStorage();
  const domNames = collectNamesFromExistingSelects();

  try {
    const response = await fetch("/api/vaccination/staff-options", { cache: "no-store" });
    const json = await response.json().catch(() => ({}));

    if (json?.ok && Array.isArray(json.staff)) {
      const apiNames = json.staff
        .map((item: StaffOption) => cleanText(item?.name))
        .filter(Boolean);

      return Array.from(new Set([...apiNames, ...localNames, ...domNames])).sort((a, b) => a.localeCompare(b));
    }
  } catch (_error) {
    // Fallback below.
  }

  return Array.from(new Set([...localNames, ...domNames])).sort((a, b) => a.localeCompare(b));
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function findOriginalDoctorInput() {
  const inputs = Array.from(document.querySelectorAll("input, textarea")) as Array<HTMLInputElement | HTMLTextAreaElement>;

  return (
    inputs.find((input) => /doctor|dokter|staff|petugas|administered/i.test(`${input.id || ""} ${input.name || ""} ${input.placeholder || ""}`)) ||
    inputs.find((input) => /dr\.|dokter|petugas/i.test(input.value || "")) ||
    null
  );
}

function findAdministeredContainer() {
  const nodes = Array.from(document.querySelectorAll("main, section, form, article, div")) as HTMLElement[];

  const candidates = nodes
    .filter((node) => {
      const text = cleanText(node.textContent);
      if (!/Pilih Peserta|Pilih Sesi|Proses Tindakan|Administered|Medis|Vaksin/i.test(text)) return false;
      return node.querySelectorAll("select, input, button").length >= 2;
    })
    .sort((a, b) => cleanText(a.textContent).length - cleanText(b.textContent).length);

  return candidates[0] || document.querySelector("main") || document.body;
}

function findInsertionAnchor() {
  const originalInput = findOriginalDoctorInput();
  if (originalInput?.parentElement) return originalInput.parentElement as HTMLElement;

  const container = findAdministeredContainer();
  const dateInput = container.querySelector('input[type="date"], input[placeholder*="tanggal" i], input[placeholder*="date" i]') as HTMLInputElement | null;
  if (dateInput?.parentElement) return dateInput.parentElement as HTMLElement;

  const selects = Array.from(container.querySelectorAll("select")) as HTMLSelectElement[];
  const participantSelect = selects.find((select) => /peserta|participant|nama/i.test(cleanText(select.closest("label, div")?.textContent || "")));
  if (participantSelect?.parentElement) return participantSelect.parentElement as HTMLElement;

  if (selects.length > 0 && selects[selects.length - 1].parentElement) {
    return selects[selects.length - 1].parentElement as HTMLElement;
  }

  return container as HTMLElement;
}

function ensureHiddenInputs(value: string) {
  let holder = document.getElementById(`${HIDDEN_PREFIX}-holder`) as HTMLDivElement | null;

  if (!holder) {
    holder = document.createElement("div");
    holder.id = `${HIDDEN_PREFIX}-holder`;
    holder.style.display = "none";
    document.body.appendChild(holder);
  }

  for (const name of HIDDEN_INPUT_NAMES) {
    let input = document.getElementById(`${HIDDEN_PREFIX}-${name}`) as HTMLInputElement | null;
    if (!input) {
      input = document.createElement("input");
      input.type = "hidden";
      input.id = `${HIDDEN_PREFIX}-${name}`;
      input.name = name;
      holder.appendChild(input);
    }
    input.value = value;
  }
}

function syncValue(value: string) {
  try {
    window.localStorage.setItem(SELECTED_STORAGE_KEY, value);
  } catch (_error) {
    // Ignore storage errors.
  }

  const original = findOriginalDoctorInput();
  if (original && original instanceof HTMLInputElement) {
    setNativeInputValue(original, value);
  } else if (original) {
    original.value = value;
    original.dispatchEvent(new Event("input", { bubbles: true }));
    original.dispatchEvent(new Event("change", { bubbles: true }));
  }

  ensureHiddenInputs(value);
}

function hideDuplicateDoctorStaffControls(keep: HTMLSelectElement) {
  const container = findAdministeredContainer();
  const selects = Array.from(container.querySelectorAll("select")) as HTMLSelectElement[];

  for (const select of selects) {
    if (select === keep) continue;
    if (!isStaffLikeSelect(select)) continue;

    const wrapper = select.closest("[data-hha-staff-wrapper='1'], [data-hha-doctor-wrapper='1']") as HTMLElement | null;
    const parent = select.parentElement as HTMLElement | null;

    select.style.display = "none";
    select.setAttribute("aria-hidden", "true");
    select.tabIndex = -1;

    if (wrapper) {
      wrapper.style.display = "none";
    } else if (parent && parent.children.length <= 2 && !parent.id.includes("wrapper-v125")) {
      parent.style.display = "none";
    }
  }

  const original = findOriginalDoctorInput();
  if (original) {
    original.style.display = "none";
    original.setAttribute("aria-hidden", "true");
    original.tabIndex = -1;
  }
}

function currentSelectedValue(select: HTMLSelectElement | null) {
  const original = findOriginalDoctorInput();
  const stored = (() => {
    try {
      return window.localStorage.getItem(SELECTED_STORAGE_KEY) || "";
    } catch (_error) {
      return "";
    }
  })();

  return cleanText(select?.value || original?.value || stored || "");
}

async function ensureDoctorStaffField() {
  if (!pageLooksLikeVaccinationAdministered()) return;

  let wrapper = document.getElementById(WRAPPER_ID) as HTMLDivElement | null;
  let select = document.getElementById(FIELD_ID) as HTMLSelectElement | null;

  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.id = WRAPPER_ID;
    wrapper.setAttribute("data-hha-doctor-wrapper", "1");
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.gap = "8px";
    wrapper.style.width = "100%";
    wrapper.style.marginTop = "12px";
    wrapper.style.marginBottom = "12px";

    const label = document.createElement("label");
    label.htmlFor = FIELD_ID;
    label.textContent = "Petugas Dokter";
    label.style.fontWeight = "900";
    label.style.fontSize = "14px";
    label.style.color = "#0f172a";
    wrapper.appendChild(label);

    select = document.createElement("select");
    select.id = FIELD_ID;
    select.name = "petugas_dokter";
    select.setAttribute("data-hha-single-doctor-staff", "1");
    select.style.minHeight = "54px";
    select.style.border = "1px solid #e2e8f0";
    select.style.borderRadius = "18px";
    select.style.padding = "0 16px";
    select.style.fontWeight = "850";
    select.style.background = "#ffffff";
    select.style.width = "100%";
    wrapper.appendChild(select);

    const anchor = findInsertionAnchor();
    if (anchor.parentElement && anchor !== document.body) {
      anchor.parentElement.insertBefore(wrapper, anchor.nextSibling);
    } else {
      findAdministeredContainer().appendChild(wrapper);
    }
  }

  if (!select) {
    select = document.getElementById(FIELD_ID) as HTMLSelectElement | null;
  }

  if (!select) return;

  const names = await fetchStaffNames();
  const selected = currentSelectedValue(select);

  select.innerHTML = "";

  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = names.length ? "Pilih Petugas Dokter" : "Belum ada data petugas dokter";
  select.appendChild(empty);

  for (const name of names) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  }

  if (selected) {
    if (!names.includes(selected)) {
      const option = document.createElement("option");
      option.value = selected;
      option.textContent = selected;
      select.appendChild(option);
    }
    select.value = selected;
  }

  select.onchange = () => syncValue(select?.value || "");
  syncValue(select.value || selected || "");
  hideDuplicateDoctorStaffControls(select);
}

export default function VaccinationDoctorAdministeredStaffField() {
  useEffect(() => {
    if (!pageLooksLikeVaccinationAdministered()) return;

    let cancelled = false;
    const run = () => {
      if (!cancelled) void ensureDoctorStaffField();
    };

    const delays = [100, 300, 700, 1200, 2200, 4000, 7000];
    const timers = delays.map((delay) => window.setTimeout(run, delay));
    const interval = window.setInterval(run, 2500);

    const observer = new MutationObserver(() => {
      window.setTimeout(run, 80);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener("change", run, true);

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      window.clearInterval(interval);
      observer.disconnect();
      document.removeEventListener("change", run, true);
    };
  }, []);

  return null;
}
