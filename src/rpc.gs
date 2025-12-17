/**
 * Grant Appointment Scheduling — RPC Endpoints
 * Central hub for all frontend-backend communication.
 */

// ─── HELPERS ─────────────────────────────────────────

function rpcTry(fn) {
  try {
    return fn();
  } catch (err) {
    Logger.log('[RPC ERROR] ' + err);
    throw err;
  }
}

function apiResponse_(fn) {
  try {
    const res = fn();
    return { ok: true, ...res };
  } catch (err) {
    Logger.log('[API ERROR] ' + err);
    return { ok: false, error: err.message || String(err) };
  }
}

function normalizePayload_(payload) {
  const out = Object.assign({}, payload);
  const defaults = {
    'Allergies or Sensitivities': 'None known',
    'Previous Vet Records': 'No',
    'Transportation Needed': 'No'
  };
  Object.entries(defaults).forEach(([key, val]) => {
    if (!out[key] || String(out[key]).trim() === '') out[key] = val;
  });
  Object.keys(out).forEach(k => {
    if (out[k] == null) out[k] = '';
  });
  return out;
}

// ─── CENTRAL DB CONNECTORS ───────────────────────────

function apiSearchOwners(query) {
  return rpcTry(() => findOwnersInDb_(query));
}

function apiGetOwnerPets(ownerId) {
  return rpcTry(() => getPetsByOwnerId_(ownerId));
}

function apiUpdatePetStatus(petId, status, note, user) {
  return rpcTry(() => updatePetStatusInDb_(petId, status, note, user));
}

function apiUpsertOwner(payload, user) {
  return rpcTry(() => upsertOwnerInDb_(payload, user));
}

function apiUpsertPet(payload, user) {
  return rpcTry(() => upsertPetInDb_(payload, user));
}

// ─── LEGACY / STANDARD SCHEDULING ────────────────────

function apiGetAvailableSlots(type, limit) {
  return apiResponse_(() => {
    limit = limit || 6;
    if (!CFG || !CFG.SHEET_ID) throw new Error('Configuration (CFG) not found.');

    const slotsRaw = getAvailableSlots_(type, limit);
    if (!Array.isArray(slotsRaw)) throw new Error('No slot data returned');

    const slots = slotsRaw.map(r => ({
      id:   String(r[CFG.COLS.ID] || ''),
      day:  String(r[CFG.COLS.DAY] || ''),
      date: String(r[CFG.COLS.DATE] || ''),
      time: `${r[CFG.COLS.TIME] || ''} ${r[CFG.COLS.AMPM] || ''}`.trim(),
      grant: String(r[CFG.COLS.GRANT] || '')
    }));

    return { slots };
  });
}

function apiBookAppointment(payload, type, date, time, appointmentId, schedulerName) {
  return apiResponse_(() => {
    if (!CFG || !CFG.SHEET_ID) throw new Error('Configuration (CFG) not found.');
    if (!payload || typeof payload !== 'object') throw new Error('Invalid payload');

    // 1. Prepare clean payload with defaults
    const cleanPayload = normalizePayload_(payload);

    // 2. EXPLICIT MAPPING: Map Frontend Keys -> Configured Sheet Headers
    // This ensures that even if frontend sends "Street Address", we map it to CFG.COLS.ADDRESS
    const mapField = (frontendKey, configKey) => {
      if (cleanPayload[frontendKey] !== undefined) {
        cleanPayload[configKey] = cleanPayload[frontendKey];
      }
    };

    mapField('Owner ID', CFG.COLS.OWNER_ID);
    mapField('ownerId',  CFG.COLS.OWNER_ID); // Fallback
    
    mapField('Pet ID', CFG.COLS.PET_ID);
    mapField('petId',  CFG.COLS.PET_ID);     // Fallback

    // Client Details
    mapField('First Name', CFG.COLS.FIRST);
    mapField('Last Name',  CFG.COLS.LAST);
    mapField('Phone',      CFG.COLS.PHONE);
    mapField('Phone Number', CFG.COLS.PHONE);
    mapField('Email',      CFG.COLS.EMAIL);
    mapField('City',       CFG.COLS.CITY);
    mapField('State',      CFG.COLS.STATE);
    mapField('Zip Code',   CFG.COLS.ZIP);
    
    // Address Handling (Check both variations)
    if (cleanPayload['Address']) cleanPayload[CFG.COLS.ADDRESS] = cleanPayload['Address'];
    else if (cleanPayload['Street Address']) cleanPayload[CFG.COLS.ADDRESS] = cleanPayload['Street Address'];

    // Pet Details
    mapField('Pet Name',   CFG.COLS.PET_NAME);
    mapField('Species',    CFG.COLS.SPECIES);
    mapField('Breed One',  CFG.COLS.BREED_ONE);
    mapField('Breed Two',  CFG.COLS.BREED_TWO);
    mapField('Color',      CFG.COLS.COLOR);
    mapField('Color Pattern', CFG.COLS.COLOR_PATTERN);
    mapField('Sex',        'Sex'); // Assuming column header is "Sex"
    mapField('Spayed or Neutered', 'Spayed or Neutered');
    mapField('Age',        'Age');
    mapField('Weight',     'Weight');
    
    // Appt Details
    mapField('Notes', 'Notes');
    mapField('Vet Office Name', CFG.COLS.VET_OFFICE);
    mapField('Allergies or Sensitivities', 'Allergies or Sensitivities');
    mapField('Vaccines Needed', CFG.COLS.VACCINES);
    mapField('Additional Services', CFG.COLS.ADDITIONAL_SERVICES);
    mapField('Previous Vet Records', CFG.COLS.PREV_RECORDS);
    mapField('Transportation Needed', CFG.COLS.TRANSPORT_NEEDED);

    // 3. Grant Logic
    const zip = String(cleanPayload[CFG.COLS.ZIP] || '').trim();
    let grant = 'Incubator Extended'; 
    if (zip.includes('14215') || zip.includes('14211')) grant = 'PFL';
    else if (zip.includes('14208')) grant = 'Incubator';

    // 4. Handle New vs Existing Slot
    if (!appointmentId) {
        // NEW SLOT (Rogue or fresh book): Write Grant
        cleanPayload[CFG.COLS.GRANT] = grant;
    } else {
        // EXISTING SLOT: PROTECT TIME/DATE
        // We delete these keys so the spreadsheet row retains its original formatted Date/Time objects.
        delete cleanPayload[CFG.COLS.DATE];
        delete cleanPayload[CFG.COLS.TIME];
        delete cleanPayload[CFG.COLS.AMPM];
        delete cleanPayload[CFG.COLS.DAY];
        delete cleanPayload[CFG.COLS.GRANT]; 
        
        // Ensure we don't accidentally write raw keys either
        delete cleanPayload['Date'];
        delete cleanPayload['Time'];
        delete cleanPayload['AM or PM'];
    }

    const data = readAllAppointments_();
    
    // 5. Find Row
    let rowIndex = -1;
    if (appointmentId) {
      rowIndex = data.findIndex(r => String(r[CFG.COLS.ID]).trim() === String(appointmentId).trim()) + 2;
    }

    // Fallback Search (if ID mismatch)
    if (rowIndex < 2) {
      rowIndex = data.findIndex(r => {
        const rowDate = r[CFG.COLS.DATE] instanceof Date
          ? Utilities.formatDate(r[CFG.COLS.DATE], Session.getScriptTimeZone(), 'MM/dd/yyyy')
          : String(r[CFG.COLS.DATE]).trim();
        const rowTime = `${r[CFG.COLS.TIME]} ${r[CFG.COLS.AMPM]}`.trim();
        return (
          String(r[CFG.COLS.TYPE]).trim().toLowerCase() === String(type).trim().toLowerCase() &&
          rowDate === String(date).trim() &&
          rowTime === String(time).trim()
        );
      }) + 2;
    }

    if (rowIndex < 2) throw new Error(`Appointment slot not found: ${appointmentId}`);
    
    // 6. Final Status Updates
    cleanPayload[CFG.COLS.STATUS] = 'Reserved';
    cleanPayload[CFG.COLS.NEEDS_SCHED] = 'Yes';
    if (CFG.COLS.SCHEDULED_BY) cleanPayload[CFG.COLS.SCHEDULED_BY] = schedulerName || '';

    updateAppointmentRow_(rowIndex, cleanPayload);

    // Logging
    const historyPayload = {
      'Appointment ID': appointmentId,
      'Appointment Type': type,
      'Date': date,
      'Time': time,
      'AM or PM': cleanPayload['AM or PM'] || '',
      'Owner ID': cleanPayload[CFG.COLS.OWNER_ID] || '',
      'Pet ID': cleanPayload[CFG.COLS.PET_ID] || '',
      'Notes': cleanPayload['Notes'] || '',
      'Transportation Needed': cleanPayload[CFG.COLS.TRANSPORT_NEEDED] || '',
      'Scheduled By': schedulerName
    };
    if (date) {
       const d = new Date(date);
       historyPayload['Day of Week'] = Utilities.formatDate(d, Session.getScriptTimeZone(), 'EEEE');
    }

    if (typeof logAppointmentHistory_ === 'function') {
        logAppointmentHistory_(historyPayload);
    }

    return {};
  });
}

function apiCreateRogueAppointment(payload) {
  return apiResponse_(() => {
    if (!payload) throw new Error('Missing payload');
    
    // 1. Enforce IDs
    if (payload['Owner ID'] || payload['ownerId']) payload[CFG.COLS.OWNER_ID] = payload['Owner ID'] || payload['ownerId'];
    if (payload['Pet ID'] || payload['petId']) payload[CFG.COLS.PET_ID] = payload['Pet ID'] || payload['petId'];

    const newId = getNextAppointmentId_();
    
    // 2. Grant Logic
    const zip = String(payload['Zip Code'] || '').trim();
    let grant = 'Incubator Extended'; 

    if (zip.includes('14215') || zip.includes('14211')) {
      grant = 'PFL';
    } else if (zip.includes('14208')) {
      grant = 'Incubator';
    }

    const dateStr = payload['Date']; 
    let dayOfWeek = '';
    if (dateStr) {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        const d = new Date(+parts[2], +parts[0] - 1, +parts[1]); 
        dayOfWeek = Utilities.formatDate(d, Session.getScriptTimeZone(), 'EEEE');
      }
    }

    const fullRecord = normalizePayload_({
      ...payload,
      [CFG.COLS.ID]: newId,
      [CFG.COLS.GRANT]: grant,
      [CFG.COLS.STATUS]: 'Reserved',
      [CFG.COLS.NEEDS_SCHED]: 'Yes',
      [CFG.COLS.DAY]: dayOfWeek,
      [CFG.COLS.DATE]: payload['Date'],
      [CFG.COLS.TIME]: payload['Time'],
      [CFG.COLS.AMPM]: payload['AM or PM'],
      [CFG.COLS.TYPE]: payload['Appointment Type'],
      [CFG.COLS.SCHEDULED_BY]: payload['Scheduled By'],
      [CFG.COLS.UPDATED_BY]: payload['Scheduled By'],
      [CFG.COLS.CREATED_AT]: new Date()
    });
    
    appendNewAppointment_(fullRecord);
    
    const historyPayload = {
      'Appointment ID': newId,
      'Appointment Type': payload['Appointment Type'],
      'Day of Week': dayOfWeek,
      'Date': payload['Date'],
      'Time': payload['Time'],
      'AM or PM': payload['AM or PM'],
      'Owner ID': payload[CFG.COLS.OWNER_ID] || '',
      'Pet ID': payload[CFG.COLS.PET_ID] || '',
      'Notes': payload['Notes'] || '',
      'Transportation Needed': payload['Transportation Needed'] || '',
      'Scheduled By': payload['Scheduled By']
    };
    if (typeof logAppointmentHistory_ === 'function') logAppointmentHistory_(historyPayload);
    return { id: newId };
  });
}

function apiSearchAppointments(query, includePast = false) {
  return apiResponse_(() => {
    const { date, client, pet } = query || {};
    
    // 1. Setup Timezone & "Today" (Midnight EST)
    const tz = 'America/New_York';
    const now = new Date();
    const todayStr = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
    const todayMidnight = new Date(todayStr.replace(/-/g, '/')); // 00:00:00 today

    // 2. Get Raw Rows (from sheets.gs)
    const rawRows = searchAppointments_(date, client, pet);

    // 3. Filter & Map
    const rows = rawRows.reduce((acc, r) => {
      // A. Parse Row Date
      let val = r[CFG.COLS.DATE];
      let rowDate = null;
      if (val instanceof Date) rowDate = val;
      else if (typeof val === 'string') {
        const parts = val.trim().split('/');
        if (parts.length === 3) rowDate = new Date(+parts[2], +parts[0] - 1, +parts[1]);
      }

      if (!rowDate || isNaN(rowDate.getTime())) return acc;

      // Normalization for comparison
      const rowDateStr = Utilities.formatDate(rowDate, tz, 'yyyy-MM-dd');
      const rowDateMidnight = new Date(rowDateStr.replace(/-/g, '/'));
      
      // B. STATUS CHECK: Strictly 'Scheduled'
      // (User requested strictly 'Scheduled', so we exclude 'Reserved', 'Available', etc.)
      const status = String(r[CFG.COLS.STATUS] || '').trim();
      if (status !== 'Scheduled') return acc;

      // C. DATE CHECK: "At least one day in the future"
      // This means rowDate must be strictly GREATER than todayMidnight.
      // (e.g. If today is 12/16, row must be 12/17 or later)
      if (rowDateMidnight.getTime() <= todayMidnight.getTime()) return acc;

      // D. Build Result Object
      const dateDisplay = Utilities.formatDate(rowDate, tz, 'MM/dd/yyyy');
      acc.push({
        id: String(r[CFG.COLS.ID] || ''),
        date: dateDisplay, 
        time: `${r[CFG.COLS.TIME] || ''} ${r[CFG.COLS.AMPM] || ''}`.trim(),
        status: status,
        firstName: String(r[CFG.COLS.FIRST] || ''),
        lastName: String(r[CFG.COLS.LAST] || ''),
        petName: String(r[CFG.COLS.PET_NAME] || ''),
        notes: String(r['Notes'] || ''), // Ensure this matches your Config map if different
        transportNeeded: String(r[CFG.COLS.TRANSPORT_NEEDED] || ''),
        editable: true // Since we filtered, all returned rows are implicitly editable
      });
      return acc;
    }, []);

    return { rows };
  });
}

function apiCancelAppointment(appointmentId, reason, cancelledBy) {
  return apiResponse_(() => {
    if (!appointmentId) throw new Error('Missing ID');
    const all = readAllAppointments_();
    const idx = all.findIndex(r => String(r[CFG.COLS.ID] || '').trim() === String(appointmentId).trim());
    if (idx < 0) throw new Error('Not found');
    
    const rowDate = all[idx][CFG.COLS.DATE];
    const dateStr = (rowDate instanceof Date) ? Utilities.formatDate(rowDate, Session.getScriptTimeZone(), 'MM/dd/yyyy') : String(rowDate);
    
    // Optional: Comment out if you want to allow cancelling past appointments for cleanup
    if (!isFutureDate_(dateStr)) throw new Error('Cannot cancel past appointment');

    // 🔹 FIX: Added Owner/Pet IDs to the clear list
    const clearFields = {
      [CFG.COLS.FIRST]: '', [CFG.COLS.LAST]: '', [CFG.COLS.EMAIL]: '', [CFG.COLS.PHONE]: '',
      [CFG.COLS.ADDRESS]: '', [CFG.COLS.CITY]: '', [CFG.COLS.STATE]: '', [CFG.COLS.ZIP]: '',
      [CFG.COLS.TRANSPORT_NEEDED]: '', [CFG.COLS.PET_NAME]: '', [CFG.COLS.SPECIES]: '',
      [CFG.COLS.BREED_ONE]: '', [CFG.COLS.BREED_TWO]: '', [CFG.COLS.COLOR]: '', [CFG.COLS.COLOR_PATTERN]: '',
      [CFG.COLS.VACCINES]: '', [CFG.COLS.ADDITIONAL_SERVICES]: '', [CFG.COLS.PREV_RECORDS]: '',
      [CFG.COLS.VET_OFFICE]: '', [CFG.COLS.SCHEDULED_BY]: '',
      [CFG.COLS.OWNER_ID]: '', [CFG.COLS.PET_ID]: '', // <--- ADDED THESE
      'Sex': '', 'Spayed or Neutered': '', 'Age': '', 'Weight': '', 'Allergies or Sensitivities': '', 'Notes': ''
    };

    const updateFields = {
      [CFG.COLS.STATUS]: 'Available',
      [CFG.COLS.NEEDS_SCHED]: 'No',
      [CFG.COLS.CANCELLATION_REASON]: reason,
      [CFG.COLS.UPDATED_BY]: cancelledBy,
      [CFG.COLS.UPDATED_AT]: new Date()
    };

    updateAppointmentRow_(idx + 2, { ...clearFields, ...updateFields });
    return {};
  });
}

function apiLogOutcome(appointmentId, outcome, textNote, htmlNote, user) {
  return apiResponse_(() => {
    if (!appointmentId) throw new Error('Missing ID');
    const all = readAllAppointments_();
    const idx = all.findIndex(r => String(r[CFG.COLS.ID] || '').trim() === String(appointmentId).trim());
    if (idx < 0) throw new Error('Not found');

    let fileId = '';
    if (outcome !== 'DO NOT USE' && htmlNote && htmlNote.trim().length > 0) {
      const folder = DriveApp.getFolderById(CFG.OUTCOME_NOTES_FOLDER_ID);
      const file = folder.createFile(`Note_${appointmentId}_${outcome}.html`, htmlNote, MimeType.HTML);
      fileId = file.getId();
    }

    const payload = {
      [CFG.COLS.APPT_OUTCOME]: (outcome === 'DO NOT USE' ? '' : outcome),
      [CFG.COLS.APPT_NOTES]: textNote,
      [CFG.COLS.APPT_NOTES_FILE_ID]: fileId,
      [CFG.COLS.STATUS]: outcome,
      [CFG.COLS.NEEDS_SCHED]: (outcome === 'DO NOT USE' ? 'DO NOT USE' : 'No'),
      [CFG.COLS.UPDATED_BY]: user,
      [CFG.COLS.UPDATED_AT]: new Date()
    };

    updateAppointmentRow_(idx + 2, payload);
    return {};
  });
}

// ─── VET RECORD HELPERS ──────────────────────────────

function apiSendVetRecordReminder(schedulerName, petName, appointmentCard) {
  try {
    if (!schedulerName || !petName) throw new Error('Missing info');
    const props = PropertiesService.getScriptProperties();
    const propKey = `EMAIL_${schedulerName.toUpperCase().replace(/\s+/g, '_')}`;
    const recipient = props.getProperty(propKey);
    if (!recipient) throw new Error(`Script property not found: ${propKey}`);

    const uploadLink = 'https://script.google.com/macros/s/AKfycbxb1_Oha9qhWnaOMeUuFHSSEe5E7IoCPG2JPdkCn4Jmju-2VYiQzOobecO9DwKcC_pf/exec';
    
    MailApp.sendEmail({
      to: recipient,
      from: 'yourspcaoutreachteam@gmail.com',
      name: 'SPCA Outreach Team',
      subject: `REMINDER - Upload Records for ${petName}`,
      body: `Hi ${schedulerName},\n\nYour friendly PHP System here reminding you to upload or provide records for ${petName} to the Lipsey Clinic before their upcoming appointment.\n\nThe appointment is scheduled for:\n${appointmentCard}\n\nYou can upload records here:\n${uploadLink}\n\n— SPCA Outreach Team`
    });
    Logger.log(`apiSendVetRecordReminder() → sent to ${recipient}`);
    return { ok: true };
  } catch (err) {
    Logger.log('apiSendVetRecordReminder() ERROR: ' + err);
    return { ok: false, error: err.message };
  }
}

function apiCreateVetRecordsFolder(firstName, lastName, petName, clientEmail) {
  try {
    const PARENT_ID = '1KMbIfS0Y5q1y7BDbLUj84U3snfXDNPUC';
    const parent = DriveApp.getFolderById(PARENT_ID);
    const folderName = `${lastName}_${firstName}_${petName}`.replace(/[^\w\s-]/g, '_');
    
    let folder;
    const existing = parent.getFoldersByName(folderName);
    folder = existing.hasNext() ? existing.next() : parent.createFolder(folderName);
    
    try {
      folder.addEditor('yourspcaoutreachteam@gmail.com');
      folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDITOR);
      if (clientEmail) folder.addEditor(clientEmail);
    } catch (permErr) { Logger.log('Perm warning: ' + permErr); }
    
    return { ok: true, folderId: folder.getId(), url: folder.getUrl() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function apiUploadVetRecord(filename, base64Data, folderId) {
  try {
    if (!folderId) throw new Error('Missing folderId');
    const folder = DriveApp.getFolderById(folderId);
    const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), undefined, filename);
    folder.createFile(blob);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function apiSendVetRecordsRequest(clientEmail, folderUrl, firstName, petName) {
  try {
    if (!clientEmail) return { ok: false, error: 'Missing client email' };
    const props = PropertiesService.getScriptProperties();
    const uploadLink = props.getProperty('RECORD_UPLOAD_LINK');
    
    MailApp.sendEmail({
      to: clientEmail,
      name: 'SPCA Outreach Team',
      from: 'yourspcaoutreachteam@gmail.com',
      subject: `Upload Veterinary Records for ${petName}`,
      body: `Hello ${firstName},\n\nYou can securely upload your previous veterinary records for ${petName} using the link below:\n\n${uploadLink}\n\nPlease ensure that you include all relevant pages or photos.\n\n— SPCA Serving Erie County Outreach Team`
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ─── UTILS ───────────────────────────────────────────

function isFutureDate_(dateStr) {
  try {
    if (!dateStr) return false;
    const [m2, d2, y2] = String(dateStr).split('/').map(Number);
    const target = new Date(y2, m2 - 1, d2);
    const today = new Date();
    const tzToday = Utilities.formatDate(today, 'America/New_York', 'MM/dd/yyyy');
    const [m1, d1, y1] = tzToday.split('/').map(Number);
    const nowDate = new Date(y1, m1 - 1, d1);
    return target > nowDate;
  } catch (err) {
    return false;
  }
}

// ─── DROPDOWN DATA HELPERS ───────────────────────────

function apiGetVaccineLists() {
  return apiResponse_(() => {
    return {
      canine: [
        'Rabies', 
        'Distemper (DA2PP)', 
        'Bordetella', 
        'Leptospirosis'
      ],
      feline: [
        'FVRCP', 
        'Rabies', 
        'FeLV'
      ]
    };
  });
}

function apiGetAdditionalServices() {
  return apiResponse_(() => {
    return {
      services: [
        'Microchip', 
        'Nail Trim', 
        'Dewormer', 
        'Flea/Tick Treatment',
        'Standard Exam',
        'Other - please clarify in the note'
      ]
    };
  });
}

// ─── MODIFY / RESCHEDULE SUPPORT ─────────────────────

function apiGetModifyContext(apptId) {
  return apiResponse_(() => {
    Logger.log('[Modify] Fetching context for ID: ' + apptId);
    
    // 1. Get Appointment Row from Master
    const allAppts = readAllAppointments_();
    
    // Helper to find value case-insensitively
    const getValue = (row, targetHeader) => {
      const key = Object.keys(row).find(k => k.toLowerCase().trim() === targetHeader.toLowerCase().trim());
      return key ? row[key] : '';
    };

    const appt = allAppts.find(r => {
        const val = getValue(r, CFG.COLS.ID);
        return String(val).trim() === String(apptId).trim();
    });
    
    if (!appt) {
      Logger.log('[Modify] Error: Appt not found');
      throw new Error('Appointment not found');
    }

    const ownerId = String(getValue(appt, CFG.COLS.OWNER_ID) || '').trim();
    const petId   = String(getValue(appt, CFG.COLS.PET_ID) || '').trim();
    
    Logger.log(`[Modify] Found appt. OwnerID: "${ownerId}", PetID: "${petId}"`);

    let owner = null;
    let pet = null;

    // 2. Try to get Owner from Central
    if (ownerId) {
        const owners = findOwnersInDb_(ownerId); 
        if (owners.length > 0) owner = owners[0];
    }

    // 2b. Fallback
    if (!owner) {
        Logger.log('[Modify] Owner not found in Central DB (or no ID). Using Appt data fallback.');
        owner = {
            ownerId: ownerId || '', 
            firstName: getValue(appt, CFG.COLS.FIRST),
            lastName: getValue(appt, CFG.COLS.LAST),
            phone: getValue(appt, CFG.COLS.PHONE),
            email: getValue(appt, CFG.COLS.EMAIL),
            address: getValue(appt, CFG.COLS.ADDRESS),
            city: getValue(appt, CFG.COLS.CITY),
            state: getValue(appt, CFG.COLS.STATE),
            zip: getValue(appt, CFG.COLS.ZIP)
        };
    }

    // 3. Try to get Pet from Central
    if (petId) {
        if (ownerId) {
            const pets = getPetsByOwnerId_(ownerId); 
            pet = pets.find(p => String(p.petId) === petId);
        }
    }

    // 3b. Fallback
    if (!pet) {
        Logger.log('[Modify] Pet not found in Central DB. Using Appt data fallback.');
        pet = {
            petId: petId || '',
            name: getValue(appt, CFG.COLS.PET_NAME),
            species: getValue(appt, CFG.COLS.SPECIES),
            breed: getValue(appt, CFG.COLS.BREED_ONE),
            breed2: getValue(appt, CFG.COLS.BREED_TWO),
            color: getValue(appt, CFG.COLS.COLOR),
            pattern: getValue(appt, CFG.COLS.COLOR_PATTERN),
            sex: getValue(appt, 'Sex'),
            fixed: getValue(appt, 'Spayed or Neutered'),
            age: getValue(appt, 'Age'),
            weight: getValue(appt, 'Weight')
        };
    }

    // 🔹 FIX: Sanitize Data (Convert Date objects to Strings)
    // We use JSON.parse/stringify hack to ensure all Dates become strings before leaving the server.
    const cleanResult = JSON.parse(JSON.stringify({ 
      appointment: appt, 
      owner: owner, 
      pet: pet 
    }));

    return cleanResult;
  });
}

function apiRescheduleAppointment(oldApptId, newSlotId, newType, payload, scheduler, isRogue, rogueData) {
  return apiResponse_(() => {
    Logger.log('[Modify] Rescheduling appt: ' + oldApptId);
    
    // A. Cancel old
    const cancelRes = apiCancelAppointment(oldApptId, "Rescheduled to new slot", scheduler);
    if (!cancelRes.ok) throw new Error(cancelRes.error);

    // B. Book New
    // 🔹 FIX: Explicit Map for Reschedule
    if (payload['Owner ID'] || payload['ownerId']) payload[CFG.COLS.OWNER_ID] = payload['Owner ID'] || payload['ownerId'];
    if (payload['Pet ID'] || payload['petId']) payload[CFG.COLS.PET_ID] = payload['Pet ID'] || payload['petId'];

    if (isRogue) {
      payload['Date'] = rogueData.date;
      payload['Time'] = rogueData.time;
      payload['AM or PM'] = rogueData.ampm;
      payload['Appointment Type'] = newType;
      payload['Scheduled By'] = scheduler;
      
      const newId = getNextAppointmentId_();
      const zip = String(payload['Zip Code'] || '').trim();
      const grant = (zip.includes('14215') || zip.includes('14211')) ? 'PFL' : 'Incubator';
      
      let dayOfWeek = '';
      if (rogueData.date) {
        const parts = rogueData.date.split('/');
        if (parts.length === 3) {
          const d = new Date(+parts[2], +parts[0] - 1, +parts[1]); 
          dayOfWeek = Utilities.formatDate(d, Session.getScriptTimeZone(), 'EEEE');
        }
      }

      const fullRecord = normalizePayload_({
        ...payload,
        [CFG.COLS.ID]: newId,
        [CFG.COLS.GRANT]: grant,
        [CFG.COLS.STATUS]: 'Reserved',
        [CFG.COLS.NEEDS_SCHED]: 'Yes',
        [CFG.COLS.DAY]: dayOfWeek,
        [CFG.COLS.DATE]: rogueData.date,
        [CFG.COLS.TIME]: rogueData.time,
        [CFG.COLS.AMPM]: rogueData.ampm,
        [CFG.COLS.TYPE]: newType,
        [CFG.COLS.SCHEDULED_BY]: scheduler,
        [CFG.COLS.UPDATED_BY]: scheduler,
        [CFG.COLS.CREATED_AT]: new Date()
      });
      
      appendNewAppointment_(fullRecord);
      return { id: newId };

    } else {
      const bookRes = apiBookAppointment(payload, newType, payload['Date'], payload['Time'], newSlotId, scheduler);
      if (!bookRes.ok) throw new Error(bookRes.error);
      return { success: true };
    }
  });
}