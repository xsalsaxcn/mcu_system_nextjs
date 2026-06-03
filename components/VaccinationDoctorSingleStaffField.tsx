"use client";

import { useEffect } from "react";

type StaffOption = { id?: number; name: string };

const STAFF_STORAGE_KEY = "hha_vaccination_staff_options_v122";

function cleanText(value: any) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isAdministerPage() {
  return typeof window !== "undefined" && window.location.pathname.includes("/vaccination/administer");
}

function isStaffLikeSelect(select: HTMLSelectElement) {
  const text = cleanText(select.textContent);
  const value = cleanText(select.value);
  const id = cleanText(select.id);

  return (
    id.includes("doctor-staff") ||
    /Pilih nama dokter|Nama dokter|Nama petugas|Belum ada petugas/i.test(text) ||
    /^dr\.|dokter|petugas/i.test(value) ||
    /dr\./i.test(text)
  );
}

function findParticipantSection() {
  const nodes = Array.from(document.querySelectorAll("section, form, div")) as HTMLElement[];

  return (
    nodes
      .filter((node) => {
        const text = cleanText(node.textContent);
        const selects = node.querySelectorAll("select").length;
        return /Pilih Peserta/i.test(text) && /Proses Tindakan|Vaksin|Administered|Medis/i.test(cleanText(document.body.textContent)) && selects >= 2;
      })
      .sort((a, b) => cleanText(a.textContent).length - cleanText(b.textContent).length)[0] || null
  );
}

function readStaffNames() {
  try {
    const keys = [
      STAFF_STORAGE_KEY,
      "hha_vaccination_staff_options_v118",
      "hha_vaccination_staff_options_v117",
    ];

    const names: string[] = [];

    for (const key of keys) {
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
  const local = readStaffNames();

  try {
    const res = await fetch("/api/vaccination/staff-options", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));

    if (json?.ok && Array.isArray(json.staff)) {
      const apiNames = json.staff.map((item: StaffOption) => cleanText(item?.name)).filter(Boolean);
      return Array.from(new Set([...apiNames, ...local])).sort((a, b) => a.localeCompare(b));
    }

    return local;
  } catch (_error) {
    return local;
  }
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function findOriginalDoctorInput() {
  const inputs = Array.from(document.querySelectorAll("input")) as HTMLInputElement[];

  return (
    inputs.find((input) => /Nama dokter|Nama petugas|dokter|petugas/i.test(input.placeholder || "")) ||
    inputs.find((input) => /dr\.|dokter|petugas/i.test(input.value || "")) ||
    null
  );
}

function hideExtraStaffControls(keep: HTMLSelectElement | null) {
  const section = findParticipantSection() || document.body;
  const selects = Array.from(section.querySelectorAll("select")) as HTMLSelectElement[];

  for (const select of selects) {
    if (!isStaffLikeSelect(select)) continue;
    if (keep && select === keep) continue;

    const parent = select.parentElement as HTMLElement | null;
    const wrapper = select.closest("[data-hha-staff-wrapper='1']") as HTMLElement | null;

    select.style.display = "none";
    select.setAttribute("aria-hidden", "true");
    select.tabIndex = -1;

    if (wrapper) {
      wrapper.style.display = "none";
    } else if (parent && parent.children.length === 1) {
      parent.style.display = "none";
    }
  }

  const inputs = Array.from(section.querySelectorAll("input")) as HTMLInputElement[];
  for (const input of inputs) {
    if (!/Nama dokter|Nama petugas|dokter|petugas/i.test(input.placeholder || "")) continue;

    input.style.display = "none";
    input.setAttribute("aria-hidden", "true");
    input.tabIndex = -1;
  }
}

function findMainDoctorSlot() {
  const section = findParticipantSection() || document.body;
  const selects = Array.from(section.querySelectorAll("select")) as HTMLSelectElement[];

  // Usually the visible layout is: session, participant, date input, doctor field.
  // Keep the staff-like select closest to the first row/right side if it exists.
  const staffSelects = selects.filter(isStaffLikeSelect);
  if (staffSelects.length) return staffSelects[0].parentElement || staffSelects[0];

  const input = findOriginalDoctorInput();
  return input?.parentElement || input;
}

async function ensureSingleDoctorDropdown() {
  if (!isAdministerPage()) return;

  let select = document.getElementById("hha-single-doctor-staff-v124") as HTMLSelectElement | null;

  const originalInput = findOriginalDoctorInput();
  const names = await fetchStaffNames();

  if (!select) {
    select = document.createElement("select");
    select.id = "hha-single-doctor-staff-v124";
    select.setAttribute("data-hha-single-doctor-staff", "1");
    select.style.minHeight = "54px";
    select.style.border = "1px solid #e2e8f0";
    select.style.borderRadius = "18px";
    select.style.padding = "0 16px";
    select.style.fontWeight = "850";
    select.style.background = "#ffffff";
    select.style.width = "100%";

    const slot = findMainDoctorSlot();

    if (originalInput?.parentElement) {
      originalInput.parentElement.insertBefore(select, originalInput.nextSibling);
    } else if (slot?.parentElement) {
      slot.parentElement.insertBefore(select, slot.nextSibling);
    } else {
      const section = findParticipantSection() || document.body;
      section.appendChild(select);
    }
  }

  const current = select.value || cleanText(originalInput?.value || "");

  select.innerHTML = "";

  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = names.length ? "Pilih nama dokter / petugas" : "Belum ada petugas";
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
    if (input) setNativeInputValue(input, select!.value);
  };

  if (originalInput) {
    originalInput.style.display = "none";
    originalInput.setAttribute("aria-hidden", "true");
    originalInput.tabIndex = -1;
  }

  hideExtraStaffControls(select);
}

export default function VaccinationDoctorSingleStaffField() {
  useEffect(() => {
    if (!isAdministerPage()) return;

    let cancelled = false;
    const delays = [100, 400, 900, 1800, 3200, 5000];

    const timers = delays.map((delay) =>
      window.setTimeout(() => {
        if (!cancelled) ensureSingleDoctorDropdown();
      }, delay)
    );

    const onChange = () => {
      window.setTimeout(() => {
        if (!cancelled) ensureSingleDoctorDropdown();
      }, 100);
    };

    document.addEventListener("change", onChange, true);

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      document.removeEventListener("change", onChange, true);
    };
  }, []);

  return null;
}
