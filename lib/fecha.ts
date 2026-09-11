// lib/fecha.ts
// Formateo tolerante de fechas que pueden llegar como Timestamp de Firestore
// (instancia con .toDate()), como objeto plano {seconds} (tras cruzar el
// limite Server -> Client Component), como string ISO o como Date.

export function toDateSafe(value: unknown): Date | null {
  if (!value) return null;
  try {
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    if (typeof value === 'string' || typeof value === 'number') {
      const d = new Date(value);
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof value !== 'object') return null;
    if (typeof (value as { toDate?: unknown }).toDate === 'function') {
      return (value as { toDate: () => Date }).toDate();
    }
    const secs =
      (value as { seconds?: number }).seconds ??
      (value as { _seconds?: number })._seconds;
    if (typeof secs === 'number') return new Date(secs * 1000);
  } catch {
    /* fall through */
  }
  return null;
}

// "12 de marzo de 2026" -> por defecto; formato corto opcional.
export function formatFechaLarga(value: unknown): string | null {
  const d = toDateSafe(value);
  if (!d) return null;
  return d.toLocaleDateString('es-PY', { day: 'numeric', month: 'long', year: 'numeric' });
}
