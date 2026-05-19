import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  const participantId = Number(req.nextUrl.searchParams.get("participant_id"));
  if (!participantId) return fail("participant_id wajib.");

  const supabase = getSupabaseAdmin();

  const participant = await supabase.from("participants").select("*").eq("id", participantId).maybeSingle();
  if (participant.error) return fail(participant.error.message, 500);

  const [packageParameters, parameters, posts, results, review] = await Promise.all([
    supabase.from("package_parameters").select("*").eq("package_id", participant.data.package_id),
    supabase.from("parameters").select("*").eq("is_active", 1),
    supabase.from("posts").select("*"),
    supabase.from("examination_results").select("*").eq("participant_id", participantId),
    supabase.from("participant_reviews").select("*").eq("participant_id", participantId).maybeSingle()
  ]);

  const mapped = (packageParameters.data || [])
    .map((pp: any) => {
      const param = (parameters.data || []).find((p: any) => p.id === pp.parameter_id);
      if (!param) return null;
      const post = (posts.data || []).find((p: any) => p.id === param.post_id);
      const result = (results.data || []).find((r: any) => r.parameter_id === param.id);
      return {
        post_name: post?.name || "-",
        parameter_id: param.id,
        parameter_name: param.name,
        category: param.category,
        value: result?.value || "-"
      };
    })
    .filter(Boolean);

  return ok({
    participant: participant.data,
    results: mapped,
    review: review.data || null
  });
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user || !["admin", "doctor", "supervisor"].includes(user.role)) return fail("Unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const participantId = Number(body.participant_id);
  const review_status = String(body.review_status || "Sudah Direview");
  const final_decision = String(body.final_decision || "Menunggu");
  const doctor_note = String(body.doctor_note || "");

  if (!participantId) return fail("participant_id wajib.");

  const supabase = getSupabaseAdmin();

  const { data: existing } = await supabase
    .from("participant_reviews")
    .select("id")
    .eq("participant_id", participantId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("participant_reviews")
      .update({
        review_status,
        final_decision,
        doctor_note,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", existing.id);

    if (error) return fail(error.message, 500);
  } else {
    const { error } = await supabase.from("participant_reviews").insert({
      participant_id: participantId,
      review_status,
      final_decision,
      doctor_note,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString()
    });

    if (error) return fail(error.message, 500);
  }

  await supabase.from("audit_logs").insert({
    user_id: user.id,
    action: "REVIEW_HASIL",
    participant_id: participantId,
    parameter_id: null,
    old_value: null,
    new_value: `${review_status} | ${final_decision} | ${doctor_note}`
  });

  return ok();
}
