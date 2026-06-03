"use client";

import { useEffect } from "react";

type StaffOption = {
  id?: number;
  name: string;
};

const STORAGE_KEY = "hha_vaccination_staff_options_v117";

function isVaccinationPage() {
  if (typeof window === "undefined") return false;
  return window.location.pathname.includes("/vaccination");
}

function isAdministerPage() {
  if (typeof window === "undefined") return false;
  return window.location.pathname.includes("/vaccination/administer");
}

function cleanText(value: any) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function textOf(el: Element | null) {
  return cleanText(el?.textContent || "");
}

function uniqStaff(items: StaffOption[]) {
  const seen = new Set<string>();
  const result: StaffOption[] = [];

  for (const item of items) {
    const name = cleanText(item?.name);
    if (!name) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push({ ...item, name });
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

function readLocalStaff(): StaffOption[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return uniqStaff(parsed);
  } catch (_error) {
    return [];
  }
}

function writeLocalStaff(items: StaffOption[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(uniqStaff(items)));
  } catch (_error) {
    // ignore localStorage failure
  }
}

async function fetchStaffOptions(): Promise<{ staff: StaffOption[]; needsSetup?: boolean; message?: string }> {
  const local = readLocalStaff();

  try {
    const res = await fetch("/api/vaccination/staff-options", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));

    if (json?.ok) {
      const merged = uniqStaff([...(json.staff || []), ...local]);
      writeLocalStaff(merged);
      return { staff: merged, needsSetup: Boolean(json.needs_setup), message: json.message };
    }

    return { staff: local, needsSetup: Boolean(json?.needs_setup), message: json?.message };
  } catch (_error) {
    return { staff: local };
  }
}

async function addStaffOption(name: string): Promise<{ ok: boolean; message?: string; staff: StaffOption[] }> {
  const cleanName = cleanText(name);
  if (!cleanName) return { ok: false, message: "Nama petugas wajib diisi.", staff: readLocalStaff() };

  const local = uniqStaff([...readLocalStaff(), { name: cleanName }]);
  writeLocalStaff(local);

  try {
    const res = await fetch("/api/vaccination/staff-options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ name: cleanName }),
    });

    const json = await res.json().catch(() => ({}));

    if (res.ok && json?.ok) {
      const fresh = await fetchStaffOptions();
      return { ok: true, staff: fresh.staff };
    }

    return {
      ok: true,
      message: json?.message ? `${json.message} Nama tetap disimpan lokal di browser ini.` : "Nama disimpan lokal di browser ini.",
      staff: local,
    };
  } catch (_error) {
    return { ok: true, message: "Nama disimpan lokal di browser ini.", staff: local };
  }
}

function isSessionSetupPage() {
  if (!isVaccinationPage() || isAdministerPage()) return false;
  const text = textOf(document.body);
  return /Informasi Session|Nama session|Pilih database corporate\/vaksinasi|Setup Session/i.test(text);
}

function findSessionInfoContainer() {
  const candidates = Array.from(document.querySelectorAll("section, form, div")) as HTMLElement[];

  return (
    candidates.find((el) => {
      const txt = textOf(el);
      return /Informasi Session/i.test(txt) && /Nama session|Nama perusahaan|Lokasi/i.test(txt);
    }) ||
    candidates.find((el) => /Nama session|Pilih database corporate\/vaksinasi/i.test(textOf(el))) ||
    null
  );
}

function makeInput() {
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Input nama petugas, contoh: dr. Simon";
  input.style.minHeight = "52px";
  input.style.border = "1px solid #e2e8f0";
  input.style.borderRadius = "18px";
  input.style.padding = "0 16px";
  input.style.fontWeight = "800";
  input.style.width = "min(420px, 100%)";
  input.style.background = "#fff";
  return input;
}

function makeButton(label: string) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.style.border = "0";
  button.style.borderRadius = "16px";
  button.style.padding = "13px 18px";
  button.style.fontWeight = "900";
  button.style.color = "#ffffff";
  button.style.background = "linear-gradient(135deg, #2563eb, #1d4ed8)";
  button.style.boxShadow = "0 10px 22px rgba(37, 99, 235, 0.18)";
  button.style.cursor = "pointer";
  return button;
}

function renderStaffChips(root: HTMLElement, staff: StaffOption[]) {
  const list = root.querySelector("[data-hha-staff-list='1']") as HTMLElement | null;
  if (!list) return;

  list.innerHTML = "";

  if (!staff.length) {
    const empty = document.createElement("div");
    empty.textContent = "Belum ada nama petugas. Tambahkan nama petugas dulu.";
    empty.style.color = "#64748b";
    empty.style.fontWeight = "700";
    empty.style.fontSize = "13px";
    list.appendChild(empty);
    return;
  }

  for (const item of staff) {
    const chip = document.createElement("span");
    chip.textContent = item.name;
    chip.style.display = "inline-flex";
    chip.style.alignItems = "center";
    chip.style.padding = "8px 12px";
    chip.style.borderRadius = "999px";
    chip.style.background = "#eff6ff";
    chip.style.color = "#1d4ed8";
    chip.style.fontWeight = "900";
    chip.style.fontSize = "13px";
    list.appendChild(chip);
  }
}

async function ensureSetupStaffPanel() {
  if (!isSessionSetupPage()) return;
  if (document.getElementById("hha-vaccination-staff-setup-panel")) return;

  const container = findSessionInfoContainer();
  if (!container) return;

  const panel = document.createElement("section");
  panel.id = "hha-vaccination-staff-setup-panel";
  panel.style.marginTop = "18px";
  panel.style.padding = "22px";
  panel.style.border = "1px solid #e2e8f0";
  panel.style.borderRadius = "28px";
  panel.style.background = "#ffffff";
  panel.style.boxShadow = "0 8px 24px rgba(15, 23, 42, 0.04)";

  const title = document.createElement("div");
  title.textContent = "Nama Petugas Vaksinasi";
  title.style.fontSize = "24px";
  title.style.fontWeight = "950";
  title.style.letterSpacing = "-0.04em";

  const desc = document.createElement("div");
  desc.textContent = "Tambahkan nama dokter/petugas di sini. Nama ini akan muncul sebagai dropdown di halaman dokter.";
  desc.style.marginTop = "4px";
  desc.style.color = "#64748b";
  desc.style.fontWeight = "700";

  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.gap = "12px";
  row.style.alignItems = "center";
  row.style.flexWrap = "wrap";
  row.style.marginTop = "16px";

  const input = makeInput();
  const button = makeButton("+ Tambah Petugas");

  const msg = document.createElement("div");
  msg.style.fontSize = "13px";
  msg.style.fontWeight = "800";
  msg.style.color = "#64748b";
  msg.style.marginTop = "10px";

  const list = document.createElement("div");
  list.setAttribute("data-hha-staff-list", "1");
  list.style.display = "flex";
  list.style.flexWrap = "wrap";
  list.style.gap = "8px";
  list.style.marginTop = "14px";

  row.appendChild(input);
  row.appendChild(button);

  panel.appendChild(title);
  panel.appendChild(desc);
  panel.appendChild(row);
  panel.appendChild(msg);
  panel.appendChild(list);

  container.insertAdjacentElement("afterend", panel);

  const loaded = await fetchStaffOptions();
  renderStaffChips(panel, loaded.staff);
  if (loaded.needsSetup && loaded.message) {
    msg.textContent = loaded.message;
    msg.style.color = "#b45309";
  }

  async function submit() {
    const name = input.value;
    button.textContent = "Menyimpan...";
    button.setAttribute("disabled", "disabled");

    const result = await addStaffOption(name);

    input.value = "";
    renderStaffChips(panel, result.staff);
    msg.textContent = result.message || "Nama petugas tersimpan.";
    msg.style.color = result.ok ? "#047857" : "#dc2626";

    button.textContent = "+ Tambah Petugas";
    button.removeAttribute("disabled");

    refreshDoctorStaffDropdowns();
  }

  button.addEventListener("click", submit);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  });
}

function findDoctorNameInput() {
  const inputs = Array.from(document.querySelectorAll("input")) as HTMLInputElement[];

  return (
    inputs.find((input) => /Nama dokter|Nama petugas|dokter|petugas/i.test(input.placeholder || "")) ||
    inputs.find((input) => /dr\.|dokter|petugas/i.test(input.value || "")) ||
    null
  );
}

function setReactInputValue(input: HTMLInputElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  nativeSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function refreshDoctorStaffDropdowns() {
  const select = document.getElementById("hha-doctor-staff-dropdown") as HTMLSelectElement | null;
  if (!select) return;

  const current = select.value;
  const loaded = await fetchStaffOptions();
  const staff = loaded.staff;

  select.innerHTML = "";

  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "Pilih nama dokter / petugas";
  select.appendChild(empty);

  for (const item of staff) {
    const option = document.createElement("option");
    option.value = item.name;
    option.textContent = item.name;
    select.appendChild(option);
  }

  if (current && staff.some((item) => item.name === current)) {
    select.value = current;
  }
}

async function ensureDoctorStaffDropdown() {
  if (!isAdministerPage()) return;
  if (document.getElementById("hha-doctor-staff-dropdown")) return;

  const input = findDoctorNameInput();
  if (!input) return;

  const loaded = await fetchStaffOptions();
  const staff = loaded.staff;

  const select = document.createElement("select");
  select.id = "hha-doctor-staff-dropdown";
  select.style.minHeight = "54px";
  select.style.border = "1px solid #e2e8f0";
  select.style.borderRadius = "18px";
  select.style.padding = "0 16px";
  select.style.fontWeight = "850";
  select.style.background = "#ffffff";
  select.style.width = "100%";

  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = staff.length ? "Pilih nama dokter / petugas" : "Belum ada petugas - isi di Setup Session";
  select.appendChild(empty);

  for (const item of staff) {
    const option = document.createElement("option");
    option.value = item.name;
    option.textContent = item.name;
    select.appendChild(option);
  }

  if (input.value) {
    const option = document.createElement("option");
    option.value = input.value;
    option.textContent = input.value;
    select.appendChild(option);
    select.value = input.value;
  }

  select.addEventListener("change", () => {
    setReactInputValue(input, select.value);
  });

  input.style.display = "none";
  input.parentElement?.insertBefore(select, input.nextSibling);
}

export default function VaccinationStaffOptionsEnhancer() {
  useEffect(() => {
    if (!isVaccinationPage()) return;

    const run = () => {
      ensureSetupStaffPanel();
      ensureDoctorStaffDropdown();
    };

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
