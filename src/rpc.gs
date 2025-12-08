/**
 * Grant Appointment Scheduling — RPC Endpoints
 * Central hub for all frontend-backend communication.
 */

// ─── HELPERS ─────────────────────────────────────────

/**
 * Basic wrapper for try/catch blocks.
 */
function rpcTry(fn) {
  try {
    return fn();
  } catch (err) {
    Logger.log('[RPC ERROR] ' + err);
    throw err;
  }
}

/**
 * Standard API Response Wrapper.
 * Returns { ok: true, ... } or { ok: false, error: ... }
 */
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
  // Ensure empty strings instead of undefined
  Object.keys(out).forEach(k => {
    if (out[k] == null) out[k] = '';
  });
  return out;
}

// ─── CENTRAL DB CONNECTORS (New) ─────────────────────

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
    Logger.log(`apiGetAvailableSlots() called | type=${type} | limit=${limit}`);
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
    Logger.log(`apiBookAppointment() | type=${type} | date=${date} | time=${time} | id=${appointmentId}`);
    
    if (!CFG || !CFG.SHEET_ID) throw new Error('Configuration (CFG) not found.');
    if (!payload || typeof payload !== 'object') throw new Error('Invalid payload');

    payload = normalizePayload_(payload);
    const data = readAllAppointments_();
    
    let rowIndex = -1;

    // Prefer Appointment ID
    if (appointmentId) {
      rowIndex = data.findIndex(r => String(r[CFG.COLS.ID]).trim() === String(appointmentId).trim()) + 2;
    }

    // Fallback: type/date/time
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

    // Update row
    payload[CFG.COLS.STATUS] = 'Reserved';
    payload[CFG.COLS.NEEDS_SCHED] = 'Yes';
    if (CFG.COLS.SCHEDULED_BY) payload[CFG.COLS.SCHEDULED_BY] = schedulerName || '';

    updateAppointmentRow_(rowIndex, payload);

    // NEW: Log to History DB
    const historyPayload = {
      'Appointment ID': appointmentId,
      'Appointment Type': type,
      'Date': date,
      'Time': time,
      'AM or PM': payload['AM or PM'] || '',
      'Owner ID': payload['Owner ID'] || '',
      'Pet ID': payload['Pet ID'] || '',
      'Notes': payload['Notes'] || '',
      'Transportation Needed': payload['Transportation Needed'] || '',
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

function apiUpdateAppointment(appointmentId, payload, updatedBy, transportNeeded) {
  return apiResponse_(() => {
    if (!appointmentId) throw new Error('Missing ID');
    payload = normalizePayload_(payload);
    
    const all = readAllAppointments_();
    const idx = all.findIndex(r => String(r[CFG.COLS.ID] || '').trim() === String(appointmentId).trim());
    if (idx < 0) throw new Error('Not found');

    // Add meta
    payload[CFG.COLS.NEEDS_SCHED] = 'Yes';
    if (CFG.COLS.UPDATED_BY) payload[CFG.COLS.UPDATED_BY] = String(updatedBy || '');
    if (CFG.COLS.TRANSPORT_NEEDED) payload[CFG.COLS.TRANSPORT_NEEDED] = (transportNeeded === 'Yes' ? 'Yes' : 'No');

    updateAppointmentRow_(idx + 2, payload);
    
    // Check if status is scheduled to send email
    const status = String(payload[CFG.COLS.STATUS] || '');
    if (status.toLowerCase() === 'scheduled') {
      try {
        if(typeof sendAppointmentChangeEmail_ === 'function') sendAppointmentChangeEmail_(payload);
      } catch (e) { console.warn(e); }
    }
    
    return {};
  });
}

// ─── ROGUE / CANCEL / OUTCOME / SEARCH (Restored) ────

function apiCreateRogueAppointment(payload) {
  return apiResponse_(() => {
    if (!payload) throw new Error('Missing payload');
    
    const newId = getNextAppointmentId_();
    const zip = String(payload['Zip Code'] || '').trim();
    const grant = (zip.includes('14215') || zip.includes('14211')) ? 'PFL' : 'Incubator';

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
    
    // Log History
    const historyPayload = {
      'Appointment ID': newId,
      'Appointment Type': payload['Appointment Type'],
      'Day of Week': dayOfWeek,
      'Date': payload['Date'],
      'Time': payload['Time'],
      'AM or PM': payload['AM or PM'],
      'Owner ID': payload['Owner ID'] || '',
      'Pet ID': payload['Pet ID'] || '',
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

// ─── VET RECORD HELPERS (Preserved) ──────────────────

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

function getGetLists() {
    return {
        canine: apiGetVaccineLists().canine,
        feline: apiGetVaccineLists().feline,
        services: apiGetAdditionalServices().services
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
        'Leptospirosis', 
        'Lyme'
      ],
      feline: [
        'Rabies', 
        'FVRCP', 
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
        'E-Collar', 
        'Hernia Repair', 
        'Cryptorchid',
        'Flea/Tick Prevention'
      ]
    };
  });
}