/**
 * Grant Appointment Scheduling — Sheet Helpers
 * Adds flexible column resolution + address normalization
 */

/**
 * Get the target sheet from CFG
 */
function getSheet_() {
  Logger.log('CFG before openById: ' + JSON.stringify(CFG));
  const traceId = Utilities.getUuid();
  try {
    Logger.log(`[getSheet_] trace=${traceId} :: start`);

    if (!CFG) throw new Error('CFG missing.');
    if (!CFG.SHEET_ID) throw new Error('CFG.SHEET_ID missing.');

    Logger.log(`[getSheet_] trace=${traceId} :: SHEET_ID=${CFG.SHEET_ID}`);
    Logger.log(`[getSheet_] trace=${traceId} :: SHEET_NAME=${CFG.SHEET_NAME} | GID=${CFG.GID}`);

    // Who is executing this code?
    try {
      const eff = Session.getEffectiveUser();
      const act = Session.getActiveUser().getEmail ? Session.getActiveUser().getEmail() : '(no active user)';
      Logger.log(`[getSheet_] trace=${traceId} :: effectiveUser=${eff} | activeUser=${act}`);
    } catch (e) {
      Logger.log(`[getSheet_] trace=${traceId} :: could not read Session users: ${e}`);
    }

    Logger.log(`[getSheet_] trace=${traceId} :: calling SpreadsheetApp.openById…`);
    const ss = SpreadsheetApp.openById(CFG.SHEET_ID);
    Logger.log(`[getSheet_] trace=${traceId} :: openById success :: title="${ss.getName()}"`);

    // Prefer exact GID if provided, else fallback to sheet name
    let sheet = null;
    if (typeof CFG.GID === 'number' && !isNaN(CFG.GID)) {
      Logger.log(`[getSheet_] trace=${traceId} :: trying getSheets() find GID=${CFG.GID}`);
      sheet = ss.getSheets().find(s => s.getSheetId() === CFG.GID) || null;
      Logger.log(`[getSheet_] trace=${traceId} :: GID lookup ${sheet ? 'found' : 'not found'}`);
    }

    if (!sheet && CFG.SHEET_NAME) {
      Logger.log(`[getSheet_] trace=${traceId} :: trying getSheetByName("${CFG.SHEET_NAME}")`);
      sheet = ss.getSheetByName(CFG.SHEET_NAME);
      Logger.log(`[getSheet_] trace=${traceId} :: name lookup ${sheet ? 'found' : 'not found'}`);
    }

    if (!sheet) {
      throw new Error(`Appointments sheet not found. Tried GID=${CFG.GID}, name="${CFG.SHEET_NAME}"`);
    }

    Logger.log(`[getSheet_] trace=${traceId} :: SUCCESS (sheetId=${sheet.getSheetId()}, name="${sheet.getName()}")`);
    return sheet;

  } catch (err) {
    Logger.log(`[getSheet_] trace=${traceId} :: ERROR: ${err && err.message ? err.message : err}`);
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