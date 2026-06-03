"use client";

import { useEffect } from "react";

function cleanMojibakeText(value: string) {
  return String(value ?? "")
    .replace(/\u00C3\u201A\u00C2\u00B7/g, " - ")
    .replace(/\u00C2\u00B7/g, " - ")
    .replace(/\u00C3\u201A/g, "")
    .replace(/\u00C2/g, "")
    .replace(/\u00E2\u20AC\u00A2/g, " - ")
    .replace(/\u00E2\u20AC\u201C/g, "-")
    .replace(/\u00E2\u20AC\u201D/g, "-")
    .replace(/\u00E2\u20AC\u02DC/g, "'")
    .replace(/\u00E2\u20AC\u2122/g, "'")
    .replace(/\u00E2\u20AC\u0153/g, '"')
    .replace(/\u00E2\u20AC\uFFFD/g, '"')
    .replace(/\u252C\u2556/g, " - ")
    .replace(/\s+[-\u00B7]\s+/g, " - ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function shouldSkipElement(element: Element | null) {
  if (!element) return false;
  const tag = element.tagName;
  return tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "TEXTAREA";
}

function cleanTextNode(node: Text) {
  const parent = node.parentElement;
  if (shouldSkipElement(parent)) return;

  const before = node.nodeValue || "";
  const after = cleanMojibakeText(before);

  if (before !== after) {
    node.nodeValue = after;
  }
}

function cleanElementAttributes(element: Element) {
  if (shouldSkipElement(element)) return;

  const attrs = ["title", "aria-label", "placeholder"];
  for (const attr of attrs) {
    const before = element.getAttribute(attr);
    if (!before) continue;

    const after = cleanMojibakeText(before);
    if (before !== after) element.setAttribute(attr, after);
  }

  if (element instanceof HTMLOptionElement) {
    const before = element.textContent || "";
    const after = cleanMojibakeText(before);
    if (before !== after) element.textContent = after;
  }
}

function cleanTree(root: ParentNode) {
  if (root instanceof Element) cleanElementAttributes(root);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let current = walker.nextNode();

  while (current) {
    if (current.nodeType === Node.TEXT_NODE) {
      cleanTextNode(current as Text);
    } else if (current.nodeType === Node.ELEMENT_NODE) {
      cleanElementAttributes(current as Element);
    }

    current = walker.nextNode();
  }

  if (document.title) {
    const cleanTitle = cleanMojibakeText(document.title);
    if (cleanTitle !== document.title) document.title = cleanTitle;
  }
}

export default function GlobalMojibakeDisplayFix() {
  useEffect(() => {
    const run = () => cleanTree(document.body);

    run();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData" && mutation.target.nodeType === Node.TEXT_NODE) {
          cleanTextNode(mutation.target as Text);
          continue;
        }

        for (const node of Array.from(mutation.addedNodes)) {
          if (node.nodeType === Node.TEXT_NODE) {
            cleanTextNode(node as Text);
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            cleanTree(node as Element);
          }
        }

        if (mutation.type === "attributes" && mutation.target.nodeType === Node.ELEMENT_NODE) {
          cleanElementAttributes(mutation.target as Element);
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["title", "aria-label", "placeholder"],
    });

    const interval = window.setInterval(run, 2500);

    return () => {
      observer.disconnect();
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
