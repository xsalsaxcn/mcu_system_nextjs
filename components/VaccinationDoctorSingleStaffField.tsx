"use client";

import { useEffect } from "react";

type StaffOption = { id?: number; name: string };

const STAFF_STORAGE_KEYS = [
  "hha_vaccination_staff_options_v122",
  "hha_vaccination_staff_options_v118",
  "hha_vaccination_staff_options_v117",
];

function cleanText(value: any) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isAdministerPage() {
  if (typeof window === "undefined") return false;
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  return pathname === "/vaccination/administer";
}

function readLocalStaffNames() {
  try {
    const names: string[] = [];

    for (const key of STAFF_STORAGE_KEYS) {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;

      for (const item of parsed) {
        const name = cleanText(item?.name || item);
        if (name) names.push(name);
      }
    }

    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  } catch (_error) {
    return [];
  }
}

async function fetchStaffNames() {
  const local = readLocalStaffNames();

  try {
    const res = await fetch("/api/vaccination/staff-options", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));

    if (json?.ok && Array.isArray(json.staff)) {
      const apiNames = json.staff
        .map((item: StaffOption) => cleanText(item?.name))
        .filter(Boolean);

      return Array.from(new Set([...apiNames, ...local])).sort((a, b) => a.localeCompare(b));
    }

    return local;
  } catch (_error) {
    return local;
  }
}

function findParticipantSection() {
  if (!isAdministerPage()) return null;

  const explicit = document.getElementById("vaccination-administer-participant-section") as HTMLElement | null;
  if (explicit) return explicit;

  const nodes = Array.from(document.querySelectorAll("section, form, div")) as HTMLElement[];

  return (
    nodes
      .filter((node) => {
        const text = cleanText(node.textContent);
        const controls = node.querySelectorAll("select,input,textarea").length;
        return /Pilih Peserta/i.test(text) && /Vaksin yang Diberikan|Proses Tindakan|Administered|Medis/i.test(cleanText(document.body.textContent)) && controls >= 3;
      })
      .sort((a, b) => cleanText(a.textContent).length - cleanText(b.textContent).length)[0] || null
  );
}

function findOriginalDoctorInput() {
  if (!isAdministerPage()) return null;

  const explicit = document.getElementById("vaccination-administer-doctor-input") as HTMLInputElement | null;
  if (explicit) return explicit;

  const section = findParticipantSection();
  if (!section) return null;
  const inputs = Array.from(section.querySelectorAll("input")) as HTMLInputElement[];

  return inputs.find((input) => /Nama dokter|Nama petugas|dokter|petugas/i.test(input.placeholder || "")) || null;
}

function findTopControlRow() {
  if (!isAdministerPage()) return null;

  const explicit = document.getElementById("vaccination-administer-top-controls") as HTMLElement | null;
  if (explicit) return explicit;

  const section = findParticipantSection();
  if (!section) return null;

  const candidates = Array.from(section.querySelectorAll("div")) as HTMLElement[];

  return (
    candidates
      .filter((node) => {
        const directControlChildren = Array.from(node.children).filter((child) => {
          if (!(child instanceof HTMLElement)) return false;
          return Boolean(child.querySelector("select,input")) || ["SELECT", "INPUT"].includes(child.tagName);
        }).length;

        const text = cleanText(node.textContent);
        return directControlChildren >= 3 && /HEALTHDAY|Pilih peserta|A-\d+|Proses Tindakan/i.test(text);
      })
      .sort((a, b) => cleanText(a.textContent).length - cleanText(b.textContent).length)[0] || null
  );
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function isStaffSelect(select: HTMLSelectElement) {
  const id = cleanText(select.id);
  const role = cleanText(select.getAttribute("data-vaccination-role"));
  const firstOptionText = cleanText(select.options[0]?.textContent);

  // Participant names may legitimately contain titles such as "dr.".
  // Never classify the participant selector as a doctor/staff selector.
  if (id === "vaccination-administer-participant" || role === "participant") return false;

  return (
    id.includes("doctor-staff") ||
    id.includes("single-doctor") ||
    role === "doctor" ||
    /Pilih nama dokter|Nama dokter|Nama petugas|Belum ada petugas/i.test(firstOptionText)
  );
}

function restoreHiddenParents(element: HTMLElement | null) {
  let node: HTMLElement | null = element;
  const section = findParticipantSection();

  while (node && node !== document.body && node !== section) {
    if (node.style.display === "none") node.style.display = "";
    if (node.getAttribute("aria-hidden") === "true") node.removeAttribute("aria-hidden");
    node = node.parentElement;
  }
}

function hideDuplicateStaffControls(keep: HTMLSelectElement) {
  if (!isAdministerPage()) return;

  const section = findParticipantSection();
  if (!section) return;

  const selects = Array.from(section.querySelectorAll("select")) as HTMLSelectElement[];
  for (const select of selects) {
    if (select === keep) continue;
    if (!isStaffSelect(select)) continue;

    select.style.display = "none";
    select.setAttribute("aria-hidden", "true");
    select.tabIndex = -1;
  }

  const inputs = Array.from(section.querySelectorAll("input")) as HTMLInputElement[];
  for (const input of inputs) {
    const role = cleanText(input.getAttribute("data-vaccination-role"));
    const isDoctorInput =
      input.id === "vaccination-administer-doctor-input" ||
      role === "doctor" ||
      /Nama dokter|Nama petugas|dokter|petugas/i.test(input.placeholder || "");

    if (!isDoctorInput) continue;

    input.style.display = "none";
    input.setAttribute("aria-hidden", "true");
    input.tabIndex = -1;
  }
}

function makeFieldWrapper() {
  const wrapper = document.createElement("div");
  wrapper.id = "hha-doctor-staff-field-wrapper-v125";
  wrapper.setAttribute("data-hha-doctor-staff-wrapper", "1");
  wrapper.style.display = "block";
  wrapper.style.minWidth = "220px";
  wrapper.style.width = "100%";

  return wrapper;
}

function styleSelect(select: HTMLSelectElement) {
  select.style.minHeight = "54px";
  select.style.border = "1px solid #e2e8f0";
  select.style.borderRadius = "18px";
  select.style.padding = "0 16px";
  select.style.fontWeight = "850";
  select.style.background = "#ffffff";
  select.style.width = "100%";
  select.style.boxShadow = "0 6px 18px rgba(15, 23, 42, 0.04)";
  select.style.display = "block";
}

async function ensureSingleDoctorField() {
  if (!isAdministerPage()) return;

  const names = await fetchStaffNames();
  const originalInput = findOriginalDoctorInput();

  if (originalInput) restoreHiddenParents(originalInput.parentElement);

  let select = document.getElementById("hha-single-doctor-staff-v125") as HTMLSelectElement | null;

  if (!select) {
    select = document.createElement("select");
    select.id = "hha-single-doctor-staff-v125";
    select.setAttribute("data-hha-single-doctor-staff", "1");
    select.setAttribute("data-vaccination-role", "doctor");
    styleSelect(select);

    if (originalInput?.parentElement) {
      originalInput.parentElement.style.display = "";
      originalInput.parentElement.appendChild(select);
    } else {
      const row = findTopControlRow();
      const wrapper = makeFieldWrapper();
      wrapper.appendChild(select);

      if (row) {
        row.appendChild(wrapper);
      } else {
        const section = findParticipantSection();
        if (!section) return;
        section.insertBefore(wrapper, section.firstChild);
      }
    }
  }

  styleSelect(select);

  const current = select.value || cleanText(originalInput?.value || "");

  select.innerHTML = "";

  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = names.length ? "Pilih nama dokter / petugas" : "Nama dokter / petugas belum diisi";
  select.appendChild(empty);

  for (const name of names) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  }

  if (current) {
    if (!names.includes(current)) {
      const option = document.createElement("option");
      option.value = current;
      option.textContent = current;
      select.appendChild(option);
    }
    select.value = current;
  }

  select.onchange = () => {
    const input = findOriginalDoctorInput();
    if (input) {
      restoreHiddenParents(input.parentElement);
      setNativeInputValue(input, select!.value);
      input.style.display = "none";
    }
  };

  if (originalInput) {
    setNativeInputValue(originalInput, select.value || cleanText(originalInput.value));
    originalInput.style.display = "none";
    originalInput.setAttribute("aria-hidden", "true");
    originalInput.tabIndex = -1;
  }

  hideDuplicateStaffControls(select);
}

export default function VaccinationDoctorSingleStaffField() {
  useEffect(() => {
    if (!isAdministerPage()) return;

    let cancelled = false;
    const delays = [80, 250, 600, 1200, 2200, 3500, 5500];

    const run = () => {
      if (!cancelled) ensureSingleDoctorField();
    };

    const timers = delays.map((delay) => window.setTimeout(run, delay));

    const onChange = () => window.setTimeout(run, 120);
    const onFocus = () => run();

    document.addEventListener("change", onChange, true);
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      document.removeEventListener("change", onChange, true);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return null;
}
