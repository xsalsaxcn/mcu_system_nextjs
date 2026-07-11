import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  CORPORATE_ASSET_TYPES,
  assetFieldForType,
  normalizeLookup,
} from "@/lib/shared/corporatePdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_FILE_SIZE = 12 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

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

// CORPORATE_SMART_FILENAME_MATCH_V408
// Aturan aman:
// 1. Kode MCU harus berada di awal nama file.
// 2. Nama peserta lengkap boleh diikuti UID DICOM, tanggal, nomor alat, atau teks lain.
// 3. Hasil harus tetap unik tepat satu peserta.
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

    // Excel/DB kadang menyimpan kode numerik sebagai 47, 047, atau 47.0.
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

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  const form = await req.formData();
  const sourceId = Number(form.get("sourceId"));
  const assetType = String(form.get("assetType") || "").trim();
  const file = form.get("file");
  const assetDefinition = CORPORATE_ASSET_TYPES.find((item) => item.code === assetType);

  if (!sourceId) return fail("Database MCU Corporate wajib dipilih.");
  if (!assetFieldForType(assetType) || !assetDefinition) return fail("Jenis dokumen tidak valid.");
  if (!(file instanceof File)) return fail("File tidak ditemukan.");
  if (!ALLOWED_MIME.has(file.type)) return fail("Format file harus JPG, PNG, atau WEBP.");
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) return fail("Ukuran file maksimal 12 MB.");

  const fileIdentity = filenameIdentityBase(file.name, assetType);
  if (!fileIdentity.raw || !fileIdentity.normalized || !/[-_\s]/.test(fileIdentity.raw)) {
    return fail(
      "Nama file wajib memakai format NOMCU-NAMA PESERTA, contoh: 047-AGUS NUGROHO.jpg. File tidak diunggah untuk mencegah salah peserta.",
      422,
      { status: "invalid_filename", fileName: file.name }
    );
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
    .select("id,name,mcu_id,external_id,barcode_value,source_id,program_type")
    .eq("source_id", sourceId)
    .eq("program_type", "corporate")
    .limit(2000);

  if (participantRes.error) return fail(participantRes.error.message, 500);

  const allParticipants = participantRes.data || [];
  const pairMatches = allParticipants.filter((participant: any) =>
    smartFilenameParticipantMatch(fileIdentity.base, fileIdentity.normalized, participant)
  );

  if (pairMatches.length !== 1) {
    // Kandidat hanya untuk membantu operator. File tetap tidak dikirim ke Drive.
    const candidates = allParticipants
      .filter((participant: any) => filenameStartsWithParticipantCode(fileIdentity.base, participant))
      .slice(0, 10)
      .map((participant: any) => ({
        id: participant.id,
        name: participant.name,
        mcuId: participant.mcu_id || participant.barcode_value || participant.external_id,
      }));

    return fail(
      pairMatches.length > 1
        ? "Kode MCU dan nama lengkap cocok ke lebih dari satu peserta. File tidak diunggah."
        : "Kode MCU di awal nama file dan nama peserta lengkap tidak cocok dengan satu peserta. Suffix UID/tanggal diperbolehkan.",
      422,
      {
        status: pairMatches.length > 1 ? "ambiguous_mcu_name_pair" : "mcu_name_pair_not_found",
        fileName: file.name,
        parsedIdentity: fileIdentity.raw,
        candidates,
      }
    );
  }

  const participant = pairMatches[0];
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

    // File biner hanya berada di Google Drive. Supabase Storage tidak dipakai.
    // Di row_data hanya disimpan referensi kecil gdrive://fileId + metadata URL
    // agar generator PDF dapat mengambil file peserta yang tepat.
    const rowField = assetFieldForType(assetType);
    const rowData = importRes.data.row_data && typeof importRes.data.row_data === "object"
      ? { ...(importRes.data.row_data as Record<string, unknown>) }
      : {};

    rowData[rowField] = String(driveJson.storageRef || `gdrive://${driveJson.fileId}`);
    rowData[`${rowField} Google Drive URL`] = String(driveJson.driveUrl || "");
    rowData[`${rowField} Google Drive File ID`] = String(driveJson.fileId || "");
    rowData[`${rowField} Google Drive Folder`] = String(driveJson.folderPath || "");
    rowData[`${rowField} File Name`] = file.name;
    rowData[`${rowField} Matched By`] = "mcu_prefix_and_full_name";
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
      participant: {
        id: participant.id,
        name: participant.name,
        mcuId: participant.mcu_id || participant.barcode_value || participant.external_id || String(participant.id),
      },
      driveUrl: driveJson.driveUrl || "",
      driveFileId: driveJson.fileId || "",
      folderPath: driveJson.folderPath || "",
      storageRef: driveJson.storageRef || "",
      matchedBy: "mcu_prefix_and_full_name",
    });
  } catch (error: any) {
    return fail(error?.message || "Upload Google Drive gagal.", 500);
  }
}
