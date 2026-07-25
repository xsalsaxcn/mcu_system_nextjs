import { createHmac, timingSafeEqual } from "crypto";

// WELLNESS_DUMMY_DATA_MAINTENANCE_V109
// Server-only whitelist for preview, backup, and cleanup of explicitly selected
// Wellness dummy participants. No Google Sheet, Drive, master data, point rules,
// migrations, Google Fit, or Health Connect source is modified by this module.

export const WELLNESS_CLEANUP_CONFIRMATION = "HAPUS DATA DUMMY WELLNESS";
export const WELLNESS_CLEANUP_TOKEN_TTL_MS = 30 * 60 * 1000;

export type WellnessCleanupCategory =
  | "activity"
  | "points_history"
  | "reset_all"
  | "full";

type TableSpec = {
  table: string;
  label: string;
  optional?: boolean;
  alsoEmployeeCode?: boolean;
};

export type CleanupTableResult = {
  table: string;
  label: string;
  count: number;
  available: boolean;
  message?: string;
};

export type CleanupPreview = {
  category: WellnessCleanupCategory;
  participant_ids: number[];
  participant_count: number;
  total_rows: number;
  tables: CleanupTableResult[];
  warnings: string[];
};

export type CleanupBackup = {
  marker: "WELLNESS_DUMMY_DATA_BACKUP_V109";
  created_at: string;
  category: WellnessCleanupCategory;
  participant_ids: number[];
  participants: any[];
  preview: CleanupPreview;
  rows: Record<string, any[]>;
  warnings: string[];
};

const ACTIVITY_TABLES: TableSpec[] = [
  {
    table: "wellness_daily_evidence",
    label: "Bukti harian",
    optional: true,
  },
  { table: "wellness_food_logs", label: "Input nutrisi" },
  { table: "wellness_activity_logs", label: "Workout, steps, dan aktivitas" },
  {
    table: "wellness_healthtalk_logs",
    label: "Kehadiran Health Talk",
    optional: true,
  },
  { table: "wellness_weight_logs", label: "Riwayat berat badan" },
];

const POINT_HISTORY_TABLES: TableSpec[] = [
  { table: "wellness_point_logs", label: "Point logs" },
  {
    table: "wellness_mini_mcu_logs",
    label: "Mini MCU",
    optional: true,
  },
  {
    table: "wellness_clinical_history",
    label: "Riwayat klinis",
    optional: true,
  },
  {
    table: "wellness_checkup_history",
    label: "Riwayat pemeriksaan",
    optional: true,
    alsoEmployeeCode: true,
  },
];

const FULL_EXTRA_TABLES: TableSpec[] = [
  {
    table: "wellness_coach_note_reads",
    label: "Status baca catatan Coach",
    optional: true,
  },
  {
    table: "wellness_coach_notes",
    label: "Catatan dan chat Coach",
    optional: true,
  },
  {
    table: "wellness_integrations",
    label: "Koneksi perangkat peserta",
    optional: true,
  },
  {
    table: "wellness_strava_consents",
    label: "Persetujuan Strava",
    optional: true,
  },
  {
    table: "wellness_strava_connections",
    label: "Koneksi Strava",
    optional: true,
  },
  {
    table: "wellness_participant_sessions",
    label: "Session Portal Peserta",
    optional: true,
  },
  {
    table: "wellness_signup_otps",
    label: "OTP pendaftaran peserta",
    optional: true,
  },
  {
    table: "wellness_participant_controls",
    label: "Pengaturan akses peserta",
    optional: true,
  },
];

const PARTICIPANT_TABLE: TableSpec = {
  table: "wellness_participants",
  label: "Master peserta dummy terpilih",
};

const PAGE_SIZE = 1000;
const FILTER_CHUNK_SIZE = 100;

function clean(value: any) {
  return String(value ?? "").trim();
}

function uniqueNumbers(values: any[]) {
  return Array.from(
    new Set(
      (values || [])
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  ).sort((left, right) => left - right);
}

function uniqueText(values: any[]) {
  return Array.from(
    new Set((values || []).map(clean).filter(Boolean)),
  ).sort((left, right) => left.localeCompare(right));
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function isMissingTableError(error: any) {
  const code = clean(error?.code).toUpperCase();
  const message = clean(error?.message || error?.details || error?.hint).toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    /relation .* does not exist/.test(message) ||
    /could not find the table/.test(message) ||
    /schema cache/.test(message)
  );
}

function dedupeRows(table: string, rows: any[]) {
  const map = new Map<string, any>();
  for (const row of rows || []) {
    const key =
      row?.id !== undefined && row?.id !== null
        ? `${table}:id:${row.id}`
        : `${table}:json:${JSON.stringify(row)}`;
    map.set(key, row);
  }
  return [...map.values()];
}

function specsForCategory(category: WellnessCleanupCategory) {
  if (category === "activity") return [...ACTIVITY_TABLES];
  if (category === "points_history") return [...POINT_HISTORY_TABLES];
  return [
    ...FULL_EXTRA_TABLES.slice(0, 1),
    ...ACTIVITY_TABLES.slice(0, 1),
    ...POINT_HISTORY_TABLES.slice(0, 1),
    ...ACTIVITY_TABLES.slice(1),
    ...POINT_HISTORY_TABLES.slice(1),
    ...FULL_EXTRA_TABLES.slice(1),
  ];
}

export function normalizeCleanupCategory(
  value: any,
): WellnessCleanupCategory | null {
  const category = clean(value).toLowerCase();
  return ["activity", "points_history", "reset_all", "full"].includes(category)
    ? (category as WellnessCleanupCategory)
    : null;
}

export function normalizeParticipantIds(values: any[]) {
  return uniqueNumbers(values);
}

export function wellnessCleanupEnabled() {
  return ["1", "true", "yes", "on"].includes(
    clean(process.env.ENABLE_WELLNESS_DATA_CLEANUP).toLowerCase(),
  );
}

function cleanupSigningSecret() {
  const secret = clean(
    process.env.WELLNESS_CLEANUP_SIGNING_SECRET ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE,
  );
  if (!secret) {
    throw new Error("Signing secret untuk Wellness cleanup belum tersedia.");
  }
  return secret;
}

async function selectRowsByColumn(
  supabase: any,
  table: string,
  column: string,
  values: Array<number | string>,
) {
  const allRows: any[] = [];
  if (!values.length) return allRows;

  for (const valueChunk of chunks(values, FILTER_CHUNK_SIZE)) {
    let offset = 0;
    while (true) {
      const result = await supabase
        .from(table)
        .select("*")
        .in(column, valueChunk)
        .order("id", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (result?.error) throw result.error;
      const rows = result?.data || [];
      allRows.push(...rows);
      if (rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }

  return allRows;
}

async function selectRowsForSpec(
  supabase: any,
  spec: TableSpec,
  participantIds: number[],
  employeeCodes: string[],
) {
  try {
    const rows = await selectRowsByColumn(
      supabase,
      spec.table,
      "participant_id",
      participantIds,
    );

    if (spec.alsoEmployeeCode && employeeCodes.length) {
      rows.push(
        ...(await selectRowsByColumn(
          supabase,
          spec.table,
          "employee_code",
          employeeCodes,
        )),
      );
    }

    return {
      available: true,
      rows: dedupeRows(spec.table, rows),
      message: "",
    };
  } catch (error: any) {
    if (spec.optional && isMissingTableError(error)) {
      return {
        available: false,
        rows: [] as any[],
        message: `Tabel ${spec.table} tidak tersedia pada schema saat ini.`,
      };
    }
    throw new Error(
      `Gagal membaca ${spec.table}: ${clean(error?.message || error)}`,
    );
  }
}

async function selectParticipantsByIds(supabase: any, participantIds: number[]) {
  const rows = await selectRowsByColumn(
    supabase,
    PARTICIPANT_TABLE.table,
    "id",
    participantIds,
  );
  return dedupeRows(PARTICIPANT_TABLE.table, rows);
}

function participantCodes(participants: any[]) {
  return uniqueText(
    (participants || []).flatMap((participant: any) => [
      participant?.code,
      participant?.employee_code,
      participant?.no_karyawan,
      participant?.kode,
    ]),
  );
}

export async function loadWellnessCleanupBootstrap(supabase: any) {
  const [companyResult, participantResult, groupResult] = await Promise.all([
    supabase
      .from("wellness_companies")
      .select("id,name,code,is_active")
      .order("name", { ascending: true }),
    supabase
      .from("wellness_participants")
      .select(
        "id,code,name,email,phone,is_active,wellness_company_id,wellness_kelompok_id,wellness_group_unit_id,portal_username,portal_email,portal_phone,portal_email_verified_at,portal_phone_verified_at,portal_registered_at,created_at",
      )
      .order("name", { ascending: true })
      .limit(10000),
    supabase
      .from("wellness_group_units")
      .select("id,name,unit_type,parent_id,company_id")
      .order("name", { ascending: true })
      .limit(10000),
  ]);

  if (companyResult.error) throw companyResult.error;
  if (participantResult.error) throw participantResult.error;
  if (groupResult.error) throw groupResult.error;

  const companyMap = new Map<number, any>(
    (companyResult.data || []).map((item: any) => [Number(item.id), item]),
  );
  const groupMap = new Map<number, any>(
    (groupResult.data || []).map((item: any) => [Number(item.id), item]),
  );

  const participants = (participantResult.data || []).map((item: any) => {
    const companyId = Number(item.wellness_company_id || 0);
    const groupId = Number(
      item.wellness_group_unit_id || item.wellness_kelompok_id || 0,
    );
    return {
      ...item,
      company_name: clean(companyMap.get(companyId)?.name) || "-",
      group_name: clean(groupMap.get(groupId)?.name) || "-",
    };
  });

  return {
    companies: companyResult.data || [],
    participants,
    categories: [
      {
        key: "activity",
        title: "Reset Data Aktivitas",
        description:
          "Menghapus nutrisi, workout/steps, Health Talk, berat badan, dan bukti harian peserta terpilih.",
      },
      {
        key: "points_history",
        title: "Reset Point & History",
        description:
          "Menghapus point logs, Mini MCU, riwayat klinis, dan riwayat pemeriksaan peserta terpilih.",
      },
      {
        key: "reset_all",
        title: "Reset Total & Akun Peserta",
        description:
          "Menghapus seluruh data dummy, session/OTP, koneksi perangkat, serta mengosongkan username dan email login. Master peserta tetap ada.",
      },
      {
        key: "full",
        title: "Hapus Peserta dari Daftar",
        description:
          "Menghapus seluruh data terkait lalu menghapus master peserta terpilih. Gunakan saat daftar peserta program berubah.",
      },
    ],
  };
}

export async function getSelectedWellnessParticipants(
  supabase: any,
  participantIds: number[],
) {
  return selectParticipantsByIds(supabase, participantIds);
}

export async function previewWellnessCleanup(
  supabase: any,
  category: WellnessCleanupCategory,
  participantIdsInput: number[],
) {
  const participantIds = uniqueNumbers(participantIdsInput);
  const participants = await selectParticipantsByIds(supabase, participantIds);
  const codes = participantCodes(participants);
  const tables: CleanupTableResult[] = [];
  const warnings: string[] = [];

  for (const spec of specsForCategory(category)) {
    const selected = await selectRowsForSpec(
      supabase,
      spec,
      participantIds,
      codes,
    );
    tables.push({
      table: spec.table,
      label: spec.label,
      count: selected.rows.length,
      available: selected.available,
      message: selected.message || undefined,
    });
    if (!selected.available && selected.message) warnings.push(selected.message);
  }

  if (category === "reset_all") {
    tables.push({
      table: "wellness_participants.portal_account",
      label: "Username, email, nomor HP, dan status verifikasi portal",
      count: participants.length,
      available: true,
    });
  }

  if (category === "full") {
    tables.push({
      table: PARTICIPANT_TABLE.table,
      label: PARTICIPANT_TABLE.label,
      count: participants.length,
      available: true,
    });
  }

  const totalRows = tables.reduce(
    (total, item) => total + (item.available ? item.count : 0),
    0,
  );

  return {
    category,
    participant_ids: participantIds,
    participant_count: participants.length,
    total_rows: totalRows,
    tables,
    warnings,
  } satisfies CleanupPreview;
}

export async function buildWellnessCleanupBackup(
  supabase: any,
  category: WellnessCleanupCategory,
  participantIdsInput: number[],
) {
  const participantIds = uniqueNumbers(participantIdsInput);
  const participants = await selectParticipantsByIds(supabase, participantIds);
  const codes = participantCodes(participants);
  const rows: Record<string, any[]> = {};
  const warnings: string[] = [];

  for (const spec of specsForCategory(category)) {
    const selected = await selectRowsForSpec(
      supabase,
      spec,
      participantIds,
      codes,
    );
    rows[spec.table] = selected.rows;
    if (!selected.available && selected.message) warnings.push(selected.message);
  }

  if (category === "reset_all" || category === "full") {
    rows[PARTICIPANT_TABLE.table] = participants;
  }

  const preview: CleanupPreview = {
    category,
    participant_ids: participantIds,
    participant_count: participants.length,
    total_rows: Object.values(rows).reduce(
      (total, tableRows) => total + tableRows.length,
      0,
    ),
    tables: [
      ...specsForCategory(category).map((spec) => ({
        table: spec.table,
        label: spec.label,
        count: rows[spec.table]?.length || 0,
        available: !warnings.some((warning) => warning.includes(spec.table)),
      })),
      ...(category === "reset_all"
        ? [
            {
              table: "wellness_participants.portal_account",
              label: "Username, email, nomor HP, dan status verifikasi portal",
              count: participants.length,
              available: true,
            },
          ]
        : []),
      ...(category === "full"
        ? [
            {
              table: PARTICIPANT_TABLE.table,
              label: PARTICIPANT_TABLE.label,
              count: participants.length,
              available: true,
            },
          ]
        : []),
    ],
    warnings,
  };

  return {
    marker: "WELLNESS_DUMMY_DATA_BACKUP_V109",
    created_at: new Date().toISOString(),
    category,
    participant_ids: participantIds,
    participants,
    preview,
    rows,
    warnings,
  } satisfies CleanupBackup;
}

function encodeBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function signWellnessCleanupBackup(backup: CleanupBackup) {
  const payload = {
    marker: backup.marker,
    category: backup.category,
    participant_ids: backup.participant_ids,
    backup_created_at: backup.created_at,
    exp: Date.now() + WELLNESS_CLEANUP_TOKEN_TTL_MS,
  };
  const encoded = encodeBase64Url(JSON.stringify(payload));
  const signature = createHmac("sha256", cleanupSigningSecret())
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyWellnessCleanupBackupToken({
  token,
  category,
  participantIds,
}: {
  token: any;
  category: WellnessCleanupCategory;
  participantIds: number[];
}) {
  const text = clean(token);
  const [encoded, signature] = text.split(".");
  if (!encoded || !signature) return false;

  const expected = createHmac("sha256", cleanupSigningSecret())
    .update(encoded)
    .digest("base64url");

  const suppliedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return false;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(encoded));
    const tokenIds = uniqueNumbers(payload?.participant_ids || []);
    const expectedIds = uniqueNumbers(participantIds);
    return (
      payload?.marker === "WELLNESS_DUMMY_DATA_BACKUP_V109" &&
      payload?.category === category &&
      Number(payload?.exp || 0) > Date.now() &&
      JSON.stringify(tokenIds) === JSON.stringify(expectedIds)
    );
  } catch {
    return false;
  }
}

async function deleteByColumn(
  supabase: any,
  table: string,
  column: string,
  values: Array<number | string>,
  optional: boolean,
) {
  let deleted = 0;
  if (!values.length) return { available: true, deleted, message: "" };

  for (const valueChunk of chunks(values, FILTER_CHUNK_SIZE)) {
    const result = await supabase
      .from(table)
      .delete({ count: "exact" })
      .in(column, valueChunk);

    if (result?.error) {
      if (optional && isMissingTableError(result.error)) {
        return {
          available: false,
          deleted: 0,
          message: `Tabel ${table} tidak tersedia pada schema saat ini.`,
        };
      }
      throw new Error(
        `Gagal menghapus ${table}: ${clean(result.error.message || result.error)}`,
      );
    }
    deleted += Number(result?.count || 0);
  }

  return { available: true, deleted, message: "" };
}

async function deleteForSpec(
  supabase: any,
  spec: TableSpec,
  participantIds: number[],
  employeeCodes: string[],
) {
  const byParticipant = await deleteByColumn(
    supabase,
    spec.table,
    "participant_id",
    participantIds,
    Boolean(spec.optional),
  );
  if (!byParticipant.available) return byParticipant;

  let deleted = byParticipant.deleted;
  if (spec.alsoEmployeeCode && employeeCodes.length) {
    const byCode = await deleteByColumn(
      supabase,
      spec.table,
      "employee_code",
      employeeCodes,
      Boolean(spec.optional),
    );
    if (!byCode.available) return byCode;
    deleted += byCode.deleted;
  }

  return { available: true, deleted, message: "" };
}

async function resetParticipantPortalAccounts(
  supabase: any,
  participantIds: number[],
) {
  let updated = 0;
  const updatedAt = new Date().toISOString();

  for (const valueChunk of chunks(participantIds, FILTER_CHUNK_SIZE)) {
    const result = await supabase
      .from(PARTICIPANT_TABLE.table)
      .update({
        portal_username: null,
        portal_email: null,
        portal_phone: null,
        portal_email_verified_at: null,
        portal_phone_verified_at: null,
        portal_registered_at: null,
        updated_at: updatedAt,
      })
      .in("id", valueChunk)
      .select("id");

    if (result?.error) {
      throw new Error(
        `Gagal mereset akun/email portal peserta: ${clean(
          result.error.message || result.error,
        )}`,
      );
    }
    updated += Number(result?.data?.length || 0);
  }

  return updated;
}

export async function executeWellnessCleanup(
  supabase: any,
  category: WellnessCleanupCategory,
  participantIdsInput: number[],
) {
  const participantIds = uniqueNumbers(participantIdsInput);
  const participants = await selectParticipantsByIds(supabase, participantIds);
  const codes = participantCodes(participants);
  const results: Array<CleanupTableResult & { deleted: number }> = [];
  const warnings: string[] = [];

  for (const spec of specsForCategory(category)) {
    const result = await deleteForSpec(
      supabase,
      spec,
      participantIds,
      codes,
    );
    results.push({
      table: spec.table,
      label: spec.label,
      count: result.deleted,
      deleted: result.deleted,
      available: result.available,
      message: result.message || undefined,
    });
    if (!result.available && result.message) warnings.push(result.message);
  }

  let updatedRows = 0;

  if (category === "reset_all") {
    updatedRows = await resetParticipantPortalAccounts(
      supabase,
      participantIds,
    );
    results.push({
      table: "wellness_participants.portal_account",
      label: "Username, email, nomor HP, dan status verifikasi portal",
      count: updatedRows,
      deleted: 0,
      available: true,
    });
  }

  if (category === "full") {
    const parentResult = await deleteByColumn(
      supabase,
      PARTICIPANT_TABLE.table,
      "id",
      participantIds,
      false,
    );
    results.push({
      table: PARTICIPANT_TABLE.table,
      label: PARTICIPANT_TABLE.label,
      count: parentResult.deleted,
      deleted: parentResult.deleted,
      available: true,
    });
  }

  return {
    category,
    participant_ids: participantIds,
    deleted_rows: results.reduce(
      (total, item) => total + Number(item.deleted || 0),
      0,
    ),
    updated_rows: updatedRows,
    tables: results,
    warnings,
  };
}

export async function writeWellnessCleanupAudit(
  supabase: any,
  user: any,
  action: string,
  payload: any,
) {
  const numericUserId = Number(user?.id);
  const auditPayload = {
    user_id: Number.isFinite(numericUserId) ? numericUserId : null,
    action,
    participant_id: null,
    parameter_id: null,
    old_value: null,
    new_value: JSON.stringify({
      marker: "WELLNESS_DUMMY_DATA_MAINTENANCE_V109",
      actor: {
        id: user?.id ?? null,
        username: clean(user?.username),
        name: clean(user?.name),
        role: clean(user?.role),
      },
      ...payload,
    }),
  };

  const result = await supabase.from("audit_logs").insert(auditPayload);
  if (result?.error) {
    throw new Error(
      `Audit log gagal disimpan: ${clean(result.error.message || result.error)}`,
    );
  }
}
