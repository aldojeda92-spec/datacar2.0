// lib/combustible.ts
// Normaliza el campo specs.combustible de `versions`, cargado en distintos
// momentos (alta manual, inyector CSV, importaciones masivas) con variantes
// de tildes/idioma ("Diesel" / "Diésel", "Gasolina" / "Nafta", "Eléctrico" /
// "EV"). Mismo patrón que lib/carroceria.ts: usar SIEMPRE esta función al leer
// specs.combustible desde Firestore -- nunca comparar, filtrar ni agrupar por
// el valor crudo.

const COMBUSTIBLE_CANONICAL: Record<string, string> = {
  // Combustión interna
  'NAFTA': 'NAFTA',
  'NAFTERO': 'NAFTA',
  'GASOLINA': 'NAFTA',
  'GASOLINE': 'NAFTA',
  'BENCINA': 'NAFTA',
  'DIESEL': 'DIESEL',
  'DIÉSEL': 'DIESEL',
  'GASOIL': 'DIESEL',
  'GAS OIL': 'DIESEL',
  'FLEX': 'FLEX',
  'FLEXFUEL': 'FLEX',
  'FLEX FUEL': 'FLEX',
  'NAFTA/ETANOL': 'FLEX',
  // Electrificados
  'EV': 'EV',
  'ELÉCTRICO': 'EV',
  'ELECTRICO': 'EV',
  'ELÉCTRICO PURO': 'EV',
  'ELECTRICO PURO': 'EV',
  'BEV': 'EV',
  'HEV': 'HEV',
  'HÍBRIDO': 'HEV',
  'HIBRIDO': 'HEV',
  'HÍBRIDO CONVENCIONAL': 'HEV',
  'HIBRIDO CONVENCIONAL': 'HEV',
  'FULL HYBRID': 'HEV',
  'MHEV': 'MHEV',
  'MICRO HÍBRIDO': 'MHEV',
  'MICRO HIBRIDO': 'MHEV',
  'MILD HYBRID': 'MHEV',
  'PHEV': 'PHEV',
  'HÍBRIDO ENCHUFABLE': 'PHEV',
  'HIBRIDO ENCHUFABLE': 'PHEV',
  'PLUG-IN HYBRID': 'PHEV',
  'REEV': 'REEV',
  'EREV': 'REEV',
  'RANGO EXTENDIDO': 'REEV',
  'RANGE EXTENDER': 'REEV',
};

// Nombre legible para mostrar junto al código (tooltips, filtros, fichas).
const COMBUSTIBLE_LABELS: Record<string, string> = {
  'NAFTA': 'Nafta',
  'DIESEL': 'Diésel',
  'FLEX': 'Flex (nafta/etanol)',
  'EV': 'Eléctrico puro',
  'HEV': 'Híbrido convencional',
  'MHEV': 'Micro híbrido',
  'PHEV': 'Híbrido enchufable',
  'REEV': 'Eléctrico de rango extendido',
};

export const normalizeCombustible = (raw: string | undefined | null): string => {
  const clean = (raw || '').trim().toUpperCase();
  if (!clean) return '';
  return COMBUSTIBLE_CANONICAL[clean] || clean;
};

// Devuelve el nombre legible; si el código no está mapeado, cae al código tal cual.
export const combustibleLabel = (raw: string | undefined | null): string => {
  const canon = normalizeCombustible(raw);
  if (!canon) return '';
  return COMBUSTIBLE_LABELS[canon] || canon;
};
