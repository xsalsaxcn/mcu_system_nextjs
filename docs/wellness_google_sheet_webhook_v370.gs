/**
 * WELLNESS_GOOGLE_DRIVE_FOLDER_FALLBACK_V370_APPS_SCRIPT
 * Paste into Extensions > Apps Script in the target Google Sheet, then Deploy > Web app.
 * This creates a Jotform-like "Form Responses" tab: fixed headers, frozen header, filter, and append-only rows.
 */

const DEFAULT_SHEET_NAME = "Form Responses";
const DEFAULT_EVIDENCE_FOLDER_NAME = "wellness program";
const DEFAULT_COMPANY_FOLDER_NAME = "Tanpa Perusahaan";
const DEFAULT_PARTICIPANT_FOLDER_NAME = "Tanpa Nama Peserta";

// WELLNESS_SUPPORT_CHAT_GOOGLE_SHEET_DRIVE_V61
const SUPPORT_THREADS_SHEET_NAME = "Wellness Support Threads";
const SUPPORT_MESSAGES_SHEET_NAME = "Wellness Support Messages";
const SUPPORT_FOLDER_NAME = "Technical Support";
const SUPPORT_THREAD_HEADERS = [
  "Ticket ID",
  "Created At",
  "Updated At",
  "Actor Type",
  "Actor ID",
  "Actor Name",
  "Actor Code",
  "Company",
  "Kelompok",
  "Email",
  "Status",
  "Subject",
  "Last Message",
  "Last Sender Type",
  "Unread Admin",
  "Unread User",
  "Closed At",
];
const SUPPORT_MESSAGE_HEADERS = [
  "Message ID",
  "Ticket ID",
  "Created At",
  "Sender Type",
  "Sender ID",
  "Sender Name",
  "Message",
  "Attachment Name",
  "Attachment Type",
  "Attachment Size",
  "Attachment URL",
  "Attachment Preview URL",
  "Read By Admin At",
  "Read By User At",
];

// WELLNESS PROFILE PHOTO GOOGLE SHEET + DRIVE V76
const WELLNESS_PROFILE_SHEET_NAME = "Wellness Profiles";
const WELLNESS_PROFILE_FOLDER_NAME = "Profile Photos";
const WELLNESS_PROFILE_HEADERS = [
  "Actor Type",
  "Actor ID",
  "Name",
  "Code",
  "Email",
  "Photo URL",
  "Photo Preview URL",
  "Updated At",
];

const FORM_RESPONSE_HEADERS = [
  "Submission Date",
  "Pilih Nama Anda",
  "Nama Peserta",
  "Waktu Makan",
  "Add Options",
  "Upload Foto Makanan",
  "Preview Foto Makanan",
  "Melakukan Workout/Aktifitas Ringan?",
  "Jenis Workout/Aktifitas",
  "Jelaskan pencapaian Workout/Aktifitas yang anda lakukan (Berapa Set/Berapa banyak langkah kaki)",
  "Submission IP",
  "Berapa Menit anda melakukan nya ?",
  "Berat badan Awal",
  "BB anda per hari ini (diisi sekali saja perminggu)",
  "Helper column BB jangan diubah",
  "BB Monitoring terbaru",
  "Lingkar Perut (cm)",
  "BMI",
  "Catatan Nutrisi",
  "Kalori Makanan",
  "Detected Foods",
  "Kalori Aktivitas",
  "Bukti Aktivitas",
  "Preview Bukti Aktivitas",
  "Healthtalk/Seminar",
  "Jenis Healthtalk",
  "Tanggal Healthtalk",
  "Bukti Healthtalk",
  "Preview Bukti Healthtalk",
  "Total Point",
  "Company",
  "Kelompok",
  "Group Upload",
  "Risk Cluster",
  "KODE",
  "Participant ID",
  "Log Date",
  "Log Type",
  "Evidence Count",
  "Created By",
  "Marker",
];

function doGet(e) {
  try {
    return jsonResponse({
      ok: true,
      marker: "WELLNESS_GOOGLE_DRIVE_FOLDER_FALLBACK_V370",
      drive: checkWellnessDriveConfig_(),
      message:
        "Webhook is active. Use action=uploadEvidence from the app to upload evidence files.",
    });
  } catch (err) {
    return jsonResponse(
      {
        ok: false,
        marker: "WELLNESS_GOOGLE_DRIVE_FOLDER_FALLBACK_V370",
        message: err && err.message ? err.message : String(err),
      },
      500,
    );
  }
}

function testWellnessDriveFolder() {
  const result = checkWellnessDriveConfig_();
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const payload = JSON.parse(
      (e && e.postData && e.postData.contents) || "{}",
    );
    const expectedSecret =
      PropertiesService.getScriptProperties().getProperty(
        "WELLNESS_WEBHOOK_SECRET",
      ) || "";
    if (expectedSecret && payload.secret !== expectedSecret) {
      return jsonResponse(
        { ok: false, message: "Unauthorized webhook secret" },
        401,
      );
    }

    if (payload.action === "uploadEvidence") {
      return jsonResponse(uploadEvidenceToDrive(payload));
    }

    if (payload.action === "uploadSupportAttachment") {
      return jsonResponse(uploadSupportAttachmentToDrive(payload));
    }
    if (payload.action === "supportEnsureThread") {
      return jsonResponse(supportEnsureThread(payload));
    }
    if (payload.action === "supportGetThread") {
      return jsonResponse(supportGetThread(payload));
    }
    if (payload.action === "supportGetMessages") {
      return jsonResponse(supportGetMessages(payload));
    }
    if (payload.action === "supportSendMessage") {
      return jsonResponse(supportSendMessage(payload));
    }
    if (payload.action === "supportMarkRead") {
      return jsonResponse(supportMarkRead(payload));
    }
    if (payload.action === "supportListThreads") {
      return jsonResponse(supportListThreads(payload));
    }
    if (payload.action === "supportUpdateStatus") {
      return jsonResponse(supportUpdateStatus(payload));
    }
    if (payload.action === "wellnessProfileGet") {
      return jsonResponse(wellnessProfileGet_(payload));
    }
    if (payload.action === "wellnessProfileList") {
      return jsonResponse(wellnessProfileList_(payload));
    }
    if (payload.action === "wellnessProfileSave") {
      return jsonResponse(wellnessProfileSave_(payload));
    }
    if (payload.action === "uploadWellnessProfilePhoto") {
      return jsonResponse(uploadWellnessProfilePhoto_(payload));
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetName = payload.sheet || DEFAULT_SHEET_NAME;
    const sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
    const row = payload.row || {};
    if (!Object.keys(row).length) {
      return jsonResponse({ ok: false, message: "No row data supplied" }, 400);
    }

    const headers = ensureHeaders(sheet, row);
    const values = headers.map((header) =>
      normalizeCellWithHeader(header, row[header]),
    );
    sheet.appendRow(values);
    formatResponseSheet(sheet, headers);

    return jsonResponse({
      ok: true,
      sheet: sheetName,
      appended: true,
      columns: headers.length,
      rowNumber: sheet.getLastRow(),
    });
  } catch (err) {
    return jsonResponse(
      { ok: false, message: err && err.message ? err.message : String(err) },
      500,
    );
  } finally {
    lock.releaseLock();
  }
}

function ensureHeaders(sheet, row) {
  let headers = [];
  const lastColumn = sheet.getLastColumn();
  if (lastColumn > 0) {
    headers = sheet
      .getRange(1, 1, 1, lastColumn)
      .getValues()[0]
      .map(String)
      .filter(Boolean);
  }

  if (!headers.length) {
    const extras = Object.keys(row).filter(
      (key) => FORM_RESPONSE_HEADERS.indexOf(key) === -1,
    );
    headers = FORM_RESPONSE_HEADERS.concat(extras);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return headers;
  }

  const desired = FORM_RESPONSE_HEADERS.concat(
    Object.keys(row).filter((key) => FORM_RESPONSE_HEADERS.indexOf(key) === -1),
  );
  const missing = desired.filter((key) => headers.indexOf(key) === -1);
  if (missing.length) {
    headers = headers.concat(missing);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return headers;
}

function formatResponseSheet(sheet, headers) {
  const lastRow = Math.max(sheet.getLastRow(), 1);
  const lastColumn = headers.length;
  sheet.setFrozenRows(1);
  sheet
    .getRange(1, 1, 1, lastColumn)
    .setFontWeight("bold")
    .setFontSize(9)
    .setBackground("#f8fafc")
    .setWrap(true)
    .setVerticalAlignment("middle");
  sheet.getRange(1, 1, lastRow, lastColumn).setVerticalAlignment("middle");
  sheet.getRange(2, 1, Math.max(lastRow - 1, 1), lastColumn).setWrap(true);
  if (lastRow > 1) sheet.setRowHeights(2, Math.max(lastRow - 1, 1), 120);
  if (!sheet.getFilter()) {
    sheet.getRange(1, 1, lastRow, lastColumn).createFilter();
  }

  const widths = {
    "Submission Date": 150,
    "Pilih Nama Anda": 260,
    "Nama Peserta": 180,
    "Waktu Makan": 120,
    "Add Options": 280,
    "Upload Foto Makanan": 300,
    "Preview Foto Makanan": 180,
    "Melakukan Workout/Aktifitas Ringan?": 150,
    "Jenis Workout/Aktifitas": 170,
    "Jelaskan pencapaian Workout/Aktifitas yang anda lakukan (Berapa Set/Berapa banyak langkah kaki)": 260,
    "Submission IP": 140,
    "Berapa Menit anda melakukan nya ?": 120,
    "Berat badan Awal": 110,
    "BB anda per hari ini (diisi sekali saja perminggu)": 160,
    "Helper column BB jangan diubah": 150,
    "BB Monitoring terbaru": 140,
    "Bukti Aktivitas": 300,
    "Preview Bukti Aktivitas": 180,
    "Bukti Healthtalk": 300,
    "Preview Bukti Healthtalk": 180,
  };
  headers.forEach((header, index) => {
    sheet.setColumnWidth(index + 1, widths[header] || 140);
  });
}

function uploadEvidenceToDrive(payload) {
  const filename = sanitizeFileName(
    payload.filename || payload.originalFilename || "wellness-evidence",
  );
  const contentType = String(payload.contentType || "application/octet-stream");
  const base64 = String(payload.dataBase64 || "");
  if (!base64) throw new Error("dataBase64 is required for uploadEvidence");

  const bytes = Utilities.base64Decode(base64);
  const blob = Utilities.newBlob(bytes, contentType, filename);

  // WELLNESS_GOOGLE_DRIVE_FOLDER_FALLBACK_V370
  // Folder structure:
  // Root wellness folder / Company Name / Employee Name / Nutrisi|Workout|Health Talk
  const rootFolder = getEvidenceRootFolder(
    payload.folderName || DEFAULT_EVIDENCE_FOLDER_NAME,
  );
  const companyFolder = getOrCreateFolder(
    rootFolder,
    sanitizeFolderName(
      payload.companyName ||
        payload.company_name ||
        DEFAULT_COMPANY_FOLDER_NAME,
    ),
  );
  const participantFolder = getOrCreateFolder(
    companyFolder,
    sanitizeFolderName(buildParticipantFolderName(payload)),
  );
  const categoryFolder = getOrCreateFolder(
    participantFolder,
    resolveEvidenceCategory(payload),
  );

  const file = categoryFolder.createFile(blob);
  file.setDescription(
    "Uploaded from Harmony Health App Wellness. Marker: WELLNESS_GOOGLE_DRIVE_FOLDER_FALLBACK_V370",
  );

  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (err) {
    // Some Workspace policies may block public sharing. The upload still succeeds, but preview may require access.
  }

  const fileId = file.getId();
  const driveUrl = file.getUrl();
  const publicUrl = "https://drive.google.com/uc?export=view&id=" + fileId;
  const previewUrl =
    contentType.indexOf("image/") === 0
      ? "https://drive.google.com/thumbnail?id=" + fileId + "&sz=w1200"
      : driveUrl;

  return {
    ok: true,
    fileId: fileId,
    name: file.getName(),
    mimeType: contentType,
    driveUrl: driveUrl,
    publicUrl: publicUrl,
    previewUrl: previewUrl,
    thumbnailUrl: previewUrl,
    rootFolderId: rootFolder.getId(),
    companyFolderId: companyFolder.getId(),
    participantFolderId: participantFolder.getId(),
    categoryFolderId: categoryFolder.getId(),
    folderId: categoryFolder.getId(),
    folderPath:
      rootFolder.getName() +
      " / " +
      companyFolder.getName() +
      " / " +
      participantFolder.getName() +
      " / " +
      categoryFolder.getName(),
    category: categoryFolder.getName(),
    marker: "WELLNESS_GOOGLE_DRIVE_FOLDER_FALLBACK_V370",
  };
}

// -----------------------------------------------------------------------------
// WELLNESS PROFILE V76
// WELLNESS_PROFILE_ATOMIC_ROW_SAVE_V76B
// Metadata: Google Sheet. Photos: Google Drive. No Supabase Storage/migration.
// -----------------------------------------------------------------------------
function wellnessProfileClean_(value) {
  return String(value === null || value === undefined ? "" : value).trim();
}

function wellnessProfileSheet_() {
  return supportSheet_(WELLNESS_PROFILE_SHEET_NAME, WELLNESS_PROFILE_HEADERS);
}

function wellnessProfileRows_() {
  return supportRows_(wellnessProfileSheet_());
}

function wellnessProfilePublic_(row) {
  if (!row) return null;
  return {
    actor_type: wellnessProfileClean_(row["Actor Type"]),
    actor_id: wellnessProfileClean_(row["Actor ID"]),
    name: wellnessProfileClean_(row["Name"]),
    code: wellnessProfileClean_(row["Code"]),
    email: wellnessProfileClean_(row["Email"]),
    photo_url: wellnessProfileClean_(row["Photo URL"]),
    photo_preview_url: wellnessProfileClean_(row["Photo Preview URL"]),
    updated_at: wellnessProfileClean_(row["Updated At"]),
  };
}

function wellnessProfileFind_(actorType, actorId) {
  const type = wellnessProfileClean_(actorType);
  const id = wellnessProfileClean_(actorId);
  if (!type || !id) return null;
  const rows = wellnessProfileRows_();
  return (
    rows.find(function (row) {
      return (
        wellnessProfileClean_(row["Actor Type"]) === type &&
        wellnessProfileClean_(row["Actor ID"]) === id
      );
    }) || null
  );
}

function wellnessProfileGet_(payload) {
  const row = wellnessProfileFind_(payload.actorType, payload.actorId);
  return { ok: true, profile: wellnessProfilePublic_(row) };
}

function wellnessProfileList_(payload) {
  const type = wellnessProfileClean_(payload.actorType);
  const requested = Array.isArray(payload.actorIds)
    ? payload.actorIds.map(wellnessProfileClean_).filter(Boolean)
    : [];
  const allowed = new Set(requested);
  const profiles = wellnessProfileRows_()
    .filter(function (row) {
      if (type && wellnessProfileClean_(row["Actor Type"]) !== type)
        return false;
      if (
        requested.length &&
        !allowed.has(wellnessProfileClean_(row["Actor ID"]))
      )
        return false;
      return true;
    })
    .map(wellnessProfilePublic_);
  return { ok: true, profiles: profiles };
}

function wellnessProfileSave_(payload) {
  const actorType = wellnessProfileClean_(payload.actorType);
  const actorId = wellnessProfileClean_(payload.actorId);
  if (!actorType || !actorId)
    throw new Error("actorType dan actorId wajib untuk profil");

  const sheet = wellnessProfileSheet_();
  const existing = wellnessProfileFind_(actorType, actorId);
  const object = existing || {};
  object["Actor Type"] = actorType;
  object["Actor ID"] = actorId;
  object["Name"] = wellnessProfileClean_(
    payload.actorName || payload.name || object["Name"],
  );
  object["Code"] = wellnessProfileClean_(
    payload.actorCode || payload.code || object["Code"],
  );
  object["Email"] = wellnessProfileClean_(
    payload.actorEmail || payload.email || object["Email"],
  );
  object["Photo URL"] = wellnessProfileClean_(
    payload.photoUrl || object["Photo URL"],
  );
  object["Photo Preview URL"] = wellnessProfileClean_(
    payload.photoPreviewUrl || object["Photo Preview URL"],
  );
  object["Updated At"] = supportNow_();

  const headers = WELLNESS_PROFILE_HEADERS.slice();
  if (sheet.getLastColumn() < headers.length) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  const values = headers.map(function (header) {
    return normalizeCell(object[header]);
  });
  const rowNumber =
    existing && existing.__row
      ? Number(existing.__row)
      : Math.max(2, sheet.getLastRow() + 1);
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([values]);

  return { ok: true, profile: wellnessProfilePublic_(object) };
}

function uploadWellnessProfilePhoto_(payload) {
  const actorType = wellnessProfileClean_(payload.actorType);
  const actorId = wellnessProfileClean_(payload.actorId);
  const actorName = wellnessProfileClean_(payload.actorName || actorId);
  const filename = sanitizeFileName(
    payload.filename || payload.originalFilename || "profile.webp",
  );
  const contentType = wellnessProfileClean_(
    payload.contentType || "image/webp",
  );
  const base64 = wellnessProfileClean_(payload.dataBase64);
  if (!actorType || !actorId)
    throw new Error("actorType dan actorId wajib untuk upload profil");
  if (!base64) throw new Error("dataBase64 wajib untuk upload profil");

  const bytes = Utilities.base64Decode(base64);
  const blob = Utilities.newBlob(bytes, contentType, filename);
  const root = getEvidenceRootFolder(
    payload.folderName || DEFAULT_EVIDENCE_FOLDER_NAME,
  );
  const profileRoot = getOrCreateFolder(root, WELLNESS_PROFILE_FOLDER_NAME);
  const actorTypeFolder = getOrCreateFolder(
    profileRoot,
    sanitizeFolderName(actorType),
  );
  const actorFolder = getOrCreateFolder(
    actorTypeFolder,
    sanitizeFolderName(actorId + " - " + actorName),
  );

  const previousFiles = actorFolder.getFiles();
  while (previousFiles.hasNext()) {
    const oldFile = previousFiles.next();
    if (oldFile.getName().indexOf("profile") !== -1) {
      try {
        oldFile.setTrashed(true);
      } catch (err) {}
    }
  }

  const file = actorFolder.createFile(blob);
  file.setDescription(
    "Harmony Health Wellness Profile Photo. Marker: WELLNESS_PROFILE_PHOTO_GOOGLE_DRIVE_V76",
  );
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (err) {}

  const fileId = file.getId();
  const driveUrl = file.getUrl();
  const publicUrl = "https://drive.google.com/uc?export=view&id=" + fileId;
  const previewUrl =
    "https://drive.google.com/thumbnail?id=" + fileId + "&sz=w600";
  const savedProfile = wellnessProfileSave_({
    actorType: actorType,
    actorId: actorId,
    actorName: actorName,
    actorCode: payload.actorCode,
    actorEmail: payload.actorEmail,
    photoUrl: publicUrl || driveUrl,
    photoPreviewUrl: previewUrl || publicUrl || driveUrl,
  });

  return {
    ok: true,
    fileId: fileId,
    name: file.getName(),
    mimeType: contentType,
    driveUrl: driveUrl,
    publicUrl: publicUrl,
    previewUrl: previewUrl,
    thumbnailUrl: previewUrl,
    profile: savedProfile.profile,
    folderPath:
      root.getName() +
      " / " +
      profileRoot.getName() +
      " / " +
      actorTypeFolder.getName() +
      " / " +
      actorFolder.getName(),
    marker: "WELLNESS_PROFILE_PHOTO_GOOGLE_DRIVE_V76B",
  };
}

// -----------------------------------------------------------------------------
// WELLNESS SUPPORT CHAT V61
// Text/metadata: Google Sheet. Attachments: Google Drive. No Supabase Storage.
// -----------------------------------------------------------------------------
function supportClean_(value) {
  return String(value === null || value === undefined ? "" : value).trim();
}

function supportNow_() {
  return new Date().toISOString();
}

function supportSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  const current =
    sheet.getLastColumn() > 0
      ? sheet
          .getRange(1, 1, 1, sheet.getLastColumn())
          .getValues()[0]
          .map(String)
      : [];
  if (!current.length) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    const missing = headers.filter(function (header) {
      return current.indexOf(header) === -1;
    });
    if (missing.length) {
      const next = current.concat(missing);
      sheet.getRange(1, 1, 1, next.length).setValues([next]);
    }
  }
  sheet.setFrozenRows(1);
  sheet
    .getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length))
    .setFontWeight("bold")
    .setBackground("#eef2ff")
    .setWrap(true);
  return sheet;
}

function supportHeaders_(sheet) {
  if (sheet.getLastColumn() < 1) return [];
  return sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map(String);
}

function supportRows_(sheet) {
  const headers = supportHeaders_(sheet);
  if (sheet.getLastRow() < 2 || !headers.length) return [];
  const values = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, headers.length)
    .getValues();
  return values.map(function (row, index) {
    const item = { __row: index + 2 };
    headers.forEach(function (header, column) {
      item[header] = row[column];
    });
    return item;
  });
}

function supportWriteRow_(sheet, rowNumber, object) {
  const headers = supportHeaders_(sheet);
  const values = headers.map(function (header) {
    return object.hasOwnProperty(header) ? normalizeCell(object[header]) : "";
  });
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([values]);
}

function supportAppendRow_(sheet, object) {
  const headers = supportHeaders_(sheet);
  sheet.appendRow(
    headers.map(function (header) {
      return normalizeCell(object[header]);
    }),
  );
  return sheet.getLastRow();
}

function supportThreadPublic_(row) {
  if (!row) return null;
  return {
    ticket_id: supportClean_(row["Ticket ID"]),
    created_at: supportClean_(row["Created At"]),
    updated_at: supportClean_(row["Updated At"]),
    actor_type: supportClean_(row["Actor Type"]),
    actor_id: supportClean_(row["Actor ID"]),
    actor_name: supportClean_(row["Actor Name"]),
    actor_code: supportClean_(row["Actor Code"]),
    company: supportClean_(row["Company"]),
    kelompok: supportClean_(row["Kelompok"]),
    email: supportClean_(row["Email"]),
    status: supportClean_(row["Status"]) || "Open",
    subject: supportClean_(row["Subject"]) || "Kendala Teknis Aplikasi",
    last_message: supportClean_(row["Last Message"]),
    last_sender_type: supportClean_(row["Last Sender Type"]),
    unread_admin: Number(row["Unread Admin"] || 0),
    unread_user: Number(row["Unread User"] || 0),
    closed_at: supportClean_(row["Closed At"]),
  };
}

function supportMessagePublic_(row) {
  if (!row) return null;
  return {
    message_id: supportClean_(row["Message ID"]),
    ticket_id: supportClean_(row["Ticket ID"]),
    created_at: supportClean_(row["Created At"]),
    sender_type: supportClean_(row["Sender Type"]),
    sender_id: supportClean_(row["Sender ID"]),
    sender_name: supportClean_(row["Sender Name"]),
    message: supportClean_(row["Message"]),
    attachment_name: supportClean_(row["Attachment Name"]),
    attachment_type: supportClean_(row["Attachment Type"]),
    attachment_size: Number(row["Attachment Size"] || 0),
    attachment_url: supportClean_(row["Attachment URL"]),
    attachment_preview_url: supportClean_(row["Attachment Preview URL"]),
    read_by_admin_at: supportClean_(row["Read By Admin At"]),
    read_by_user_at: supportClean_(row["Read By User At"]),
  };
}

function supportFindThreadByActor_(actorType, actorId) {
  const sheet = supportSheet_(
    SUPPORT_THREADS_SHEET_NAME,
    SUPPORT_THREAD_HEADERS,
  );
  const rows = supportRows_(sheet).filter(function (row) {
    return (
      supportClean_(row["Actor Type"]) === supportClean_(actorType) &&
      supportClean_(row["Actor ID"]) === supportClean_(actorId)
    );
  });
  rows.sort(function (a, b) {
    return supportClean_(b["Updated At"]).localeCompare(
      supportClean_(a["Updated At"]),
    );
  });
  return rows[0] || null;
}

function supportFindThreadById_(ticketId) {
  const sheet = supportSheet_(
    SUPPORT_THREADS_SHEET_NAME,
    SUPPORT_THREAD_HEADERS,
  );
  const rows = supportRows_(sheet);
  return (
    rows.find(function (row) {
      return supportClean_(row["Ticket ID"]) === supportClean_(ticketId);
    }) || null
  );
}

function supportEnsureThread(payload) {
  const actorType = supportClean_(payload.actorType);
  const actorId = supportClean_(payload.actorId);
  if (!actorType || !actorId)
    throw new Error("actorType dan actorId wajib untuk support thread");

  let row = supportFindThreadByActor_(actorType, actorId);
  if (row)
    return { ok: true, thread: supportThreadPublic_(row), created: false };

  const sheet = supportSheet_(
    SUPPORT_THREADS_SHEET_NAME,
    SUPPORT_THREAD_HEADERS,
  );
  const now = supportNow_();
  const ticketId =
    "SUP-" +
    Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone() || "Asia/Jakarta",
      "yyyyMMdd",
    ) +
    "-" +
    Utilities.getUuid().slice(0, 8).toUpperCase();
  const object = {
    "Ticket ID": ticketId,
    "Created At": now,
    "Updated At": now,
    "Actor Type": actorType,
    "Actor ID": actorId,
    "Actor Name": supportClean_(payload.actorName),
    "Actor Code": supportClean_(payload.actorCode),
    Company: supportClean_(payload.actorCompany),
    Kelompok: supportClean_(payload.actorGroup),
    Email: supportClean_(payload.actorEmail),
    Status: "Open",
    Subject: "Kendala Teknis Aplikasi",
    "Last Message": "",
    "Last Sender Type": "",
    "Unread Admin": 0,
    "Unread User": 0,
    "Closed At": "",
  };
  const rowNumber = supportAppendRow_(sheet, object);
  object.__row = rowNumber;
  return { ok: true, thread: supportThreadPublic_(object), created: true };
}

function supportMessagesForTicket_(ticketId, limit) {
  const sheet = supportSheet_(
    SUPPORT_MESSAGES_SHEET_NAME,
    SUPPORT_MESSAGE_HEADERS,
  );
  const rows = supportRows_(sheet).filter(function (row) {
    return supportClean_(row["Ticket ID"]) === supportClean_(ticketId);
  });
  rows.sort(function (a, b) {
    return supportClean_(a["Created At"]).localeCompare(
      supportClean_(b["Created At"]),
    );
  });
  const safeLimit = Math.max(1, Math.min(50, Number(limit || 30)));
  return rows.slice(Math.max(0, rows.length - safeLimit));
}

function supportMarkReadInternal_(ticketId, readerType) {
  const messageSheet = supportSheet_(
    SUPPORT_MESSAGES_SHEET_NAME,
    SUPPORT_MESSAGE_HEADERS,
  );
  const messageHeaders = supportHeaders_(messageSheet);
  const adminCol = messageHeaders.indexOf("Read By Admin At") + 1;
  const userCol = messageHeaders.indexOf("Read By User At") + 1;
  const senderCol = messageHeaders.indexOf("Sender Type") + 1;
  const ticketCol = messageHeaders.indexOf("Ticket ID") + 1;
  const now = supportNow_();

  if (messageSheet.getLastRow() > 1) {
    const data = messageSheet
      .getRange(2, 1, messageSheet.getLastRow() - 1, messageHeaders.length)
      .getValues();
    data.forEach(function (row, index) {
      if (supportClean_(row[ticketCol - 1]) !== supportClean_(ticketId)) return;
      const sender = supportClean_(row[senderCol - 1]);
      if (readerType === "admin" && sender !== "admin" && !row[adminCol - 1]) {
        messageSheet.getRange(index + 2, adminCol).setValue(now);
      }
      if (readerType !== "admin" && sender === "admin" && !row[userCol - 1]) {
        messageSheet.getRange(index + 2, userCol).setValue(now);
      }
    });
  }

  const threadSheet = supportSheet_(
    SUPPORT_THREADS_SHEET_NAME,
    SUPPORT_THREAD_HEADERS,
  );
  const thread = supportFindThreadById_(ticketId);
  if (thread) {
    if (readerType === "admin") thread["Unread Admin"] = 0;
    else thread["Unread User"] = 0;
    supportWriteRow_(threadSheet, thread.__row, thread);
  }
}

function supportGetThread(payload) {
  const row = supportFindThreadByActor_(payload.actorType, payload.actorId);
  if (!row) return { ok: true, thread: null, messages: [] };
  const ticketId = supportClean_(row["Ticket ID"]);
  if (payload.markRead)
    supportMarkReadInternal_(ticketId, supportClean_(payload.actorType));
  const refreshed = supportFindThreadById_(ticketId) || row;
  return {
    ok: true,
    thread: supportThreadPublic_(refreshed),
    messages: supportMessagesForTicket_(ticketId, payload.limit).map(
      supportMessagePublic_,
    ),
  };
}

function supportGetMessages(payload) {
  const ticketId = supportClean_(payload.ticketId);
  const row = supportFindThreadById_(ticketId);
  if (!row) throw new Error("Ticket support tidak ditemukan");
  if (payload.markRead)
    supportMarkReadInternal_(ticketId, supportClean_(payload.actorType));
  const refreshed = supportFindThreadById_(ticketId) || row;
  return {
    ok: true,
    thread: supportThreadPublic_(refreshed),
    messages: supportMessagesForTicket_(ticketId, payload.limit).map(
      supportMessagePublic_,
    ),
  };
}

function supportSendMessage(payload) {
  const senderType = supportClean_(payload.senderType || payload.actorType);
  let ticketId = supportClean_(payload.ticketId);
  if (!ticketId && senderType !== "admin") {
    ticketId = supportEnsureThread(payload).thread.ticket_id;
  }
  const thread = supportFindThreadById_(ticketId);
  if (!thread) throw new Error("Ticket support tidak ditemukan");

  const messageText = supportClean_(payload.message).slice(0, 2000);
  const attachmentUrl = supportClean_(payload.attachmentUrl);
  if (!messageText && !attachmentUrl)
    throw new Error("Pesan atau attachment wajib diisi");

  const now = supportNow_();
  const messageSheet = supportSheet_(
    SUPPORT_MESSAGES_SHEET_NAME,
    SUPPORT_MESSAGE_HEADERS,
  );
  const messageObject = {
    "Message ID": "MSG-" + Utilities.getUuid(),
    "Ticket ID": ticketId,
    "Created At": now,
    "Sender Type": senderType,
    "Sender ID": supportClean_(payload.senderId || payload.actorId),
    "Sender Name": supportClean_(payload.senderName || payload.actorName),
    Message: messageText,
    "Attachment Name": supportClean_(payload.attachmentName),
    "Attachment Type": supportClean_(payload.attachmentType),
    "Attachment Size": Number(payload.attachmentSize || 0),
    "Attachment URL": attachmentUrl,
    "Attachment Preview URL": supportClean_(payload.attachmentPreviewUrl),
    "Read By Admin At": senderType === "admin" ? now : "",
    "Read By User At": senderType === "admin" ? "" : now,
  };
  supportAppendRow_(messageSheet, messageObject);

  const threadSheet = supportSheet_(
    SUPPORT_THREADS_SHEET_NAME,
    SUPPORT_THREAD_HEADERS,
  );
  thread["Updated At"] = now;
  thread["Status"] =
    supportClean_(thread["Status"]) === "Selesai"
      ? "Open"
      : supportClean_(thread["Status"]) || "Open";
  thread["Closed At"] = "";
  thread["Last Message"] =
    messageText || "Attachment: " + supportClean_(payload.attachmentName);
  thread["Last Sender Type"] = senderType;
  if (senderType === "admin") {
    thread["Unread User"] = Number(thread["Unread User"] || 0) + 1;
  } else {
    thread["Unread Admin"] = Number(thread["Unread Admin"] || 0) + 1;
  }
  supportWriteRow_(threadSheet, thread.__row, thread);

  return {
    ok: true,
    thread: supportThreadPublic_(thread),
    message: supportMessagePublic_(messageObject),
  };
}

function supportMarkRead(payload) {
  let ticketId = supportClean_(payload.ticketId);
  if (!ticketId && supportClean_(payload.actorType) !== "admin") {
    const thread = supportFindThreadByActor_(
      payload.actorType,
      payload.actorId,
    );
    ticketId = thread ? supportClean_(thread["Ticket ID"]) : "";
  }
  if (!ticketId) return { ok: true, marked: false };
  supportMarkReadInternal_(
    ticketId,
    supportClean_(payload.readerType || payload.actorType),
  );
  return { ok: true, marked: true };
}

function supportListThreads(payload) {
  const status = supportClean_(payload.status || "all");
  const query = supportClean_(payload.query).toLowerCase();
  const limit = Math.max(1, Math.min(80, Number(payload.limit || 40)));
  const sheet = supportSheet_(
    SUPPORT_THREADS_SHEET_NAME,
    SUPPORT_THREAD_HEADERS,
  );
  let rows = supportRows_(sheet);
  const allRows = rows.slice();

  if (status && status !== "all") {
    rows = rows.filter(function (row) {
      return supportClean_(row["Status"]) === status;
    });
  }
  if (query) {
    rows = rows.filter(function (row) {
      return (
        [
          row["Ticket ID"],
          row["Actor Name"],
          row["Actor Code"],
          row["Company"],
          row["Kelompok"],
          row["Last Message"],
        ]
          .map(function (value) {
            return supportClean_(value).toLowerCase();
          })
          .join(" ")
          .indexOf(query) !== -1
      );
    });
  }
  rows.sort(function (a, b) {
    return supportClean_(b["Updated At"]).localeCompare(
      supportClean_(a["Updated At"]),
    );
  });

  return {
    ok: true,
    threads: rows.slice(0, limit).map(supportThreadPublic_),
    summary: {
      total: allRows.length,
      open: allRows.filter(function (row) {
        return supportClean_(row["Status"]) === "Open";
      }).length,
      handled: allRows.filter(function (row) {
        return supportClean_(row["Status"]) === "Ditangani";
      }).length,
      closed: allRows.filter(function (row) {
        return supportClean_(row["Status"]) === "Selesai";
      }).length,
      unread: allRows.reduce(function (sum, row) {
        return sum + Number(row["Unread Admin"] || 0);
      }, 0),
    },
  };
}

function supportUpdateStatus(payload) {
  const ticketId = supportClean_(payload.ticketId);
  const status = supportClean_(payload.status);
  if (["Open", "Ditangani", "Selesai"].indexOf(status) === -1)
    throw new Error("Status support tidak valid");
  const sheet = supportSheet_(
    SUPPORT_THREADS_SHEET_NAME,
    SUPPORT_THREAD_HEADERS,
  );
  const thread = supportFindThreadById_(ticketId);
  if (!thread) throw new Error("Ticket support tidak ditemukan");
  thread["Status"] = status;
  thread["Updated At"] = supportNow_();
  thread["Closed At"] = status === "Selesai" ? supportNow_() : "";
  supportWriteRow_(sheet, thread.__row, thread);
  return { ok: true, thread: supportThreadPublic_(thread) };
}

function uploadSupportAttachmentToDrive(payload) {
  const filename = sanitizeFileName(
    payload.filename || payload.originalFilename || "support-attachment",
  );
  const contentType = supportClean_(
    payload.contentType || "application/octet-stream",
  );
  const base64 = supportClean_(payload.dataBase64);
  const ticketId = supportClean_(payload.ticketId);
  if (!base64) throw new Error("dataBase64 is required for support attachment");
  if (!ticketId) throw new Error("ticketId is required for support attachment");

  const bytes = Utilities.base64Decode(base64);
  const blob = Utilities.newBlob(bytes, contentType, filename);
  const root = getEvidenceRootFolder(
    payload.folderName || DEFAULT_EVIDENCE_FOLDER_NAME,
  );
  const supportFolder = getOrCreateFolder(root, SUPPORT_FOLDER_NAME);
  const ticketFolder = getOrCreateFolder(
    supportFolder,
    sanitizeFolderName(ticketId),
  );
  const file = ticketFolder.createFile(blob);
  file.setDescription(
    "Harmony Health Wellness Technical Support. Marker: WELLNESS_SUPPORT_CHAT_GOOGLE_SHEET_DRIVE_V61",
  );
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (err) {}

  const fileId = file.getId();
  const driveUrl = file.getUrl();
  const publicUrl = "https://drive.google.com/uc?export=view&id=" + fileId;
  const previewUrl =
    contentType.indexOf("image/") === 0
      ? "https://drive.google.com/thumbnail?id=" + fileId + "&sz=w800"
      : driveUrl;

  return {
    ok: true,
    fileId: fileId,
    name: file.getName(),
    mimeType: contentType,
    driveUrl: driveUrl,
    publicUrl: publicUrl,
    previewUrl: previewUrl,
    thumbnailUrl: previewUrl,
    ticketId: ticketId,
    folderPath:
      root.getName() +
      " / " +
      supportFolder.getName() +
      " / " +
      ticketFolder.getName(),
    marker: "WELLNESS_SUPPORT_CHAT_GOOGLE_SHEET_DRIVE_V61",
  };
}

function getEvidenceRootFolder(folderName) {
  const props = PropertiesService.getScriptProperties();
  const rawFolderId =
    props.getProperty("WELLNESS_DRIVE_FOLDER_ID") ||
    props.getProperty("WELLNESS_GOOGLE_DRIVE_FOLDER_ID") ||
    "";
  const configuredFolderId = normalizeDriveFolderId_(rawFolderId);
  const configuredFolderName = String(
    props.getProperty("WELLNESS_DRIVE_ROOT_FOLDER_NAME") ||
      folderName ||
      DEFAULT_EVIDENCE_FOLDER_NAME ||
      "wellness program",
  ).trim();

  // WELLNESS_GOOGLE_DRIVE_FOLDER_FALLBACK_V370
  // Priority:
  // 1. Use WELLNESS_DRIVE_FOLDER_ID when accessible.
  // 2. If getFolderById fails, fallback to folder name search in My Drive.
  // 3. If not found, create the folder in My Drive root.
  if (configuredFolderId) {
    try {
      return DriveApp.getFolderById(configuredFolderId);
    } catch (err) {
      // Do not stop the upload only because getFolderById is blocked/unavailable.
      // Some accounts/scripts throw a generic DriveApp error here even when the folder exists.
      console.warn(
        "WELLNESS_DRIVE_FOLDER_ID could not be accessed, falling back to folder name. Raw: " +
          rawFolderId +
          ". Parsed: " +
          configuredFolderId +
          ". Detail: " +
          (err && err.message ? err.message : String(err)),
      );
    }
  }

  const nameToFind =
    configuredFolderName || DEFAULT_EVIDENCE_FOLDER_NAME || "wellness program";
  try {
    const folders = DriveApp.getFoldersByName(nameToFind);
    if (folders.hasNext()) return folders.next();
  } catch (err) {
    throw new Error(
      "DriveApp bisa jalan tapi pencarian folder gagal. Detail: " +
        (err && err.message ? err.message : String(err)),
    );
  }

  try {
    return DriveApp.createFolder(nameToFind);
  } catch (err) {
    throw new Error(
      "Tidak bisa membuat folder root evidence di Google Drive. Pastikan Apps Script sudah authorize DriveApp. Detail: " +
        (err && err.message ? err.message : String(err)),
    );
  }
}

function normalizeDriveFolderId_(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  // Accept either pure folder ID or a pasted Google Drive folder URL.
  const folderUrlMatch = text.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderUrlMatch && folderUrlMatch[1]) return folderUrlMatch[1];

  const idParamMatch = text.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch && idParamMatch[1]) return idParamMatch[1];

  return text.replace(/^['\"]+|['\"]+$/g, "").trim();
}

function checkWellnessDriveConfig_() {
  const props = PropertiesService.getScriptProperties();
  const rawFolderId =
    props.getProperty("WELLNESS_DRIVE_FOLDER_ID") ||
    props.getProperty("WELLNESS_GOOGLE_DRIVE_FOLDER_ID") ||
    "";
  const parsedFolderId = normalizeDriveFolderId_(rawFolderId);
  const configuredFolderName = String(
    props.getProperty("WELLNESS_DRIVE_ROOT_FOLDER_NAME") ||
      DEFAULT_EVIDENCE_FOLDER_NAME ||
      "wellness program",
  ).trim();
  const secretExists = !!(props.getProperty("WELLNESS_WEBHOOK_SECRET") || "");
  const result = {
    marker: "WELLNESS_GOOGLE_DRIVE_FOLDER_FALLBACK_V370",
    secretExists: secretExists,
    rawFolderId: rawFolderId ? "[SET]" : "",
    parsedFolderId: parsedFolderId,
    folderNameFromProperty: configuredFolderName,
    folderAccessible: false,
    folderAccessMethod: "",
    folderName: "",
    folderUrl: "",
    folderId: "",
    message: "",
  };

  if (parsedFolderId) {
    try {
      const folder = DriveApp.getFolderById(parsedFolderId);
      result.folderAccessible = true;
      result.folderAccessMethod = "id";
      result.folderName = folder.getName();
      result.folderUrl = folder.getUrl();
      result.folderId = folder.getId();
      result.message = "Root folder bisa diakses via WELLNESS_DRIVE_FOLDER_ID.";
      return result;
    } catch (err) {
      result.message =
        "Folder ID tidak bisa diakses, mencoba fallback nama folder. Detail ID: " +
        (err && err.message ? err.message : String(err));
    }
  }

  try {
    const folders = DriveApp.getFoldersByName(configuredFolderName);
    if (folders.hasNext()) {
      const folder = folders.next();
      result.folderAccessible = true;
      result.folderAccessMethod = "name_fallback";
      result.folderName = folder.getName();
      result.folderUrl = folder.getUrl();
      result.folderId = folder.getId();
      result.message =
        "Root folder bisa diakses via pencarian nama folder. Upload akan tetap memakai folder ini.";
      return result;
    }
  } catch (err) {
    result.message =
      result.message +
      " Fallback nama folder juga gagal: " +
      (err && err.message ? err.message : String(err));
    return result;
  }

  try {
    const folder = DriveApp.createFolder(configuredFolderName);
    result.folderAccessible = true;
    result.folderAccessMethod = "created_in_my_drive";
    result.folderName = folder.getName();
    result.folderUrl = folder.getUrl();
    result.folderId = folder.getId();
    result.message = "Root folder belum ada, jadi dibuat otomatis di My Drive.";
    return result;
  } catch (err) {
    result.message =
      result.message +
      " Tidak bisa membuat root folder: " +
      (err && err.message ? err.message : String(err));
    return result;
  }
}

function testDriveAccess() {
  const result = checkWellnessDriveConfig_();
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function testDriveRootAccess() {
  const root = DriveApp.getRootFolder();
  Logger.log(root.getName());
  return root.getName();
}

function getOrCreateFolder(parent, name) {
  const safeName = sanitizeFolderName(name || "Folder");
  const folders = parent.getFoldersByName(safeName);
  if (folders.hasNext()) return folders.next();
  return parent.createFolder(safeName);
}

function buildParticipantFolderName(payload) {
  const code = String(
    payload.participantCode || payload.participant_code || "",
  ).trim();
  const name = String(
    payload.participantName || payload.participant_name || "",
  ).trim();
  const participantId = String(
    payload.participantId || payload.participant_id || "",
  ).trim();
  if (code && name) return code + " - " + name;
  if (name) return name;
  if (code) return code;
  if (participantId) return "Participant " + participantId;
  return DEFAULT_PARTICIPANT_FOLDER_NAME;
}

function resolveEvidenceCategory(payload) {
  const explicit = sanitizeFolderName(
    payload.evidenceCategory || payload.evidence_category || "",
  );
  if (explicit) return explicit;
  const fieldKey = String(payload.fieldKey || "").toLowerCase();
  const activeTab = String(
    payload.activeTab || payload.active_tab || "",
  ).toLowerCase();
  if (fieldKey.indexOf("photo") !== -1 || activeTab === "nutrition")
    return "Nutrisi";
  if (fieldKey.indexOf("activity") !== -1 || activeTab === "activity")
    return "Workout";
  if (fieldKey.indexOf("healthtalk") !== -1 || activeTab === "healthtalk")
    return "Health Talk";
  return "Evidence";
}

function sanitizeFolderName(name) {
  const text = String(name || "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text || "Folder";
}

function sanitizeFileName(name) {
  const text = String(name || "wellness-evidence")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return text || "wellness-evidence";
}

function normalizeImageUrl(value) {
  const text = normalizeCell(value);
  if (!text) return "";
  const driveMatch =
    text.match(/drive\.google\.com\/file\/d\/([^/]+)/i) ||
    text.match(/[?&]id=([^&]+)/i);
  if (driveMatch && driveMatch[1] && /drive\.google\.com/i.test(text)) {
    return (
      "https://drive.google.com/thumbnail?id=" + driveMatch[1] + "&sz=w1200"
    );
  }
  return text;
}

function shouldRenderImage(header) {
  return (
    String(header || "")
      .toLowerCase()
      .indexOf("preview") !== -1
  );
}

function normalizeCellWithHeader(header, value) {
  if (!shouldRenderImage(header)) return normalizeCell(value);
  const url = normalizeImageUrl(value);
  if (!url) return "";
  // Display the image directly in the sheet. The file/link must be publicly viewable.
  return '=IMAGE("' + url.replace(/"/g, '""') + '", 1)';
}

function normalizeCell(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

function jsonResponse(data, statusCode) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
