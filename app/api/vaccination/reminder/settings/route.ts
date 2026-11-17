import { NextRequest } from "next/server";
import { fail, ok, requireUser, supabaseAdmin } from "../../_utils";
import { readReminderControlV6345 } from "@/lib/vaccination/reminderControlV6345";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function clean(value: unknown) { return String(value ?? "").trim(); }
const ADMIN = ["admin", "vaccination_admin", "vaccination_supervisor"];
const READ = [...ADMIN, "vaccination_report", "vaccination_validation"];
function access(req: NextRequest, write = false) {
  const user = requireUser(req);
  if (!user) return { denied: fail("Unauthorized", 401), user: null };
  const role = clean((user as any)?.role).toLowerCase();
  if (!(write ? ADMIN : READ).includes(role)) return { denied: fail("Tidak memiliki akses pengaturan reminder.", 403), user: null };
  return { denied: null, user };
}
export async function GET(req: NextRequest) {
  const auth = access(req);
  if (auth.denied) return auth.denied;
  try {
    const supabase = supabaseAdmin();
    const settings = await readReminderControlV6345(supabase);
    const options: any[] = [];
    // Display known active schedule options only; no changes to vaccine master.
    for (let start = 0; start < 5000; start += 1000) {
      const rows = await supabase.from("vaccination_reminders")
        .select("company_name,vaccine_name")
        .is("superseded_at", null)
        .order("id", { ascending: false }).range(start, start + 999);
      if (rows.error) throw new Error(rows.error.message);
      options.push(...(rows.data || []));
      if ((rows.data || []).length < 1000) break;
    }
    return ok({ settings,
      companies: [...new Set(options.map((r: any) => clean(r.company_name)).filter(Boolean))].sort(),
      vaccines: [...new Set(options.map((r: any) => clean(r.vaccine_name)).filter(Boolean))].sort(),
      scheduleRules: { email: ["H7", "H3", "H1", "H0"], whatsapp: ["H3", "H1"], timezone: "Asia/Jakarta", automaticMaxPerChannel: 3 },
      note: settings.available ? "Kontrol tersimpan di database." : "Migrasi kontrol V6345 belum aktif; pengiriman lama tidak berubah.",
    });
  } catch (e: any) { return fail(clean(e?.message || e), 500); }
}
export async function POST(req: NextRequest) {
  const auth = access(req, true);
  if (auth.denied) return auth.denied;
  try {
    const supabase = supabaseAdmin();
    const previous = await readReminderControlV6345(supabase);
    if (!previous.available) return fail("Kontrol belum diaktifkan. Migrasi database V6345 harus diuji dan disetujui lebih dulu.", 503);
    const body: any = await req.json().catch(() => ({}));
    const operation = clean(body?.operation);
    let changes: Record<string, any> = {};
    if (operation === "pause" || operation === "resume") {
      changes = { paused: operation === "pause" };
    } else if (operation === "save") {
      const stages = body?.stages;
      const companies = body?.companies;
      const vaccines = body?.vaccines;
      if (!Array.isArray(stages) || !stages.length || stages.some((s: unknown) => !["H7", "H3", "H1", "H0"].includes(clean(s)))) return fail("Pilih tahap reminder yang valid.", 400);
      if (!Array.isArray(companies) || companies.length > 150 || companies.some((s: unknown) => clean(s).length > 120)) return fail("Daftar perusahaan tidak valid.", 400);
      if (!Array.isArray(vaccines) || vaccines.length > 150 || vaccines.some((s: unknown) => clean(s).length > 120)) return fail("Daftar vaksin tidak valid.", 400);
      const subject = clean(body?.emailSubject);
      const emailBody = clean(body?.emailBody);
      if (subject.length > 150 || emailBody.length > 4000) return fail("Teks email melebihi batas.", 400);
      changes = {
        enabled_stages: [...new Set(stages.map(clean))],
        enabled_companies: [...new Set(companies.map(clean).filter(Boolean))],
        enabled_vaccines: [...new Set(vaccines.map(clean).filter(Boolean))],
        email_subject: subject, email_body: emailBody,
      };
    } else return fail("Operasi pengaturan reminder tidak valid.", 400);
    const result = await supabase.from("vaccination_reminder_controls_v6345")
      .update({ ...changes, updated_at: new Date().toISOString(), updated_by: clean((auth.user as any)?.email || (auth.user as any)?.id || "admin").slice(0, 160) })
      .eq("id", 1).select("id").maybeSingle();
    if (result.error) throw new Error(result.error.message);
    if (!result.data) return fail("Konfigurasi tidak ditemukan; tidak ada perubahan disimpan.", 409);
    return ok({ settings: await readReminderControlV6345(supabase), operation });
  } catch (e: any) { return fail(clean(e?.message || e), 500); }
}
