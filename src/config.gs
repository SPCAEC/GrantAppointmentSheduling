/**
 * Grant Appointment Scheduling — Configuration
 * Central mapping for sheet and column names.
 */
const CFG = {
  // ─── Google Sheet Info ─────────────────────────────
  SHEET_ID: '110OZsGAWmndDo07REdKQIrdR92XDBLwKgMvtfZ1oboU',
  GID: 0,
  SHEET_NAME: 'Appointments', // must match tab name exactly

  // ─── Script Properties ─────────────────────────────
  EMAIL_PROPS: {
    CHANGE_ALERT: 'APPOINTMENT_CHANGE_EMAIL' // property name storing notification recipients
  },

  // ─── Column Header Mappings ─────────────────────────
  COLS: {
    ID: 'Appointment ID',               
    TYPE: 'Appointment Type',
    STATUS: 'Appointment Status',
    DAY: 'Day of Week',
    DATE: 'Date',
    TIME: 'Time',
    AMPM: 'AM or PM',
    GRANT: 'Reserved for Grant',
    NEEDS_SCHED: 'Needs Scheduling',
    SCHEDULED_BY: 'Scheduled By',
    UPDATED_BY: 'Updated by',

    // ─── Client Info ───────────────────────────
    FIRST: 'First Name',
    LAST: 'Last Name',
    EMAIL: 'Email',
    PHONE: 'Phone',
    ADDRESS: 'Address',
    CITY: 'City',
    STATE: 'State',
    ZIP: 'Zip Code',
    TRANSPORT_NEEDED: 'Transportation Needed',

    // ─── Pet Info ──────────────────────────────
    PET_NAME: 'Pet Name',
    SPECIES: 'Species',
    BREED_ONE: 'Breed One',
    BREED_TWO: 'Breed Two',
    COLOR: 'Color',
    COLOR_PATTERN: 'Color Pattern',
    VACCINES: 'Vaccines Needed',
    ADDITIONAL_SERVICES: 'Additional Services',
    PREV_RECORDS: 'Previous Vet Records',
    VET_OFFICE: 'Vet Office Name',
    CANCELLATION_REASON: 'Cancellation Reason',

    // ─── Optional Timestamp ────────────────────
    UPDATED_AT: 'Updated At'
  },

  // ─── Helpers ────────────────────────────────────────
  getTimestamp: () => new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })
};