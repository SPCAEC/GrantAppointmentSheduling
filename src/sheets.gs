/**
 * Grant Appointment Scheduling — Sheet Helpers
 * Adds flexible column resolution + address normalization
 */

/**
 * Get the target sheet from CFG
 */
function getSheet_() {
  try {
    const trace = Utilities.getUuid();
    Logger.log(`[getSheet_] trace=${trace} :: start`);

    if (!CFG || !CFG.SHEET_ID) throw new Error('CFG.SHEET_ID missing.');

    // --- Try context-first approach ---
    let ss;
    try {
      ss = SpreadsheetApp.getActiveSpreadsheet();
      if (ss && ss.getName()) {
        Logger.log(`[getSheet_] trace=${trace} :: using active spreadsheet "${ss.getName()}"`);
      } else {
        throw new Error('Active spreadsheet not available');
      }
    } catch (ctxErr) {
      Logger.log(`[getSheet_] trace=${trace} :: active spreadsheet not available → using openById fallback`);
      try {
        // Primary fallback: open by ID via DriveApp (more stable in web apps)
        const file = DriveApp.getFileById(CFG.SHEET_ID);
        ss = SpreadsheetApp.open(file);
      } catch (driveErr) {
        Logger.log(`[getSheet_] trace=${trace} :: DriveApp fallback failed (${driveErr.message})`);
        // Last resort: openById
        ss = SpreadsheetApp.openById(CFG.SHEET_ID);
      }
    }

    if (!ss) throw new Error('Spreadsheet object not obtained.');

    // --- Locate correct sheet ---
    const sheet =
      ss.getSheets().find(s => s.getSheetId() === CFG.GID) ||
      ss.getSheetByName(CFG.SHEET_NAME);

    if (!sheet)
      throw new Error(
        `Appointments sheet not found. Tried GID=${CFG.GID}, name=${CFG.SHEET_NAME}`
      );

    Logger.log(`[getSheet_] trace=${trace} :: SUCCESS → using sheet "${sheet.getName()}"`);
    return sheet;
  } catch (err) {
    Logger.log(`[getSheet_] ERROR: ${err.message}`);
    throw err;
  }
}
/**
 * Returns a normalized header→index map for defensive column access.
 */
function getHeaderMap_(sh) {
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn())
    .getValues()[0]
    .map(h => String(h).trim());
  const map = {};
  headers.forEach((h, i) => {
    map[h.toLowerCase()] = i; // lowercase keys for safe lookup
  });
  return { headers, map };
}

/**
 * Flexible lookup for a column index by friendly name (case/alias-insensitive)
 */
function getColIndexByName_(headers, name) {
  const aliases = {
    'zip': ['zip', 'zip code', 'postal code'],
    'address': ['address', 'street address', 'street'],
    'phone': ['phone', 'phone number'],
    'state': ['state', 'st'],
    'city': ['city', 'town']
  };

  const normalized = name.toLowerCase().trim();
  let idx = headers.findIndex(h => h.toLowerCase() === normalized);
  if (idx !== -1) return idx;

  for (const [key, list] of Object.entries(aliases)) {
    if (list.includes(normalized)) {
      for (const alias of list) {
        const found = headers.findIndex(h => h.toLowerCase() === alias);
        if (found !== -1) return found;
      }
    }
  }
  return -1;
}

/**
 * Reads all appointments as objects keyed by column header.
 */
function readAllAppointments_() {
  const sh = getSheet_();
  const data = sh.getDataRange().getValues();
  if (!data || data.length < 2) throw new Error('No data found in sheet.');

  const headers = data.shift().map(h => String(h).trim());
  const objects = data.map(row => {
    const obj = {};
    headers.forEach((h, i) => (h ? (obj[h] = row[i]) : null));
    return obj;
  });

  Logger.log(`readAllAppointments_: Loaded ${objects.length} rows`);
  return objects;
}

/**
 * Returns next available slots for a given appointment type.
 */
function getAvailableSlots_(type, limit) {
  Logger.log(`getAvailableSlots_: Searching for type=${type}, limit=${limit}`);
  const all = readAllAppointments_();

  const avail = all.filter(r =>
    String(r[CFG.COLS.TYPE]).toLowerCase() === String(type).toLowerCase() &&
    String(r[CFG.COLS.STATUS]).toLowerCase() === 'available'
  );

  const normalized = avail.map(r => ({
    [CFG.COLS.ID]: String(r[CFG.COLS.ID] || ''),
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

  normalized.sort((a, b) => new Date(a[CFG.COLS.DATE]) - new Date(b[CFG.COLS.DATE]));
  const sliced = normalized.slice(0, limit);

  Logger.log(`getAvailableSlots_: Returning ${sliced.length} available slots`);
  return sliced;
}

function getNextAppointmentId_() {
  const sh = getSheet_();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return 'AID000000001'; // First ever record

  const { headers } = getHeaderMap_(sh);
  const idColIdx = headers.indexOf(CFG.COLS.ID.toLowerCase());
  
  if (idColIdx === -1) throw new Error('Appointment ID column not found');

  // Get the last value in the ID column
  const lastIdVal = sh.getRange(lastRow, idColIdx + 1).getValue();
  const numericPart = String(lastIdVal).replace(/\D/g, '');
  
  if (!numericPart) return 'AID000000001'; // Fallback if format is weird
  
  const nextNum = parseInt(numericPart, 10) + 1;
  return 'AID' + String(nextNum).padStart(9, '0');
}

function appendNewAppointment_(dataObj) {
  const sh = getSheet_();
  const { headers } = getHeaderMap_(sh);
  
  const rowData = headers.map(h => {
    // Match header key to data object key (case-insensitive)
    const key = Object.keys(dataObj).find(k => k.toLowerCase() === h);
    return key ? dataObj[key] : '';
  });

  sh.appendRow(rowData);
  Logger.log(`[APPEND] Added new row: ${JSON.stringify(rowData)}`);
}

/**
 * Updates a specific appointment row by index with new data.
 */
function updateAppointmentRow_(rowIndex, data) {
  const sh = getSheet_();
  const { headers } = getHeaderMap_(sh);
  const lastCol = headers.length;

  // Read the current row
  const existingRow = sh.getRange(rowIndex, 1, 1, lastCol).getValues()[0];
  const updatedRow = existingRow.slice();

  // Normalize Address/Zip aliases if needed
  const normalizedData = {};
  Object.keys(data || {}).forEach(k => {
    let key = k;
    if (/zip code/i.test(k)) key = 'Zip Code';
    if (/address/i.test(k)) key = 'Address';
    normalizedData[key] = data[k];
  });

  headers.forEach((h, i) => {
    if (normalizedData[h] !== undefined) updatedRow[i] = normalizedData[h];
  });

  // Optional timestamp
  if (CFG.COLS.UPDATED_AT && headers.includes(CFG.COLS.UPDATED_AT)) {
    const idx = headers.indexOf(CFG.COLS.UPDATED_AT);
    updatedRow[idx] = new Date();
  }

  sh.getRange(rowIndex, 1, 1, lastCol).setValues([updatedRow]);
  Logger.log(`updateAppointmentRow_: Updated row ${rowIndex}`);
}
/**
 * Exact (case-insensitive) match helper
 */
function eqi_(a, b) {
  if (!a || !b) return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

/**
 * Turn "First", "Last", or "First Last" into a matcher against sheet's First/Last.
 */
function clientMatches_(row, clientInput) {
  if (!clientInput) return true; // not provided
  const first = String(row[CFG.COLS.FIRST] || '');
  const last  = String(row[CFG.COLS.LAST] || '');
  const parts = String(clientInput).trim().split(/\s+/);
  if (parts.length === 1) {
    return eqi_(first, parts[0]) || eqi_(last, parts[0]);
  }
  // 2+ parts → compare joined full name
  const full = (first + ' ' + last).trim();
  return eqi_(full, parts.join(' '));
}

/**
 * Today (America/New_York) and date comparison
 * Sheet stores date as 'MM/dd/yyyy' text. Same-day NOT editable.
 */
function isFutureDate_(mmddyyyy) {
  const tz = Session.getScriptTimeZone() || 'America/New_York';
  const today = new Date(Utilities.formatDate(new Date(), tz, 'MM/dd/yyyy')); // midnight local
  const d = parseMMDDYYYY_(mmddyyyy, tz);
  if (!d) return false; // invalid text -> treat as not editable
  // Future strictly greater than today
  return d.getTime() > today.getTime();
}

function parseMMDDYYYY_(s, tz) {
  if (!s) return null;
  const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const mm = +m[1], dd = +m[2], yyyy = +m[3];
  const d = new Date(yyyy, mm - 1, dd);
  // sanity check
  if (d.getFullYear() !== yyyy || (d.getMonth()+1) !== mm || d.getDate() !== dd) return null;
  // normalize to local midnight
  return new Date(Utilities.formatDate(d, tz, 'MM/dd/yyyy'));
}

/**
 * Search core — any combination of date, client, pet (exact case-insensitive)
 */
function searchAppointments_(dateStr, clientInput, petName) {
  const all = readAllAppointments_(); // objects keyed by header text
  const out = all.filter(r => {
    const dateOk   = dateStr ? eqi_(String(r[CFG.COLS.DATE] || ''), dateStr) : true;
    const clientOk = clientMatches_(r, clientInput || '');
    const petOk    = petName ? eqi_(String(r[CFG.COLS.PET_NAME] || ''), petName) : true;
    return dateOk && clientOk && petOk;
  });
  return out;
}