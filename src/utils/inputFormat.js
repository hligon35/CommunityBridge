export function formatPhoneInput(input) {
  let digits = String(input || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  digits = digits.slice(0, 10);

  if (!digits) return '';
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function normalizeWebsiteInput(input, { presetScheme = false } = {}) {
  const raw = String(input || '');
  const trimmed = raw.trim();

  if (!trimmed) return presetScheme ? 'https://' : '';
  if (/^https:\/\//i.test(trimmed)) return `https://${trimmed.slice(8)}`;
  if (/^http:\/\//i.test(trimmed)) return `https://${trimmed.slice(7)}`;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, '')}`;
}

export function presetWebsiteInput(input) {
  return normalizeWebsiteInput(input, { presetScheme: true });
}