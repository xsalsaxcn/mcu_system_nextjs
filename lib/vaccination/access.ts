import type { SessionUser } from "@/lib/shared/types";

export type VaccinationPermission =
  | "portal"
  | "register"
  | "queue"
  | "administer"
  | "validation"
  | "inventory"
  | "master"
  | "session"
  | "dashboard"
  | "export"
  | "users";

export const VACCINATION_ROLES = [
  "vaccination_admin",
  "vaccination_frontdesk",
  "vaccination_medis",
  "vaccination_validation",
  "vaccination_inventory",
  "vaccination_report",
  "vaccination_supervisor",
] as const;

const ROLE_PERMISSIONS: Record<string, VaccinationPermission[]> = {
  vaccination_admin: ["portal", "register", "queue", "administer", "validation", "inventory", "master", "session", "dashboard", "export", "users"],
  vaccination_frontdesk: ["portal", "register", "queue"],
  vaccination_medis: ["portal", "administer"],
  vaccination_validation: ["portal", "validation"],
  vaccination_inventory: ["portal", "inventory", "master", "session", "export"],
  vaccination_report: ["portal", "dashboard", "export"],
  vaccination_supervisor: ["portal", "dashboard", "session", "inventory", "master", "validation", "export"],
};

export function vaccinationRole(user: Partial<SessionUser> | null | undefined) {
  return String(user?.role || "").trim().toLowerCase();
}

export function isVaccinationRole(user: Partial<SessionUser> | null | undefined) {
  return vaccinationRole(user).startsWith("vaccination_");
}

export function vaccinationRoleLabel(user: Partial<SessionUser> | null | undefined) {
  const role = vaccinationRole(user);
  const labels: Record<string, string> = {
    vaccination_admin: "Vaccination Admin",
    vaccination_frontdesk: "Vaccination Frontdesk",
    vaccination_medis: "Vaccination Medis",
    vaccination_validation: "Vaccination Validation",
    vaccination_inventory: "Vaccination Inventory",
    vaccination_report: "Vaccination Report",
    vaccination_supervisor: "Vaccination Supervisor",
  };
  return labels[role] || String(user?.role || "User");
}

export function canVaccinationAccess(
  user: Partial<SessionUser> | null | undefined,
  permission: VaccinationPermission,
) {
  if (!user) return false;
  const role = vaccinationRole(user);
  if (role === "admin") return true;

  // Backward compatibility: existing non-vaccination roles keep their current access.
  // New vaccination_* accounts are strictly restricted by the map above.
  if (!role.startsWith("vaccination_")) return true;
  return (ROLE_PERMISSIONS[role] || []).includes(permission);
}

export function vaccinationRolePermissions(roleInput: string) {
  const role = String(roleInput || "").trim().toLowerCase();
  return ROLE_PERMISSIONS[role] || [];
}
