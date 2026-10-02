import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  CORPORATE_ASSET_TYPES,
  assetFieldForType,
  normalizeCode,
  normalizeLookup,
} from "@/lib/shared/corporatePdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_IMAGE_SIZE = 12 * 1024 * 1024;
const MAX_PDF_SIZE = 25 * 1024 * 1024;
const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_MIME = new Set([...IMAGE_MIME, "application/pdf"]);

type PdfIdentity = {
  name?: string;
  mcuId?: string;
  nik?: string;
  textPreview?: string;
  pageCount?: number;
};

function fail(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, message, ...extra }, { status });
}

function engineUrl() {
  return String(process.env.AI_MCU_ENGINE_URL || "").replace(/\/$/, "");
}

function driveBaseFolder() {
  return String(
    process.env.AI_MCU_GOOGLE_DRIVE_FOLDER_ID ||
    process.env.AI_MCU_GOOGLE_DRIVE_FOLDER_URL ||
    process.env.AI_MCU_GDRIVE_BASE_FOLDER ||
    process.env.GDRIVE_BASE_FOLDER ||
    process.env.GOOGLE_DRIVE_FOLDER_ID ||
    ""
  ).trim();
}

function stripAssetTokens(value: string, assetType: string) {
  const item = CORPORATE_ASSET_TYPES.find((entry) => entry.code === assetType);
  let result = value;
  for (const token of item?.fileToken || []) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`(?:[-_\\s]+${escaped})+$`, "i"), "");
  }
  return result.trim();
}

function filenameIdentityBase(fileName: string, assetType: string) {
  const base = fileName.replace(/\\.[^.]+$/, "").trim();
  const withoutAssetToken = stripAssetTokens(base, assetType);
  return {
    raw: withoutAssetToken,
    base,
    normalized: normalizeLookup(withoutAssetToken),
  };
}

function participantCodeValues(participant: any): string[] {
  return [participant.mcu_id, participant.barcode_value, participant.external_id]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function filenameStartsWithParticipantCode(fileBase: string, participant: any) {
  const source = String(fileBase || "").trim();
  if (!source) return false;

  for (const rawValue of participantCodeValues(participant)) {
    const compact = rawValue.replace(/\s+/g, "");
    if (!compact) continue;
    const numeric = compact.match(/^(\d+)(?:\.0+)?$/);
    if (numeric) {
      const canonical = String(Number(numeric[1]));
      if (new RegExp(`^0*${escapeRegExp(canonical)}(?=[\\s_.-])`, "i").test(source)) return true;
      continue;
    }
    if (new RegExp(`^${escapeRegExp(compact)}(?=[\\s_.-])`, "i").test(source)) return true;
  }
  return false;
}

function smartFilenameParticipantMatch(fileBase: string, identityNormalized: string, participant: any) {
  const nameNormalized = normalizeLookup(participant.name);
  if (!identityNormalized || !nameNormalized) return false;
  if (!filenameStartsWithParticipantCode(fileBase, participant)) return false;
  return identityNormalized.includes(nameNormalized);
}

function participantPublic(participant: any) {
  return {
    id: Number(participant.id),
    name: String(participant.name || ""),
    mcuId: String(participant.mcu_id || participant.barcode_value || participant.external_id || participant.id || ""),
  };
}

async function extractPdfIdentity(file: File, url: string): Promise<PdfIdentity> {
  const form = new FormData();
  form.set("file", file, file.name);
  const res = await fetch(`${url}/corporate-assets/extract-identity`, {
    method: "POST",
    body: form,
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) throw new Error(json.message || "Isi PDF tidak dapat dibaca.");
  return {
    name: String(json.identity?.name || "").trim(),
    mcuId: String(json.identity?.mcuId || "").trim(),
    nik: String(json.identity?.nik || "").trim(),
    textPreview: String(json.textPreview || ""),
    pageCount: Number(json.pageCount || 0),
  };
}

function resolvePdfParticipant(allParticipants: any[], identity: PdfIdentity) {
  const detectedCode = normalizeCode(identity.mcuId || "");
  const detectedName = normalizeLookup(identity.name || "");
  const detectedNik = normalizeLookup(identity.nik || "");
  const compactText = normalizeLookup(identity.textPreview || "");

  let codeMatches = detectedCode
    ? allParticipants.filter((p: any) => participantCodeValues(p).some((value) => normalizeCode(value) === detectedCode))
    : [];
  const nameMatches = detectedName
    ? allParticipants.filter((p: any) => normalizeLookup(p.name) === detectedName)
    : [];
  const nikMatches = detectedNik
    ? allParticipants.filter((p: any) => normalizeLookup(p.nik) === detectedNik)
    : [];

  if (codeMatches.length > 1 && detectedName) {
    codeMatches = codeMatches.filter((p: any) => normalizeLookup(p.name) === detectedName);
  }

  if (codeMatches.length === 1) {
    const candidate = codeMatches[0];
    if (detectedName && normalizeLookup(candidate.name) !== detectedName) {
      return { participant: null, status: "needs_review", matchedBy: "pdf_mcu_name_conflict", candidates: [candidate] };
    }
    return { participant: candidate, status: "matched", matchedBy: "pdf_mcu_exact", candidates: [candidate] };
  }

  if (nameMatches.length === 1 && nikMatches.some((p: any) => Number(p.id) === Number(nameMatches[0].id))) {
    return { participant: nameMatches[0], status: "matched", matchedBy: "pdf_name_nik_exact", candidates: nameMatches };
  }

  if (nameMatches.length === 1 && compactText) {
    const candidate = nameMatches[0];
    const hasParticipantCode = participantCodeValues(candidate)
      .map((value) => normalizeLookup(value))
      .filter(Boolean)
      .some((value) => compactText.includes(value));
    if (hasParticipantCode) {
      return { participant: candidate, status: "matched", matchedBy: "pdf_name_code_in_text", candidates: nameMatches };
    }
  }

  if (nameMatches.length === 1) {
    return { participant: null, status: "needs_review", matchedBy: "pdf_name_only", candidates: nameMatches };
  }

  const textCodeMatches = compactText
    ? allParticipants.filter((p: any) => participantCodeValues(p)
        .map((value) => normalizeLookup(value))
        .filter(Boolean)
        .some((value) => value.length >= 3 && compactText.includes(value)))
    : [];
  if (textCodeMatches.length === 1) {
    return { participant: textCodeMatches[0], status: "matched", matchedBy: "pdf_code_in_text", candidates: textCodeMatches };
  }

  const candidates = [...codeMatches, ...nameMatches, ...nikMatches, ...textCodeMatches]
    .filter((item, index, list) => list.findIndex((other) => Number(other.id) === Number(item.id)) === index)
    .slice(0, 10);
  return { participant: null, status: candidates.length ? "needs_review" : "unmatched", matchedBy: "pdf_identity_unresolved", candidates };
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  const form = await req.formData();
  const sourceId = Number(form.get("sourceId"));
  const assetType = String(form.get("assetType") || "").trim();
  const file = form.get("file");
  const inspectOnly = String(form.get("inspectOnly") || "") === "1";
  const requestedParticipantId = Number(form.get("participantId") || 0);
  const assetDefinition = CORPORATE_ASSET_TYPES.find((item) => item.code === assetType);

  if (!sourceId) return fail("Database MCU Corporate wajib dipilih.");
  if (!assetFieldForType(assetType) || !assetDefinition) return fail("Jenis dokumen tidak valid.");
  if (!(file instanceof File)) return fail("File tidak ditemukan.");
  if (!ALLOWED_MIME.has(file.type)) return fail("Format file harus JPG, PNG, WEBP, atau PDF.");
  if (assetType === "PROFILE_PHOTO" && file.type === "application/pdf") {
    return fail("Foto Profile harus berupa JPG, PNG, atau WEBP. PDF digunakan untuk lampiran pemeriksaan.", 422);
  }
  const maxSize = file.type === "application/pdf" ? MAX_PDF_SIZE : MAX_IMAGE_SIZE;
  if (file.size <= 0 || file.size > maxSize) {
    return fail(file.type === "application/pdf" ? "Ukuran PDF maksimal 25 MB." : "Ukuran gambar maksimal 12 MB.");
  }

  const supabase = getSupabaseAdmin();
  const sourceRes = await supabase
    .from("participant_sources")
    .select("id,name,institution_name,program_type")
    .eq("id", sourceId)
    .maybeSingle();

  if (sourceRes.error) return fail(sourceRes.error.message, 500);
  if (!sourceRes.data) return fail("Database tidak ditemukan.", 404);
  if (String(sourceRes.data.program_type || "").toLowerCase() !== "corporate") {
    return fail("Upload ini hanya untuk MCU Corporate.", 403);
  }

  const participantRes = await supabase
    .from("participants")
    .select("id,name,nik,mcu_id,external_id,barcode_value,source_id,program_type")
    .eq("source_id", sourceId)
    .eq("program_type", "corporate")
    .limit(2000);

  if (participantRes.error) return fail(participantRes.error.message, 500);
  const allParticipants = participantRes.data || [];

  let participant: any = null;
  let matchedBy = "";
  let detectedIdentity: PdfIdentity | null = null;
  let matchStatus = "unmatched";
  let candidates: any[] = [];

  if (requestedParticipantId > 0) {
    participant = allParticipants.find((item: any) => Number(item.id) === requestedParticipantId) || null;
    if (!participant) return fail("Peserta konfirmasi tidak berasal dari database Corporate yang aktif.", 422);
    matchedBy = "confirmed_participant";
    matchStatus = "matched";
  } else {
    const fileIdentity = filenameIdentityBase(file.name, assetType);
    const filenameUsable = Boolean(fileIdentity.raw && fileIdentity.normalized && /[-_\s]/.test(fileIdentity.raw));
    const pairMatches = filenameUsable
      ? allParticipants.filter((item: any) => smartFilenameParticipantMatch(fileIdentity.base, fileIdentity.normalized, item))
      : [];

    if (pairMatches.length === 1) {
      participant = pairMatches[0];
      matchedBy = "mcu_prefix_and_full_name";
      matchStatus = "matched";
    } else if (file.type === "application/pdf") {
      const url = engineUrl();
      if (!url) return fail("AI_MCU_ENGINE_URL belum dikonfigurasi.", 500);
      try {
        detectedIdentity = await extractPdfIdentity(file, url);
        const resolved = resolvePdfParticipant(allParticipants, detectedIdentity);
        participant = resolved.participant;
        matchedBy = resolved.matchedBy;
        matchStatus = resolved.status;
        candidates = resolved.candidates || [];
      } catch (error: any) {
        matchStatus = "needs_review";
        matchedBy = "pdf_extract_failed";
        candidates = filenameUsable
          ? allParticipants.filter((item: any) => filenameStartsWithParticipantCode(fileIdentity.base, item)).slice(0, 10)
          : [];
        detectedIdentity = { textPreview: "", pageCount: 0 };
        if (inspectOnly) {
          return NextResponse.json({
            ok: true,
            status: matchStatus,
            message: `${error?.message || "Isi PDF tidak dapat dibaca."} Pilih peserta secara manual sebelum upload.`,
            fileName: file.name,
            assetType,
            matchedBy,
            participant: null,
            detectedIdentity,
            candidates: candidates.map(participantPublic),
          });
        }
      }
    } else {
      candidates = filenameUsable
        ? allParticipants.filter((item: any) => filenameStartsWithParticipantCode(fileIdentity.base, item)).slice(0, 10)
        : [];
      matchStatus = candidates.length ? "needs_review" : "unmatched";
      matchedBy = "filename_unresolved";
    }
  }

  if (inspectOnly) {
    return NextResponse.json({
      ok: true,
      status: participant ? "matched" : matchStatus,
      message: participant
        ? "File berhasil dimapping ke peserta. Belum di-upload ke Google Drive."
        : matchStatus === "needs_review"
          ? "Mapping perlu dikonfirmasi sebelum upload."
          : "Peserta belum ditemukan. Pilih peserta secara manual sebelum upload.",
      fileName: file.name,
      assetType,
      matchedBy,
      participant: participant ? participantPublic(participant) : null,
      detectedIdentity,
      candidates: candidates.map(participantPublic),
    });
  }

  if (!participant) {
    return fail("File belum memiliki mapping peserta yang aman. Scan atau pilih peserta secara manual terlebih dahulu.", 422, {
      status: matchStatus,
      fileName: file.name,
      assetType,
      matchedBy,
      detectedIdentity,
      candidates: candidates.map(participantPublic),
    });
  }

  const importRes = await supabase
    .from("ai_mcu_import_rows")
    .select("id,participant_id,row_data,participant_name,mcu_id")
    .eq("participant_id", participant.id)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (importRes.error) return fail(importRes.error.message, 500);
  if (!importRes.data) {
    return fail("Baris data AI MCU peserta tidak ditemukan. File tidak diunggah.", 422, {
      status: "import_row_not_found",
      participantId: participant.id,
    });
  }

  const url = engineUrl();
  if (!url) return fail("AI_MCU_ENGINE_URL belum dikonfigurasi.", 500);

  try {
    const driveForm = new FormData();
    driveForm.set("file", file, file.name);
    driveForm.set("sourceId", String(sourceId));
    driveForm.set("sourceName", String(sourceRes.data.institution_name || sourceRes.data.name || `Corporate ${sourceId}`));
    driveForm.set("participantId", String(participant.id));
    driveForm.set("participantName", String(participant.name || ""));
    driveForm.set("mcuId", String(participant.mcu_id || participant.barcode_value || participant.external_id || participant.id));
    driveForm.set("assetType", assetType);
    driveForm.set("assetLabel", assetDefinition.label);
    const configuredFolder = driveBaseFolder();
    if (configuredFolder) driveForm.set("baseFolder", configuredFolder);

    const driveResponse = await fetch(`${url}/corporate-assets/upload`, {
      method: "POST",
      body: driveForm,
      cache: "no-store",
    });
    const driveJson = await driveResponse.json().catch(() => ({}));
    if (!driveResponse.ok || !driveJson.ok) {
      return fail(driveJson.message || "Upload ke Google Drive gagal.", driveResponse.status || 500, {
        status: "google_drive_upload_failed",
        engineResponse: driveJson,
      });
    }

    const rowField = assetFieldForType(assetType);
    const rowData = importRes.data.row_data && typeof importRes.data.row_data === "object"
      ? { ...(importRes.data.row_data as Record<string, unknown>) }
      : {};

    rowData[rowField] = String(driveJson.storageRef || `gdrive://${driveJson.fileId}`);
    rowData[`${rowField} Google Drive URL`] = String(driveJson.driveUrl || "");
    rowData[`${rowField} Google Drive File ID`] = String(driveJson.fileId || "");
    rowData[`${rowField} Google Drive Folder`] = String(driveJson.folderPath || "");
    rowData[`${rowField} File Name`] = file.name;
    rowData[`${rowField} Mime Type`] = file.type;
    rowData[`${rowField} Matched By`] = matchedBy || "confirmed_participant";
    rowData[`${rowField} Storage`] = "google_drive";

    const update = await supabase
      .from("ai_mcu_import_rows")
      .update({ row_data: rowData })
      .eq("id", importRes.data.id);

    if (update.error) return fail(update.error.message, 500);

    return NextResponse.json({
      ok: true,
      status: "matched",
      message: "File berhasil dicocokkan dan disimpan ke Google Drive.",
      fileName: file.name,
      assetType,
      storage: "google_drive",
      participant: participantPublic(participant),
      driveUrl: driveJson.driveUrl || "",
      driveFileId: driveJson.fileId || "",
      folderPath: driveJson.folderPath || "",
      storageRef: driveJson.storageRef || "",
      matchedBy: matchedBy || "confirmed_participant",
      detectedIdentity,
    });
  } catch (error: any) {
    return fail(error?.message || "Upload Google Drive gagal.", 500);
  }
}
