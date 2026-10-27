// lib/dealershipAnalytics.ts
// Motor de cálculo de telemetría y métricas para reportes a concesionarias

import { DealershipReportHtmlData, DealershipReportBrandStat, DealershipReportModelStat } from './dealershipReportHtml';

export interface DealershipDataInput {
  id: string;
  name: string;
  email_gerencia?: string;
  reportEmails?: string[];
  report_email_1?: string;
  report_email_2?: string;
  report_email_3?: string;
  lastReportSentAt?: any;
  lastReportSentCount?: number;
  marcas?: string[];
  status?: string;
  datacarCheck?: boolean;
}

export interface ComputedDealershipMetrics {
  dealershipId: string;
  dealershipName: string;
  associatedBrands: string[];
  reportEmails: [string, string, string];
  lastReportSentDate: Date | null;
  daysSinceLastSent: number | null;
  // Comparador
  currentComparisons: number;
  prevComparisons: number;
  comparisonChangePct: number;
  comparisonTrend: 'up' | 'down' | 'same';
  topMarcas: DealershipReportBrandStat[];
  topModelos: DealershipReportModelStat[];
  topRivalMarcas: Array<{ name: string; count: number }>;
  topRivalModelos: Array<{ name: string; count: number }>;
  // Recomendador
  currentRecommendations: number;
  prevRecommendations: number;
  recommendationChangePct: number;
  recommendationTrend: 'up' | 'down' | 'same';
  topRecommendedModels: DealershipReportModelStat[];
  // Rango fechas
  dateRangeText: string;
  // Payload listo para el generador de HTML
  reportHtmlData: DealershipReportHtmlData;
}

function parseDocTime(doc: any): number {
  if (!doc) return 0;
  if (typeof doc.toDate === 'function') return doc.toDate().getTime();
  if (doc instanceof Date) return doc.getTime();
  if (doc.timestamp?.toDate) return doc.timestamp.toDate().getTime();
  if (doc.timestamp) {
    const t = new Date(doc.timestamp).getTime();
    if (!isNaN(t)) return t;
  }
  if (doc.createdAt?.toDate) return doc.createdAt.toDate().getTime();
  if (doc.createdAt) {
    const t = new Date(doc.createdAt).getTime();
    if (!isNaN(t)) return t;
  }
  return 0;
}

export function computeDealershipMetrics(
  concesionaria: DealershipDataInput,
  marcasList: any[] = [],
  modelosList: any[] = [],
  versionesList: any[] = [],
  comparisonStatsList: any[] = [],
  wizardStatsList: any[] = []
): ComputedDealershipMetrics {
  const dealerNorm = (concesionaria.name || '').trim().toUpperCase();

  // 1. Resolver las marcas asociadas a esta concesionaria
  const brandsSet = new Set<string>();
  if (Array.isArray(concesionaria.marcas)) {
    concesionaria.marcas.forEach(m => {
      if (m) brandsSet.add(String(m).trim().toUpperCase());
    });
  }

  // Marcas derivadas del inventario (versiones asignadas a esta concesionaria)
  const modelsById = new Map<string, any>();
  modelosList.forEach(m => modelsById.set(m.id, m));

  const brandsById = new Map<string, any>();
  marcasList.forEach(b => brandsById.set(b.id, b));

  versionesList.forEach(v => {
    const vConc = (v.concesionaria || '').trim().toUpperCase();
    if (vConc === dealerNorm) {
      const m = modelsById.get(v.modelId);
      const b = m ? brandsById.get(m.brandId) : null;
      if (b?.name) {
        brandsSet.add(b.name.trim().toUpperCase());
      }
    }
  });

  // Si aún no tiene marcas, intentar buscar marcas por nombre de concesionaria
  if (brandsSet.size === 0) {
    marcasList.forEach(b => {
      const bDealer = (b.concesionaria || '').trim().toUpperCase();
      if (bDealer === dealerNorm) {
        brandsSet.add(b.name.trim().toUpperCase());
      }
    });
  }

  const associatedBrands = Array.from(brandsSet);

  // 2. Extraer los 3 emails destinatarios
  const rawEmails = Array.isArray(concesionaria.reportEmails) ? concesionaria.reportEmails : [];
  const email1 = (rawEmails[0] || concesionaria.report_email_1 || concesionaria.email_gerencia || '').trim();
  const email2 = (rawEmails[1] || concesionaria.report_email_2 || '').trim();
  const email3 = (rawEmails[2] || concesionaria.report_email_3 || '').trim();
  const reportEmails: [string, string, string] = [email1, email2, email3];

  // 3. Contador de días desde último envío (D.7)
  let lastReportSentDate: Date | null = null;
  let daysSinceLastSent: number | null = null;
  if (concesionaria.lastReportSentAt) {
    const t = parseDocTime(concesionaria.lastReportSentAt);
    if (t > 0) {
      lastReportSentDate = new Date(t);
      const diffMs = Date.now() - t;
      daysSinceLastSent = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    }
  }

  // 4. Períodos temporales: Últimos 30 días y 30 días previos
  const now = Date.now();
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const currentPeriodStart = now - (30 * MS_PER_DAY);
  const prevPeriodStart = now - (60 * MS_PER_DAY);

  const startDateObj = new Date(currentPeriodStart);
  const endDateObj = new Date(now);
  const dateRangeText = `${startDateObj.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' })} - ${endDateObj.toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' })}`;

  // 5. Métrica de Comparaciones (D.1, D.2, D.4)
  // Construir mapa de vehículos para matching rápido
  const modelCatalog = modelosList.map(m => {
    const b = brandsById.get(m.brandId);
    return {
      id: m.id,
      modelName: (m.name || '').trim().toUpperCase(),
      brandName: (b?.name || '').trim().toUpperCase(),
      fullName: `${(b?.name || '').trim()} ${(m.name || '').trim()}`.trim().toUpperCase(),
    };
  });

  let currentComparisons = 0;
  let prevComparisons = 0;

  const brandCompCounts: Record<string, number> = {};
  const modelCompCounts: Record<string, { brandName: string; count: number }> = {};
  const rivalBrandCounts: Record<string, number> = {};
  const rivalModelCounts: Record<string, number> = {};

  comparisonStatsList.forEach(comp => {
    const compTime = parseDocTime(comp);
    const inCurrent = compTime >= currentPeriodStart;
    const inPrev = compTime >= prevPeriodStart && compTime < currentPeriodStart;

    if (!inCurrent && !inPrev) return;

    // Detectar qué vehículos están en esta comparativa
    const combo = (comp.combo || '').toUpperCase();
    const rawIds: string[] = Array.isArray(comp.slotIds)
      ? comp.slotIds
      : Array.isArray(comp.ids)
        ? comp.ids
        : typeof comp.ids === 'string'
          ? comp.ids.split(',')
          : [];

    // Verificar si alguna de las marcas asociadas a esta concesionaria está involucrada
    let hasMyBrand = false;
    const matchedMyBrands = new Set<string>();
    const matchedMyModels = new Set<string>();
    const matchedRivalBrands = new Set<string>();
    const matchedRivalModels = new Set<string>();

    // Chequeo por lista de vehículos enriquecidos (si ya viene enriquecida)
    if (Array.isArray(comp.vehicles) && comp.vehicles.length > 0) {
      comp.vehicles.forEach((v: any) => {
        const bName = (v.brandName || '').toUpperCase().trim();
        const mName = (v.modelName || v.fullName || '').toUpperCase().trim();
        if (associatedBrands.includes(bName)) {
          hasMyBrand = true;
          matchedMyBrands.add(bName);
          matchedMyModels.add(mName);
        } else if (bName && bName !== 'MARCA') {
          matchedRivalBrands.add(bName);
          if (mName) matchedRivalModels.add(mName);
        }
      });
    } else {
      // Chequeo por combo string o catálogo
      associatedBrands.forEach(b => {
        if (combo.includes(b)) {
          hasMyBrand = true;
          matchedMyBrands.add(b);
        }
      });

      modelCatalog.forEach(mc => {
        if (associatedBrands.includes(mc.brandName)) {
          if (rawIds.includes(mc.id) || combo.includes(mc.fullName) || (mc.modelName.length >= 3 && combo.includes(mc.modelName))) {
            hasMyBrand = true;
            matchedMyBrands.add(mc.brandName);
            matchedMyModels.add(mc.fullName);
          }
        } else if (mc.brandName) {
          if (rawIds.includes(mc.id) || combo.includes(mc.fullName)) {
            matchedRivalBrands.add(mc.brandName);
            matchedRivalModels.add(mc.fullName);
          }
        }
      });
    }

    if (!hasMyBrand) return;

    if (inCurrent) {
      currentComparisons++;
      matchedMyBrands.forEach(b => {
        brandCompCounts[b] = (brandCompCounts[b] || 0) + 1;
      });
      matchedMyModels.forEach(m => {
        const b = associatedBrands.find(ab => m.includes(ab)) || '';
        const existing = modelCompCounts[m] || { brandName: b, count: 0 };
        existing.count += 1;
        modelCompCounts[m] = existing;
      });
      matchedRivalBrands.forEach(rb => {
        rivalBrandCounts[rb] = (rivalBrandCounts[rb] || 0) + 1;
      });
      matchedRivalModels.forEach(rm => {
        rivalModelCounts[rm] = (rivalModelCounts[rm] || 0) + 1;
      });
    } else if (inPrev) {
      prevComparisons++;
    }
  });

  // Cálculo de tendencia % de comparaciones
  let comparisonChangePct = 0;
  let comparisonTrend: 'up' | 'down' | 'same' = 'same';
  if (prevComparisons === 0) {
    if (currentComparisons > 0) {
      comparisonChangePct = 100;
      comparisonTrend = 'up';
    }
  } else {
    comparisonChangePct = Math.round(((currentComparisons - prevComparisons) / prevComparisons) * 100);
    if (comparisonChangePct > 0) comparisonTrend = 'up';
    else if (comparisonChangePct < 0) comparisonTrend = 'down';
    else comparisonTrend = 'same';
  }

  // Top 3 Marcas
  const topMarcas: DealershipReportBrandStat[] = Object.entries(brandCompCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => ({
      name,
      count,
      sharePct: currentComparisons > 0 ? Math.round((count / currentComparisons) * 100) : 0,
    }));

  // Si no hay conteos pero hay marcas registradas, listarlas para que el template no quede vacío
  if (topMarcas.length === 0 && associatedBrands.length > 0) {
    associatedBrands.slice(0, 3).forEach(b => {
      topMarcas.push({ name: b, count: 0, sharePct: 0 });
    });
  }

  // Top 3 Modelos
  const topModelos: DealershipReportModelStat[] = Object.entries(modelCompCounts)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 3)
    .map(([name, data]) => ({
      name,
      brandName: data.brandName,
      count: data.count,
    }));

  // Top Rivales
  const topRivalMarcas = Object.entries(rivalBrandCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  const topRivalModelos = Object.entries(rivalModelCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  // 6. Métrica del Recomendador (D.5)
  let currentRecommendations = 0;
  let prevRecommendations = 0;
  const recModelMap: Record<string, { brandName: string; count: number }> = {};

  wizardStatsList.forEach(ws => {
    const wsTime = parseDocTime(ws);
    const inCurrent = wsTime >= currentPeriodStart;
    const inPrev = wsTime >= prevPeriodStart && wsTime < currentPeriodStart;

    if (!inCurrent && !inPrev) return;

    let hasMatch = false;

    // Chequear recommendedModels array
    if (Array.isArray(ws.recommendedModels)) {
      ws.recommendedModels.forEach((rec: any) => {
        const b = (rec.brandName || rec.marca || '').toUpperCase().trim();
        const m = (rec.modelName || rec.modelo || '').toUpperCase().trim();
        if (associatedBrands.includes(b)) {
          hasMatch = true;
          if (inCurrent) {
            const key = m || `${b} Modelo`;
            const curr = recModelMap[key] || { brandName: b, count: 0 };
            curr.count += 1;
            recModelMap[key] = curr;
          }
        }
      });
    }

    // Chequear topMatchBrandName
    if (!hasMatch && ws.topMatchBrandName) {
      const topB = String(ws.topMatchBrandName).toUpperCase().trim();
      if (associatedBrands.includes(topB)) {
        hasMatch = true;
        if (inCurrent) {
          const m = String(ws.topMatchModelName || '').toUpperCase().trim();
          const key = m || `${topB} Modelo`;
          const curr = recModelMap[key] || { brandName: topB, count: 0 };
          curr.count += 1;
          recModelMap[key] = curr;
        }
      }
    }

    if (hasMatch) {
      if (inCurrent) currentRecommendations++;
      else if (inPrev) prevRecommendations++;
    }
  });

  // Tendencia de recomendaciones
  let recommendationChangePct = 0;
  let recommendationTrend: 'up' | 'down' | 'same' = 'same';
  if (prevRecommendations === 0) {
    if (currentRecommendations > 0) {
      recommendationChangePct = 100;
      recommendationTrend = 'up';
    }
  } else {
    recommendationChangePct = Math.round(((currentRecommendations - prevRecommendations) / prevRecommendations) * 100);
    if (recommendationChangePct > 0) recommendationTrend = 'up';
    else if (recommendationChangePct < 0) recommendationTrend = 'down';
    else recommendationTrend = 'same';
  }

  const topRecommendedModels: DealershipReportModelStat[] = Object.entries(recModelMap)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 3)
    .map(([name, data]) => ({
      name,
      brandName: data.brandName,
      count: data.count,
    }));

  // 7. Preparar payload para la plantilla HTML
  const reportHtmlData: DealershipReportHtmlData = {
    dealershipName: concesionaria.name || 'Concesionaria Oficial',
    marcas: associatedBrands,
    periodLabel: 'últimos 30 días',
    dateRangeText,
    totalComparisons: currentComparisons,
    prevComparisons,
    comparisonChangePct,
    comparisonTrend,
    topMarcas,
    topModelos,
    topRivalMarcas,
    topRivalModelos,
    totalRecommendations: currentRecommendations,
    prevRecommendations,
    recommendationChangePct,
    recommendationTrend,
    topRecommendedModels,
    portalUrl: 'https://datacarpy.com/concesionarias',
    comparadorUrl: 'https://datacarpy.com/comparador',
    recomendadorUrl: 'https://datacarpy.com/recomendador',
  };

  return {
    dealershipId: concesionaria.id,
    dealershipName: concesionaria.name || '',
    associatedBrands,
    reportEmails,
    lastReportSentDate,
    daysSinceLastSent,
    currentComparisons,
    prevComparisons,
    comparisonChangePct,
    comparisonTrend,
    topMarcas,
    topModelos,
    topRivalMarcas,
    topRivalModelos,
    currentRecommendations,
    prevRecommendations,
    recommendationChangePct,
    recommendationTrend,
    topRecommendedModels,
    dateRangeText,
    reportHtmlData,
  };
}
