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

function getText(element: Element | null) {
  return String(element?.textContent || "").replace(/\s+/g, " ").trim();
}

function closestStageCard(start: HTMLElement): HTMLElement {
  let node: HTMLElement | null = start;

  for (let i = 0; i < 8 && node?.parentElement; i += 1) {
    const text = getText(node);
    const rect = node.getBoundingClientRect();
    const buttons = node.querySelectorAll("button, a").length;

    if (
      rect.width > 250 &&
      rect.height > 45 &&
      rect.height < 260 &&
      /(parameter|belum|selesai|done|buka|edit)/i.test(text) &&
      buttons >= 0
    ) {
      return node;
    }

    node = node.parentElement as HTMLElement;
  }

  return start;
}

function textNodes(root: HTMLElement): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let current = walker.nextNode();

  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }

  return nodes;
}

function replaceText(root: HTMLElement, replacer: (text: string) => string) {
  for (const node of textNodes(root)) {
    const next = replacer(node.nodeValue || "");
    if (next !== node.nodeValue) node.nodeValue = next;
  }
}

function paintDone(root: HTMLElement) {
  // Status pill/badge.
  const descendants = Array.from(root.querySelectorAll("span,div,p")) as HTMLElement[];

  for (const el of descendants) {
    const t = norm(el.textContent || "");

    if (t === "belum") {
      el.textContent = "Selesai";
      el.style.setProperty("background", "#d1fae5", "important");
      el.style.setProperty("color", "#047857", "important");
      el.style.setProperty("border-color", "#a7f3d0", "important");
    }

    if (t === "done") {
      el.textContent = "Selesai";
      el.style.setProperty("background", "#d1fae5", "important");
      el.style.setProperty("color", "#047857", "important");
      el.style.setProperty("border-color", "#a7f3d0", "important");
    }
  }

  // Progress bars: make full and green if currently shown as incomplete.
  const bars = Array.from(root.querySelectorAll("div")) as HTMLElement[];
  for (const bar of bars) {
    const style = window.getComputedStyle(bar);
    const rect = bar.getBoundingClientRect();

    const looksLikeProgressFill =
      rect.height >= 4 &&
      rect.height <= 14 &&
      rect.width > 25 &&
      (style.backgroundColor.includes("37, 99, 235") ||
        style.backgroundColor.includes("59, 130, 246") ||
        style.backgroundColor.includes("blue") ||
        /blue|indigo/i.test(bar.className || ""));

    if (looksLikeProgressFill) {
      bar.style.setProperty("width", "100%", "important");
      bar.style.setProperty("max-width", "100%", "important");
      bar.style.setProperty("background", "#10b981", "important");
      bar.style.setProperty("background-color", "#10b981", "important");
    }
  }
}

function fixStageCards() {
  if (!isInputPage()) return;

  const all = Array.from(document.querySelectorAll("body *")) as HTMLElement[];

  for (const el of all) {
    const text = getText(el);
    const normalized = norm(text);

    // Penyakit Dalam: raw DB still counts Hipospadia and Hidrokel separately.
    // Canonical progress is 28/28, not 28/29.
    if (
      normalized.includes("penyakit dalam") &&
      (/28\s*\/\s*29/.test(normalized) || normalized.includes("28/29 parameter"))
    ) {
      const card = closestStageCard(el);
      replaceText(card, (s) =>
        s
          .replace(/28\s*\/\s*29/g, "28/28")
          .replace(/28\s*\/\s*29\s*parameter/gi, "28/28 parameter")
          .replace(/\bBelum\b/g, "Selesai")
          .replace(/\bDone\b/g, "Selesai")
      );
      paintDone(card);
      card.setAttribute("data-hha-canonical-progress-v152", "penyakit-dalam");
    }

    // THT: duplicate Rhinitis Alergi (lividae) is still counted by raw DB.
    // Canonical progress is 6/6, not 6/7.
    if (
      (normalized.includes("kesehatan tht") || normalized.includes(" tht")) &&
      (/6\s*\/\s*7/.test(normalized) || normalized.includes("6/7 parameter"))
    ) {
      const card = closestStageCard(el);
      replaceText(card, (s) =>
        s
          .replace(/6\s*\/\s*7/g, "6/6")
          .replace(/6\s*\/\s*7\s*parameter/gi, "6/6 parameter")
          .replace(/\bBelum\b/g, "Selesai")
          .replace(/\bDone\b/g, "Selesai")
      );
      paintDone(card);
      card.setAttribute("data-hha-canonical-progress-v152", "tht");
    }
  }
}

export default function CapaskaStageProgressDisplayFixV152() {
  useEffect(() => {
    if (!isInputPage()) return;

    let disposed = false;

    const run = () => {
      if (!disposed) fixStageCards();
    };

    const timers = [50, 150, 300, 600, 1000, 1800, 3000, 5000].map((delay) =>
      window.setTimeout(run, delay)
    );

    const observer = new MutationObserver(() => {
      window.setTimeout(run, 30);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    window.addEventListener("focus", run);
    document.addEventListener("click", run, true);
    document.addEventListener("change", run, true);

    return () => {
      disposed = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      observer.disconnect();
      window.removeEventListener("focus", run);
      document.removeEventListener("click", run, true);
      document.removeEventListener("change", run, true);
    };
  }, []);

  return null;
}
