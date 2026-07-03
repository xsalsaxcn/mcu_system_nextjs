import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";

// WELLNESS_STRAVA_DEBUG_V420
// Debug sementara:
// - Tidak menampilkan access_token / refresh_token.
// - Mengecek apakah token bisa akses /athlete.
// - Mengecek apakah token bisa akses /athlete/activities.
// - Membantu bedakan masalah token, scope, atau endpoint activities.

function clean(value: any) {
  return String(value ?? "").trim();
}

async function callStrava(url: string, accessToken: string) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json().catch(() => null);

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    data,
  };
}

async function handleDebug(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const participant = await getParticipantFromPortalSession(supabase, req);

  if (!participant?.id) {
    return NextResponse.json(
      { ok: false, message: "OTP/session peserta belum aktif." },
      { status: 401 }
    );
  }

  const { data: integration, error } = await supabase
    .from("wellness_integrations")
    .select("*")
    .eq("participant_id", participant.id)
    .eq("provider", "strava")
    .eq("is_active", 1)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false, message: "Gagal membaca integration.", detail: error.message },
      { status: 500 }
    );
  }

  if (!integration?.id) {
    return NextResponse.json(
      { ok: false, message: "Strava belum connected." },
      { status: 400 }
    );
  }

  const accessToken = clean(integration.access_token);

  if (!accessToken) {
    return NextResponse.json(
      { ok: false, message: "Access token kosong." },
      { status: 400 }
    );
  }

  const athleteResult = await callStrava(
    "https://www.strava.com/api/v3/athlete",
    accessToken
  );

  const activitiesResult = await callStrava(
    "https://www.strava.com/api/v3/athlete/activities?per_page=5&page=1",
    accessToken
  );

  return NextResponse.json({
    ok: true,
    marker: "WELLNESS_STRAVA_DEBUG_V420",
    participant_id: participant.id,
    integration: {
      id: integration.id,
      provider_user_id: integration.provider_user_id,
      scope: integration.scope,
      accepted_scope: integration.raw_payload?.accepted_scope || null,
      requested_scope: integration.raw_payload?.requested_scope || null,
      has_activity_read_scope:
        integration.raw_payload?.has_activity_read_scope || null,
      connected_at: integration.connected_at,
      updated_at: integration.updated_at,
      expires_at: integration.expires_at,
    },
    test_athlete: {
      ok: athleteResult.ok,
      status: athleteResult.status,
      statusText: athleteResult.statusText,
      id: athleteResult.data?.id || null,
      username: athleteResult.data?.username || null,
      message: athleteResult.data?.message || null,
      errors: athleteResult.data?.errors || null,
    },
    test_activities: {
      ok: activitiesResult.ok,
      status: activitiesResult.status,
      statusText: activitiesResult.statusText,
      count: Array.isArray(activitiesResult.data)
        ? activitiesResult.data.length
        : null,
      message: activitiesResult.data?.message || null,
      errors: activitiesResult.data?.errors || null,
      raw_type: Array.isArray(activitiesResult.data)
        ? "array"
        : typeof activitiesResult.data,
    },
  });
}

export async function GET(req: NextRequest) {
  return handleDebug(req);
}