"use client";

import { useEffect } from "react";

function isAdministerPage() {
  if (typeof window === "undefined") return false;
  return window.location.pathname.includes("/vaccination/administer");
}

function textOf(el: Element | null) {
  return String(el?.textContent || "").replace(/\s+/g, " ").trim();
}

function optionText(select: HTMLSelectElement | null) {
  if (!select) return "";
  return select.options[select.selectedIndex]?.textContent?.trim() || "";
}

function selectedValue(select: HTMLSelectElement | null) {
  if (!select) return "";
  return String(select.value || "").trim();
}

function parseQueueNumber(text: string) {
  const match = String(text || "").match(/\b[A-Z]-\d+\b/i);
  return match ? match[0].toUpperCase() : "";
}

function findAdministerSelects() {
  const explicitParticipant = document.getElementById("vaccination-administer-participant") as HTMLSelectElement | null;
  const explicitSession = document.getElementById("vaccination-administer-session") as HTMLSelectElement | null;
  const selects = Array.from(document.querySelectorAll("select")) as HTMLSelectElement[];

  const participantSelect =
    explicitParticipant ||
    selects.find((select) => {
      const first = String(select.options[0]?.textContent || "").trim();
      const text = optionText(select);
      return /Pilih peserta|nomor antrian/i.test(first) || /^A-\d+/i.test(text) || /-(WAITING|IN_PROGRESS|DONE|NOT DONE|DOKTER|DIPANGGIL)/i.test(text);
    }) ||
    null;

  const sessionSelect =
    explicitSession ||
    selects.find((select) => {
      const first = String(select.options[0]?.textContent || "").trim();
      const text = optionText(select);
      return /Pilih session/i.test(first) || /HEALTHDAY|VAKSIN|BINUS|SESSION/i.test(text);
    }) ||
    null;

  return { participantSelect, sessionSelect };
}

function hasValidParticipant(select: HTMLSelectElement | null) {
  const text = optionText(select);
  const value = selectedValue(select);
  return Boolean(value || parseQueueNumber(text));
}

function findVaccinationSection() {
  const headings = Array.from(document.querySelectorAll("h1,h2,h3,div,section"));
  const heading = headings.find((el) => /Vaksin yang Diberikan/i.test(textOf(el)));
  return (
    heading?.closest("section") ||
    heading?.closest(".card") ||
    heading?.parentElement?.parentElement ||
    heading?.parentElement ||
    null
  );
}

function setInlineInfo(message: string, tone: "info" | "success" | "error" = "info") {
  if (!isAdministerPage()) return;

  let box = document.getElementById("hha-doctor-workflow-info");
  const section = findVaccinationSection();

  if (!box) {
    box = document.createElement("div");
    box.id = "hha-doctor-workflow-info";
    box.style.margin = "10px 0 0";
    box.style.padding = "12px 14px";
    box.style.borderRadius = "14px";
    box.style.fontWeight = "800";
    box.style.fontSize = "13px";
    box.style.border = "1px solid #dbeafe";

    if (section) {
      section.insertBefore(box, section.children[1] || null);
    } else {
      document.body.prepend(box);
    }
  }

  box.textContent = message;

  if (tone === "success") {
    box.style.background = "#ecfdf5";
    box.style.color = "#047857";
    box.style.borderColor = "#bbf7d0";
  } else if (tone === "error") {
    box.style.background = "#fff1f2";
    box.style.color = "#be123c";
    box.style.borderColor = "#fecdd3";
  } else {
    box.style.background = "#eff6ff";
    box.style.color = "#1d4ed8";
    box.style.borderColor = "#bfdbfe";
  }
}

function isFinalDoctorDoneButton(button: HTMLButtonElement) {
  const txt = textOf(button);
  return /Done\s*\+\s*Print|Print Semua|Selesai Dokter|Selesaikan Tindakan/i.test(txt);
}

function isProductDoneButton(button: HTMLButtonElement) {
  const txt = textOf(button);
  if (txt !== "Done") return false;
  if (button.id === "hha-proses-tindakan-action") return false;
  if (isFinalDoctorDoneButton(button)) return false;

  const section = button.closest("section") || button.closest(".card") || button.closest("div");
  return /Vaksin|Lot|Not Done|Hapus|Tambah Vaksin/i.test(textOf(section));
}

function findProductRow(button: HTMLButtonElement) {
  let node: HTMLElement | null = button.parentElement;

  while (node && node !== document.body) {
    const txt = textOf(node);
    const hasLotOrVaccine = /Lot|Vaxigrip|Typhim|Dengvaxia|Vaksin|Not Done|Hapus/i.test(txt);
    const hasQtyOrSelect = node.querySelectorAll("select,input,button").length >= 3;

    if (hasLotOrVaccine && hasQtyOrSelect) return node;

    node = node.parentElement;
  }

  return button.parentElement;
}

function markProductDoneLocal(button: HTMLButtonElement) {
  const row = findProductRow(button);
  if (row) row.dataset.hhaProductDoneLocal = "1";

  button.textContent = "Done";
  button.disabled = true;
  button.style.opacity = "0.95";
  button.style.cursor = "default";
  button.style.background = "linear-gradient(135deg, #2563eb, #1d4ed8)";
  button.style.color = "#ffffff";
  button.title = "Produk sudah ditandai Done lokal. Print ditahan sampai Selesai Dokter.";

  const candidates = Array.from((row || document).querySelectorAll("span,div,button")) as HTMLElement[];
  for (const el of candidates) {
    if (/^Not Done$/i.test(textOf(el))) {
      el.textContent = "Done";
      el.style.background = "#ecfdf5";
      el.style.color = "#047857";
      el.style.fontWeight = "900";
    }
  }

  setInlineInfo(
    "Produk vaksin ditandai Done. Tidak print dan tidak reset. Lanjutkan sampai semua produk Done, lalu klik Selesai Dokter + Print Semua Sticker.",
    "success"
  );
}

function decorateFinalButton() {
  const buttons = Array.from(document.querySelectorAll("button")) as HTMLButtonElement[];

  for (const button of buttons) {
    if (!isFinalDoctorDoneButton(button)) continue;

    if (!button.dataset.hhaFinalDoctorButton) {
      button.dataset.hhaFinalDoctorButton = "1";
      button.textContent = "Selesai Dokter + Print Semua Sticker";
      button.title = "Klik ini setelah semua produk vaksin sudah Done. Baru di tahap ini status selesai dan print semua sticker.";
      button.style.fontWeight = "900";
    }
  }
}

function decorateProductDoneButtons() {
  const buttons = Array.from(document.querySelectorAll("button")) as HTMLButtonElement[];

  for (const button of buttons) {
    if (!isProductDoneButton(button)) continue;

    if (!button.dataset.hhaProductDoneButton) {
      button.dataset.hhaProductDoneButton = "1";
      button.title = "Tandai produk Done tanpa print. Print hanya saat Selesai Dokter.";
    }
  }
}

function updateSelectedOptionToInProgress(select: HTMLSelectElement | null) {
  if (!select) return;

  const option = select.options[select.selectedIndex];
  if (!option) return;

  const before = option.textContent || "";
  const after = before
    .replace(/WAITING/gi, "IN_PROGRESS")
    .replace(/DIPANGGIL/gi, "IN_PROGRESS")
    .replace(/DOKTER/gi, "IN_PROGRESS");

  option.textContent = after;
}

function ensureProcessButton() {
  if (!isAdministerPage()) return;

  decorateFinalButton();
  decorateProductDoneButtons();

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
  button.id = "hha-proses-tindakan-action";
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

      updateSelectedOptionToInProgress(participantSelect);
      note.textContent = "Status antrian: Dokter / Proses Tindakan.";
      note.style.color = "#047857";
      button.textContent = "Sedang Proses Tindakan";
      setInlineInfo("Data layanan pasien tetap tampil. Done produk tidak akan print/reset sampai Selesai Dokter diklik.", "success");

      window.dispatchEvent(new CustomEvent("vaccination-queue-updated", { detail: json }));
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

  const row = participantSelect.closest("div")?.parentElement || host;
  row.appendChild(wrapper);
}

function handleCaptureClick(event: MouseEvent) {
  if (!isAdministerPage()) return;

  const target = event.target as HTMLElement | null;
  const button = target?.closest("button") as HTMLButtonElement | null;
  if (!button) return;

  if (isProductDoneButton(button)) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    markProductDoneLocal(button);
    return;
  }

  if (isFinalDoctorDoneButton(button)) {
    button.textContent = "Memproses selesai dokter + print...";
    setInlineInfo("Menyelesaikan tindakan dokter dan menyiapkan print semua sticker vaksin.", "success");
  }
}

export default function VaccinationProcessTindakanEnhancer() {
  useEffect(() => {
    if (!isAdministerPage()) return;

    const run = () => ensureProcessButton();
    run();

    document.addEventListener("click", handleCaptureClick, true);

    const observer = new MutationObserver(run);
    observer.observe(document.body, { childList: true, subtree: true });

    const interval = window.setInterval(run, 1500);

    return () => {
      document.removeEventListener("click", handleCaptureClick, true);
      observer.disconnect();
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
