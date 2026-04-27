import { PROGRAM_TYPES, normalizeProgramType } from './models';

const BASE_LABELS = Object.freeze({
  dashboard: 'Dashboard',
  staffDashboard: 'Therapist Dashboard',
  myClass: 'My Class',
  myChild: 'My Child',
  familySection: 'Your Family',
  careTeam: 'My Care Team',
  facultyDirectory: 'Faculty Directory',
  facultyDetail: 'Faculty',
  resources: 'Parent Resources',
  resourcesValueFamily: 'Help & support',
  resourcesValueStaff: 'Staff resources',
});

const BASE_FEATURE_FLAGS = Object.freeze({
  programSwitcher: true,
  campusSwitcher: true,
  programDirectory: false,
  campusDirectory: false,
  programDocuments: false,
  campusDocuments: false,
  programBilling: false,
  attendanceModule: false,
});

const BASE_DASHBOARD_PRESET = Object.freeze({
  family: ['next-session', 'mood-score', 'progress-report', 'items-needed', 'care-team', 'billing', 'resources'],
  staff: ['next-session', 'progress-report', 'care-team', 'items-needed', 'resources'],
});

const PROGRAM_TYPE_CONFIGS = Object.freeze({
  [PROGRAM_TYPES.CENTER_BASED_ABA]: {
    labels: {
      ...BASE_LABELS,
      staffDashboard: 'Clinical Dashboard',
      myClass: 'My Caseload',
      careTeam: 'My Care Team',
      facultyDirectory: 'Care Team Directory',
      facultyDetail: 'Care Team Member',
      resources: 'Family Resources',
    },
    dashboardPreset: BASE_DASHBOARD_PRESET,
    childProfileMode: {
      mode: 'family',
      entityLabel: 'child',
      collectionLabel: 'children',
      profileTitle: 'My Child',
      profileSummaryTitle: 'Family Overview',
    },
    featureFlags: {
      ...BASE_FEATURE_FLAGS,
      programDocuments: true,
      campusDocuments: true,
      campusDirectory: true,
      programBilling: true,
      attendanceModule: true,
    },
  },
  [PROGRAM_TYPES.EARLY_INTERVENTION_ACADEMY]: {
    labels: {
      ...BASE_LABELS,
      staffDashboard: 'Classroom Dashboard',
      myClass: 'My Classroom',
      myChild: 'My Student',
      familySection: 'Your Students',
      careTeam: 'School Team',
      facultyDirectory: 'Faculty Directory',
      facultyDetail: 'Faculty Member',
      resources: 'Family Resources',
    },
    dashboardPreset: {
      family: ['next-session', 'progress-report', 'mood-score', 'items-needed', 'care-team', 'resources'],
      staff: ['next-session', 'progress-report', 'care-team', 'items-needed', 'resources'],
    },
    childProfileMode: {
      mode: 'student',
      entityLabel: 'student',
      collectionLabel: 'students',
      profileTitle: 'My Student',
      profileSummaryTitle: 'Student Overview',
    },
    featureFlags: {
      ...BASE_FEATURE_FLAGS,
      programDocuments: true,
      campusDocuments: true,
      campusDirectory: true,
      programBilling: true,
      attendanceModule: true,
    },
  },
  [PROGRAM_TYPES.CORPORATE]: {
    labels: {
      ...BASE_LABELS,
      dashboard: 'Operations Dashboard',
      staffDashboard: 'Operations Dashboard',
      myClass: 'Program Operations',
      myChild: 'Managed Profiles',
      familySection: 'Managed Profiles',
      careTeam: 'Program Contacts',
      facultyDirectory: 'Staff Directory',
      facultyDetail: 'Staff Member',
      resources: 'Program Resources',
      resourcesValueFamily: 'Operational support',
      resourcesValueStaff: 'Operational support',
    },
    dashboardPreset: {
      family: ['progress-report', 'care-team', 'resources'],
      staff: ['progress-report', 'care-team', 'resources'],
    },
    childProfileMode: {
      mode: 'operations',
      entityLabel: 'profile',
      collectionLabel: 'profiles',
      profileTitle: 'Managed Profiles',
      profileSummaryTitle: 'Program Overview',
    },
    featureFlags: {
      ...BASE_FEATURE_FLAGS,
      programDirectory: true,
      campusDirectory: true,
      programDocuments: true,
      campusDocuments: true,
    },
  },
});

const DEFAULT_PROGRAM_CONFIG = PROGRAM_TYPE_CONFIGS[PROGRAM_TYPES.CENTER_BASED_ABA];

export function getProgramTypeConfig(programType) {
  const normalized = normalizeProgramType(programType);
  return PROGRAM_TYPE_CONFIGS[normalized] || DEFAULT_PROGRAM_CONFIG;
}