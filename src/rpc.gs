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
/**
 * Search existing appointments by exact (case-insensitive) match on any of:
 * - date (MM/dd/yyyy string)
 * - client (first, last, or "first last")
 * - pet
 */
function apiSearchAppointments(query) {
  try {
    const { date, client, pet } = query || {};
    const rows = searchAppointments_(date, client, pet).map(r => ({
      id: String(r[CFG.COLS.ID] || ''),
      date: String(r[CFG.COLS.DATE] || ''),
      time: `${r[CFG.COLS.TIME] || ''} ${r[CFG.COLS.AMPM] || ''}`.trim(),
      status: String(r[CFG.COLS.STATUS] || ''),
      firstName: String(r[CFG.COLS.FIRST] || ''),
      lastName: String(r[CFG.COLS.LAST] || ''),
      email: String(r[CFG.COLS.EMAIL] || ''),
      phone: String(r[CFG.COLS.PHONE] || ''),
      address: String(r[CFG.COLS.ADDRESS] || ''),
      city: String(r[CFG.COLS.CITY] || ''),
      state: String(r[CFG.COLS.STATE] || ''),
      zip: String(r[CFG.COLS.ZIP] || ''),
      petName: String(r[CFG.COLS.PET_NAME] || ''),
      species: String(r[CFG.COLS.SPECIES] || ''),
      breedOne: String(r[CFG.COLS.BREED_ONE] || ''),
      breedTwo: String(r[CFG.COLS.BREED_TWO] || ''),
      color: String(r[CFG.COLS.COLOR] || ''),
      colorPattern: String(r[CFG.COLS.COLOR_PATTERN] || ''),
      sex: String(r['Sex'] || ''), // if you have a COLS.SEX, swap in
      altered: String(r['Spayed or Neutered'] || ''), // same note
      age: String(r['Age'] || ''),
      vaccines: String(r[CFG.COLS.VACCINES] || ''),
      additionalServices: String(r[CFG.COLS.ADDITIONAL_SERVICES] || ''),
      allergies: String(r['Allergies or Sensitivities'] || ''),
      weight: String(r['Weight'] || ''),
      notes: String(r['Notes'] || ''),
      prevRecords: String(r[CFG.COLS.PREV_RECORDS] || ''),
      vetOffice: String(r[CFG.COLS.VET_OFFICE] || ''),
      editable: isFutureDate_(String(r[CFG.COLS.DATE] || ''))
    }));
    return { ok: true, rows };
  } catch (err) {
    Logger.log('apiSearchAppointments() ERROR: ' + err + '\n' + err.stack);
    return { ok: false, error: err.message || String(err) };
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