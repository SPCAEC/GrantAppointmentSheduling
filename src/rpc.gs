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

    const slotsRaw = getAvailableSlots_(type, limit);
    if (!Array.isArray(slotsRaw)) throw new Error('No slot data returned from getAvailableSlots_()');

    // each slot now carries its Appointment ID
    const slots = slotsRaw.map(r => ({
      id:   String(r[CFG.COLS.ID] || ''), // unique Appointment ID
      day:  String(r[CFG.COLS.DAY] || ''),
      date: String(r[CFG.COLS.DATE] || ''),
      time: `${r[CFG.COLS.TIME] || ''} ${r[CFG.COLS.AMPM] || ''}`.trim(),
      grant: String(r[CFG.COLS.GRANT] || '')
    }));

    Logger.log(`apiGetAvailableSlots() returning ${slots.length} slots`);
    return { ok: true, slots };

  } catch (err) {
    Logger.log('apiGetAvailableSlots() ERROR: ' + err);
    return { ok: false, error: err.message || String(err) };
  }
}


/**
 * Books an appointment by unique Appointment ID.
 * If ID not provided, falls back to date/time matching (legacy safety).
 */
function apiBookAppointment(payload, type, date, time, appointmentId) {
  try {
    Logger.log(`apiBookAppointment() called | type=${type} | date=${date} | time=${time} | id=${appointmentId}`);
    if (!CFG || !CFG.SHEET_ID) throw new Error('Configuration (CFG) not found.');

    const data = readAllAppointments_();
    if (!Array.isArray(data) || !data.length) throw new Error('No appointment data found.');

    let rowIndex = -1;

    // ─── Prefer Appointment ID if provided ──────────────
    if (appointmentId) {
      rowIndex = data.findIndex(r => String(r[CFG.COLS.ID]).trim() === String(appointmentId).trim()) + 2;
      Logger.log(`Matched by Appointment ID → rowIndex=${rowIndex}`);
    }

    // ─── Fallback legacy match by type/date/time ──────────────
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

    // ─── Apply updates ──────────────
    payload[CFG.COLS.STATUS] = 'Reserved';
    payload[CFG.COLS.NEEDS_SCHED] = 'Yes';

    updateAppointmentRow_(rowIndex, payload);
    Logger.log(`Appointment row ${rowIndex} successfully updated (ID=${appointmentId || 'legacy'}).`);
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
  const props = PropertiesService.getScriptProperties();
  const canine = (props.getProperty('VACCINE_LIST_CANINE') || '').split(',').map(s => s.trim()).filter(Boolean);
  const feline = (props.getProperty('VACCINE_LIST_FELINE') || '').split(',').map(s => s.trim()).filter(Boolean);
  return { ok: true, canine, feline };
}