import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";

// MCU_REG_ONSPOT_SESSION_V440

const SELECT_COLUMNS = `
  id,
  name,
  mcu_id,
  external_id,
  nik,
  employee_nik,
  gender,
  birth_date,
  date_of_birth,
  age,
  examination_date,
  exam_date,
  department,
  province,
  phone,
  program_type,
  source_id,
  package_id,
  company_id,
  registrasi_ulang_done,
  registrasi_ulang_at
`;

function clean(value: string) {
  return String(value || "").replace(/[,%]/g, " ").replace(/\s+/g, " ").trim();
}

async function decorateRows(supabase: any, rows: any[]) {
  const list = rows || [];
  const companyIds = Array.from(new Set(list.map((row: any) => Number(row.company_id || 0)).filter(Boolean)));
  const packageIds = Array.from(new Set(list.map((row: any) => Number(row.package_id || 0)).filter(Boolean)));
  const sourceIds = Array.from(new Set(list.map((row: any) => Number(row.source_id || 0)).filter(Boolean)));

  const companyMap = new Map<number, string>();
  const packageMap = new Map<number, string>();
  const sourceMap = new Map<number, string>();

  if (companyIds.length) {
    const { data } = await supabase.from("companies").select("id,name").in("id", companyIds);
    for (const row of data || []) companyMap.set(Number(row.id), String(row.name || ""));
  }
  if (packageIds.length) {
    const { data } = await supabase.from("packages").select("id,name").in("id", packageIds);
    for (const row of data || []) packageMap.set(Number(row.id), String(row.name || ""));
  }
  if (sourceIds.length) {
    const { data } = await supabase.from("participant_sources").select("*").in("id", sourceIds);
    for (const row of data || []) sourceMap.set(Number(row.id), String(row.name || row.institution_name || ""));
  }

  return list.map((row: any) => ({
    ...row,
    source_name: sourceMap.get(Number(row.source_id || 0)) || companyMap.get(Number(row.company_id || 0)) || "-",
    package_name: packageMap.get(Number(row.package_id || 0)) || "-",
    company_name: companyMap.get(Number(row.company_id || 0)) || ""
  }));
}


async function decorateSessionRegistration(
  supabase: any,
  rows: any[],
  queueSessionId: number,
) {
  if (!queueSessionId || !rows.length) return rows;

  const participantIds = rows
    .map((row: any) => Number(row.id || 0))
    .filter(Boolean);

  if (!participantIds.length) return rows;

  const bindingResult = await supabase
    .from("mcu_registration_sessions")
    .select("participant_id,registered_at")
    .eq("queue_session_id", queueSessionId)
    .in("participant_id", participantIds);

  if (bindingResult.error) {
    throw new Error(bindingResult.error.message);
  }

  const bindingMap = new Map<number, any>(
    (bindingResult.data || []).map((row: any) => [
      Number(row.participant_id || 0),
      row,
    ]),
  );

  return rows.map((row: any) => {
    const binding = bindingMap.get(Number(row.id || 0));
    return {
      ...row,
      session_registered: Boolean(binding),
      session_registered_at: binding?.registered_at || null,
      queue_session_id: queueSessionId,
    };
  });
}

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user || user.role !== "admin") return fail("Unauthorized", 401);

  const supabase = getSupabaseAdmin();
  const program = req.nextUrl.searchParams.get("program") || "capaska";
  const sourceId = req.nextUrl.searchParams.get("source_id") || "all";
  const requestedQueueSessionId = Number(req.nextUrl.searchParams.get("queue_session_id") || 0);
  // Legacy combined-selector values remain readable, but V491 sends session separately.
  const legacySessionMatch = /^session:(\d+):(\d+)$/.exec(sourceId);
  const exactSessionMatch = /^mcu-session:(\d+)$/.exec(sourceId);

  let sessionCompanyId = legacySessionMatch ? Number(legacySessionMatch[1]) : 0;
  let sessionPackageId = legacySessionMatch ? Number(legacySessionMatch[2]) : 0;
  let queueSession: any = null;

  if (requestedQueueSessionId || exactSessionMatch) {
    const queueSessionId = requestedQueueSessionId || Number(exactSessionMatch?.[1] || 0);
    const sessionResult = await supabase
      .from("mcu_queue_sessions")
      .select("id,company_id,package_id,session_name,location,session_date,is_active")
      .eq("id", queueSessionId)
      .eq("is_active", 1)
      .maybeSingle();

    if (sessionResult.error) return fail(sessionResult.error.message, 500);
    if (!sessionResult.data) {
      return fail("Session MCU lokasi/tanggal tidak ditemukan atau sudah nonaktif.", 404);
    }

    queueSession = sessionResult.data;
    sessionCompanyId = Number(queueSession.company_id || 0);
    sessionPackageId = Number(queueSession.package_id || 0);
  }

  let assignedParticipantIds: number[] | null = null;
  if (queueSession?.id) {
    const assignmentResult = await supabase
      .from("mcu_participant_session_assignments")
      .select("participant_id")
      .eq("queue_session_id", Number(queueSession.id));
    if (assignmentResult.error) return fail(assignmentResult.error.message, 500);
    assignedParticipantIds = (assignmentResult.data || [])
      .map((row: any) => Number(row.participant_id || 0))
      .filter(Boolean);
  }

  const keyword = clean(req.nextUrl.searchParams.get("keyword") || "");
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit") || 25), 1), 50);

  if (sourceId === "all" && !queueSession?.id && keyword.length < 2) {
    return ok({
      participants: [],
      message: "Pilih database atau isi nama/MCU/NIK minimal 2 karakter."
    });
  }

  function baseQuery() {
    let query = supabase.from("participants").select(SELECT_COLUMNS).limit(limit);

    if (program !== "all") query = query.eq("program_type", program);
    // V491: Session membership comes from the assignment table, never from package alone.
    if (assignedParticipantIds !== null) {
      if (!assignedParticipantIds.length) return query.in("id", [-1]);
      query = query.in("id", assignedParticipantIds);
    }
    // Database is an independent optional narrowing filter.
    if (sourceId !== "all" && !exactSessionMatch && !legacySessionMatch) {
      query = query.eq("source_id", Number(sourceId));
    }

    return query;
  }

  if (keyword.length >= 2) {
    const { data: exactData, error: exactError } = await baseQuery()
      .or(`mcu_id.eq.${keyword},external_id.eq.${keyword},nik.eq.${keyword},employee_nik.eq.${keyword},barcode_value.eq.${keyword}`)
      .order("name", { ascending: true });

    if (exactError) return fail(exactError.message, 500);
    if (exactData?.length) {
      const decorated = await decorateRows(supabase, exactData);
      return ok({
        participants: await decorateSessionRegistration(
          supabase,
          decorated,
          Number(queueSession?.id || 0),
        ),
        mode: "exact",
        queue_session: queueSession,
      });
    }
  }

  let query = baseQuery().order("name", { ascending: true });

  if (keyword.length >= 2) {
    const like = `%${keyword}%`;
    query = query.or(`name.ilike.${like},mcu_id.ilike.${like},external_id.ilike.${like},nik.ilike.${like},employee_nik.ilike.${like},barcode_value.ilike.${like}`);
  }

  const { data, error } = await query;
  if (error) return fail(error.message, 500);

  const decorated = await decorateRows(supabase, data || []);
  return ok({
    participants: await decorateSessionRegistration(
      supabase,
      decorated,
      Number(queueSession?.id || 0),
    ),
    mode:
      keyword.length >= 2
        ? "like"
        : queueSession?.id || exactSessionMatch || legacySessionMatch
          ? "session"
          : "source",
    queue_session: queueSession,
  });
}
