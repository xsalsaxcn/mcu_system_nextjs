import { vaccinationReminderRecipientPhone } from "@/lib/vaccination/reminderWhatsApp";

function clean(value: any) {
  return String(value ?? "").trim();
}

async function rowsInChunks(
  supabase: any,
  table: string,
  select: string,
  column: string,
  values: any[],
  chunkSize = 300,
) {
  const unique = Array.from(
    new Set(values.filter((value) => value !== null && value !== undefined && value !== "")),
  );
  const rows: any[] = [];
  for (let index = 0; index < unique.length; index += chunkSize) {
    const chunk = unique.slice(index, index + chunkSize);
    const result = await supabase.from(table).select(select).in(column, chunk).limit(10000);
    if (result.error) throw new Error(result.error.message);
    rows.push(...(result.data || []));
  }
  return rows;
}

function sourceParticipantKey(sourceId: any, participantId: any) {
  const source = Number(sourceId || 0);
  const participant = Number(participantId || 0);
  return source && participant ? `${source}:${participant}` : "";
}

export async function resolveRegistrationReminderPhones(supabase: any, registrations: any[]) {
  const result = new Map<number, string>();
  const missing: any[] = [];

  for (const registration of registrations || []) {
    const id = Number(registration?.id || 0);
    if (!id) continue;
    const direct = vaccinationReminderRecipientPhone(registration?.phone);
    if (direct) result.set(id, direct);
    else missing.push(registration);
  }

  if (!missing.length) return result;

  const participantIds = missing
    .map((row) => Number(row?.participant_id || 0))
    .filter(Boolean);

  const importRows = participantIds.length
    ? await rowsInChunks(
        supabase,
        "vaccination_import_rows",
        "id,source_id,participant_id,external_id,nik,email,phone,raw_json",
        "participant_id",
        participantIds,
      )
    : [];

  const byExact = new Map<string, string>();
  const byParticipant = new Map<number, string>();
  for (const row of importRows) {
    const raw = row?.raw_json && typeof row.raw_json === "object" ? row.raw_json : {};
    const phone = vaccinationReminderRecipientPhone(
      row?.phone ||
        raw?.PhoneNumber ||
        raw?.["Phone Number"] ||
        raw?.["No HP"] ||
        raw?.["Nomor HP"] ||
        raw?.Telepon ||
        raw?.HP ||
        raw?.Phone ||
        raw?.phone,
    );
    if (!phone) continue;
    const participantId = Number(row?.participant_id || 0);
    const exact = sourceParticipantKey(row?.source_id, participantId);
    if (exact && !byExact.has(exact)) byExact.set(exact, phone);
    if (participantId && !byParticipant.has(participantId)) byParticipant.set(participantId, phone);
  }

  for (const registration of missing) {
    const id = Number(registration?.id || 0);
    const participantId = Number(registration?.participant_id || 0);
    const exact = sourceParticipantKey(registration?.source_id, participantId);
    const phone = (exact ? byExact.get(exact) : "") || byParticipant.get(participantId) || "";
    if (id && phone) result.set(id, phone);
  }

  return result;
}

export async function resolveReminderPhonesForRows(supabase: any, rows: any[]) {
  const result = new Map<number, string>();

  for (const row of rows || []) {
    const id = Number(row?.id || 0);
    const direct = vaccinationReminderRecipientPhone(row?.recipient_phone);
    if (id && direct) result.set(id, direct);
  }

  const currentRows = (rows || []).filter(
    (row: any) =>
      Number(row?.id || 0) &&
      !result.has(Number(row.id)) &&
      Number(row?.registration_id || 0),
  );

  if (currentRows.length) {
    const registrations = await rowsInChunks(
      supabase,
      "vaccination_registrations",
      "id,source_id,participant_id,employee_id,nik,email,phone",
      "id",
      currentRows.map((row: any) => Number(row.registration_id)),
    );
    const registrationPhones = await resolveRegistrationReminderPhones(supabase, registrations);
    for (const row of currentRows) {
      const phone = registrationPhones.get(Number(row.registration_id)) || "";
      if (phone) result.set(Number(row.id), phone);
    }
  }

  const historyRows = (rows || []).filter(
    (row: any) =>
      Number(row?.id || 0) &&
      !result.has(Number(row.id)) &&
      Number(row?.person_id || 0),
  );

  if (historyRows.length) {
    const persons = await rowsInChunks(
      supabase,
      "vaccination_persons",
      "id,participant_type,phone,active",
      "id",
      historyRows.map((row: any) => Number(row.person_id)),
    );
    const personMap = new Map(persons.map((row: any) => [Number(row.id), row]));
    const dependentIds = persons
      .filter((row: any) => clean(row?.participant_type).toUpperCase() === "DEPENDENT")
      .map((row: any) => Number(row.id))
      .filter(Boolean);

    const relationships = dependentIds.length
      ? await rowsInChunks(
          supabase,
          "vaccination_person_relationships",
          "id,parent_person_id,dependent_person_id,active",
          "dependent_person_id",
          dependentIds,
        )
      : [];
    const relationshipMap = new Map<number, any>();
    for (const relationship of relationships) {
      if (relationship?.active === false) continue;
      const dependentId = Number(relationship?.dependent_person_id || 0);
      if (dependentId && !relationshipMap.has(dependentId)) {
        relationshipMap.set(dependentId, relationship);
      }
    }

    const parentIds = Array.from(
      new Set(
        relationships
          .filter((row: any) => row?.active !== false)
          .map((row: any) => Number(row?.parent_person_id || 0))
          .filter(Boolean),
      ),
    );
    const parents = parentIds.length
      ? await rowsInChunks(
          supabase,
          "vaccination_persons",
          "id,phone,active",
          "id",
          parentIds,
        )
      : [];
    const parentMap = new Map(parents.map((row: any) => [Number(row.id), row]));

    for (const row of historyRows) {
      const person = personMap.get(Number(row.person_id));
      if (!person || person?.active === false) continue;
      const participantType = clean(person?.participant_type).toUpperCase();
      let phone = vaccinationReminderRecipientPhone(person?.phone);
      if (participantType === "DEPENDENT") {
        const relationship = relationshipMap.get(Number(row.person_id));
        const parent = relationship ? parentMap.get(Number(relationship.parent_person_id)) : null;
        phone = vaccinationReminderRecipientPhone(parent?.phone);
      }
      if (phone) result.set(Number(row.id), phone);
    }
  }

  return result;
}

export async function resolveReminderPhoneForRow(supabase: any, row: any) {
  const direct = vaccinationReminderRecipientPhone(row?.recipient_phone);
  if (direct) return direct;

  const syntheticId = Number(row?.id || 0) || 1;
  const map = await resolveReminderPhonesForRows(supabase, [{ ...row, id: syntheticId }]);
  return map.get(syntheticId) || "";
}
