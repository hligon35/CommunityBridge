const THERAPY_ROLE_LABELS = Object.freeze({
  therapist: 'ABA Tech',
  therapists: 'ABA Techs',
  amTherapist: 'AM ABA Tech',
  pmTherapist: 'PM ABA Tech',
  therapistDashboard: 'ABA Tech Dashboard',
});

const VALUE_LABELS = Object.freeze({
  therapist: THERAPY_ROLE_LABELS.therapist,
  therapists: THERAPY_ROLE_LABELS.therapists,
  bcba: 'BCBA',
  faculty: 'Faculty',
  parent: 'Parent',
  admin: 'Admin',
  campusadmin: 'Campus Admin',
  orgadmin: 'Org Admin',
  superadmin: 'Super Admin',
  teacher: 'Teacher',
  staff: 'Staff',
});

export { THERAPY_ROLE_LABELS };

export function getDisplayRoleLabel(role) {
  const value = String(role || '').trim();
  if (!value) return '';
  const normalized = value.toLowerCase().replace(/[^a-z]/g, '');
  if (VALUE_LABELS[normalized]) return VALUE_LABELS[normalized];
  if (value === 'AM Therapist') return THERAPY_ROLE_LABELS.amTherapist;
  if (value === 'PM Therapist') return THERAPY_ROLE_LABELS.pmTherapist;
  if (value === 'Therapist Dashboard') return THERAPY_ROLE_LABELS.therapistDashboard;
  return value;
}

export function getAssignmentRoleLabel(role) {
  if (role === 'AM Therapist') return THERAPY_ROLE_LABELS.amTherapist;
  if (role === 'PM Therapist') return THERAPY_ROLE_LABELS.pmTherapist;
  return getDisplayRoleLabel(role);
}