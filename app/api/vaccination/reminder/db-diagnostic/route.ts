import { NextRequest } from "next/server";
import { fail, ok, requireUser, supabaseAdmin } from "../../_utils";

export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function projectRefFromUrl(value: string) {
  try {
    const url = new URL(value);
    return url.hostname.split(".")[0] || "";
  } catch {
    return "";
  }
}

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);

  const role = clean((user as any)?.role).toLowerCase();
  if (
    ![
      "admin",
      "vaccination_admin",
      "vaccination_supervisor",
      "vaccination_report",
      "vaccination_validation",
    ].includes(role)
  ) {
    return fail("Tidak memiliki akses diagnostic Reminder Vaksinasi.", 403);
  }

  try {
    const supabaseUrl = clean(process.env.SUPABASE_URL);
    const supabase = supabaseAdmin();

    const result = await supabase
      .from("vaccination_reminders")
      .select(
        "id,participant_name,reminder_key,reminder_stage,status,sent_at,attempt_count,wa_status,wa_attempt_count,wa_last_attempt_at,wa_sent_at,wa_meta_message_id,updated_at",
      )
      .eq("id", 439)
      .maybeSingle();

    if (result.error) throw new Error(result.error.message);

    return ok({
      diagnostic: "V153.54.1_REMINDER_DB_RUNTIME",
      vercelEnv: clean(process.env.VERCEL_ENV) || null,
      commitSha: clean(process.env.VERCEL_GIT_COMMIT_SHA) || null,
      supabaseProjectRef: projectRefFromUrl(supabaseUrl) || null,
      supabaseHost: (() => {
        try {
          return new URL(supabaseUrl).hostname;
        } catch {
          return null;
        }
      })(),
      row439: result.data || null,
      note: "No secrets are returned by this endpoint.",
    });
  } catch (error: any) {
    return fail(error?.message || "Diagnostic gagal.", 500, {
      diagnostic: "V153.54.1_REMINDER_DB_RUNTIME",
    });
  }
}
