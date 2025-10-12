/**
 * Grant Appointment Scheduling — Configuration
 * Central mapping for sheet and column names.
 */
const CFG = {
  // Google Sheet info
  SHEET_ID: '110OZsGAWmndDo07REdKQIrdR92XDBLwKgMvtfZ1oboU',
  GID: 0,
  SHEET_NAME: 'Appointments', // Must match tab name exactly

  // Column headers — must match row 1 headers in the sheet exactly
  COLS: {
    ID: 'Appointment ID',       // ← add this line
    TYPE: 'Appointment Type',
    STATUS: 'Appointment Status',
    DAY: 'Day of Week',
    DATE: 'Date',
    TIME: 'Time',
    AMPM: 'AM or PM',
    GRANT: 'Reserved for Grant',
    NEEDS_SCHED: 'Needs Scheduling'
  }
};