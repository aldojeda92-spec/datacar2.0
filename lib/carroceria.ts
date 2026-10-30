// lib/carroceria.ts
// Normaliza el campo tipo_carroceria de `models`, cargado en distintos
// momentos (alta manual, inyector CSV, importaciones masivas) con variantes
// de tildes/mayúsculas ("Pickup" / "PICKUP", "SEDAN" / "SEDÁN") y categorías
// de estilo demasiado específicas para el comprador promedio ("SUV Coupé",
// "Gran Coupé", "MPV"). Usar SIEMPRE esta función al leer tipo_carroceria
// desde Firestore -- nunca comparar o agrupar por el valor crudo.

const CARROCERIA_CANONICAL: Record<string, string> = {
  'PICKUP': 'PICKUP',
  'PICKUP DOBLE CABINA': 'PICKUP DOBLE CABINA',
  'PICKUP CABINA SIMPLE': 'PICKUP CABINA SIMPLE',
  'HATCHBACK': 'HATCHBACK',
  'SEDAN': 'SEDÁN',
  'SEDÁN': 'SEDÁN',
  'SUV': 'SUV',
  'SUV COUPE': 'SUV',
  'SUV COUPÉ': 'SUV',
  'GRAN COUPE': 'SEDÁN',
  'GRAN COUPÉ': 'SEDÁN',
  'FURGON': 'FURGÓN',
  'FURGÓN': 'FURGÓN',
  'FURGON CARGO': 'FURGÓN CARGO',
  'FURGÓN CARGO': 'FURGÓN CARGO',
  'CARGO': 'FURGÓN CARGO',
  'UTILITARIO': 'FURGÓN',
  'FURGONETA': 'FURGÓN',
  'MINIBUS': 'MINIBÚS',
  'MINIBÚS': 'MINIBÚS',
  'CROSSOVER': 'CROSSOVER',
  'MPV': 'MINIVAN',
  'MINIVAN': 'MINIVAN',
  'VAN': 'MINIVAN',
  'CABRIO': 'CONVERTIBLE',
  'CONVERTIBLE': 'CONVERTIBLE',
  'DEPORTIVO': 'DEPORTIVO',
};

const KNOWN_HATCHBACK_MODELS = [
  'PICANTO',
  'NEW PICANTO',
  'GRAND I10',
  'NEW GRAND I10 HATCHBACK',
  'KWID',
  'MOBI',
  'CELERIO',
  'AGYA',
  'EV2',
  'EV3',
  'T03',
  'SWIFT',
  'ARGO',
];

export const normalizeCarroceria = (raw: string | undefined | null, modelName?: string | null): string => {
  if (modelName) {
    const cleanModel = modelName.trim().toUpperCase();
    if (KNOWN_HATCHBACK_MODELS.includes(cleanModel) || cleanModel.includes('PICANTO')) {
      return 'HATCHBACK';
    }
  }
  const clean = (raw || '').trim().toUpperCase();
  if (!clean) return 'VEHÍCULO';
  return CARROCERIA_CANONICAL[clean] || clean;
};
