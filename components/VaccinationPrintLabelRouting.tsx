"use client";

import { useEffect } from "react";

function clean(value: any) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
function isVaccinationPath() { return typeof window !== "undefined" && window.location.pathname.includes("/vaccination"); }
function isSessionPage() {
  if (!isVaccinationPath()) return false;
  const p = window.location.pathname;
  if (p.includes("/queue") || p.includes("/administer") || p.includes("/public") || p.includes("/validation")) return false;
  const body = clean(document.body?.textContent || "");
  return /Session Vaksinasi/i.test(body) && /Informasi Session/i.test(body);
}
function isAdministerPage() { return typeof window !== "undefined" && window.location.pathname.includes("/vaccination/administer"); }
function textOf(el: Element | null) { return clean(el?.textContent || ""); }
function findSmallest(predicate: (el: HTMLElement) => boolean) {
  return (Array.from(document.querySelectorAll("section,form,div")) as HTMLElement[]).filter(predicate).sort((a, b) => textOf(a).length - textOf(b).length)[0] || null;
}
function findInfoSessionContainer() {
  return findSmallest((el) => {
    const text = textOf(el); const controls = el.querySelectorAll("input,select,textarea").length;
    return /Informasi Session/i.test(text) && /Nama session|Nama perusahaan|Lokasi|Jam \/ slot/i.test(text) && controls >= 3;
  });
}
function findSessionSelect() {
  const selects = Array.from(document.querySelectorAll("select")) as HTMLSelectElement[];
  return selects.find((s) => /HEALTHDAY|VAKSIN|BINUS|Session/i.test(textOf(s))) || selects[0] || null;
}
function getSessionId() { return clean(findSessionSelect()?.value || ""); }
function localKey(sessionId?: string) { return `hha_print_label_handler_${sessionId || "default"}`; }
function setLocal(mode: string, sessionId?: string) { try { window.localStorage.setItem(localKey(sessionId), mode); window.localStorage.setItem(localKey("default"), mode); } catch {} }
function getLocal(sessionId?: string) { try { return window.localStorage.getItem(localKey(sessionId)) || window.localStorage.getItem(localKey("default")) || "MEDIS"; } catch { return "MEDIS"; } }
async function saveMode(mode: string, sessionId?: string) {
  if (!sessionId) return;
  try { await fetch("/api/vaccination/session-print-setting", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify({ session_id: sessionId, print_label_handler: mode }) }); } catch {}
}
async function getMode(sessionId?: string) {
  if (!sessionId) return getLocal();
  try {
    const res = await fetch(`/api/vaccination/session-print-setting?session_id=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (json?.ok && json.print_label_handler) { const mode = clean(json.print_label_handler).toUpperCase() === "VALIDASI" ? "VALIDASI" : "MEDIS"; setLocal(mode, sessionId); return mode; }
  } catch {}
  return getLocal(sessionId);
}
function ensureSessionField() {
  if (!isSessionPage() || document.getElementById("hha-print-mode-v126")) return;
  const container = findInfoSessionContainer(); if (!container) return;
  const box = document.createElement("div"); box.id = "hha-print-mode-v126"; box.style.gridColumn = "1 / -1"; box.style.marginTop = "14px"; box.style.padding = "16px"; box.style.border = "1px solid #e2e8f0"; box.style.borderRadius = "22px"; box.style.background = "#fff";
  const label = document.createElement("div"); label.textContent = "Petugas Print Label"; label.style.fontSize = "15px"; label.style.fontWeight = "950"; label.style.marginBottom = "8px";
  const select = document.createElement("select"); select.style.minHeight = "54px"; select.style.border = "1px solid #e2e8f0"; select.style.borderRadius = "18px"; select.style.padding = "0 16px"; select.style.fontWeight = "850"; select.style.background = "#fff"; select.style.width = "100%";
  select.innerHTML = '<option value="MEDIS">Dokter / Medis</option><option value="VALIDASI">Tim Validasi</option>'; select.value = getLocal();
  const note = document.createElement("div"); note.textContent = "Jika pilih Tim Validasi, dokter tidak print label. Print dilakukan di stage Tim Validasi."; note.style.marginTop = "8px"; note.style.fontSize = "12px"; note.style.fontWeight = "800"; note.style.color = "#64748b";
  select.addEventListener("change", () => { const mode = select.value === "VALIDASI" ? "VALIDASI" : "MEDIS"; const sessionId = getSessionId(); setLocal(mode, sessionId); saveMode(mode, sessionId); });
  box.appendChild(label); box.appendChild(select); box.appendChild(note); container.appendChild(box);
}
function finalButton() { return (Array.from(document.querySelectorAll("button")) as HTMLButtonElement[]).find((b) => /Selesai Dokter|Done\s*\+\s*Print|Print Semua/i.test(textOf(b))) || null; }
function findParticipantSelect() {
  return (Array.from(document.querySelectorAll("select")) as HTMLSelectElement[]).find((s) => /^A-\d+/i.test(textOf(s)) || /CALLED|IN_PROGRESS|WAITING|PENDING/i.test(textOf(s))) || null;
}
async function sendToValidation() {
  const ps = findParticipantSelect(); const raw = clean(ps?.value || ""); const id = Number(raw);
  if (!Number.isFinite(id) || id <= 0) throw new Error("ID peserta tidak terbaca. Pilih peserta ulang.");
  const res = await fetch("/api/vaccination/validation", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify({ id, action: "SEND_TO_VALIDATION" }) });
  const json = await res.json().catch(() => ({})); if (!res.ok || !json.ok) throw new Error(json.message || "Gagal mengirim ke Tim Validasi."); return json;
}
async function ensureAdministerRouting() {
  if (!isAdministerPage()) return; const mode = await getMode(getSessionId()); const btn = finalButton(); if (!btn) return;
  if (mode === "VALIDASI") { btn.textContent = "Selesai Dokter - Kirim ke Tim Validasi"; btn.title = "Session ini memakai Tim Validasi untuk print label."; btn.setAttribute("data-hha-validasi-mode", "1"); }
  else if (btn.getAttribute("data-hha-validasi-mode") === "1") { btn.textContent = "Selesai Dokter + Print Semua Sticker"; btn.removeAttribute("data-hha-validasi-mode"); }
}
function installClick() {
  if (!isAdministerPage() || (window as any).__hhaValidationClickV126) return; (window as any).__hhaValidationClickV126 = true;
  document.addEventListener("click", async (event) => {
    const button = (event.target as HTMLElement | null)?.closest("button") as HTMLButtonElement | null;
    if (!button || button.getAttribute("data-hha-validasi-mode") !== "1") return;
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    const old = button.textContent || ""; button.disabled = true; button.textContent = "Mengirim ke Tim Validasi...";
    try { await sendToValidation(); button.textContent = "Terkirim ke Tim Validasi"; window.alert("Peserta dikirim ke Tim Validasi. Tidak ada popup print di dokter."); window.setTimeout(() => window.location.reload(), 900); }
    catch (error: any) { button.disabled = false; button.textContent = old; window.alert(error?.message || "Gagal mengirim ke Tim Validasi."); }
  }, true);
}
export default function VaccinationPrintLabelRouting() {
  useEffect(() => {
    if (!isVaccinationPath()) return; let cancelled = false; const delays = [150, 500, 1200, 2500, 4500];
    const run = () => { if (cancelled) return; ensureSessionField(); ensureAdministerRouting(); installClick(); };
    const timers = delays.map((d) => window.setTimeout(run, d));
    const onChange = () => window.setTimeout(run, 120); document.addEventListener("change", onChange, true);
    return () => { cancelled = true; timers.forEach((t) => window.clearTimeout(t)); document.removeEventListener("change", onChange, true); };
  }, []);
  return null;
}
