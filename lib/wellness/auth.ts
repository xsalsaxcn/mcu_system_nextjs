import type { SessionUser } from "@/lib/shared/types";

export function wellnessRole(user: SessionUser | null | undefined) {
  return String(user?.role || "").toLowerCase();
}

export function wellnessProgram(user: SessionUser | null | undefined) {
  return String(user?.program_type || "").toLowerCase();
}

export function isWellnessParticipant(user: SessionUser | null | undefined) {
  const role = wellnessRole(user);
  return role === "wellness_participant" || role === "participant" || wellnessProgram(user) === "wellness";
}

export function isWellnessCoach(user: SessionUser | null | undefined) {
  const role = wellnessRole(user);
  return role === "wellness_coach" || role === "coach";
}

export function canManageWellness(user: SessionUser | null | undefined) {
  const role = wellnessRole(user);
  return ["admin", "super_admin", "supervisor", "doctor", "wellness_admin", "wellness_coach", "coach"].includes(role);
}
