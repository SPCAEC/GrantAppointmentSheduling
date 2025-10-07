/**
 * Grant Appointment Scheduling — Configuration
 */
const CFG = {
  SHEET_ID: '1SR6APQ0HotEIBp9Qi4naYHvVsmCEQr0g12hI4Ed1zOs',
  GID: 1652297798,
  SHEET_NAME: 'Appointments', // Change if needed

  // Core columns (exact header names in your sheet)
  COLS: {
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