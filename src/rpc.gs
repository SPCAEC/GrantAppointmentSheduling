/**
 * Grant Appointment Scheduling — RPC Endpoints
 * Called from frontend via google.script.run
 */

/**
 * Returns the next available slots for a given appointment type.
 */
function apiGetAvailableSlots(type, limit) {
  try {
    Logger.log(`apiGetAvailableSlots() called | type=${type} | limit=${limit}`);
    limit = limit || 6;
    if (!CFG || !CFG.SHEET_ID) throw new Error('Configuration (CFG) not found.');

    const slotsRaw = getAvailableSlots_(type, limit);
    if (!Array.isArray(slotsRaw)) throw new Error('No slot data returned from getAvailableSlots_()');

    const slots = slotsRaw.map(r => ({
      id:   String(r[CFG.COLS.ID] || ''),
      day:  String(r[CFG.COLS.DAY] || ''),
      date: String(r[CFG.COLS.DATE] || ''),
      time: `${r[CFG.COLS.TIME] || ''} ${r[CFG.COLS.AMPM] || ''}`.trim(),
      grant: String(r[CFG.COLS.GRANT] || '')
    }));

    Logger.log(`apiGetAvailableSlots() → returning ${slots.length} slots`);
    return { ok: true, slots };
  } catch (err) {
    Logger.log('apiGetAvailableSlots() ERROR: ' + err + '\n' + err.stack);
    return { ok: false, error: err.message || String(err) };
  }
}

/**
 * Normalize payload and ensure defaults before writing to sheet.
 */
function normalizePayload_(payload) {
  const out = Object.assign({}, payload);

  // Default safe values
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

/**
 * Books an appointment by unique Appointment ID.
 * Also writes "Scheduled By" to the sheet.
 */
function apiBookAppointment(payload, type, date, time, appointmentId, schedulerName) {
  try {
    Logger.log(`apiBookAppointment() | type=${type} | date=${date} | time=${time} | id=${appointmentId} | scheduler=${schedulerName}`);
    if (!CFG || !CFG.SHEET_ID) throw new Error('Configuration (CFG) not found.');
    if (!payload || typeof payload !== 'object') throw new Error('Invalid payload');

    payload = normalizePayload_(payload);
    const data = readAllAppointments_();
    if (!Array.isArray(data) || !data.length) throw new Error('No appointment data found.');

    let rowIndex = -1;

    // Prefer Appointment ID
    if (appointmentId) {
      rowIndex = data.findIndex(r => String(r[CFG.COLS.ID]).trim() === String(appointmentId).trim()) + 2;
      Logger.log(`Matched appointment by ID → rowIndex=${rowIndex}`);
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
      Logger.log(`Legacy fallback match → rowIndex=${rowIndex}`);
    }

    if (rowIndex < 2) throw new Error(`Appointment slot not found (type=${type}, date=${date}, time=${time}, id=${appointmentId})`);

    // Update row
    payload[CFG.COLS.STATUS] = 'Reserved';
    payload[CFG.COLS.NEEDS_SCHED] = 'Yes';
    if (CFG.COLS.SCHEDULED_BY) payload[CFG.COLS.SCHEDULED_BY] = schedulerName || '';

    updateAppointmentRow_(rowIndex, payload);

    Logger.log(`apiBookAppointment() → Updated row ${rowIndex} successfully.`);
    return { ok: true };
  } catch (err) {
    Logger.log('apiBookAppointment() ERROR: ' + err + '\n' + err.stack);
    return { ok: false, error: err.message || String(err) };
  }
}

/**
 * Sends a reminder to scheduler to upload vet records.
 * Looks up recipient email by Script Property (EMAIL_NAME).
 */
function apiSendVetRecordReminder(schedulerName, petName, appointmentCard) {
  try {
    if (!schedulerName) throw new Error('Missing schedulerName');
    if (!petName) throw new Error('Missing petName');

    const props = PropertiesService.getScriptProperties();
    const propKey = `EMAIL_${schedulerName.toUpperCase().replace(/\s+/g, '_')}`;
    const recipient = props.getProperty(propKey);
    if (!recipient) throw new Error(`Script property not found: ${propKey}`);

    const uploadLink = 'https://script.google.com/macros/s/AKfycbxb1_Oha9qhWnaOMeUuFHSSEe5E7IoCPG2JPdkCn4Jmju-2VYiQzOobecO9DwKcC_pf/exec';
    const subject = `REMINDER - Upload Records for ${petName}`;
    const body = `
Hi ${schedulerName},

Your friendly PHP System here reminding you to upload or provide records for ${petName} to the Lipsey Clinic before their upcoming appointment.

The appointment is scheduled for:
${appointmentCard}

You can upload records here:
${uploadLink}

— SPCA Outreach Team
`;

    MailApp.sendEmail({
      to: recipient,
      from: 'yourspcaoutreachteam@gmail.com',
      name: 'SPCA Outreach Team',
      subject,
      body
    });

    Logger.log(`apiSendVetRecordReminder() → sent to ${recipient}`);
    return { ok: true };
  } catch (err) {
    Logger.log('apiSendVetRecordReminder() ERROR: ' + err + '\n' + err.stack);
    return { ok: false, error: err.message };
  }
}

/**
 * Returns vaccine lists from Script Properties.
 */
function apiGetVaccineLists() {
  try {
    const props = PropertiesService.getScriptProperties();
    const canine = (props.getProperty('VACCINE_LIST_CANINE') || '')
      .split(',').map(s => s.trim()).filter(Boolean);
    const feline = (props.getProperty('VACCINE_LIST_FELINE') || '')
      .split(',').map(s => s.trim()).filter(Boolean);
    return { ok: true, canine, feline };
  } catch (err) {
    Logger.log('apiGetVaccineLists() ERROR: ' + err);
    return { ok: false, error: err.message };
  }
}

/**
 * Returns additional services list from Script Properties.
 */
function apiGetAdditionalServices() {
  try {
    const props = PropertiesService.getScriptProperties();
    const list = (props.getProperty('ADDITIONAL_SERVICES') || '')
      .split(',').map(s => s.trim()).filter(Boolean);
    return { ok: true, services: list };
  } catch (err) {
    Logger.log('apiGetAdditionalServices() ERROR: ' + err);
    return { ok: false, error: err.message };
  }
}

/**
 * Handles vet record folder creation and permission setup.
 */
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
    } catch (permErr) {
      Logger.log('apiCreateVetRecordsFolder() permission warning: ' + permErr.message);
    }

    Logger.log(`Vet folder ready: ${folderName}`);
    return { ok: true, folderId: folder.getId(), url: folder.getUrl() };
  } catch (err) {
    Logger.log('apiCreateVetRecordsFolder() ERROR: ' + err + '\n' + err.stack);
    return { ok: false, error: err.message };
  }
}

/**
 * Sends vet records upload email using the central upload web app link.
 */
function apiSendVetRecordsRequest(clientEmail, folderUrl, firstName, petName) {
  try {
    if (!clientEmail) return { ok: false, error: 'Missing client email' };

    const props = PropertiesService.getScriptProperties();
    const uploadLink = props.getProperty('RECORD_UPLOAD_LINK');
    if (!uploadLink) throw new Error('Missing Script Property: RECORD_UPLOAD_LINK');

    const subject = `Upload Veterinary Records for ${petName}`;
    const body = `
Hello ${firstName},

You can securely upload your previous veterinary records for ${petName} using the link below:

${uploadLink}

Please ensure that you include all relevant pages or photos. Your records will be kept secure and used only for your pet’s care.

If you have any questions, please reply to this email or contact the SPCA Outreach Team.

— SPCA Serving Erie County Outreach Team
`;

    MailApp.sendEmail({
      to: clientEmail,
      name: 'SPCA Outreach Team',
      from: 'yourspcaoutreachteam@gmail.com',
      subject,
      body
    });

    Logger.log(`Vet record upload email sent to ${clientEmail} for ${petName}.`);
    return { ok: true };
  } catch (err) {
    Logger.log('apiSendVetRecordsRequest() ERROR: ' + err);
    return { ok: false, error: err.message };
  }
}

/**
 * Uploads a base64 file to a given Drive folder.
 */
function apiUploadVetRecord(filename, base64Data, folderId) {
  try {
    if (!folderId) throw new Error('Missing folderId');
    if (!filename || !base64Data) throw new Error('Missing file data');
    const folder = DriveApp.getFolderById(folderId);
    const bytes = Utilities.base64Decode(base64Data);
    const blob = Utilities.newBlob(bytes, undefined, filename);
    blob.setContentTypeFromExtension();
    folder.createFile(blob);
    Logger.log(`apiUploadVetRecord() → ${filename} uploaded to folder ${folderId}`);
    return { ok: true };
  } catch (err) {
    Logger.log('apiUploadVetRecord() ERROR: ' + err + '\n' + err.stack);
    return { ok: false, error: err.message };
  }
}

/* ------------------------------------------
   SEARCH UPDATED (Complex Filtering Logic)
   ------------------------------------------ */
function apiSearchAppointments(query, includePast = false) {
  try {
    const { date, client, pet } = query || {};
    const tz = Session.getScriptTimeZone() || 'America/New_York';
    
    // "Today" at midnight
    const now = new Date();
    const today = new Date(Utilities.formatDate(now, tz, 'yyyy-MM-dd').replace(/-/g, '/'));

    const rawRows = searchAppointments_(date, client, pet);

    const rows = rawRows.reduce((acc, r) => {
      // 1. Date Parsing
      let val = r[CFG.COLS.DATE];
      let rowDate = null;
      if (val instanceof Date) {
        rowDate = val;
      } else if (typeof val === 'string') {
        const parts = val.trim().split('/');
        if (parts.length === 3) rowDate = new Date(+parts[2], +parts[0] - 1, +parts[1]);
      }

      if (!rowDate || isNaN(rowDate.getTime())) return acc;

      const rowDateStr = Utilities.formatDate(rowDate, tz, 'yyyy-MM-dd');
      const rowDateMidnight = new Date(rowDateStr.replace(/-/g, '/'));
      const status = String(r[CFG.COLS.STATUS] || '');

      // 2. OUTCOME FLOW FILTERING (when includePast is true)
      if (includePast) {
        // Logic:
        // A. If searching ONLY by Date: Show "Available" and "Scheduled" (and "Reserved")
        // B. If searching by Client/Pet: Show ONLY "Scheduled" (and "Reserved")
        
        const isDateOnly = (date && !client && !pet);
        
        if (isDateOnly) {
           // Allow Available, Scheduled, Reserved
           if (status !== 'Available' && status !== 'Scheduled' && status !== 'Reserved') return acc;
        } else {
           // Specific Search: Must be booked
           if (status !== 'Scheduled' && status !== 'Reserved') return acc;
        }
      } 
      // 3. STANDARD FLOW FILTERING (Booking/Modify)
      else {
        // Must be future
        if (rowDateMidnight.getTime() < today.getTime()) return acc;
      }

      // 4. Map Data
      const dateDisplay = Utilities.formatDate(rowDate, tz, 'MM/dd/yyyy');

      acc.push({
        id: String(r[CFG.COLS.ID] || ''),
        date: dateDisplay, 
        time: `${r[CFG.COLS.TIME] || ''} ${r[CFG.COLS.AMPM] || ''}`.trim(),
        status: status,
        firstName: String(r[CFG.COLS.FIRST] || ''),
        lastName: String(r[CFG.COLS.LAST] || ''),
        petName: String(r[CFG.COLS.PET_NAME] || ''),
        // NEW: Return original notes so we can display them in Outcome flow
        notes: String(r['Notes'] || '') 
      });
      
      return acc;
    }, []);

    return { ok: true, rows };
  } catch (err) {
    Logger.log('apiSearchAppointments error: ' + err);
    return { ok: false, error: err.message };
  }
}

/* ------------------------------------------
   LOG OUTCOME (Updated for "Block Off")
   ------------------------------------------ */
function apiLogOutcome(appointmentId, outcome, textNote, htmlNote, user) {
  try {
    if (!appointmentId) throw new Error('Missing ID');
    
    // 1. Find Row
    const all = readAllAppointments_();
    const idx = all.findIndex(r => String(r[CFG.COLS.ID] || '').trim() === String(appointmentId).trim());
    if (idx < 0) throw new Error('Appointment not found');

    // 2. Logic Split
    let fileId = '';
    let newStatus = outcome;
    let needsSched = 'No';

    // BLOCK OFF LOGIC
    if (outcome === 'DO NOT USE') {
       // Do not create drive file
       // Update text note only
    } 
    // STANDARD OUTCOME LOGIC
    else {
       // Create Drive File if HTML exists
       if (htmlNote && htmlNote.trim().length > 0) {
         const folder = DriveApp.getFolderById(CFG.OUTCOME_NOTES_FOLDER_ID);
         const fileName = `Note_${appointmentId}_${outcome}.html`;
         const file = folder.createFile(fileName, htmlNote, MimeType.HTML);
         fileId = file.getId();
       }
    }

    // 3. Build Payload
    const payload = {
      [CFG.COLS.APPT_OUTCOME]: (outcome === 'DO NOT USE' ? '' : outcome), // Don't log "DO NOT USE" as a clinical outcome
      [CFG.COLS.APPT_NOTES]: textNote,
      [CFG.COLS.APPT_NOTES_FILE_ID]: fileId,
      [CFG.COLS.STATUS]: newStatus,
      [CFG.COLS.NEEDS_SCHED]: needsSched, // Sets to "No" (or "DO NOT USE" if we mapped it, but "No" removes it from queues)
      [CFG.COLS.UPDATED_BY]: user,
      [CFG.COLS.UPDATED_AT]: new Date()
    };
    
    if (outcome === 'DO NOT USE') {
       payload[CFG.COLS.NEEDS_SCHED] = 'DO NOT USE'; // Specific requirement
    }

    // 4. Update Sheet
    updateAppointmentRow_(idx + 2, payload);
    
    return { ok: true };
  } catch (err) {
    Logger.log('apiLogOutcome error: ' + err);
    return { ok: false, error: err.message };
  }
}

/**
 * Update an appointment row by Appointment ID.
 * Overwrites the row with payload (like scheduling) + stamps Updated by.
 * If status == "Scheduled", sends change email immediately.
 */
function apiUpdateAppointment(appointmentId, payload, updatedBy, transportNeeded) {
  try {
    if (!appointmentId) throw new Error('Missing appointmentId');
    payload = normalizePayload_(payload);

    // resolve row index
    const all = readAllAppointments_(); // returns array of objects
    const idx = all.findIndex(r => String(r[CFG.COLS.ID] || '').trim() === String(appointmentId).trim());
    if (idx < 0) throw new Error('Appointment not found for ID ' + appointmentId);

    // Add meta
    payload[CFG.COLS.NEEDS_SCHED] = 'Yes';
    if (CFG.COLS.UPDATED_BY) payload[CFG.COLS.UPDATED_BY] = String(updatedBy || '');

    // If your sheet stores transport in a column, set it here (optional)
    if (CFG.COLS.TRANSPORT_NEEDED) payload[CFG.COLS.TRANSPORT_NEEDED] = (transportNeeded === 'Yes' ? 'Yes' : 'No');

    // Write back to the sheet row (header row is 1, so +2)
    const rowIndex = idx + 2;
    updateAppointmentRow_(rowIndex, payload);

    // Email if status == Scheduled
    const status = String(payload[CFG.COLS.STATUS] || '');
    if (status.toLowerCase() === 'scheduled') {
      try {
        sendAppointmentChangeEmail_(payload);
      } catch (mailErr) {
        Logger.log('sendAppointmentChangeEmail_() WARN: ' + mailErr);
      }
    }

    return { ok: true };
  } catch (err) {
    Logger.log('apiUpdateAppointment() ERROR: ' + err + '\n' + err.stack);
    return { ok: false, error: err.message || String(err) };
  }
}
/**
 * Determines whether a given date string (MM/dd/yyyy) is after today.
 * Used to disable editing for same-day or past appointments.
 */
function isFutureDate_(dateStr) {
  try {
    if (!dateStr) return false;
    const [m2, d2, y2] = String(dateStr).split('/').map(Number);
    const target = new Date(y2, m2 - 1, d2);
    
    // Today's date in America/New_York, without time
    const today = new Date();
    const tzToday = Utilities.formatDate(today, 'America/New_York', 'MM/dd/yyyy');
    const [m1, d1, y1] = tzToday.split('/').map(Number);
    const nowDate = new Date(y1, m1 - 1, d1);

    return target > nowDate;
  } catch (err) {
    Logger.log('isFutureDate_() ERROR: ' + err);
    return false;
  }
}

/* ------------------------------------------
   GO ROGUE FEATURE
   ------------------------------------------ */

function apiCreateRogueAppointment(payload) {
  try {
    if (!CFG || !CFG.SHEET_ID) throw new Error('Configuration (CFG) not found.');
    if (!payload || typeof payload !== 'object') throw new Error('Invalid payload');

    Logger.log('[ROGUE] Creating exception appointment...');
    
    // 1. Generate ID
    const newId = getNextAppointmentId_();
    
    // 2. Grant Logic (Zip Code Mapping)
    // If ZIP = 14215 OR 14211 -> PFL. Else -> Incubator.
    const zip = String(payload['Zip Code'] || '').trim();
    const grant = (zip.includes('14215') || zip.includes('14211')) 
                  ? 'PFL' 
                  : 'Incubator';

    // 3. Date & Time Parsing
    const dateStr = payload['Date']; // Expecting MM/dd/yyyy from frontend
    let dayOfWeek = '';
    if (dateStr) {
      // Parse date to get Day of Week
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        const d = new Date(+parts[2], +parts[0] - 1, +parts[1]); // y, m-1, d
        dayOfWeek = Utilities.formatDate(d, Session.getScriptTimeZone(), 'EEEE');
      }
    }

    // 4. Construct Full Record
    const fullRecord = normalizePayload_({
      ...payload,
      [CFG.COLS.ID]: newId,
      [CFG.COLS.GRANT]: grant,
      [CFG.COLS.STATUS]: 'Reserved',
      [CFG.COLS.NEEDS_SCHED]: 'Yes',
      [CFG.COLS.DAY]: dayOfWeek,
      // Date, Time, Type, Scheduler are already in payload, but we ensure keys match CFG
      [CFG.COLS.DATE]: payload['Date'],
      [CFG.COLS.TIME]: payload['Time'],
      [CFG.COLS.AMPM]: payload['AM or PM'],
      [CFG.COLS.TYPE]: payload['Appointment Type'],
      [CFG.COLS.SCHEDULED_BY]: payload['Scheduled By'],
      [CFG.COLS.UPDATED_BY]: payload['Scheduled By'], // Set creator as updater too
      [CFG.COLS.CREATED_AT]: new Date()
    });

    // 5. Save to Sheet
    appendNewAppointment_(fullRecord);

    Logger.log(`[ROGUE] Success. ID: ${newId}`);
    return { ok: true, id: newId };

  } catch (err) {
    Logger.log('apiCreateRogueAppointment() ERROR: ' + err + '\n' + err.stack);
    return { ok: false, error: err.message || String(err) };
  }
}
/* ------------------------------------------
   CANCEL / RELEASE FLOW
   ------------------------------------------ */

/**
 * Cancels an appointment by clearing Client/Pet data and resetting status to 'Available'.
 * Records the cancellation reason.
 */
function apiCancelAppointment(appointmentId, reason, cancelledBy) {
  try {
    if (!appointmentId) throw new Error('Missing Appointment ID');
    if (!reason) throw new Error('Missing Cancellation Reason');

    // 1. Find the row
    const all = readAllAppointments_();
    const idx = all.findIndex(r => String(r[CFG.COLS.ID] || '').trim() === String(appointmentId).trim());
    if (idx < 0) throw new Error('Appointment not found');
    
    // 2. Validate Future Date (Server-side check)
    const rowDate = all[idx][CFG.COLS.DATE]; // Date object or string
    let dateStr = '';
    if (rowDate instanceof Date) dateStr = Utilities.formatDate(rowDate, Session.getScriptTimeZone(), 'MM/dd/yyyy');
    else dateStr = String(rowDate);
    
    if (!isFutureDate_(dateStr)) {
      throw new Error('Cannot cancel past appointments.');
    }

    // 3. Construct the "Wipe" Payload
    // We explicitly set these to empty strings to clear the cell
    const clearFields = {
      [CFG.COLS.FIRST]: '',
      [CFG.COLS.LAST]: '',
      [CFG.COLS.EMAIL]: '',
      [CFG.COLS.PHONE]: '',
      [CFG.COLS.ADDRESS]: '',
      [CFG.COLS.CITY]: '',
      [CFG.COLS.STATE]: '',
      [CFG.COLS.ZIP]: '',
      [CFG.COLS.TRANSPORT_NEEDED]: '',
      
      [CFG.COLS.PET_NAME]: '',
      [CFG.COLS.SPECIES]: '',
      [CFG.COLS.BREED_ONE]: '',
      [CFG.COLS.BREED_TWO]: '',
      [CFG.COLS.COLOR]: '',
      [CFG.COLS.COLOR_PATTERN]: '',
      [CFG.COLS.VACCINES]: '',
      [CFG.COLS.ADDITIONAL_SERVICES]: '',
      [CFG.COLS.PREV_RECORDS]: '',
      [CFG.COLS.VET_OFFICE]: '',
      [CFG.COLS.SCHEDULED_BY]: '', // Clear the scheduler
      
      // We assume Sex/Altered/Age/Weight/Notes/Allergies match header names in sheet 
      // or are mapped via helper if they differ. 
      // Based on your previous files, these keys are direct:
      'Sex': '',
      'Spayed or Neutered': '',
      'Age': '',
      'Weight': '',
      'Allergies or Sensitivities': '',
      'Notes': ''
    };

    // 4. Construct the "Update" Payload
    const updateFields = {
      [CFG.COLS.STATUS]: 'Available', // Reset to Available
      [CFG.COLS.NEEDS_SCHED]: 'No',
      [CFG.COLS.CANCELLATION_REASON]: reason,
      [CFG.COLS.UPDATED_BY]: cancelledBy,
      [CFG.COLS.UPDATED_AT]: new Date()
    };

    // Merge them
    const finalPayload = { ...clearFields, ...updateFields };

    // 5. Write to Sheet (Header row is 1, so row index is idx + 2)
    updateAppointmentRow_(idx + 2, finalPayload);
    
    Logger.log(`[CANCEL] ID ${appointmentId} released by ${cancelledBy}. Reason: ${reason}`);
    return { ok: true };

  } catch (err) {
    Logger.log('apiCancelAppointment() ERROR: ' + err);
    return { ok: false, error: err.message };
  }
}