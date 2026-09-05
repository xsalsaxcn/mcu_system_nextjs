"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    __hhaVaccFinalGuardV129Installed?: boolean;
    __hhaVaccOriginalOpenV129?: typeof window.open;
    __hhaVaccOriginalPrintV129?: typeof window.print;
    __hhaVaccPrintModeV129?: string;
  }
}

function clean(value: any) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function slug(value: any) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function isVaccinationPage() {
  return typeof window !== "undefined" && window.location.pathname.includes("/vaccination");
}

function isSessionPage() {
  if (!isVaccinationPage()) return false;
  const path = window.location.pathname;
  if (path.includes("/queue") || path.includes("/administer") || path.includes("/validation") || path.includes("/public") || path.includes("/sticker")) return false;
  const body = clean(document.body?.textContent || "");
  return /Session Vaksinasi/i.test(body) && /Informasi Session/i.test(body);
}

function isAdministerPage() {
  return typeof window !== "undefined" && window.location.pathname.includes("/vaccination/administer");
}

function textOf(el: Element | null) {
  return clean(el?.textContent || "");
}

function normalizeMode(value: any) {
  const raw = clean(value).toUpperCase();
  return raw === "VALIDASI" || raw === "TIM_VALIDASI" || raw === "TIM VALIDASI" ? "VALIDASI" : "MEDIS";
}

function findSessionSelect() {
  const selects = Array.from(document.querySelectorAll("select")) as HTMLSelectElement[];
  return selects.find((select) => /HEALTHDAY|VAKSIN|BINUS|Session/i.test(textOf(select))) || selects[0] || null;
}

function getSessionInfo() {
  const select = findSessionSelect();
  const value = clean(select?.value || "");
  const selectedText = clean(select ? select.options[select.selectedIndex]?.textContent || "" : "");
  const text = selectedText || clean(select?.textContent || "");
  return { value, text, key: slug(text || value || "default") };
}

function modeKeys(info = getSessionInfo()) {
  const keys = ["hha_vacc_print_mode_default", "hha_print_label_handler_default", "hha_validation_print_mode_default"];
  if (info.value) {
    keys.push(`hha_vacc_print_mode_id_${info.value}`);
    keys.push(`hha_print_label_handler_${info.value}`);
    keys.push(`hha_print_label_handler_${slug(info.value)}`);
    keys.push(`hha_validation_print_mode_id_${info.value}`);
  }
  if (info.key) {
    keys.push(`hha_vacc_print_mode_key_${info.key}`);
    keys.push(`hha_print_label_handler_text_${info.key}`);
    keys.push(`hha_validation_print_mode_key_${info.key}`);
  }
  return keys;
}

function hasAnyValidationModeInBrowser() {
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i) || "";
      if (!/(print_label_handler|vacc_print_mode|validation_print_mode)/i.test(key)) continue;
      if (normalizeMode(window.localStorage.getItem(key)) === "VALIDASI") return true;
    }
  } catch (_error) {}
  return false;
}

function saveModeLocal(mode: string, info = getSessionInfo()) {
  const normalized = normalizeMode(mode);
  window.__hhaVaccPrintModeV129 = normalized;
  try {
    for (const key of modeKeys(info)) window.localStorage.setItem(key, normalized);
  } catch (_error) {}
}

function getModeLocal(info = getSessionInfo()) {
  try {
    for (const key of modeKeys(info)) {
      const value = window.localStorage.getItem(key);
      if (value) return normalizeMode(value);
    }
    if (info.key) {
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i) || "";
        if (!key.includes(info.key)) continue;
        const value = window.localStorage.getItem(key);
        if (value) return normalizeMode(value);
      }
    }
  } catch (_error) {}

  if (isAdministerPage() && hasAnyValidationModeInBrowser()) return "VALIDASI";
  return normalizeMode(window.__hhaVaccPrintModeV129 || "MEDIS");
}

async function saveModeApi(mode: string, info = getSessionInfo()) {
  try {
    await fetch("/api/vaccination/session-print-setting", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        session_id: info.value,
        session_key: info.key,
        session_name: info.text,
        print_label_handler: normalizeMode(mode),
      }),
    });
  } catch (_error) {}
}

async function fetchModeApi(info = getSessionInfo()) {
  try {
    const qs = new URLSearchParams();
    if (info.value) qs.set("session_id", info.value);
    if (info.key) qs.set("session_key", info.key);
    if (info.text) qs.set("session_name", info.text);
    const res = await fetch(`/api/vaccination/session-print-setting?${qs.toString()}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (json?.ok && json.print_label_handler) {
      const mode = normalizeMode(json.print_label_handler);
      saveModeLocal(mode, info);
      return mode;
    }
  } catch (_error) {}
  return null;
}

function findSmallestContainer(predicate: (el: HTMLElement) => boolean) {
  const nodes = Array.from(document.querySelectorAll("section,form,div")) as HTMLElement[];
  return nodes.filter(predicate).sort((a, b) => textOf(a).length - textOf(b).length)[0] || null;
}

function findInfoSessionContainer() {
  return findSmallestContainer((el) => {
    const text = textOf(el);
    const controls = el.querySelectorAll("input,select,textarea").length;
    return /Informasi Session/i.test(text) && /Nama session|Nama perusahaan|Lokasi|Jam \/ slot/i.test(text) && controls >= 3;
  });
}

function removeOldPrintModeBoxes() {
  const oldIds = ["hha-print-mode-v126", "hha-print-mode-v127", "hha-print-label-handler-v128", "hha-print-label-handler-v127", "hha-print-label-handler-v126"];
  for (const id of oldIds) document.getElementById(id)?.remove();

  const candidates = Array.from(document.querySelectorAll("div")) as HTMLElement[];
  for (const node of candidates) {
    if (node.id === "hha-print-label-handler-v129") continue;
    const text = textOf(node);
    const controls = node.querySelectorAll("select,input,textarea").length;
    if (/Petugas Print Label/i.test(text) && /Tim Validasi/i.test(text) && controls <= 2) node.remove();
  }
}

function ensureSessionPrintModeField() {
  if (!isSessionPage()) return;
  removeOldPrintModeBoxes();

  const existing = document.getElementById("hha-print-label-handler-v129");
  if (existing) {
    const select = document.getElementById("hha-print-label-handler-select-v129") as HTMLSelectElement | null;
    if (select) select.value = getModeLocal(getSessionInfo());
    return;
  }

  const container = findInfoSessionContainer();
  if (!container) return;

  const box = document.createElement("div");
  box.id = "hha-print-label-handler-v129";
  box.style.gridColumn = "1 / -1";
  box.style.marginTop = "14px";
  box.style.padding = "16px";
  box.style.border = "1px solid #e2e8f0";
  box.style.borderRadius = "22px";
  box.style.background = "#ffffff";

  const label = document.createElement("div");
  label.textContent = "Petugas Print Label";
  label.style.fontSize = "15px";
  label.style.fontWeight = "950";
  label.style.marginBottom = "8px";

  const select = document.createElement("select");
  select.id = "hha-print-label-handler-select-v129";
  select.style.minHeight = "54px";
  select.style.border = "1px solid #e2e8f0";
  select.style.borderRadius = "18px";
  select.style.padding = "0 16px";
  select.style.fontWeight = "850";
  select.style.background = "#fff";
  select.style.width = "100%";

  const medis = document.createElement("option");
  medis.value = "MEDIS";
  medis.textContent = "Dokter / Medis";
  const validasi = document.createElement("option");
  validasi.value = "VALIDASI";
  validasi.textContent = "Tim Validasi";
  select.appendChild(medis);
  select.appendChild(validasi);

  const note = document.createElement("div");
  note.style.marginTop = "8px";
  note.style.fontSize = "12px";
  note.style.fontWeight = "800";
  note.style.color = "#64748b";

  const syncNote = () => {
    note.textContent = select.value === "VALIDASI"
      ? "Mode Tim Validasi aktif. Dokter tidak membuka print label; print dilakukan di menu Tim Validasi."
      : "Mode Dokter / Medis aktif. Dokter tetap membuka print label.";
  };

  select.value = getModeLocal(getSessionInfo());
  syncNote();
  select.addEventListener("change", () => {
    const info = getSessionInfo();
    const mode = normalizeMode(select.value);
    saveModeLocal(mode, info);
    saveModeApi(mode, info);
    syncNote();
  });

  box.appendChild(label);
  box.appendChild(select);
  box.appendChild(note);
  container.appendChild(box);
}

function ensureValidationMenuLink() {
  if (!isVaccinationPage() || window.location.pathname.includes("/validation") || window.location.pathname.includes("/sticker")) return;
  if (document.getElementById("hha-validation-menu-link-v129")) return;

  const link = document.createElement("a");
  link.id = "hha-validation-menu-link-v129";
  link.href = "/vaccination/validation";
  link.textContent = "Tim Validasi";
  link.style.display = "inline-flex";
  link.style.alignItems = "center";
  link.style.justifyContent = "center";
  link.style.minHeight = "46px";
  link.style.padding = "0 18px";
  link.style.borderRadius = "16px";
  link.style.border = "1px solid #bbf7d0";
  link.style.background = "#ecfdf5";
  link.style.color = "#047857";
  link.style.fontWeight = "950";
  link.style.textDecoration = "none";
  link.style.marginLeft = "10px";

  const controls = Array.from(document.querySelectorAll("a,button")) as HTMLElement[];
  const menu = controls.find((el) => /Menu Vaksinasi/i.test(textOf(el)));
  if (menu?.parentElement) menu.parentElement.insertBefore(link, menu.nextSibling);
  else document.body.appendChild(link);
}

function currentModeSync() {
  return getModeLocal(getSessionInfo());
}

function isFinalDoctorButton(button: HTMLButtonElement) {
  const text = textOf(button);
  return /Selesai Dokter|Print Semua|Semua Sticker|Done\s*\+\s*Print|Done \+ Print/i.test(text);
}

function findFinalDoctorButton() {
  const buttons = Array.from(document.querySelectorAll("button")) as HTMLButtonElement[];
  return buttons.find(isFinalDoctorButton) || null;
}

function ensureValidationBadge() {
  if (document.getElementById("hha-validation-badge-v129")) return;
  const finalButton = findFinalDoctorButton();
  const host = finalButton?.parentElement || document.body;
  const badge = document.createElement("div");
  badge.id = "hha-validation-badge-v129";
  badge.textContent = "Mode print label: Tim Validasi. Dokter tidak membuka popup print.";
  badge.style.marginTop = "10px";
  badge.style.padding = "12px 14px";
  badge.style.border = "1px solid #bbf7d0";
  badge.style.borderRadius = "16px";
  badge.style.background = "#ecfdf5";
  badge.style.color = "#047857";
  badge.style.fontWeight = "900";
  badge.style.fontSize = "13px";
  host.appendChild(badge);
}

async function refreshAdministerMode() {
  if (!isAdministerPage()) return;
  const info = getSessionInfo();
  let mode = getModeLocal(info);
  const apiMode = await fetchModeApi(info);
  if (apiMode) mode = apiMode;
  if (hasAnyValidationModeInBrowser()) mode = "VALIDASI";
  window.__hhaVaccPrintModeV129 = mode;

  const finalButton = findFinalDoctorButton();
  if (!finalButton) return;
  if (mode === "VALIDASI") {
    finalButton.textContent = "Selesai Dokter - Kirim ke Tim Validasi";
    finalButton.setAttribute("data-hha-validation-final-v129", "1");
    finalButton.title = "Session ini memakai Tim Validasi. Popup print dokter diblokir.";
    ensureValidationBadge();
  } else {
    finalButton.removeAttribute("data-hha-validation-final-v129");
  }
}

function parseQueueNumber(text: string) {
  const match = clean(text).match(/\b[A-Z]-\d+\b/i);
  return match ? match[0].toUpperCase() : "";
}

function findParticipantSelect() {
  const selects = Array.from(document.querySelectorAll("select")) as HTMLSelectElement[];
  return selects.find((select) => {
    const text = textOf(select);
    return /^A-\d+/i.test(text) || /CALLED|IN_PROGRESS|WAITING|PENDING|DONE/i.test(text);
  }) || null;
}

async function sendParticipantToValidation() {
  const participantSelect = findParticipantSelect();
  const info = getSessionInfo();
  const rawValue = clean(participantSelect?.value || "");
  const rawText = clean(participantSelect ? participantSelect.options[participantSelect.selectedIndex]?.textContent || "" : "");
  const numericId = Number(rawValue);
  const payload: any = {
    action: "SEND_TO_VALIDATION",
    session_id: info.value,
    session_key: info.key,
    session_name: info.text,
    queue_number: parseQueueNumber(rawText),
  };
  if (Number.isFinite(numericId) && numericId > 0) {
    payload.id = numericId;
    payload.registration_id = numericId;
  }
  if (!payload.id && !payload.queue_number) throw new Error("Peserta belum dipilih atau ID peserta tidak terbaca.");

  const res = await fetch("/api/vaccination/validation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) throw new Error(json.message || "Gagal mengirim ke Tim Validasi.");
  return json;
}

function makeFakePopup() {
  const fakeDocument = { open() {}, write(_html?: string) {}, close() {}, body: null, documentElement: null };
  return { document: fakeDocument, closed: true, close() {}, focus() {}, print() {}, addEventListener() {}, removeEventListener() {}, location: { href: "about:blank" } } as any;
}

function installGuards() {
  if (window.__hhaVaccFinalGuardV129Installed) return;
  window.__hhaVaccFinalGuardV129Installed = true;
  window.__hhaVaccOriginalOpenV129 = window.open.bind(window);
  window.__hhaVaccOriginalPrintV129 = window.print.bind(window);

  window.open = ((url?: string | URL, target?: string, features?: string) => {
    if (isAdministerPage() && currentModeSync() === "VALIDASI") {
      console.warn("[HHA] Doctor print popup blocked because Petugas Print Label = Tim Validasi.", url);
      return makeFakePopup();
    }
    return window.__hhaVaccOriginalOpenV129 ? window.__hhaVaccOriginalOpenV129(url as any, target, features) : null;
  }) as typeof window.open;

  window.print = (() => {
    if (isAdministerPage() && currentModeSync() === "VALIDASI") {
      console.warn("[HHA] Doctor print blocked because Petugas Print Label = Tim Validasi.");
      return;
    }
    return window.__hhaVaccOriginalPrintV129 ? window.__hhaVaccOriginalPrintV129() : undefined;
  }) as typeof window.print;

  document.addEventListener("click", async (event) => {
    if (!isAdministerPage()) return;
    const target = event.target as HTMLElement | null;
    const button = target?.closest("button") as HTMLButtonElement | null;
    if (!button || !isFinalDoctorButton(button)) return;
    const mode = currentModeSync();
    const isMarked = button.getAttribute("data-hha-validation-final-v129") === "1";
    if (mode !== "VALIDASI" && !isMarked) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const oldText = button.textContent || "";
    button.disabled = true;
    button.textContent = "Mengirim ke Tim Validasi...";
    try {
      await sendParticipantToValidation();
      button.textContent = "Terkirim ke Tim Validasi";
      window.alert("Peserta dikirim ke Tim Validasi. Tidak ada popup print di dokter.");
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error: any) {
      button.disabled = false;
      button.textContent = oldText;
      window.alert(error?.message || "Gagal mengirim ke Tim Validasi.");
    }
  }, true);
}

export default function VaccinationValidationFinalGuard() {
  useEffect(() => {
    if (!isVaccinationPage()) return;
    installGuards();
    let cancelled = false;
    const delays = [80, 250, 600, 1200, 2400, 4200, 6500];
    const run = () => {
      if (cancelled) return;
      ensureValidationMenuLink();
      ensureSessionPrintModeField();
      refreshAdministerMode();
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
