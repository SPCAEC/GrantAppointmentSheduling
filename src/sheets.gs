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
  const headers = data.shift();
  return data.map(r => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = r[i]);
    return obj;
  });
}

/**
 * Returns next available slots for a given type.
 * @param {string} type - 'Surgery' or 'Wellness'
 * @param {number} limit - number of results
 */
function getAvailableSlots_(type, limit) {
  const all = readAllAppointments_();
  const avail = all.filter(r =>
    String(r[CFG.COLS.TYPE]).toLowerCase() === String(type).toLowerCase() &&
    String(r[CFG.COLS.STATUS]).toLowerCase() === 'available'
  );

  // Sort by date/time and return first N
  avail.sort((a,b) => new Date(a[CFG.COLS.DATE]) - new Date(b[CFG.COLS.DATE]));
  return avail.slice(0, limit);
}

/**
 * Updates a specific appointment row by index with new data.
 * @param {number} rowIndex - 1-based row index in sheet
 * @param {Object} data - key:value pairs to update
 */
function updateAppointmentRow_(rowIndex, data) {
  const sh = getSheet_();
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const row = [];

  headers.forEach((h,i) => {
    row[i] = data[h] !== undefined ? data[h] : sh.getRange(rowIndex, i+1).getValue();
  });
  sh.getRange(rowIndex,1,1,row.length).setValues([row]);
}