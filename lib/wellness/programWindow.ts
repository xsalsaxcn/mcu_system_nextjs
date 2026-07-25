// WELLNESS_PROGRAM_CUTOFF_V126D
// Satu sumber aturan periode program untuk seluruh portal Wellness.
// Baseline MCU tetap terlihat. Data operasional sebelum program_start_date
// tidak memengaruhi dashboard, ranking, streak, history, atau poin.

function cleanDate(value: unknown) {
  return String(value ?? "")
    .trim()
    .slice(0, 10);
}

export function effectiveProgramFromDate(
  participant: any,
  requestedFromDate?: unknown,
) {
  const requested =
    cleanDate(requestedFromDate);

  const programStart =
    cleanDate(
      participant?.program_start_date,
    );

  if (requested && programStart) {
    return requested > programStart
      ? requested
      : programStart;
  }

  return programStart || requested;
}

export function operationalRowDate(
  row: any,
  preferredFields: string[] = [],
) {
  const fields = [
    ...preferredFields,
    "log_date",
    "event_date",
    "date",
    "started_at",
    "start_date_local",
    "exam_date",
    "session_date",
    "checkup_date",
    "created_at",
    "updated_at",
  ];

  for (const field of fields) {
    const date = cleanDate(
      row?.[field],
    );

    if (date) return date;
  }

  const raw = row?.raw_payload || {};

  const rawValues = [
    raw?.log_date,
    raw?.event_date,
    raw?.start_date_local,
    raw?.start_date,
    raw?.["Submission Date"],
    raw?.timestamp,
    raw?.created_at,
  ];

  for (const value of rawValues) {
    const date = cleanDate(value);

    if (date) return date;
  }

  return "";
}

export function isOperationalRowInProgramWindow(
  participant: any,
  row: any,
  requestedFromDate?: unknown,
  requestedToDate?: unknown,
  preferredFields: string[] = [],
) {
  const rowDate =
    operationalRowDate(
      row,
      preferredFields,
    );

  // Record operasional tanpa tanggal tidak boleh
  // memengaruhi program dengan periode tertentu.
  if (!rowDate) return false;

  const fromDate =
    effectiveProgramFromDate(
      participant,
      requestedFromDate,
    );

  const toDate =
    cleanDate(requestedToDate);

  if (
    fromDate &&
    rowDate < fromDate
  ) {
    return false;
  }

  if (
    toDate &&
    rowDate > toDate
  ) {
    return false;
  }

  return true;
}

export function filterOperationalRowsForProgram(
  participant: any,
  rows: any[] = [],
  requestedFromDate?: unknown,
  requestedToDate?: unknown,
  preferredFields: string[] = [],
) {
  return (rows || []).filter(
    (row: any) =>
      isOperationalRowInProgramWindow(
        participant,
        row,
        requestedFromDate,
        requestedToDate,
        preferredFields,
      ),
  );
}

export function isBaselineClinicalRow(
  row: any,
) {
  const type = String(
    row?.history_type ||
      row?.type ||
      row?.visit_type ||
      "",
  )
    .trim()
    .toLowerCase();

  const label = String(
    row?.visit_label ||
      row?.source ||
      row?.label ||
      "",
  )
    .trim()
    .toLowerCase();

  return (
    type === "baseline_mcu" ||
    type === "baseline_checkup" ||
    type === "initial_assessment" ||
    type === "initial_checkup" ||
    label.includes("baseline") ||
    label.includes(
      "pemeriksaan awal",
    ) ||
    label.includes("mcu awal")
  );
}

export function filterClinicalRowsForProgram(
  participant: any,
  rows: any[] = [],
  requestedFromDate?: unknown,
  requestedToDate?: unknown,
) {
  return (rows || []).filter(
    (row: any) => {
      if (
        isBaselineClinicalRow(row)
      ) {
        return true;
      }

      return (
        isOperationalRowInProgramWindow(
          participant,
          row,
          requestedFromDate,
          requestedToDate,
          [
            "checkup_date",
            "exam_date",
            "log_date",
            "created_at",
          ],
        )
      );
    },
  );
}

export function programWindowDayCount(
  participant: any,
  requestedFromDate: unknown,
  requestedToDate: unknown,
  fallbackDays = 1,
) {
  const fromDate =
    effectiveProgramFromDate(
      participant,
      requestedFromDate,
    );

  const toDate =
    cleanDate(requestedToDate);

  if (!fromDate || !toDate) {
    return Math.max(
      1,
      Number(fallbackDays) || 1,
    );
  }

  const first = new Date(
    `${fromDate}T00:00:00Z`,
  ).getTime();

  const last = new Date(
    `${toDate}T00:00:00Z`,
  ).getTime();

  if (
    !Number.isFinite(first) ||
    !Number.isFinite(last)
  ) {
    return Math.max(
      1,
      Number(fallbackDays) || 1,
    );
  }

  if (first > last) return 1;

  return Math.max(
    1,
    Math.floor(
      (last - first) /
        86_400_000,
    ) + 1,
  );
}
