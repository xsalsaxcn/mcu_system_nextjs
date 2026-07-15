import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSessionUser } from "@/lib/server/session";
import { getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";
import { postToWellnessWebhook } from "@/lib/wellness/googleSheetWebhook";

// WELLNESS_SUPPORT_CHAT_GOOGLE_SHEET_V61
// Server-only authentication + webhook bridge for technical support chat.
// Chat content lives in Google Sheet; attachments live in Google Drive.

export type SupportActorType = "participant" | "coach" | "admin";

export type SupportActor = {
  type: SupportActorType;
  id: string;
  name: string;
  code: string;
  company: string;
  group: string;
  email: string;
  isAdmin: boolean;
};

function clean(value: any) {
  return String(value ?? "").trim();
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE;

  if (!url || !key) throw new Error("Supabase admin env is missing.");

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const SUPPORT_ADMIN_ROLES = new Set([
  "admin",
  "super_admin",
  "supervisor",
  "doctor",
  "wellness_admin",
]);

function sessionAdminActor(request: NextRequest): SupportActor | null {
  const user: any = getSessionUser(request);
  const role = clean(user?.role).toLowerCase();
  if (!user || !SUPPORT_ADMIN_ROLES.has(role)) return null;

  return {
    type: "admin",
    id: clean(user.id || user.user_id || user.email || user.username || role),
    name: clean(user.full_name || user.name || user.username || user.email) || "Admin Wellness",
    code: clean(user.username || user.employee_code),
    company: "inHARMONY",
    group: "Wellness Admin",
    email: clean(user.email),
    isAdmin: true,
  };
}

async function participantActor(request: NextRequest): Promise<SupportActor | null> {
  const supabase = adminClient();
  const participant: any = await getParticipantFromPortalSession(supabase, request);
  if (!participant) return null;

  return {
    type: "participant",
    id: clean(participant.id || participant.participant_id),
    name: clean(participant.name || participant.participant_name || participant.full_name) || "Peserta Wellness",
    code: clean(participant.code || participant.employee_code || participant.no_karyawan),
    company: clean(participant.company || participant.company_name),
    group: clean(participant.group_name || participant.kelompok || participant.group_unit_name),
    email: clean(participant.email),
    isAdmin: false,
  };
}

async function coachActor(request: NextRequest): Promise<SupportActor | null> {
  const token = request.cookies.get("wellness_coach_session")?.value || "";
  if (!token) return null;

  const supabase = adminClient();
  const { data, error } = await supabase
    .from("wellness_coach_auth_sessions")
    .select("*, coach:wellness_coach_users(*)")
    .eq("session_token", token)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  const coach: any = data?.coach;
  if (error || !coach || coach.is_active === false) return null;

  return {
    type: "coach",
    id: clean(coach.id),
    name: clean(coach.name || coach.full_name || coach.email) || "Coach Wellness",
    code: clean(coach.code || coach.employee_code),
    company: clean(coach.company || coach.company_name) || "inHARMONY",
    group: "Coach Wellness",
    email: clean(coach.email),
    isAdmin: false,
  };
}

export async function getSupportActor(request: NextRequest): Promise<SupportActor | null> {
  const admin = sessionAdminActor(request);
  if (admin) return admin;

  try {
    const participant = await participantActor(request);
    if (participant) return participant;
  } catch {
    // Continue to coach session lookup.
  }

  try {
    return await coachActor(request);
  } catch {
    return null;
  }
}

export function getSupportAdminActor(request: NextRequest): SupportActor | null {
  return sessionAdminActor(request);
}

export function actorWebhookPayload(actor: SupportActor) {
  return {
    actorType: actor.type,
    actorId: actor.id,
    actorName: actor.name,
    actorCode: actor.code,
    actorCompany: actor.company,
    actorGroup: actor.group,
    actorEmail: actor.email,
  };
}

export async function postSupportWebhook(action: string, payload: Record<string, any> = {}) {
  return postToWellnessWebhook({
    action,
    marker: "WELLNESS_SUPPORT_CHAT_GOOGLE_SHEET_V61",
    ...payload,
  });
}
