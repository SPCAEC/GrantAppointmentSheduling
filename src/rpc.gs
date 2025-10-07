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
    limit = limit || 6;
    const slots = getAvailableSlots_(type, limit).map(r => ({
      day: r[CFG.COLS.DAY],
      date: r[CFG.COLS.DATE],
      time: `${r[CFG.COLS.TIME]} ${r[CFG.COLS.AMPM]}`,
      grant: r[CFG.COLS.GRANT]
    }));
    return { ok: true, slots };
  } catch (err) {
    return { ok: false, error: err.message };
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
    const sh = getSheet_();
    const data = readAllAppointments_();
    const headers = Object.keys(data[0]);
    const rowIndex = data.findIndex(r =>
      r[CFG.COLS.TYPE] === type &&
      r[CFG.COLS.DATE] === date &&
      `${r[CFG.COLS.TIME]} ${r[CFG.COLS.AMPM]}` === time
    ) + 2; // +2 because headers + 1-based index

    if (rowIndex < 2) throw new Error('Appointment slot not found');

    // Merge payload + updates
    payload[CFG.COLS.STATUS] = 'Reserved';
    payload[CFG.COLS.NEEDS_SCHED] = 'Yes';

    updateAppointmentRow_(rowIndex, payload);

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}