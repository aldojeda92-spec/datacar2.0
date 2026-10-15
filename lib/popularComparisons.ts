// lib/popularComparisons.ts
import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';

export interface PopularComparisonItem {
  combo: string;
  ids: string[];
  count: number;
}

/**
 * Obtiene entre 5 y 8 comparaciones populares.
 * 1. Prioriza las métricas reales de la colección 'comparison_stats' en Firestore.
 * 2. Si hay menos de 5 registros (o la colección está vacía/restringida),
 *    sintetiza emparejamientos inteligentes entre modelos rivales de la misma categoría
 *    utilizando las versiones reales de la base de datos.
 */
export async function fetchPopularComparisonsData(
  allVersions?: any[],
  allModels?: any[],
  allBrands?: any[]
): Promise<PopularComparisonItem[]> {
  const counts: Record<string, { combo: string; ids: string[]; count: number }> = {};

  try {
    const statsSnap = await getDocs(collection(db, 'comparison_stats'));
    statsSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.combo && data.ids) {
        const rawIds: string[] = Array.isArray(data.ids)
          ? data.ids
          : typeof data.ids === 'string'
          ? data.ids.split(',').map((s) => s.trim()).filter(Boolean)
          : [];

        if (rawIds.length >= 2) {
          const comboKey = String(data.combo).trim();
          if (!counts[comboKey]) {
            counts[comboKey] = { combo: comboKey, ids: rawIds, count: 0 };
          }
          counts[comboKey].count += 1;
        }
      }
    });
  } catch (error) {
    console.warn('Lectura de comparison_stats (telemetría) no disponible:', error);
  }

  const realComparisons = Object.values(counts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Si ya disponemos de al menos 5 comparaciones reales, las usamos directamente
  if (realComparisons.length >= 5) {
    return realComparisons.slice(0, 8);
  }

  // Fallback inteligente: completar hasta 6-8 comparaciones con modelos reales del catálogo
  const result: PopularComparisonItem[] = [...realComparisons];
  const usedCombos = new Set(result.map((r) => r.combo.toLowerCase()));

  if (allVersions && allModels && allBrands && allVersions.length > 0 && allModels.length > 0) {
    const brandMap = new Map<string, string>();
    allBrands.forEach((b) => brandMap.set(b.id, b.name));

    // Mapear cada modelo con su versión base (la de menor precio > 0)
    const modelToVersionMap = new Map<
      string,
      { versionId: string; modelName: string; brandName: string; category: string; isPopular?: boolean }
    >();

    for (const m of allModels) {
      const bName = brandMap.get(m.brandId) || '';
      const vers = allVersions.filter((v) => v.modelId === m.id && Number(v.price) > 0);
      if (vers.length > 0) {
        vers.sort((a, b) => Number(a.price) - Number(b.price));
        const cleanCat = String(m.category || m.segment || 'General').trim().toUpperCase();
        modelToVersionMap.set(m.id, {
          versionId: vers[0].id,
          modelName: m.name,
          brandName: bName,
          category: cleanCat,
          isPopular: !!m.isPopular,
        });
      }
    }

    const availableModels = Array.from(modelToVersionMap.values());

    // 1. Agrupar por categoría para emparejar rivales del mismo segmento
    const byCategory = new Map<string, typeof availableModels>();
    for (const item of availableModels) {
      const list = byCategory.get(item.category) || [];
      list.push(item);
      byCategory.set(item.category, list);
    }

    for (const [, list] of byCategory.entries()) {
      if (result.length >= 8) break;
      if (list.length >= 2) {
        list.sort((a, b) => (b.isPopular ? 1 : 0) - (a.isPopular ? 1 : 0));
        for (let i = 0; i < list.length - 1; i++) {
          for (let j = i + 1; j < list.length; j++) {
            if (result.length >= 8) break;
            const m1 = list[i];
            const m2 = list[j];
            if (m1.brandName !== m2.brandName || list.length === 2) {
              const comboName = `${m1.brandName} ${m1.modelName} vs ${m2.brandName} ${m2.modelName}`.trim();
              const revComboName = `${m2.brandName} ${m2.modelName} vs ${m1.brandName} ${m1.modelName}`.trim();
              if (!usedCombos.has(comboName.toLowerCase()) && !usedCombos.has(revComboName.toLowerCase())) {
                usedCombos.add(comboName.toLowerCase());
                result.push({
                  combo: comboName,
                  ids: [m1.versionId, m2.versionId],
                  count: 1,
                });
              }
            }
          }
        }
      }
    }

    // 2. Si aún faltan para llegar a 6, emparejar entre marcas distintas
    if (result.length < 6 && availableModels.length >= 2) {
      for (let i = 0; i < availableModels.length - 1; i++) {
        for (let j = i + 1; j < availableModels.length; j++) {
          if (result.length >= 8) break;
          const m1 = availableModels[i];
          const m2 = availableModels[j];
          if (m1.brandName !== m2.brandName) {
            const comboName = `${m1.brandName} ${m1.modelName} vs ${m2.brandName} ${m2.modelName}`.trim();
            const revComboName = `${m2.brandName} ${m2.modelName} vs ${m1.brandName} ${m1.modelName}`.trim();
            if (!usedCombos.has(comboName.toLowerCase()) && !usedCombos.has(revComboName.toLowerCase())) {
              usedCombos.add(comboName.toLowerCase());
              result.push({
                combo: comboName,
                ids: [m1.versionId, m2.versionId],
                count: 1,
              });
            }
          }
        }
      }
    }
  }

  return result.slice(0, 8);
}
