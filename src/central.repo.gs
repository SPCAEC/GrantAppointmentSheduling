/**
 * Repository for SPCA Central Database Interactions
 */

function getCentralSs_() {
  return SpreadsheetApp.openById(CFG.CENTRAL_DB_ID);
}

function getHistorySs_() {
  return SpreadsheetApp.openById(CFG.CENTRAL_APPT_DB_ID);
}

/**
 * Search Owners by Phone, Email, or ID
 * Returns array of matches
 */
function findOwnersInDb_(query) {
  const ss = getCentralSs_();
  const sh = ss.getSheetByName(CFG.TABS.OWNERS);
  const data = sh.getDataRange().getValues();
  
  // Extract and Trim Headers
  // We use shift() to remove the header row from the data array so 'data' is just content
  const headers = data.shift().map(h => String(h).trim().toLowerCase());
  
  // Map headers to column indices
  const hMap = {};
  headers.forEach((h, i) => {
    hMap[h] = i;
  });
  
  // 1. Prepare the Search Query
  const q = String(query || '').trim().toLowerCase();
  const qCleanPhone = q.replace(/\D/g, ''); // Strip everything except digits (e.g. "7162429167")
  
  // 2. Define Exact Column Names (Lowercased for lookup)
  // We check if the column exists to prevent crashing if the sheet changes
  const idxId = hMap['owner id'];
  const idxFirst = hMap['first name'];
  const idxLast = hMap['last name'];
  const idxEmail = hMap['email'];
  const idxPhone = hMap['phone number']; // STRICT MATCH as requested
  
  // Address fields for the return object
  const idxAddress = hMap['street address'] !== undefined ? hMap['street address'] : hMap['address'];
  const idxCity = hMap['city'];
  const idxState = hMap['state'];
  const idxZip = hMap['zip code'] !== undefined ? hMap['zip code'] : hMap['zip'];
  const idxNotes = hMap['general notes'];

  const matches = [];

  // 3. Loop through data rows
  data.forEach((row, i) => {
    // Safely get values, defaulting to empty string if column missing
    const id = idxId !== undefined ? String(row[idxId] || '') : '';
    const email = idxEmail !== undefined ? String(row[idxEmail] || '').toLowerCase() : '';
    
    // Get the phone from the sheet and clean it immediately
    const rawPhone = idxPhone !== undefined ? String(row[idxPhone] || '') : '';
    const dbPhoneClean = rawPhone.replace(/\D/g, ''); // Turns "(716) 242-9167" into "7162429167"
    
    // MATCH LOGIC
    let isMatch = false;
    
    // A. ID Match (Exact)
    if (q && id.toLowerCase() === q) isMatch = true;
    
    // B. Email Match (Exact, case-insensitive)
    if (q && email === q) isMatch = true;
    
    // C. Phone Match (Cleaned digits)
    // We check if the database phone includes the search query. 
    // e.g. Search "2429167" will match "7162429167"
    // We require at least 4 digits to search to avoid matching every row with a "1"
    if (qCleanPhone.length >= 4 && dbPhoneClean.includes(qCleanPhone)) {
      isMatch = true;
    }
    
    if (isMatch) {
      matches.push({
        rowIndex: i + 2, // 1-based index (Header is row 1, this loop starts at row 2)
        ownerId: id,
        firstName: idxFirst !== undefined ? row[idxFirst] : '',
        lastName: idxLast !== undefined ? row[idxLast] : '',
        email: email,
        phone: rawPhone, // Return the original formatted phone for display
        address: idxAddress !== undefined ? row[idxAddress] : '', 
        city: idxCity !== undefined ? row[idxCity] : '',
        state: idxState !== undefined ? row[idxState] : '',
        zip: idxZip !== undefined ? String(row[idxZip]) : '', 
        notes: idxNotes !== undefined ? row[idxNotes] : ''
      });
    }
  });
  
  return matches;
}

/**
 * Get Active Pets for an Owner
 */
function getPetsByOwnerId_(ownerId) {
  const ss = getCentralSs_();
  const sh = ss.getSheetByName(CFG.TABS.PETS);
  const data = sh.getDataRange().getValues();
  const headers = data.shift();
  
  const hMap = {};
  headers.forEach((h, i) => hMap[String(h).trim().toLowerCase()] = i);
  
  // 🔹 FIX: Identify Pattern and Weight columns safely
  const idxPattern = hMap['color pattern'] !== undefined ? hMap['color pattern'] : hMap['pattern'];
  const idxWeight  = hMap['weight'] !== undefined ? hMap['weight'] : hMap['approx weight'];

  const pets = [];
  
  data.forEach((row, i) => {
    const pOwnerId = String(row[hMap['owner id']] || '');
    const status = String(row[hMap['pet status']] || 'Active'); 
    
    if (pOwnerId === ownerId && status.toLowerCase() === 'active') {
      pets.push({
        rowIndex: i + 2,
        petId: row[hMap['pet id']],
        name: row[hMap['pet name']],
        species: row[hMap['species']],
        breed: row[hMap['primary breed']],
        color: row[hMap['color']],
        // 🔹 FIX: Retrieve Pattern and Weight
        pattern: (idxPattern !== undefined) ? row[idxPattern] : '',
        weight: (idxWeight !== undefined) ? row[idxWeight] : '',
        age: row[hMap['age']],
        sex: row[hMap['sex']],
        fixed: row[hMap['altered']]
      });
    }
  });
  
  return pets;
}

/**
 * Write Appointment History to Separate DB
 */
function logAppointmentHistory_(payload) {
  try {
    const ss = getHistorySs_();
    const sh = ss.getSheetByName(CFG.TABS.APPT_LOG);
    if (!sh) throw new Error('Log tab not found in History DB');
    
    const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
    const row = headers.map(h => {
      const key = String(h).trim();
      // Handle the payload mapping
      if (key === CFG.COLS.LOGGED_AT) return new Date();
      if (payload[key] !== undefined) return payload[key];
      
      // Try fuzzy match
      const pKey = Object.keys(payload).find(k => k.toLowerCase() === key.toLowerCase());
      return pKey ? payload[pKey] : '';
    });
    
    sh.appendRow(row);
    console.log('[HISTORY] Logged appointment');
  } catch (e) {
    console.error('[HISTORY] Failed to log:', e);
    // Non-blocking error - we don't want to stop the main booking if log fails
  }
}

/**
 * Update Pet Status (e.g. Deceased)
 */
function updatePetStatusInDb_(petId, newStatus, note, user) {
  const ss = getCentralSs_();
  const sh = ss.getSheetByName(CFG.TABS.PETS);
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  
  // Find Index of Columns
  let idxId = -1, idxStatus = -1, idxNote = -1, idxUpdatedBy = -1, idxUpdatedAt = -1;
  
  headers.forEach((h, i) => {
    const lh = String(h).toLowerCase().trim();
    if (lh === 'pet id') idxId = i;
    if (lh === 'pet status') idxStatus = i;
    if (lh === 'status note') idxNote = i;
    if (lh === 'updated by') idxUpdatedBy = i;
    if (lh === 'updated at') idxUpdatedAt = i;
  });
  
  if (idxId === -1 || idxStatus === -1) throw new Error('Missing columns in Pets tab');
  
  // Find Row
  // Loop data (skip header)
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idxId]) === String(petId)) {
      const rowNum = i + 1;
      
      // Update Status
      sh.getRange(rowNum, idxStatus + 1).setValue(newStatus);
      
      // Update Note (Append if existing?)
      if (idxNote !== -1 && note) {
        const oldNote = data[i][idxNote];
        const finalNote = oldNote ? `${oldNote} | ${note}` : note;
        sh.getRange(rowNum, idxNote + 1).setValue(finalNote);
      }
      
      // Meta
      if (idxUpdatedBy !== -1) sh.getRange(rowNum, idxUpdatedBy + 1).setValue(user);
      if (idxUpdatedAt !== -1) sh.getRange(rowNum, idxUpdatedAt + 1).setValue(new Date());
      
      return true;
    }
  }
  throw new Error('Pet ID not found');
}

/* ─────────────────────────────────────────────────────────────
   WRITE OPERATIONS (Upsert Owner & Pet)
   ───────────────────────────────────────────────────────────── */

/**
 * Helper: Generate Next ID (OWN000001 or PET000001)
 */
function getNextCentralId_(sheet, prefix) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return prefix + '000001';
  
  // Column A is always ID
  const lastId = sheet.getRange(lastRow, 1).getValue();
  const num = parseInt(String(lastId).replace(/\D/g, ''), 10) || 0;
  return prefix + String(num + 1).padStart(6, '0');
}

/**
 * Create or Update Owner
 * Returns the Owner ID
 */
function upsertOwnerInDb_(payload, user) {
  const ss = getCentralSs_();
  const sh = ss.getSheetByName(CFG.TABS.OWNERS);
  const data = sh.getDataRange().getValues();
  
  // Map headers
  const headers = data[0];
  const hMap = {};
  headers.forEach((h, i) => hMap[String(h).trim().toLowerCase()] = i);
  
  let rowIdx = -1; // 0-based Array Index
  let ownerId = payload[CFG.COLS.OWNER_ID];

  // 1. Try to find existing by ID (Robust Search)
  if (ownerId) {
    const idCol = hMap['owner id'];
    if (idCol !== undefined) {
      const searchId = String(ownerId).trim().toLowerCase();
      // Find index in the data array (skip header at 0)
      rowIdx = data.findIndex((r, i) => i > 0 && String(r[idCol]).trim().toLowerCase() === searchId);
    }
  }

  // 2. Prepare Row Data
  // If new, generate ID
  if (rowIdx === -1) {
    ownerId = getNextCentralId_(sh, 'OWN');
  }

  const timestamp = new Date();
  
  // Construct row array matching headers
  const rowData = headers.map(h => {
    const key = String(h).trim().toLowerCase();
    
    // System Fields
    if (key === 'owner id') return ownerId;
    if (key === 'updated at') return timestamp;
    if (key === 'updated by') return user;
    if (key === 'created at' && rowIdx === -1) return timestamp;
    if (key === 'created by' && rowIdx === -1) return user;
    
    // Data Fields (Map payload keys to sheet headers)
    const pKey = Object.keys(payload).find(k => k.toLowerCase() === key);
    // If updating, preserve existing data if payload is missing that field
    // If new, leave blank
    const existingVal = (rowIdx !== -1) ? data[rowIdx][hMap[key]] : '';
    return pKey ? payload[pKey] : existingVal;
  });

  // 3. Write
  if (rowIdx === -1) {
    sh.appendRow(rowData);
  } else {
    // 🔹 FIX: Convert Array Index to Sheet Row (Index + 1)
    // data[rowIdx] is the row. In 1-based sheet notation, that is rowIdx + 1.
    sh.getRange(rowIdx + 1, 1, 1, rowData.length).setValues([rowData]);
  }
  
  return ownerId;
}

/**
 * Create or Update Pet
 * Returns the Pet ID
 */
function upsertPetInDb_(payload, user) {
  const ss = getCentralSs_();
  const sh = ss.getSheetByName(CFG.TABS.PETS);
  const data = sh.getDataRange().getValues();
  
  const headers = data[0];
  const hMap = {};
  headers.forEach((h, i) => hMap[String(h).trim().toLowerCase()] = i);
  
  let rowIdx = -1;
  let petId = payload[CFG.COLS.PET_ID];

  if (petId) {
    const idCol = hMap['pet id'];
    if (idCol !== undefined) {
      const searchId = String(petId).trim().toLowerCase();
      rowIdx = data.findIndex((r, i) => i > 0 && String(r[idCol]).trim().toLowerCase() === searchId);
    }
  }

  if (rowIdx === -1) {
    petId = getNextCentralId_(sh, 'PET');
  }

  const timestamp = new Date();
  
  const rowData = headers.map(h => {
    const key = String(h).trim().toLowerCase();
    if (key === 'pet id') return petId;
    if (key === 'updated at') return timestamp;
    if (key === 'updated by') return user;
    if (key === 'created at' && rowIdx === -1) return timestamp;
    if (key === 'created by' && rowIdx === -1) return user;
    if (key === 'pet status' && rowIdx === -1) return 'Active'; 

    const pKey = Object.keys(payload).find(k => k.toLowerCase() === key);
    const existingVal = (rowIdx !== -1) ? data[rowIdx][hMap[key]] : '';
    return pKey ? payload[pKey] : existingVal;
  });

  if (rowIdx === -1) {
    sh.appendRow(rowData);
  } else {
    // 🔹 FIX: Convert Array Index to Sheet Row (Index + 1)
    sh.getRange(rowIdx + 1, 1, 1, rowData.length).setValues([rowData]);
  }
  
  return petId;
}