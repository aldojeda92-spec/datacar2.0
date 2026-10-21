/**
 * Utilidad centralizada para formatear títulos de vehículos en Leads (B2B, Email, Admin).
 * Garantiza la estructura consistente: "MARCA MODELO VERSION", evitando duplicaciones.
 */

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function formatLeadVehicleTitle(
  marca?: string,
  modelo?: string,
  vehiculoOVersion?: string
): string {
  const m = (marca || '').trim();
  const mod = (modelo || '').trim();
  let v = (vehiculoOVersion || '').trim();

  // Si no hay texto de versión/vehículo pero sí hay modelo, usamos el modelo
  if (!v && mod) {
    v = mod;
  }

  // Si v ya comienza con la marca, quitamos el prefijo temporalmente para normalizar
  if (m && v.toLowerCase().startsWith(m.toLowerCase())) {
    v = v.substring(m.length).trim();
    // Quitamos posibles guiones o separadores residuales al inicio
    v = v.replace(/^[-–—:]\s*/, '').trim();
  }

  // Si tenemos modelo y aún no está presente en v, lo agregamos al inicio
  if (mod) {
    const vLower = v.toLowerCase();
    const modLower = mod.toLowerCase();
    const regex = new RegExp(`(^|\\s|[—–-])${escapeRegex(modLower)}(\\s|[—–-]|$)`, 'i');
    if (!regex.test(vLower) && !vLower.startsWith(modLower)) {
      v = `${mod} ${v}`.trim();
    }
  }

  // Re-anexamos la marca al inicio si no está presente
  if (m) {
    if (!v.toLowerCase().startsWith(m.toLowerCase())) {
      v = `${m} ${v}`.trim();
    }
  }

  return v;
}
