import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

// WELLNESS_COMPANY_PORTAL_AUTH_V78
// WELLNESS_COMPANY_MOBILE_SESSION_V78A
// Resolves the company scope from the signed-in user or an admin-selected
// company context cookie. No new database table is required.

const COMPANY_ROLES = new Set([
  "wellness_company",
  "company",
  "company_admin",
  "company_pic",
  "hr",
  "hrd",
  "management",
  "client",
]);

const MANAGER_ROLES = new Set([
  "admin",
  "super_admin",
  "supervisor",
  "doctor",
  "wellness_admin",
]);

function clean(value: any) {
  return String(value ?? "").trim();
}

function numeric(value: any) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function userRole(user: any) {
  return clean(user?.role).toLowerCase();
}

function sessionCompanyId(user: any) {
  return numeric(
    user?.wellness_company_id ||
      user?.company_id ||
      user?.main_entity_id ||
      user?.client_id,
  );
}

function sessionCompanyName(user: any) {
  return clean(
    user?.company_name ||
      user?.company ||
      user?.main_entity_name ||
      user?.client_name,
  );
}

export type CompanyPortalContext = {
  ok: boolean;
  user: any;
  role: string;
  isManager: boolean;
  isCompanyUser: boolean;
  company: any | null;
  companies: any[];
  requiresSelection: boolean;
  message?: string;
};

export async function resolveCompanyPortalContext(
  request: NextRequest,
): Promise<CompanyPortalContext> {
  const signedUser: any = getSessionUser(request);
  if (!signedUser) {
    return {
      ok: false,
      user: null,
      role: "",
      isManager: false,
      isCompanyUser: false,
      company: null,
      companies: [],
      requiresSelection: false,
      message: "Session perusahaan belum aktif.",
    };
  }

  // WELLNESS_COMPANY_SESSION_ENRICH_V78A
  // Cookie lama mungkin belum membawa company_id. Ambil ulang profil user
  // secara server-side lalu gabungkan dengan signed session yang valid.
  const supabase = getSupabaseAdmin();
  let user: any = signedUser;
  const signedUserId = numeric(signedUser?.id);

  if (signedUserId) {
    const { data: userRow } = await supabase
      .from("users")
      .select("*")
      .eq("id", signedUserId)
      .maybeSingle();

    if (userRow) {
      user = {
        ...signedUser,
        ...userRow,
        id: signedUser.id,
      };
    }
  }

  const role = userRole(user);
  const isManager = MANAGER_ROLES.has(role);
  const isCompanyUser = COMPANY_ROLES.has(role);

  if (!isManager && !isCompanyUser) {
    return {
      ok: false,
      user,
      role,
      isManager,
      isCompanyUser,
      company: null,
      companies: [],
      requiresSelection: false,
      message: "Akses Portal Perusahaan tidak tersedia untuk akun ini.",
    };
  }

  const { data, error } = await supabase
    .from("wellness_companies")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;

  const companies = (data || []).filter(
    (item: any) =>
      item?.is_active === null ||
      item?.is_active === undefined ||
      item?.is_active === true ||
      item?.is_active === 1 ||
      item?.is_active === "1",
  );

  const directCompanyId = sessionCompanyId(user);
  const queryCompanyId = numeric(request.nextUrl.searchParams.get("company_id"));
  const cookieCompanyId = numeric(
    request.cookies.get("wellness_company_context")?.value,
  );

  // WELLNESS_MANAGER_COMPANY_CONTEXT_PRIORITY_V126C
  // Manager/Admin boleh memilih perusahaan melalui query atau context cookie.
  // User perusahaan biasa tetap terkunci ke perusahaan dari akunnya.
  const selectedCompanyId = isManager
    ? queryCompanyId ||
      cookieCompanyId ||
      directCompanyId
    : directCompanyId;

  let company = selectedCompanyId
    ? companies.find((item: any) => numeric(item.id) === selectedCompanyId) || null
    : null;

  if (!company) {
    const preferredName = sessionCompanyName(user).toLowerCase();
    if (preferredName) {
      company =
        companies.find(
          (item: any) => clean(item.name).toLowerCase() === preferredName,
        ) || null;
    }
  }

  if (!company && companies.length === 1) company = companies[0];

  return {
    ok: Boolean(company),
    user,
    role,
    isManager,
    isCompanyUser,
    company,
    companies: isManager ? companies : company ? [company] : [],
    requiresSelection: isManager && !company && companies.length > 1,
    message:
      isManager && !company && companies.length > 1
        ? "Pilih perusahaan untuk membuka dashboard."
        : !company
          ? "Perusahaan belum terhubung dengan akun ini."
          : undefined,
  };
}

export function companyActorPayload(context: CompanyPortalContext) {
  const user = context.user || {};
  const company = context.company || {};

  return {
    type: "company" as const,
    id: clean(company.id),
    name: clean(company.name) || "Perusahaan Wellness",
    code: clean(company.code || company.slug || company.id),
    company: clean(company.name),
    group: "Company Portal",
    email: clean(user.email),
    isAdmin: false,
  };
}
