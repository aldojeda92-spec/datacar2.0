// lib/catalogCache.ts
// Cache en memoria (nivel de módulo, vive mientras dure la sesión SPA) para las
// colecciones de catálogo que TODAS las páginas públicas leen completas:
// brands, models, versions, campaigns. Antes cada página volvía a descargar
// ~450 KB desde Firestore en cada navegación, sin ningún caché entre ellas.
//
// Deliberadamente NO se usa en app/admin/page.tsx ni app/concesionarias/page.tsx:
// son paneles de gestión donde un usuario que acaba de editar un precio espera
// ver el cambio reflejado de inmediato, no datos potencialmente stale por el TTL.

import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

export interface RawDoc {
  id: string;
  [key: string]: any;
}

interface CacheEntry {
  data: RawDoc[];
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<RawDoc[]>>();

async function getCachedCollection(name: string): Promise<RawDoc[]> {
  const entry = cache.get(name);
  if (entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS) {
    return entry.data;
  }

  // Evita disparar múltiples lecturas idénticas en paralelo si dos componentes
  // piden la misma colección al mismo tiempo (ej. al montar dos páginas seguidas).
  const pending = inFlight.get(name);
  if (pending) return pending;

  const fetchPromise = (async () => {
    const snap = await getDocs(collection(db, name));
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    cache.set(name, { data, fetchedAt: Date.now() });
    inFlight.delete(name);
    return data;
  })();

  inFlight.set(name, fetchPromise);
  return fetchPromise;
}

export const getCachedBrands = () => getCachedCollection('brands');
export const getCachedModels = () => getCachedCollection('models');
export const getCachedVersions = () => getCachedCollection('versions');
export const getCachedCampaigns = () => getCachedCollection('campaigns');

/** Invalida todo el caché. Útil tras una acción que se sabe cambia el catálogo. */
export function invalidateCatalogCache(): void {
  cache.clear();
}
