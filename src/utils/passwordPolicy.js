export function getPasswordPolicyError(value) {
  const password = String(value || '');
  if (!password) return '';
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(password)) return 'Password must include at least 1 uppercase letter.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must include at least 1 special character.';
  return '';
}

export function isInviteAccessCode(value) {
  return /^\d{6}$/.test(String(value || '').trim());
}