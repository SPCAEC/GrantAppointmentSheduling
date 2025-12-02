/**
 * Grant Appointment Scheduling — Sheet Helpers
 * Adds flexible column resolution + address normalization
 */

/**
 * Get the target sheet from CFG
 */
function getSheet_() {
  try {
    if (!CFG || !CFG.SHEET_ID) throw new Error('CFG.SHEET_ID missing.');
    // Try Context First
    let ss;
    try {
      ss = SpreadsheetApp.getActiveSpreadsheet();
      if (!ss || !ss.getSheetByName(CFG.SHEET_NAME)) throw new Error('Not active');
    } catch (e) {
      ss = SpreadsheetApp.openById(CFG.SHEET_ID);
    }
    
    const sheet = ss.getSheetByName(CFG.SHEET_NAME);
    if (!sheet) throw new Error(`Sheet "${CFG.SHEET_NAME}" not found.`);
    return sheet;
  } catch (err) {
    Logger.log(`[getSheet_] ERROR: ${err.message}`);
    throw err;
  }
}

/**
 * Returns a normalized header→index map for defensive column access.
 * Returns { headers: ['Raw', 'Strings'], map: { 'raw': 0, 'strings': 1 } }
 */
function getHeaderMap_(sh) {
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).trim());
  const map = {};
  headers.forEach((h, i) => {
    map[h.toLowerCase()] = i; // lowercase keys for safe lookup
  });
  return { headers, map };
}

/**
 * Generates the next Appointment ID based on the last row.
 * Format: AID######### (e.g., AID000000600)
 */
function getNextAppointmentId_() {
  const sh = getSheet_();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return 'AID000000001'; // First ever record

  const { map } = getHeaderMap_(sh);
  const targetKey = CFG.COLS.ID.toLowerCase().trim();
  
  const idColIdx = map[targetKey];
  
  if (idColIdx === undefined) {
    throw new Error(`Appointment ID column "${CFG.COLS.ID}" not found in sheet.`);
  }

  // Get the last value in the ID column
  const lastIdVal = sh.getRange(lastRow, idColIdx + 1).getValue();
  const numericPart = String(lastIdVal).replace(/\D/g, '');
  
  if (!numericPart) {
    return 'AID000000001'; 
  }
  
  const nextNum = parseInt(numericPart, 10) + 1;
  return 'AID' + String(nextNum).padStart(9, '0');
}

/**
 * Appends a new appointment row to the bottom of the sheet.
 * Used for "Go Rogue" flow.
 */
function appendNewAppointment_(dataObj) {
  const sh = getSheet_();
  const { headers } = getHeaderMap_(sh);
  
  const rowData = headers.map(h => {
    // Match header key to data object key (case-insensitive)
    const key = Object.keys(dataObj).find(k => k.toLowerCase() === String(h).toLowerCase());
    return key ? dataObj[key] : '';
  });

  Logger.log(`[APPEND] Writing row data: ${JSON.stringify(rowData)}`);
  sh.appendRow(rowData);
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
  return objects;
}

/**
 * Returns next available slots for a given appointment type.
 */
function getAvailableSlots_(type, limit) {
  const all = readAllAppointments_();
  // Filter by Type and Status=Available
  // Note: Using string comparison for safety
  const avail = all.filter(r => 
    String(r[CFG.COLS.TYPE]).toLowerCase() === String(type).toLowerCase() &&
    String(r[CFG.COLS.STATUS]).toLowerCase() === 'available'
  );

  // Normalize for frontend
  const normalized = avail.map(r => ({
    [CFG.COLS.ID]: String(r[CFG.COLS.ID] || ''),
    [CFG.COLS.DAY]: String(r[CFG.COLS.DAY] || ''),
    [CFG.COLS.DATE]: r[CFG.COLS.DATE] instanceof Date 
      ? Utilities.formatDate(r[CFG.COLS.DATE], Session.getScriptTimeZone(), 'MM/dd/yyyy')
      : String(r[CFG.COLS.DATE] || ''),
    [CFG.COLS.TIME]: String(r[CFG.COLS.TIME] || ''),
    [CFG.COLS.AMPM]: String(r[CFG.COLS.AMPM] || ''),
    [CFG.COLS.GRANT]: String(r[CFG.COLS.GRANT] || ''),
    [CFG.COLS.TYPE]: String(r[CFG.COLS.TYPE] || ''),
    [CFG.COLS.STATUS]: String(r[CFG.COLS.STATUS] || '')
  }));

  // Sort by Date
  normalized.sort((a, b) => new Date(a[CFG.COLS.DATE]) - new Date(b[CFG.COLS.DATE]));
  
  return normalized.slice(0, limit);
}

/**
 * Updates a specific appointment row by index with new data.
 * Handles aliases (Phone vs Phone Number) and Case-Insensitivity.
 */
function updateAppointmentRow_(rowIndex, data) {
  const sh = getSheet_();
  const { headers } = getHeaderMap_(sh);
  const lastCol = headers.length;

  const existingRow = sh.getRange(rowIndex, 1, 1, lastCol).getValues()[0];
  const updatedRow = existingRow.slice();

  // 1. Create a Normalized Data Map
  const dataMap = {};
  Object.keys(data || {}).forEach(k => {
    const val = data[k];
    const kLow = k.toLowerCase().trim();
    dataMap[kLow] = val; 
    
    // Explicit Aliases
    if (kLow === 'phone') dataMap['phone number'] = val;
    if (kLow === 'zip') dataMap['zip code'] = val;
    if (kLow === 'address') dataMap['street address'] = val;
    if (kLow.includes('record')) dataMap['previous vet records'] = val;
  });

  // 2. Loop Headers
  headers.forEach((h, i) => {
    const hLow = String(h).toLowerCase().trim();
    if (dataMap.hasOwnProperty(hLow)) {
      updatedRow[i] = dataMap[hLow];
    }
  });

  // 3. Timestamp
  if (CFG.COLS.UPDATED_AT) {
    const tsKey = CFG.COLS.UPDATED_AT.toLowerCase();
    const idx = headers.findIndex(h => h.toLowerCase() === tsKey);
    if (idx !== -1) updatedRow[idx] = new Date();
  }

  sh.getRange(rowIndex, 1, 1, lastCol).setValues([updatedRow]);
  Logger.log(`updateAppointmentRow_: Updated row ${rowIndex}`);
}

/* ─────────────────────────────────────────────────────────────
   SEARCH HELPERS (The missing pieces!)
   ───────────────────────────────────────────────────────────── */

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
  if (!clientInput) return true; 
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
 * Search core — any combination of date, client, pet
 */
function searchAppointments_(dateStr, clientInput, petName) {
  const all = readAllAppointments_();
  // objects keyed by header text
  const out = all.filter(r => {
    // Date match (simple string match here, refined logic is in rpc.gs)
    const rowDate = r[CFG.COLS.DATE] instanceof Date 
        ? Utilities.formatDate(r[CFG.COLS.DATE], Session.getScriptTimeZone(), 'MM/dd/yyyy')
        : String(r[CFG.COLS.DATE] || '');
        
    const dateOk   = dateStr ? (rowDate === dateStr) : true;
    const clientOk = clientMatches_(r, clientInput || '');
    const petOk    = petName ? eqi_(String(r[CFG.COLS.PET_NAME] || ''), petName) : true;
    
    return dateOk && clientOk && petOk;
  });
  return out;
}

function isFutureDate_(dateStr) {
  // Logic is now largely handled in rpc.gs for object safety, 
  // but kept here for legacy calls if needed.
  try {
    if (!dateStr) return false;
    const [m2, d2, y2] = String(dateStr).split('/').map(Number);
    const target = new Date(y2, m2 - 1, d2);
    const today = new Date();
    return target > today;
  } catch (e) { return false; }
}