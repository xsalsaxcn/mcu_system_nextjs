export function historyText(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text || ["null", "undefined", "nan", "-", "—", "#n/a", "#error!"].includes(text.toLowerCase())) return "";
  return text.replace(/\s+/g, " ").trim();
}

export function historyCompanyKey(value: unknown) {
  return historyText(value)
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-") || "unknown-company";
}

export function historyNameKey(value: unknown) {
  return historyText(value)
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function historyIdentityKey(value: unknown) {
  const normalized = historyText(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (/^\d+$/.test(normalized)) return normalized.replace(/^0+(?=\d)/, "");
  return normalized;
}

export function historyEmailKey(value: unknown) {
  const text = historyText(value).toLowerCase();
  if (!text || !text.includes("@")) return "";
  return text;
}

export function historyPhone(value: unknown) {
  const text = historyText(value);
  if (!text) return "";
  return text.replace(/[^0-9+]/g, "");
}

export function historyYear(value: unknown) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1900 && n <= 2200 ? n : null;
}

export function historyDateOnly(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);

  if (typeof value === "number" && Number.isFinite(value) && value > 20000 && value < 100000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    epoch.setUTCDate(epoch.getUTCDate() + Math.floor(value));
    return epoch.toISOString().slice(0, 10);
  }

  const text = historyText(value);
  if (!text) return null;

  if (/^\d+(?:\.0+)?$/.test(text)) {
    const serial = Number(text);
    if (Number.isFinite(serial) && serial > 20000 && serial < 100000) {
      const epoch = new Date(Date.UTC(1899, 11, 30));
      epoch.setUTCDate(epoch.getUTCDate() + Math.floor(serial));
      return epoch.toISOString().slice(0, 10);
    }
  }

  const iso = text.match(/\b(19|20)\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/);
  if (iso) {
    const normalized = iso[0].replace(/\//g, "-");
    const d = new Date(`${normalized}T00:00:00Z`);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  const dmy = text.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-]((?:19|20)\d{2})\b/);
  if (dmy) {
    const d = new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])));
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  const months: Record<string, number> = {
    jan: 0, january: 0, januari: 0,
    feb: 1, february: 1, februari: 1,
    mar: 2, march: 2, maret: 2,
    apr: 3, april: 3,
    may: 4, mei: 4,
    jun: 5, june: 5, juni: 5,
    jul: 6, july: 6, juli: 6,
    aug: 7, august: 7, agustus: 7, agu: 7,
    sep: 8, sept: 8, september: 8,
    oct: 9, october: 9, oktober: 9, okt: 9,
    nov: 10, november: 10,
    dec: 11, december: 11, desember: 11, des: 11,
  };
  const named = text.toLowerCase().match(/\b(\d{1,2})\s+([a-z]+)\s+((?:19|20)\d{2})\b/);
  if (named && months[named[2]] != null) {
    const d = new Date(Date.UTC(Number(named[3]), months[named[2]], Number(named[1])));
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime()) && parsed.getUTCFullYear() >= 1900) return parsed.toISOString().slice(0, 10);
  return null;
}

export function historyServiceCategory(service: unknown, brand?: unknown) {
  const text = `${historyText(service)} ${historyText(brand)}`.toLowerCase();
  if (/vaksin|vaccin|influenza|dengue|typh|mening|hepat|pneumo|hpv|gardasil/.test(text)) return "VACCINATION";
  if (/vitamin|injeksi|injection|infus|infusion/.test(text)) return "INJECTION";
  return "OTHER_SERVICE";
}

export function historyUserLabel(user: any) {
  return historyText(user?.email || user?.name || user?.id) || "system";
}
