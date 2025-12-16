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
    const tz = Session.getScriptTimeZone() || 'America/New_York';
    const now = new Date();
    const today = new Date(Utilities.formatDate(now, tz, 'yyyy-MM-dd').replace(/-/g, '/'));

    const rawRows = searchAppointments_(date, client, pet);

    const rows = rawRows.reduce((acc, r) => {
      let val = r[CFG.COLS.DATE];
      let rowDate = null;
      
      if (val instanceof Date) rowDate = val;
      else if (typeof val === 'string') {
        const parts = val.trim().split('/');
        if (parts.length === 3) rowDate = new Date(+parts[2], +parts[0] - 1, +parts[1]);
      }

      if (!rowDate || isNaN(rowDate.getTime())) return acc;

      const rowDateStr = Utilities.formatDate(rowDate, tz, 'yyyy-MM-dd');
      const rowDateMidnight = new Date(rowDateStr.replace(/-/g, '/'));
      const status = String(r[CFG.COLS.STATUS] || '');

      if (includePast) {
        const isDateOnly = (date && !client && !pet);
        if (isDateOnly) {
           if (status !== 'Available' && status !== 'Scheduled' && status !== 'Reserved') return acc;
        } else {
           if (status !== 'Scheduled' && status !== 'Reserved') return acc;
        }
      } else {
        if (rowDateMidnight.getTime() < today.getTime()) return acc;
      }

      const isEditable = rowDateMidnight.getTime() > today.getTime();
      const dateDisplay = Utilities.formatDate(rowDate, tz, 'MM/dd/yyyy');

      acc.push({
        id: String(r[CFG.COLS.ID] || ''),
        date: dateDisplay, 
        time: `${r[CFG.COLS.TIME] || ''} ${r[CFG.COLS.AMPM] || ''}`.trim(),
        status: status,
        firstName: String(r[CFG.COLS.FIRST] || ''),
        lastName: String(r[CFG.COLS.LAST] || ''),
        petName: String(r[CFG.COLS.PET_NAME] || ''),
        notes: String(r['Notes'] || ''),
        transportNeeded: String(r[CFG.COLS.TRANSPORT_NEEDED] || ''),
        editable: isEditable
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
    if (!isFutureDate_(dateStr)) throw new Error('Cannot cancel past appointment');

    const clearFields = {
      [CFG.COLS.FIRST]: '', [CFG.COLS.LAST]: '', [CFG.COLS.EMAIL]: '', [CFG.COLS.PHONE]: '',
      [CFG.COLS.ADDRESS]: '', [CFG.COLS.CITY]: '', [CFG.COLS.STATE]: '', [CFG.COLS.ZIP]: '',
      [CFG.COLS.TRANSPORT_NEEDED]: '', [CFG.COLS.PET_NAME]: '', [CFG.COLS.SPECIES]: '',
      [CFG.COLS.BREED_ONE]: '', [CFG.COLS.BREED_TWO]: '', [CFG.COLS.COLOR]: '', [CFG.COLS.COLOR_PATTERN]: '',
      [CFG.COLS.VACCINES]: '', [CFG.COLS.ADDITIONAL_SERVICES]: '', [CFG.COLS.PREV_RECORDS]: '',
      [CFG.COLS.VET_OFFICE]: '', [CFG.COLS.SCHEDULED_BY]: '',
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
    
    // Helper to find value case-insensitively (handles "Owner Id" vs "Owner ID")
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

    // 2b. Fallback: If no ID or not found, build from Appointment Data
    if (!owner) {
        Logger.log('[Modify] Owner not found in Central DB (or no ID). Using Appt data fallback.');
        owner = {
            ownerId: ownerId || '', // Might be blank
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

    // 3b. Fallback: If no ID or not found, build from Appointment Data
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

    return { appointment: appt, owner: owner, pet: pet };
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