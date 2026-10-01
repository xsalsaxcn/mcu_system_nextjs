// V153.57_SESSION_QUEUE_FORM_CONFIG
// Shared pure helper for Session UI and Onsite Queue APIs.
// WhatsApp reminder is enabled ONLY when a WHATSAPP field exists in the session form.

export type OnsiteQueueFormFieldKind =
  | "participant_name"
  | "employee_id"
  | "whatsapp"
  | "email"
  | "custom_text"
  | "custom_number"
  | "custom_date";

export type OnsiteQueueFormField = {
  id: string;
  kind: OnsiteQueueFormFieldKind;
  label: string;
  placeholder?: string;
  required: boolean;
};

export const DEFAULT_ONSITE_QUEUE_FORM_CONFIG: OnsiteQueueFormField[] = [
  {
    id: "participant_name",
    kind: "participant_name",
    label: "Nama Lengkap",
    placeholder: "Nama lengkap",
    required: true,
  },
  {
    id: "employee_id",
    kind: "employee_id",
    label: "NIK Karyawan",
    placeholder: "NIK Karyawan",
    required: true,
  },
];

const ALLOWED_KINDS = new Set<OnsiteQueueFormFieldKind>([
  "participant_name",
  "employee_id",
  "whatsapp",
  "email",
  "custom_text",
  "custom_number",
  "custom_date",
]);

const UNIQUE_SYSTEM_KINDS = new Set<OnsiteQueueFormFieldKind>([
  "participant_name",
  "employee_id",
  "whatsapp",
  "email",
]);

export function onsiteQueueFieldKindLabel(kind: OnsiteQueueFormFieldKind) {
  if (kind === "participant_name") return "Nama Peserta";
  if (kind === "employee_id") return "NIK / ID Peserta";
  if (kind === "whatsapp") return "WhatsApp";
  if (kind === "email") return "Email";
  if (kind === "custom_number") return "Angka";
  if (kind === "custom_date") return "Tanggal";
  return "Text";
}

export function defaultOnsiteQueueField(
  kind: OnsiteQueueFormFieldKind,
  idSuffix = ""
): OnsiteQueueFormField {
  const suffix = idSuffix ? `_${idSuffix}` : "";
  if (kind === "participant_name") {
    return { id: `participant_name${suffix}`, kind, label: "Nama Lengkap", placeholder: "Nama lengkap", required: true };
  }
  if (kind === "employee_id") {
    return { id: `employee_id${suffix}`, kind, label: "NIK Karyawan", placeholder: "NIK Karyawan", required: true };
  }
  if (kind === "whatsapp") {
    return { id: `whatsapp${suffix}`, kind, label: "No. WhatsApp", placeholder: "08xxxxxxxxxx", required: true };
  }
  if (kind === "email") {
    return { id: `email${suffix}`, kind, label: "Email", placeholder: "nama@email.com", required: false };
  }
  if (kind === "custom_number") {
    return { id: `angka${suffix}`, kind, label: "Field Angka", placeholder: "Isi angka", required: false };
  }
  if (kind === "custom_date") {
    return { id: `tanggal${suffix}`, kind, label: "Tanggal", placeholder: "", required: false };
  }
  return { id: `field${suffix}`, kind: "custom_text", label: "Field Text", placeholder: "Isi data", required: false };
}

function parseConfig(value: unknown) {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function safeId(value: unknown, fallback: string) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return normalized || fallback;
}

function cleanText(value: unknown, fallback = "") {
  const text = String(value ?? "").trim().slice(0, 120);
  return text || fallback;
}

export function sanitizeOnsiteQueueFormConfig(
  value: unknown,
  fallbackToDefault = true
): OnsiteQueueFormField[] {
  const parsed = parseConfig(value);
  if (!Array.isArray(parsed)) {
    return fallbackToDefault
      ? DEFAULT_ONSITE_QUEUE_FORM_CONFIG.map((item) => ({ ...item }))
      : [];
  }

  const result: OnsiteQueueFormField[] = [];
  const ids = new Set<string>();
  const usedSystemKinds = new Set<OnsiteQueueFormFieldKind>();

  for (let index = 0; index < parsed.length && result.length < 12; index += 1) {
    const raw: any = parsed[index] || {};
    const kind = String(raw.kind || "") as OnsiteQueueFormFieldKind;
    if (!ALLOWED_KINDS.has(kind)) continue;

    if (UNIQUE_SYSTEM_KINDS.has(kind) && usedSystemKinds.has(kind)) continue;
    if (UNIQUE_SYSTEM_KINDS.has(kind)) usedSystemKinds.add(kind);

    const defaults = defaultOnsiteQueueField(kind, String(index + 1));
    let id = safeId(raw.id, defaults.id);
    if (ids.has(id)) id = `${id}_${index + 1}`.slice(0, 64);
    ids.add(id);

    result.push({
      id,
      kind,
      label: cleanText(raw.label, defaults.label),
      placeholder: cleanText(raw.placeholder, defaults.placeholder || ""),
      required: Boolean(raw.required),
    });
  }

  return result;
}

export function onsiteQueueFormHasWhatsApp(value: unknown) {
  return sanitizeOnsiteQueueFormConfig(value).some(
    (field) => field.kind === "whatsapp"
  );
}
