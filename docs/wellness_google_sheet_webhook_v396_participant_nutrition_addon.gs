/**
 * WELLNESS_GOOGLE_SHEET_DRIVE_PARTICIPANT_NUTRITION_ADDON_V396
 *
 * Use this only if the current Apps Script webhook does NOT yet support
 * action: "participant_nutrition".
 *
 * Add this block to your existing Google Sheet Apps Script, then add this line
 * near the top of doPost(e), after the JSON payload is parsed:
 *
 *   if (payload.action === 'participant_nutrition' || payload.type === 'participant_nutrition') {
 *     return jsonResponse_(handleParticipantNutritionV396_(payload));
 *   }
 *
 * If your existing script uses another JSON helper, adapt the return line only.
 */

function handleParticipantNutritionV396_(payload) {
  var props = PropertiesService.getScriptProperties();
  var configuredSecret = props.getProperty('WELLNESS_GOOGLE_SHEET_WEBHOOK_SECRET') || props.getProperty('WELLNESS_WEBHOOK_SECRET') || '';
  var requestSecret = String(payload.secret || payload.webhook_secret || '').trim();

  if (configuredSecret && requestSecret !== configuredSecret) {
    throw new Error('Unauthorized webhook secret.');
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = props.getProperty('WELLNESS_GOOGLE_SHEET_TAB_NAME') || 'Form Responses';
  var sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);

  var photoInfo = null;
  if (payload.photo_base64) {
    photoInfo = saveParticipantNutritionPhotoV396_(payload);
  }

  ensureParticipantNutritionHeaderV396_(sheet);

  sheet.appendRow([
    new Date(),
    payload.participant_id || '',
    payload.participant_code || '',
    payload.participant_name || '',
    payload.participant_email || '',
    payload.participant_phone || '',
    payload.log_date || '',
    payload.meal_type || '',
    payload.food_name || '',
    payload.portion || '',
    payload.calories == null ? '' : payload.calories,
    payload.calorie_source || '',
    payload.calorie_reference_id || '',
    payload.calorie_reference_name || '',
    payload.calorie_match_status || '',
    payload.food_category || '',
    payload.notes || '',
    photoInfo ? photoInfo.fileId : '',
    photoInfo ? photoInfo.fileUrl : '',
    photoInfo ? photoInfo.thumbnailUrl : '',
    'WELLNESS_GOOGLE_SHEET_DRIVE_PARTICIPANT_NUTRITION_ADDON_V396'
  ]);

  return {
    ok: true,
    marker: 'WELLNESS_GOOGLE_SHEET_DRIVE_PARTICIPANT_NUTRITION_ADDON_V396',
    sheet_name: sheetName,
    photo_url: photoInfo ? photoInfo.fileUrl : '',
    thumbnail_url: photoInfo ? photoInfo.thumbnailUrl : '',
    file_id: photoInfo ? photoInfo.fileId : ''
  };
}

function ensureParticipantNutritionHeaderV396_(sheet) {
  var headers = [
    'Timestamp',
    'Participant ID',
    'Kode Karyawan',
    'Nama Peserta',
    'Email',
    'Phone',
    'Tanggal Makan',
    'Waktu Makan',
    'Nama Makanan',
    'Porsi',
    'Kalori',
    'Calorie Source',
    'Calorie Reference ID',
    'Calorie Reference Name',
    'Calorie Match Status',
    'Kategori',
    'Catatan',
    'Google Drive File ID',
    'Photo URL',
    'Thumbnail URL',
    'Marker'
  ];

  var firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  var hasHeader = firstRow.some(function (cell) { return String(cell || '').trim() !== ''; });

  if (!hasHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

function saveParticipantNutritionPhotoV396_(payload) {
  var folder = getParticipantNutritionFolderV396_(payload);
  var mimeType = String(payload.photo_mime_type || 'image/jpeg').trim();
  var filename = String(payload.photo_filename || '').trim();

  if (!filename) {
    var safeName = String(payload.participant_name || payload.participant_code || payload.participant_id || 'peserta')
      .replace(/[^a-z0-9_-]+/gi, '_')
      .replace(/^_+|_+$/g, '');
    filename = 'nutrition_' + safeName + '_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss') + '.jpg';
  }

  var bytes = Utilities.base64Decode(String(payload.photo_base64 || ''));
  var blob = Utilities.newBlob(bytes, mimeType, filename);
  var file = folder.createFile(blob);
  file.setDescription('Participant nutrition photo. Marker: WELLNESS_GOOGLE_SHEET_DRIVE_PARTICIPANT_NUTRITION_ADDON_V396');

  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (err) {
    // Some Google Workspace policies may block public link sharing. Keep file saved anyway.
  }

  var fileId = file.getId();
  return {
    fileId: fileId,
    fileUrl: 'https://drive.google.com/uc?export=view&id=' + fileId,
    thumbnailUrl: 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1200'
  };
}

function getParticipantNutritionFolderV396_(payload) {
  var props = PropertiesService.getScriptProperties();
  var rootName = props.getProperty('WELLNESS_DRIVE_FOLDER_NAME') || 'wellness program';
  var rawFolderId = props.getProperty('WELLNESS_DRIVE_FOLDER_ID') || props.getProperty('WELLNESS_GOOGLE_DRIVE_FOLDER_ID') || '';
  var rootFolder = null;

  if (rawFolderId) {
    var folderId = extractGoogleDriveFolderIdV396_(rawFolderId);
    try {
      rootFolder = DriveApp.getFolderById(folderId);
    } catch (err) {
      rootFolder = null;
    }
  }

  if (!rootFolder) {
    var folders = DriveApp.getFoldersByName(rootName);
    rootFolder = folders.hasNext() ? folders.next() : DriveApp.createFolder(rootName);
  }

  var evidenceFolder = getOrCreateSubfolderV396_(rootFolder, 'Participant Nutrition Photos');
  var dateFolder = getOrCreateSubfolderV396_(evidenceFolder, String(payload.log_date || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')));
  return dateFolder;
}

function getOrCreateSubfolderV396_(parent, name) {
  var folders = parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parent.createFolder(name);
}

function extractGoogleDriveFolderIdV396_(text) {
  var value = String(text || '').trim();
  var match = value.match(/drive\.google\.com\/drive\/folders\/([^/?#]+)/i);
  if (match && match[1]) return match[1];
  return value;
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj || {}))
    .setMimeType(ContentService.MimeType.JSON);
}
