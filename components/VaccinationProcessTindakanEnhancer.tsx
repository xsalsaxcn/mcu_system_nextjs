"use client";

import { useEffect } from "react";

function isAdministerPage() {
  if (typeof window === "undefined") return false;
  return window.location.pathname.includes("/vaccination/administer");
}

function optionText(select: HTMLSelectElement | null) {
  if (!select) return "";
  return select.options[select.selectedIndex]?.textContent?.trim() || "";
}

function selectedValue(select: HTMLSelectElement | null) {
  if (!select) return "";
  return String(select.value || "").trim();
}

function findAdministerSelects() {
  const selects = Array.from(document.querySelectorAll("select")) as HTMLSelectElement[];

  const participantSelect =
    selects.find((select) => {
      const text = optionText(select);
      return /^A-\d+/i.test(text) || /-.*(DONE|NOT DONE|IN_PROGRESS|WAITING|DOKTER|DIPANGGIL)/i.test(text);
    }) || selects[1] || null;

  const sessionSelect =
    selects.find((select) => {
      const text = optionText(select);
      return /HEALTHDAY|VAKSIN|BINUS|SESSION/i.test(text);
    }) || selects[0] || null;

  return { participantSelect, sessionSelect };
}

function parseQueueNumber(text: string) {
  const match = String(text || "").match(/\b[A-Z]-\d+\b/i);
  return match ? match[0].toUpperCase() : "";
}

function hasValidParticipant(select: HTMLSelectElement | null) {
  const text = optionText(select);
  const value = selectedValue(select);
  return Boolean(value || parseQueueNumber(text));
}

function ensureButton() {
  if (!isAdministerPage()) return;

  if (document.getElementById("hha-proses-tindakan-button")) return;

  const { participantSelect } = findAdministerSelects();
  if (!participantSelect) return;

  const host =
    participantSelect.closest("section") ||
    participantSelect.closest(".card") ||
    participantSelect.closest("div") ||
    document.body;

  const wrapper = document.createElement("div");
  wrapper.id = "hha-proses-tindakan-button";
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.gap = "10px";
  wrapper.style.marginTop = "12px";
  wrapper.style.flexWrap = "wrap";

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Proses Tindakan";
  button.style.border = "0";
  button.style.borderRadius = "16px";
  button.style.padding = "13px 18px";
  button.style.fontWeight = "900";
  button.style.color = "#ffffff";
  button.style.background = "linear-gradient(135deg, #10b981, #059669)";
  button.style.boxShadow = "0 10px 22px rgba(16, 185, 129, 0.22)";
  button.style.cursor = "pointer";

  const note = document.createElement("span");
  note.textContent = "Klik saat dokter mulai proses tindakan.";
  note.style.fontSize = "13px";
  note.style.fontWeight = "700";
  note.style.color = "#64748b";

  async function run() {
    const { participantSelect, sessionSelect } = findAdministerSelects();
    const participantText = optionText(participantSelect);
    const participantValue = selectedValue(participantSelect);
    const sessionValue = selectedValue(sessionSelect);
    const queueNumber = parseQueueNumber(participantText);

    if (!hasValidParticipant(participantSelect)) {
      note.textContent = "Pilih peserta dulu.";
      note.style.color = "#dc2626";
      return;
    }

    button.disabled = true;
    button.textContent = "Memproses...";
    note.textContent = "Mengubah status antrian ke Dokter...";
    note.style.color = "#64748b";

    try {
      const numericId = Number(participantValue);
      const payload: any = {
        queue_number: queueNumber,
        session_id: sessionValue,
      };

      if (Number.isFinite(numericId) && numericId > 0) {
        payload.registration_id = numericId;
      }

      const res = await fetch("/api/vaccination/queue/process-tindakan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.ok) {
        throw new Error(json.message || "Gagal mengubah status antrian.");
      }

      note.textContent = "Status antrian: Dokter / Proses Tindakan.";
      note.style.color = "#047857";
      button.textContent = "Sudah Proses Tindakan";

      window.dispatchEvent(new CustomEvent("vaccination-queue-updated", { detail: json }));
      setTimeout(() => window.location.reload(), 700);
    } catch (error: any) {
      note.textContent = error?.message || "Gagal mengubah status antrian.";
      note.style.color = "#dc2626";
      button.disabled = false;
      button.textContent = "Proses Tindakan";
    }
  }

  button.addEventListener("click", run);

  wrapper.appendChild(button);
  wrapper.appendChild(note);

  const participantCard = participantSelect.closest("div")?.parentElement;
  if (participantCard) {
    participantCard.appendChild(wrapper);
  } else {
    host.appendChild(wrapper);
  }
}

export default function VaccinationProcessTindakanEnhancer() {
  useEffect(() => {
    if (!isAdministerPage()) return;

    const run = () => ensureButton();
    run();

    const observer = new MutationObserver(run);
    observer.observe(document.body, { childList: true, subtree: true });

    const interval = window.setInterval(run, 1500);

    return () => {
      observer.disconnect();
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
