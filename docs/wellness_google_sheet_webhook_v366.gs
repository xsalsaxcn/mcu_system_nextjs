/**
 * WELLNESS_INLINE_IMAGE_SHEET_V366_APPS_SCRIPT
 * Paste into Extensions > Apps Script in the target Google Sheet, then Deploy > Web app.
 * This creates a Jotform-like "Form Responses" tab: fixed headers, frozen header, filter, and append-only rows.
 */

const DEFAULT_SHEET_NAME = 'Form Responses';

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

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const expectedSecret = PropertiesService.getScriptProperties().getProperty('WELLNESS_WEBHOOK_SECRET') || '';
    if (expectedSecret && payload.secret !== expectedSecret) {
      return jsonResponse({ ok: false, message: 'Unauthorized webhook secret' }, 401);
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

function normalizeImageUrl(value) {
  const text = normalizeCell(value);
  if (!text) return '';
  const driveMatch = text.match(/drive\.google\.com\/file\/d\/([^/]+)/i) || text.match(/[?&]id=([^&]+)/i);
  if (driveMatch && driveMatch[1] && /drive\.google\.com/i.test(text)) {
    return 'https://drive.google.com/uc?export=view&id=' + driveMatch[1];
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
