import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

// WELLNESS_LOGIN_MONITORING_EXCEL_V126N
// Export daftar peserta yang belum pernah berhasil login ke Portal Peserta.
// Sumber status login: wellness_participant_sessions.
// Tidak mengubah schema atau data database.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_ROLES = new Set([
  "admin",
  "super_admin",
  "supervisor",
  "doctor",
  "wellness_admin",
]);

function clean(value: any) {
  return String(value ?? "").trim();
}

function numberValue(value: any) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function active(value: any) {
  return ![
    false,
    0,
    "0",
    "false",
    "inactive",
    "nonaktif",
  ].includes(
    typeof value === "string"
      ? value.toLowerCase()
      : value,
  );
}

function safeFileText(value: any) {
  return clean(value)
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80);
}

function dateStamp() {
  return new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    },
  )
    .format(new Date())
    .replace(/-/g, "");
}

function dateTimeLabel(value: any) {
  const text = clean(value);

  if (!text) return "";

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    return text;
  }

  return new Intl.DateTimeFormat(
    "id-ID",
    {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    },
  ).format(date);
}

function columnName(index: number) {
  let value = index + 1;
  let result = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;

    result =
      String.fromCharCode(
        65 + remainder,
      ) + result;

    value = Math.floor(
      (value - 1) / 26,
    );
  }

  return result;
}

function makeSheet(
  headers: string[],
  rows: Array<
    Array<
      string |
      number |
      boolean |
      null
    >
  >,
  widths: number[],
) {
  const sheet =
    XLSX.utils.aoa_to_sheet([
      headers,
      ...rows,
    ]);

  sheet["!cols"] =
    headers.map(
      (_, index) => ({
        wch: widths[index] || 16,
      }),
    );

  if (headers.length > 0) {
    const lastColumn =
      columnName(headers.length - 1);

    sheet["!autofilter"] = {
      ref:
        `A1:${lastColumn}${Math.max(
          rows.length + 1,
          1,
        )}`,
    };
  }

  return sheet;
}

async function safeRows(
  query: any,
  label: string,
) {
  try {
    const result = await query;

    if (result?.error) {
      console.warn(
        `LOGIN_MONITORING_${label}_WARNING`,
        result.error,
      );

      return [];
    }

    return result?.data || [];
  } catch (error) {
    console.warn(
      `LOGIN_MONITORING_${label}_ERROR`,
      error,
    );

    return [];
  }
}

function participantCompanyId(
  participant: any,
) {
  return numberValue(
    participant?.wellness_company_id ||
      participant?.company_id,
  );
}

function participantKelompokId(
  participant: any,
) {
  return numberValue(
    participant?.wellness_kelompok_id ||
      participant?.kelompok_id,
  );
}

function participantGroupId(
  participant: any,
) {
  return numberValue(
    participant
      ?.wellness_group_unit_id ||
      participant?.group_unit_id ||
      participant?.group_id,
  );
}

function participantCode(
  participant: any,
) {
  return clean(
    participant?.code ||
      participant?.employee_code ||
      participant?.employee_no ||
      participant?.no_karyawan,
  );
}

function participantName(
  participant: any,
) {
  return clean(
    participant?.name ||
      participant?.employee_name ||
      participant?.full_name,
  );
}

function participantPhone(
  participant: any,
) {
  return clean(
    participant?.phone ||
      participant?.phone_number ||
      participant?.mobile ||
      participant?.no_hp,
  );
}

function participantEmail(
  participant: any,
) {
  return clean(participant?.email);
}

function groupRelatedIds(
  participant: any,
  groupById: Map<number, any>,
) {
  const result = new Set<number>();

  const directGroupId =
    participantGroupId(participant);

  const kelompokId =
    participantKelompokId(participant);

  if (directGroupId > 0) {
    result.add(directGroupId);

    const directGroup =
      groupById.get(directGroupId);

    const parentId =
      numberValue(
        directGroup?.parent_id,
      );

    if (parentId > 0) {
      result.add(parentId);
    }
  }

  if (kelompokId > 0) {
    result.add(kelompokId);
  }

  return Array.from(result);
}

function resolveGroupName(
  participant: any,
  groupById: Map<number, any>,
) {
  const groupId =
    participantGroupId(participant);

  const kelompokId =
    participantKelompokId(participant);

  const group =
    groupById.get(groupId);

  const kelompok =
    groupById.get(kelompokId);

  return (
    clean(
      participant?.group_name ||
        participant?.group_unit_name,
    ) ||
    clean(group?.name) ||
    clean(
      participant?.kelompok ||
        participant?.kelompok_name,
    ) ||
    clean(kelompok?.name) ||
    "-"
  );
}

function resolveKelompokName(
  participant: any,
  groupById: Map<number, any>,
) {
  const kelompokId =
    participantKelompokId(participant);

  const directGroupId =
    participantGroupId(participant);

  const directGroup =
    groupById.get(directGroupId);

  const parentId =
    numberValue(
      directGroup?.parent_id,
    );

  return (
    clean(
      participant?.kelompok ||
        participant?.kelompok_name,
    ) ||
    clean(
      groupById.get(kelompokId)?.name,
    ) ||
    clean(
      groupById.get(parentId)?.name,
    ) ||
    clean(directGroup?.name) ||
    "-"
  );
}

export async function GET(
  request: NextRequest,
) {
  try {
    const user: any =
      getSessionUser(request);

    if (!user) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Session Admin belum aktif.",
        },
        { status: 401 },
      );
    }

    const role =
      clean(user.role).toLowerCase();

    if (!ADMIN_ROLES.has(role)) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Akun ini tidak memiliki akses export monitoring login.",
        },
        { status: 403 },
      );
    }

    const companyFilter =
      numberValue(
        request.nextUrl.searchParams
          .get("company_id"),
      );

    const coachFilter =
      numberValue(
        request.nextUrl.searchParams
          .get("coach_id"),
      );

    const groupFilter =
      numberValue(
        request.nextUrl.searchParams
          .get("group_id"),
      );

    const supabase =
      getSupabaseAdmin();

    const [
      companyRows,
      participantRows,
      groupRows,
      assignmentRows,
      coachRows,
      sessionRows,
    ] = await Promise.all([
      safeRows(
        supabase
          .from(
            "wellness_companies",
          )
          .select("*")
          .order(
            "name",
            { ascending: true },
          )
          .limit(1000),
        "COMPANIES",
      ),

      safeRows(
        supabase
          .from(
            "wellness_participants",
          )
          .select("*")
          .order(
            "name",
            { ascending: true },
          )
          .limit(10000),
        "PARTICIPANTS",
      ),

      safeRows(
        supabase
          .from(
            "wellness_group_units",
          )
          .select("*")
          .order(
            "name",
            { ascending: true },
          )
          .limit(5000),
        "GROUPS",
      ),

      safeRows(
        supabase
          .from(
            "wellness_coach_group_assignments",
          )
          .select("*")
          .limit(10000),
        "ASSIGNMENTS",
      ),

      safeRows(
        supabase
          .from(
            "wellness_coach_users",
          )
          .select("*")
          .order(
            "name",
            { ascending: true },
          )
          .limit(2000),
        "COACHES",
      ),

      safeRows(
        supabase
          .from(
            "wellness_participant_sessions",
          )
          .select(
            "id,participant_id,created_at,expires_at",
          )
          .order(
            "created_at",
            { ascending: true },
          )
          .limit(50000),
        "SESSIONS",
      ),
    ]);

    const companies =
      companyRows.filter(
        (item: any) =>
          active(item?.is_active),
      );

    const participants =
      participantRows.filter(
        (item: any) =>
          active(item?.is_active),
      );

    const groups =
      groupRows.filter(
        (item: any) =>
          active(item?.is_active),
      );

    const assignments =
      assignmentRows.filter(
        (item: any) =>
          active(item?.is_active),
      );

    const coaches =
      coachRows.filter(
        (item: any) =>
          active(item?.is_active),
      );

    const companyById =
      new Map<number, any>(
        companies.map(
          (item: any) => [
            numberValue(item.id),
            item,
          ],
        ),
      );

    const groupById =
      new Map<number, any>(
        groups.map(
          (item: any) => [
            numberValue(item.id),
            item,
          ],
        ),
      );

    const coachById =
      new Map<number, any>(
        coaches.map(
          (item: any) => [
            numberValue(item.id),
            item,
          ],
        ),
      );

    const assignmentByGroupId =
      new Map<number, any[]>();

    for (
      const assignment of assignments
    ) {
      const groupId =
        numberValue(
          assignment
            ?.wellness_group_unit_id ||
            assignment?.group_unit_id ||
            assignment?.group_id,
        );

      if (!(groupId > 0)) continue;

      const current =
        assignmentByGroupId.get(
          groupId,
        ) || [];

      current.push(assignment);

      assignmentByGroupId.set(
        groupId,
        current,
      );
    }

    const sessionsByParticipant =
      new Map<number, any[]>();

    for (
      const session of sessionRows
    ) {
      const participantId =
        numberValue(
          session?.participant_id,
        );

      if (!(participantId > 0)) {
        continue;
      }

      const current =
        sessionsByParticipant.get(
          participantId,
        ) || [];

      current.push(session);

      sessionsByParticipant.set(
        participantId,
        current,
      );
    }

    const records =
      participants
        .map(
          (participant: any) => {
            const participantId =
              numberValue(
                participant.id,
              );

            const companyId =
              participantCompanyId(
                participant,
              );

            const company =
              companyById.get(
                companyId,
              );

            const relatedGroupIds =
              groupRelatedIds(
                participant,
                groupById,
              );

            const participantAssignments =
              relatedGroupIds.flatMap(
                (groupId) =>
                  assignmentByGroupId.get(
                    groupId,
                  ) || [],
              );

            const uniqueCoachIds =
              Array.from(
                new Set(
                  participantAssignments
                    .map(
                      (assignment: any) =>
                        numberValue(
                          assignment
                            ?.coach_user_id ||
                            assignment
                              ?.wellness_coach_user_id ||
                            assignment?.coach_id,
                        ),
                    )
                    .filter(Boolean),
                ),
              );

            const participantCoaches =
              uniqueCoachIds
                .map(
                  (coachId) =>
                    coachById.get(
                      coachId,
                    ),
                )
                .filter(Boolean);

            const participantSessions =
              [
                ...(
                  sessionsByParticipant.get(
                    participantId,
                  ) || []
                ),
              ].sort(
                (
                  left: any,
                  right: any,
                ) =>
                  clean(
                    left?.created_at,
                  ).localeCompare(
                    clean(
                      right?.created_at,
                    ),
                  ),
              );

            const firstSession =
              participantSessions[0] ||
              null;

            const lastSession =
              participantSessions[
                participantSessions.length -
                  1
              ] || null;

            const groupId =
              participantGroupId(
                participant,
              );

            const kelompokId =
              participantKelompokId(
                participant,
              );

            return {
              participant_id:
                participantId,
              company_id:
                companyId,
              company_name:
                clean(company?.name) ||
                clean(
                  participant
                    ?.company_name ||
                    participant?.company,
                ) ||
                "-",
              kelompok_id:
                kelompokId,
              kelompok_name:
                resolveKelompokName(
                  participant,
                  groupById,
                ),
              group_id:
                groupId,
              group_name:
                resolveGroupName(
                  participant,
                  groupById,
                ),
              coach_ids:
                uniqueCoachIds,
              coach_names:
                participantCoaches
                  .map(
                    (coach: any) =>
                      clean(
                        coach?.name ||
                          coach
                            ?.full_name ||
                          coach?.email,
                      ),
                  )
                  .filter(Boolean)
                  .join(", ") || "-",
              coach_phones:
                participantCoaches
                  .map(
                    (coach: any) =>
                      clean(
                        coach?.phone ||
                          coach
                            ?.phone_number ||
                          coach?.mobile,
                      ),
                  )
                  .filter(Boolean)
                  .join(", "),
              coach_emails:
                participantCoaches
                  .map(
                    (coach: any) =>
                      clean(
                        coach?.email,
                      ),
                  )
                  .filter(Boolean)
                  .join(", "),
              participant_name:
                participantName(
                  participant,
                ),
              participant_code:
                participantCode(
                  participant,
                ),
              participant_phone:
                participantPhone(
                  participant,
                ),
              participant_email:
                participantEmail(
                  participant,
                ),
              session_count:
                participantSessions.length,
              login_status:
                participantSessions.length >
                0
                  ? "Sudah Login"
                  : "Belum Login",
              first_login_at:
                firstSession?.created_at ||
                "",
              last_login_at:
                lastSession?.created_at ||
                "",
            };
          },
        )
        .filter(
          (record: any) => {
            if (
              companyFilter > 0 &&
              record.company_id !==
                companyFilter
            ) {
              return false;
            }

            if (
              groupFilter > 0 &&
              ![
                record.group_id,
                record.kelompok_id,
              ].includes(groupFilter)
            ) {
              return false;
            }

            if (
              coachFilter > 0 &&
              !record.coach_ids.includes(
                coachFilter,
              )
            ) {
              return false;
            }

            return true;
          },
        )
        .sort(
          (
            left: any,
            right: any,
          ) =>
            left.company_name.localeCompare(
              right.company_name,
            ) ||
            left.kelompok_name.localeCompare(
              right.kelompok_name,
            ) ||
            left.coach_names.localeCompare(
              right.coach_names,
            ) ||
            left.participant_name.localeCompare(
              right.participant_name,
            ),
        );

    const notLoggedIn =
      records.filter(
        (item: any) =>
          item.session_count === 0,
      );

    const summaryMap =
      new Map<string, any>();

    for (
      const record of records
    ) {
      const key = [
        record.company_id,
        record.kelompok_id ||
          record.group_id,
        record.coach_names,
      ].join(":");

      if (!summaryMap.has(key)) {
        summaryMap.set(
          key,
          {
            company_name:
              record.company_name,
            kelompok_name:
              record.kelompok_name,
            group_name:
              record.group_name,
            coach_names:
              record.coach_names,
            coach_phones:
              record.coach_phones,
            coach_emails:
              record.coach_emails,
            total: 0,
            logged_in: 0,
            not_logged_in: 0,
          },
        );
      }

      const summary =
        summaryMap.get(key);

      summary.total += 1;

      if (
        record.session_count > 0
      ) {
        summary.logged_in += 1;
      } else {
        summary.not_logged_in += 1;
      }
    }

    const summaryRows =
      Array.from(
        summaryMap.values(),
      )
        .sort(
          (
            left: any,
            right: any,
          ) =>
            left.company_name.localeCompare(
              right.company_name,
            ) ||
            left.kelompok_name.localeCompare(
              right.kelompok_name,
            ) ||
            left.coach_names.localeCompare(
              right.coach_names,
            ),
        )
        .map(
          (
            summary: any,
            index: number,
          ) => [
            index + 1,
            summary.company_name,
            summary.kelompok_name,
            summary.group_name,
            summary.coach_names,
            summary.coach_phones,
            summary.coach_emails,
            summary.total,
            summary.logged_in,
            summary.not_logged_in,
            summary.total > 0
              ? Math.round(
                  (
                    summary.logged_in /
                    summary.total
                  ) *
                    1000,
                ) / 10
              : 0,
          ],
        );

    const notLoggedInRows =
      notLoggedIn.map(
        (
          record: any,
          index: number,
        ) => [
          index + 1,
          record.company_name,
          record.kelompok_name,
          record.group_name,
          record.coach_names,
          record.coach_phones,
          record.coach_emails,
          record.participant_name,
          record.participant_code,
          record.participant_phone,
          record.participant_email,
          "Belum Login",
          "",
          "",
          "",
        ],
      );

    const allParticipantRows =
      records.map(
        (
          record: any,
          index: number,
        ) => [
          index + 1,
          record.company_name,
          record.kelompok_name,
          record.group_name,
          record.coach_names,
          record.participant_name,
          record.participant_code,
          record.participant_phone,
          record.participant_email,
          record.login_status,
          record.session_count,
          dateTimeLabel(
            record.first_login_at,
          ),
          dateTimeLabel(
            record.last_login_at,
          ),
        ],
      );

    const workbook =
      XLSX.utils.book_new();

    workbook.Props = {
      Title:
        "Monitoring Login Peserta Wellness",
      Subject:
        "Peserta sudah dan belum login",
      Author:
        clean(
          user?.name ||
            user?.username,
        ) ||
        "Harmony Health Admin",
      Company: "inHARMONY",
      CreatedDate: new Date(),
    };

    XLSX.utils.book_append_sheet(
      workbook,
      makeSheet(
        [
          "No",
          "Perusahaan",
          "Kelompok",
          "Group",
          "Coach",
          "No. HP Coach",
          "Email Coach",
          "Total Peserta",
          "Sudah Login",
          "Belum Login",
          "Persentase Login (%)",
        ],
        summaryRows,
        [
          8,
          28,
          30,
          25,
          28,
          20,
          30,
          15,
          15,
          15,
          22,
        ],
      ),
      "Ringkasan Kelompok",
    );

    XLSX.utils.book_append_sheet(
      workbook,
      makeSheet(
        [
          "No",
          "Perusahaan",
          "Kelompok",
          "Group",
          "Coach",
          "No. HP Coach",
          "Email Coach",
          "Nama Peserta",
          "Kode Karyawan",
          "No. HP Peserta",
          "Email Peserta",
          "Status Login",
          "Status Follow-up",
          "Tanggal Dihubungi",
          "Catatan Coach",
        ],
        notLoggedInRows,
        [
          8,
          28,
          30,
          25,
          28,
          20,
          30,
          30,
          18,
          20,
          32,
          16,
          22,
          20,
          45,
        ],
      ),
      "Belum Login",
    );

    XLSX.utils.book_append_sheet(
      workbook,
      makeSheet(
        [
          "No",
          "Perusahaan",
          "Kelompok",
          "Group",
          "Coach",
          "Nama Peserta",
          "Kode Karyawan",
          "No. HP Peserta",
          "Email Peserta",
          "Status Login",
          "Jumlah Sesi",
          "Pertama Login",
          "Login Terakhir",
        ],
        allParticipantRows,
        [
          8,
          28,
          30,
          25,
          28,
          30,
          18,
          20,
          32,
          16,
          14,
          24,
          24,
        ],
      ),
      "Semua Peserta",
    );

    const output =
      XLSX.write(
        workbook,
        {
          type: "buffer",
          bookType: "xlsx",
          compression: true,
        },
      );

    const selectedCompany =
      companyFilter > 0
        ? companyById.get(
            companyFilter,
          )
        : null;

    const fileScope =
      selectedCompany
        ? safeFileText(
            selectedCompany.name,
          )
        : "Semua_Perusahaan";

    const fileName =
      `Monitoring_Login_Peserta_${fileScope}_${dateStamp()}.xlsx`;

    return new NextResponse(
      output,
      {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition":
            `attachment; filename="${fileName}"`,
          "Cache-Control":
            "no-store, max-age=0",
          "X-Total-Participants":
            String(records.length),
          "X-Not-Logged-In":
            String(
              notLoggedIn.length,
            ),
        },
      },
    );
  } catch (error: any) {
    console.error(
      "WELLNESS_LOGIN_MONITORING_EXCEL_V126N_ERROR",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        message:
          error?.message ||
          "Export monitoring login peserta gagal.",
      },
      { status: 500 },
    );
  }
}
