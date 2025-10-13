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
 */
function apiBookAppointment(payload, type, date, time, appointmentId) {
  try {
    Logger.log(`apiBookAppointment() | type=${type} | date=${date} | time=${time} | id=${appointmentId}`);
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
    updateAppointmentRow_(rowIndex, payload);

    Logger.log(`apiBookAppointment() → Updated row ${rowIndex} successfully.`);
    return { ok: true };
  } catch (err) {
    Logger.log('apiBookAppointment() ERROR: ' + err + '\n' + err.stack);
    return { ok: false, error: err.message || String(err) };
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
 * The link is stored in Script Properties under key RECORD_UPLOAD_LINK.
 */
function apiSendVetRecordsRequest(clientEmail, folderUrl, firstName, petName) {
  try {
    if (!clientEmail) return { ok: false, error: 'Missing client email' };

    // Get the upload link from script properties
    const props = PropertiesService.getScriptProperties();
    const uploadLink = props.getProperty('RECORD_UPLOAD_LINK');

    if (!uploadLink) {
      throw new Error('Missing Script Property: RECORD_UPLOAD_LINK');
    }

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