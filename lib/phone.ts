// lib/phone.ts
// Normaliza celulares paraguayos antes de validar. El regex estricto `^09\d{8}$`
// del LeadModal rechazaba números perfectamente válidos escritos con espacios,
// guiones o prefijo internacional ("0981 234 567", "+595 981 234567",
// "595981234567") — fricción pura en el formulario de lead.

const PY_MOBILE = /^09\d{8}$/;

export interface NormalizedPhone {
  /** Formato canónico 09XXXXXXXX si se pudo interpretar; si no, los dígitos crudos. */
  value: string;
  valid: boolean;
}

export function normalizePhonePY(raw: string): NormalizedPhone {
  if (!raw) return { value: '', valid: false };

  // Solo dígitos (descarta +, espacios, guiones, paréntesis).
  let digits = raw.replace(/\D/g, '');

  // Prefijo internacional Paraguay: 595 981 234567 -> 0981234567
  if (digits.startsWith('595')) digits = '0' + digits.slice(3);

  // Sin el 0 inicial: 981234567 -> 0981234567
  if (digits.length === 9 && digits.startsWith('9')) digits = '0' + digits;

  return { value: digits, valid: PY_MOBILE.test(digits) };
}

export function isValidPhonePY(raw: string): boolean {
  return normalizePhonePY(raw).valid;
}
