/**
 * Grant Appointment Scheduling — Sheet Helpers
 */

function getSheet_() {
  const ss = SpreadsheetApp.openById(CFG.SHEET_ID);
  const sheet =
    ss.getSheets().find(s => s.getSheetId() === CFG.GID) ||
    ss.getSheetByName(CFG.SHEET_NAME);
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

  const headers = data.shift().map(h => String(h).trim());
  if (!headers.length) throw new Error('No headers found in sheet.');

  const objects = data.map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      if (h) obj[h] = row[i];
    });
    return obj;
  });

  Logger.log(`readAllAppointments_: Loaded ${objects.length} rows`);
  return objects;
}

/**
 * Returns next available slots for a given appointment type.
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

  // Normalize for safe serialization + include Appointment ID
  const normalized = avail.map(r => ({
    [CFG.COLS.ID]: String(r[CFG.COLS.ID] || ''), // new
    [CFG.COLS.DAY]: String(r[CFG.COLS.DAY] || ''),
    [CFG.COLS.DATE]:
      r[CFG.COLS.DATE] instanceof Date
        ? Utilities.formatDate(
            r[CFG.COLS.DATE],
            Session.getScriptTimeZone(),
            'MM/dd/yyyy'
          )
        : String(r[CFG.COLS.DATE] || ''),
    [CFG.COLS.TIME]: String(r[CFG.COLS.TIME] || ''),
    [CFG.COLS.AMPM]: String(r[CFG.COLS.AMPM] || ''),
    [CFG.COLS.GRANT]: String(r[CFG.COLS.GRANT] || ''),
    [CFG.COLS.TYPE]: String(r[CFG.COLS.TYPE] || ''),
    [CFG.COLS.STATUS]: String(r[CFG.COLS.STATUS] || '')
  }));

  normalized.sort(
    (a, b) => new Date(a[CFG.COLS.DATE]) - new Date(b[CFG.COLS.DATE])
  );
  const sliced = normalized.slice(0, limit);

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
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).trim());
  const existingRow = sh.getRange(rowIndex, 1, 1, headers.length).getValues()[0];

  const updatedRow = existingRow.slice(); // clone before mutate

  headers.forEach((h, i) => {
    if (data[h] !== undefined) updatedRow[i] = data[h];
  });

  // Optional timestamp support if column exists
  if (CFG.COLS.UPDATED_AT && headers.includes(CFG.COLS.UPDATED_AT)) {
    const idx = headers.indexOf(CFG.COLS.UPDATED_AT);
    updatedRow[idx] = new Date();
  }

  sh.getRange(rowIndex, 1, 1, headers.length).setValues([updatedRow]);
  Logger.log(`updateAppointmentRow_: Updated row ${rowIndex}`);
}