// app/recomendador/page.tsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { FinancialConfig, DEFAULT_FINANCIAL_CONFIG, calcularCuotaFrancesa } from '../../lib/finance';
import { getCachedBrands, getCachedModels, getCachedVersions, getCachedCampaigns } from '../../lib/catalogCache';
import { isOptimizableImageSrc, isValidImageSrc } from '../../lib/imageSrc';

// ==========================================
// UTILIDADES Y DICCIONARIOS B2B
// ==========================================
const ALIAS = {
  HIBRIDO: ['hibrido', 'hybrid', 'hev', 'phev', 'mhev', 'reev', 'eco'],
  ELECTRICO: ['electrico', 'ev', 'bev', '100% electrico'],
  NAFTA: ['nafta', 'flex', 'gasolina'],
  DIESEL: ['diesel', 'tdi', 'crdi'],
  MANUAL: ['manual', 'mt', 'mecanico', 'mecánica'],
  AUTO: ['auto', 'at', 'cvt', 'dct', 'dht', 'tiptronic', 'secuencial'],
  ADAS: ['adas', 'carril', 'colisión', 'colision', 'frenado', 'autónomo', 'ciego', 'crucero adaptativo', 'acc', 'aeb', 'lka', 'ldw'],
  CUERO: ['cuero', 'leather', 'eco-cuero', 'ecocuero', 'piel'],
  TECHO: ['techo', 'panoramico', 'sunroof', 'quemacocos'],
  CAMARA: ['camara', 'cámara', '360', '540', 'retroceso', 'reversa'],
  TRACCION_4X4: ['4x4', 'awd', '4wd', 'integral']
};

const combustibleLabels: Record<string, string> = {
  'EV': 'Eléctrico Puro',
  'PHEV': 'Híbrido Enchufable',
  'HEV': 'Híbrido Convencional',
  'MHEV': 'Micro Híbrido',
  'REEV': 'Rango Extendido',
  'FLEX': 'Nafta/Etanol',
  'NAFTA': 'Combustión Interna',
  'DIESEL': 'Combustión Interna'
};

// ==========================================
// INTERFACES
// ==========================================
interface ModelData {
  id: string; brandId: string; brandName: string; name: string; tipo_carroceria: string; imgUrl: string; origen: string;
}

interface VersionData {
  id: string; modelId: string; name: string; price: number; combustible: string; transmision: string; plazas: number; traccion: string;
  features_raw: string; concesionaria: string;
  equipScore: number; 
}

interface ScoredModel {
  id: string; brandId: string; brandName: string; modelName: string; 
  tipo_carroceria: string; imgUrl: string; startingPrice: number;
  availableFuels: string[]; availableTransmissions: string[]; maxPlazas: number; 
  topFeatures: string[]; dealershipStatus: string;
  score: number; matchPercentage: number; equipScore: number; badge?: string;
  origen: string;
  hasAdas: boolean;
  hasCuero: boolean;
  has4x4: boolean;
  hasTecho: boolean;
  hasCamara: boolean;
}

interface AdCampaign { id: string; sponsor: string; headline: string; highlight: string; price: string; link: string; img: string; location: string; isActive: boolean; targetCategory?: string; }

// Interfaz para definir correctamente los pasos del Wizard y evitar errores de inferencia
interface WizardStep {
  id: string;
  title: string;
  subtitle: string;
  isMultiple: boolean;
  options: { label: string; value: string; desc?: string; icon?: string }[];
}

export default function RecomendadorPage() {
  const [step, setStep] = useState<number>(0); 
  const [answers, setAnswers] = useState<Record<string, any>>({});
  
  const [loading, setLoading] = useState(true);
  const [rawModels, setRawModels] = useState<ModelData[]>([]);
  const [rawVersions, setRawVersions] = useState<VersionData[]>([]);
  const [ads, setAds] = useState<AdCampaign[]>([]);
  const [smartAd, setSmartAd] = useState<AdCampaign | null>(null);
  const [finConfig, setFinConfig] = useState<FinancialConfig>(DEFAULT_FINANCIAL_CONFIG);

  const [tiposDisponibles, setTiposDisponibles] = useState<string[]>([]);
  const [marcasDisponibles, setMarcasDisponibles] = useState<string[]>([]);
  const [origenesDisponibles, setOrigenesDisponibles] = useState<string[]>([]);
  const [plazasDisponibles, setPlazasDisponibles] = useState<number[]>([]);
  const [combustiblesDisponibles, setCombustiblesDisponibles] = useState<string[]>([]);

  const [topMatches, setTopMatches] = useState<ScoredModel[]>([]);
  const [otherMatches, setOtherMatches] = useState<ScoredModel[]>([]);
  
  const [leadForm, setLeadForm] = useState({ nombre: '', telefono: '', email: '' });
  const [feedback, setFeedback] = useState({ type: '', message: '' });
  const [isSubmittingLead, setIsSubmittingLead] = useState(false);

  const [calcVehicle, setCalcVehicle] = useState<ScoredModel | null>(null);
  const [calcForm, setCalcForm] = useState({ entrega: '', plazo: '36' });
  const [cuotaCalculada, setCuotaCalculada] = useState<number | null>(null);

  // ==========================================
  // 1. CARGA Y SANEAMIENTO INTELIGENTE DE DATOS
  // ==========================================
  useEffect(() => {
    const fetchEcosystem = async () => {
      try {
        const [brandsData, modelsData, versionsData, campaignsData, finSnap] = await Promise.all([
          getCachedBrands(),
          getCachedModels(),
          getCachedVersions(),
          getCachedCampaigns(),
          getDoc(doc(db, 'config', 'financial'))
        ]);

        if (finSnap.exists()) setFinConfig(finSnap.data() as FinancialConfig);

        const brandsMap: Record<string, { name: string, origen: string }> = {};
        const tempMarcas = new Set<string>();
        const tempOrigenes = new Set<string>();

        brandsData.forEach((data) => {
          brandsMap[data.id] = { name: data.name, origen: data.origen_marca || 'No Especificado' };
          tempMarcas.add(data.name);
          if (data.origen_marca) tempOrigenes.add(data.origen_marca);
        });

        const tempTipos = new Set<string>();

        const modelsList: ModelData[] = modelsData.map((data) => {
          const cleanTipo = (data.tipo_carroceria || 'Vehículo').trim().toUpperCase();
          tempTipos.add(cleanTipo);

          return {
            id: data.id,
            brandId: data.brandId,
            brandName: brandsMap[data.brandId]?.name || 'Marca',
            name: data.name,
            tipo_carroceria: cleanTipo,
            imgUrl: data.imgUrl || '',
            origen: brandsMap[data.brandId]?.origen || 'Desconocido'
          };
        });

        const tempPlazas = new Set<number>();
        const tempCombustibles = new Set<string>();

        const versionsList: VersionData[] = versionsData.map((v) => {
          const adasStr = v.features?.adas?.join(' ') || '';
          const confortStr = v.features?.confort_conveniencia?.join(' ') || '';
          const rawString = `${adasStr} ${v.features?.asiento_cuero} ${v.features?.techo_panoramico} ${v.specs?.camaras} ${v.specs?.traccion}`.toLowerCase();

          const equipScore = adasStr.length + confortStr.length;

          const plazas = Number(v.specs?.plazas) || 5;
          const combustible = (v.specs?.combustible || '').trim().toUpperCase();

          tempPlazas.add(plazas);
          if (combustible) tempCombustibles.add(combustible);

          return {
            id: v.id, modelId: v.modelId, name: v.name, price: Number(v.price) || 0,
            combustible: combustible,
            transmision: (v.specs?.transmision || '').toLowerCase(),
            plazas: plazas,
            traccion: (v.specs?.traccion || '').toLowerCase(),
            features_raw: rawString,
            equipScore: equipScore,
            concesionaria: v.concesionaria || ''
          };
        });

        const activeAds = (campaignsData as AdCampaign[]).filter(c => c.isActive);

        setTiposDisponibles(Array.from(tempTipos).sort());
        setMarcasDisponibles(Array.from(tempMarcas).sort());
        setOrigenesDisponibles(Array.from(tempOrigenes).sort());
        setPlazasDisponibles(Array.from(tempPlazas).sort((a,b) => a - b));
        setCombustiblesDisponibles(Array.from(tempCombustibles).sort());

        setRawModels(modelsList);
        setRawVersions(versionsList.filter(v => v.price > 0));
        setAds(activeAds);

      } catch (error) { console.error("Error cargando DB:", error); } 
      finally { setLoading(false); }
    };
    fetchEcosystem();
  }, []);

  // ==========================================
  // 2. CONSTRUCCIÓN DINÁMICA DEL WIZARD
  // ==========================================
  const WIZARD_STEPS: WizardStep[] = useMemo(() => [
    {
      id: 'conocimiento', title: '¿Cuánto sabés de autos?', subtitle: 'Esto nos ayuda a hacerte las preguntas correctas.', isMultiple: false,
      options: [
        { label: 'Sé bastante', desc: 'Tengo claro qué busco', value: 'experto', icon: '🏎️' },
        { label: 'No tanto', desc: 'Necesito orientación', value: 'novato', icon: '🧭' }
      ]
    },
    {
      id: 'carroceria', title: '¿Qué tipo de auto buscás?', subtitle: 'Leemos directamente del mercado. Podés elegir varios.', isMultiple: true,
      options: [
        ...tiposDisponibles.map(t => ({ label: t, value: t, icon: '🚗' })),
        { label: 'Sin preferencia', value: 'any', icon: '⚖️' }
      ]
    },
    {
      id: 'marcas', title: '¿Tenés alguna marca en mente?', subtitle: 'Podés elegir varias o ninguna.', isMultiple: true,
      options: [
        ...marcasDisponibles.slice(0, 14).map(m => ({ label: m, value: m })),
        { label: 'Sin preferencia', value: 'any' }
      ]
    },
    {
      id: 'presupuesto', title: '¿Qué presupuesto tenés en mente?', subtitle: 'Nos ayuda a acotar las opciones reales.', isMultiple: false,
      options: [
        { label: 'Hasta US$ 18.000', value: '18000', icon: '💵' },
        { label: 'US$ 18.000 a US$ 25.000', value: '25000', icon: '💰' },
        { label: 'US$ 25.000 a US$ 40.000', value: '40000', icon: '💳' },
        { label: 'Más de US$ 40.000', value: '999999', icon: '💎' }
      ]
    },
    {
      id: 'origen', title: '¿Preferís algún origen de fabricación?', subtitle: 'Cargado según el portafolio actual de marcas.', isMultiple: true,
      options: [
        ...origenesDisponibles.map(o => ({ label: o, value: o, icon: '🌍' })),
        { label: 'Me da igual', value: 'any', icon: '⚖️' }
      ]
    },
    {
      id: 'plazas', title: '¿Cuántas plazas necesitás?', subtitle: 'Pensá en el uso habitual.', isMultiple: false,
      options: [
        ...plazasDisponibles.map(p => ({ label: `${p} Plazas`, desc: `Capacidad para ${p} ocupantes`, value: p.toString(), icon: '👨‍👩‍👧‍👦' })),
        { label: 'Sin preferencia', value: 'any', icon: '⚖️' }
      ]
    },
    {
      id: 'combustible', title: '¿Qué combustible preferís?', subtitle: 'Motorizaciones exactas disponibles en Paraguay.', isMultiple: true,
      options: [
        ...combustiblesDisponibles.map(c => ({ label: c, desc: combustibleLabels[c] || 'Motorización Específica', value: c, icon: '⛽' })),
        { label: 'Me da igual', desc: 'Cualquier motor', value: 'any', icon: '⚖️' }
      ]
    },
    {
      id: 'transmision', title: '¿Qué tipo de caja preferís?', subtitle: 'La transmisión que más te acomoda.', isMultiple: false,
      options: [
        { label: 'Manual', desc: 'Control total (MT)', value: 'Manual', icon: '⚙️' },
        { label: 'Automática', desc: 'Comodidad (AT, CVT, DCT)', value: 'Automatica', icon: 'A' },
        { label: 'Me da igual', desc: '', value: 'any', icon: '⚖️' }
      ]
    },
    {
      id: 'features', title: '¿Qué cosas son importantes para vos?', subtitle: 'Seleccioná las que te interesan.', isMultiple: true,
      options: [
        { label: 'Cámara / Sensores', value: 'camara', icon: '🅿️' },
        { label: 'Asistencias de manejo (ADAS)', value: 'adas', icon: '🛡️' },
        { label: 'Asientos de Cuero', value: 'cuero', icon: '🛋️' },
        { label: 'Techo panorámico', value: 'techo', icon: '☀️' },
        { label: 'Tracción 4x4 / integral', value: '4x4', icon: '⛰️' },
        { label: 'No tengo preferencia', value: 'any', icon: '⚖️' }
      ]
    }
  ], [tiposDisponibles, marcasDisponibles, origenesDisponibles, plazasDisponibles, combustiblesDisponibles]);

  // ==========================================
  // 3. LÓGICA DE NAVEGACIÓN Y RESPUESTAS
  // ==========================================
  const handleAnswerClick = (questionId: string, value: string, isMultiple: boolean) => {
    if (!isMultiple) {
      setAnswers(prev => ({ ...prev, [questionId]: value }));
      // UX Tweak: Retraso para que el usuario perciba que se guardó el click
      setTimeout(() => setStep(step + 1), 300);
    } else {
      setAnswers(prev => {
        const currentAnswers = prev[questionId] || [];
        if (value === 'any') return { ...prev, [questionId]: ['any'] }; 
        
        let newAnswers = currentAnswers.filter((a: string) => a !== 'any');
        if (newAnswers.includes(value)) {
          newAnswers = newAnswers.filter((a: string) => a !== value);
        } else {
          newAnswers.push(value);
        }
        return { ...prev, [questionId]: newAnswers };
      });
    }
  };

  const advanceMultiple = (questionId: string) => {
    const current = answers[questionId];
    if (!current || current.length === 0) setAnswers(prev => ({ ...prev, [questionId]: ['any'] }));
    setStep(step + 1);
  };

  // ==========================================
  // 4. ALGORITMO B2B DE RANKING Y ETIQUETADO
  // ==========================================
  const runAlgorithm = () => {
    const consolidatedModels: ScoredModel[] = rawModels.map(model => {
      const mVersions = rawVersions.filter(v => v.modelId === model.id);
      
      const startingPrice = mVersions.length > 0 ? Math.min(...mVersions.map(v => v.price)) : 9999999;
      const fuels = Array.from(new Set(mVersions.map(v => v.combustible)));
      const trans = Array.from(new Set(mVersions.map(v => v.transmision)));
      const maxPlazas = mVersions.length > 0 ? Math.max(...mVersions.map(v => v.plazas)) : 5;
      
      const maxEquipScore = mVersions.length > 0 ? Math.max(...mVersions.map(v => v.equipScore)) : 0;

      const modelRawFeatures = mVersions.map(v => v.features_raw).join(' ');
      const hasAdas = ALIAS.ADAS.some(alias => modelRawFeatures.includes(alias));
      const hasCuero = ALIAS.CUERO.some(alias => modelRawFeatures.includes(alias));
      const hasTecho = ALIAS.TECHO.some(alias => modelRawFeatures.includes(alias));
      const hasCamara = ALIAS.CAMARA.some(alias => modelRawFeatures.includes(alias));
      const has4x4 = ALIAS.TRACCION_4X4.some(alias => modelRawFeatures.includes(alias)) || mVersions.some(v => ALIAS.TRACCION_4X4.some(alias => v.traccion.includes(alias)));

      // Extracción de Píldoras para UI
      const extractedFeatures = [];
      if(hasAdas) extractedFeatures.push('ADAS');
      if(hasCuero) extractedFeatures.push('Tapizado de Cuero');
      if(hasCamara) extractedFeatures.push('Cámara 360/Reversa');
      if(hasTecho) extractedFeatures.push('Techo Panorámico');
      if(has4x4) extractedFeatures.push('Tracción 4x4');

      // Cálculo de competencia de concesionarias
      const dealershipCount = new Set(mVersions.map(v => v.concesionaria).filter(Boolean)).size;
      const dealershipStatus = dealershipCount > 1 ? `${dealershipCount} concesionarias compiten` : '1 concesionaria disponible';

      return {
        id: model.id, brandId: model.brandId, brandName: model.brandName, modelName: model.name,
        tipo_carroceria: model.tipo_carroceria, imgUrl: model.imgUrl, startingPrice,
        availableFuels: fuels, availableTransmissions: trans, maxPlazas,
        hasAdas, hasCuero, has4x4, hasTecho, hasCamara, 
        topFeatures: extractedFeatures.slice(0, 4), dealershipStatus,
        score: 0, matchPercentage: 0, equipScore: maxEquipScore,
        origen: model.origen
      };
    });

    const scoredList = consolidatedModels.map(auto => {
      let score = 10; 
      let maxScore = 10; 

      // DEAL-BREAKERS (Excluyentes)
      const budgetMap: Record<string, number> = { '18000': 18000, '25000': 25000, '40000': 40000, '999999': 9999999 };
      const maxBudget = budgetMap[answers['presupuesto']] || 9999999;
      if (auto.startingPrice > maxBudget * 1.15) return null; // Hard Reject: Fuera de presupuesto

      if (answers['plazas'] && answers['plazas'] !== 'any') {
        const reqPlazas = Number(answers['plazas']);
        if (reqPlazas === 7 && auto.maxPlazas < 7) return null; // Hard Reject: Faltan plazas
        if (reqPlazas === 5 && auto.maxPlazas < 4) return null; // Hard Reject
      }

      // SOFT PREFERENCES (Puntuables)
      const ansCarroceria = answers['carroceria'] || [];
      if (!ansCarroceria.includes('any') && ansCarroceria.length > 0) {
        maxScore += 20;
        if (ansCarroceria.some((c: string) => auto.tipo_carroceria === c)) score += 20;
      }

      const ansMarcas = answers['marcas'] || [];
      if (!ansMarcas.includes('any') && ansMarcas.length > 0) {
        maxScore += 20;
        if (ansMarcas.some((m: string) => auto.brandName === m)) score += 20;
      }

      const ansOrigen = answers['origen'] || [];
      if (!ansOrigen.includes('any') && ansOrigen.length > 0) {
        maxScore += 10;
        if (ansOrigen.some((o: string) => auto.origen === o)) score += 10;
      }

      const ansComb = answers['combustible'] || [];
      if (!ansComb.includes('any') && ansComb.length > 0) {
        maxScore += 15;
        if (auto.availableFuels.some(f => ansComb.includes(f))) score += 15;
      }

      const autoTransStr = auto.availableTransmissions.join(' ');
      if (answers['transmision'] && answers['transmision'] !== 'any') {
        maxScore += 15;
        if (answers['transmision'] === 'Automatica' && ALIAS.AUTO.some(a => autoTransStr.includes(a))) score += 15;
        if (answers['transmision'] === 'Manual' && ALIAS.MANUAL.some(a => autoTransStr.includes(a))) score += 15;
      }

      const ansFeat = answers['features'] || [];
      if (!ansFeat.includes('any') && ansFeat.length > 0) {
        ansFeat.forEach((feat: string) => {
          maxScore += 10;
          if (feat === 'camara' && auto.hasCamara) score += 10;
          if (feat === 'adas' && auto.hasAdas) score += 10;
          if (feat === 'cuero' && auto.hasCuero) score += 10;
          if (feat === 'techo' && auto.hasTecho) score += 10;
          if (feat === '4x4' && auto.has4x4) score += 10;
        });
      }

      let matchPercentage = Math.round((score / maxScore) * 100);
      if (matchPercentage > 99) matchPercentage = 98 + Math.floor(Math.random() * 2); 
      if (matchPercentage < 35) matchPercentage = 35 + Math.floor(Math.random() * 15); 

      return { ...auto, score, matchPercentage };
    }).filter(a => a !== null); // Limpiamos los rechazados

    // Ordenamiento Base
    let validMatches = (scoredList as ScoredModel[]).sort((a, b) => b.score - a.score);
    
    // Categorización de Pestañas Top 3
    let finalTop3: ScoredModel[] = [];
    
    if (validMatches.length >= 3) {
      // 1. Más Económico
      let cheapest = [...validMatches].sort((a, b) => a.startingPrice - b.startingPrice)[0];
      cheapest.badge = '💰 Más Económico';
      finalTop3.push(cheapest);
      validMatches = validMatches.filter(m => m.id !== cheapest.id);

      // 2. Tope de Gama (Mayor equipScore matemático)
      if (validMatches.length > 0) {
        let topEquipped = [...validMatches].sort((a, b) => b.equipScore - a.equipScore)[0];
        topEquipped.badge = '💎 Tope de Gama';
        finalTop3.push(topEquipped);
        validMatches = validMatches.filter(m => m.id !== topEquipped.id);
      }

      // 3. Opción Equilibrada (Mejor Match Restante)
      if (validMatches.length > 0) {
        let balanced = validMatches[0];
        balanced.badge = '⚖️ Opción Equilibrada';
        finalTop3.push(balanced);
        validMatches = validMatches.filter(m => m.id !== balanced.id);
      }
    } else {
      finalTop3 = validMatches; // Fallback si hay < 3 resultados
    }

    setTopMatches(finalTop3);
    setOtherMatches(validMatches.slice(0, 4));

    // Ads Contextuales
    const winningBrand = finalTop3[0]?.brandName.toLowerCase();
    const winningCategory = finalTop3[0]?.tipo_carroceria.toLowerCase();
    
    let selectedAd = ads.find(a => a.sponsor.toLowerCase() === winningBrand);
    if (!selectedAd) selectedAd = ads.find(a => a.targetCategory?.toLowerCase() === winningCategory);
    if (!selectedAd) {
      selectedAd = {
        id: 'fallback_datacar', sponsor: 'Servicio DATACAR',
        headline: '¿Cansado de negociar', highlight: 'con vendedores?',
        price: 'Asesoría Premium', link: '/negociamos-por-vos',
        img: 'https://via.placeholder.com/600x400/0A1F33/00BFFF?text=Negociamos+por+vos', 
        location: 'recomendador', isActive: true
      };
    }
    setSmartAd(selectedAd);
  };

  // ==========================================
  // 5. LEAD CAPTURE (EL GATILLO B2B)
  // ==========================================
  const submitLeadAndShowResults = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingLead(true);
    setFeedback({ type: '', message: 'Analizando base de datos automotriz...' });
    
    const phoneRegex = /^09\d{8}$/;
    if (!phoneRegex.test(leadForm.telefono)) {
      setFeedback({ type: 'error', message: 'El celular debe tener 10 dígitos y empezar con 09.' });
      setIsSubmittingLead(false); return;
    }

    try {
      await addDoc(collection(db, 'leads'), {
        nombre: leadForm.nombre,
        telefono: leadForm.telefono,
        email: leadForm.email || 'No proporcionado',
        vehiculo: 'Perfilado por Recomendador Interactivo',
        origen: 'Recomendador Interactivo',
        estado: 'Nuevo',
        preferencias_wizard: answers, 
        concesionaria_destino: 'A designar (Central DATACAR)',
        createdAt: serverTimestamp()
      });

      runAlgorithm();
      setStep(WIZARD_STEPS.length + 2); // Salta a Resultados
    } catch (error) {
      setFeedback({ type: 'error', message: 'Error de conexión. Intenta nuevamente.' });
    } finally {
      setIsSubmittingLead(false);
    }
  };

  const handleCalculate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!calcVehicle) return;
    const entregaNum = Number(calcForm.entrega) || 0;
    const plazoNum = Number(calcForm.plazo) || 36;
    
    if (entregaNum >= calcVehicle.startingPrice) { alert('La entrega debe ser menor al precio total.'); return; }

    setCuotaCalculada(calcularCuotaFrancesa(calcVehicle.startingPrice, entregaNum, plazoNum, finConfig));
  };

  if (loading) return <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center font-bold text-[#0A1F33] tracking-widest uppercase text-sm">Cargando inteligencia de mercado...</div>;

  return (
    <main className="min-h-screen bg-[#F8F9FA] text-[#3A3A3C] font-sans flex flex-col">
      
      {/* NAVBAR FLAT */}
      <nav className="w-full bg-[#FFFFFF] border-b border-[#C0C0C0] px-4 md:px-8 py-4 flex justify-between items-center sticky top-0 z-50 shadow-none">
        <div className="font-black text-2xl tracking-widest text-[#0A1F33] uppercase" style={{ fontFamily: 'Montserrat, sans-serif' }}>
          <Link href="/">DATA<span className="font-light">CAR</span></Link>
        </div>
        <Link href="/catalogo" className="bg-[#FFFFFF] border border-[#0A1F33] text-[#0A1F33] font-bold text-[11px] uppercase tracking-widest py-2 px-6 hover:bg-[#0A1F33] hover:text-[#FFFFFF] transition-colors rounded-none">
          Salir
        </Link>
      </nav>

      {/* ==========================================
          PASO 0: INTRODUCCIÓN
          ========================================== */}
      {step === 0 && (
        <section className="flex-grow flex flex-col items-center justify-center p-4 py-16">
          <div className="max-w-xl w-full bg-[#FFFFFF] border border-[#C0C0C0] p-12 text-center rounded-none shadow-none">
            <h1 className="font-black text-4xl md:text-5xl text-[#0A1F33] uppercase mb-4 leading-tight" style={{ fontFamily: 'Montserrat, sans-serif' }}>
              ENCONTRÁ TU <br/><span className="text-[#00BFFF]">AUTO IDEAL</span>
            </h1>
            <p className="text-sm text-[#3A3A3C] mb-10 leading-relaxed font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
              Respondé algunas preguntas y te ayudamos a encontrar el 0km perfecto para vos, basado en tu estilo de vida y preferencias.
            </p>
            <button onClick={() => setStep(1)} className="w-full bg-[#00BFFF] hover:bg-[#0A1F33] text-[#FFFFFF] font-bold text-sm uppercase tracking-widest py-5 transition-colors flex justify-center items-center gap-2 rounded-none">
              Empezar <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
            </button>
            <p className="text-[10px] text-[#C0C0C0] uppercase tracking-widest mt-6">Toma menos de 2 minutos</p>
          </div>
        </section>
      )}

      {/* ==========================================
          PASOS 1-10: WIZARD DE PREGUNTAS DINÁMICAS
          ========================================== */}
      {step > 0 && step <= WIZARD_STEPS.length && (
        <section className="flex-grow flex flex-col">
          {/* Barra de Progreso */}
          <div className="w-full bg-[#FFFFFF] py-6 px-4 md:px-8 border-b border-[#C0C0C0] flex flex-col items-center">
            <div className="max-w-3xl w-full flex justify-between items-center mb-2">
               <span className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest">Pregunta {step} de {WIZARD_STEPS.length}</span>
               <span className="text-[10px] font-bold text-[#00BFFF] uppercase tracking-widest">{Math.round((step/WIZARD_STEPS.length)*100)}%</span>
            </div>
            <div className="max-w-3xl w-full h-2 bg-[#F5F5F5] border border-[#C0C0C0]/50 rounded-none">
              <div className="h-full bg-[#00BFFF] transition-all duration-300" style={{ width: `${(step / WIZARD_STEPS.length) * 100}%` }}></div>
            </div>
          </div>
          
          <div className="flex-grow flex flex-col items-center justify-start pt-12 p-4">
            <div className="max-w-3xl w-full">
              <div className="mb-10 text-center">
                <h2 className="font-black text-3xl md:text-4xl text-[#0A1F33] mb-2" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                  {WIZARD_STEPS[step - 1].title}
                </h2>
                <p className="text-sm text-[#C0C0C0] font-medium">{WIZARD_STEPS[step - 1].subtitle}</p>
              </div>

              {/* Grid Dinámico Flat */}
              <div className={`grid gap-4 ${WIZARD_STEPS[step - 1].id === 'marcas' ? 'grid-cols-2 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2'}`}>
                {WIZARD_STEPS[step - 1].options.map((opt, i) => {
                  const qId = WIZARD_STEPS[step - 1].id;
                  const isMultiple = WIZARD_STEPS[step - 1].isMultiple;
                  const isSelected = isMultiple ? (answers[qId] || []).includes(opt.value) : answers[qId] === opt.value;

                  return (
                    <button 
                      key={i} 
                      onClick={() => handleAnswerClick(qId, opt.value, isMultiple)} 
                      className={`bg-[#FFFFFF] border p-6 transition-colors flex flex-row items-center gap-4 text-left group rounded-none
                        ${isSelected ? 'border-[#00BFFF] bg-[#F5FBFF]' : 'border-[#C0C0C0] hover:border-[#0A1F33]'}`}
                    >
                      {opt.icon && (
                        <div className={`w-10 h-10 flex items-center justify-center text-xl shrink-0 ${isSelected ? '' : 'grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100'}`}>
                          {opt.icon}
                        </div>
                      )}
                      <div className="flex-grow">
                        <span className={`font-bold text-sm block ${isSelected ? 'text-[#00BFFF]' : 'text-[#3A3A3C] group-hover:text-[#0A1F33]'}`}>{opt.label}</span>
                        {opt.desc && <span className="text-[10px] text-[#C0C0C0] mt-1 block">{opt.desc}</span>}
                      </div>
                      {isMultiple && (
                        <div className={`w-4 h-4 rounded-none border shrink-0 flex items-center justify-center ${isSelected ? 'border-[#00BFFF] bg-[#00BFFF]' : 'border-[#C0C0C0]'}`}>
                           {isSelected && <div className="w-2 h-2 bg-[#FFFFFF]"></div>}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {WIZARD_STEPS[step - 1].isMultiple && (
                <div className="mt-8 text-center">
                  <button 
                    onClick={() => advanceMultiple(WIZARD_STEPS[step-1].id)} 
                    disabled={!answers[WIZARD_STEPS[step-1].id] || answers[WIZARD_STEPS[step-1].id].length === 0}
                    className="bg-[#0A1F33] hover:bg-[#00BFFF] text-[#FFFFFF] font-bold text-xs uppercase tracking-widest py-4 px-12 transition-colors inline-block disabled:opacity-30 disabled:bg-[#C0C0C0] disabled:cursor-not-allowed rounded-none"
                  >
                    Continuar →
                  </button>
                  <button onClick={() => { setAnswers(prev => ({...prev, [WIZARD_STEPS[step-1].id]: ['any']})); setStep(step+1); }} className="block mx-auto mt-4 text-[10px] text-[#C0C0C0] hover:text-[#0A1F33] font-bold uppercase tracking-widest underline">
                    Saltar pregunta
                  </button>
                </div>
              )}

              {step > 1 && (
                <button onClick={() => setStep(step - 1)} className="mt-12 text-[10px] font-bold text-[#C0C0C0] hover:text-[#0A1F33] uppercase tracking-widest flex items-center justify-center w-full transition-colors border-none bg-transparent">
                  ← Volver a la pregunta anterior
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ==========================================
          PASO 11: LEAD CAPTURE (Gatillo B2B)
          ========================================== */}
      {step === WIZARD_STEPS.length + 1 && (
        <section className="flex-grow flex flex-col items-center justify-center p-4 py-16 relative">
          {/* Skeleton Falso de Fondo (Psicología de Recompensa) */}
          <div className="absolute inset-0 flex justify-center items-center opacity-10 pointer-events-none -z-10 overflow-hidden">
            <div className="grid grid-cols-3 gap-6 w-full max-w-[1200px]">
              <div className="h-64 bg-[#C0C0C0] w-full animate-pulse"></div>
              <div className="h-64 bg-[#C0C0C0] w-full animate-pulse"></div>
              <div className="h-64 bg-[#C0C0C0] w-full animate-pulse"></div>
            </div>
          </div>

          <div className="max-w-xl w-full bg-[#FFFFFF] border-t-4 border-[#00BFFF] border-l border-r border-b border-[#C0C0C0] p-10 shadow-none z-10">
            <h2 className="font-black text-3xl text-[#0A1F33] uppercase mb-2 text-center" style={{ fontFamily: 'Montserrat, sans-serif' }}>Generando Reporte</h2>
            <p className="text-[11px] text-[#3A3A3C] text-center uppercase tracking-widest mb-8 font-medium">100% analizado. Encontramos tus opciones ideales.</p>
            
            <div className="bg-[#E6F4EA] border border-[#1E8E3E]/30 p-4 mb-8 text-center rounded-none">
              <p className="text-[10px] font-bold text-[#1E8E3E] uppercase tracking-widest">Validación de Identidad</p>
              <p className="text-xs text-[#1E8E3E]/80 mt-1">Ingresa tus datos para desbloquear los modelos sugeridos y enviarte el PDF comparativo.</p>
            </div>

            <form onSubmit={submitLeadAndShowResults} className="flex flex-col gap-4">
              <div>
                <input type="text" placeholder="Nombre Completo" className="w-full border border-[#C0C0C0] p-4 text-xs focus:outline-none focus:border-[#0A1F33] bg-[#F8F9FA] rounded-none" required value={leadForm.nombre} onChange={e=>setLeadForm({...leadForm, nombre: e.target.value})} />
              </div>
              <div>
                <input type="tel" minLength={10} maxLength={10} placeholder="Celular (Ej: 0981234567)" className="w-full border border-[#C0C0C0] p-4 text-xs focus:outline-none focus:border-[#0A1F33] bg-[#F8F9FA] rounded-none" required value={leadForm.telefono} onChange={e=>setLeadForm({...leadForm, telefono: e.target.value})} />
              </div>
              <div>
                <input type="email" placeholder="Correo Electrónico (Opcional)" className="w-full border border-[#C0C0C0] p-4 text-xs focus:outline-none focus:border-[#0A1F33] bg-[#F8F9FA] rounded-none" value={leadForm.email} onChange={e=>setLeadForm({...leadForm, email: e.target.value})} />
              </div>
              
              <button type="submit" disabled={isSubmittingLead} className="w-full bg-[#00BFFF] hover:bg-[#0A1F33] text-[#FFFFFF] font-bold text-xs uppercase tracking-widest py-5 transition-colors mt-2 disabled:opacity-50 flex items-center justify-center gap-2 rounded-none">
                {isSubmittingLead ? 'Procesando...' : 'Ver Resultados Exactos'} <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
              </button>
              
              <p className="text-[10px] text-center text-[#C0C0C0] uppercase tracking-widest mt-2">
                🔒 Tus datos están encriptados. No enviamos spam.
              </p>
              
              {feedback.message && <p className={`text-[10px] text-center font-bold uppercase tracking-widest mt-2 ${feedback.type==='error'?'text-[#D93025]':'text-[#00BFFF]'}`}>{feedback.message}</p>}
            </form>
          </div>
        </section>
      )}

      {/* ==========================================
          PASO 12: RESULTADOS (LA REVELACIÓN B2B)
          ========================================== */}
      {step === WIZARD_STEPS.length + 2 && (
        <section className="flex-grow w-full pb-20">
          <div className="w-full bg-[#FFFFFF] border-b border-[#C0C0C0] py-12 px-4 text-center">
            <span className="text-[10px] font-bold text-[#00BFFF] uppercase tracking-widest block mb-2">Tu Resultado</span>
            <h2 className="font-black text-3xl md:text-4xl text-[#0A1F33] uppercase" style={{ fontFamily: 'Montserrat, sans-serif' }}>
              Elegidos por <span className="text-[#00BFFF]">DATACAR</span>
            </h2>
          </div>

          <div className="max-w-[1200px] mx-auto px-4 lg:px-8 mt-12">
            
            {/* ALERTA DE CONTINGENCIA (Flat Design) */}
            {topMatches.length > 0 && topMatches[0].matchPercentage < 80 && (
              <div className="bg-[#F5FBFF] border border-[#00BFFF] p-6 mb-8 flex gap-4 items-start shadow-none rounded-none">
                <div className="w-6 h-6 bg-[#00BFFF] text-[#FFFFFF] flex items-center justify-center font-black rounded-none shrink-0">!</div>
                <div>
                  <p className="text-[11px] font-bold text-[#0A1F33] uppercase tracking-widest mb-1">Ampliamos la búsqueda para mostrarte opciones</p>
                  <p className="text-xs text-[#3A3A3C]">No encontramos vehículos que cumplan exactamente con el 100% de tus combinaciones excluyentes. Te mostramos las mejores alternativas viables en el país.</p>
                </div>
              </div>
            )}

            {/* MATCHES PRINCIPALES CON BADGES B2B */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
              {topMatches.map((model) => (
                <article key={model.id} className="bg-[#FFFFFF] border border-[#C0C0C0] border-t-4 border-t-[#0A1F33] flex flex-col hover:border-[#00BFFF] transition-colors relative group rounded-none shadow-none">
                  
                  {/* % Match Box */}
                  <div className="absolute top-4 left-4 bg-[#F8F9FA] border border-[#C0C0C0] text-[#3A3A3C] font-black text-[10px] uppercase tracking-widest px-3 py-1.5 z-10 flex items-center gap-2">
                    <span className="text-[#00BFFF]">•</span> {model.matchPercentage}% Match
                  </div>

                  {/* INSIGNIA B2B INTELIGENTE */}
                  {model.badge && (
                    <div className="absolute top-4 right-4 bg-[#0A1F33] text-[#FFFFFF] font-bold text-[9px] uppercase tracking-widest px-3 py-1.5 z-10">
                      {model.badge}
                    </div>
                  )}

                  <div className="relative p-4 h-56 border-b border-[#C0C0C0]/20 bg-[#F8F9FA]">
                    {isValidImageSrc(model.imgUrl) ? (
                      <Image
                        src={model.imgUrl}
                        alt={model.modelName}
                        fill
                        sizes="(max-width: 768px) 100vw, 33vw"
                        className="object-contain p-4 group-hover:scale-105 transition-transform duration-500"
                        unoptimized={!isOptimizableImageSrc(model.imgUrl)}
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-[#C0C0C0] uppercase tracking-widest">Sin Imagen</div>
                    )}
                  </div>
                  
                  <div className="p-6 flex flex-col flex-grow">
                    <p className="text-[10px] font-bold text-[#C0C0C0] uppercase tracking-widest truncate">{model.brandName}</p>
                    <h3 className="font-black text-xl text-[#0A1F33] uppercase leading-tight mb-4" style={{ fontFamily: 'Montserrat, sans-serif' }}>{model.modelName}</h3>
                    
                    {/* MATRIZ DE PÍLDORAS (PILL TAGS) */}
                    <div className="flex flex-wrap gap-1.5 mb-6">
                      <span className="bg-[#F5F5F5] border border-[#C0C0C0]/50 text-[#3A3A3C] text-[8px] font-bold uppercase px-2 py-1 truncate max-w-[120px] rounded-none">{model.availableFuels.join(' / ')}</span>
                      <span className="bg-[#F5F5F5] border border-[#C0C0C0]/50 text-[#3A3A3C] text-[8px] font-bold uppercase px-2 py-1 truncate max-w-[120px] rounded-none">{model.availableTransmissions.join(' / ')}</span>
                      <span className="bg-[#F5F5F5] border border-[#C0C0C0]/50 text-[#3A3A3C] text-[8px] font-bold uppercase px-2 py-1 truncate max-w-[120px] rounded-none">Hasta {model.maxPlazas} Plazas</span>
                      {model.topFeatures.map((feat, idx) => (
                        <span key={idx} className="bg-[#F5F5F5] border border-[#C0C0C0]/50 text-[#3A3A3C] text-[8px] font-bold uppercase px-2 py-1 rounded-none">{feat}</span>
                      ))}
                    </div>

                    <div className="mt-auto pt-4 border-t border-[#C0C0C0]/50">
                      <span className="text-[9px] text-[#C0C0C0] font-bold uppercase tracking-widest block mb-0.5">Precio Desde</span>
                      <span className="font-black text-2xl text-[#0A1F33] block mb-4" style={{ fontFamily: 'Montserrat, sans-serif' }}>US$ {model.startingPrice.toLocaleString()}</span>
                      
                      {/* TACTICA B2B: Competencia de Agencias */}
                      <div className="border border-[#C0C0C0] p-2 text-center text-[10px] uppercase font-bold text-[#3A3A3C] mb-4 bg-[#F8F9FA]">
                         {model.dealershipStatus}
                      </div>

                      <div className="flex flex-col gap-2">
                        <button onClick={() => { setCalcVehicle(model); setCuotaCalculada(null); }} className="w-full bg-[#00BFFF] hover:bg-[#0A1F33] text-[#FFFFFF] font-bold text-[10px] uppercase tracking-widest py-3 transition-colors flex justify-center items-center gap-1 rounded-none">
                            Consultar / Simular
                        </button>
                        <Link href={`/catalogo/${model.brandId}/${model.id}`} className="w-full text-center bg-[#FFFFFF] border border-[#0A1F33] text-[#0A1F33] hover:bg-[#F5F5F5] font-bold text-[9px] uppercase tracking-widest py-3 transition-colors rounded-none">
                          Ver Detalles Técnicos
                        </Link>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {/* BANNER B2B NEGOCIACIÓN (ROMPEOLAS) */}
            <div className="bg-[#0A1F33] border border-[#0A1F33] p-8 md:p-12 mb-12 flex flex-col md:flex-row justify-between items-center gap-8 relative overflow-hidden rounded-none shadow-none">
              <span className="absolute top-4 left-4 bg-[#FFFFFF]/10 border border-[#FFFFFF]/20 text-[#FFFFFF] text-[8px] font-bold uppercase tracking-widest px-3 py-1 inline-block z-20">Servicio DATACAR</span>
              <div className="md:w-1/3 z-10 text-center md:text-left mt-6 md:mt-0">
                <h3 className="font-black text-3xl text-[#FFFFFF] uppercase leading-tight mb-2" style={{ fontFamily: 'Montserrat, sans-serif' }}>¿Indeciso? <br/>Negociamos por vos</h3>
                <p className="text-[11px] text-[#C0C0C0] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>Analizamos las opciones y peleamos el mejor precio directo en concesionaria oficial.</p>
              </div>

              <div className="md:w-2/3 flex flex-col sm:flex-row gap-4 w-full z-10">
                <div className="bg-[#FFFFFF]/5 border border-[#FFFFFF]/20 p-6 flex-1 hover:border-[#00BFFF] transition-colors text-center md:text-left">
                  <span className="text-[9px] text-[#00BFFF] font-bold uppercase tracking-widest block mb-2">Opción 1</span>
                  <h4 className="font-bold text-[#FFFFFF] text-sm uppercase mb-1">Comparar Manualmente</h4>
                  <p className="text-[10px] text-[#C0C0C0] mb-4">Usa nuestra herramienta B2B.</p>
                  <Link href="/comparador" className="w-full block border border-[#FFFFFF] text-[#FFFFFF] hover:bg-[#FFFFFF] hover:text-[#0A1F33] font-bold text-[10px] uppercase tracking-widest py-3 transition-colors text-center rounded-none">Ir al Comparador →</Link>
                </div>
                <div className="bg-[#FFFFFF]/5 border border-[#FFFFFF]/20 p-6 flex-1 hover:border-[#00BFFF] transition-colors text-center md:text-left">
                  <span className="text-[9px] text-[#00BFFF] font-bold uppercase tracking-widest block mb-2">Opción 2</span>
                  <h4 className="font-bold text-[#FFFFFF] text-sm uppercase mb-1">Delegar Compra</h4>
                  <p className="text-[10px] text-[#C0C0C0] mb-4">Ahorro y cero estrés garantizado.</p>
                  <Link href="/negociamos-por-vos" className="w-full block bg-[#00BFFF] text-[#0A1F33] hover:bg-[#FFFFFF] font-bold text-[10px] uppercase tracking-widest py-3 transition-colors border border-transparent text-center rounded-none">Delegar Ahora →</Link>
                </div>
              </div>
            </div>

            {/* INYECCIÓN SMART AD */}
            {smartAd && (
              <a href={smartAd.link} target="_blank" rel="noopener noreferrer" className="block w-full bg-[#FFFFFF] border border-[#C0C0C0] flex flex-col md:flex-row items-center p-8 mb-12 relative group hover:border-[#0A1F33] transition-colors shadow-none rounded-none">
                <span className="absolute top-4 left-4 bg-[#F5F5F5] border border-[#C0C0C0] text-[#3A3A3C] text-[8px] uppercase font-bold px-2 py-0.5 tracking-widest z-20 rounded-none">Patrocinado: {smartAd.sponsor}</span>
                <div className="relative w-full h-48 md:w-1/2 z-10 pt-6 md:pt-0">
                  {isValidImageSrc(smartAd.img) && (
                    <Image
                      src={smartAd.img}
                      alt="Banner"
                      fill
                      sizes="(max-width: 768px) 100vw, 50vw"
                      className="object-contain group-hover:scale-105 transition-transform duration-500"
                      unoptimized={!isOptimizableImageSrc(smartAd.img)}
                    />
                  )}
                </div>
                <div className="md:w-1/2 text-center md:text-left mt-6 md:mt-0 z-10 border-t md:border-t-0 md:border-l border-[#C0C0C0] pt-6 md:pt-0 md:pl-10">
                  <h3 className="font-black text-3xl md:text-4xl text-[#0A1F33] uppercase leading-tight mb-2" style={{ fontFamily: 'Montserrat, sans-serif' }}>{smartAd.headline} <br/><span className="text-[#00BFFF]">{smartAd.highlight}</span></h3>
                  <p className="font-black text-2xl text-[#0A1F33] mt-2 inline-block border-b-2 border-[#00BFFF] pb-1" style={{ fontFamily: 'Montserrat, sans-serif' }}>{smartAd.price}</p>
                </div>
              </a>
            )}

            {/* RUNNER-UPS (OTRAS OPCIONES - HORIZONTAL FLAT) */}
            {otherMatches.length > 0 && (
              <div className="mb-12">
                <h3 className="font-bold text-[#3A3A3C] text-sm uppercase tracking-widest mb-6 border-b border-[#C0C0C0]/50 pb-2">Otras opciones viables</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {otherMatches.map(auto => (
                    <div key={`other_${auto.id}`} className="bg-[#FFFFFF] border border-[#C0C0C0] flex flex-row hover:border-[#0A1F33] transition-colors group h-32 rounded-none shadow-none">
                      <div className="relative w-1/3 h-full p-2 border-r border-[#C0C0C0]/30 bg-[#F8F9FA]">
                        {isValidImageSrc(auto.imgUrl) ? (
                          <Image
                            src={auto.imgUrl}
                            alt={auto.modelName}
                            fill
                            sizes="(max-width: 768px) 33vw, 16vw"
                            className="object-contain p-2 group-hover:scale-105 transition-transform"
                            unoptimized={!isOptimizableImageSrc(auto.imgUrl)}
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-[#C0C0C0] uppercase tracking-widest">Sin Imagen</div>
                        )}
                      </div>
                      <div className="w-2/3 p-4 flex flex-col justify-center">
                         <p className="text-[9px] font-bold text-[#C0C0C0] uppercase tracking-widest truncate">{auto.brandName}</p>
                         <h4 className="font-black text-sm text-[#0A1F33] uppercase leading-tight mb-1 truncate" style={{ fontFamily: 'Montserrat, sans-serif' }}>{auto.modelName}</h4>
                         <span className="font-black text-xs text-[#0A1F33] mt-2">Desde US$ {auto.startingPrice.toLocaleString()}</span>
                         <Link href={`/catalogo/${auto.brandId}/${auto.id}`} className="text-[9px] font-bold text-[#00BFFF] hover:text-[#0A1F33] uppercase tracking-widest mt-1 underline transition-colors">
                           Ver Detalles Técnicos →
                         </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="text-center mt-12 border-t border-[#C0C0C0] pt-12">
              <button onClick={() => { setStep(1); setAnswers({}); setCalcVehicle(null); }} className="bg-[#FFFFFF] border border-[#0A1F33] text-[#0A1F33] hover:bg-[#0A1F33] hover:text-[#FFFFFF] px-8 py-4 text-[10px] font-bold uppercase tracking-widest transition-colors inline-flex items-center gap-2 rounded-none">
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> Volver a empezar
              </button>
            </div>

          </div>
        </section>
      )}

      {/* ==========================================
          MODAL CALCULADORA
          ========================================== */}
      {calcVehicle && (
        <div className="fixed inset-0 bg-[#0A1F33]/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[#FFFFFF] p-8 max-w-md w-full border-t-4 border-[#0A1F33] shadow-none rounded-none">
            <button onClick={() => { setCalcVehicle(null); setCuotaCalculada(null); }} className="absolute top-4 right-4 text-[#C0C0C0] hover:text-[#D93025] font-black text-lg border-none outline-none">✕</button>
            <h3 className="font-black text-2xl text-[#0A1F33] uppercase mb-1" style={{ fontFamily: 'Montserrat, sans-serif' }}>Plan Financiero</h3>
            <p className="text-[10px] font-bold text-[#C0C0C0] uppercase tracking-widest mb-6 border-b border-[#C0C0C0]/50 pb-4">
              Vehículo: {calcVehicle.brandName} {calcVehicle.modelName} (Desde US$ {calcVehicle.startingPrice.toLocaleString()})
            </p>
            
            <form onSubmit={handleCalculate} className="flex flex-col gap-4">
              <div>
                <label className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest block mb-2">Capital de Entrega (USD)</label>
                <input type="number" placeholder="Ej: 10000" className="w-full border border-[#C0C0C0] p-3 text-xs focus:outline-none focus:border-[#0A1F33] bg-[#F8F9FA] rounded-none" required value={calcForm.entrega} onChange={e=>setCalcForm({...calcForm, entrega: e.target.value})} />
              </div>
              <div>
                <label className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest block mb-2">Plazo de Financiación</label>
                <select className="w-full border border-[#C0C0C0] p-3 text-xs focus:outline-none focus:border-[#0A1F33] bg-[#FFFFFF] cursor-pointer rounded-none" value={calcForm.plazo} onChange={e=>setCalcForm({...calcForm, plazo: e.target.value})}>
                  <option value="12">12 Meses</option><option value="24">24 Meses</option><option value="36">36 Meses</option><option value="48">48 Meses</option><option value="60">60 Meses</option>
                </select>
              </div>
              
              <button type="submit" className="w-full bg-[#00BFFF] hover:bg-[#0A1F33] text-[#FFFFFF] font-bold text-xs uppercase tracking-widest py-4 transition-colors mt-2 border border-transparent rounded-none">
                Calcular Cuota
              </button>

              {cuotaCalculada !== null && (
                <div className="mt-4 border-t-4 border-[#0A1F33] bg-[#F8F9FA] p-6 text-center">
                  <p className="text-[11px] font-bold text-[#C0C0C0] uppercase tracking-widest mb-2">Cuota Mensual Estimada</p>
                  <p className="font-black text-4xl text-[#0A1F33]" style={{ fontFamily: 'Montserrat, sans-serif' }}>US$ {cuotaCalculada.toLocaleString('en-US', {maximumFractionDigits: 0})}</p>
                  <p className="text-[9px] text-[#3A3A3C] uppercase tracking-widest mt-4 max-w-sm mx-auto leading-relaxed opacity-70">
                    * Sistema francés. Incluye seguro de vida y gastos. Sujeto a evaluación crediticia.
                  </p>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </main>
  );
}