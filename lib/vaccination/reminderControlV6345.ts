// V6345 Vaccination-only reminder controls. Requires separate reviewed SQL migration.
// Missing control table keeps legacy scheduler active; UI returns available=false.
const DEFAULT_STAGES = ["H7", "H3", "H1", "H0"];
export type ReminderControl = {
  available: boolean;
  paused: boolean;
  stages: string[];
  companies: string[];
  vaccines: string[];
  emailSubject: string;
  emailBody: string;
  updatedAt: string | null;
};
export const DEFAULT_REMINDER_CONTROL: ReminderControl = {
  available: false, paused: false, stages: DEFAULT_STAGES,
  companies: [], vaccines: [], emailSubject: "", emailBody: "", updatedAt: null,
};
function text(value: unknown) { return String(value ?? "").trim(); }
export async function readReminderControlV6345(supabase: any): Promise<ReminderControl> {
  const result = await supabase.from("vaccination_reminder_controls_v6345")
    .select("id,paused,enabled_stages,enabled_companies,enabled_vaccines,email_subject,email_body,updated_at")
    .eq("id", 1).maybeSingle();
  if (result.error) {
    const code = text(result.error.code);
    const message = text(result.error.message);
    if (["42P01", "PGRST205", "PGRST116"].includes(code) || /relation .* does not exist|could not find the table/i.test(message)) {
      return { ...DEFAULT_REMINDER_CONTROL };
    }
    throw new Error(`Gagal membaca kontrol reminder: ${message}`);
  }
  if (!result.data) return { ...DEFAULT_REMINDER_CONTROL };
  const row = result.data;
  return {
    available: true,
    paused: row.paused === true,
    stages: Array.isArray(row.enabled_stages) ? row.enabled_stages.map(text) : DEFAULT_STAGES,
    companies: Array.isArray(row.enabled_companies) ? row.enabled_companies.map(text) : [],
    vaccines: Array.isArray(row.enabled_vaccines) ? row.enabled_vaccines.map(text) : [],
    emailSubject: text(row.email_subject), emailBody: text(row.email_body),
    updatedAt: text(row.updated_at) || null,
  };
}
export function reminderEnabledV6345(control: ReminderControl, row: any): boolean {
  if (!control.available) return true;
  if (control.paused) return false;
  const stage = text(row?.reminder_stage).toUpperCase();
  if (!control.stages.includes(stage)) return false;
  if (control.companies.length && !control.companies.includes(text(row?.company_name))) return false;
  if (control.vaccines.length && !control.vaccines.includes(text(row?.vaccine_name))) return false;
  return true;
}
export function reminderControlDisabledReasonV6345(control: ReminderControl, row: any): string {
  if (control.paused) return "Semua pengiriman sedang dihentikan admin.";
  if (!reminderEnabledV6345(control, row)) return "Reminder dikecualikan oleh filter admin (tahap/perusahaan/vaksin).";
  return "";
}
