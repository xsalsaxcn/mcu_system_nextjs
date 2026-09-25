"use client";

import { useEffect } from "react";

function isVaccinationQueuePage() {
  if (typeof window === "undefined") return false;

  const path = window.location.pathname;
  return path.includes("/vaccination/queue") && !path.includes("/vaccination/public");
}

const VACCINATION_QUEUE_MOJIBAKE_REPLACEMENTS: Array<[string, string]> = [
  ["\u00C3\u0192\u00E2\u20AC\u0161\u00C3\u201A\u00C2\u00B7", " · "],
  ["\u00C3\u201A\u00C2\u00B7", " · "],
  ["\u00C2\u00B7", " · "],
  ["\u00C3\u0192\u00E2\u20AC\u0161", ""],
  ["\u00C3\u201A", ""],
  ["\u00C3\u00A2\u00E2\u201A\u00AC\u00C2\u00A2", " - "],
  ["\u00E2\u20AC\u00A2", " - "],
  ["\u00C3\u00A2\u00E2\u201A\u00AC\u00E2\u20AC\u0153", "-"],
  ["\u00E2\u20AC\u201C", "-"],
  ["\u00C3\u00A2\u00E2\u201A\u00AC\u00E2\u20AC\u009D", "-"],
  ["\u00E2\u20AC\u201D", "-"],
  ["\u00C3\u00A2\u00E2\u201A\u00AC\u00CB\u0153", "'"],
  ["\u00C3\u00A2\u00E2\u201A\u00AC\u00E2\u201E\u00A2", "'"],
  ["\u00E2\u20AC\u2122", "'"],
  ["\u00C3\u00A2\u00E2\u201A\u00AC\u00C5\u201C", "\""],
  ["\u00C3\u00A2\u00E2\u201A\u00AC\u00EF\u00BF\u00BD", "\""],
  ["\u00E2\u20AC\u0153", "\""],
  ["\u00E2\u20AC\u009D", "\""],
  ["\u00C3\u00A2\u00E2\u20AC\u017E\u00C2\u00A2", ""],
  ["\u00C3\u00A2\u00CB\u0153\u00C2\u00B0", "☰"],
  ["\u00E2\u02DC\u00B0", "☰"],
  ["\u00C3\u00B0\u00C5\u00B8\u00E2\u20AC\u009D\u00E2\u20AC\u2122", "🔒"],
  ["\u00C3\u00B0\u00C5\u00B8\u00E2\u20AC\u009D", "🔒"],
  ["\u00F0\u0178\u201D\u2019", "🔒"],
  ["\u00C3\u00B0\u00C5\u00B8\u00C5\u00A1", ""],
  ["\u00E2\u201D\u00AC\u00E2\u2022\u2013", " - "],
];

function cleanDecodeText(value: string) {
  let text = String(value ?? "");

  for (const [bad, replacement] of VACCINATION_QUEUE_MOJIBAKE_REPLACEMENTS) {
    if (text.includes(bad)) text = text.split(bad).join(replacement);
  }

  return text
    .replace(/\s+·\s+/g, " · ")
    .replace(/\s+-\s+/g, " - ")
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
