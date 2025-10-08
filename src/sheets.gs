/**
 * Grant Appointment Scheduling — Sheet Helpers
 */

function getSheet_() {
  const ss = SpreadsheetApp.openById(CFG.SHEET_ID);
  const sheet = ss.getSheets().find(s => s.getSheetId() === CFG.GID) || ss.getSheetByName(CFG.SHEET_NAME);
  if (!sheet) throw new Error('Appointments sheet not found.');
  return sheet;
}

/**
 * Reads all appointments as objects keyed by column header.
 */
function readAllAppointments_() {
  const sh = getSheet_();
  const data = sh.getDataRange().getValues();
  if (!data || data.length < 2) throw new Error('No data found in sheet.');

  const headers = data.shift();
  if (!headers || headers.length === 0) throw new Error('No headers found in sheet.');

  const objects = data.map(r => {
    const obj = {};
    headers.forEach((h, i) => (obj[h] = r[i]));
    return obj;
  });

  Logger.log(`readAllAppointments_: Loaded ${objects.length} rows`);
  return objects;
}

/**
 * Returns next available slots for a given type.
 * @param {string} type - 'Surgery' or 'Wellness'
 * @param {number} limit - number of results
 */
function getAvailableSlots_(type, limit) {
  Logger.log(`getAvailableSlots_: Searching for type=${type}, limit=${limit}`);
  const all = readAllAppointments_();
  const avail = all.filter(r =>
    String(r[CFG.COLS.TYPE]).toLowerCase() === String(type).toLowerCase() &&
    String(r[CFG.COLS.STATUS]).toLowerCase() === 'available'
  );

  avail.sort((a, b) => new Date(a[CFG.COLS.DATE]) - new Date(b[CFG.COLS.DATE]));
  const sliced = avail.slice(0, limit);
  Logger.log(`getAvailableSlots_: Returning ${sliced.length} available slots`);
  return sliced;
}

/**
 * Updates a specific appointment row by index with new data.
 * @param {number} rowIndex - 1-based row index in sheet
 * @param {Object} data - key:value pairs to update
 */
function updateAppointmentRow_(rowIndex, data) {
  const sh = getSheet_();
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const existingRow = sh.getRange(rowIndex, 1, 1, headers.length).getValues()[0];

  headers.forEach((h, i) => {
    if (data[h] !== undefined) existingRow[i] = data[h];
  });

  sh.getRange(rowIndex, 1, 1, headers.length).setValues([existingRow]);
  Logger.log(`updateAppointmentRow_: Updated row ${rowIndex}`);
}