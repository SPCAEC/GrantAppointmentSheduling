/**
 * Grant Appointment Scheduling — Configuration
 * Central mapping for sheet and column names.
 */
const CFG = {
  // ─── Google Sheet Info ─────────────────────────────
  SHEET_ID: '110OZsGAWmndDo07REdR92XDBLwKgMvtfZ1oboU',
  GID: 0,
  SHEET_NAME: 'Appointments', // must match tab name exactly

  // ─── Column Header Mappings ─────────────────────────
  COLS: {
    ID: 'Appointment ID',               // unique per row
    TYPE: 'Appointment Type',
    STATUS: 'Appointment Status',
    DAY: 'Day of Week',
    DATE: 'Date',
    TIME: 'Time',
    AMPM: 'AM or PM',
    GRANT: 'Reserved for Grant',
    NEEDS_SCHED: 'Needs Scheduling',
    SCHEDULED_BY: 'Scheduled By',       // 🆕 new column added here

    // ─── Client Info ───────────────────────────
    FIRST: 'First Name',
    LAST: 'Last Name',
    EMAIL: 'Email',
    PHONE: 'Phone',
    ADDRESS: 'Address',
    CITY: 'City',
    STATE: 'State',
    ZIP: 'Zip Code',

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

    // ─── Optional Timestamp ────────────────────
    UPDATED_AT: 'Updated At'
  }
};