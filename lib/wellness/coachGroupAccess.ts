// WELLNESS_COACH_CANONICAL_GROUP_ACCESS_V126M20_3
// Canonical coach scope resolver.
// - Uses the participant's canonical group unit and the hierarchy in
//   wellness_group_units.
// - Ignores stale denormalized parent IDs when a canonical unit exists.
// - Never grants access from risk/category labels.

export type CoachGroupUnitMap = Map<string, any>;

function clean(value: any) {
  return String(value ?? "").trim();
}

function normalizedName(value: any) {
  return clean(value).toLowerCase();
}

function participantCompanyId(row: any) {
  return clean(row?.wellness_company_id || row?.company_id);
}

function groupUnitCompanyId(row: any) {
  return clean(row?.company_id || row?.wellness_company_id);
}

export function buildCoachGroupUnitMap(rows: any[] = []): CoachGroupUnitMap {
  return new Map(
    (rows || [])
      .map((row: any) => [clean(row?.id), row] as const)
      .filter(([id]) => Boolean(id)),
  );
}

export function participantCanonicalUnitId(
  row: any,
  groupUnitMap?: CoachGroupUnitMap,
) {
  const direct = clean(row?.wellness_group_unit_id || row?.group_unit_id);
  if (direct) return direct;

  const legacyCandidates = [row?.group_id, row?.wellness_group_id]
    .map(clean)
    .filter(Boolean);

  if (groupUnitMap) {
    const mapped = legacyCandidates.find((id) => groupUnitMap.has(id));
    if (mapped) return mapped;
  }

  return "";
}

function unitAncestors(
  unitId: string,
  groupUnitMap: CoachGroupUnitMap,
) {
  const ids: string[] = [];
  const visited = new Set<string>();
  let currentId = clean(unitId);

  while (currentId && !visited.has(currentId) && ids.length < 10) {
    visited.add(currentId);
    ids.push(currentId);
    const unit = groupUnitMap.get(currentId);
    currentId = clean(unit?.parent_id);
  }

  return ids;
}

export function participantScopeIds(
  row: any,
  groupUnitMap: CoachGroupUnitMap,
) {
  const canonicalUnitId = participantCanonicalUnitId(row, groupUnitMap);

  if (canonicalUnitId) {
    // When a canonical unit exists, derive every parent from the canonical
    // hierarchy. Do not trust row.wellness_kelompok_id, which can be stale.
    return unitAncestors(canonicalUnitId, groupUnitMap);
  }

  // Legacy fallback is allowed only when there is no canonical unit ID.
  const legacyKelompokId = clean(row?.wellness_kelompok_id);
  return legacyKelompokId ? [legacyKelompokId] : [];
}

function assignmentMatchesCompany(
  row: any,
  assignment: any,
  groupUnitMap: CoachGroupUnitMap,
) {
  const participantCompany = participantCompanyId(row);
  const assignmentUnit = groupUnitMap.get(
    clean(assignment?.wellness_group_unit_id),
  );
  const assignmentCompany = groupUnitCompanyId(assignmentUnit);

  return !participantCompany || !assignmentCompany ||
    participantCompany === assignmentCompany;
}

function fallbackParticipantGroupNames(row: any) {
  // Canonical display fields only. Risk/category fields must never grant access.
  return [row?.kelompok_name, row?.group_unit_name, row?.group_name]
    .map(normalizedName)
    .filter(Boolean);
}

export function matchingCoachAssignment(
  row: any,
  assignments: any[] = [],
  groupUnitMap: CoachGroupUnitMap,
) {
  const scopeIds = participantScopeIds(row, groupUnitMap);

  if (scopeIds.length > 0) {
    return (
      (assignments || []).find((assignment: any) => {
        const assignmentId = clean(assignment?.wellness_group_unit_id);
        return Boolean(
          assignmentId &&
          scopeIds.includes(assignmentId) &&
          assignmentMatchesCompany(row, assignment, groupUnitMap),
        );
      }) || null
    );
  }

  const names = fallbackParticipantGroupNames(row);
  if (names.length === 0) return null;

  return (
    (assignments || []).find((assignment: any) => {
      const assignmentName = normalizedName(assignment?.group_name);
      return Boolean(
        assignmentName &&
        names.includes(assignmentName) &&
        assignmentMatchesCompany(row, assignment, groupUnitMap),
      );
    }) || null
  );
}

export function canCoachAccessParticipant(
  row: any,
  assignments: any[] = [],
  groupUnitMap: CoachGroupUnitMap,
) {
  return Boolean(matchingCoachAssignment(row, assignments, groupUnitMap));
}

export function participantBelongsToGroupUnit(
  row: any,
  groupUnitId: any,
  groupName: any,
  groupUnitMap: CoachGroupUnitMap,
) {
  const id = clean(groupUnitId);
  const scopeIds = participantScopeIds(row, groupUnitMap);

  if (id) return scopeIds.includes(id);
  if (scopeIds.length > 0) return false;

  const name = normalizedName(groupName);
  return Boolean(name && fallbackParticipantGroupNames(row).includes(name));
}

export function canonicalParticipantGroupUnit(
  row: any,
  groupUnitMap: CoachGroupUnitMap,
) {
  const unitId = participantCanonicalUnitId(row, groupUnitMap);
  if (unitId) return groupUnitMap.get(unitId) || null;

  const kelompokId = clean(row?.wellness_kelompok_id);
  return kelompokId ? groupUnitMap.get(kelompokId) || null : null;
}

export function canonicalParticipantKelompokUnit(
  row: any,
  groupUnitMap: CoachGroupUnitMap,
) {
  const groupUnit = canonicalParticipantGroupUnit(row, groupUnitMap);
  if (groupUnit) {
    const unitType = normalizedName(groupUnit?.unit_type);
    if (unitType === "kelompok") return groupUnit;

    for (const id of unitAncestors(clean(groupUnit?.id), groupUnitMap)) {
      const unit = groupUnitMap.get(id);
      if (normalizedName(unit?.unit_type) === "kelompok") return unit;
    }
  }

  const legacyKelompokId = clean(row?.wellness_kelompok_id);
  return legacyKelompokId
    ? groupUnitMap.get(legacyKelompokId) || null
    : null;
}

export function canonicalParticipantGroupName(
  row: any,
  groupUnitMap: CoachGroupUnitMap,
) {
  const unit = canonicalParticipantGroupUnit(row, groupUnitMap);
  return (
    clean(unit?.name) ||
    clean(row?.group_unit_name || row?.group_name || row?.kelompok_name) ||
    "-"
  );
}

export function dedupeCoachParticipants(rows: any[] = []) {
  const unique = new Map<string, any>();

  for (const row of rows || []) {
    const id = clean(row?.id || row?.participant_id || row?.wellness_participant_id);
    if (!id || unique.has(id)) continue;
    unique.set(id, row);
  }

  return [...unique.values()];
}
