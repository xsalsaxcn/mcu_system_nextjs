/**
 * WELLNESS_GOOGLE_DRIVE_FOLDER_FALLBACK_V370_APPS_SCRIPT
 * Paste into Extensions > Apps Script in the target Google Sheet, then Deploy > Web app.
 * This creates a Jotform-like "Form Responses" tab: fixed headers, frozen header, filter, and append-only rows.
 */

const DEFAULT_SHEET_NAME = 'Form Responses';
const DEFAULT_EVIDENCE_FOLDER_NAME = 'wellness program';
const DEFAULT_COMPANY_FOLDER_NAME = 'Tanpa Perusahaan';
const DEFAULT_PARTICIPANT_FOLDER_NAME = 'Tanpa Nama Peserta';

const FORM_RESPONSE_HEADERS = [
  'Submission Date',
  'Pilih Nama Anda',
  'Nama Peserta',
  'Waktu Makan',
  'Add Options',
  'Upload Foto Makanan',
  'Preview Foto Makanan',
  'Melakukan Workout/Aktifitas Ringan?',
  'Jenis Workout/Aktifitas',
  'Jelaskan pencapaian Workout/Aktifitas yang anda lakukan (Berapa Set/Berapa banyak langkah kaki)',
  'Submission IP',
  'Berapa Menit anda melakukan nya ?',
  'Berat badan Awal',
  'BB anda per hari ini (diisi sekali saja perminggu)',
  'Helper column BB jangan diubah',
  'BB Monitoring terbaru',
  'Lingkar Perut (cm)',
  'BMI',
  'Catatan Nutrisi',
  'Kalori Makanan',
  'Detected Foods',
  'Kalori Aktivitas',
  'Bukti Aktivitas',
  'Preview Bukti Aktivitas',
  'Healthtalk/Seminar',
  'Jenis Healthtalk',
  'Tanggal Healthtalk',
  'Bukti Healthtalk',
  'Preview Bukti Healthtalk',
  'Total Point',
  'Company',
  'Kelompok',
  'Group Upload',
  'Risk Cluster',
  'KODE',
  'Participant ID',
  'Log Date',
  'Log Type',
  'Evidence Count',
  'Created By',
  'Marker'
];


function doGet(e) {
  try {
    return jsonResponse({
      ok: true,
      marker: 'WELLNESS_GOOGLE_DRIVE_FOLDER_FALLBACK_V370',
      drive: checkWellnessDriveConfig_(),
      message: 'Webhook is active. Use action=uploadEvidence from the app to upload evidence files.'
    });
  } catch (err) {
    return jsonResponse({
      ok: false,
      marker: 'WELLNESS_GOOGLE_DRIVE_FOLDER_FALLBACK_V370',
      message: err && err.message ? err.message : String(err)
    }, 500);
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
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const expectedSecret = PropertiesService.getScriptProperties().getProperty('WELLNESS_WEBHOOK_SECRET') || '';
    if (expectedSecret && payload.secret !== expectedSecret) {
      return jsonResponse({ ok: false, message: 'Unauthorized webhook secret' }, 401);
    }

    if (payload.action === 'uploadEvidence') {
      return jsonResponse(uploadEvidenceToDrive(payload));
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetName = payload.sheet || DEFAULT_SHEET_NAME;
    const sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
    const row = payload.row || {};
    if (!Object.keys(row).length) {
      return jsonResponse({ ok: false, message: 'No row data supplied' }, 400);
    }

    const headers = ensureHeaders(sheet, row);
    const values = headers.map((header) => normalizeCellWithHeader(header, row[header]));
    sheet.appendRow(values);
    formatResponseSheet(sheet, headers);

    return jsonResponse({ ok: true, sheet: sheetName, appended: true, columns: headers.length, rowNumber: sheet.getLastRow() });
  } catch (err) {
    return jsonResponse({ ok: false, message: err && err.message ? err.message : String(err) }, 500);
  } finally {
    lock.releaseLock();
  }
}

function ensureHeaders(sheet, row) {
  let headers = [];
  const lastColumn = sheet.getLastColumn();
  if (lastColumn > 0) {
    headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String).filter(Boolean);
  }

  if (!headers.length) {
    const extras = Object.keys(row).filter((key) => FORM_RESPONSE_HEADERS.indexOf(key) === -1);
    headers = FORM_RESPONSE_HEADERS.concat(extras);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return headers;
  }

  const desired = FORM_RESPONSE_HEADERS.concat(Object.keys(row).filter((key) => FORM_RESPONSE_HEADERS.indexOf(key) === -1));
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
  sheet.getRange(1, 1, 1, lastColumn)
    .setFontWeight('bold')
    .setFontSize(9)
    .setBackground('#f8fafc')
    .setWrap(true)
    .setVerticalAlignment('middle');
  sheet.getRange(1, 1, lastRow, lastColumn).setVerticalAlignment('middle');
  sheet.getRange(2, 1, Math.max(lastRow - 1, 1), lastColumn).setWrap(true);
  if (lastRow > 1) sheet.setRowHeights(2, Math.max(lastRow - 1, 1), 120);
  if (!sheet.getFilter()) {
    sheet.getRange(1, 1, lastRow, lastColumn).createFilter();
  }

  const widths = {
    'Submission Date': 150,
    'Pilih Nama Anda': 260,
    'Nama Peserta': 180,
    'Waktu Makan': 120,
    'Add Options': 280,
    'Upload Foto Makanan': 300,
    'Preview Foto Makanan': 180,
    'Melakukan Workout/Aktifitas Ringan?': 150,
    'Jenis Workout/Aktifitas': 170,
    'Jelaskan pencapaian Workout/Aktifitas yang anda lakukan (Berapa Set/Berapa banyak langkah kaki)': 260,
    'Submission IP': 140,
    'Berapa Menit anda melakukan nya ?': 120,
    'Berat badan Awal': 110,
    'BB anda per hari ini (diisi sekali saja perminggu)': 160,
    'Helper column BB jangan diubah': 150,
    'BB Monitoring terbaru': 140,
    'Bukti Aktivitas': 300,
    'Preview Bukti Aktivitas': 180,
    'Bukti Healthtalk': 300,
    'Preview Bukti Healthtalk': 180
  };
  headers.forEach((header, index) => {
    sheet.setColumnWidth(index + 1, widths[header] || 140);
  });
}


function uploadEvidenceToDrive(payload) {
  const filename = sanitizeFileName(payload.filename || payload.originalFilename || 'wellness-evidence');
  const contentType = String(payload.contentType || 'application/octet-stream');
  const base64 = String(payload.dataBase64 || '');
  if (!base64) throw new Error('dataBase64 is required for uploadEvidence');

  const bytes = Utilities.base64Decode(base64);
  const blob = Utilities.newBlob(bytes, contentType, filename);

  // WELLNESS_GOOGLE_DRIVE_FOLDER_FALLBACK_V370
  // Folder structure:
  // Root wellness folder / Company Name / Employee Name / Nutrisi|Workout|Health Talk
  const rootFolder = getEvidenceRootFolder(payload.folderName || DEFAULT_EVIDENCE_FOLDER_NAME);
  const companyFolder = getOrCreateFolder(rootFolder, sanitizeFolderName(payload.companyName || payload.company_name || DEFAULT_COMPANY_FOLDER_NAME));
  const participantFolder = getOrCreateFolder(companyFolder, sanitizeFolderName(buildParticipantFolderName(payload)));
  const categoryFolder = getOrCreateFolder(participantFolder, resolveEvidenceCategory(payload));

  const file = categoryFolder.createFile(blob);
  file.setDescription('Uploaded from Harmony Health App Wellness. Marker: WELLNESS_GOOGLE_DRIVE_FOLDER_FALLBACK_V370');

  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (err) {
    // Some Workspace policies may block public sharing. The upload still succeeds, but preview may require access.
  }

  const fileId = file.getId();
  const driveUrl = file.getUrl();
  const publicUrl = 'https://drive.google.com/uc?export=view&id=' + fileId;
  const previewUrl = contentType.indexOf('image/') === 0
    ? 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1200'
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
    folderPath: rootFolder.getName() + ' / ' + companyFolder.getName() + ' / ' + participantFolder.getName() + ' / ' + categoryFolder.getName(),
    category: categoryFolder.getName(),
    marker: 'WELLNESS_GOOGLE_DRIVE_FOLDER_FALLBACK_V370'
  };
}

function getEvidenceRootFolder(folderName) {
  const props = PropertiesService.getScriptProperties();
  const rawFolderId = props.getProperty('WELLNESS_DRIVE_FOLDER_ID') || props.getProperty('WELLNESS_GOOGLE_DRIVE_FOLDER_ID') || '';
  const configuredFolderId = normalizeDriveFolderId_(rawFolderId);
  const configuredFolderName = String(props.getProperty('WELLNESS_DRIVE_ROOT_FOLDER_NAME') || folderName || DEFAULT_EVIDENCE_FOLDER_NAME || 'wellness program').trim();

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
      console.warn('WELLNESS_DRIVE_FOLDER_ID could not be accessed, falling back to folder name. Raw: ' + rawFolderId + '. Parsed: ' + configuredFolderId + '. Detail: ' + (err && err.message ? err.message : String(err)));
    }
  }

  const nameToFind = configuredFolderName || DEFAULT_EVIDENCE_FOLDER_NAME || 'wellness program';
  try {
    const folders = DriveApp.getFoldersByName(nameToFind);
    if (folders.hasNext()) return folders.next();
  } catch (err) {
    throw new Error('DriveApp bisa jalan tapi pencarian folder gagal. Detail: ' + (err && err.message ? err.message : String(err)));
  }

  try {
    return DriveApp.createFolder(nameToFind);
  } catch (err) {
    throw new Error('Tidak bisa membuat folder root evidence di Google Drive. Pastikan Apps Script sudah authorize DriveApp. Detail: ' + (err && err.message ? err.message : String(err)));
  }
}

function normalizeDriveFolderId_(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  // Accept either pure folder ID or a pasted Google Drive folder URL.
  const folderUrlMatch = text.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderUrlMatch && folderUrlMatch[1]) return folderUrlMatch[1];

  const idParamMatch = text.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch && idParamMatch[1]) return idParamMatch[1];

  return text.replace(/^['\"]+|['\"]+$/g, '').trim();
}

function checkWellnessDriveConfig_() {
  const props = PropertiesService.getScriptProperties();
  const rawFolderId = props.getProperty('WELLNESS_DRIVE_FOLDER_ID') || props.getProperty('WELLNESS_GOOGLE_DRIVE_FOLDER_ID') || '';
  const parsedFolderId = normalizeDriveFolderId_(rawFolderId);
  const configuredFolderName = String(props.getProperty('WELLNESS_DRIVE_ROOT_FOLDER_NAME') || DEFAULT_EVIDENCE_FOLDER_NAME || 'wellness program').trim();
  const secretExists = !!(props.getProperty('WELLNESS_WEBHOOK_SECRET') || '');
  const result = {
    marker: 'WELLNESS_GOOGLE_DRIVE_FOLDER_FALLBACK_V370',
    secretExists: secretExists,
    rawFolderId: rawFolderId ? '[SET]' : '',
    parsedFolderId: parsedFolderId,
    folderNameFromProperty: configuredFolderName,
    folderAccessible: false,
    folderAccessMethod: '',
    folderName: '',
    folderUrl: '',
    folderId: '',
    message: ''
  };

  if (parsedFolderId) {
    try {
      const folder = DriveApp.getFolderById(parsedFolderId);
      result.folderAccessible = true;
      result.folderAccessMethod = 'id';
      result.folderName = folder.getName();
      result.folderUrl = folder.getUrl();
      result.folderId = folder.getId();
      result.message = 'Root folder bisa diakses via WELLNESS_DRIVE_FOLDER_ID.';
      return result;
    } catch (err) {
      result.message = 'Folder ID tidak bisa diakses, mencoba fallback nama folder. Detail ID: ' + (err && err.message ? err.message : String(err));
    }
  }

  try {
    const folders = DriveApp.getFoldersByName(configuredFolderName);
    if (folders.hasNext()) {
      const folder = folders.next();
      result.folderAccessible = true;
      result.folderAccessMethod = 'name_fallback';
      result.folderName = folder.getName();
      result.folderUrl = folder.getUrl();
      result.folderId = folder.getId();
      result.message = 'Root folder bisa diakses via pencarian nama folder. Upload akan tetap memakai folder ini.';
      return result;
    }
  } catch (err) {
    result.message = result.message + ' Fallback nama folder juga gagal: ' + (err && err.message ? err.message : String(err));
    return result;
  }

  try {
    const folder = DriveApp.createFolder(configuredFolderName);
    result.folderAccessible = true;
    result.folderAccessMethod = 'created_in_my_drive';
    result.folderName = folder.getName();
    result.folderUrl = folder.getUrl();
    result.folderId = folder.getId();
    result.message = 'Root folder belum ada, jadi dibuat otomatis di My Drive.';
    return result;
  } catch (err) {
    result.message = result.message + ' Tidak bisa membuat root folder: ' + (err && err.message ? err.message : String(err));
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
  const safeName = sanitizeFolderName(name || 'Folder');
  const folders = parent.getFoldersByName(safeName);
  if (folders.hasNext()) return folders.next();
  return parent.createFolder(safeName);
}

function buildParticipantFolderName(payload) {
  const code = String(payload.participantCode || payload.participant_code || '').trim();
  const name = String(payload.participantName || payload.participant_name || '').trim();
  const participantId = String(payload.participantId || payload.participant_id || '').trim();
  if (code && name) return code + ' - ' + name;
  if (name) return name;
  if (code) return code;
  if (participantId) return 'Participant ' + participantId;
  return DEFAULT_PARTICIPANT_FOLDER_NAME;
}

function resolveEvidenceCategory(payload) {
  const explicit = sanitizeFolderName(payload.evidenceCategory || payload.evidence_category || '');
  if (explicit) return explicit;
  const fieldKey = String(payload.fieldKey || '').toLowerCase();
  const activeTab = String(payload.activeTab || payload.active_tab || '').toLowerCase();
  if (fieldKey.indexOf('photo') !== -1 || activeTab === 'nutrition') return 'Nutrisi';
  if (fieldKey.indexOf('activity') !== -1 || activeTab === 'activity') return 'Workout';
  if (fieldKey.indexOf('healthtalk') !== -1 || activeTab === 'healthtalk') return 'Health Talk';
  return 'Evidence';
}

function sanitizeFolderName(name) {
  const text = String(name || '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text || 'Folder';
}

function sanitizeFileName(name) {
  const text = String(name || 'wellness-evidence')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return text || 'wellness-evidence';
}

function normalizeImageUrl(value) {
  const text = normalizeCell(value);
  if (!text) return '';
  const driveMatch = text.match(/drive\.google\.com\/file\/d\/([^/]+)/i) || text.match(/[?&]id=([^&]+)/i);
  if (driveMatch && driveMatch[1] && /drive\.google\.com/i.test(text)) {
    return 'https://drive.google.com/thumbnail?id=' + driveMatch[1] + '&sz=w1200';
  }
  return text;
}

function shouldRenderImage(header) {
  return String(header || '').toLowerCase().indexOf('preview') !== -1;
}

function normalizeCellWithHeader(header, value) {
  if (!shouldRenderImage(header)) return normalizeCell(value);
  const url = normalizeImageUrl(value);
  if (!url) return '';
  // Display the image directly in the sheet. The file/link must be publicly viewable.
  return '=IMAGE("' + url.replace(/"/g, '""') + '", 1)';
}

function normalizeCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

function jsonResponse(data, statusCode) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
