import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";

// MCU_REG_ONSPOT_SESSION_V440
// MCU_CORPORATE_DATABASE_SESSION_MISMATCH_GUARD_V512

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

  // MCU_CORPORATE_SESSION_PARTICIPANT_UNION_V493
  // A Session may already contain participants from historical registration/queue
  // rows even when their newer participant-session assignment row does not exist.
  // Treat all three operational links as valid Session membership so Registrasi
  // Ulang can still display the complete Session population.
  let sessionParticipantIds: number[] | null = null;
  if (queueSession?.id) {
    const queueSessionId = Number(queueSession.id);

    const [assignmentResult, registrationResult, queueEntryResult] =
      await Promise.all([
        supabase
          .from("mcu_participant_session_assignments")
          .select("participant_id")
          .eq("queue_session_id", queueSessionId),
        supabase
          .from("mcu_registration_sessions")
          .select("participant_id")
          .eq("queue_session_id", queueSessionId),
        supabase
          .from("mcu_queue_entries")
          .select("participant_id")
          .eq("queue_session_id", queueSessionId),
      ]);

    if (assignmentResult.error) {
      return fail(assignmentResult.error.message, 500);
    }
    if (registrationResult.error) {
      return fail(registrationResult.error.message, 500);
    }
    if (queueEntryResult.error) {
      return fail(queueEntryResult.error.message, 500);
    }

    sessionParticipantIds = Array.from(
      new Set(
        [
          ...(assignmentResult.data || []),
          ...(registrationResult.data || []),
          ...(queueEntryResult.data || []),
        ]
          .map((row: any) => Number(row.participant_id || 0))
          .filter(Boolean),
      ),
    );
  }

  // V512: Database Existing + Session must refer to the same imported batch.
  // This prevents e.g. source ALSUT from being UNIONed with Session Serpong.
  const hasExplicitDatabaseV512 =
    sourceId !== "all" && !exactSessionMatch && !legacySessionMatch;
  if (
    program === "corporate" &&
    hasExplicitDatabaseV512 &&
    queueSession?.id
  ) {
    const numericSourceIdV512 = Number(sourceId);
    if (!Number.isFinite(numericSourceIdV512) || numericSourceIdV512 <= 0) {
      return fail("Database Existing tidak valid.", 400);
    }

    const assignmentMatchV512 = await supabase
      .from("mcu_participant_session_assignments")
      .select("participant_id")
      .eq("queue_session_id", Number(queueSession.id))
      .eq("source_id", numericSourceIdV512)
      .limit(1)
      .maybeSingle();

    if (assignmentMatchV512.error) {
      return fail(assignmentMatchV512.error.message, 500);
    }

    if (!assignmentMatchV512.data) {
      return fail(
        "Database Existing yang dipilih tidak terhubung ke Session MCU ini. Pilih Session lokasi/tanggal yang sesuai agar peserta antar lokasi tidak tercampur.",
        409,
      );
    }
  }

  const keyword = clean(req.nextUrl.searchParams.get("keyword") || "");
  // MCU_CORPORATE_RETRIEVE_LIMIT_V494_1
  const limit = Math.min(
    Math.max(Number(req.nextUrl.searchParams.get("limit") || 200), 1),
    200,
  );

  // MCU_CORPORATE_OTHER_SESSION_SEARCH_V528
  // Explicit read-only mode used only by the Registrasi Ulang
  // "Cari Data di Session Lain" button. Normal retrieve behavior below is
  // intentionally untouched.
  const otherSessionModeV528 =
    req.nextUrl.searchParams.get("other_session") === "1";

  if (otherSessionModeV528) {
    if (program !== "corporate") {
      return fail("Pencarian Session lain hanya tersedia untuk MCU Corporate.", 400);
    }

    const companyIdV528 = Number(
      req.nextUrl.searchParams.get("company_id") ||
        queueSession?.company_id ||
        0,
    );
    const currentSessionIdV528 = Number(queueSession?.id || 0);

    if (!companyIdV528 || !currentSessionIdV528) {
      return fail("Perusahaan dan Session MCU aktif wajib dipilih.", 400);
    }
    if (Number(queueSession?.company_id || 0) !== companyIdV528) {
      return fail("Session MCU tidak sesuai dengan perusahaan yang dipilih.", 409);
    }
    if (keyword.length < 2) {
      return ok({
        participants: [],
        mode: "other_session",
        queue_session: queueSession,
        message: "Masukkan minimal 2 karakter.",
      });
    }

    const likeV528 = `%${keyword}%`;
    const participantResultV528 = await supabase
      .from("participants")
      .select(SELECT_COLUMNS)
      .eq("program_type", "corporate")
      .eq("company_id", companyIdV528)
      .or(
        `name.ilike.${likeV528},mcu_id.ilike.${likeV528},external_id.ilike.${likeV528},nik.ilike.${likeV528},employee_nik.ilike.${likeV528},barcode_value.ilike.${likeV528}`,
      )
      .order("name", { ascending: true })
      .limit(limit);

    if (participantResultV528.error) {
      return fail(participantResultV528.error.message, 500);
    }

    const candidatesV528 = participantResultV528.data || [];
    const participantIdsV528 = candidatesV528
      .map((row: any) => Number(row.id || 0))
      .filter(Boolean);

    if (!participantIdsV528.length) {
      return ok({
        participants: [],
        mode: "other_session",
        queue_session: queueSession,
      });
    }

    const [assignmentV528, registrationV528, queueV528] = await Promise.all([
      supabase
        .from("mcu_participant_session_assignments")
        .select("participant_id,queue_session_id")
        .in("participant_id", participantIdsV528),
      supabase
        .from("mcu_registration_sessions")
        .select("participant_id,queue_session_id")
        .in("participant_id", participantIdsV528),
      supabase
        .from("mcu_queue_entries")
        .select("participant_id,queue_session_id")
        .in("participant_id", participantIdsV528),
    ]);

    for (const resultV528 of [assignmentV528, registrationV528, queueV528]) {
      if (resultV528.error) return fail(resultV528.error.message, 500);
    }

    const linkedRowsV528 = [
      ...(assignmentV528.data || []),
      ...(registrationV528.data || []),
      ...(queueV528.data || []),
    ];

    const currentParticipantIdsV528 = new Set<number>();
    const otherSessionIdsByParticipantV528 = new Map<number, Set<number>>();
    const allOtherSessionIdsV528 = new Set<number>();

    for (const rowV528 of linkedRowsV528) {
      const participantIdV528 = Number(rowV528.participant_id || 0);
      const sessionIdV528 = Number(rowV528.queue_session_id || 0);
      if (!participantIdV528 || !sessionIdV528) continue;

      if (sessionIdV528 === currentSessionIdV528) {
        currentParticipantIdsV528.add(participantIdV528);
        continue;
      }

      if (!otherSessionIdsByParticipantV528.has(participantIdV528)) {
        otherSessionIdsByParticipantV528.set(participantIdV528, new Set<number>());
      }
      otherSessionIdsByParticipantV528
        .get(participantIdV528)!
        .add(sessionIdV528);
      allOtherSessionIdsV528.add(sessionIdV528);
    }

    let otherSessionRowsV528: any[] = [];
    if (allOtherSessionIdsV528.size) {
      const sessionRowsResultV528 = await supabase
        .from("mcu_queue_sessions")
        .select("id,company_id,session_name,location,session_date,is_active")
        .in("id", Array.from(allOtherSessionIdsV528))
        .eq("company_id", companyIdV528);

      if (sessionRowsResultV528.error) {
        return fail(sessionRowsResultV528.error.message, 500);
      }
      otherSessionRowsV528 = sessionRowsResultV528.data || [];
    }

    const validSessionMapV528 = new Map<number, any>(
      otherSessionRowsV528.map((row: any) => [Number(row.id || 0), row]),
    );

    const eligibleV528 = candidatesV528
      .filter((participantV528: any) => {
        const participantIdV528 = Number(participantV528.id || 0);
        if (!participantIdV528 || currentParticipantIdsV528.has(participantIdV528)) {
          return false;
        }
        const linkedV528 =
          otherSessionIdsByParticipantV528.get(participantIdV528) ||
          new Set<number>();
        return Array.from(linkedV528).some((idV528) =>
          validSessionMapV528.has(idV528),
        );
      })
      .map((participantV528: any) => {
        const participantIdV528 = Number(participantV528.id || 0);
        const linkedV528 =
          otherSessionIdsByParticipantV528.get(participantIdV528) ||
          new Set<number>();
        const otherSessionsV528 = Array.from(linkedV528)
          .map((idV528) => validSessionMapV528.get(idV528))
          .filter(Boolean)
          .sort((a: any, b: any) =>
            String(b.session_date || "").localeCompare(
              String(a.session_date || ""),
            ),
          );

        return {
          ...participantV528,
          session_registered: false,
          session_registered_at: null,
          queue_session_id: currentSessionIdV528,
          other_sessions_v528: otherSessionsV528,
        };
      });

    const decoratedV528 = await decorateRows(supabase, eligibleV528);
    return ok({
      participants: decoratedV528,
      mode: "other_session",
      queue_session: queueSession,
      company_id: companyIdV528,
    });
  }

  if (sourceId === "all" && !queueSession?.id && keyword.length < 2) {
    return ok({
      participants: [],
      message: "Pilih database atau isi nama/MCU/NIK minimal 2 karakter."
    });
  }

  function baseQuery() {
    let query = supabase.from("participants").select(SELECT_COLUMNS).limit(limit);

    if (program !== "all") query = query.eq("program_type", program);

    const hasExplicitDatabase =
      sourceId !== "all" && !exactSessionMatch && !legacySessionMatch;

    // MCU_CORPORATE_DATABASE_PLUS_SESSION_UNION_V493
    // Database Existing remains the batch selector for participants that still
    // need Registrasi Ulang. When a Session is also selected, merge in everyone
    // already operationally linked to that Session (assignment, registration,
    // or queue entry). This prevents previously registered/queued participants
    // from disappearing just because their source_id differs from the selected
    // Database Existing.
    if (hasExplicitDatabase) {
      const numericSourceId = Number(sourceId);
      if (!Number.isFinite(numericSourceId) || numericSourceId <= 0) {
        return query.in("id", [-1]);
      }

      if (sessionParticipantIds?.length) {
        const safeParticipantIds = sessionParticipantIds
          .filter((id) => Number.isFinite(id) && id > 0)
          .map((id) => Math.trunc(id));

        if (safeParticipantIds.length) {
          query = query.or(
            `source_id.eq.${numericSourceId},id.in.(${safeParticipantIds.join(",")})`,
          );
        } else {
          query = query.eq("source_id", numericSourceId);
        }
      } else {
        query = query.eq("source_id", numericSourceId);
      }

      if (queueSession?.company_id) {
        query = query.eq("company_id", Number(queueSession.company_id));
      }
    } else if (sessionParticipantIds !== null) {
      // With no Database Existing selected, Session membership itself is the
      // retrieval source.
      if (!sessionParticipantIds.length) return query.in("id", [-1]);
      query = query.in("id", sessionParticipantIds);
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
