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
/**
 * Search Owners with STRICT Type Detection
 * Prevents cross-matching emails against phone numbers.
 */
function findOwnersInDb_(query) {
  const ss = getCentralSs_();
  const sh = ss.getSheetByName(CFG.TABS.OWNERS);
  const data = sh.getDataRange().getValues();
  
  const headers = data.shift().map(h => String(h).trim().toLowerCase());
  const hMap = {};
  headers.forEach((h, i) => hMap[h] = i);
  
  const q = String(query || '').trim().toLowerCase();
  
  // ─── STRICT MODE DETECTION ───
  // 1. Is it an Email? (Contains '@')
  const isEmailSearch = q.includes('@');
  
  // 2. Is it a Phone Number? (No '@', and contains significant digits)
  // We require at least 7 digits to consider it a phone search to avoid matching IDs like "123" against phone numbers
  const qCleanPhone = q.replace(/\D/g, '');
  const isPhoneSearch = !isEmailSearch && qCleanPhone.length >= 7;

  // 3. Is it an ID? (Neither of the above, or specific format)
  // We'll allow ID checks on non-email searches
  const isIdSearch = !isEmailSearch;

  // Column Indices
  const idxId    = hMap['owner id'];
  const idxFirst = hMap['first name'];
  const idxLast  = hMap['last name'];
  const idxEmail = hMap['email'];
  const idxPhone = hMap['phone number']; 
  const idxAddress = hMap['street address'] !== undefined ? hMap['street address'] : hMap['address'];
  const idxCity  = hMap['city'];
  const idxState = hMap['state'];
  const idxZip   = hMap['zip code'] !== undefined ? hMap['zip code'] : hMap['zip'];
  const idxNotes = hMap['general notes'];

  const matches = [];

  data.forEach((row, i) => {
    const id = idxId !== undefined ? String(row[idxId] || '') : '';
    
    // MATCH LOGIC
    let isMatch = false;
    
    if (isEmailSearch) {
      // 📧 Strict Email Check
      const email = idxEmail !== undefined ? String(row[idxEmail] || '').toLowerCase() : '';
      if (email === q) isMatch = true;
    
    } else if (isPhoneSearch) {
      // 📞 Strict Phone Check
      const rawPhone = idxPhone !== undefined ? String(row[idxPhone] || '') : '';
      const dbPhoneClean = rawPhone.replace(/\D/g, '');
      if (dbPhoneClean.includes(qCleanPhone)) isMatch = true;
      
      // Also allow exact ID match in phone mode (edge case)
      if (id.toLowerCase() === q) isMatch = true;

    } else if (isIdSearch) {
      // 🆔 Fallback ID Check (for short queries like "101")
      if (id.toLowerCase() === q) isMatch = true;
    }
    
    if (isMatch) {
      matches.push({
        rowIndex: i + 2, 
        ownerId: id,
        firstName: idxFirst !== undefined ? row[idxFirst] : '',
        lastName: idxLast !== undefined ? row[idxLast] : '',
        email: idxEmail !== undefined ? row[idxEmail] : '',
        phone: idxPhone !== undefined ? row[idxPhone] : '',
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
/**
 * Get Active Pets for an Owner
 */
function getPetsByOwnerId_(ownerId) {
  const ss = getCentralSs_();
  const sh = ss.getSheetByName(CFG.TABS.PETS);
  const data = sh.getDataRange().getValues();
  const headers = data.shift().map(h => String(h).trim().toLowerCase());
  
  const hMap = {};
  headers.forEach((h, i) => hMap[h] = i);
  
  // 🔹 FIX: Robust Column Lookups based on user request
  const idxPattern = hMap['pattern'] !== undefined ? hMap['pattern'] : hMap['color pattern'];
  const idxWeight  = hMap['weight'] !== undefined ? hMap['weight'] : hMap['approx weight'];
  const idxStatus  = hMap['pet status'] !== undefined ? hMap['pet status'] : hMap['status'];
  
  // Breeds & Fixed
  const idxBreed1 = hMap['breed one'] !== undefined ? hMap['breed one'] : hMap['primary breed'];
  const idxBreed2 = hMap['breed two'] !== undefined ? hMap['breed two'] : hMap['secondary breed'];
  const idxFixed  = hMap['spayed or neutered'] !== undefined ? hMap['spayed or neutered'] : (hMap['altered'] !== undefined ? hMap['altered'] : hMap['fixed']);

  const pets = [];
  data.forEach((row, i) => {
    const pOwnerId = String(row[hMap['owner id']] || '');
    const statusVal = idxStatus !== undefined ? String(row[idxStatus]) : 'Active';
    
    if (pOwnerId === ownerId && statusVal.trim().toLowerCase() === 'active') {
      pets.push({
        rowIndex: i + 2,
        petId: row[hMap['pet id']],
        name: row[hMap['pet name']],
        species: row[hMap['species']],
        
        // 🔹 UPDATED MAPPINGS
        breed: (idxBreed1 !== undefined) ? row[idxBreed1] : '',
        breed2: (idxBreed2 !== undefined) ? row[idxBreed2] : '', // Now including Breed 2
        
        color: row[hMap['color']],
        pattern: (idxPattern !== undefined) ? row[idxPattern] : '',
        
        fixed: (idxFixed !== undefined) ? row[idxFixed] : '',
        
        weight: (idxWeight !== undefined) ? row[idxWeight] : '',
        age: row[hMap['age']],
        sex: row[hMap['sex']]
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
  const headers = data[0]; // Keep headers for finding index
  
  // 🔹 FIX: Robust Column Lookup
  let idxId = -1, idxStatus = -1, idxNote = -1, idxUpdatedBy = -1, idxUpdatedAt = -1;
  
  headers.forEach((h, i) => {
    const lh = String(h).toLowerCase().trim();
    if (lh === 'pet id') idxId = i;
    if (lh === 'pet status' || lh === 'status') idxStatus = i; // Match both
    if (lh === 'status note' || lh === 'notes') idxNote = i;
    if (lh === 'updated by') idxUpdatedBy = i;
    if (lh === 'updated at') idxUpdatedAt = i;
  });

  if (idxId === -1 || idxStatus === -1) throw new Error('Missing "Pet ID" or "Status" columns in Pets tab');

  // Find Row
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idxId]) === String(petId)) {
      const rowNum = i + 1;
      
      // Update Status
      sh.getRange(rowNum, idxStatus + 1).setValue(newStatus);
      
      // Update Note
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
 * Create or Update Owner Record
 */
function upsertOwnerInDb_(payload, user) {
  const ss = getCentralSs_();
  const sh = ss.getSheetByName(CFG.TABS.OWNERS);
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim().toLowerCase());
  
  // 1. Robust Column Mapping
  const hMap = {};
  headers.forEach((h, i) => hMap[h] = i);

  // Define targets with fallbacks
  const colId    = hMap['owner id'];
  const colFirst = hMap['first name'];
  const colLast  = hMap['last name'];
  const colEmail = hMap['email'] !== undefined ? hMap['email'] : hMap['email address'];
  
  // Phone: check variations
  const colPhone = hMap['phone number'] !== undefined ? hMap['phone number'] : 
                   (hMap['phone'] !== undefined ? hMap['phone'] : hMap['cell']);
                   
  // Address: check variations
  const colAddr  = hMap['street address'] !== undefined ? hMap['street address'] : hMap['address'];
  const colCity  = hMap['city'];
  const colState = hMap['state'];
  
  // Zip: check variations
  const colZip   = hMap['zip code'] !== undefined ? hMap['zip code'] : 
                   (hMap['zip'] !== undefined ? hMap['zip'] : hMap['zipcode']);

  const colUpdatedBy = hMap['updated by'];
  const colUpdatedAt = hMap['updated at'];
  const colCreatedBy = hMap['created by'];
  const colCreatedAt = hMap['created at'];

  // 2. Determine ID & Row
  let ownerId = payload['Owner ID'] || payload['ownerId'];
  let rowIndex = -1;

  if (ownerId) {
    // Find existing
    const searchId = String(ownerId).toLowerCase();
    rowIndex = data.findIndex((r, i) => i > 0 && String(r[colId]).toLowerCase() === searchId);
    if (rowIndex !== -1) rowIndex += 1; // Convert to 1-based sheet row
  }

  if (rowIndex === -1) {
    // Create New
    ownerId = getNextCentralId_(sh, 'OWN'); // Helper to generate ID
    rowIndex = sh.getLastRow() + 1;
  }

  // 3. Prepare Value Helper
  // Writes value to the specific column if it exists in the sheet
  const setValue = (colIdx, val) => {
    if (colIdx !== undefined && colIdx > -1) {
      sh.getRange(rowIndex, colIdx + 1).setValue(val);
    }
  };

  // 4. Write Data
  setValue(colId, ownerId);
  setValue(colFirst, payload['First Name'] || payload['firstName']);
  setValue(colLast,  payload['Last Name']  || payload['lastName']);
  setValue(colPhone, payload['Phone']      || payload['Phone Number'] || payload['phone']);
  setValue(colEmail, payload['Email']      || payload['email']);
  
  setValue(colAddr,  payload['Address']    || payload['Street Address'] || payload['address']);
  setValue(colCity,  payload['City']       || payload['city']);
  setValue(colState, payload['State']      || payload['state']);
  setValue(colZip,   payload['Zip Code']   || payload['zip']);

  // Meta
  const now = new Date();
  setValue(colUpdatedBy, user);
  setValue(colUpdatedAt, now);
  
  // If new row (checked by reading the Created At column, or just logic)
  // Simple check: if we appended to getLastRow()+1, it's new. 
  // Or check if the "Created At" cell is empty.
  if (colCreatedAt !== undefined) {
     const cell = sh.getRange(rowIndex, colCreatedAt + 1);
     if (!cell.getValue()) {
        cell.setValue(now);
        setValue(colCreatedBy, user);
     }
  }

  return ownerId;
}

/**
 * Create or Update Pet Record
 */
function upsertPetInDb_(payload, user) {
  const ss = getCentralSs_();
  const sh = ss.getSheetByName(CFG.TABS.PETS);
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim().toLowerCase());
  
  // 1. Robust Column Mapping
  const hMap = {};
  headers.forEach((h, i) => hMap[h] = i);

  const colId      = hMap['pet id'];
  const colOwnerId = hMap['owner id'];
  const colName    = hMap['pet name'];
  const colSpecies = hMap['species'];
  
  // Breeds
  const colBreed1  = hMap['primary breed'] !== undefined ? hMap['primary breed'] : hMap['breed one'];
  const colBreed2  = hMap['secondary breed'] !== undefined ? hMap['secondary breed'] : hMap['breed two'];
  
  const colColor   = hMap['color'];
  
  // Pattern
  const colPattern = hMap['color pattern'] !== undefined ? hMap['color pattern'] : hMap['pattern'];
  
  const colSex     = hMap['sex'];
  
  // Fixed
  const colFixed   = hMap['spayed or neutered'] !== undefined ? hMap['spayed or neutered'] : 
                     (hMap['altered'] !== undefined ? hMap['altered'] : hMap['fixed']);
                     
  const colAge     = hMap['age'];
  
  // Weight
  const colWeight  = hMap['weight'] !== undefined ? hMap['weight'] : hMap['approx weight'];
  
  const colUpdatedBy = hMap['updated by'];
  const colUpdatedAt = hMap['updated at'];
  const colCreatedBy = hMap['created by'];
  const colCreatedAt = hMap['created at'];
  const colStatus    = hMap['pet status'] !== undefined ? hMap['pet status'] : hMap['status'];

  // 2. Determine ID & Row
  let petId = payload['Pet ID'] || payload['petId'];
  let rowIndex = -1;

  if (petId) {
    const searchId = String(petId).toLowerCase();
    rowIndex = data.findIndex((r, i) => i > 0 && String(r[colId]).toLowerCase() === searchId);
    if (rowIndex !== -1) rowIndex += 1;
  }

  if (rowIndex === -1) {
    petId = getNextCentralId_(sh, 'PET');
    rowIndex = sh.getLastRow() + 1;
  }

  // 3. Write Helper
  const setValue = (colIdx, val) => {
    if (colIdx !== undefined && colIdx > -1) {
      sh.getRange(rowIndex, colIdx + 1).setValue(val);
    }
  };

  // 4. Write Data
  setValue(colId, petId);
  setValue(colOwnerId, payload['Owner ID'] || payload['ownerId']);
  setValue(colName,    payload['Pet Name'] || payload['name']);
  setValue(colSpecies, payload['Species']  || payload['species']);
  setValue(colBreed1,  payload['Breed One'] || payload['Primary Breed'] || payload['breed']);
  setValue(colBreed2,  payload['Breed Two'] || payload['Secondary Breed'] || payload['breed2']);
  setValue(colColor,   payload['Color'] || payload['color']);
  setValue(colPattern, payload['Color Pattern'] || payload['pattern']);
  setValue(colSex,     payload['Sex'] || payload['sex']);
  setValue(colFixed,   payload['Spayed or Neutered'] || payload['Altered'] || payload['fixed']);
  setValue(colAge,     payload['Age'] || payload['age']);
  setValue(colWeight,  payload['Weight'] || payload['weight']);

  // Ensure status is Active if new
  if (colStatus !== undefined && rowIndex === sh.getLastRow()) {
     setValue(colStatus, 'Active');
  } else if (colStatus !== undefined) {
     // If existing, ensure we don't accidentally blank it out, but we generally don't change status here
     // Unless we want to force 'Active' on edit? Let's leave it alone on edit.
     const currentStatus = sh.getRange(rowIndex, colStatus + 1).getValue();
     if(!currentStatus) setValue(colStatus, 'Active');
  }

  // Meta
  const now = new Date();
  setValue(colUpdatedBy, user);
  setValue(colUpdatedAt, now);

  if (colCreatedAt !== undefined) {
     const cell = sh.getRange(rowIndex, colCreatedAt + 1);
     if (!cell.getValue()) {
        cell.setValue(now);
        setValue(colCreatedBy, user);
     }
  }

  return petId;
}