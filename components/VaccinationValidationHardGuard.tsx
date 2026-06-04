"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    __hhaVaccPrintModeV128?: string;
    __hhaVaccGuardV128Installed?: boolean;
    __hhaOriginalOpenV128?: typeof window.open;
    __hhaOriginalPrintV128?: typeof window.print;
  }
}

function clean(value: any) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function slug(value: any) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function mode(value: any) {
  const raw = clean(value).toUpperCase();
  return raw === "VALIDASI" || raw === "TIM_VALIDASI" || raw === "TIM VALIDASI" ? "VALIDASI" : "MEDIS";
}

function isVaccinationPage() {
  return typeof window !== "undefined" && window.location.pathname.includes("/vaccination");
}

function isSessionPage() {
  if (!isVaccinationPage()) return false;
  const p = window.location.pathname;
  if (p.includes("/queue") || p.includes("/administer") || p.includes("/validation") || p.includes("/public") || p.includes("/sticker")) return false;
  const t = clean(document.body?.textContent || "");
  return /Session Vaksinasi/i.test(t) && /Informasi Session/i.test(t);
}

function isAdministerPage() {
  return typeof window !== "undefined" && window.location.pathname.includes("/vaccination/administer");
}

function textOf(el: Element | null) {
  return clean(el?.textContent || "");
}

function findSessionSelect() {
  const selects = Array.from(document.querySelectorAll("select")) as HTMLSelectElement[];
  return selects.find((s) => /HEALTHDAY|VAKSIN|BINUS|Session/i.test(textOf(s))) || selects[0] || null;
}

function sessionInfo() {
  const s = findSessionSelect();
  const value = clean(s?.value || "");
  const text = clean(s ? s.options[s.selectedIndex]?.textContent || s.textContent || "" : "");
  return { value, text, key: slug(text || value || "default") };
}

function localKeys(info = sessionInfo()) {
  const keys = ["hha_vacc_print_mode_default", "hha_print_label_handler_default"];
  if (info.value) {
    keys.push(`hha_vacc_print_mode_id_${info.value}`);
    keys.push(`hha_print_label_handler_${info.value}`);
    keys.push(`hha_print_label_handler_${slug(info.value)}`);
  }
  if (info.key) {
    keys.push(`hha_vacc_print_mode_key_${info.key}`);
    keys.push(`hha_print_label_handler_text_${info.key}`);
  }
  return keys;
}

function saveLocal(nextMode: string, info = sessionInfo()) {
  const next = mode(nextMode);
  window.__hhaVaccPrintModeV128 = next;
  try { for (const key of localKeys(info)) window.localStorage.setItem(key, next); } catch (_e) {}
}

function readLocal(info = sessionInfo()) {
  try {
    for (const key of localKeys(info)) {
      const v = window.localStorage.getItem(key);
      if (v) return mode(v);
    }
    if (info.key) {
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const k = window.localStorage.key(i) || "";
        if (!k.includes(info.key)) continue;
        const v = window.localStorage.getItem(k);
        if (v) return mode(v);
      }
    }
  } catch (_e) {}
  return mode(window.__hhaVaccPrintModeV128 || "MEDIS");
}

async function saveApi(nextMode: string, info = sessionInfo()) {
  try {
    await fetch("/api/vaccination/session-print-setting", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ session_id: info.value, session_key: info.key, session_name: info.text, print_label_handler: mode(nextMode) }),
    });
  } catch (_e) {}
}

async function readApi(info = sessionInfo()) {
  try {
    const qs = new URLSearchParams();
    if (info.value) qs.set("session_id", info.value);
    if (info.key) qs.set("session_key", info.key);
    if (info.text) qs.set("session_name", info.text);
    const res = await fetch(`/api/vaccination/session-print-setting?${qs.toString()}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (json?.ok && json.print_label_handler) {
      const m = mode(json.print_label_handler);
      saveLocal(m, info);
      return m;
    }
  } catch (_e) {}
  return null;
}

function smallestContainer(test: (el: HTMLElement) => boolean) {
  const nodes = Array.from(document.querySelectorAll("section,form,div")) as HTMLElement[];
  return nodes.filter(test).sort((a, b) => textOf(a).length - textOf(b).length)[0] || null;
}

function infoSessionContainer() {
  return smallestContainer((el) => {
    const t = textOf(el);
    const controls = el.querySelectorAll("input,select,textarea").length;
    return /Informasi Session/i.test(t) && /Nama session|Nama perusahaan|Lokasi|Jam \/ slot/i.test(t) && controls >= 3;
  });
}

function ensureSessionField() {
  if (!isSessionPage()) return;
  let box = document.getElementById("hha-print-label-handler-v128");
  if (!box) {
    const host = infoSessionContainer();
    if (!host) return;
    box = document.createElement("div");
    box.id = "hha-print-label-handler-v128";
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
    select.id = "hha-print-label-handler-select-v128";
    select.style.minHeight = "54px";
    select.style.border = "1px solid #e2e8f0";
    select.style.borderRadius = "18px";
    select.style.padding = "0 16px";
    select.style.fontWeight = "850";
    select.style.background = "#fff";
    select.style.width = "100%";
    const a = document.createElement("option");
    a.value = "MEDIS"; a.textContent = "Dokter / Medis";
    const b = document.createElement("option");
    b.value = "VALIDASI"; b.textContent = "Tim Validasi";
    select.appendChild(a); select.appendChild(b);
    const note = document.createElement("div");
    note.textContent = "Jika pilih Tim Validasi, dokter tidak membuka popup print. Label dicetak di menu Tim Validasi.";
    note.style.marginTop = "8px";
    note.style.fontSize = "12px";
    note.style.fontWeight = "800";
    note.style.color = "#64748b";
    select.addEventListener("change", () => { const info = sessionInfo(); saveLocal(select.value, info); saveApi(select.value, info); });
    box.appendChild(label); box.appendChild(select); box.appendChild(note);
    host.appendChild(box);
  }
  const sel = document.getElementById("hha-print-label-handler-select-v128") as HTMLSelectElement | null;
  if (sel) sel.value = readLocal(sessionInfo());
}

function ensureValidationMenu() {
  if (!isVaccinationPage() || window.location.pathname.includes("/validation")) return;
  if (document.getElementById("hha-validation-menu-link-v128")) return;
  const link = document.createElement("a");
  link.id = "hha-validation-menu-link-v128";
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
  const menu = (Array.from(document.querySelectorAll("a,button")) as HTMLElement[]).find((el) => /Menu Vaksinasi/i.test(textOf(el)));
  if (menu?.parentElement) menu.parentElement.insertBefore(link, menu.nextSibling);
  else { link.style.position = "fixed"; link.style.right = "20px"; link.style.bottom = "20px"; link.style.zIndex = "9999"; document.body.appendChild(link); }
}

function finalButton(button: HTMLButtonElement) {
  return /Selesai Dokter|Print Semua|Semua Sticker|Done\s*\+\s*Print|Done \+ Print/i.test(textOf(button));
}

function findFinalButton() {
  return (Array.from(document.querySelectorAll("button")) as HTMLButtonElement[]).find(finalButton) || null;
}

function stickerUrl(value: any) {
  return /\/vaccination\/sticker|sticker\/bulk|print|label/i.test(clean(value));
}

function participantSelect() {
  const selects = Array.from(document.querySelectorAll("select")) as HTMLSelectElement[];
  return selects.find((s) => /^A-\d+/i.test(textOf(s)) || /CALLED|IN_PROGRESS|WAITING|PENDING|DONE/i.test(textOf(s))) || null;
}

function queueNumber(text: string) {
  const m = clean(text).match(/\b[A-Z]-\d+\b/i);
  return m ? m[0].toUpperCase() : "";
}

async function sendToValidation() {
  const p = participantSelect();
  const info = sessionInfo();
  const rawValue = clean(p?.value || "");
  const rawText = clean(p ? p.options[p.selectedIndex]?.textContent || "" : "");
  const num = Number(rawValue);
  const payload: any = { action: "SEND_TO_VALIDATION", session_id: info.value, session_key: info.key, session_name: info.text, queue_number: queueNumber(rawText) };
  if (Number.isFinite(num) && num > 0) { payload.id = num; payload.registration_id = num; }
  if (!payload.id && !payload.queue_number) throw new Error("Peserta belum dipilih atau ID peserta tidak terbaca.");
  const res = await fetch("/api/vaccination/validation", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify(payload) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) throw new Error(json.message || "Gagal mengirim ke Tim Validasi.");
}

async function refreshDoctorMode() {
  if (!isAdministerPage()) return;
  const info = sessionInfo();
  let m = readLocal(info);
  const api = await readApi(info);
  if (api) m = api;
  window.__hhaVaccPrintModeV128 = m;
  const btn = findFinalButton();
  if (!btn) return;
  if (m === "VALIDASI") {
    btn.textContent = "Selesai Dokter - Kirim ke Tim Validasi";
    btn.setAttribute("data-hha-validation-final-v128", "1");
    btn.title = "Session ini memakai Tim Validasi. Popup print dokter diblokir.";
    if (!document.getElementById("hha-validation-badge-v128")) {
      const badge = document.createElement("div");
      badge.id = "hha-validation-badge-v128";
      badge.textContent = "Mode print label: Tim Validasi. Dokter tidak akan membuka popup print.";
      badge.style.marginTop = "10px"; badge.style.padding = "12px 14px"; badge.style.border = "1px solid #bbf7d0"; badge.style.borderRadius = "16px"; badge.style.background = "#ecfdf5"; badge.style.color = "#047857"; badge.style.fontWeight = "900"; badge.style.fontSize = "13px";
      (btn.parentElement || document.body).appendChild(badge);
    }
  }
}

function installGuard() {
  if (window.__hhaVaccGuardV128Installed) return;
  window.__hhaVaccGuardV128Installed = true;
  window.__hhaOriginalOpenV128 = window.open.bind(window);
  window.__hhaOriginalPrintV128 = window.print.bind(window);
  window.open = ((url?: string | URL, target?: string, features?: string) => {
    if (isAdministerPage() && readLocal(sessionInfo()) === "VALIDASI" && stickerUrl(url || "")) {
      console.warn("[HHA] Blocked doctor sticker popup because print handler is Tim Validasi.");
      return null;
    }
    return window.__hhaOriginalOpenV128 ? window.__hhaOriginalOpenV128(url as any, target, features) : null;
  }) as typeof window.open;
  window.print = (() => {
    if (isAdministerPage() && readLocal(sessionInfo()) === "VALIDASI") {
      console.warn("[HHA] Blocked doctor print because print handler is Tim Validasi.");
      return;
    }
    return window.__hhaOriginalPrintV128 ? window.__hhaOriginalPrintV128() : undefined;
  }) as typeof window.print;
  document.addEventListener("click", async (event) => {
    if (!isAdministerPage()) return;
    const button = (event.target as HTMLElement | null)?.closest("button") as HTMLButtonElement | null;
    if (!button || !finalButton(button)) return;
    if (readLocal(sessionInfo()) !== "VALIDASI" && button.getAttribute("data-hha-validation-final-v128") !== "1") return;
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    const old = button.textContent || ""; button.disabled = true; button.textContent = "Mengirim ke Tim Validasi...";
    try { await sendToValidation(); button.textContent = "Terkirim ke Tim Validasi"; window.alert("Peserta dikirim ke Tim Validasi. Tidak ada popup print di dokter."); setTimeout(() => window.location.reload(), 900); }
    catch (e: any) { button.disabled = false; button.textContent = old; window.alert(e?.message || "Gagal mengirim ke Tim Validasi."); }
  }, true);
}

export default function VaccinationValidationHardGuard() {
  useEffect(() => {
    if (!isVaccinationPage()) return;
    installGuard();
    let cancelled = false;
    const run = () => { if (cancelled) return; ensureValidationMenu(); ensureSessionField(); refreshDoctorMode(); };
    const timers = [80,250,600,1200,2400,4200,6500].map((d) => window.setTimeout(run, d));
    const onChange = () => window.setTimeout(run, 120);
    const onFocus = () => run();
    document.addEventListener("change", onChange, true);
    window.addEventListener("focus", onFocus);
    return () => { cancelled = true; timers.forEach((t) => window.clearTimeout(t)); document.removeEventListener("change", onChange, true); window.removeEventListener("focus", onFocus); };
  }, []);
  return null;
}
