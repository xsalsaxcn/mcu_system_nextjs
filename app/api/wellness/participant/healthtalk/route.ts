// WELLNESS_PARTICIPANT_HEALTHTALK_GOOGLE_SHEET_ONLY_V406
// Participant Health Talk route using the existing Apps Script v370.
// Storage:
// - evidence -> Google Drive by action=uploadEvidence
// - health talk row -> Google Sheet Form Responses
// - no insert into wellness_healthtalk_logs
//
// UI support:
// - GET reads participant Health Talk logs from Google Sheet
// - POST returns a log object so frontend can display immediately
//
// POINT RULES:
// - Online / Daring Health Talk = +10
// - Offline / Luring Health Talk + evidence photo = +20
// - Online OR any submission without evidence = +10

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";
import {
  buildBaseFormRow,
  getCompanyName,
  getDriveUrl,
  getPreviewUrl,
  getWellnessSheetName,
  postToWellnessWebhook,
  safeLogDate,
  uploadEvidenceToDrive,
} from "@/lib/wellness/googleSheetWebhook";
import {
  fetchWellnessGoogleSheetRows,
  googleSheetRowsToHealthtalkLogs,
} from "@/lib/wellness/googleSheetResponses";
import { healthtalkPoints, pointNumber } from "@/lib/wellness/pointRules";
import { insertPointOnce } from "@/lib/wellness/pointWriter";

export const runtime = "nodejs";

const MARKER = "WELLNESS_PARTICIPANT_HEALTHTALK_GOOGLE_SHEET_ONLY_V406";

function clean(value: any) {
  return String(value ?? "").trim();
}

function hasEvidenceResult(evidenceResult: any) {
  return Boolean(
    getDriveUrl(evidenceResult) ||
      getPreviewUrl(evidenceResult) ||
      evidenceResult?.fileId ||
      evidenceResult?.publicUrl ||
      evidenceResult?.driveUrl ||
      evidenceResult?.previewUrl ||
      evidenceResult?.thumbnailUrl
  );
}

function calculateHealthtalkPoint(params: {
  healthtalkType: string;
  hasEvidence: boolean;
}) {
  return healthtalkPoints(params);
}

function pointMessage(params: {
  healthtalkType: string;
  point: number;
  hasEvidence: boolean;
}) {
  if (params.point > 0) {
    return `Health Talk berhasil masuk Google Sheet · Point +${params.point}`;
  }

  return params.hasEvidence
    ? "Health Talk berhasil masuk Google Sheet."
    : "Health Talk berhasil masuk Google Sheet tanpa bukti · Point +10";
}

async function getParticipant(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const participant = await getParticipantFromPortalSession(supabase, req);

  return { supabase, participant };
}

async function parseRequestBody(req: NextRequest) {
  const contentType = clean(req.headers.get("content-type")).toLowerCase();

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const body: Record<string, any> = {};

    for (const [key, value] of formData.entries()) {
      if (typeof value === "string") body[key] = value;
    }

    const evidence =
      formData.get("healthtalk_evidence") ||
      formData.get("evidence") ||
      formData.get("photo") ||
      formData.get("file") ||
      null;

    return { body, evidence };
  }

  const body = await req.json().catch(() => ({}));

  return {
    body: body || {},
    evidence: null,
  };
}

function buildHealthtalkRow(params: {
  participant: any;
  body: any;
  logDate: string;
  healthtalkType: string;
  healthtalkTitle: string;
  notes: string | null;
  evidenceResult: any;
  calculatedPoint: number;
}) {
  const row: any = buildBaseFormRow({
    participant: params.participant,
    body: params.body,
    logDate: params.logDate,
    logType: "healthtalk",
    marker: MARKER,
  });

  const driveUrl = getDriveUrl(params.evidenceResult);
  const previewUrl = getPreviewUrl(params.evidenceResult);

  row["Healthtalk/Seminar"] = "Ya";
  row["Jenis Healthtalk"] = params.healthtalkType;
  row["Tanggal Healthtalk"] = params.logDate;
  row["Bukti Healthtalk"] = driveUrl;
  row["Preview Bukti Healthtalk"] = previewUrl;

  row["Add Options"] = [params.healthtalkType, params.healthtalkTitle]
    .filter(Boolean)
    .join(" - ");

  row["Catatan Nutrisi"] = params.notes || "";
  row["Evidence Count"] = driveUrl ? 1 : 0;
  row["Total Point"] = params.calculatedPoint;
  row["Marker"] = MARKER;

  return row;
}

function buildReturnedLog(params: {
  participant: any;
  logDate: string;
  healthtalkType: string;
  healthtalkTitle: string;
  notes: string | null;
  evidenceResult: any;
  sheetResult: any;
  calculatedPoint: number;
  body: any;
}) {
  return {
    id: `sheet-healthtalk-${params.sheetResult?.rowNumber || Date.now()}`,
    participant_id: Number(params.participant.id),
    participant_code: params.participant.code || "",
    log_date: params.logDate,
    event_date: params.logDate,
    log_time: new Date().toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    created_at: new Date().toISOString(),
    healthtalk_type: params.healthtalkType,
    attendance_type: params.healthtalkType,
    healthtalk_title: params.healthtalkTitle,
    title: params.healthtalkTitle,
    notes: params.notes,
    evidence_url: getDriveUrl(params.evidenceResult) || null,
    evidence_preview_url: getPreviewUrl(params.evidenceResult) || null,
    points: params.calculatedPoint,
    point: params.calculatedPoint,
    total_points: params.calculatedPoint,
    source: "google_sheet",
    google_drive: params.evidenceResult || null,
    google_sheet: params.sheetResult || null,
    raw_payload: {
      ...params.body,
      "Total Point": params.calculatedPoint,
      point_rule:
        "Offline/Luring dengan bukti = +20. Online atau tanpa bukti = +10.",
      has_evidence: hasEvidenceResult(params.evidenceResult),
      marker: MARKER,
    },
  };
}

export async function GET(req: NextRequest) {
  const { participant } = await getParticipant(req);

  if (!participant?.id) {
    return NextResponse.json(
      {
        ok: false,
        message: "OTP/session peserta belum aktif.",
      },
      { status: 401 }
    );
  }

  try {
    const sheetResult = await fetchWellnessGoogleSheetRows({
      participantId: participant.id,
      code: participant.code,
      logType: "healthtalk",
      limit: 1000,
    });

    if (!sheetResult.ok) {
      return NextResponse.json(
        {
          ok: false,
          mode: "google_sheet_only",
          message: sheetResult.message || "Gagal membaca Health Talk dari Google Sheet.",
          logs: [],
        },
        { status: 500 }
      );
    }

    const logs = googleSheetRowsToHealthtalkLogs(sheetResult.rows || [])
      .filter((row: any) => {
        const id = Number(row.participant_id);
        const code = String(row.participant_code || "").trim();

        return id === Number(participant.id) || code === String(participant.code || "").trim();
      })
      .sort((a: any, b: any) =>
        String(b.created_at || b.log_date || "").localeCompare(
          String(a.created_at || a.log_date || "")
        )
      )
      .slice(0, 100);

    return NextResponse.json({
      ok: true,
      mode: "google_sheet_only",
      participant_id: participant.id,
      logs,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        mode: "google_sheet_only",
        message: "Gagal membaca Health Talk dari Google Sheet.",
        detail: error?.message || String(error),
        logs: [],
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const { supabase, participant } = await getParticipant(req);

  if (!participant?.id) {
    return NextResponse.json(
      {
        ok: false,
        message: "OTP/session peserta belum aktif.",
      },
      { status: 401 }
    );
  }

  try {
    const { body, evidence } = await parseRequestBody(req);

    const logDate = safeLogDate(
      body?.log_date || body?.logDate || body?.healthtalk_date
    );

    const healthtalkType =
      clean(body?.healthtalk_type || body?.healthtalkType) || "Online";

    const healthtalkTitle =
      clean(
        body?.healthtalk_title ||
          body?.healthtalkTitle ||
          body?.title ||
          body?.topic
      ) || "Health Talk / Seminar";

    const notes = clean(body?.notes || body?.catatan) || null;
    const companyName = getCompanyName(participant, body);

    if (!healthtalkTitle) {
      return NextResponse.json(
        {
          ok: false,
          message: "Judul / Topik Health Talk wajib diisi.",
        },
        { status: 400 }
      );
    }

    const evidenceResult = evidence
      ? await uploadEvidenceToDrive({
          file: evidence,
          participant,
          companyName,
          category: "Health Talk",
          activeTab: "healthtalk",
          fieldKey: "healthtalk_evidence",
          logDate,
          marker: MARKER,
        })
      : null;

    const hasEvidence = hasEvidenceResult(evidenceResult);

    const calculatedPoint = calculateHealthtalkPoint({
      healthtalkType,
      hasEvidence,
    });

    const sheetRow = buildHealthtalkRow({
      participant,
      body,
      logDate,
      healthtalkType,
      healthtalkTitle,
      notes,
      evidenceResult,
      calculatedPoint,
    });

    const sheetResult = await postToWellnessWebhook({
      sheet: getWellnessSheetName(),
      row: sheetRow,
      marker: MARKER,
    });

    const log = buildReturnedLog({
      participant,
      logDate,
      healthtalkType,
      healthtalkTitle,
      notes,
      evidenceResult,
      sheetResult,
      calculatedPoint,
      body,
    });

    const sheetRowNumber = pointNumber(
      sheetResult?.rowNumber || sheetResult?.row_number || sheetResult?._rowNumber,
    );
    const pointResult = await insertPointOnce({
      supabase,
      participant,
      logDate,
      pointKey: `healthtalk_sheet_${sheetRowNumber || Date.now()}`,
      sourceType: "healthtalk_google_sheet",
      sourceId: sheetRowNumber || null,
      points: calculatedPoint,
      description: `${healthtalkTitle} (${healthtalkType})`,
    });

    return NextResponse.json({
      ok: true,
      mode: "google_sheet_only",
      message: pointMessage({
        healthtalkType,
        point: calculatedPoint,
        hasEvidence,
      }),
      point: calculatedPoint,
      points: calculatedPoint,
      points_total_delta: pointResult.inserted ? calculatedPoint : 0,
      point_ledger: pointResult,
      point_warnings: pointResult.warning ? [pointResult.warning] : [],
      log,
      google_drive: evidenceResult,
      google_sheet: sheetResult,
    });
  } catch (error: any) {
    console.error("WELLNESS_PARTICIPANT_HEALTHTALK_GOOGLE_SHEET_ONLY_V406_ERROR", error);

    return NextResponse.json(
      {
        ok: false,
        mode: "google_sheet_only",
        message: "Gagal menyimpan Health Talk ke Google Sheet.",
        detail: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}