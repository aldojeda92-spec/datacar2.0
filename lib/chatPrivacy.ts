/**
 * Utilidades de Privacidad y Censura para el Chat Online por Marca de DATACAR.
 *
 * Reglas de negocio:
 * 1. El usuario deja Nombre y Celular para iniciar un chat.
 * 2. La concesionaria SOLO puede ver el Nombre del usuario en el chat, NUNCA su celular
 *    (para proteger al usuario de spam; si quiere ser contactado por teléfono/WhatsApp,
 *    debe dejar un Lead formal).
 * 3. El chat censura automáticamente cualquier envío de números de celulares o enlaces de
 *    WhatsApp dentro de los mensajes, tanto del usuario como de la concesionaria.
 */

export interface CensorResult {
  sanitizedText: string;
  hadPhone: boolean;
}

const CENSOR_BADGE = '[🔒 Número oculto por privacidad]';

// Palabras numéricas comunes en español para detectar números escritos en letras (ej: "cero nueve ocho uno...")
const NUMBER_WORDS_REGEX = /\b(?:cero|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa)(?:[\s,.-]+(?:y[\s,.-]+)?(?:cero|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa)){4,}\b/gi;

/**
 * Censura números de teléfono (móviles de Paraguay 09xx, +595, secuencias de 6+ dígitos
 * incluso separadas por espacios, puntos o guiones, enlaces wa.me y números escritos en palabras).
 * Permite años (ej. 2025, 2026) o montos cortos de 1 a 5 dígitos siempre que no formen un teléfono.
 */
export function censorPhoneNumbers(rawText: string): CensorResult {
  if (!rawText || typeof rawText !== 'string') {
    return { sanitizedText: '', hadPhone: false };
  }

  let text = rawText;
  let hadPhone = false;

  // 1. Censurar enlaces de WhatsApp (wa.me, api.whatsapp.com, whatsapp.com)
  const waLinkRegex = /(?:https?:\/\/)?(?:www\.)?(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)\/[^\s]+/gi;
  if (waLinkRegex.test(text)) {
    hadPhone = true;
    text = text.replace(waLinkRegex, CENSOR_BADGE);
  }

  // 2. Censurar formatos internacionales +595 o 00595 seguidos de dígitos
  const pyIntlRegex = /(?:\+?595|00595)[\s.\-()]*9?[\d\s.\-()]{6,14}\d/g;
  if (pyIntlRegex.test(text)) {
    hadPhone = true;
    text = text.replace(pyIntlRegex, CENSOR_BADGE);
  }

  // 3. Censurar celulares de Paraguay que empiezan con 09 (ej: 0981 123 456, 0971-222-333, 0981123456)
  // o sin el 0 inicial (ej: 981 123 456, 971 222 333, 991-123456)
  const pyMobileRegex = /\b0?9[6789]\d[\s.\-()]*\d{2,3}[\s.\-()]*\d{2,4}\b/g;
  if (pyMobileRegex.test(text)) {
    hadPhone = true;
    text = text.replace(pyMobileRegex, CENSOR_BADGE);
  }

  // 4. Censurar cualquier secuencia que acumule 7 o más dígitos (incluso separados por espacios, guiones o puntos)
  // Ej: "0 9 8 1 2 3 4 5 6" o "21 600 123"
  const genericDigitSequenceRegex = /\d(?:[\s.\-()]*\d){6,}/g;
  if (genericDigitSequenceRegex.test(text)) {
    hadPhone = true;
    text = text.replace(genericDigitSequenceRegex, CENSOR_BADGE);
  }

  // 5. Censurar secuencias de 6 dígitos que parezcan teléfono sin prefijo (salvo si está precedido por USD / US$ / $ / Gs)
  const sixDigitsRegex = /(?<!(?:US\$|USD|\$|Gs\.?)\s*)\b\d{3}[\s.\-]+\d{3}\b/gi;
  if (sixDigitsRegex.test(text)) {
    hadPhone = true;
    text = text.replace(sixDigitsRegex, CENSOR_BADGE);
  }

  // 6. Censurar números telefónicos escritos en palabras ("cero nueve ocho uno...")
  if (NUMBER_WORDS_REGEX.test(text)) {
    hadPhone = true;
    text = text.replace(NUMBER_WORDS_REGEX, CENSOR_BADGE);
  }

  return {
    sanitizedText: text,
    hadPhone,
  };
}

/**
 * Valida que el celular ingresado al registrarse en el chat sea un número válido (mínimo 8 dígitos).
 */
export function isValidChatPhone(phone: string): boolean {
  const digits = (phone || '').replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

export interface ChatOnlineConfig {
  enabled?: boolean;
  scheduleEnabled?: boolean;
  startTime?: string; // Formato "HH:mm" (ej: "07:30")
  endTime?: string;   // Formato "HH:mm" (ej: "22:00")
}

/**
 * Obtiene la hora actual en zona horaria de Paraguay (America/Asuncion) en minutos desde las 00:00
 * y también como string legible "HH:mm".
 */
export function getParaguayCurrentTime(): { minutesOfDay: number; formatted: string } {
  try {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Asuncion',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(now);
    const h = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
    const m = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
    const safeH = isNaN(h) ? now.getHours() : h % 24;
    const safeM = isNaN(m) ? now.getMinutes() : m;
    return {
      minutesOfDay: safeH * 60 + safeM,
      formatted: `${String(safeH).padStart(2, '0')}:${String(safeM).padStart(2, '0')}`,
    };
  } catch {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    return {
      minutesOfDay: h * 60 + m,
      formatted: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
    };
  }
}

function parseTimeMinutes(hhmm: string, fallbackMinutes: number): number {
  if (!hhmm || typeof hhmm !== 'string') return fallbackMinutes;
  const [hStr, mStr] = hhmm.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return fallbackMinutes;
  return Math.max(0, Math.min(23 * 60 + 59, h * 60 + m));
}

/**
 * Determina si la función de Chat Online debe mostrarse activa en la web pública según:
 * 1) El interruptor general (`enabled`)
 * 2) El rango horario programado (`scheduleEnabled`, `startTime`, `endTime`) en hora de Paraguay.
 */
export function isChatOnlineCurrentlyActive(config?: ChatOnlineConfig | null): {
  isActive: boolean;
  isWithinSchedule: boolean;
  currentTimePy: string;
} {
  const { minutesOfDay, formatted } = getParaguayCurrentTime();
  if (!config) {
    return { isActive: true, isWithinSchedule: true, currentTimePy: formatted };
  }

  const masterEnabled = config.enabled !== false;
  if (!config.scheduleEnabled) {
    return {
      isActive: masterEnabled,
      isWithinSchedule: true,
      currentTimePy: formatted,
    };
  }

  const startMin = parseTimeMinutes(config.startTime || '07:30', 7 * 60 + 30);
  const endMin = parseTimeMinutes(config.endTime || '22:00', 22 * 60);

  let within = true;
  if (startMin <= endMin) {
    // Rango diurno normal (ej. 07:30 a 22:00)
    within = minutesOfDay >= startMin && minutesOfDay <= endMin;
  } else {
    // Rango que cruza medianoche
    within = minutesOfDay >= startMin || minutesOfDay <= endMin;
  }

  return {
    isActive: masterEnabled && within,
    isWithinSchedule: within,
    currentTimePy: formatted,
  };
}
