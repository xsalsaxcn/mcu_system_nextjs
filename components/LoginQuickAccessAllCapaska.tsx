"use client";

import { useEffect } from "react";

type DemoCredential = {
  label: string;
  username: string;
  password: string;
  tag?: string;
};

const CREDENTIALS: DemoCredential[] = [
  { label: "Admin", username: "admin", password: "admin123", tag: "admin" },
  { label: "Registrasi Ulang", username: "capaska_registrasi", password: "registrasi123", tag: "registrasi" },
  { label: "Operator Mata", username: "capaska_mata", password: "mata123", tag: "mata" },
  { label: "Operator Penyakit Dalam", username: "capaska_penyakitdalam", password: "pd123", tag: "penyakit dalam" },
  { label: "Operator Gigi & Mulut", username: "capaska_gigi", password: "gigi123", tag: "gigi" },
  { label: "Operator THT", username: "capaska_tht", password: "tht123", tag: "tht" },
  { label: "Operator Jantung", username: "capaska_jantung", password: "jantung123", tag: "jantung" },
  { label: "Operator Ortopedi", username: "capaska_ortopedi", password: "ortopedi123", tag: "ortopedi" },
  { label: "Operator Radiologi", username: "capaska_radiologi", password: "radiologi123", tag: "radiologi" },
];

function clean(value: any) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isLoginPage() {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname.toLowerCase();
  if (path.includes("/vaccination") || path.includes("/input") || path.includes("/registrasi")) return false;

  const text = clean(document.body?.textContent || "");
  return /username/i.test(text) && /password/i.test(text) && /masuk|login/i.test(text);
}

function setNativeValue(input: HTMLInputElement, value: string) {
  const prototype = Object.getPrototypeOf(input);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

  if (descriptor?.set) {
    descriptor.set.call(input, value);
  } else {
    input.value = value;
  }

  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function getLoginInputs() {
  const inputs = Array.from(document.querySelectorAll("input")) as HTMLInputElement[];

  const username =
    inputs.find((input) => /user|username|nama/i.test(input.name || input.id || input.placeholder || "")) ||
    inputs.find((input) => input.type !== "password" && input.type !== "hidden");

  const password =
    inputs.find((input) => input.type === "password") ||
    inputs.find((input) => /pass|password/i.test(input.name || input.id || input.placeholder || ""));

  return { username, password };
}

function findOldQuickAccessPanel() {
  const candidates = Array.from(document.querySelectorAll("div,section")) as HTMLElement[];

  return candidates
    .filter((element) => {
      const text = clean(element.textContent || "");
      return /quick access demo/i.test(text) && /operator|admin/i.test(text);
    })
    .sort((a, b) => clean(a.textContent).length - clean(b.textContent).length)[0] || null;
}

function findLoginCard() {
  const candidates = Array.from(document.querySelectorAll("div,main,section,form")) as HTMLElement[];

  return candidates
    .filter((element) => {
      const text = clean(element.textContent || "");
      const hasInputs = element.querySelectorAll("input").length >= 2;
      return hasInputs && /username/i.test(text) && /password/i.test(text) && /masuk|login/i.test(text);
    })
    .sort((a, b) => clean(a.textContent).length - clean(b.textContent).length)[0] || null;
}

function fillCredential(credential: DemoCredential) {
  const { username, password } = getLoginInputs();

  if (username) setNativeValue(username, credential.username);
  if (password) setNativeValue(password, credential.password);

  const status = document.getElementById("hha-login-quick-status-v135");
  if (status) {
    status.textContent = `Terisi: ${credential.label} (${credential.username} / ${credential.password})`;
  }
}

function createPanel() {
  const panel = document.createElement("div");
  panel.id = "hha-login-quick-access-v135";
  panel.style.marginTop = "22px";
  panel.style.border = "1px solid #e2e8f0";
  panel.style.borderRadius = "22px";
  panel.style.background = "linear-gradient(180deg,#ffffff,#f8fafc)";
  panel.style.padding = "16px";
  panel.style.boxShadow = "0 10px 30px rgba(15, 23, 42, 0.04)";

  const title = document.createElement("div");
  title.textContent = "QUICK ACCESS DEMO";
  title.style.fontSize = "12px";
  title.style.fontWeight = "900";
  title.style.letterSpacing = ".02em";
  title.style.color = "#475569";
  title.style.marginBottom = "10px";

  const grid = document.createElement("div");
  grid.style.display = "grid";
  grid.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
  grid.style.gap = "10px";

  for (const credential of CREDENTIALS) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("data-hha-login-quick", credential.username);
    button.style.textAlign = "left";
    button.style.border = "1px solid #e2e8f0";
    button.style.borderRadius = "16px";
    button.style.background = "#ffffff";
    button.style.padding = "11px 12px";
    button.style.cursor = "pointer";
    button.style.transition = "all .15s ease";
    button.style.minHeight = "68px";

    button.onmouseenter = () => {
      button.style.borderColor = "#2563eb";
      button.style.background = "#eff6ff";
      button.style.transform = "translateY(-1px)";
    };

    button.onmouseleave = () => {
      button.style.borderColor = "#e2e8f0";
      button.style.background = "#ffffff";
      button.style.transform = "translateY(0)";
    };

    const label = document.createElement("div");
    label.textContent = credential.label;
    label.style.fontSize = "13px";
    label.style.fontWeight = "900";
    label.style.color = "#0f172a";
    label.style.lineHeight = "1.15";

    const username = document.createElement("div");
    username.textContent = credential.username;
    username.style.marginTop = "5px";
    username.style.fontSize = "12px";
    username.style.fontWeight = "800";
    username.style.color = "#2563eb";
    username.style.lineHeight = "1.1";

    const password = document.createElement("div");
    password.textContent = `Password: ${credential.password}`;
    password.style.marginTop = "3px";
    password.style.fontSize = "11px";
    password.style.fontWeight = "800";
    password.style.color = "#64748b";
    password.style.lineHeight = "1.1";

    button.appendChild(label);
    button.appendChild(username);
    button.appendChild(password);
    button.addEventListener("click", () => fillCredential(credential));

    grid.appendChild(button);
  }

  const status = document.createElement("div");
  status.id = "hha-login-quick-status-v135";
  status.textContent = "Klik salah satu role untuk mengisi username dan password.";
  status.style.marginTop = "12px";
  status.style.padding = "10px 12px";
  status.style.borderRadius = "14px";
  status.style.background = "#eff6ff";
  status.style.color = "#1d4ed8";
  status.style.fontSize = "12px";
  status.style.fontWeight = "800";

  panel.appendChild(title);
  panel.appendChild(grid);
  panel.appendChild(status);

  return panel;
}

function installPanel() {
  if (!isLoginPage()) return;
  if (document.getElementById("hha-login-quick-access-v135")) return;

  const oldPanel = findOldQuickAccessPanel();
  const newPanel = createPanel();

  if (oldPanel?.parentElement) {
    oldPanel.style.display = "none";
    oldPanel.parentElement.insertBefore(newPanel, oldPanel.nextSibling);
    return;
  }

  const card = findLoginCard();
  if (card) {
    card.appendChild(newPanel);
  }
}

export default function LoginQuickAccessAllCapaska() {
  useEffect(() => {
    let cancelled = false;
    const delays = [100, 300, 700, 1400, 2500];

    const run = () => {
      if (!cancelled) installPanel();
    };

    const timers = delays.map((delay) => window.setTimeout(run, delay));

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  return null;
}


