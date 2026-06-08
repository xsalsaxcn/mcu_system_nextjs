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

function textOf(element: Element | null) {
  return String(element?.textContent || "").replace(/\s+/g, " ").trim();
}

function isInputPage() {
  return typeof window !== "undefined" && window.location.pathname.includes("/input");
}

function isThtForm() {
  const body = norm(document.body?.textContent || "");
  return /form kesehatan tht|pemeriksaan kesehatan tht|kesehatan tht/.test(body);
}

function isRhinitisLividaeBlock(element: HTMLElement) {
  const text = norm(element.textContent || "");
  const radios = element.querySelectorAll('input[type="radio"]').length;

  return (
    radios >= 2 &&
    text.length < 900 &&
    /rhinitis|rinitis/.test(text) &&
    /lividae|divide|dividae/.test(text) &&
    /negatif|negative|\(-\)/.test(text) &&
    /positif|positive|\(\+\)/.test(text)
  );
}

function findRhinitisBlocks() {
  const nodes = Array.from(document.querySelectorAll("div,section,fieldset,article")) as HTMLElement[];
  const candidates = nodes.filter(isRhinitisLividaeBlock);

  // Keep the smallest/innermost matching cards only, not the whole form.
  const innermost = candidates.filter((candidate) => {
    return !candidates.some((other) => other !== candidate && candidate.contains(other));
  });

  return innermost.sort((a, b) => {
    const ay = a.getBoundingClientRect().top + window.scrollY;
    const by = b.getBoundingClientRect().top + window.scrollY;
    return ay - by;
  });
}

function optionKeyFromInput(input: HTMLInputElement) {
  const labelText = norm(input.closest("label")?.textContent || input.value || "");
  if (/negatif|negative|\(-\)/.test(labelText)) return "negatif";
  if (/positif|positive|\(\+\)/.test(labelText)) return "positif";
  return norm(input.value || labelText);
}

function setNativeChecked(input: HTMLInputElement, checked: boolean) {
  const prototype = Object.getPrototypeOf(input);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "checked");

  if (descriptor?.set) {
    descriptor.set.call(input, checked);
  } else {
    input.checked = checked;
  }

  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function syncHiddenDuplicate(firstBlock: HTMLElement, duplicateBlocks: HTMLElement[]) {
  const checkedSource = Array.from(firstBlock.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
  const source = checkedSource.find((input) => input.checked);
  if (!source) return;

  const key = optionKeyFromInput(source);

  for (const block of duplicateBlocks) {
    const inputs = Array.from(block.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
    const target = inputs.find((input) => optionKeyFromInput(input) === key);
    if (target && !target.checked) {
      setNativeChecked(target, true);
    }
  }
}

function hideDuplicateRhinitis() {
  if (!isInputPage() || !isThtForm()) return;

  const blocks = findRhinitisBlocks();
  if (blocks.length <= 1) return;

  const first = blocks[0];
  const duplicates = blocks.slice(1);

  first.removeAttribute("data-hha-hidden-duplicate-rhinitis-v141");
  first.style.removeProperty("display");
  first.style.removeProperty("visibility");

  for (const block of duplicates) {
    block.setAttribute("data-hha-hidden-duplicate-rhinitis-v141", "1");
    block.style.display = "none";
  }

  syncHiddenDuplicate(first, duplicates);
}

export default function CapaskaHideDuplicateThtRhinitis() {
  useEffect(() => {
    let cancelled = false;

    const run = () => {
      if (!cancelled) hideDuplicateRhinitis();
    };

    const timers = [80, 250, 600, 1200, 2500, 4500].map((delay) => window.setTimeout(run, delay));

    const onChange = () => window.setTimeout(run, 50);
    const onClick = () => window.setTimeout(run, 80);

    document.addEventListener("change", onChange, true);
    document.addEventListener("click", onClick, true);

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  return null;
}
