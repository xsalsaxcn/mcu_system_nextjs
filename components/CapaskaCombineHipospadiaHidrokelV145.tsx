"use client";

import { useEffect } from "react";

function norm(value: any) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isInputPage() {
  return typeof window !== "undefined" && window.location.pathname.includes("/input");
}

function isPenyakitDalamVisible() {
  const text = norm(document.body?.textContent || "");
  return /penyakit dalam|pemeriksaan kesehatan penyakit dalam|form penyakit dalam/.test(text);
}

function isQuestionCard(el: HTMLElement) {
  const radios = el.querySelectorAll('input[type="radio"]').length;
  const text = norm(el.textContent || "");

  return radios >= 2 && text.length < 900 && /normal/.test(text) && /tidak normal/.test(text);
}

function hasHipospadia(el: HTMLElement) {
  return /hipospadia/.test(norm(el.textContent || ""));
}

function hasHidrokel(el: HTMLElement) {
  return /hidrokel/.test(norm(el.textContent || ""));
}

function findDirectQuestionCards() {
  const nodes = Array.from(document.querySelectorAll("div,section,fieldset,article")) as HTMLElement[];
  const candidates = nodes.filter(isQuestionCard);

  return candidates
    .filter((candidate) => !candidates.some((other) => other !== candidate && candidate.contains(other)))
    .sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return ar.top + window.scrollY - (br.top + window.scrollY);
    });
}

function labelText(input: HTMLInputElement) {
  return norm(input.closest("label")?.textContent || input.value || "");
}

function optionKey(input: HTMLInputElement) {
  const text = labelText(input);
  if (/tidak normal|abnormal|\(\+\)|positif|positive/.test(text)) return "tidak-normal";
  if (/normal|tidak ada|\(-\)|negatif|negative/.test(text)) return "normal";
  return text;
}

function setNativeChecked(input: HTMLInputElement) {
  const proto = Object.getPrototypeOf(input);
  const descriptor = Object.getOwnPropertyDescriptor(proto, "checked");

  if (descriptor?.set) descriptor.set.call(input, true);
  else input.checked = true;

  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function relabelHipospadiaCard(card: HTMLElement) {
  const elements = Array.from(card.querySelectorAll("div,span,p,h1,h2,h3,h4,h5,h6,label")) as HTMLElement[];

  const exactLabel = elements
    .filter((el) => norm(el.textContent || "") === "hipospadia")
    .sort((a, b) => (a.textContent || "").length - (b.textContent || "").length)[0];

  if (exactLabel) {
    exactLabel.textContent = "Hipospadia Hidrokel";
    exactLabel.setAttribute("data-hha-combined-hipospadia-hidrokel-label-v145", "1");
    return;
  }

  const fallback = elements
    .filter((el) => {
      const text = norm(el.textContent || "");
      return text.includes("hipospadia") && text.length < 80;
    })
    .sort((a, b) => (a.textContent || "").length - (b.textContent || "").length)[0];

  if (fallback) {
    fallback.textContent = "Hipospadia Hidrokel";
    fallback.setAttribute("data-hha-combined-hipospadia-hidrokel-label-v145", "1");
  }
}

function syncHiddenHidrokel(visibleHipospadia: HTMLElement, hiddenHidrokel: HTMLElement) {
  const selected = (Array.from(visibleHipospadia.querySelectorAll('input[type="radio"]')) as HTMLInputElement[]).find((input) => input.checked);
  if (!selected) return;

  const key = optionKey(selected);

  const target = (Array.from(hiddenHidrokel.querySelectorAll('input[type="radio"]')) as HTMLInputElement[]).find((input) => optionKey(input) === key);
  if (target && !target.checked) setNativeChecked(target);
}

function combineHipospadiaHidrokel() {
  if (!isInputPage() || !isPenyakitDalamVisible()) return;

  const cards = findDirectQuestionCards();
  const hipospadiaCard = cards.find((card) => hasHipospadia(card));
  const hidrokelCard = cards.find((card) => hasHidrokel(card) && card !== hipospadiaCard);

  if (!hipospadiaCard || !hidrokelCard) return;

  relabelHipospadiaCard(hipospadiaCard);

  hipospadiaCard.setAttribute("data-hha-combined-hipospadia-hidrokel-visible-v145", "1");
  hipospadiaCard.style.removeProperty("display");
  hipospadiaCard.style.removeProperty("visibility");

  hidrokelCard.setAttribute("data-hha-combined-hipospadia-hidrokel-hidden-v145", "1");
  hidrokelCard.style.setProperty("display", "none", "important");
  hidrokelCard.style.setProperty("visibility", "hidden", "important");

  syncHiddenHidrokel(hipospadiaCard, hidrokelCard);
}

export default function CapaskaCombineHipospadiaHidrokelV145() {
  useEffect(() => {
    if (!isInputPage()) return;

    let disposed = false;

    const run = () => {
      if (!disposed) combineHipospadiaHidrokel();
    };

    const timers = [50, 150, 300, 700, 1200, 2200, 4000, 7000].map((delay) => window.setTimeout(run, delay));

    const observer = new MutationObserver(() => {
      window.setTimeout(run, 30);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "checked", "value"],
    });

    const onEvent = () => window.setTimeout(run, 40);
    document.addEventListener("click", onEvent, true);
    document.addEventListener("change", onEvent, true);
    window.addEventListener("focus", onEvent);

    return () => {
      disposed = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      observer.disconnect();
      document.removeEventListener("click", onEvent, true);
      document.removeEventListener("change", onEvent, true);
      window.removeEventListener("focus", onEvent);
    };
  }, []);

  return null;
}
