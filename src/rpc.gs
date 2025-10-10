/**
 * Grant Appointment Scheduling — RPC Endpoints
 * Called from frontend via google.script.run
 */

/**
 * Returns the next available slots for a given appointment type.
 * @param {string} type - 'Surgery' or 'Wellness'
 * @param {number} limit - optional, defaults to 6
 */
function apiGetAvailableSlots(type, limit) {
  try {
    Logger.log(`apiGetAvailableSlots() called | type=${type} | limit=${limit}`);
    limit = limit || 6;

    if (!CFG || !CFG.SHEET_ID) throw new Error('Configuration (CFG) not found.');

    const slotsRaw = getAvailableSlots_(type, limit);
    if (!Array.isArray(slotsRaw)) throw new Error('No slot data returned from getAvailableSlots_()');

    const slots = slotsRaw.map(r => ({
      day: String(r[CFG.COLS.DAY] || ''),
      date: String(r[CFG.COLS.DATE] || ''),
      time: `${r[CFG.COLS.TIME] || ''} ${r[CFG.COLS.AMPM] || ''}`.trim(),
      grant: String(r[CFG.COLS.GRANT] || '')
    }));

    Logger.log(`apiGetAvailableSlots() returning ${slots.length} slots`);
    return { ok: true, slots };

  } catch (err) {
    Logger.log('apiGetAvailableSlots() ERROR: ' + err + '\n' + err.stack);
    return { ok: false, error: err.message || String(err) };
  }
}

/**
 * Books an appointment by writing client/pet info and marking as reserved.
 * @param {Object} payload - collected form data
 * @param {string} type - appointment type
 * @param {string} date - date of slot selected
 * @param {string} time - time of slot selected
 */
function apiBookAppointment(payload, type, date, time) {
  try {
    Logger.log(`apiBookAppointment() called | type=${type} | date=${date} | time=${time}`);

    if (!CFG || !CFG.SHEET_ID) throw new Error('Configuration (CFG) not found.');

    const data = readAllAppointments_();
    if (!Array.isArray(data) || !data.length) throw new Error('No appointment data found.');

    const rowIndex = data.findIndex(r =>
      String(r[CFG.COLS.TYPE]).trim().toLowerCase() === String(type).trim().toLowerCase() &&
      String(r[CFG.COLS.DATE]).trim() === String(date).trim() &&
      `${r[CFG.COLS.TIME]} ${r[CFG.COLS.AMPM]}`.trim() === String(time).trim()
    ) + 2;

    if (rowIndex < 2) throw new Error(`Appointment slot not found for ${type} ${date} ${time}`);

    payload[CFG.COLS.STATUS] = 'Reserved';
    payload[CFG.COLS.NEEDS_SCHED] = 'Yes';

    updateAppointmentRow_(rowIndex, payload);

    Logger.log(`Appointment row ${rowIndex} successfully updated.`);
    return { ok: true };

  } catch (err) {
    Logger.log('apiBookAppointment() ERROR: ' + err + '\n' + err.stack);
    return { ok: false, error: err.message || String(err) };
  }
}