// lib/dealerships.ts
// Utilidades centralizadas para sanitizar y resolver nombres de concesionarias.
// Evita que marcas internas como "A DESIGNAR" o "A designar (Central DATACAR)"
// se muestren en botones, títulos y textos orientados al usuario.

/**
 * Limpia y valida el nombre comercial de una concesionaria.
 * Si es nulo, vacío o contiene variantes de "designar", retorna cadena vacía.
 */
export function sanitizeDealershipName(name?: string | null): string {
  if (!name) return '';
  const trimmed = name.trim();
  if (trimmed.toLowerCase().includes('designar')) return '';
  return trimmed;
}

/**
 * Genera el texto del CTA variable para hablar con la concesionaria.
 * Ej: "Hablar con Diesa" o fallback "Hablar con la Concesionaria".
 */
export function formatHablarCon(dealershipName?: string | null): string {
  const clean = sanitizeDealershipName(dealershipName);
  return clean ? `Hablar con ${clean}` : 'Hablar con la Concesionaria';
}

/**
 * Resuelve la concesionaria de un modelo inspeccionando sus versiones.
 * Si la versión base no tiene concesionaria válida, busca en las versiones hermanas.
 */
export function resolveModelDealership(
  versions: Array<{ concesionaria?: string | null }>,
  preferredVersion?: { concesionaria?: string | null } | null
): string {
  const preferred = sanitizeDealershipName(preferredVersion?.concesionaria);
  if (preferred) return preferred;

  for (const v of versions) {
    const clean = sanitizeDealershipName(v.concesionaria);
    if (clean) return clean;
  }
  return '';
}
