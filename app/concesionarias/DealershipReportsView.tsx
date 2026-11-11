'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { normalizeCarroceria } from '../../lib/carroceria';
import { normalizeCombustible } from '../../lib/combustible';

interface DealershipReportsViewProps {
  userData: {
    dealershipName: string;
    marcasPermitidas: string[];
    canAccessReports?: boolean;
    reportsRequested?: boolean;
  };
  userEmail?: string;
  comparisonStatsList: any[];
  wizardStatsList: any[];
  leadsList: any[];
  marcasList: any[];
  modelosList: any[];
  versionesList: any[];
  onRequestAccess: () => Promise<void>;
  isRequestingAccess: boolean;
}

export default function DealershipReportsView({
  userData,
  userEmail,
  comparisonStatsList,
  wizardStatsList,
  leadsList,
  marcasList,
  modelosList,
  versionesList,
  onRequestAccess,
  isRequestingAccess,
}: DealershipReportsViewProps) {
  // Sub-pestañas de Reportes para Concesionaria
  const [reportSubTab, setReportSubTab] = useState<'general' | 'radar_competitivo'>('general');

  // Filtros reactivos para la vista general
  const [filterBrand, setFilterBrand] = useState('Todas');
  const [filterModel, setFilterModel] = useState('Todos');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Estados específicos para el Comparador de Marcas (Radar Competitivo de Concesionaria)
  const [compBrandSelectedId, setCompBrandSelectedId] = useState<string>('');
  const [compBrandDateFrom, setCompBrandDateFrom] = useState<string>('');
  const [compBrandDateTo, setCompBrandDateTo] = useState<string>('');

  // Normalizador de origen de manufactura
  const normalizeOrigen = useCallback((raw: string | undefined | null): string => {
    const clean = (raw || '').trim().toUpperCase();
    if (!clean || clean === 'N/A' || clean === 'NO DEFINIDO') return 'NO ESPECIFICADO';
    if (clean.includes('CHIN')) return 'CHINA';
    if (clean.includes('JAP')) return 'JAPÓN';
    if (clean.includes('CORE') || clean.includes('KORE')) return 'COREA';
    if (clean.includes('BRAS') || clean.includes('BRAZ')) return 'BRASIL';
    if (clean.includes('ARGEN')) return 'ARGENTINA';
    if (clean.includes('EE.UU') || clean.includes('EEUU') || clean.includes('USA') || clean.includes('ESTADOS UNIDOS') || clean.includes('AMERIC')) return 'EE.UU.';
    if (clean.includes('ALEMAN') || clean.includes('GERMAN')) return 'ALEMANIA';
    if (clean.includes('MEX') || clean.includes('MÉX')) return 'MÉXICO';
    if (clean.includes('FRANC')) return 'FRANCIA';
    if (clean.includes('INDI')) return 'INDIA';
    if (clean.includes('REINO UNIDO') || clean.includes('INGL') || clean.includes('UK') || clean.includes('BRIT')) return 'REINO UNIDO';
    if (clean.includes('ITAL')) return 'ITALIA';
    if (clean.includes('SUEC')) return 'SUECIA';
    if (clean.includes('ESPAN') || clean.includes('ESPAÑ')) return 'ESPAÑA';
    if (clean.includes('TAILAND') || clean.includes('THAI')) return 'TAILANDIA';
    return clean;
  }, []);

  // Marcas permitidas de esta concesionaria en mayúsculas
  const permittedBrandsUpper = useMemo(() => {
    return (userData.marcasPermitidas || []).map(m => m.toUpperCase().trim()).filter(Boolean);
  }, [userData.marcasPermitidas]);

  // Marcas autorizadas del catálogo para esta concesionaria
  const authorizedBrands = useMemo(() => {
    return marcasList.filter(b => permittedBrandsUpper.includes((b.name || '').toUpperCase().trim()));
  }, [marcasList, permittedBrandsUpper]);

  useEffect(() => {
    if (!compBrandSelectedId && authorizedBrands.length > 0) {
      setCompBrandSelectedId(authorizedBrands[0].id);
    }
  }, [authorizedBrands, compBrandSelectedId]);

  // Helper de timestamp de comparativa
  const getCompTimestamp = useCallback((comp: any) => {
    if (comp.createdAt?.toDate) return comp.createdAt.toDate().getTime();
    if (comp.createdAt?.seconds) return comp.createdAt.seconds * 1000;
    if (comp.createdAt) {
      const t = new Date(comp.createdAt).getTime();
      if (!isNaN(t)) return t;
    }
    return 0;
  }, []);

  // Modelos que pertenecen a las marcas autorizadas de esta concesionaria
  const myModels = useMemo(() => {
    const brandIds = new Set(
      marcasList
        .filter(b => permittedBrandsUpper.includes((b.name || '').toUpperCase().trim()))
        .map(b => b.id)
    );
    return modelosList.filter(m => brandIds.has(m.brandId));
  }, [marcasList, modelosList, permittedBrandsUpper]);

  // Modelos filtrables según la marca seleccionada
  const myModelsForFilter = useMemo(() => {
    if (filterBrand === 'Todas') return myModels;
    const targetBrandObj = marcasList.find(b => (b.name || '').toUpperCase().trim() === filterBrand.toUpperCase().trim());
    if (!targetBrandObj) return myModels;
    return myModels.filter(m => m.brandId === targetBrandObj.id);
  }, [filterBrand, myModels, marcasList]);

  // Diccionarios rápidos de catálogo
  const { brandsById, modelsById, versionsByModelId, modelCatalogEntries } = useMemo(() => {
    const bMap = new Map<string, any>();
    marcasList.forEach(b => bMap.set(b.id, b));

    const mMap = new Map<string, any>();
    modelosList.forEach(m => mMap.set(m.id, m));

    const vByModel = new Map<string, any[]>();
    versionesList.forEach(v => {
      const arr = vByModel.get(v.modelId) || [];
      arr.push(v);
      vByModel.set(v.modelId, arr);
    });

    const entries = modelosList.map(m => {
      const b = bMap.get(m.brandId);
      const bName = (b?.name || '').trim();
      const mName = (m.name || '').trim();
      const fullName = `${bName} ${mName}`.trim();
      return {
        model: m,
        brand: b,
        brandName: bName,
        modelName: mName,
        fullUpper: fullName.toUpperCase(),
        modelUpper: mName.toUpperCase(),
      };
    }).sort((a, b) => b.fullUpper.length - a.fullUpper.length);

    return { brandsById: bMap, modelsById: mMap, versionsByModelId: vByModel, modelCatalogEntries: entries };
  }, [marcasList, modelosList, versionesList]);

  // Enriquecer cada registro de comparativa
  const enrichedComparisons = useMemo(() => {
    const buildMeta = (mod: any, brand: any, ver: any, slotIndex: number, fallbackLabel = '') => {
      const mVers = mod ? (versionsByModelId.get(mod.id) || []) : [];
      const primaryVer = ver || mVers.find(v => v.concesionaria || v.specs?.combustible) || mVers[0] || null;
      const brandName = (brand?.name || '').trim().toUpperCase();
      const modelName = (mod?.name || fallbackLabel || '').trim().toUpperCase();
      const carroceria = mod?.tipo_carroceria ? normalizeCarroceria(mod.tipo_carroceria) : 'SIN CLASIFICAR';
      const origen = normalizeOrigen(mod?.origen || brand?.origen_marca);
      const combustible = normalizeCombustible(primaryVer?.specs?.combustible) || 'NAFTA';
      const isNewEnergy = ['EV', 'PHEV', 'HEV', 'MHEV', 'REEV'].includes(combustible);
      const concesionaria = (primaryVer?.concesionaria || mod?.concesionaria || '').trim().toUpperCase() || 'OTRAS CONCESIONARIAS';

      return {
        slotIndex,
        modelId: mod?.id || fallbackLabel,
        modelName: modelName || fallbackLabel,
        brandId: brand?.id || '',
        brandName: brandName || 'MARCA',
        fullName: brandName && modelName ? `${brandName} ${modelName}` : (fallbackLabel || modelName),
        carroceria,
        origen,
        combustible,
        isNewEnergy,
        concesionaria,
      };
    };

    return comparisonStatsList.map(comp => {
      const comboParts = (comp.combo || '')
        .split(/\s+vs\s+/i)
        .map((s: string) => s.trim())
        .filter(Boolean);

      const rawIds: string[] = Array.isArray(comp.slotIds)
        ? comp.slotIds
        : Array.isArray(comp.ids)
          ? comp.ids
          : typeof comp.ids === 'string'
            ? comp.ids.split(',').map((s: string) => s.trim()).filter(Boolean)
            : [];

      const resolved = rawIds.map(id => {
        const ver = versionesList.find(v => v.id === id);
        const mod = ver ? modelsById.get(ver.modelId) : modelsById.get(id);
        const brand = mod ? brandsById.get(mod.brandId) : null;
        return { id, ver, mod, brand };
      }).filter(item => item.mod);

      const orderedVehicles: ReturnType<typeof buildMeta>[] = [];

      if (comboParts.length > 0) {
        comboParts.forEach((part: string, idx: number) => {
          const partUpper = part.toUpperCase();
          const matchFromIds = resolved.find(r => {
            const full = `${r.brand?.name || ''} ${r.mod?.name || ''}`.trim().toUpperCase();
            return full === partUpper || partUpper.includes(full) || full.includes(partUpper);
          });

          if (matchFromIds) {
            orderedVehicles.push(buildMeta(matchFromIds.mod, matchFromIds.brand, matchFromIds.ver, idx, part));
            return;
          }

          const catMatch = modelCatalogEntries.find(
            e => e.fullUpper === partUpper || partUpper.includes(e.fullUpper) || e.fullUpper.includes(partUpper)
          );

          if (catMatch) {
            orderedVehicles.push(buildMeta(catMatch.model, catMatch.brand, null, idx, part));
          } else {
            orderedVehicles.push(buildMeta(null, null, null, idx, part));
          }
        });
      } else if (resolved.length > 0) {
        resolved.forEach((item, idx) => {
          orderedVehicles.push(buildMeta(item.mod, item.brand, item.ver, idx));
        });
      }

      return {
        ...comp,
        vehicles: orderedVehicles,
      };
    });
  }, [comparisonStatsList, versionsByModelId, normalizeOrigen, modelsById, brandsById, modelCatalogEntries, versionesList]);

  // Filtrar comparativas dentro del SCOPE de las marcas permitidas de la concesionaria
  const scopedComparisons = useMemo(() => {
    const activeBrands = filterBrand !== 'Todas'
      ? [filterBrand.toUpperCase().trim()]
      : permittedBrandsUpper;

    return enrichedComparisons.filter(comp => {
      const vehs: any[] = comp.vehicles || [];
      if (vehs.length === 0) return false;

      // Debe incluir al menos un vehículo de la marca autorizada
      const hasMyBrand = vehs.some(v => activeBrands.includes(v.brandName));
      if (!hasMyBrand) return false;

      // Filtro por modelo propio específico
      if (filterModel !== 'Todos') {
        const hasMyModel = vehs.some(v => v.modelId === filterModel);
        if (!hasMyModel) return false;
      }

      // Filtro por fechas
      if (filterDateFrom || filterDateTo) {
        let time: number | null = null;
        if (comp.timestamp?.toDate) time = comp.timestamp.toDate().getTime();
        else if (comp.timestamp) time = new Date(comp.timestamp).getTime();
        else if (comp.createdAt?.toDate) time = comp.createdAt.toDate().getTime();
        else if (comp.createdAt) time = new Date(comp.createdAt).getTime();

        if (time) {
          if (filterDateFrom) {
            const from = new Date(`${filterDateFrom}T00:00:00`).getTime();
            if (time < from) return false;
          }
          if (filterDateTo) {
            const to = new Date(`${filterDateTo}T23:59:59.999`).getTime();
            if (time > to) return false;
          }
        }
      }

      return true;
    });
  }, [enrichedComparisons, filterBrand, filterModel, filterDateFrom, filterDateTo, permittedBrandsUpper]);

  // ==========================================
  // 1. MÉTRICA DE CONSIDERACIÓN (Slot #1 = 1ra Elección del Comprador)
  // ==========================================
  const considerationData = useMemo(() => {
    let firstSlotCount = 0;
    let challengerCount = 0;
    let totalDuels = 0;

    const activeBrands = filterBrand !== 'Todas'
      ? [filterBrand.toUpperCase().trim()]
      : permittedBrandsUpper;

    const modelRankingMap = new Map<string, { modelId: string; name: string; firstSlot: number; total: number }>();

    scopedComparisons.forEach(comp => {
      const vehs: any[] = comp.vehicles || [];
      if (vehs.length === 0) return;

      const isMyVeh = (v: any) => {
        if (filterModel !== 'Todos') return v.modelId === filterModel;
        return activeBrands.includes(v.brandName);
      };

      const hasMine = vehs.some(isMyVeh);
      if (!hasMine) return;

      totalDuels++;
      const firstV = vehs[0];
      if (firstV && isMyVeh(firstV)) {
        firstSlotCount++;
      } else {
        challengerCount++;
      }

      // Ranking por modelo propio
      vehs.forEach((v, idx) => {
        if (activeBrands.includes(v.brandName)) {
          const key = v.modelId || v.fullName;
          const curr = modelRankingMap.get(key) || {
            modelId: v.modelId,
            name: v.fullName,
            firstSlot: 0,
            total: 0,
          };
          curr.total += 1;
          if (idx === 0) curr.firstSlot += 1;
          modelRankingMap.set(key, curr);
        }
      });
    });

    const considerationPct = totalDuels > 0 ? Math.round((firstSlotCount / totalDuels) * 100) : 0;
    const ranking = Array.from(modelRankingMap.values())
      .sort((a, b) => b.firstSlot - a.firstSlot || b.total - a.total)
      .slice(0, 5)
      .map(item => ({
        ...item,
        pct: item.total > 0 ? Math.round((item.firstSlot / item.total) * 100) : 0,
      }));

    return {
      totalDuels,
      firstSlotCount,
      challengerCount,
      considerationPct,
      ranking,
    };
  }, [scopedComparisons, filterBrand, filterModel, permittedBrandsUpper]);

  // ==========================================
  // 2. PREFERENCIAS DEL COMPRADOR (WEIGHTS DE SLIDERS)
  // ==========================================
  const preferencesData = useMemo(() => {
    const compsWithWeights = scopedComparisons.filter(c => c.weights && typeof c.weights.motor === 'number');
    const count = compsWithWeights.length;

    if (count === 0) {
      return {
        hasData: false,
        count: 0,
        ranked: [],
      };
    }

    const sumSeg = compsWithWeights.reduce((acc, c) => acc + (Number(c.weights.seguridad) || 0), 0);
    const sumEco = compsWithWeights.reduce((acc, c) => acc + (Number(c.weights.economia) || 0), 0);
    const sumConf = compsWithWeights.reduce((acc, c) => acc + (Number(c.weights.confort) || 0), 0);
    const sumMot = compsWithWeights.reduce((acc, c) => acc + (Number(c.weights.motor) || 0), 0);

    const avgSeg = Math.round(sumSeg / count);
    const avgEco = Math.round(sumEco / count);
    const avgConf = Math.round(sumConf / count);
    const avgMot = Math.round(sumMot / count);
    const totalSum = avgSeg + avgEco + avgConf + avgMot || 1;

    const ranked = [
      { id: 'seguridad', name: 'Seguridad y ADAS', avg: avgSeg, sharePct: Math.round((avgSeg / totalSum) * 100), icon: '🛡️', color: '#1E8E3E' },
      { id: 'economia', name: 'Economía y Eficiencia', avg: avgEco, sharePct: Math.round((avgEco / totalSum) * 100), icon: '💰', color: '#00BFFF' },
      { id: 'confort', name: 'Tecnología y Confort', avg: avgConf, sharePct: Math.round((avgConf / totalSum) * 100), icon: '📱', color: '#0A1F33' },
      { id: 'motor', name: 'Motor y Potencia', avg: avgMot, sharePct: Math.round((avgMot / totalSum) * 100), icon: '⚡', color: '#DC2626' },
    ].sort((a, b) => b.avg - a.avg);

    return {
      hasData: true,
      count,
      ranked,
    };
  }, [scopedComparisons]);

  // ==========================================
  // 3. TELEMETRÍA DEL RECOMENDADOR
  // ==========================================
  const recomendadorData = useMemo(() => {
    const activeBrands = filterBrand !== 'Todas'
      ? [filterBrand.toUpperCase().trim()]
      : permittedBrandsUpper;

    // Conteo en leads generados por recomendador
    let recommendationsCount = 0;
    const modelRecMap: Record<string, number> = {};

    leadsList.forEach(lead => {
      const matchBrand = (lead.marca || '').toUpperCase().trim();
      if (activeBrands.includes(matchBrand)) {
        recommendationsCount++;
        const mod = lead.modelo || 'Modelo General';
        modelRecMap[mod] = (modelRecMap[mod] || 0) + 1;
      }
    });

    const topRecommendedModels = Object.entries(modelRecMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      total: recommendationsCount,
      topModels: topRecommendedModels,
    };
  }, [leadsList, filterBrand, permittedBrandsUpper]);

  // ==========================================
  // 4. ANÁLISIS COMPETITIVO (5 GRÁFICOS CIRCULARES)
  // ==========================================
  const circularBreakdowns = useMemo(() => {
    const activeBrands = filterBrand !== 'Todas'
      ? [filterBrand.toUpperCase().trim()]
      : permittedBrandsUpper;

    const brandRivalCounts: Record<string, number> = {};
    const modelRivalCounts: Record<string, number> = {};
    const dealerRivalCounts: Record<string, number> = {};
    const motorRivalCounts: Record<string, number> = { 'Combustión Tradicional': 0, 'Nuevas Energías (EV/Híbridos)': 0 };
    const origenRivalCounts: Record<string, number> = {};

    let totalRivalVehicles = 0;

    scopedComparisons.forEach(comp => {
      const vehs: any[] = comp.vehicles || [];
      if (vehs.length < 2) return;

      const rivals = vehs.filter(v => {
        if (filterModel !== 'Todos') return v.modelId !== filterModel;
        return !activeBrands.includes(v.brandName);
      });

      rivals.forEach(r => {
        totalRivalVehicles++;

        // 1. Marcas rivales
        const bName = r.brandName || 'OTRA';
        brandRivalCounts[bName] = (brandRivalCounts[bName] || 0) + 1;

        // 2. Modelos rivales
        const mName = r.fullName || 'OTRO MODELO';
        modelRivalCounts[mName] = (modelRivalCounts[mName] || 0) + 1;

        // 3. Concesionarias rivales
        const dName = r.concesionaria || 'OTRAS';
        dealerRivalCounts[dName] = (dealerRivalCounts[dName] || 0) + 1;

        // 4. Motorización
        if (r.isNewEnergy) {
          motorRivalCounts['Nuevas Energías (EV/Híbridos)'] += 1;
        } else {
          motorRivalCounts['Combustión Tradicional'] += 1;
        }

        // 5. Origen
        const oName = r.origen || 'NO ESPECIFICADO';
        origenRivalCounts[oName] = (origenRivalCounts[oName] || 0) + 1;
      });
    });

    const PALETTE = ['#00BFFF', '#0A1F33', '#1E8E3E', '#F59E0B', '#DC2626', '#8B5CF6', '#EC4899', '#6B7280'];

    const toSlices = (counts: Record<string, number>, max = 5) => {
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      const top = sorted.slice(0, max);
      const others = sorted.slice(max);
      const othersCount = others.reduce((acc, curr) => acc + curr[1], 0);

      const res = top.map(([label, count], idx) => ({
        label,
        count,
        pct: totalRivalVehicles > 0 ? Math.round((count / totalRivalVehicles) * 100) : 0,
        color: PALETTE[idx % PALETTE.length],
      }));

      if (othersCount > 0) {
        res.push({
          label: 'Otras',
          count: othersCount,
          pct: totalRivalVehicles > 0 ? Math.round((othersCount / totalRivalVehicles) * 100) : 0,
          color: '#C0C0C0',
        });
      }

      return res;
    };

    return {
      totalRivals: totalRivalVehicles,
      topBrands: toSlices(brandRivalCounts, 5),
      topModels: toSlices(modelRivalCounts, 5),
      topDealers: toSlices(dealerRivalCounts, 5),
      topMotor: [
        {
          label: 'Combustión',
          count: motorRivalCounts['Combustión Tradicional'] || 0,
          pct: totalRivalVehicles > 0 ? Math.round(((motorRivalCounts['Combustión Tradicional'] || 0) / totalRivalVehicles) * 100) : 0,
          color: '#0A1F33',
        },
        {
          label: 'Nuevas Energías',
          count: motorRivalCounts['Nuevas Energías (EV/Híbridos)'] || 0,
          pct: totalRivalVehicles > 0 ? Math.round(((motorRivalCounts['Nuevas Energías (EV/Híbridos)'] || 0) / totalRivalVehicles) * 100) : 0,
          color: '#00BFFF',
        },
      ].filter(s => s.count > 0),
      topOrigenes: toSlices(origenRivalCounts, 5),
    };
  }, [scopedComparisons, filterBrand, filterModel, permittedBrandsUpper]);

  // Top 8 duelos directos más repetidos
  const topDirectCombos = useMemo(() => {
    const counts: Record<string, number> = {};
    scopedComparisons.forEach(c => {
      if (c.combo) counts[c.combo] = (counts[c.combo] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [scopedComparisons]);

  // ==========================================
  // COMPARADOR DE MARCAS (RADAR COMPETITIVO PARA CONCESIONARIA)
  // Restringido estrictamente a las marcas permitidas de la concesionaria
  // ==========================================
  const brandCompetitorAnalytics = useMemo(() => {
    const dateComps = enrichedComparisons.filter(comp => {
      const t = getCompTimestamp(comp);
      if (!t) return true;
      if (compBrandDateFrom) {
        const fromT = new Date(`${compBrandDateFrom}T00:00:00`).getTime();
        if (t < fromT) return false;
      }
      if (compBrandDateTo) {
        const toT = new Date(`${compBrandDateTo}T23:59:59.999`).getTime();
        if (t > toT) return false;
      }
      return true;
    });

    const totalCompsInDateRange = dateComps.length;
    // Solo permitir seleccionar marcas que pertenezcan a las marcas autorizadas de la concesionaria
    const activeBrandId = compBrandSelectedId || (authorizedBrands[0]?.id || '');
    const selectedBrand = authorizedBrands.find(b => b.id === activeBrandId) || null;

    if (!selectedBrand) {
      return {
        selectedBrand: null,
        totalCompsInDateRange,
        brandTotalComps: 0,
        marketSharePct: '0',
        slot1Count: 0,
        slot1Pct: 0,
        challengerCount: 0,
        internalCompCount: 0,
        topCompetingBrands: [] as {
          brandId: string;
          brandName: string;
          origen: string;
          count: number;
          shareOfDuelsPct: number;
          shareOfBrandCompsPct: number;
          focalSlot1Wins: number;
          rivalSlot1Wins: number;
          topModelClash: string;
        }[],
        topCompetingModels: [] as {
          fullName: string;
          brandName: string;
          carroceria: string;
          count: number;
          pct: number;
        }[],
        ownModelsInvolved: [] as {
          modelId: string;
          modelName: string;
          count: number;
          slot1Count: number;
          pct: number;
        }[],
      };
    }

    const brandNameUpper = (selectedBrand.name || '').trim().toUpperCase();
    let brandTotalComps = 0;
    let slot1Count = 0;
    let internalCompCount = 0;

    const rivalBrandMap: Record<string, {
      brandId: string;
      brandName: string;
      origen: string;
      count: number;
      focalSlot1Wins: number;
      rivalSlot1Wins: number;
      modelClashes: Record<string, number>;
    }> = {};

    const rivalModelMap: Record<string, {
      fullName: string;
      brandName: string;
      carroceria: string;
      count: number;
    }> = {};

    const ownModelMap: Record<string, {
      modelId: string;
      modelName: string;
      count: number;
      slot1Count: number;
    }> = {};

    dateComps.forEach(comp => {
      const vehs: any[] = comp.vehicles || [];
      if (vehs.length === 0) return;

      const isMyBrand = (v: any) =>
        (v.brandId && v.brandId === selectedBrand.id) ||
        (v.brandName && v.brandName.trim().toUpperCase() === brandNameUpper);

      const myVehs = vehs.filter(isMyBrand);
      if (myVehs.length === 0) return;

      brandTotalComps++;
      const firstVeh = vehs[0];
      const focalIsSlot1 = firstVeh ? isMyBrand(firstVeh) : false;
      if (focalIsSlot1) {
        slot1Count++;
      }

      // Registrar modelos propios involucrados
      const seenOwnModels = new Set<string>();
      myVehs.forEach(mv => {
        const mKey = mv.modelId || mv.modelName || 'MODELO';
        if (!seenOwnModels.has(mKey)) {
          seenOwnModels.add(mKey);
          if (!ownModelMap[mKey]) {
            ownModelMap[mKey] = {
              modelId: mv.modelId || mKey,
              modelName: mv.modelName || mv.fullName || 'MODELO',
              count: 0,
              slot1Count: 0,
            };
          }
          ownModelMap[mKey].count++;
          if (firstVeh && (firstVeh.modelId === mv.modelId || firstVeh.modelName === mv.modelName)) {
            ownModelMap[mKey].slot1Count++;
          }
        }
      });

      // Analizar marcas rivales en esta comparativa
      const rivalVehs = vehs.filter(v => !isMyBrand(v));
      if (rivalVehs.length === 0 && myVehs.length >= 2) {
        internalCompCount++;
      }

      const seenRivalBrandsInComp = new Set<string>();
      const seenRivalModelsInComp = new Set<string>();

      rivalVehs.forEach(rv => {
        const rBrandName = (rv.brandName || 'OTRA MARCA').trim().toUpperCase();
        if (!rBrandName || rBrandName === 'MARCA') return;

        if (!seenRivalBrandsInComp.has(rBrandName)) {
          seenRivalBrandsInComp.add(rBrandName);
          if (!rivalBrandMap[rBrandName]) {
            const catBrand = marcasList.find(b => b.id === rv.brandId || (b.name || '').trim().toUpperCase() === rBrandName);
            rivalBrandMap[rBrandName] = {
              brandId: catBrand?.id || rv.brandId || rBrandName,
              brandName: rBrandName,
              origen: normalizeOrigen(catBrand?.origen_marca || rv.origen),
              count: 0,
              focalSlot1Wins: 0,
              rivalSlot1Wins: 0,
              modelClashes: {},
            };
          }
          rivalBrandMap[rBrandName].count++;
          if (focalIsSlot1) {
            rivalBrandMap[rBrandName].focalSlot1Wins++;
          } else if (firstVeh && (firstVeh.brandName || '').trim().toUpperCase() === rBrandName) {
            rivalBrandMap[rBrandName].rivalSlot1Wins++;
          }
        }

        // Cruce específico de modelos (Modelo propio vs Modelo rival)
        myVehs.forEach(mv => {
          const clashLabel = `${mv.modelName} vs ${rv.fullName}`;
          if (rivalBrandMap[rBrandName]) {
            rivalBrandMap[rBrandName].modelClashes[clashLabel] =
              (rivalBrandMap[rBrandName].modelClashes[clashLabel] || 0) + 1;
          }
        });

        // Modelos rivales directos
        const rModelFull = rv.fullName || `${rBrandName} ${rv.modelName || ''}`.trim();
        if (rModelFull && !seenRivalModelsInComp.has(rModelFull)) {
          seenRivalModelsInComp.add(rModelFull);
          if (!rivalModelMap[rModelFull]) {
            rivalModelMap[rModelFull] = {
              fullName: rModelFull,
              brandName: rBrandName,
              carroceria: rv.carroceria || 'SUV',
              count: 0,
            };
          }
          rivalModelMap[rModelFull].count++;
        }
      });
    });

    const totalRivalBrandInstances = Object.values(rivalBrandMap).reduce((acc, item) => acc + item.count, 0) || 1;
    const topCompetingBrands = Object.values(rivalBrandMap)
      .sort((a, b) => b.count - a.count)
      .map(item => {
        const topClashEntry = Object.entries(item.modelClashes).sort((a, b) => b[1] - a[1])[0];
        return {
          brandId: item.brandId,
          brandName: item.brandName,
          origen: item.origen,
          count: item.count,
          shareOfDuelsPct: Math.round((item.count / totalRivalBrandInstances) * 100),
          shareOfBrandCompsPct: brandTotalComps > 0 ? Math.round((item.count / brandTotalComps) * 100) : 0,
          focalSlot1Wins: item.focalSlot1Wins,
          rivalSlot1Wins: item.rivalSlot1Wins,
          topModelClash: topClashEntry ? `${topClashEntry[0]} (${topClashEntry[1]}x)` : '-',
        };
      });

    const topCompetingModels = Object.values(rivalModelMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(m => ({
        ...m,
        pct: brandTotalComps > 0 ? Math.round((m.count / brandTotalComps) * 100) : 0,
      }));

    const ownModelsInvolved = Object.values(ownModelMap)
      .sort((a, b) => b.count - a.count)
      .map(om => ({
        ...om,
        pct: brandTotalComps > 0 ? Math.round((om.count / brandTotalComps) * 100) : 0,
      }));

    const challengerCount = Math.max(0, brandTotalComps - slot1Count);
    const slot1Pct = brandTotalComps > 0 ? Math.round((slot1Count / brandTotalComps) * 100) : 0;
    const marketSharePct = totalCompsInDateRange > 0 ? ((brandTotalComps / totalCompsInDateRange) * 100).toFixed(1) : '0';

    return {
      selectedBrand,
      totalCompsInDateRange,
      brandTotalComps,
      marketSharePct,
      slot1Count,
      slot1Pct,
      challengerCount,
      internalCompCount,
      topCompetingBrands,
      topCompetingModels,
      ownModelsInvolved,
    };
  }, [enrichedComparisons, compBrandSelectedId, compBrandDateFrom, compBrandDateTo, authorizedBrands, marcasList, getCompTimestamp, normalizeOrigen]);

  // Componente Gráfico Circular (Donut SVG)
  const DonutCard = ({
    title,
    subtitle,
    centerValue,
    centerLabel,
    badgeText,
    slices,
  }: {
    title: string;
    subtitle: string;
    centerValue: string;
    centerLabel: string;
    badgeText: string;
    slices: { label: string; count: number; pct: number; color: string }[];
  }) => {
    const radius = 42;
    const circumference = 2 * Math.PI * radius;
    const totalCount = slices.reduce((acc, s) => acc + s.count, 0);
    let accumulatedFraction = 0;

    return (
      <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-4 flex flex-col justify-between h-full shadow-none">
        <div>
          <div className="flex items-start justify-between gap-2 mb-1">
            <h4 className="text-[11px] font-black text-[#0A1F33] uppercase tracking-wider leading-tight">
              {title}
            </h4>
            <span className="bg-[#0A1F33] text-[#00BFFF] text-[8px] font-black uppercase px-2 py-0.5 tracking-widest shrink-0">
              {badgeText}
            </span>
          </div>
          <p className="text-[9px] text-[#71717A] mb-3 leading-snug">{subtitle}</p>
        </div>

        {slices.length === 0 || totalCount === 0 ? (
          <div className="py-10 text-center text-[10px] text-[#C0C0C0] font-bold uppercase tracking-widest">
            Sin datos en este filtro
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 my-auto">
            {/* SVG Donut */}
            <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
              <svg className="w-28 h-28 -rotate-90" viewBox="0 0 112 112">
                <circle cx="56" cy="56" r={radius} fill="transparent" stroke="#F1F5F9" strokeWidth="14" />
                {slices.map((slice, i) => {
                  const fraction = totalCount > 0 ? slice.count / totalCount : 0;
                  const strokeDasharray = `${fraction * circumference} ${circumference}`;
                  const strokeDashoffset = -accumulatedFraction * circumference;
                  accumulatedFraction += fraction;
                  return (
                    <circle
                      key={i}
                      cx="56"
                      cy="56"
                      r={radius}
                      fill="transparent"
                      stroke={slice.color}
                      strokeWidth="14"
                      strokeDasharray={strokeDasharray}
                      strokeDashoffset={strokeDashoffset}
                    />
                  );
                })}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
                <span className="text-base font-black text-[#0A1F33] leading-none" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
                  {centerValue}
                </span>
                <span className="text-[7px] font-bold text-[#71717A] uppercase tracking-wider mt-0.5 leading-tight">
                  {centerLabel}
                </span>
              </div>
            </div>

            {/* Leyendas */}
            <div className="w-full flex flex-col gap-1.5 border-t border-[#E6E6E6] pt-2.5">
              {slices.map((s, idx) => (
                <div key={idx} className="flex items-center justify-between text-[10px]">
                  <div className="flex items-center gap-1.5 min-w-0 pr-2">
                    <span className="w-2.5 h-2.5 shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="text-[#3A3A3C] font-semibold truncate uppercase text-[9px]">{s.label}</span>
                  </div>
                  <span className="font-bold text-[#0A1F33] shrink-0 text-[10px]">{s.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ==========================================
  // PANTALLA BLOQUEADA: SI NO TIENE PERMISOS DE REPORTES
  // ==========================================
  if (!userData?.canAccessReports) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <div className="bg-[#FFFFFF] border-t-4 border-[#0A1F33] border-l border-r border-b border-[#C0C0C0] p-8 md:p-12 shadow-lg text-center flex flex-col items-center gap-6">
          <div className="w-16 h-16 bg-[#0A1F33] text-[#00BFFF] flex items-center justify-center text-2xl font-black shadow-md">
            🔒
          </div>

          <div>
            <span className="bg-[#00BFFF]/20 text-[#0080B0] text-[9px] font-black uppercase px-3 py-1 tracking-widest inline-block mb-2">
              Módulo Exclusivo B2B
            </span>
            <h2 className="font-black text-2xl sm:text-3xl text-[#0A1F33] uppercase tracking-wide" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
              Inteligencia de Mercado y Telemetría Competitiva
            </h2>
            <p className="text-xs sm:text-sm text-[#71717A] max-w-2xl mx-auto mt-2 leading-relaxed">
              Descubrí en tiempo real cómo los compradores interactúan con tus marcas autorizadas (<strong>{userData.marcasPermitidas.join(', ')}</strong>) en DATACAR.
            </p>
          </div>

          {/* Tarjetas de Beneficios */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full text-left my-2">
            <div className="bg-[#F8F9FA] border border-[#C0C0C0]/60 p-4">
              <span className="text-lg mb-1 block">📈</span>
              <h4 className="font-bold text-xs uppercase text-[#0A1F33]">Tasa de Consideración (1ra Opción)</h4>
              <p className="text-[10px] text-[#71717A] mt-1 leading-snug">
                Conocé el porcentaje de veces que los compradores seleccionan tu marca como su opción principal de compra en el comparador.
              </p>
            </div>
            <div className="bg-[#F8F9FA] border border-[#C0C0C0]/60 p-4">
              <span className="text-lg mb-1 block">🥊</span>
              <h4 className="font-bold text-xs uppercase text-[#0A1F33]">Duelos y Rivales Directos</h4>
              <p className="text-[10px] text-[#71717A] mt-1 leading-snug">
                Gráficos de las marcas, modelos y concesionarias rivales con las que se miden tus vehículos 0km.
              </p>
            </div>
            <div className="bg-[#F8F9FA] border border-[#C0C0C0]/60 p-4">
              <span className="text-lg mb-1 block">🎯</span>
              <h4 className="font-bold text-xs uppercase text-[#0A1F33]">Preferencias del Comprador</h4>
              <p className="text-[10px] text-[#71717A] mt-1 leading-snug">
                Telemetría de qué prioriza tu audiencia: Seguridad & ADAS, Economía, Confort o Potencia del motor.
              </p>
            </div>
            <div className="bg-[#F8F9FA] border border-[#C0C0C0]/60 p-4">
              <span className="text-lg mb-1 block">🤖</span>
              <h4 className="font-bold text-xs uppercase text-[#0A1F33]">Impacto en el Recomendador</h4>
              <p className="text-[10px] text-[#71717A] mt-1 leading-snug">
                Frecuencia y modelos de tu catálogo sugeridos a los compradores mediante el asistente interactivo.
              </p>
            </div>
          </div>

          {/* Botón de Solicitud o Estado */}
          <div className="w-full max-w-md pt-2 border-t border-[#E6E6E6]">
            {userData?.reportsRequested ? (
              <div className="bg-[#FEF3C7] border border-[#D97706]/40 p-4 text-center">
                <p className="text-[11px] font-black uppercase tracking-wider text-[#92400E]">
                  ⏳ Solicitud de Acceso en Revisión
                </p>
                <p className="text-[10px] text-[#78350F] mt-1">
                  Tu solicitud ha sido notificada a la gerencia de DATACAR. Te enviaremos un correo en cuanto tus permisos sean habilitados.
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={onRequestAccess}
                disabled={isRequestingAccess}
                className="w-full bg-[#00BFFF] hover:bg-[#0A1F33] text-[#FFFFFF] font-black text-xs uppercase tracking-widest py-4 transition-colors disabled:opacity-50 shadow-md cursor-pointer rounded-none"
              >
                {isRequestingAccess ? 'Enviando Solicitud...' : 'Solicitar Acceso a Reportes de Mercado'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // PANTALLA HABILITADA: DASHBOARD COMPLETO DE REPORTES BI
  // ==========================================
  return (
    <div className="flex flex-col gap-6 pb-10">
      
      {/* 0. NAVEGACIÓN ENTRE SUB-PESTAÑAS DE REPORTES BI */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#C0C0C0] pb-3">
        <button
          type="button"
          onClick={() => setReportSubTab('general')}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors border flex items-center gap-1.5 ${
            reportSubTab === 'general'
              ? 'bg-[#0A1F33] text-white border-[#0A1F33]'
              : 'bg-[#F8F9FA] text-[#3A3A3C] border-[#C0C0C0] hover:border-[#0A1F33]'
          }`}
        >
          <span>📊</span>
          <span>Rendimiento General & Demanda</span>
        </button>
        <button
          type="button"
          onClick={() => setReportSubTab('radar_competitivo')}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors border flex items-center gap-1.5 ${
            reportSubTab === 'radar_competitivo'
              ? 'bg-[#0A1F33] text-white border-[#0A1F33]'
              : 'bg-[#F8F9FA] text-[#3A3A3C] border-[#C0C0C0] hover:border-[#0A1F33]'
          }`}
        >
          <span>🏢</span>
          <span>Comparador de Marcas (Top Competidores)</span>
        </button>
      </div>

      {/* ==================================================================== */}
      {/* VISTA 1: RENDIMIENTO GENERAL & DEMANDA (AUDITORÍA TRADICIONAL)       */}
      {/* ==================================================================== */}
      {reportSubTab === 'general' && (
        <div className="flex flex-col gap-8">
          {/* 1. BARRA PRINCIPAL DE FILTROS */}
          <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-5 shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#C0C0C0]/50 pb-3 mb-4">
          <div>
            <h3 className="font-black text-sm uppercase text-[#0A1F33] tracking-wide" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
              Telemetría y Rendimiento de tus Marcas
            </h3>
            <p className="text-[10px] text-[#71717A] mt-0.5">
              Concesionaria: <strong className="text-[#0A1F33] uppercase">{userData.dealershipName}</strong> • Scope: <strong className="text-[#00BFFF]">{permittedBrandsUpper.join(', ')}</strong>
            </p>
          </div>

          {(filterBrand !== 'Todas' || filterModel !== 'Todos' || filterDateFrom || filterDateTo) && (
            <button
              type="button"
              onClick={() => {
                setFilterBrand('Todas');
                setFilterModel('Todos');
                setFilterDateFrom('');
                setFilterDateTo('');
              }}
              className="text-[9px] font-bold text-[#D93025] hover:underline uppercase tracking-wider"
            >
              ✕ Limpiar Filtros
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Filtro Marca */}
          <div>
            <label htmlFor="rep-filter-brand" className="text-[9px] font-bold text-[#71717A] uppercase block mb-1">
              Marca
            </label>
            <select
              id="rep-filter-brand"
              className="w-full border p-2 text-xs font-bold focus:outline-none focus:border-[#00BFFF] rounded-none bg-white"
              value={filterBrand}
              onChange={e => {
                setFilterBrand(e.target.value);
                setFilterModel('Todos');
              }}
            >
              <option value="Todas">Todas mis marcas ({permittedBrandsUpper.join(', ')})</option>
              {userData.marcasPermitidas.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Filtro Modelo */}
          <div>
            <label htmlFor="rep-filter-model" className="text-[9px] font-bold text-[#71717A] uppercase block mb-1">
              Modelo Propio
            </label>
            <select
              id="rep-filter-model"
              className="w-full border p-2 text-xs font-bold focus:outline-none focus:border-[#00BFFF] rounded-none bg-white"
              value={filterModel}
              onChange={e => setFilterModel(e.target.value)}
            >
              <option value="Todos">Todos mis modelos ({myModelsForFilter.length})</option>
              {myModelsForFilter.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {/* Rango Desde */}
          <div>
            <label htmlFor="rep-filter-from" className="text-[9px] font-bold text-[#71717A] uppercase block mb-1">
              Fecha Desde
            </label>
            <input
              id="rep-filter-from"
              type="date"
              className="w-full border p-1.5 text-xs focus:outline-none focus:border-[#00BFFF] rounded-none bg-white"
              value={filterDateFrom}
              onChange={e => setFilterDateFrom(e.target.value)}
            />
          </div>

          {/* Rango Hasta */}
          <div>
            <label htmlFor="rep-filter-to" className="text-[9px] font-bold text-[#71717A] uppercase block mb-1">
              Fecha Hasta
            </label>
            <input
              id="rep-filter-to"
              type="date"
              className="w-full border p-1.5 text-xs focus:outline-none focus:border-[#00BFFF] rounded-none bg-white"
              value={filterDateTo}
              onChange={e => setFilterDateTo(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* 2. KPIS PRINCIPALES */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-6 border-l-4 border-l-[#0A1F33]">
          <p className="text-[9px] font-bold text-[#71717A] uppercase tracking-widest mb-1">Duelos de Comparación</p>
          <p className="font-black text-3xl text-[#0A1F33]">{considerationData.totalDuels}</p>
          <p className="text-[9px] text-[#71717A] mt-1">Comparativas con tus vehículos</p>
        </div>

        <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-6 border-l-4 border-l-[#1E8E3E]">
          <p className="text-[9px] font-bold text-[#71717A] uppercase tracking-widest mb-1">Tasa de Consideración</p>
          <p className="font-black text-3xl text-[#1E8E3E]">{considerationData.considerationPct}%</p>
          <p className="text-[9px] text-[#71717A] mt-1">
            {considerationData.firstSlotCount} de {considerationData.totalDuels} como 1ra Opción
          </p>
        </div>

        <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-6 border-l-4 border-l-[#00BFFF]">
          <p className="text-[9px] font-bold text-[#71717A] uppercase tracking-widest mb-1">Recomendador 0km</p>
          <p className="font-black text-3xl text-[#00BFFF]">{recomendadorData.total}</p>
          <p className="text-[9px] text-[#71717A] mt-1">Recomendaciones generadas</p>
        </div>

        <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-6 border-l-4 border-l-[#F59E0B]">
          <p className="text-[9px] font-bold text-[#71717A] uppercase tracking-widest mb-1">Atributo Clave Comprador</p>
          <p className="font-black text-xl text-[#0A1F33] truncate mt-1">
            {preferencesData.ranked[0]?.name || 'Seguridad & Confort'}
          </p>
          <p className="text-[9px] text-[#71717A] mt-1">Mayor prioridad de tu audiencia</p>
        </div>
      </div>

      {/* 3. BLOQUE DUAL: CONSIDERACIÓN & PREFERENCIAS DEL COMPRADOR */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* REPORTE DE CONSIDERACIÓN */}
        <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#C0C0C0]/50 pb-2.5 mb-4">
              <div>
                <h4 className="font-black text-xs uppercase text-[#0A1F33] tracking-wide">
                  Métrica de Consideración de Marca
                </h4>
                <p className="text-[9px] text-[#71717A] mt-0.5">
                  % de veces que el comprador colocó tu marca/modelo en el primer slot (intención de compra principal).
                </p>
              </div>
              <span className="bg-[#1E8E3E] text-white text-[9px] font-black uppercase px-2 py-0.5">
                {considerationData.considerationPct}% 1RA OPCIÓN
              </span>
            </div>

            {/* Barra Visual 1ra Elección vs Retador */}
            <div className="mb-6">
              <div className="flex justify-between text-[10px] font-bold mb-1.5">
                <span className="text-[#1E8E3E] uppercase">1ra Opción: {considerationData.firstSlotCount} ({considerationData.considerationPct}%)</span>
                <span className="text-[#71717A] uppercase">Retador 2do/3er slot: {considerationData.challengerCount} ({100 - considerationData.considerationPct}%)</span>
              </div>
              <div className="w-full h-3 bg-[#E6E6E6] flex overflow-hidden">
                <div style={{ width: `${considerationData.considerationPct}%` }} className="bg-[#1E8E3E] h-full transition-all duration-500" />
                <div style={{ width: `${100 - considerationData.considerationPct}%` }} className="bg-[#0A1F33] h-full transition-all duration-500" />
              </div>
            </div>

            {/* Ranking por Modelo Propio */}
            <div>
              <h5 className="text-[10px] font-bold uppercase text-[#71717A] tracking-wider mb-2">
                Consideración por Modelo Propio
              </h5>
              {considerationData.ranking.length === 0 ? (
                <p className="text-[10px] text-[#C0C0C0] uppercase">Sin muestras registradas</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {considerationData.ranking.map((item, idx) => (
                    <div key={idx} className="flex flex-col gap-1 border-b border-[#F0F0F0] pb-1.5">
                      <div className="flex justify-between text-[10px] font-bold uppercase">
                        <span className="text-[#0A1F33] truncate pr-2">{item.name}</span>
                        <span className="text-[#1E8E3E]">{item.pct}% ({item.firstSlot} de {item.total})</span>
                      </div>
                      <div className="w-full h-1.5 bg-[#F0F0F0]">
                        <div style={{ width: `${item.pct}%` }} className="bg-[#1E8E3E] h-full" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* PREFERENCIAS DEL COMPRADOR (WEIGHTS) */}
        <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#C0C0C0]/50 pb-2.5 mb-4">
              <div>
                <h4 className="font-black text-xs uppercase text-[#0A1F33] tracking-wide">
                  Preferencias del Comprador de tus Modelos
                </h4>
                <p className="text-[9px] text-[#71717A] mt-0.5">
                  Promedio de prioridades configuradas por los usuarios al comparar tus vehículos.
                </p>
              </div>
              <span className="bg-[#0A1F33] text-[#00BFFF] text-[8px] font-black uppercase px-2 py-0.5 tracking-widest">
                TELEMETRÍA
              </span>
            </div>

            {!preferencesData.hasData ? (
              <p className="text-[10px] text-[#C0C0C0] uppercase py-8 text-center">
                Aún no hay suficientes calibraciones de sliders para este filtro.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {preferencesData.ranked.map((attr, idx) => (
                  <div key={idx} className="flex flex-col gap-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-[#0A1F33] uppercase text-[10px] flex items-center gap-1.5">
                        <span>{attr.icon}</span> {attr.name}
                      </span>
                      <span className="font-black text-xs" style={{ color: attr.color }}>
                        {attr.avg}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-[#F0F0F0]">
                      <div
                        style={{ width: `${attr.avg}%`, backgroundColor: attr.color }}
                        className="h-full transition-all duration-500"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Menciones en Recomendador */}
          <div className="mt-6 pt-4 border-t border-[#E6E6E6] flex items-center justify-between">
            <div>
              <span className="text-[9px] font-bold text-[#71717A] uppercase block">Algoritmo Recomendador:</span>
              <span className="text-xs font-bold text-[#0A1F33]">
                {recomendadorData.total} sugerencias generadas para tus modelos
              </span>
            </div>
            {recomendadorData.topModels.length > 0 && (
              <span className="text-[9px] font-mono text-[#00BFFF] uppercase font-bold">
                Top: {recomendadorData.topModels[0][0]}
              </span>
            )}
          </div>
        </div>

      </div>

      {/* 4. SECCIÓN DE RANKINGS COMPETITIVOS (5 GRÁFICOS CIRCULARES TIPO DONUT) */}
      <div>
        <div className="mb-4">
          <h3 className="font-black text-sm uppercase text-[#0A1F33] tracking-wide" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
            Análisis Competitivo de Duelos (Con qué se comparan tus marcas)
          </h3>
          <p className="text-[10px] text-[#71717A] mt-0.5">
            Desglose de contrincantes directos elegidos por compradores en {circularBreakdowns.totalRivals} duelos analizados.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          {/* 1. Top Marcas */}
          <DonutCard
            title="Top Marcas Rivales"
            subtitle="Marcas más comparadas"
            centerValue={`${circularBreakdowns.topBrands[0]?.pct || 0}%`}
            centerLabel={circularBreakdowns.topBrands[0]?.label || 'Top 1'}
            badgeText="MARCAS"
            slices={circularBreakdowns.topBrands}
          />

          {/* 2. Top Modelos */}
          <DonutCard
            title="Top Modelos Rivales"
            subtitle="Modelos competidores"
            centerValue={`${circularBreakdowns.topModels[0]?.pct || 0}%`}
            centerLabel={circularBreakdowns.topModels[0]?.label ? circularBreakdowns.topModels[0].label.slice(0, 10) : 'Top 1'}
            badgeText="MODELOS"
            slices={circularBreakdowns.topModels}
          />

          {/* 3. Top Concesionarias */}
          <DonutCard
            title="Top Concesionarias"
            subtitle="Empresas rivales en duelos"
            centerValue={`${circularBreakdowns.topDealers[0]?.pct || 0}%`}
            centerLabel={circularBreakdowns.topDealers[0]?.label ? circularBreakdowns.topDealers[0].label.slice(0, 10) : 'Top 1'}
            badgeText="DEALERS"
            slices={circularBreakdowns.topDealers}
          />

          {/* 4. Top Motorización */}
          <DonutCard
            title="Motorización Rival"
            subtitle="Combustión vs Nuevas Energías"
            centerValue={`${circularBreakdowns.topMotor.find(m => m.label === 'Nuevas Energías')?.pct || 0}%`}
            centerLabel="HÍB / EV"
            badgeText="ENERGÍA"
            slices={circularBreakdowns.topMotor}
          />

          {/* 5. Top Orígenes */}
          <DonutCard
            title="Origen de Rivales"
            subtitle="Procedencia de competidores"
            centerValue={`${circularBreakdowns.topOrigenes[0]?.pct || 0}%`}
            centerLabel={circularBreakdowns.topOrigenes[0]?.label || 'Top 1'}
            badgeText="PROCEDENCIA"
            slices={circularBreakdowns.topOrigenes}
          />
        </div>
      </div>

      {/* 5. TOP 8 COMPARATIVAS DIRECTAS MÁS FRECUENTES */}
      <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-6 shadow-none">
        <div className="flex items-center justify-between border-b border-[#C0C0C0]/50 pb-3 mb-4">
          <h4 className="font-black text-xs uppercase text-[#0A1F33] tracking-wide">
            Top Comparativas Directas de tu Catálogo
          </h4>
          <span className="text-[9px] text-[#71717A] uppercase font-bold">
            Frecuencia Absoluta
          </span>
        </div>

        {topDirectCombos.length === 0 ? (
          <p className="text-[10px] text-[#C0C0C0] uppercase py-6 text-center">
            Aún no se han registrado comparaciones con tus marcas en este rango.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {topDirectCombos.map(([combo, count], idx) => {
              const maxCount = topDirectCombos[0][1] || 1;
              const barPct = Math.round((count / maxCount) * 100);
              return (
                <div key={idx} className="border border-[#E6E6E6] p-3 bg-[#F8F9FA] flex flex-col justify-between">
                  <div className="flex justify-between items-start gap-2 mb-1.5">
                    <span className="text-[11px] font-bold text-[#0A1F33] uppercase">
                      {combo}
                    </span>
                    <span className="bg-[#0A1F33] text-white text-[9px] font-black px-2 py-0.5 shrink-0">
                      {count} veces
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-[#E6E6E6] mt-2">
                    <div style={{ width: `${barPct}%` }} className="h-full bg-[#00BFFF]" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      </div>
      )}

      {/* ==================================================================== */}
      {/* VISTA 2: COMPARADOR DE MARCAS (TOP COMPETIDORES) - RADAR COMPETITIVO */}
      {/* ==================================================================== */}
      {reportSubTab === 'radar_competitivo' && (
        <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-6 flex flex-col gap-6 shadow-none">
          {/* Encabezado */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#C0C0C0]/50 pb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 bg-[#00BFFF] inline-block" />
                <h3 className="text-xs font-black uppercase tracking-widest text-[#0A1F33]">
                  Comparador de Marcas: Top Marcas con las que Compite tu Marca
                </h3>
                <span className="bg-[#0A1F33] text-[#00BFFF] px-2 py-0.5 text-[8px] font-black uppercase">
                  Radar Competitivo de Marca
                </span>
              </div>
              <p className="text-[10px] text-[#3A3A3C]">
                Seleccioná una de tus marcas autorizadas para ver al instante el ranking de marcas contra las que más la comparan los compradores, su cuota de pantalla y qué modelos protagonizan los enfrentamientos.
              </p>
            </div>

            {/* Botones de rango rápido */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[9px] font-bold text-[#C0C0C0] uppercase tracking-wider mr-1">Rango rápido:</span>
              <button
                type="button"
                onClick={() => { setCompBrandDateFrom(''); setCompBrandDateTo(''); }}
                className="px-2.5 py-1 text-[9px] font-bold uppercase border border-[#C0C0C0] hover:border-[#0A1F33] bg-[#F8F9FA] text-[#0A1F33]"
              >
                Histórico Total
              </button>
              <button
                type="button"
                onClick={() => {
                  const today = new Date().toISOString().split('T')[0];
                  setCompBrandDateFrom(today);
                  setCompBrandDateTo(today);
                }}
                className="px-2.5 py-1 text-[9px] font-bold uppercase border border-[#C0C0C0] hover:border-[#0A1F33] bg-[#F8F9FA] text-[#0A1F33]"
              >
                Hoy
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() - 7);
                  setCompBrandDateFrom(d.toISOString().split('T')[0]);
                  setCompBrandDateTo(new Date().toISOString().split('T')[0]);
                }}
                className="px-2.5 py-1 text-[9px] font-bold uppercase border border-[#C0C0C0] hover:border-[#0A1F33] bg-[#F8F9FA] text-[#0A1F33]"
              >
                Últimos 7 días
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() - 30);
                  setCompBrandDateFrom(d.toISOString().split('T')[0]);
                  setCompBrandDateTo(new Date().toISOString().split('T')[0]);
                }}
                className="px-2.5 py-1 text-[9px] font-bold uppercase border border-[#C0C0C0] hover:border-[#0A1F33] bg-[#F8F9FA] text-[#0A1F33]"
              >
                Últimos 30 días
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
                  setCompBrandDateFrom(firstDay);
                  setCompBrandDateTo(now.toISOString().split('T')[0]);
                }}
                className="px-2.5 py-1 text-[9px] font-bold uppercase border border-[#C0C0C0] hover:border-[#0A1F33] bg-[#F8F9FA] text-[#0A1F33]"
              >
                Este Mes
              </button>
            </div>
          </div>

          {/* Barra de Selección de Marca Autorizada y Fechas */}
          <div className="bg-[#F8F9FA] border border-[#C0C0C0]/70 p-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-6">
              <label htmlFor="compBrandSelectDealer" className="text-[10px] font-bold text-[#0A1F33] uppercase block mb-1">
                Seleccionar Marca a Analizar <span className="text-[#00BFFF]">*</span>
              </label>
              <select
                id="compBrandSelectDealer"
                className="w-full border border-[#C0C0C0] p-2.5 text-xs focus:outline-none focus:border-[#00BFFF] bg-white text-[#0A1F33] font-bold rounded-none"
                value={compBrandSelectedId}
                onChange={e => setCompBrandSelectedId(e.target.value)}
              >
                {authorizedBrands.length === 0 ? (
                  <option value="">No hay marcas autorizadas asociadas</option>
                ) : (
                  authorizedBrands.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name} {b.origen_marca ? `(${b.origen_marca})` : ''}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="md:col-span-3">
              <label htmlFor="compBrandDealerDateFrom" className="text-[10px] font-bold text-[#0A1F33] uppercase block mb-1">
                Fecha Desde
              </label>
              <input
                id="compBrandDealerDateFrom"
                type="date"
                className="w-full border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#00BFFF] bg-white text-[#0A1F33] rounded-none"
                value={compBrandDateFrom}
                onChange={e => setCompBrandDateFrom(e.target.value)}
              />
            </div>

            <div className="md:col-span-3">
              <label htmlFor="compBrandDealerDateTo" className="text-[10px] font-bold text-[#0A1F33] uppercase block mb-1">
                Fecha Hasta
              </label>
              <input
                id="compBrandDealerDateTo"
                type="date"
                className="w-full border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#00BFFF] bg-white text-[#0A1F33] rounded-none"
                value={compBrandDateTo}
                onChange={e => setCompBrandDateTo(e.target.value)}
              />
            </div>
          </div>

          {/* Resultados del Comparador de Marcas */}
          {brandCompetitorAnalytics.selectedBrand ? (
            <div className="flex flex-col gap-6">
              {/* 4 KPIs Principales de la Marca */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-[#F8F9FA] border-2 border-[#00BFFF] p-5 flex flex-col justify-between">
                  <div>
                    <span className="text-[9px] font-bold text-[#0A1F33] uppercase tracking-wider block mb-1">
                      Comparativas de {brandCompetitorAnalytics.selectedBrand.name}
                    </span>
                    <span className="font-black text-4xl text-[#0A1F33] block" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
                      {brandCompetitorAnalytics.brandTotalComps}
                    </span>
                  </div>
                  <div className="mt-3 pt-2 border-t border-[#C0C0C0]/50 flex justify-between items-center text-[9px]">
                    <span className="text-[#3A3A3C] uppercase font-bold">Muestra total del período:</span>
                    <span className="font-mono font-bold text-[#0A1F33]">{brandCompetitorAnalytics.totalCompsInDateRange} comp.</span>
                  </div>
                </div>

                <div className="bg-[#F8F9FA] border border-[#C0C0C0]/60 p-5 flex flex-col justify-between">
                  <div>
                    <span className="text-[9px] font-bold text-[#C0C0C0] uppercase tracking-wider block mb-1">
                      Cuota de Presencia de Marca
                    </span>
                    <span className="font-black text-4xl text-[#00BFFF] block" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
                      {brandCompetitorAnalytics.marketSharePct}%
                    </span>
                  </div>
                  <span className="text-[8px] text-[#3A3A3C] uppercase font-semibold mt-3 pt-2 border-t border-[#C0C0C0]/50 block">
                    Presente en {brandCompetitorAnalytics.brandTotalComps} de {brandCompetitorAnalytics.totalCompsInDateRange} comparativas
                  </span>
                </div>

                <div className="bg-[#F8F9FA] border border-[#C0C0C0]/60 p-5 flex flex-col justify-between">
                  <div>
                    <span className="text-[9px] font-bold text-[#1E8E3E] uppercase tracking-wider block mb-1">
                      Elegida como 1ra Opción (Slot #1)
                    </span>
                    <span className="font-black text-4xl text-[#1E8E3E] block" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
                      {brandCompetitorAnalytics.slot1Count}
                    </span>
                  </div>
                  <div className="mt-3 pt-2 border-t border-[#C0C0C0]/50 text-[9px] text-[#3A3A3C] font-semibold">
                    Tasa de 1ra elección: <strong className="text-[#1E8E3E]">{brandCompetitorAnalytics.slot1Pct}%</strong> (Retadora: {brandCompetitorAnalytics.challengerCount}x)
                  </div>
                </div>

                <div className="bg-[#F8F9FA] border border-[#C0C0C0]/60 p-5 flex flex-col justify-between">
                  <div>
                    <span className="text-[9px] font-bold text-[#0A1F33] uppercase tracking-wider block mb-1">
                      Marca Rival #1 Principal
                    </span>
                    <span className="font-black text-2xl text-[#0A1F33] truncate block" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
                      {brandCompetitorAnalytics.topCompetingBrands[0]?.brandName || 'Sin rivales'}
                    </span>
                  </div>
                  <div className="mt-3 pt-2 border-t border-[#C0C0C0]/50 text-[9px] text-[#3A3A3C] font-semibold">
                    {brandCompetitorAnalytics.topCompetingBrands[0]
                      ? `${brandCompetitorAnalytics.topCompetingBrands[0].count} cruces directos (${brandCompetitorAnalytics.topCompetingBrands[0].shareOfDuelsPct}% del total de rivales)`
                      : 'Aún sin cruces registrados'}
                  </div>
                </div>
              </div>

              {/* Bloque Principal: Ranking Top Marcas Competidoras + Desglose de Modelos */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Columna Izquierda (7 cols): Top Marcas con las que compite */}
                <div className="lg:col-span-7 bg-[#FFFFFF] border border-[#C0C0C0] p-5 flex flex-col justify-between">
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#C0C0C0]/60 pb-3 mb-4">
                      <div>
                        <span className="bg-[#0A1F33] text-[#00BFFF] text-[8px] font-black uppercase px-2 py-0.5 tracking-widest">
                          Ranking de Competencia Directa
                        </span>
                        <h4 className="text-xs font-black uppercase tracking-wider text-[#0A1F33] mt-1">
                          🏆 Top Marcas con las que Compite {brandCompetitorAnalytics.selectedBrand.name}
                        </h4>
                      </div>
                      <span className="text-[9px] font-bold text-[#3A3A3C] uppercase">
                        {brandCompetitorAnalytics.topCompetingBrands.length} marcas rivales detectadas
                      </span>
                    </div>

                    {brandCompetitorAnalytics.topCompetingBrands.length === 0 ? (
                      <div className="p-8 text-center text-[10px] text-[#C0C0C0] uppercase font-bold">
                        No se registraron enfrentamientos contra otras marcas para {brandCompetitorAnalytics.selectedBrand.name} en este período.
                      </div>
                    ) : (
                      <div className="overflow-x-auto custom-scrollbar max-h-[460px]">
                        <table className="w-full text-left border-collapse text-[10px]">
                          <thead className="bg-[#F8F9FA] sticky top-0 z-10 border-b border-[#C0C0C0]/60 text-[8px] font-bold uppercase text-[#3A3A3C]">
                            <tr>
                              <th className="p-2.5 w-10 text-center">Rank</th>
                              <th className="p-2.5">Marca Competidora</th>
                              <th className="p-2.5 text-center">Cruces</th>
                              <th className="p-2.5 w-36">% Competencia</th>
                              <th className="p-2.5 text-center" title="Veces que tu marca fue elegida en Slot #1 vs la marca rival">1ra Opción (Slot 1)</th>
                              <th className="p-2.5">Duelo Principal de Modelos</th>
                            </tr>
                          </thead>
                          <tbody>
                            {brandCompetitorAnalytics.topCompetingBrands.slice(0, 15).map((rb, idx) => {
                              const isAlsoMyBrand = permittedBrandsUpper.includes(rb.brandName);
                              return (
                                <tr
                                  key={rb.brandName}
                                  className="border-b border-[#F1F5F9] hover:bg-[#F5FBFF] transition-colors"
                                >
                                  <td className="p-2.5 text-center font-mono font-black">
                                    <span className={`inline-block w-6 text-center py-0.5 text-[9px] font-bold ${
                                      idx === 0
                                        ? 'bg-[#0A1F33] text-[#00BFFF]'
                                        : idx === 1
                                          ? 'bg-[#3A3A3C] text-white'
                                          : idx === 2
                                            ? 'bg-[#C0C0C0] text-[#0A1F33]'
                                            : 'bg-[#F0F0F0] text-[#3A3A3C]'
                                    }`}>
                                      #{idx + 1}
                                    </span>
                                  </td>
                                  <td className="p-2.5">
                                    <div className="flex items-center gap-2">
                                      {isAlsoMyBrand ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const matchB = authorizedBrands.find(b => b.id === rb.brandId || (b.name || '').trim().toUpperCase() === rb.brandName);
                                            if (matchB) setCompBrandSelectedId(matchB.id);
                                          }}
                                          className="font-black text-[#0A1F33] hover:text-[#00BFFF] uppercase text-left transition-colors"
                                          title="Click para ver el radar de esta marca tuya"
                                        >
                                          {rb.brandName}
                                        </button>
                                      ) : (
                                        <span className="font-black text-[#0A1F33] uppercase text-left">
                                          {rb.brandName}
                                        </span>
                                      )}
                                      <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 bg-[#F8F9FA] border border-[#C0C0C0]/60 text-[#3A3A3C]">
                                        {rb.origen}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="p-2.5 text-center font-mono font-black text-xs text-[#0A1F33]">
                                    {rb.count}x
                                  </td>
                                  <td className="p-2.5">
                                    <div className="flex items-center justify-between text-[9px] font-bold text-[#0A1F33] mb-1">
                                      <span>{rb.shareOfDuelsPct}% del total rival</span>
                                      <span className="text-[#C0C0C0]">({rb.shareOfBrandCompsPct}% comp.)</span>
                                    </div>
                                    <div className="w-full bg-[#E0E0E0] h-1.5 overflow-hidden">
                                      <div
                                        className="h-full bg-[#00BFFF] transition-all duration-500"
                                        style={{ width: `${rb.shareOfDuelsPct}%` }}
                                      />
                                    </div>
                                  </td>
                                  <td className="p-2.5 text-center whitespace-nowrap">
                                    <span className="text-[9px] font-bold text-[#1E8E3E]" title={`${brandCompetitorAnalytics.selectedBrand?.name} elegido 1º`}>
                                      {rb.focalSlot1Wins}
                                    </span>
                                    <span className="text-[#C0C0C0] mx-1">vs</span>
                                    <span className="text-[9px] font-bold text-[#3A3A3C]" title={`${rb.brandName} elegido 1º`}>
                                      {rb.rivalSlot1Wins}
                                    </span>
                                  </td>
                                  <td className="p-2.5 text-[9px] font-semibold text-[#3A3A3C] truncate max-w-[200px]" title={rb.topModelClash}>
                                    {rb.topModelClash}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                  <div className="mt-4 pt-3 border-t border-[#C0C0C0]/40 flex flex-wrap justify-between items-center gap-2 text-[9px] text-[#3A3A3C]">
                    <span>
                      📊 Muestra de competencia calculada a partir de las decisiones reales de los usuarios en el Comparador DATACAR.
                    </span>
                    {brandCompetitorAnalytics.internalCompCount > 0 && (
                      <span className="bg-[#F8F9FA] border border-[#C0C0C0] px-2 py-0.5 font-bold text-[#0A1F33]">
                        Comparativas internas ({brandCompetitorAnalytics.selectedBrand.name} vs {brandCompetitorAnalytics.selectedBrand.name}): {brandCompetitorAnalytics.internalCompCount}
                      </span>
                    )}
                  </div>
                </div>

                {/* Columna Derecha (5 cols): Top Modelos Rivales Directos + Modelos Propios más comparados */}
                <div className="lg:col-span-5 flex flex-col gap-6">
                  {/* Subtarjeta 1: Top Modelos de Otras Marcas que compiten contra tu Marca */}
                  <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between border-b border-[#C0C0C0]/50 pb-2 mb-3">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[#0A1F33]">
                          🚗 Top 10 Modelos Rivales Contra {brandCompetitorAnalytics.selectedBrand.name}
                        </span>
                        <span className="text-[8px] font-bold text-[#00BFFF] uppercase">Cruces</span>
                      </div>
                      <div className="flex flex-col gap-2.5 max-h-[210px] overflow-y-auto custom-scrollbar pr-1">
                        {brandCompetitorAnalytics.topCompetingModels.length === 0 ? (
                          <p className="text-[10px] text-[#C0C0C0] p-4 text-center uppercase">Sin modelos rivales en este rango.</p>
                        ) : (
                          brandCompetitorAnalytics.topCompetingModels.map((rm, idx) => (
                            <div key={rm.fullName}>
                              <div className="flex justify-between items-center text-[10px] font-bold text-[#0A1F33] mb-1">
                                <span className="flex items-center gap-1.5 truncate">
                                  <span className="text-[8px] bg-[#0A1F33] text-white px-1 font-mono">#{idx + 1}</span>
                                  <span className="truncate">{rm.fullName}</span>
                                  <span className="text-[8px] text-[#3A3A3C] font-normal">({rm.carroceria})</span>
                                </span>
                                <span className="font-mono text-[10px] text-[#00BFFF] shrink-0 font-bold ml-2">
                                  {rm.count}x ({rm.pct}%)
                                </span>
                              </div>
                              <div className="w-full bg-[#E0E0E0] h-1.5 overflow-hidden">
                                <div
                                  className="h-full bg-[#0A1F33] transition-all duration-500"
                                  style={{ width: `${rm.pct}%` }}
                                />
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Subtarjeta 2: Modelos propios de tu marca más comparados */}
                  <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between border-b border-[#C0C0C0]/50 pb-2 mb-3">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[#0A1F33]">
                          📌 Modelos de {brandCompetitorAnalytics.selectedBrand.name} Más Comparados
                        </span>
                        <span className="text-[8px] font-bold text-[#1E8E3E] uppercase">Tracción Propia</span>
                      </div>
                      <div className="flex flex-col gap-2.5 max-h-[190px] overflow-y-auto custom-scrollbar pr-1">
                        {brandCompetitorAnalytics.ownModelsInvolved.length === 0 ? (
                          <p className="text-[10px] text-[#C0C0C0] p-4 text-center uppercase">Sin modelos propios registrados.</p>
                        ) : (
                          brandCompetitorAnalytics.ownModelsInvolved.map((om, idx) => (
                            <div key={om.modelId} className="flex items-center justify-between border-b border-[#F1F5F9] pb-1.5 last:border-none text-[10px]">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-[8px] bg-[#00BFFF] text-[#0A1F33] font-black px-1 font-mono">#{idx + 1}</span>
                                <span className="font-bold text-[#0A1F33] uppercase truncate">{om.modelName}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[9px] text-[#1E8E3E] font-bold" title="Veces elegido como 1ra opción (Slot #1)">
                                  1º: {om.slot1Count}x
                                </span>
                                <span className="font-mono font-black text-[#0A1F33] bg-[#F8F9FA] border border-[#C0C0C0]/60 px-1.5 py-0.5">
                                  {om.count} comp. ({om.pct}%)
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-[#F8F9FA] border border-dashed border-[#C0C0C0] p-10 text-center">
              <p className="text-sm font-bold text-[#0A1F33] uppercase tracking-wider mb-2">
                Seleccioná una marca autorizada en el desplegable superior para ver contra qué marcas compite
              </p>
              <p className="text-[11px] text-[#3A3A3C] max-w-lg mx-auto">
                Descubrí el ranking exacto de marcas competidoras, el porcentaje de cruces frente a cada rival, cuántas veces tu marca fue elegida como primera opción (Slot #1) y cuáles son los modelos que protagonizan los duelos.
              </p>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
