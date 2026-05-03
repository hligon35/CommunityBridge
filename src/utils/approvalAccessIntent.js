import { Platform } from 'react-native';

export const APPROVAL_ACCESS_INTENT_KEY = 'bb_post_login_redirect_v1';
export const APPROVAL_ACCESS_INTENT_VALUE = 'approval-staff-management';

export function consumeApprovalAccessIntent() {
  if (Platform.OS !== 'web') return null;
  try {
    const value = String(globalThis?.localStorage?.getItem?.(APPROVAL_ACCESS_INTENT_KEY) || '').trim();
    if (!value) return null;
    globalThis?.localStorage?.removeItem?.(APPROVAL_ACCESS_INTENT_KEY);
    return value;
  } catch (_) {
    return null;
  }
}

export function getApprovalAccessNavigationParams(intent) {
  if (String(intent || '').trim() !== APPROVAL_ACCESS_INTENT_VALUE) return null;
  // The onboarding approval link should drop the newly approved Super Admin
  // into the existing Admin -> Staff Management path after password setup.
  return { screen: 'Controls', params: { screen: 'ManagePermissions' } };
}
