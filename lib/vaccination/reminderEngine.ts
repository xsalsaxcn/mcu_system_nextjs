import { sendVaccinationReminderEmail } from "@/lib/vaccination/reminderEmail";

export const REMINDER_STAGES = [
  { stage: "H7", daysBefore: 7 },
  { stage: "H3", daysBefore: 3 },
  { stage: "H1", daysBefore: 1 },
  { stage: "H0", daysBefore: 0 },
] as const;

function clean(value: any) {
  return String(value ?? "").trim();
}

function validEmail(value: any) {
  const text = clean(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : "";
}

function dateFromYmd(value: string) {
  const match = clean(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

export function shiftYmd(value: string, days: number) {
  const date = dateFromYmd(value);
  if (!date) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function todayInVaccinationTimezone() {
  const timeZone = clean(process.env.VACCINATION_REMINDER_TIMEZONE) || "Asia/Jakarta";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const map = new Map(parts.map((part) => [part.type, part.value]));
  return `${map.get("year")}-${map.get("month")}-${map.get("day")}`;
}

async function rowsInChunks(
  supabase: any,
  table: string,
  select: string,
  column: string,
  values: any[],
  chunkSize = 400,
) {
  const unique = Array.from(new Set(values.filter((value) => value !== null && value !== undefined && value !== "")));
  const rows: any[] = [];
  for (let index = 0; index < unique.length; index += chunkSize) {
    const chunk = unique.slice(index, index + chunkSize);
    const result = await supabase.from(table).select(select).in(column, chunk);
    if (result.error) throw new Error(result.error.message);
    rows.push(...(result.data || []));
  }
  return rows;
}

async function updateIdsInChunks(supabase: any, ids: number[], payload: any) {
  const unique = Array.from(new Set(ids.map(Number).filter(Boolean)));
  for (let index = 0; index < unique.length; index += 400) {
    const chunk = unique.slice(index, index + 400);
    const result = await supabase.from("vaccination_reminders").update(payload).in("id", chunk);
    if (result.error) throw new Error(result.error.message);
  }
}

type Candidate = {
  sourceType: "CURRENT_RECORD" | "HISTORY_SERVICE";
  sourceKey: string;
  recordId: number | null;
  registrationId: number | null;
  historyServiceId: number | null;
  personId: number | null;
  participantName: string;
  recipientName: string;
  recipientEmail: string;
  recipientType: "SELF" | "PARENT";
  companyName: string;
  serviceName: string;
  nextDueDate: string;
};

async function loadCurrentCandidates(supabase: any, today: string): Promise<Candidate[]> {
  const result = await supabase
    .from("vaccination_records")
    .select("id,registration_id,vaccine_name,next_due_date,status")
    .not("next_due_date", "is", null)
    .gte("next_due_date", today)
    .order("next_due_date", { ascending: true })
    .limit(10000);

  if (result.error) throw new Error(result.error.message);

  const records = (result.data || []).filter((row: any) => {
    const status = clean(row?.status).toUpperCase();
    return !["CANCELLED", "CANCELED", "VOID", "DELETED"].includes(status);
  });

  const registrations = await rowsInChunks(
    supabase,
    "vaccination_registrations",
    "id,participant_name,employee_id,nik,email,company_name",
    "id",
    records.map((row: any) => row.registration_id),
  );
  const registrationMap = new Map(registrations.map((row: any) => [Number(row.id), row]));

  return records.map((row: any) => {
    const registration = registrationMap.get(Number(row.registration_id)) || {};
    const participantName = clean(registration?.participant_name) || "Peserta";
    return {
      sourceType: "CURRENT_RECORD" as const,
      sourceKey: `CURRENT_RECORD:${Number(row.id)}`,
      recordId: Number(row.id),
      registrationId: Number(row.registration_id) || null,
      historyServiceId: null,
      personId: null,
      participantName,
      recipientName: participantName,
      recipientEmail: validEmail(registration?.email),
      recipientType: "SELF" as const,
      companyName: clean(registration?.company_name),
      serviceName: clean(row?.vaccine_name) || "Vaksinasi",
      nextDueDate: clean(row?.next_due_date),
    };
  });
}

async function loadHistoryCandidates(supabase: any, today: string): Promise<Candidate[]> {
  const result = await supabase
    .from("vaccination_service_history")
    .select("id,company_id,person_id,service_name,product_brand,next_due_date")
    .not("next_due_date", "is", null)
    .gte("next_due_date", today)
    .order("next_due_date", { ascending: true })
    .limit(10000);

  if (result.error) throw new Error(result.error.message);
  const services = result.data || [];

  const persons = await rowsInChunks(
    supabase,
    "vaccination_persons",
    "id,company_id,participant_type,participant_name,employee_id,nik,email,active",
    "id",
    services.map((row: any) => row.person_id),
  );
  const personMap = new Map(persons.map((row: any) => [Number(row.id), row]));

  const dependentIds = persons
    .filter((row: any) => clean(row?.participant_type).toUpperCase() === "DEPENDENT")
    .map((row: any) => Number(row.id));

  const relationships = dependentIds.length
    ? await rowsInChunks(
        supabase,
        "vaccination_person_relationships",
        "id,company_id,parent_person_id,dependent_person_id,active",
        "dependent_person_id",
        dependentIds,
      )
    : [];

  const activeRelationships = relationships.filter((row: any) => row?.active !== false);
  const relationshipByDependent = new Map<number, any>();
  for (const row of activeRelationships) {
    const dependentId = Number(row.dependent_person_id);
    if (!relationshipByDependent.has(dependentId)) relationshipByDependent.set(dependentId, row);
  }

  const parents = await rowsInChunks(
    supabase,
    "vaccination_persons",
    "id,company_id,participant_type,participant_name,employee_id,nik,email,active",
    "id",
    activeRelationships.map((row: any) => row.parent_person_id),
  );
  const parentMap = new Map(parents.map((row: any) => [Number(row.id), row]));

  const companies = await rowsInChunks(
    supabase,
    "vaccination_history_companies",
    "id,company_name,active",
    "id",
    services.map((row: any) => row.company_id),
  );
  const companyMap = new Map(companies.map((row: any) => [Number(row.id), row]));

  const candidates: Candidate[] = [];

  for (const service of services) {
    const person = personMap.get(Number(service.person_id));
    if (!person || person?.active === false) continue;

    const participantName = clean(person.participant_name) || "Peserta";
    const company = companyMap.get(Number(service.company_id));
    const companyName = clean(company?.company_name);
    const participantType = clean(person.participant_type).toUpperCase();

    let recipientName = participantName;
    let recipientEmail = validEmail(person.email);
    let recipientType: "SELF" | "PARENT" = "SELF";

    if (participantType === "DEPENDENT") {
      const relationship = relationshipByDependent.get(Number(person.id));
      const parent = relationship ? parentMap.get(Number(relationship.parent_person_id)) : null;
      recipientName = clean(parent?.participant_name) || "";
      recipientEmail = validEmail(parent?.email);
      recipientType = "PARENT";
    }

    const serviceLabel = [clean(service.service_name), clean(service.product_brand)]
      .filter(Boolean)
      .filter((value, index, array) => array.indexOf(value) === index)
      .join(" · ");

    candidates.push({
      sourceType: "HISTORY_SERVICE",
      sourceKey: `HISTORY_SERVICE:${Number(service.id)}`,
      recordId: null,
      registrationId: null,
      historyServiceId: Number(service.id),
      personId: Number(service.person_id),
      participantName,
      recipientName,
      recipientEmail,
      recipientType,
      companyName,
      serviceName: serviceLabel || "Vaksinasi",
      nextDueDate: clean(service.next_due_date),
    });
  }

  return candidates;
}

async function loadExistingByReminderKeys(supabase: any, keys: string[]) {
  const rows = await rowsInChunks(
    supabase,
    "vaccination_reminders",
    "id,reminder_key,source_key,next_due_date,reminder_stage,status,attempt_count,error_message,recipient_email,sent_at,superseded_at",
    "reminder_key",
    keys,
  );
  return new Map(rows.map((row: any) => [clean(row.reminder_key), row]));
}

export async function syncVaccinationReminders(supabase: any, today = todayInVaccinationTimezone()) {
  const [currentCandidates, historyCandidates] = await Promise.all([
    loadCurrentCandidates(supabase, today),
    loadHistoryCandidates(supabase, today),
  ]);

  const allCandidates = [...currentCandidates, ...historyCandidates].filter(
    (candidate) => candidate.nextDueDate && candidate.sourceKey,
  );
  const candidateMap = new Map(allCandidates.map((candidate) => [candidate.sourceKey, candidate]));

  const activeResult = await supabase
    .from("vaccination_reminders")
    .select("id,source_key,next_due_date,status,reminder_date,superseded_at")
    .not("source_key", "is", null)
    .is("superseded_at", null)
    .in("status", ["PENDING", "FAILED", "SKIPPED", "SENDING"])
    .gte("next_due_date", today)
    .limit(20000);

  if (activeResult.error) throw new Error(activeResult.error.message);

  const obsoleteIds: number[] = [];
  for (const row of activeResult.data || []) {
    const sourceKey = clean(row.source_key);
    const candidate = candidateMap.get(sourceKey);
    if (!candidate || clean(row.next_due_date) !== candidate.nextDueDate) {
      obsoleteIds.push(Number(row.id));
    }
  }

  if (obsoleteIds.length) {
    await updateIdsInChunks(supabase, obsoleteIds, {
      status: "SUPERSEDED",
      superseded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  const desired: any[] = [];
  for (const candidate of allCandidates) {
    for (const stage of REMINDER_STAGES) {
      const reminderDate = shiftYmd(candidate.nextDueDate, -stage.daysBefore);
      if (!reminderDate || reminderDate < today) continue;

      const reminderKey = `${candidate.sourceKey}:${candidate.nextDueDate}:${stage.stage}`;
      desired.push({ candidate, stage: stage.stage, reminderDate, reminderKey });
    }
  }

  const existingMap = await loadExistingByReminderKeys(
    supabase,
    desired.map((row) => row.reminderKey),
  );

  const upsertRows = desired.map((row) => {
    const candidate: Candidate = row.candidate;
    const existing: any = existingMap.get(row.reminderKey);
    const hasEmail = Boolean(candidate.recipientEmail);

    let status = hasEmail ? "PENDING" : "SKIPPED";
    if (existing) {
      const existingStatus = clean(existing.status).toUpperCase();
      if (existingStatus === "SENT") status = "SENT";
      else if (existingStatus === "FAILED" && hasEmail) status = "FAILED";
      else if (existingStatus === "SENDING" && hasEmail) status = "SENDING";
    }

    return {
      reminder_key: row.reminderKey,
      source_type: candidate.sourceType,
      source_key: candidate.sourceKey,
      record_id: candidate.recordId,
      registration_id: candidate.registrationId,
      history_service_id: candidate.historyServiceId,
      person_id: candidate.personId,
      participant_email: candidate.recipientEmail || null,
      participant_name: candidate.participantName,
      vaccine_name: candidate.serviceName,
      next_due_date: candidate.nextDueDate,
      reminder_date: row.reminderDate,
      reminder_stage: row.stage,
      recipient_name: candidate.recipientName || null,
      recipient_email: candidate.recipientEmail || null,
      recipient_type: candidate.recipientType,
      company_name: candidate.companyName || null,
      status,
      sent_at: status === "SENT" ? existing?.sent_at || null : null,
      error_message: hasEmail
        ? status === "FAILED"
          ? existing?.error_message || null
          : null
        : candidate.recipientType === "PARENT"
          ? "Email parent belum tersedia atau tidak valid."
          : "Email peserta belum tersedia atau tidak valid.",
      attempt_count: Number(existing?.attempt_count || 0),
      superseded_at: null,
      updated_at: new Date().toISOString(),
    };
  });

  for (let index = 0; index < upsertRows.length; index += 300) {
    const chunk = upsertRows.slice(index, index + 300);
    if (!chunk.length) continue;
    const result = await supabase.from("vaccination_reminders").upsert(chunk, { onConflict: "reminder_key" });
    if (result.error) throw new Error(result.error.message);
  }

  return {
    today,
    currentSources: currentCandidates.length,
    historySources: historyCandidates.length,
    candidates: allCandidates.length,
    schedules: upsertRows.length,
    superseded: obsoleteIds.length,
    skippedNoEmail: upsertRows.filter((row) => row.status === "SKIPPED").length,
  };
}

export async function sendDueVaccinationReminders(
  supabase: any,
  today = todayInVaccinationTimezone(),
  limit = 200,
) {
  const staleAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  await supabase
    .from("vaccination_reminders")
    .update({
      status: "FAILED",
      error_message: "Recovered from stale SENDING state.",
      updated_at: new Date().toISOString(),
    })
    .eq("status", "SENDING")
    .lt("last_attempt_at", staleAt)
    .is("superseded_at", null);

  const claim = await supabase.rpc("claim_vaccination_reminders", {
    p_today: today,
    p_limit: Math.min(Math.max(Number(limit || 200), 1), 500),
  });
  if (claim.error) throw new Error(claim.error.message);

  const rows = claim.data || [];
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const results: any[] = [];

  for (const row of rows) {
    const email = validEmail(row.recipient_email || row.participant_email);
    if (!email) {
      skipped += 1;
      const message =
        clean(row.recipient_type).toUpperCase() === "PARENT"
          ? "Email parent belum tersedia atau tidak valid."
          : "Email peserta belum tersedia atau tidak valid.";

      await supabase
        .from("vaccination_reminders")
        .update({ status: "SKIPPED", error_message: message, updated_at: new Date().toISOString() })
        .eq("id", row.id);

      results.push({ id: row.id, status: "SKIPPED", error: message });
      continue;
    }

    try {
      await sendVaccinationReminderEmail({
        to: email,
        recipientName: clean(row.recipient_name),
        participantName: clean(row.participant_name) || "Peserta",
        serviceName: clean(row.vaccine_name) || "Vaksinasi",
        nextDueDate: clean(row.next_due_date),
        reminderStage: clean(row.reminder_stage),
        companyName: clean(row.company_name),
        recipientType: clean(row.recipient_type),
      });

      sent += 1;
      await supabase
        .from("vaccination_reminders")
        .update({
          status: "SENT",
          sent_at: new Date().toISOString(),
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      results.push({ id: row.id, status: "SENT" });
    } catch (error: any) {
      failed += 1;
      const message = clean(error?.message || error || "Gagal mengirim email.");
      await supabase
        .from("vaccination_reminders")
        .update({
          status: "FAILED",
          error_message: message.slice(0, 1000),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      results.push({ id: row.id, status: "FAILED", error: message });
    }
  }

  return { today, claimed: rows.length, sent, failed, skipped, results };
}

export async function runAutomaticVaccinationReminder(supabase: any) {
  const today = todayInVaccinationTimezone();
  const sync = await syncVaccinationReminders(supabase, today);
  const delivery = await sendDueVaccinationReminders(supabase, today, 200);
  return { today, sync, delivery };
}
