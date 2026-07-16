import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/server/response";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { postSupportWebhook } from "@/lib/wellness/supportServer";
import { resolveCompanyPortalContext } from "@/lib/wellness/companyAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// WELLNESS_COMPANY_COACH_CHAT_API_V78
// Two-way company <-> coach text chat stored in Google Sheet.

function clean(value: any) {
  return String(value ?? "").trim();
}

function numeric(value: any) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

async function safeRows(query: any) {
  try {
    const result = await query;
    return result?.error ? [] : result?.data || [];
  } catch {
    return [];
  }
}

async function coachContext(request: NextRequest) {
  const token = request.cookies.get("wellness_coach_session")?.value || "";
  if (!token) return null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("wellness_coach_auth_sessions")
    .select("*, coach:wellness_coach_users(*)")
    .eq("session_token", token)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !data?.coach || data.coach.is_active === false) return null;
  return data.coach;
}

async function companyCoaches(companyId: number) {
  const supabase = getSupabaseAdmin();
  const [units, assignments, coaches] = await Promise.all([
    safeRows(
      supabase
        .from("wellness_group_units")
        .select("*")
        .eq("company_id", companyId),
    ),
    safeRows(
      supabase
        .from("wellness_coach_group_assignments")
        .select("*")
        .eq("is_active", true),
    ),
    safeRows(supabase.from("wellness_coach_users").select("*")),
  ]);

  const unitById = new Map(units.map((item: any) => [numeric(item.id), item]));
  const allowedUnits = new Set(units.map((item: any) => clean(item.id)));
  const relevantAssignments = assignments.filter((item: any) =>
    allowedUnits.has(clean(item.wellness_group_unit_id)),
  );

  const coachIds = [
    ...new Set<number>(
      relevantAssignments.map((item: any) => numeric(item.coach_user_id)),
    ),
  ].filter(Boolean);

  const profileResult = await postSupportWebhook("wellnessProfileList", {
    actorType: "coach",
    actorIds: coachIds.map(String),
  }).catch(() => ({ profiles: [] }));
  const profileMap = new Map<string, any>(
    (profileResult.profiles || []).map((item: any) => [
      clean(item.actor_id),
      item,
    ]),
  );

  return coachIds.map((coachId: number) => {
    const coach = coaches.find((item: any) => numeric(item.id) === coachId) || {};
    const profile = profileMap.get(String(coachId)) || {};
    const assignedUnits = relevantAssignments
      .filter((item: any) => numeric(item.coach_user_id) === coachId)
      .map((item: any) => unitById.get(numeric(item.wellness_group_unit_id)))
      .filter(Boolean);
    const kelompokNames = [
      ...new Set(
        assignedUnits
          .map((unit: any) => {
            const parent = unit?.parent_id
              ? unitById.get(numeric(unit.parent_id))
              : unit;
            return clean(parent?.name || unit?.name);
          })
          .filter(Boolean),
      ),
    ];

    return {
      id: coachId,
      name: clean(coach.name || coach.full_name || coach.email) || `Coach ${coachId}`,
      email: clean(coach.email),
      kelompok_names: kelompokNames,
      profile_photo_url: clean(profile.photo_url),
      profile_photo_preview_url: clean(profile.photo_preview_url),
    };
  });
}

async function coachCompanies(coachId: number) {
  const supabase = getSupabaseAdmin();
  const assignments = await safeRows(
    supabase
      .from("wellness_coach_group_assignments")
      .select("*")
      .eq("coach_user_id", coachId)
      .eq("is_active", true),
  );
  const unitIds = assignments
    .map((item: any) => numeric(item.wellness_group_unit_id))
    .filter(Boolean);
  if (!unitIds.length) return [];

  const units = await safeRows(
    supabase.from("wellness_group_units").select("*").in("id", unitIds),
  );
  const companyIds = [...new Set(units.map((item: any) => numeric(item.company_id)))].filter(Boolean);
  if (!companyIds.length) return [];

  const companies = await safeRows(
    supabase.from("wellness_companies").select("*").in("id", companyIds),
  );
  return companies.map((item: any) => ({
    id: numeric(item.id),
    name: clean(item.name) || `Perusahaan ${item.id}`,
  }));
}

function mergeCompanyThreads(coaches: any[], threads: any[]) {
  const threadByCoach = new Map(
    (threads || []).map((thread: any) => [clean(thread.coach_id), thread]),
  );
  return coaches.map((coach: any) => ({
    ...coach,
    thread: threadByCoach.get(clean(coach.id)) || null,
    unread_count: numeric(
      threadByCoach.get(clean(coach.id))?.unread_company,
    ),
  }));
}

function mergeCoachThreads(companies: any[], threads: any[]) {
  const threadByCompany = new Map(
    (threads || []).map((thread: any) => [clean(thread.company_id), thread]),
  );
  return companies.map((company: any) => ({
    ...company,
    thread: threadByCompany.get(clean(company.id)) || null,
    unread_count: numeric(
      threadByCompany.get(clean(company.id))?.unread_coach,
    ),
  }));
}

export async function GET(request: NextRequest) {
  try {
    const actor = clean(request.nextUrl.searchParams.get("actor"));
    const mode = clean(request.nextUrl.searchParams.get("mode") || "threads");

    if (actor === "coach") {
      const coach = await coachContext(request);
      if (!coach) return fail("Session Coach belum aktif.", 401);
      const companies = await coachCompanies(numeric(coach.id));

      if (mode === "threads") {
        const result = await postSupportWebhook("companyCoachListThreads", {
          actorType: "coach",
          coachId: clean(coach.id),
        }).catch(() => ({ threads: [] }));
        const items = mergeCoachThreads(companies, result.threads || []);
        return ok({
          actor_type: "coach",
          actor: { id: coach.id, name: coach.name, email: coach.email },
          items,
          unread_count: items.reduce(
            (sum: number, item: any) => sum + numeric(item.unread_count),
            0,
          ),
        });
      }

      const companyId = numeric(request.nextUrl.searchParams.get("company_id"));
      if (!companyId || !companies.some((item: any) => item.id === companyId)) {
        return fail("Perusahaan tidak tersedia untuk Coach ini.", 403);
      }
      const company = companies.find((item: any) => item.id === companyId);
      const result = await postSupportWebhook("companyCoachGetThread", {
        actorType: "coach",
        coachId: clean(coach.id),
        coachName: clean(coach.name || coach.email),
        companyId: clean(companyId),
        companyName: clean(company?.name),
        markRead: true,
        limit: 50,
      });
      return ok({
        counterpart: company,
        thread: result.thread || null,
        messages: result.messages || [],
      });
    }

    const context = await resolveCompanyPortalContext(request);
    if (!context.user) return fail(context.message || "Unauthorized", 401);
    if (!context.company) return fail(context.message || "Pilih perusahaan.", 400);

    const companyId = numeric(context.company.id);
    const coaches = await companyCoaches(companyId);

    if (mode === "threads") {
      const result = await postSupportWebhook("companyCoachListThreads", {
        actorType: "company",
        companyId: clean(companyId),
      }).catch(() => ({ threads: [] }));
      const items = mergeCompanyThreads(coaches, result.threads || []);
      return ok({
        actor_type: "company",
        actor: { id: companyId, name: context.company.name },
        items,
        unread_count: items.reduce(
          (sum: number, item: any) => sum + numeric(item.unread_count),
          0,
        ),
      });
    }

    const coachId = numeric(request.nextUrl.searchParams.get("coach_id"));
    const coach = coaches.find((item: any) => item.id === coachId);
    if (!coach) return fail("Coach tidak tersedia untuk perusahaan ini.", 403);

    const result = await postSupportWebhook("companyCoachGetThread", {
      actorType: "company",
      companyId: clean(companyId),
      companyName: clean(context.company.name),
      coachId: clean(coachId),
      coachName: clean(coach.name),
      markRead: true,
      limit: 50,
    });
    return ok({
      counterpart: coach,
      thread: result.thread || null,
      messages: result.messages || [],
    });
  } catch (error: any) {
    return fail(error?.message || "Chat perusahaan dan Coach gagal dimuat.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const actor = clean(body.actor || request.nextUrl.searchParams.get("actor"));
    const message = clean(body.message).slice(0, 2000);
    if (!message) return fail("Tulis pesan terlebih dahulu.", 400);

    if (actor === "coach") {
      const coach = await coachContext(request);
      if (!coach) return fail("Session Coach belum aktif.", 401);
      const companies = await coachCompanies(numeric(coach.id));
      const companyId = numeric(body.company_id);
      const company = companies.find((item: any) => item.id === companyId);
      if (!company) return fail("Perusahaan tidak tersedia untuk Coach ini.", 403);

      const result = await postSupportWebhook("companyCoachSendMessage", {
        actorType: "coach",
        senderType: "coach",
        senderId: clean(coach.id),
        senderName: clean(coach.name || coach.email),
        coachId: clean(coach.id),
        coachName: clean(coach.name || coach.email),
        companyId: clean(companyId),
        companyName: clean(company.name),
        message,
      });
      return ok({ thread: result.thread, message: result.message });
    }

    const context = await resolveCompanyPortalContext(request);
    if (!context.user) return fail(context.message || "Unauthorized", 401);
    if (!context.company) return fail(context.message || "Pilih perusahaan.", 400);
    const companyId = numeric(context.company.id);
    const coaches = await companyCoaches(companyId);
    const coachId = numeric(body.coach_id);
    const coach = coaches.find((item: any) => item.id === coachId);
    if (!coach) return fail("Coach tidak tersedia untuk perusahaan ini.", 403);

    const result = await postSupportWebhook("companyCoachSendMessage", {
      actorType: "company",
      senderType: "company",
      senderId: clean(companyId),
      senderName: clean(context.company.name),
      companyId: clean(companyId),
      companyName: clean(context.company.name),
      coachId: clean(coachId),
      coachName: clean(coach.name),
      message,
    });
    return ok({ thread: result.thread, message: result.message });
  } catch (error: any) {
    return fail(error?.message || "Pesan gagal dikirim.", 500);
  }
}
