"use client";

import { useEffect } from "react";

function isVaccinationQueuePage() {
  if (typeof window === "undefined") return false;

  const path = window.location.pathname;
  return path.includes("/vaccination/queue") && !path.includes("/vaccination/public");
}

function cleanDecodeText(value: string) {
  return String(value ?? "")
    .replace(/Ãƒâ€šÃ‚Â·/g, " - ")
    .replace(/Ãƒâ€š/g, "")
    .replace(/Ã‚Â·/g, " - ")
    .replace(/Ã‚/g, "")
    .replace(/Ã¢â‚¬Â¢/g, " - ")
    .replace(/Ã¢â‚¬â€œ/g, "-")
    .replace(/Ã¢â‚¬â€/g, "-")
    .replace(/Ã¢â‚¬Ëœ|Ã¢â‚¬â„¢/g, "'")
    .replace(/Ã¢â‚¬Å“|Ã¢â‚¬ï¿½/g, '"')
    .replace(/Ã¢â€žÂ¢/g, "")
    .replace(/Ã¢ËœÂ°/g, "â˜°")
    .replace(/Ã°Å¸â€â€™/g, "ðŸ”’")
    .replace(/Ã°Å¸â€/g, "ðŸ”’")
    .replace(/Ã°Å¸Å¡/g, "")
    .replace(/â”¬â•–/g, " - ")
    .replace(/\s+[-Â·]\s+/g, " - ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function shouldSkip(element: Element | null) {
  if (!element) return false;
  const tag = element.tagName;
  return tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "TEXTAREA";
}

function cleanTextNode(node: Text) {
  if (shouldSkip(node.parentElement)) return;

  const before = node.nodeValue || "";
  const after = cleanDecodeText(before);

  if (before !== after) node.nodeValue = after;
}

function cleanElementAttributes(element: Element) {
  if (shouldSkip(element)) return;

  for (const attr of ["title", "aria-label", "placeholder"]) {
    const before = element.getAttribute(attr);
    if (!before) continue;

    const after = cleanDecodeText(before);
    if (before !== after) element.setAttribute(attr, after);
  }

  if (element instanceof HTMLOptionElement) {
    const before = element.textContent || "";
    const after = cleanDecodeText(before);
    if (before !== after) element.textContent = after;
  }
}

function cleanTreeOnce() {
  if (!isVaccinationQueuePage()) return;

  const root = document.body;
  if (!root) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode();

  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      cleanTextNode(node as Text);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      cleanElementAttributes(node as Element);
    }

    node = walker.nextNode();
  }

  if (document.title) {
    const cleanTitle = cleanDecodeText(document.title);
    if (cleanTitle !== document.title) document.title = cleanTitle;
  }
}

export default function VaccinationQueueDecodeCleanup() {
  useEffect(() => {
    if (!isVaccinationQueuePage()) return;

    const delays = [80, 300, 800, 1500, 2500, 4000, 6500];
    const timers = delays.map((delay) => window.setTimeout(cleanTreeOnce, delay));

    const onFocus = () => cleanTreeOnce();
    const onChange = () => window.setTimeout(cleanTreeOnce, 120);

    window.addEventListener("focus", onFocus);
    document.addEventListener("change", onChange, true);

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("change", onChange, true);
    };
  }, []);

  return null;
}
