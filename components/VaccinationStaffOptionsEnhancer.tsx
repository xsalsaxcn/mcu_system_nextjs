"use client";

import { useEffect } from "react";

type StaffOption = { id?: number; name: string };
const STORAGE_KEY = "hha_vaccination_staff_options_v118";

function clean(value: any) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function textOf(el: Element | null) {
  return clean(el?.textContent || "");
}

function isVaccinationPage() {
  return typeof window !== "undefined" && window.location.pathname.includes("/vaccination");
}

function isAdministerPage() {
  return typeof window !== "undefined" && window.location.pathname.includes("/vaccination/administer");
}

function uniq(items: StaffOption[]) {
  const seen = new Set<string>();
  const out: StaffOption[] = [];
  for (const item of items) {
    const name = clean(item?.name);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...item, name });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function readLocal(): StaffOption[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) || window.localStorage.getItem("hha_vaccination_staff_options_v117");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? uniq(parsed) : [];
  } catch (_error) {
    return [];
  }
}

function writeLocal(items: StaffOption[]) {
  try {
    const data = JSON.stringify(uniq(items));
    window.localStorage.setItem(STORAGE_KEY, data);
    window.localStorage.setItem("hha_vaccination_staff_options_v117", data);
  } catch (_error) {}
}

async function loadStaff() {
  const local = readLocal();
  try {
    const res = await fetch("/api/vaccination/staff-options", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (json?.ok) {
      const merged = uniq([...(json.staff || []), ...local]);
      writeLocal(merged);
      return { staff: merged, message: json.message || "", needsSetup: Boolean(json.needs_setup) };
    }
    return { staff: local, message: json?.message || "", needsSetup: Boolean(json?.needs_setup) };
  } catch (_error) {
    return { staff: local, message: "", needsSetup: false };
  }
}

async function addStaff(name: string) {
  const n = clean(name);
  if (!n) return { ok: false, staff: readLocal(), message: "Nama petugas wajib diisi." };
  const local = uniq([...readLocal(), { name: n }]);
  writeLocal(local);
  try {
    await fetch("/api/vaccination/staff-options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ name: n }),
    });
  } catch (_error) {}
  const fresh = await loadStaff();
  return { ok: true, staff: fresh.staff.length ? fresh.staff : local, message: "Nama petugas ditambahkan." };
}

function removeWrongPanel() {
  const old = document.getElementById("hha-vaccination-staff-setup-panel");
  if (old) old.remove();
}

function isSessionPage() {
  if (!isVaccinationPage() || isAdministerPage()) return false;
  const body = textOf(document.body);
  if (/StagePelaksanaan|StagePelaporan|StageReminder/i.test(body)) return false;
  return /Session Vaksinasi/i.test(body) && /Informasi Session/i.test(body);
}

function findSessionCard() {
  const list = Array.from(document.querySelectorAll("section,form,div")) as HTMLElement[];
  return list
    .filter((el) => {
      const txt = textOf(el);
      return /Informasi Session/i.test(txt) && /Nama session|Nama perusahaan|Lokasi|Jam \/ slot/i.test(txt) && el.querySelectorAll("input,select").length >= 3;
    })
    .sort((a, b) => textOf(a).length - textOf(b).length)[0] || null;
}

function renderChips(root: HTMLElement, staff: StaffOption[]) {
  const box = root.querySelector("[data-hha-staff-list='1']") as HTMLElement | null;
  if (!box) return;
  box.innerHTML = "";
  if (!staff.length) {
    const empty = document.createElement("span");
    empty.textContent = "Belum ada nama petugas.";
    empty.style.color = "#64748b";
    empty.style.fontWeight = "700";
    empty.style.fontSize = "13px";
    box.appendChild(empty);
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
    box.appendChild(chip);
  }
}

async function ensureInlineField() {
  removeWrongPanel();
  if (!isSessionPage()) return;
  if (document.getElementById("hha-vaccination-staff-inline")) return;
  const card = findSessionCard();
  if (!card) return;

  const wrap = document.createElement("div");
  wrap.id = "hha-vaccination-staff-inline";
  wrap.style.gridColumn = "1 / -1";
  wrap.style.marginTop = "14px";
  wrap.style.padding = "16px";
  wrap.style.border = "1px solid #e2e8f0";
  wrap.style.borderRadius = "22px";
  wrap.style.background = "#fff";

  const label = document.createElement("div");
  label.textContent = "Nama Petugas";
  label.style.fontWeight = "950";
  label.style.fontSize = "15px";
  label.style.marginBottom = "8px";

  const row = document.createElement("div");
  row.style.display = "grid";
  row.style.gridTemplateColumns = "minmax(220px,1fr) auto";
  row.style.gap = "10px";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Nama petugas / dokter, contoh: dr. Simon";
  input.style.minHeight = "54px";
  input.style.border = "1px solid #e2e8f0";
  input.style.borderRadius = "18px";
  input.style.padding = "0 16px";
  input.style.fontWeight = "800";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "+ Add More";
  btn.style.border = "0";
  btn.style.borderRadius = "16px";
  btn.style.padding = "14px 18px";
  btn.style.fontWeight = "900";
  btn.style.color = "#fff";
  btn.style.background = "linear-gradient(135deg,#2563eb,#1d4ed8)";
  btn.style.cursor = "pointer";

  const msg = document.createElement("div");
  msg.style.marginTop = "8px";
  msg.style.fontSize = "12px";
  msg.style.fontWeight = "800";
  msg.style.color = "#64748b";

  const chips = document.createElement("div");
  chips.setAttribute("data-hha-staff-list", "1");
  chips.style.display = "flex";
  chips.style.flexWrap = "wrap";
  chips.style.gap = "8px";
  chips.style.marginTop = "10px";

  row.appendChild(input);
  row.appendChild(btn);
  wrap.appendChild(label);
  wrap.appendChild(row);
  wrap.appendChild(msg);
  wrap.appendChild(chips);
  card.appendChild(wrap);

  const loaded = await loadStaff();
  renderChips(wrap, loaded.staff);
  if (loaded.needsSetup && loaded.message) {
    msg.textContent = loaded.message;
    msg.style.color = "#b45309";
  }

  async function submit() {
    btn.textContent = "Menyimpan...";
    btn.setAttribute("disabled", "disabled");
    const result = await addStaff(input.value);
    input.value = "";
    renderChips(wrap, result.staff);
    msg.textContent = result.message;
    msg.style.color = result.ok ? "#047857" : "#dc2626";
    btn.textContent = "+ Add More";
    btn.removeAttribute("disabled");
    refreshDoctorDropdown();
  }

  btn.addEventListener("click", submit);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  });
}

function findDoctorInput() {
  const inputs = Array.from(document.querySelectorAll("input")) as HTMLInputElement[];
  return inputs.find((input) => /Nama dokter|Nama petugas|dokter|petugas/i.test(input.placeholder || "")) || null;
}

function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function refreshDoctorDropdown() {
  const select = document.getElementById("hha-doctor-staff-dropdown") as HTMLSelectElement | null;
  if (!select) return;
  const current = select.value;
  const loaded = await loadStaff();
  select.innerHTML = "";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "Pilih nama dokter / petugas";
  select.appendChild(empty);
  for (const item of loaded.staff) {
    const option = document.createElement("option");
    option.value = item.name;
    option.textContent = item.name;
    select.appendChild(option);
  }
  select.value = current;
}

async function ensureDoctorDropdown() {
  if (!isAdministerPage()) return;
  if (document.getElementById("hha-doctor-staff-dropdown")) return;
  const input = findDoctorInput();
  if (!input) return;
  const loaded = await loadStaff();

  const select = document.createElement("select");
  select.id = "hha-doctor-staff-dropdown";
  select.style.minHeight = "54px";
  select.style.border = "1px solid #e2e8f0";
  select.style.borderRadius = "18px";
  select.style.padding = "0 16px";
  select.style.fontWeight = "850";
  select.style.background = "#fff";
  select.style.width = "100%";

  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = loaded.staff.length ? "Pilih nama dokter / petugas" : "Belum ada petugas - isi di Session";
  select.appendChild(empty);
  for (const item of loaded.staff) {
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
  select.addEventListener("change", () => setInput(input, select.value));
  input.style.display = "none";
  input.parentElement?.insertBefore(select, input.nextSibling);
}

export default function VaccinationStaffOptionsEnhancer() {
  useEffect(() => {
    if (!isVaccinationPage()) return;
    const run = () => {
      removeWrongPanel();
      ensureInlineField();
      ensureDoctorDropdown();
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
