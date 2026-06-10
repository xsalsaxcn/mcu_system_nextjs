import type { SessionUser } from "@/lib/shared/types";
import { isWellnessCoach, isWellnessParticipant } from "@/lib/wellness/auth";

export function isActive(value: any) {
  return value === 1 || value === true || value === "1" || value === null || value === undefined;
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export async function getAllowedWellnessParticipants(supabase: any, user: SessionUser) {
  let query = supabase
    .from("wellness_participants")
    .select("*")
    .order("name", { ascending: true });

  if (isWellnessParticipant(user)) {
    query = query.eq("user_id", user.id);
  } else if (isWellnessCoach(user)) {
    query = query.eq("coach_id", user.id);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export function ensureParticipantAccess(user: SessionUser, participantId: number, participants: any[]) {
  if (!participantId) return null;
  const participant = participants.find((item: any) => Number(item.id) === Number(participantId));
  if (!participant) return null;
  if (isWellnessParticipant(user) && Number(participant.user_id) !== Number(user.id)) return null;
  if (isWellnessCoach(user) && participant.coach_id && Number(participant.coach_id) !== Number(user.id)) return null;
  return participant;
}

export function latestByDate(rows: any[], field = "log_date") {
  return [...(rows || [])].sort((a: any, b: any) => String(b[field] || "").localeCompare(String(a[field] || "")))[0];
}
