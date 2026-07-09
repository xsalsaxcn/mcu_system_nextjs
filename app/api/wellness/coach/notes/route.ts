import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE;

  if (!url || !key) {
    throw new Error("Supabase admin env is missing.");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function clean(value: any) {
  return String(value || "").trim();
}

async function getCoach(request: NextRequest, supabase: any) {
  const token = request.cookies.get("wellness_coach_session")?.value || "";

  if (!token) return null;

  const { data, error } = await supabase
    .from("wellness_coach_auth_sessions")
    .select("*, coach:wellness_coach_users(*)")
    .eq("session_token", token)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !data || !data.coach || data.coach.is_active === false) {
    return null;
  }

  return data.coach;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = adminClient();
    const coach = await getCoach(request, supabase);

    if (!coach) {
      return NextResponse.json(
        { ok: false, message: "Session coach belum aktif." },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));

    const participantId = Number(body.participant_id);
    if (!Number.isFinite(participantId) || participantId <= 0) {
      return NextResponse.json(
        { ok: false, message: "Participant ID tidak valid." },
        { status: 400 }
      );
    }

    const payload = {
      coach_user_id: coach.id,
      participant_id: participantId,
      wellness_group_unit_id: body.wellness_group_unit_id || null,
      group_name: clean(body.group_name),
      session_date: clean(body.session_date) || new Date().toISOString().slice(0, 10),
      topic: clean(body.topic),
      main_issue: clean(body.main_issue),
      coach_note: clean(body.coach_note),
      action_plan: clean(body.action_plan),
      follow_up_status: clean(body.follow_up_status) || "Open",
      next_follow_up_date: clean(body.next_follow_up_date) || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("wellness_coach_notes")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Catatan coach berhasil disimpan.",
      note: data,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message || "Gagal menyimpan catatan coach." },
      { status: 500 }
    );
  }
}
