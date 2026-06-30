// WELLNESS_PARTICIPANT_ALL_FORMS_EXISTING_GS_V398_HEALTHTALK
// Participant health talk route using the existing Apps Script v370:
// - evidence -> Google Drive by action=uploadEvidence
// - health talk row -> Google Sheet Form Responses
// - mirror -> wellness_healthtalk_logs for participant history

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

export const runtime = "nodejs";

const MARKER = "WELLNESS_PARTICIPANT_ALL_FORMS_EXISTING_GS_V398_HEALTHTALK";

function clean(value: any) {
  return String(value ?? "").trim();
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
  return { body: body || {}, evidence: null };
}

function buildHealthtalkRow(params: {
  participant: any;
  body: any;
  logDate: string;
  healthtalkType: string;
  healthtalkTitle: string;
  notes: string | null;
  evidenceResult: any;
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
  row["Jenis Healthtalk"] = params.healthtalkTitle || params.healthtalkType;
  row["Tanggal Healthtalk"] = params.logDate;
  row["Bukti Healthtalk"] = driveUrl;
  row["Preview Bukti Healthtalk"] = previewUrl;
  row["Add Options"] = [params.healthtalkType, params.healthtalkTitle].filter(Boolean).join(" - ");
  row["Catatan Nutrisi"] = params.notes || "";
  row["Evidence Count"] = driveUrl ? 1 : 0;

  return row;
}

export async function GET(req: NextRequest) {
  const { supabase, participant } = await getParticipant(req);

  if (!participant?.id) {
    return NextResponse.json(
      { ok: false, message: "OTP/session peserta belum aktif." },
      { status: 401 }
    );
  }

  const { data, error } = await supabase
    .from("wellness_healthtalk_logs")
    .select("*")
    .eq("participant_id", participant.id)
    .order("log_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json(
      { ok: false, message: "Gagal membaca health talk peserta.", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    participant_id: participant.id,
    logs: data || [],
  });
}

export async function POST(req: NextRequest) {
  const { supabase, participant } = await getParticipant(req);

  if (!participant?.id) {
    return NextResponse.json(
      { ok: false, message: "OTP/session peserta belum aktif." },
      { status: 401 }
    );
  }

  try {
    const { body, evidence } = await parseRequestBody(req);
    const logDate = safeLogDate(body?.log_date || body?.logDate || body?.healthtalk_date);
    const healthtalkType = clean(body?.healthtalk_type || body?.healthtalkType) || "Healthtalk/Seminar";
    const healthtalkTitle = clean(body?.healthtalk_title || body?.healthtalkTitle || body?.title || body?.topic) || healthtalkType;
    const notes = clean(body?.notes || body?.catatan) || null;
    const companyName = getCompanyName(participant, body);

    if (!healthtalkTitle) {
      return NextResponse.json(
        { ok: false, message: "Jenis Health Talk wajib diisi." },
        { status: 400 }
      );
    }

    const evidenceResult = await uploadEvidenceToDrive({
      file: evidence,
      participant,
      companyName,
      category: "Health Talk",
      activeTab: "healthtalk",
      fieldKey: "healthtalk_evidence",
      logDate,
      marker: MARKER,
    });

    const sheetRow = buildHealthtalkRow({
      participant,
      body,
      logDate,
      healthtalkType,
      healthtalkTitle,
      notes,
      evidenceResult,
    });

    const sheetResult = await postToWellnessWebhook({
      sheet: getWellnessSheetName(),
      row: sheetRow,
      marker: MARKER,
    });

    const payload: any = {
      participant_id: Number(participant.id),
      log_date: logDate,
      healthtalk_type: healthtalkType,
      healthtalk_title: healthtalkTitle,
      notes,
      evidence_url: getDriveUrl(evidenceResult) || null,
      evidence_preview_url: getPreviewUrl(evidenceResult) || null,
      google_drive_file_id: evidenceResult?.fileId || null,
      google_drive_folder_path: evidenceResult?.folderPath || null,
      google_sheet_row_number: sheetResult?.rowNumber || null,
      sync_status: "synced",
      sync_error: null,
      raw_payload: {
        ...body,
        google_drive: evidenceResult || null,
        google_sheet: sheetResult || null,
        saved_at: new Date().toISOString(),
        marker: MARKER,
      },
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("wellness_healthtalk_logs")
      .insert(payload)
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      message: "Health Talk berhasil disimpan ke Google Sheet.",
      log: data,
      google_drive: evidenceResult,
      google_sheet: sheetResult,
    });
  } catch (error: any) {
    console.error("WELLNESS_PARTICIPANT_ALL_FORMS_EXISTING_GS_V398_HEALTHTALK_ERROR", error);

    return NextResponse.json(
      {
        ok: false,
        message: "Gagal menyimpan Health Talk.",
        detail: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
