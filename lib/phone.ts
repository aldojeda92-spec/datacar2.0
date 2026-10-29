// lib/phone.ts
// Reglas estrictas de validación de telefonía móvil para Paraguay (prefijo visual +595):
// 1. Debe tener exactamente 9 dígitos.
// 2. Debe empezar con '9' y continuar con 6, 7, 8 o 9 (operadoras: 096x, 097x, 098x, 099x).

export const PY_PHONE_REGEX = /^9[6-9]\d{7}$/;

export interface NormalizedPhone {
  /** Formato de 9 dígitos para inputs y visualización (ej: 981234567) */
  value: string;
  /** Formato canónico paraguayo con 0 inicial (ej: 0981234567) para almacenar en base de datos */
  canonical: string;
  valid: boolean;
  error?: string;
}

/**
 * Sanitiza la entrada en tiempo real:
 * - Filtra caracteres no numéricos.
 * - Si pegan con prefijo '595', lo remueve.
 * - Si pegan con el '0' inicial (ej: 0981...), lo remueve para adaptarse al prefijo visual +595.
 * - Limita estrictamente a 9 dígitos máximos.
 */
export function sanitizePhonePY(raw: string): string {
  if (!raw) return '';
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('595')) digits = digits.slice(3);
  if (digits.startsWith('09')) digits = digits.slice(1);
  return digits.slice(0, 9);
}

/**
 * Valida que el número de 9 dígitos cumpla exactamente:
 * - Largo: 9 dígitos exactos (ni más ni menos).
 * - Prefijo: empieza con 9 y segundo dígito es 6, 7, 8 o 9.
 * Si es inválido, arroja el mensaje exacto solicitado: "Tenés que cargar un número telefónico válido".
 */
export function validatePhonePY(raw: string): NormalizedPhone {
  const digits = sanitizePhonePY(raw);
  const INVALID_MSG = 'Tenés que cargar un número telefónico válido';

  if (!digits || digits.length !== 9 || !/^9[6-9]/.test(digits) || !PY_PHONE_REGEX.test(digits)) {
    return { value: digits, canonical: '0' + digits, valid: false, error: INVALID_MSG };
  }

  return { value: digits, canonical: '0' + digits, valid: true };
}

export function normalizePhonePY(raw: string): NormalizedPhone {
  return validatePhonePY(raw);
}

export function isValidPhonePY(raw: string): boolean {
  return validatePhonePY(raw).valid;
}
