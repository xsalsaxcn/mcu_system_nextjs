import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../_utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function response(data: any, status = 200) {
  const res = NextResponse.json(data, { status });
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

function fail(message: string, status = 400, extra: any = {}) {
  return response({ ok: false, message, ...extra }, status);
}

function clean(value: any) {
  return String(value ?? "").trim();
}

function normalizeEmployeeId(value: any) {
  return clean(value).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function identityCandidates(row: any) {
  return [
    row?.employee_id,
    row?.binusian_id,
    row?.nik,
    row?.mcu_id,
    row?.employee_nik,
    row?.external_id,
    row?.barcode_value,
    row?.ktp,
    row?.nik_ktp,
  ]
    .map(normalizeEmployeeId)
    .filter(Boolean);
}

function rowMatchesIdentity(row: any, requested: string) {
  return identityCandidates(row).includes(requested);
}

async function findRegistrationByIdentity(
  supabase: any,
  registrations: any[],
  requested: string,
) {
  // 1) Prefer identity already copied into vaccination_registrations.
  // A family can intentionally share an employee/BINUSIAN ID. In that case,
  // never let array order decide the owner of the device. Prefer an explicitly
  // bound Parent registration, then any registration with an explicit family root.
  const directMatches = registrations.filter((row: any) =>
    rowMatchesIdentity(row, requested),
  );
  const direct =
    directMatches.find(
      (row: any) =>
        String(row?.family_role || "").toUpperCase() === "PARENT" &&
        Number(row?.history_person_id || 0) > 0,
    ) ||
    directMatches.find(
      (row: any) =>
        Number(row?.history_person_id || 0) > 0 ||
        Number(row?.parent_history_person_id || 0) > 0,
    ) ||
    directMatches[0] ||
    null;

  if (direct) {
    return {
      registration: direct,
      resolvedIdentity:
        clean(direct?.employee_id) ||
        clean(direct?.binusian_id) ||
        clean(direct?.nik) ||
        clean(direct?.mcu_id) ||
        requested,
    };
  }

  // 2) Some imported registrations only retain participant_id.
  // Resolve the Employee/BINUSIAN ID from the operational participant master
  // without changing or writing to that master.
  const participantIds = Array.from(
    new Set(
      registrations
        .map((row: any) => Number(row?.participant_id || 0))
        .filter((id: number) => Number.isFinite(id) && id > 0),
    ),
  );

  if (!participantIds.length) return null;

  const masterResult = await supabase
    .from("participants")
    .select("*")
    .in("id", participantIds)
    .limit(5000);

  // Public queue must still work even if the optional master lookup is unavailable.
  if (masterResult.error) return null;

  const participant = (masterResult.data || []).find((row: any) =>
    rowMatchesIdentity(row, requested),
  );
  if (!participant) return null;

  const registration = registrations.find(
    (row: any) => Number(row?.participant_id || 0) === Number(participant?.id || 0),
  );
  if (!registration) return null;

  return {
    registration,
    resolvedIdentity:
      clean(participant?.employee_id) ||
      clean(participant?.employee_nik) ||
      clean(participant?.external_id) ||
      clean(participant?.mcu_id) ||
      clean(participant?.barcode_value) ||
      clean(participant?.nik) ||
      requested,
  };
}

function normalizeStatus(value: any) {
  const s = clean(value).toUpperCase().replace(/\s+/g, "_");
  if (!s) return "REGISTERED";
  if (["BELUM_DATANG", "BELUM DATANG", "NOT_ARRIVED"].includes(s)) return "REGISTERED";
  if (["MENUNGGU", "WAITING"].includes(s)) return "WAITING";
  if (["WAITING_WITH_NOTE", "WAITING_NOTE"].includes(s)) return "WAITING_WITH_NOTE";
  if (["DOKTER", "CALLED", "DIPANGGIL"].includes(s)) return "CALLED";
  if (["DALAM_TINDAKAN", "IN_PROGRESS"].includes(s)) return "IN_PROGRESS";
  if (["SELESAI", "DONE", "ADMINISTERED", "FINISHED"].includes(s)) return "DONE";
  return s;
}

function isHealthdayBazarSession(session: any) {
  return String(session?.existing_queue_profile || "LEGACY").toUpperCase() === "HEALTHDAY_BAZAR";
}

function serviceHasTrack(row: any, track: "A" | "B") {
  const status = String(row?.patient_service_status || "HEALTHDAY").toUpperCase();
  return track === "A"
    ? status === "HEALTHDAY" || status === "COMBINATION"
    : status === "BAZAR" || status === "COMBINATION";
}

function trackNumber(row: any, track: "A" | "B") {
  return clean(track === "A" ? row?.queue_number : row?.bazar_queue_number);
}

function trackStatus(row: any, track: "A" | "B") {
  return normalizeStatus(track === "A" ? row?.queue_status || row?.status : row?.bazar_queue_status);
}

function queueSortValue(value: any) {
  const raw = clean(value);
  const match = raw.match(/\d+/);
  return match ? Number(match[0]) : 999999999;
}

function sortByTrack(track: "A" | "B") {
  return (a: any, b: any) => {
    const qa = queueSortValue(trackNumber(a, track));
    const qb = queueSortValue(trackNumber(b, track));
    if (qa !== qb) return qa - qb;
    return Number(a?.id || 0) - Number(b?.id || 0);
  };
}

function buildTrackSummary(registrations: any[], track: "A" | "B") {
  const rows = registrations.filter((row) => serviceHasTrack(row, track));
  const withNumber = rows.filter((row) => trackNumber(row, track));
  const waiting = withNumber.filter((row) => ["WAITING", "WAITING_WITH_NOTE", "REGISTERED"].includes(trackStatus(row, track))).sort(sortByTrack(track));
  const called = withNumber.filter((row) => ["CALLED", "IN_PROGRESS"].includes(trackStatus(row, track))).sort(sortByTrack(track));
  const done = withNumber.filter((row) => ["DONE", "ADMINISTERED", "FINISHED"].includes(trackStatus(row, track)));
  return {
    rows,
    current: called[0] || null,
    next: waiting[0] || null,
    summary: {
      total: withNumber.length || rows.length,
      waiting: waiting.length,
      called: called.length,
      done: done.length,
    },
  };
}

function buildWatchTrack(registrations: any[], registration: any, track: "A" | "B") {
  if (!serviceHasTrack(registration, track)) return null;
  const queueNumber = trackNumber(registration, track);
  if (!queueNumber) return null;

  const status = trackStatus(registration, track);

  const allTrackRows = registrations
    .filter((row) => serviceHasTrack(row, track) && trackNumber(row, track));

  const activeRows = allTrackRows.filter((row) =>
    ["CALLED", "IN_PROGRESS", "WAITING", "WAITING_WITH_NOTE", "REGISTERED"].includes(
      trackStatus(row, track),
    ),
  );

  const called = activeRows
    .filter((row) => ["CALLED", "IN_PROGRESS"].includes(trackStatus(row, track)))
    .sort(sortByTrack(track));

  const waiting = activeRows
    .filter((row) => ["WAITING", "WAITING_WITH_NOTE", "REGISTERED"].includes(trackStatus(row, track)))
    .sort(sortByTrack(track));

  const done = allTrackRows
    .filter((row) => ["DONE", "ADMINISTERED", "FINISHED"].includes(trackStatus(row, track)));

  const ordered = [...called, ...waiting];
  const index = ordered.findIndex((row) => String(row?.id) === String(registration?.id));
  const aheadCount = index >= 0 ? index : 0;

  return {
    track,
    queueNumber,
    status,
    aheadCount,
    oneAhead: aheadCount === 1,

    currentQueueNumber: called[0] ? trackNumber(called[0], track) : null,
    currentParticipantName: called[0]?.participant_name || null,

    nextQueueNumber: waiting[0] ? trackNumber(waiting[0], track) : null,
    nextParticipantName: waiting[0]?.participant_name || null,

    summary: {
      waiting: waiting.length,
      called: called.length,
      done: done.length,
      total: allTrackRows.length,
    },
  };
}

function explicitFamilyRole(row: any) {
  const value = String(row?.family_role || "").trim().toUpperCase();
  return value === "DEPENDENT" ? "DEPENDENT" : value === "PARENT" ? "PARENT" : "";
}

function familyRootHistoryPersonId(row: any) {
  const role = explicitFamilyRole(row);
  if (role === "DEPENDENT") {
    return Number(row?.parent_history_person_id || 0) || 0;
  }
  return Number(row?.history_person_id || 0) || 0;
}

function isActiveTrackData(trackData: any) {
  if (!trackData?.queueNumber) return false;
  const status = String(trackData?.status || "").toUpperCase();
  return [
    "REGISTERED",
    "WAITING",
    "WAITING_WITH_NOTE",
    "CALLED",
    "IN_PROGRESS",
  ].includes(status);
}

function relatedFamilyRegistrations(registrations: any[], anchorRegistration: any) {
  const rootId = familyRootHistoryPersonId(anchorRegistration);
  if (!rootId) return [anchorRegistration];

  const rows = registrations.filter((row: any) => {
    const ownHistoryId = Number(row?.history_person_id || 0);
    const parentHistoryId = Number(row?.parent_history_person_id || 0);
    return ownHistoryId === rootId || parentHistoryId === rootId;
  });

  if (!rows.some((row: any) => Number(row?.id) === Number(anchorRegistration?.id))) {
    rows.push(anchorRegistration);
  }

  const unique = new Map<number, any>();
  for (const row of rows) {
    const id = Number(row?.id || 0);
    if (id) unique.set(id, row);
  }

  return Array.from(unique.values());
}

function buildFamilyWatchMember(
  registrations: any[],
  registration: any,
  dualQueue: boolean,
) {
  const trackA = buildWatchTrack(registrations, registration, "A");
  const trackB = dualQueue ? buildWatchTrack(registrations, registration, "B") : null;

  return {
    registrationId: Number(registration?.id || 0),
    participantName: registration?.participant_name || "",
    familyRole: explicitFamilyRole(registration) || "UNCLASSIFIED",
    historyPersonId: Number(registration?.history_person_id || 0) || null,
    parentHistoryPersonId:
      Number(registration?.parent_history_person_id || 0) || null,
    employeeId:
      clean(registration?.employee_id) ||
      clean(registration?.binusian_id) ||
      clean(registration?.nik) ||
      clean(registration?.mcu_id) ||
      "",
    serviceStatus: registration?.patient_service_status || "HEALTHDAY",
    tracks: {
      A: trackA,
      B: trackB,
    },
    hasActiveQueue: isActiveTrackData(trackA) || isActiveTrackData(trackB),
  };
}

async function loadFamilyAccountHolder(
  supabase: any,
  rootHistoryPersonId: number,
) {
  if (!rootHistoryPersonId) return null;

  const result = await supabase
    .from("vaccination_persons")
    .select("id,participant_name,employee_id,nik,email,phone,participant_type")
    .eq("id", rootHistoryPersonId)
    .eq("active", true)
    .maybeSingle();

  if (result.error) return null;
  return result.data || null;
}

function publicSession(session: any) {
  return {
    id: session?.id,
    session_name: session?.session_name || "",
    company_name: session?.company_name || "",
    location: session?.location || session?.location_name || "",
    existing_queue_profile: session?.existing_queue_profile || "LEGACY",
  };
}

async function fetchRegistrations(supabase: any, sessionIds: any[]) {
  const ids = Array.from(new Set(sessionIds.filter((id) => id !== undefined && id !== null && clean(id) !== "")));
  if (!ids.length) return { rows: [], error: null };

  let query = supabase.from("vaccination_registrations").select("*");
  if (ids.length === 1) query = query.eq("session_id", ids[0]);
  else query = query.in("session_id", ids);

  const result = await query.order("id", { ascending: true });
  if (result.error) return { rows: [], error: result.error };
  return { rows: result.data || [], error: null };
}

async function findSiblingSessionIds(supabase: any, session: any) {
  const ids = [session.id];
  const name = clean(session.session_name);
  const company = clean(session.company_name);
  if (!name) return ids;

  try {
    let query = supabase
      .from("vaccination_sessions")
      .select("id, session_name, company_name")
      .eq("session_name", name);
    if (company) query = query.eq("company_name", company);

    const result = await query.limit(50);
    if (result.error) return ids;
    for (const item of result.data || []) {
      if (item?.id !== undefined && item?.id !== null) ids.push(item.id);
    }
  } catch (_error) {
    return ids;
  }

  return Array.from(new Set(ids));
}

export async function GET(req: NextRequest) {
  try {
    const token = clean(req.nextUrl.searchParams.get("token"));
    if (!token) return fail("Token public queue wajib diisi.", 400);

    const supabase = supabaseAdmin();
    const sessionResult = await supabase
      .from("vaccination_sessions")
      .select("*")
      .eq("public_queue_token", token)
      .maybeSingle();

    if (sessionResult.error) return fail(sessionResult.error.message || "Session public queue gagal dibaca.", 500);
    const session = sessionResult.data;
    if (!session) return fail("Session public queue tidak ditemukan.", 404);

    let usedFallback = false;
    let sourceSessionIds = [session.id];
    let registrationsResult = await fetchRegistrations(supabase, sourceSessionIds);
    if (registrationsResult.error) return fail(registrationsResult.error.message || "Registrasi vaksinasi gagal dibaca.", 500);
    let registrations = registrationsResult.rows;

    if (!registrations.length) {
      const siblingIds = await findSiblingSessionIds(supabase, session);
      if (siblingIds.length > 1) {
        const fallbackResult = await fetchRegistrations(supabase, siblingIds);
        if (fallbackResult.error) return fail(fallbackResult.error.message || "Registrasi fallback gagal dibaca.", 500);
        if (fallbackResult.rows.length) {
          registrations = fallbackResult.rows;
          sourceSessionIds = siblingIds;
          usedFallback = true;
        }
      }
    }

    const queueA = buildTrackSummary(registrations, "A");
    const dualQueue = isHealthdayBazarSession(session);
    const queueB = dualQueue ? buildTrackSummary(registrations, "B") : null;

    const requestedEmployeeId = normalizeEmployeeId(req.nextUrl.searchParams.get("employee_id"));
    if (requestedEmployeeId) {
      const matched = await findRegistrationByIdentity(
        supabase,
        registrations,
        requestedEmployeeId,
      );
      const registration = matched?.registration || null;

      if (!registration) {
        return fail("BINUSIAN / Employee ID tidak ditemukan pada session ini.", 404);
      }

      const rootHistoryPersonId = familyRootHistoryPersonId(registration);
      const familyRows = relatedFamilyRegistrations(registrations, registration);
      const allFamilyMembers = familyRows
        .map((row: any) => buildFamilyWatchMember(registrations, row, dualQueue))
        .filter((member: any) => member.registrationId);

      const activeFamilyMembers = allFamilyMembers.filter(
        (member: any) => member.hasActiveQueue,
      );

      // Keep backward compatibility for a single participant that only has a
      // completed queue. But when there are active family queues, only show
      // those active cards on the participant device.
      const familyMembers = activeFamilyMembers.length
        ? activeFamilyMembers
        : allFamilyMembers.filter(
            (member: any) =>
              member?.tracks?.A?.queueNumber || member?.tracks?.B?.queueNumber,
          );

      if (!familyMembers.length) {
        return fail("Peserta ditemukan, tetapi nomor antrean aktif belum tersedia.", 409, {
          participant_name: registration?.participant_name || "",
        });
      }

      const selectedMember =
        familyMembers.find(
          (member: any) =>
            Number(member.registrationId) === Number(registration?.id),
        ) || familyMembers[0];

      const accountHolder = await loadFamilyAccountHolder(
        supabase,
        rootHistoryPersonId,
      );

      return response({
        ok: true,
        watchMode: true,
        dualQueue,
        session: publicSession(session),
        participant: {
          id: selectedMember?.registrationId || registration?.id,
          participantName:
            accountHolder?.participant_name ||
            registration?.participant_name ||
            "",
          employeeId:
            matched?.resolvedIdentity ||
            accountHolder?.employee_id ||
            registration?.employee_id ||
            registration?.binusian_id ||
            registration?.nik ||
            registration?.mcu_id ||
            "",
          serviceStatus:
            selectedMember?.serviceStatus ||
            registration?.patient_service_status ||
            "HEALTHDAY",
          familyRootHistoryPersonId: rootHistoryPersonId || null,
          familyCount: familyMembers.length,
        },
        familyMembers,
        // Backward-compatible fields point to the initially selected member.
        tracks: selectedMember?.tracks || {
          A: null,
          B: null,
        },
      });
    }

    if (!dualQueue) {
      return response({
        ok: true,
        session,
        registrations: queueA.rows.map((row: any) => ({ ...row, queue_status: normalizeStatus(row.queue_status || row.status) })),
        current: queueA.current,
        next: queueA.next,
        summary: queueA.summary,
        dualQueue: false,
        debug: {
          public_queue_token: token,
          source_session_ids: sourceSessionIds,
          used_fallback: usedFallback,
          registrations_count: registrations.length,
          queue_rows_count: queueA.summary.total,
        },
      });
    }

    return response({
      ok: true,
      session,
      registrations,
      dualQueue: true,
      queues: {
        A: { current: queueA.current, next: queueA.next, summary: queueA.summary },
        B: { current: queueB?.current || null, next: queueB?.next || null, summary: queueB?.summary || { total: 0, waiting: 0, called: 0, done: 0 } },
      },
      // Backward-compatible A fields for any old consumer.
      current: queueA.current,
      next: queueA.next,
      summary: queueA.summary,
      debug: {
        public_queue_token: token,
        source_session_ids: sourceSessionIds,
        used_fallback: usedFallback,
        registrations_count: registrations.length,
        queue_a_count: queueA.summary.total,
        queue_b_count: queueB?.summary?.total || 0,
      },
    });
  } catch (error: any) {
    return fail(error?.message || "Public queue gagal dimuat.", 500);
  }
}
