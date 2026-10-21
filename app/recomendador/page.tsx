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
import { normalizeCarroceria } from '../../lib/carroceria';
import { normalizeCombustible, combustibleLabel } from '../../lib/combustible';
import { normalizeExternalUrl } from '../../lib/externalUrl';
import GlosarioSiglas from '../components/GlosarioSiglas';
import CarroceriaIcon from '../components/CarroceriaIcon';
import { sendLeadNotificationEmail, sendRecommendationResultsEmail } from '../../lib/mailer';
import Navbar from '../components/Navbar';
import Modal from '../components/a11y/Modal';
import { useToast } from '../context/ToastContext';
import { useLead } from '../context/LeadContext';
import { track } from '../../lib/analytics';
import { sanitizeDealershipName, formatHablarCon } from '../../lib/dealerships';

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

// Jerarquía estricta de eficiencia energética para prioridad de economía
const ENERGY_ECONOMY_RANK: Record<string, number> = {
  'REEV': 8,
  'EV': 7,
  'PHEV': 6,
  'HEV': 5,
  'MHEV': 4,
  'FLEX': 3,
  'NAFTA': 2,
  'DIESEL': 1,
};

interface BudgetRange {
  min: number;
  max: number;
  label: string;
}

const BUDGET_RANGES: Record<string, BudgetRange> = {
  '18000': { min: 0, max: 18000, label: 'Hasta US$ 18.000' },
  '25000': { min: 18000, max: 25000, label: 'US$ 18.000 a US$ 25.000' },
  '40000': { min: 25000, max: 40000, label: 'US$ 25.000 a US$ 40.000' },
  '999999': { min: 40000, max: 99999999, label: 'Más de US$ 40.000' },
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
  airbags: number;
  adasCount: number;
  confortScore: number;
  hasAdas: boolean;
  hasCuero: boolean;
  hasTecho: boolean;
  hasCamara: boolean;
  has4x4: boolean;
  despejeSuelo: number;
  bauleraLitros: number;
}

interface MatchReason { label: string; matched: boolean; }

interface ScoredModel {
  id: string; brandId: string; brandName: string; modelName: string;
  tipo_carroceria: string; imgUrl: string; startingPrice: number;
  availableFuels: string[]; availableTransmissions: string[]; maxPlazas: number;
  topFeatures: string[]; dealershipStatus: string; concesionaria: string;
  score: number; matchPercentage: number; equipScore: number; badge?: string;
  origen: string;
  hasAdas: boolean;
  hasCuero: boolean;
  has4x4: boolean;
  hasTecho: boolean;
  hasCamara: boolean;
  matchReasons: MatchReason[];
  fuelTier?: number;
  bodyTier?: number;
  budgetTier?: number;
  plazasTier?: number;
  terrainTier?: number;
}

interface AdCampaign { 
  id: string; 
  sponsor: string; 
  headline: string; 
  highlight: string; 
  price: string; 
  link: string; 
  img: string; 
  location: string; 
  isActive: boolean; 
  targetCategory?: string; 
  modelId?: string;
  modelName?: string;
  brandName?: string;
  startDate?: string;
  endDate?: string;
  ctaEnabled?: boolean;
  ctaText?: string;
  ctaUrl?: string;
  ctaColor?: string;
}

// Interfaz para definir correctamente los pasos del Wizard y evitar errores de inferencia
interface WizardStep {
  id: string;
  title: string;
  subtitle: string;
  isMultiple: boolean;
  options: { label: string; value: string; desc?: string; icon?: string }[];
}

export default function RecomendadorPage() {
  const { showToast } = useToast();
  const { openLeadModal } = useLead();
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
  const [relaxationInfo, setRelaxationInfo] = useState<{ level: number; message: string } | null>(null);

  // "¿Ya tenés un modelo en mente?" -- se compara aparte de las recomendaciones
  const [wantsReference, setWantsReference] = useState<boolean | null>(null);
  const [referenceModelId, setReferenceModelId] = useState<string | null>(null);
  const [referenceMatch, setReferenceMatch] = useState<ScoredModel | null>(null);
  const [refSearchTerm, setRefSearchTerm] = useState('');


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
          const cleanTipo = normalizeCarroceria(data.tipo_carroceria);
          tempTipos.add(cleanTipo);
          const modelOrigen = data.origen || brandsMap[data.brandId]?.origen || 'Desconocido';
          if (data.origen) tempOrigenes.add(data.origen);

          return {
            id: data.id,
            brandId: data.brandId,
            brandName: brandsMap[data.brandId]?.name || 'Marca',
            name: data.name,
            tipo_carroceria: cleanTipo,
            imgUrl: data.imgUrl || '',
            origen: modelOrigen
          };
        });

        const tempPlazas = new Set<number>();
        const tempCombustibles = new Set<string>();

        const versionsList: VersionData[] = versionsData.map((v) => {
          // Filtrar ADAS reales (excluyendo "Sin ADAS", "No", "-", etc.)
          const rawAdasList: string[] = Array.isArray(v.features?.adas)
            ? v.features.adas
            : (typeof v.features?.adas === 'string' ? v.features.adas.split('|') : []);
          const cleanAdasList = rawAdasList
            .map(item => String(item || '').trim())
            .filter(item => {
              const low = item.toLowerCase();
              return low.length > 0 && low !== 'sin adas' && low !== 'no' && low !== 'no aplica' && low !== '-';
            });

          const adasStr = cleanAdasList.join(' ');
          const confortArr: string[] = Array.isArray(v.features?.confort_conveniencia)
            ? v.features.confort_conveniencia
            : (typeof v.features?.confort_conveniencia === 'string' ? v.features.confort_conveniencia.split(';') : []);
          const confortStr = confortArr.join(' ');
          const segArr: string[] = Array.isArray(v.features?.seguridad_standard)
            ? v.features.seguridad_standard
            : (typeof v.features?.seguridad_standard === 'string' ? v.features.seguridad_standard.split(';') : []);
          const segStr = segArr.join(' ');

          const cueroRaw = String(v.features?.asiento_cuero || '').toLowerCase().trim();
          const techoRaw = String(v.features?.techo_panoramico || '').toLowerCase().trim();
          const camarasRaw = String(v.specs?.camaras || '').toLowerCase().trim();
          const traccionRaw = String(v.specs?.traccion || '').toLowerCase().trim();

          const rawString = `${adasStr} ${confortStr} ${segStr} ${cueroRaw} ${techoRaw} ${camarasRaw} ${traccionRaw}`.toLowerCase();

          const hasAdas = cleanAdasList.length > 0 || ALIAS.ADAS.some(alias => alias !== 'adas' && rawString.includes(alias));
          const hasCuero = ['sí', 'si', 'yes', 'true'].includes(cueroRaw) || ALIAS.CUERO.some(alias => cueroRaw.includes(alias) || confortStr.toLowerCase().includes(alias));
          const hasTecho = ['sí', 'si', 'yes', 'true'].includes(techoRaw) || ALIAS.TECHO.some(alias => techoRaw.includes(alias) || confortStr.toLowerCase().includes(alias));
          const hasCamara = (camarasRaw.length > 0 && !['no', '-', 'sin camara', 'sin cámara', 'sensores traseros sin cámara', 'sensores traseros sin camara'].includes(camarasRaw)) ||
            ALIAS.CAMARA.some(alias => camarasRaw.includes(alias) || confortStr.toLowerCase().includes(alias));
          const hasCamara360 = camarasRaw.includes('360') || camarasRaw.includes('540') || camarasRaw.includes('periférica') || camarasRaw.includes('topview');
          const has4x4 = ALIAS.TRACCION_4X4.some(alias => traccionRaw.includes(alias));

          const plazas = Number(v.specs?.plazas) || 5;
          const combustible = normalizeCombustible(v.specs?.combustible);

          const airbagsNum = parseInt(String(v.specs?.airbags || '0').replace(/\D/g, ''), 10) || (segArr.length ? 2 : 2);
          const adasCount = cleanAdasList.length;
          const pantallaNum = parseFloat(String(v.specs?.tamanho_pantalla || '0').replace(',', '.').replace(/[^0-9.]/g, '')) || 0;
          const despejeSuelo = Number(v.dimensiones?.despeje_suelo || v.despeje_suelo) || 0;
          const bauleraLitros = Number(v.dimensiones?.baulera_litros || v.baulera_litros) || 0;

          const confortScore = confortArr.length + (hasCuero ? 3 : 0) + (hasTecho ? 3 : 0);

          // Puntaje objetivo de equipamiento real (Seguridad + ADAS + Tecnología + Confort)
          const equipScore =
            (adasCount * 35) +
            (airbagsNum * 15) +
            (hasCuero ? 30 : 0) +
            (hasTecho ? 30 : 0) +
            (hasCamara360 ? 35 : (hasCamara ? 20 : 0)) +
            Math.round(pantallaNum * 4) +
            Math.min(75, confortArr.length * 5);

          tempPlazas.add(plazas);
          if (combustible) tempCombustibles.add(combustible);

          return {
            id: v.id, modelId: v.modelId, name: v.name, price: Number(v.price) || 0,
            combustible: combustible,
            transmision: (v.specs?.transmision || '').toLowerCase(),
            plazas: plazas,
            traccion: traccionRaw,
            features_raw: rawString,
            equipScore: equipScore,
            concesionaria: v.concesionaria || '',
            airbags: airbagsNum,
            adasCount: adasCount,
            confortScore: confortScore,
            hasAdas,
            hasCuero,
            hasTecho,
            hasCamara,
            has4x4,
            despejeSuelo,
            bauleraLitros
          };
        });

        // Campañas activas para el Recomendador (con fecha local del navegador)
        const now = new Date();
        const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        const activeAds = (campaignsData as AdCampaign[]).filter(c => {
          if (c.isActive === false) return false;
          const loc = (c.location || '').toLowerCase();
          const validLoc = loc === 'recomendador' || loc === 'ambos';
          if (!validLoc) return false;
          if (c.startDate && c.startDate > localToday) return false;
          if (c.endDate && c.endDate < localToday) return false;
          return true;
        });

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

  // Quien dijo "necesito orientación" no ve el cuestionario técnico: recibe un
  // mini-flujo de estilo de vida (uso, personas, terreno, prioridad) que el
  // motor traduce a specs en derivarPreferenciasNovato().
  const perfilNovato = answers['conocimiento'] === 'novato';

  // ==========================================
  // 2. CONSTRUCCIÓN DINÁMICA DEL WIZARD
  // ==========================================
  const PRESUPUESTO_STEP: WizardStep = {
    id: 'presupuesto', title: '¿Qué presupuesto tenés en mente?', subtitle: 'Nos ayuda a acotar las opciones reales.', isMultiple: false,
    options: [
      { label: 'Hasta US$ 18.000', value: '18000', icon: '💵' },
      { label: 'US$ 18.000 a US$ 25.000', value: '25000', icon: '💰' },
      { label: 'US$ 25.000 a US$ 40.000', value: '40000', icon: '💳' },
      { label: 'Más de US$ 40.000', value: '999999', icon: '💎' }
    ]
  };

  const WIZARD_STEPS: WizardStep[] = useMemo(() => {
    const conocimiento: WizardStep = {
      id: 'conocimiento', title: '¿Cuánto sabés de autos?', subtitle: 'Según lo que elijas te hacemos preguntas técnicas o preguntas sobre tu día a día.', isMultiple: false,
      options: [
        { label: 'Sé bastante', desc: 'Quiero elegir marca, motor, caja...', value: 'experto', icon: '🏎️' },
        { label: 'No tanto', desc: 'Prefiero que me orienten con preguntas simples', value: 'novato', icon: '🧭' }
      ]
    };

    if (perfilNovato) {
      return [
        conocimiento,
        {
          id: 'uso', title: '¿Para qué vas a usar el auto?', subtitle: 'Elegí lo que más se parezca a tu día a día.', isMultiple: false,
          options: [
            { label: 'Moverme por la ciudad', desc: 'Trayectos cortos, estacionar fácil', value: 'ciudad', icon: '🏙️' },
            { label: 'Llevar a la familia', desc: 'Espacio y comodidad para todos', value: 'familia', icon: '👨‍👩‍👧‍👦' },
            { label: 'Trabajo y carga', desc: 'Mercadería, herramientas, changas', value: 'carga', icon: '📦' },
            { label: 'Viajes largos por ruta', desc: 'Kilómetros, confort en carretera', value: 'ruta', icon: '🛣️' },
            { label: 'Salir de la ciudad / aventura', desc: 'Caminos de tierra, ripio', value: 'aventura', icon: '⛰️' }
          ]
        },
        {
          id: 'personas', title: '¿Cuántas personas viajan normalmente?', subtitle: 'Contando siempre al conductor.', isMultiple: false,
          options: [
            { label: '1 o 2', value: '2', icon: '🧍' },
            { label: '3 o 4', value: '4', icon: '👨‍👩‍👧' },
            { label: '5', value: '5', icon: '👨‍👩‍👧‍👦' },
            { label: '6 o más', desc: 'Necesito 7 plazas', value: '7', icon: '🚐' }
          ]
        },
        {
          id: 'terreno', title: '¿Por dónde manejás más?', subtitle: 'Dónde pasa la mayor parte de los kilómetros.', isMultiple: false,
          options: [
            { label: 'Siempre asfalto', desc: 'Ciudad y ruta', value: 'asfalto', icon: '🛣️' },
            { label: 'A veces caminos de tierra', desc: 'Ripio, barro ocasional', value: 'mixto', icon: '🌄' },
            { label: 'Bastante fuera de asfalto', desc: 'Necesito tracción en las 4 ruedas', value: 'offroad', icon: '🏔️' }
          ]
        },
        PRESUPUESTO_STEP,
        {
          id: 'prioridad', title: '¿Qué es lo más importante para vos?', subtitle: 'Elegí una. Nos ayuda a desempatar entre opciones parecidas.', isMultiple: false,
          options: [
            { label: 'Gastar poco combustible', value: 'consumo', icon: '⛽' },
            { label: 'Seguridad', desc: 'Asistencias de manejo, más airbags', value: 'seguridad', icon: '🛡️' },
            { label: 'Tecnología y confort', desc: 'Pantalla, cámara, sensores', value: 'tecnologia', icon: '📱' },
            { label: 'El precio más bajo posible', value: 'precio', icon: '💲' },
            { label: 'Me da igual, mostrame lo mejor', value: 'nada', icon: '⚖️' }
          ]
        }
      ];
    }

    return [
      conocimiento,
      {
        id: 'carroceria', title: '¿Qué tipo de auto buscás?', subtitle: 'Buscamos solo entre estos tipos, en todas las marcas. Podés elegir varios.', isMultiple: true,
        options: [
          ...tiposDisponibles.map(t => ({ label: t, value: t })),
          { label: 'Sin preferencia', value: 'any', icon: '⚖️' }
        ]
      },
      {
        id: 'marcas', title: '¿Tenés alguna marca en mente?', subtitle: 'Podés elegir varias o ninguna.', isMultiple: true,
        options: [
          ...marcasDisponibles.map(m => ({ label: m, value: m })),
          { label: 'Sin preferencia', value: 'any' }
        ]
      },
      PRESUPUESTO_STEP,
      {
        id: 'origen', title: '¿Preferís algún origen de fabricación?', subtitle: 'Cargado según el portafolio actual de marcas.', isMultiple: true,
        options: [
          ...origenesDisponibles.map(o => ({ label: o, value: o, icon: '🌍' })),
          { label: 'Me da igual', value: 'any', icon: '⚖️' }
        ]
      },
      {
        id: 'plazas', title: '¿Cuántas plazas necesitás?', subtitle: 'Es un mínimo: también te mostramos opciones con más capacidad si entran en tu presupuesto.', isMultiple: false,
        options: [
          ...plazasDisponibles.map(p => ({ label: `${p} Plazas`, desc: `Capacidad para ${p} ocupantes`, value: p.toString(), icon: '👨‍👩‍👧‍👦' })),
          { label: 'Sin preferencia', value: 'any', icon: '⚖️' }
        ]
      },
      {
        id: 'combustible', title: '¿Qué combustible preferís?', subtitle: 'Motorizaciones exactas disponibles en Paraguay.', isMultiple: true,
        options: [
          ...combustiblesDisponibles.map(c => ({ label: combustibleLabel(c) || c, desc: c, value: c, icon: '⛽' })),
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
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfilNovato, tiposDisponibles, marcasDisponibles, origenesDisponibles, plazasDisponibles, combustiblesDisponibles]);

  // Traduce las respuestas de estilo de vida del perfil novato a las mismas
  // claves de `answers` que consume runAlgorithm (carroceria, plazas,
  // transmision, features, combustible...).
  const derivarPreferenciasNovato = (a: Record<string, string>): Record<string, unknown> => {
    const tiposSet = new Set(tiposDisponibles);
    const pick = (...cands: string[]) => cands.filter(c => tiposSet.has(c));

    let carroceria: string[] = [];
    switch (a['uso']) {
      case 'ciudad': carroceria = pick('HATCHBACK', 'SEDÁN', 'CROSSOVER', 'SUV'); break;
      case 'familia': carroceria = pick('SUV', 'MINIVAN', 'SEDÁN', 'CROSSOVER'); break;
      case 'carga': carroceria = pick('PICKUP', 'PICKUP DOBLE CABINA', 'FURGÓN', 'FURGÓN CARGO'); break;
      case 'ruta': carroceria = pick('SEDÁN', 'SUV', 'CROSSOVER'); break;
      case 'aventura': carroceria = pick('SUV', 'PICKUP', 'PICKUP DOBLE CABINA', 'CROSSOVER'); break;
    }

    const features: string[] = [];
    const combustible: string[] = [];
    let transmision = 'Automatica';

    if (a['terreno'] === 'offroad') features.push('4x4');
    if (a['personas'] === '7') carroceria = pick('SUV', 'MINIVAN', 'FURGÓN') .length ? pick('SUV', 'MINIVAN', 'FURGÓN') : carroceria;

    switch (a['prioridad']) {
      case 'consumo': {
        const eco = ['HEV', 'MHEV', 'EV', 'PHEV'].filter(f => combustiblesDisponibles.includes(f));
        if (eco.length) combustible.push(...eco);
        break;
      }
      case 'seguridad': features.push('adas'); break;
      case 'tecnologia': features.push('camara'); break;
      case 'precio': transmision = 'any'; break;
    }

    return {
      carroceria: carroceria.length ? carroceria : ['any'],
      plazas: a['personas'] || 'any',
      transmision,
      marcas: ['any'],
      origen: ['any'],
      combustible: combustible.length ? combustible : ['any'],
      features: features.length ? features : ['any'],
    };
  };

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
  // 4. ALGORITMO MULTIDIMENSIONAL DE PROXIMIDAD Y CASCADA (VEROSIMILITUD AUTOMOTRIZ)
  // ==========================================
  const runAlgorithm = (): ScoredModel[] => {
    const src = perfilNovato
      ? { ...answers, ...derivarPreferenciasNovato(answers) }
      : answers;

    const budgetKey = src['presupuesto'];
    const budgetRange = budgetKey ? BUDGET_RANGES[budgetKey] : null;
    const reqPlazas = (src['plazas'] && src['plazas'] !== 'any') ? Number(src['plazas']) : null;

    const ansCarroceria: string[] = Array.isArray(src['carroceria']) ? src['carroceria'] : [];
    const hasBodyPref = !ansCarroceria.includes('any') && ansCarroceria.length > 0;

    const ansComb: string[] = Array.isArray(src['combustible']) ? src['combustible'] : [];
    const hasFuelPref = !ansComb.includes('any') && ansComb.length > 0;

    const ansMarcas: string[] = Array.isArray(src['marcas']) ? src['marcas'] : [];
    const hasBrandPref = !ansMarcas.includes('any') && ansMarcas.length > 0;

    const ansOrigen: string[] = Array.isArray(src['origen']) ? src['origen'] : [];
    const hasOriginPref = !ansOrigen.includes('any') && ansOrigen.length > 0;

    const ansFeat: string[] = Array.isArray(src['features']) ? src['features'] : [];
    const hasFeatPref = !ansFeat.includes('any') && ansFeat.length > 0;

    const prioridad = src['prioridad'] || '';
    const uso = src['uso'] || '';
    const terreno = src['terreno'] || '';
    const isEconomyPriority = prioridad === 'consumo' || prioridad === 'precio';
    const isComfortPriority = prioridad === 'tecnologia';
    const isSafetyPriority = prioridad === 'seguridad' || uso === 'familia';
    const reqOffroad = terreno === 'offroad' || ansFeat.includes('4x4');

    // -------------------------------------------------------------------------
    // A. MATRIZ DE PROXIMIDAD ENERGÉTICA (Combustible / Motorización)
    // -------------------------------------------------------------------------
    const evaluateFuelProximity = (vFuel: string): { ratio: number; tier: number; label: string; matched: boolean } => {
      const f = (vFuel || '').toUpperCase().trim();
      const labelName = combustibleLabel(f) || f || 'Convencional';

      if (!hasFuelPref && !isEconomyPriority) {
        return { ratio: 1.0, tier: 1, label: `Motorización ${labelName}`, matched: true };
      }

      if (hasFuelPref) {
        // Nivel 1: Coincidencia exacta (o REEV dentro de EV/PHEV)
        const wantsPlugIn = ansComb.includes('EV') || ansComb.includes('PHEV') || ansComb.includes('REEV');
        if (ansComb.includes(f) || (wantsPlugIn && f === 'REEV')) {
          return { ratio: 1.0, tier: 1, label: `Motorización ${labelName} (Exacta)`, matched: true };
        }

        // Si el usuario pidió EV / PHEV (Nuevas Energías enchufables / 100% eléctricas)
        if (wantsPlugIn && !ansComb.includes('HEV') && !ansComb.includes('MHEV')) {
          if (f === 'HEV') {
            return { ratio: 0.80, tier: 2, label: `Alternativa Híbrida Autorrecargable (${labelName})`, matched: true };
          }
          if (f === 'MHEV') {
            return { ratio: 0.58, tier: 3, label: `Alternativa Microhíbrida (${labelName})`, matched: true };
          }
          if (f === 'FLEX' || f === 'NAFTA') {
            return { ratio: 0.10, tier: 4, label: `Motor tradicional (${labelName})`, matched: false };
          }
          return { ratio: 0.0, tier: 5, label: `Motorización ${labelName}`, matched: false };
        }

        // Si el usuario pidió HEV / MHEV (Híbridos)
        const wantsHybrid = ansComb.includes('HEV') || ansComb.includes('MHEV');
        if (wantsHybrid) {
          if (['HEV', 'MHEV', 'PHEV', 'REEV'].includes(f)) {
            return { ratio: 0.85, tier: 2, label: `Tecnología Híbrida Compatible (${labelName})`, matched: true };
          }
          if (f === 'EV') {
            return { ratio: 0.72, tier: 2, label: `100% Eléctrico (${labelName})`, matched: true };
          }
          if (f === 'FLEX' || f === 'NAFTA') {
            return { ratio: 0.25, tier: 4, label: `Motor tradicional (${labelName})`, matched: false };
          }
          return { ratio: 0.05, tier: 5, label: `Motorización ${labelName}`, matched: false };
        }

        // Si el usuario pidió NAFTA / FLEX
        const wantsGas = ansComb.includes('NAFTA') || ansComb.includes('FLEX');
        if (wantsGas) {
          if (f === 'NAFTA' || f === 'FLEX') {
            return { ratio: 0.92, tier: 1, label: `Motorización ${labelName}`, matched: true };
          }
          if (f === 'MHEV') {
            return { ratio: 0.82, tier: 2, label: `Nafta/Flex con asistencia MHEV`, matched: true };
          }
          if (f === 'HEV') {
            return { ratio: 0.72, tier: 2, label: `Híbrido de bajo consumo (${labelName})`, matched: true };
          }
          if (f === 'PHEV' || f === 'REEV') {
            return { ratio: 0.55, tier: 3, label: `Híbrido enchufable (${labelName})`, matched: false };
          }
          return { ratio: 0.15, tier: 4, label: `Motorización ${labelName}`, matched: false };
        }

        // Si el usuario pidió DIESEL
        if (ansComb.includes('DIESEL')) {
          if (f === 'HEV' || f === 'PHEV') {
            return { ratio: 0.55, tier: 3, label: `Alto torque híbrido (${labelName})`, matched: false };
          }
          if (f === 'NAFTA' || f === 'FLEX') {
            return { ratio: 0.45, tier: 3, label: `Alternativa Nafta/Flex`, matched: false };
          }
          return { ratio: 0.10, tier: 4, label: `Motorización ${labelName}`, matched: false };
        }
      }

      // Modo Prioridad Economía (Novato)
      const eRank = ENERGY_ECONOMY_RANK[f] || 2;
      if (eRank >= 5) return { ratio: 1.0, tier: 1, label: `Máxima Eficiencia (${labelName})`, matched: true };
      if (eRank === 4) return { ratio: 0.82, tier: 2, label: `Eficiencia Microhíbrida (${labelName})`, matched: true };
      if (eRank >= 2) return { ratio: 0.55, tier: 3, label: `Consumo Urbano (${labelName})`, matched: true };
      return { ratio: 0.25, tier: 4, label: `Motorización ${labelName}`, matched: false };
    };

    // -------------------------------------------------------------------------
    // B. MATRIZ DE PROXIMIDAD DE CARROCERÍA (Siluetas y Sustitutos Naturales)
    // -------------------------------------------------------------------------
    const evaluateBodyProximity = (modelBody: string, despeje: number, has4x4Flag: boolean): { ratio: number; tier: number; label: string; matched: boolean } => {
      const b = (modelBody || '').toUpperCase().trim();
      if (!hasBodyPref) {
        return { ratio: 1.0, tier: 1, label: `Carrocería ${b}`, matched: true };
      }

      if (ansCarroceria.includes(b)) {
        return { ratio: 1.0, tier: 1, label: `Carrocería ${b}`, matched: true };
      }

      const wantsSuvOrCross = ansCarroceria.includes('SUV') || ansCarroceria.includes('CROSSOVER');
      const wantsSedan = ansCarroceria.includes('SEDÁN');
      const wantsHatch = ansCarroceria.includes('HATCHBACK');
      const wantsPickup = ansCarroceria.some(c => c.includes('PICKUP'));
      const wantsFurgon = ansCarroceria.some(c => c.includes('FURGÓN') || c.includes('MINIVAN'));

      if (wantsSuvOrCross) {
        if (b === 'SUV' || b === 'CROSSOVER') {
          return { ratio: 0.96, tier: 1, label: `Silueta ${b} (Equivalente)`, matched: true };
        }
        if (b === 'HATCHBACK') {
          const isElevated = despeje >= 175;
          return {
            ratio: isElevated ? 0.72 : 0.55,
            tier: 2,
            label: isElevated ? `Hatchback de buen despeje (${despeje} mm)` : `Alternativa compacta: Hatchback`,
            matched: isElevated
          };
        }
        if (b === 'MINIVAN') {
          return { ratio: 0.60, tier: 2, label: `Alternativa familiar: Minivan`, matched: false };
        }
        if (b === 'SEDÁN') {
          return { ratio: 0.35, tier: 3, label: `Alternativa: Sedán`, matched: false };
        }
        return { ratio: 0.0, tier: 4, label: `Segmento ${b}`, matched: false };
      }

      if (wantsSedan) {
        if (b === 'HATCHBACK') return { ratio: 0.75, tier: 2, label: `Alternativa cercana: Hatchback`, matched: true };
        if (b === 'CROSSOVER' || b === 'SUV') return { ratio: 0.65, tier: 2, label: `Alternativa: ${b}`, matched: false };
        return { ratio: 0.05, tier: 4, label: `Segmento ${b}`, matched: false };
      }

      if (wantsHatch) {
        if (b === 'CROSSOVER' || b === 'SUV') return { ratio: 0.75, tier: 2, label: `Alternativa cercana: ${b}`, matched: true };
        if (b === 'SEDÁN') return { ratio: 0.65, tier: 2, label: `Alternativa: Sedán`, matched: false };
        return { ratio: 0.05, tier: 4, label: `Segmento ${b}`, matched: false };
      }

      if (wantsPickup) {
        if (b.includes('PICKUP')) return { ratio: 0.95, tier: 1, label: `Carrocería ${b}`, matched: true };
        if (b === 'SUV' && (has4x4Flag || despeje >= 200)) return { ratio: 0.65, tier: 2, label: `SUV Todoterreno Robusto`, matched: false };
        if (b.includes('FURGÓN')) return { ratio: 0.55, tier: 2, label: `Utilitario de trabajo (${b})`, matched: false };
        return { ratio: 0.05, tier: 4, label: `Segmento ${b}`, matched: false };
      }

      if (wantsFurgon) {
        if (b.includes('FURGÓN') || b === 'MINIVAN' || b === 'MINIBÚS') return { ratio: 0.92, tier: 1, label: `Capacidad utilitaria (${b})`, matched: true };
        if (b.includes('PICKUP')) return { ratio: 0.70, tier: 2, label: `Alternativa de carga (${b})`, matched: true };
        if (b === 'SUV') return { ratio: 0.50, tier: 3, label: `Alternativa de espacio: SUV`, matched: false };
        return { ratio: 0.10, tier: 4, label: `Segmento ${b}`, matched: false };
      }

      return { ratio: 0.30, tier: 3, label: `Alternativa: ${b}`, matched: false };
    };

    // -------------------------------------------------------------------------
    // C. MATRIZ DE PROXIMIDAD DE PRESUPUESTO (Tolerancia Comercial y Escalones)
    // -------------------------------------------------------------------------
    const evaluateBudgetProximity = (price: number): { ratio: number; tier: number; label: string; matched: boolean } => {
      if (!budgetRange) {
        return { ratio: 1.0, tier: 1, label: `US$ ${price.toLocaleString('es-PY')}`, matched: true };
      }

      const minExact = budgetRange.min > 0 ? budgetRange.min * 0.96 : 0;
      const maxExact = budgetRange.max < 90000000 ? budgetRange.max * 1.02 : Infinity;

      // Nivel 1: Dentro del rango objetivo exacto
      if (price >= minExact && price <= maxExact) {
        return { ratio: 1.0, tier: 1, label: `En tu presupuesto (${budgetRange.label})`, matched: true };
      }

      // Nivel 2: Zona de Tolerancia Comercial (-8% a +8% del rango)
      const minTol = budgetRange.min > 0 ? budgetRange.min * 0.91 : 0;
      const maxTol = budgetRange.max < 90000000 ? budgetRange.max * 1.08 : Infinity;
      if (price >= minTol && price <= maxTol) {
        return {
          ratio: 0.85,
          tier: 2,
          label: `En margen comercial (US$ ${price.toLocaleString('es-PY')})`,
          matched: true
        };
      }

      // Nivel 3: Escalón Adyacente Próximo
      let minAdj = 0;
      let maxAdj = Infinity;
      if (budgetKey === '18000') {
        maxAdj = 23500;
      } else if (budgetKey === '25000') {
        minAdj = 14000;
        maxAdj = 31000;
      } else if (budgetKey === '40000') {
        minAdj = 19500;
        maxAdj = 52000;
      } else {
        minAdj = 28000;
      }

      if (price >= minAdj && price <= maxAdj) {
        return {
          ratio: 0.55,
          tier: 3,
          label: `Escalón cercano: US$ ${price.toLocaleString('es-PY')}`,
          matched: false
        };
      }

      // Nivel 4: Fuera de escalón adyacente
      return {
        ratio: 0.15,
        tier: 4,
        label: `Precio de lista: US$ ${price.toLocaleString('es-PY')}`,
        matched: false
      };
    };

    // -------------------------------------------------------------------------
    // D. MATRIZ DE PROXIMIDAD DE PLAZAS / PASAJEROS
    // -------------------------------------------------------------------------
    const evaluatePlazasProximity = (plazas: number, baulera: number): { ratio: number; tier: number; label: string; matched: boolean } => {
      if (reqPlazas === null) {
        return { ratio: 1.0, tier: 1, label: `Capacidad de ${plazas} plazas`, matched: true };
      }

      if (reqPlazas <= 2) {
        if (plazas <= 4) {
          return { ratio: 1.0, tier: 1, label: `Formato ágil de ${plazas} plazas`, matched: true };
        }
        if (plazas === 5) {
          return { ratio: 0.95, tier: 1, label: `Capacidad versátil de 5 plazas (ideal 1-2 personas)`, matched: true };
        }
        return { ratio: 0.30, tier: 3, label: `Vehículo grande (${plazas} plazas)`, matched: false };
      }

      if (reqPlazas === 4) {
        if (plazas === 4 || plazas === 5) {
          return { ratio: 1.0, tier: 1, label: `Capacidad de ${plazas} plazas`, matched: true };
        }
        if (plazas >= 7) {
          return { ratio: 0.72, tier: 2, label: `Amplio de ${plazas} plazas`, matched: true };
        }
        return { ratio: 0.0, tier: 4, label: `Solo ${plazas} plazas`, matched: false };
      }

      if (reqPlazas === 5) {
        if (plazas === 5) {
          return { ratio: 1.0, tier: 1, label: `Capacidad de 5 plazas`, matched: true };
        }
        if (plazas >= 7) {
          return { ratio: 0.90, tier: 1, label: `Capacidad familiar de ${plazas} plazas`, matched: true };
        }
        if (plazas === 4) {
          return { ratio: 0.45, tier: 2, label: `Capacidad de 4 plazas`, matched: false };
        }
        return { ratio: 0.0, tier: 4, label: `Solo ${plazas} plazas`, matched: false };
      }

      // reqPlazas >= 7 (6 o más personas)
      if (plazas >= 7) {
        return { ratio: 1.0, tier: 1, label: `3 filas / ${plazas} plazas reales`, matched: true };
      }
      if (plazas === 5 && baulera >= 470) {
        return { ratio: 0.58, tier: 2, label: `5 plazas de gran habitabilidad (${baulera}L baúl)`, matched: false };
      }
      if (plazas === 5) {
        return { ratio: 0.35, tier: 3, label: `Capacidad estándar de 5 plazas`, matched: false };
      }
      return { ratio: 0.0, tier: 4, label: `Capacidad de ${plazas} plazas`, matched: false };
    };

    // -------------------------------------------------------------------------
    // E. MATRIZ DE PROXIMIDAD DE TERRENO / DESPEJE
    // -------------------------------------------------------------------------
    const evaluateTerrainProximity = (has4x4Flag: boolean, despeje: number, rawFeatures: string): { ratio: number; tier: number; label: string; matched: boolean } => {
      if (reqOffroad) {
        if (has4x4Flag) {
          return { ratio: 1.0, tier: 1, label: 'Tracción 4x4 / AWD para todo terreno', matched: true };
        }
        const hasGrip = rawFeatures.includes('grip control') || rawFeatures.includes('descenso');
        if (despeje >= 190 || hasGrip) {
          return {
            ratio: 0.75,
            tier: 2,
            label: despeje >= 190 ? `Buen despeje del suelo (${despeje} mm)` : 'Asistencia de tracción en terrenos difíciles',
            matched: true
          };
        }
        if (despeje >= 175) {
          return { ratio: 0.45, tier: 3, label: `Tracción 4x2 con despeje de ${despeje} mm`, matched: false };
        }
        return { ratio: 0.15, tier: 4, label: 'Tracción simple urbana', matched: false };
      }

      if (terreno === 'mixto') {
        if (has4x4Flag || despeje >= 180) {
          return { ratio: 1.0, tier: 1, label: despeje >= 180 ? `Despeje apto para tierra/ripio (${despeje} mm)` : 'Tracción integral', matched: true };
        }
        return { ratio: 0.80, tier: 1, label: 'Apto para asfalto y caminos mixtos', matched: true };
      }

      return { ratio: 1.0, tier: 1, label: 'Óptimo para asfalto y ciudad', matched: true };
    };

    // -------------------------------------------------------------------------
    // FUNCIÓN EVALUADORA INTEGRAL POR MODELO
    // -------------------------------------------------------------------------
    const scoreModel = (model: ModelData): ScoredModel | null => {
      const mVersions = rawVersions.filter(v => v.modelId === model.id);
      if (mVersions.length === 0) return null;

      // Evaluamos cada versión del modelo para elegir la versión representativa
      // que mejor responda a la motorización, presupuesto, plazas y caja buscados
      const scoredVersions = mVersions.map(v => {
        const fuelEval = evaluateFuelProximity(v.combustible);
        const budgetEval = evaluateBudgetProximity(v.price);
        const plazasEval = evaluatePlazasProximity(v.plazas, v.bauleraLitros);
        const terrainEval = evaluateTerrainProximity(v.has4x4, v.despejeSuelo, v.features_raw);

        let transScore = 1.0;
        if (src['transmision'] && src['transmision'] !== 'any') {
          const isAuto = ALIAS.AUTO.some(a => v.transmision.includes(a));
          const isMan = ALIAS.MANUAL.some(a => v.transmision.includes(a));
          if (src['transmision'] === 'Automatica') transScore = isAuto ? 1.0 : 0.2;
          if (src['transmision'] === 'Manual') transScore = isMan ? 1.0 : 0.2;
        }

        const versionAffinity =
          (fuelEval.ratio * 40) +
          (budgetEval.ratio * 35) +
          (plazasEval.ratio * 15) +
          (terrainEval.ratio * 10) +
          (transScore * 10);

        return {
          v,
          fuelEval,
          budgetEval,
          plazasEval,
          terrainEval,
          versionAffinity
        };
      });

      // Ordenar versiones: mayor afinidad primero; a igual afinidad, la de mejor tier de presupuesto y menor precio
      scoredVersions.sort((a, b) => {
        if (Math.abs(b.versionAffinity - a.versionAffinity) > 2) {
          return b.versionAffinity - a.versionAffinity;
        }
        if (a.budgetEval.tier !== b.budgetEval.tier) {
          return a.budgetEval.tier - b.budgetEval.tier;
        }
        return a.v.price - b.v.price;
      });

      const best = scoredVersions[0];
      const repVersion = best.v;

      // Para equipamiento máximo del modelo, considerar las versiones dentro del mismo o mejor tier de presupuesto
      const viableVersions = scoredVersions
        .filter(sv => sv.budgetEval.tier <= best.budgetEval.tier && sv.fuelEval.tier <= best.fuelEval.tier)
        .map(sv => sv.v);
      const maxEquipScore = Math.max(...(viableVersions.length ? viableVersions : [repVersion]).map(v => v.equipScore));

      const bodyEval = evaluateBodyProximity(model.tipo_carroceria, repVersion.despejeSuelo, repVersion.has4x4);
      const { fuelEval, budgetEval, plazasEval, terrainEval } = best;

      const fuels = Array.from(new Set(mVersions.map(v => v.combustible)));
      const trans = Array.from(new Set(mVersions.map(v => v.transmision)));
      const maxPlazas = Math.max(...mVersions.map(v => v.plazas));

      const { hasAdas, hasCuero, hasTecho, hasCamara, has4x4 } = repVersion;

      const extractedFeatures: string[] = [];
      if (hasAdas) extractedFeatures.push('ADAS');
      if (hasCuero) extractedFeatures.push('Tapizado de Cuero');
      if (hasCamara) extractedFeatures.push('Cámara 360/Reversa');
      if (hasTecho) extractedFeatures.push('Techo Panorámico');
      if (has4x4) extractedFeatures.push('Tracción 4x4');

      const validDealers = mVersions.map(v => v.concesionaria).filter(Boolean);
      const dealershipCount = new Set(validDealers).size;
      const primaryDealership = repVersion.concesionaria || (validDealers.length > 0 ? validDealers[0] : '');
      const dealershipStatus = dealershipCount > 1 ? `${dealershipCount} concesionarias compiten` : '1 concesionaria disponible';

      // =======================================================================
      // CÁLCULO DE PUNTAJE MULTIDIMENSIONAL PONDERADO
      // =======================================================================
      let score = 0;
      let maxScore = 0;
      const matchReasons: MatchReason[] = [];

      // 1. Carrocería (Peso: 25 pts)
      if (hasBodyPref) {
        maxScore += 25;
        score += Math.round(bodyEval.ratio * 25);
        matchReasons.push({ label: bodyEval.label, matched: bodyEval.matched });
      }

      // 2. Presupuesto (Peso: 25 pts)
      if (budgetRange) {
        maxScore += 25;
        score += Math.round(budgetEval.ratio * 25);
        matchReasons.push({ label: budgetEval.label, matched: budgetEval.matched });
      }

      // 3. Motorización / Combustible (Peso: 35 pts cuando se especifica o es prioridad consumo)
      if (hasFuelPref || isEconomyPriority) {
        maxScore += 35;
        score += Math.round(fuelEval.ratio * 35);
        matchReasons.push({ label: fuelEval.label, matched: fuelEval.matched });
      }

      // 4. Plazas / Habitabilidad (Peso: 20 pts)
      if (reqPlazas !== null) {
        maxScore += 20;
        score += Math.round(plazasEval.ratio * 20);
        matchReasons.push({ label: plazasEval.label, matched: plazasEval.matched });
      }

      // 5. Terreno / Tracción (Peso: 20 pts cuando es offroad o mixto)
      if (reqOffroad || terreno === 'mixto') {
        maxScore += 20;
        score += Math.round(terrainEval.ratio * 20);
        matchReasons.push({ label: terrainEval.label, matched: terrainEval.matched });
      }

      // 6. Prioridades específicas de estilo de vida / equipamiento
      if (isEconomyPriority && budgetRange) {
        maxScore += 15;
        const maxRef = budgetRange.max < 90000000 ? budgetRange.max : 60000;
        const rangeSpan = Math.max(1, maxRef - budgetRange.min);
        const priceRatio = Math.max(0, Math.min(1, (maxRef - repVersion.price) / rangeSpan));
        score += Math.round(priceRatio * 15);
      }

      if (isComfortPriority) {
        maxScore += 25;
        let cPoints = 0;
        if (hasCamara) cPoints += 7;
        if (hasCuero) cPoints += 7;
        if (hasTecho) cPoints += 5;
        cPoints += Math.min(6, repVersion.confortScore);
        score += cPoints;
        matchReasons.push({ label: 'Confort y equipamiento interior', matched: cPoints >= 14 });
      }

      if (isSafetyPriority) {
        maxScore += 30;
        let sPoints = 0;
        if (repVersion.airbags >= 6) sPoints += 15;
        else if (repVersion.airbags >= 4) sPoints += 9;
        else sPoints += 3;
        if (hasAdas) sPoints += 15;
        score += sPoints;
        matchReasons.push({
          label: repVersion.airbags >= 6 ? `${repVersion.airbags} Airbags${hasAdas ? ' + ADAS' : ''}` : (hasAdas ? 'Asistencias ADAS activas' : `${repVersion.airbags} Airbags`),
          matched: repVersion.airbags >= 6 || hasAdas
        });
      }

      // 7. Transmisión (Peso: 15 pts)
      if (src['transmision'] && src['transmision'] !== 'any') {
        maxScore += 15;
        let matched = false;
        if (src['transmision'] === 'Automatica' && ALIAS.AUTO.some(a => repVersion.transmision.includes(a))) matched = true;
        if (src['transmision'] === 'Manual' && ALIAS.MANUAL.some(a => repVersion.transmision.includes(a))) matched = true;
        if (matched) score += 15;
        matchReasons.push({ label: `Caja ${src['transmision'] === 'Automatica' ? 'Automática' : 'Manual'}`, matched });
      }

      // 8. Marcas preferidas (Peso: 15 pts)
      if (hasBrandPref) {
        maxScore += 15;
        const matched = ansMarcas.some((m: string) => model.brandName === m);
        if (matched) score += 15;
        matchReasons.push({ label: matched ? `Marca ${model.brandName}` : `Alternativa: ${model.brandName}`, matched });
      }

      // 9. Origen de fabricación (Peso: 10 pts)
      if (hasOriginPref) {
        maxScore += 10;
        const matched = ansOrigen.some((o: string) => model.origen === o);
        if (matched) score += 10;
        matchReasons.push({ label: `Origen: ${model.origen}`, matched });
      }

      // 10. Features específicos solicitados (Experto)
      const featureLabels: Record<string, string> = {
        camara: 'Cámara / Sensores', adas: 'Asistencias de manejo (ADAS)',
        cuero: 'Asientos de cuero', techo: 'Techo panorámico', '4x4': 'Tracción 4x4 / integral'
      };
      const featureFlags: Record<string, boolean> = { camara: hasCamara, adas: hasAdas, cuero: hasCuero, techo: hasTecho, '4x4': has4x4 };
      if (hasFeatPref) {
        ansFeat.forEach((feat: string) => {
          if (feat === '4x4' && reqOffroad) return; // Ya evaluado en terreno
          maxScore += 10;
          const matched = !!featureFlags[feat];
          if (matched) score += 10;
          matchReasons.push({ label: featureLabels[feat] || feat, matched });
        });
      }

      // Bono de calidad general y verosimilitud urbana (desempate técnico hasta 10 pts)
      maxScore += 10;
      const qualityBonus = Math.min(10, Math.round(maxEquipScore / 35));
      score += qualityBonus;

      // Penalización de nicho: si el usuario NO pidió 4x4/offroad ni aventura, y el auto es un
      // todoterreno rústico de nicho sin ADAS, con <= 4 plazas o baúl minúsculo, evitamos que
      // desplace a SUVs urbanas/familiares más completas
      if (!reqOffroad && uso !== 'aventura' && has4x4 && !hasAdas && repVersion.plazas <= 4) {
        score = Math.max(5, score - 12);
      }

      const matchPercentage = Math.max(15, Math.min(99, Math.round((score / Math.max(1, maxScore)) * 100)));

      return {
        id: model.id, brandId: model.brandId, brandName: model.brandName, modelName: model.name,
        tipo_carroceria: model.tipo_carroceria, imgUrl: model.imgUrl, startingPrice: repVersion.price,
        availableFuels: fuels, availableTransmissions: trans, maxPlazas,
        hasAdas, hasCuero, has4x4, hasTecho, hasCamara,
        topFeatures: extractedFeatures.slice(0, 4), dealershipStatus, concesionaria: primaryDealership,
        score, matchPercentage, equipScore: maxEquipScore,
        origen: model.origen, matchReasons,
        fuelTier: fuelEval.tier,
        bodyTier: bodyEval.tier,
        budgetTier: budgetEval.tier,
        plazasTier: plazasEval.tier,
        terrainTier: terrainEval.tier
      };
    };

    // Modelo de referencia opcional ("¿Ya tenés un modelo en mente?")
    const referenceModel = referenceModelId ? rawModels.find(m => m.id === referenceModelId) : null;
    const referenceMatch = referenceModel ? scoreModel(referenceModel) : null;
    setReferenceMatch(referenceMatch);

    // Evaluar todos los modelos del catálogo
    const allScored = rawModels
      .filter(model => model.id !== referenceModelId)
      .map(model => scoreModel(model))
      .filter((a): a is ScoredModel => a !== null);

    // Ordenamiento maestro por jerarquía de verosimilitud y afinidad:
    // 1. Mayor porcentaje de coincidencia
    // 2. Mejor tier de motorización (EV/PHEV -> HEV -> MHEV -> Nafta)
    // 3. Mejor tier de carrocería
    // 4. Mejor tier de presupuesto
    // 5. Mayor equipamiento real (ADAS, airbags, confort)
    const sortCandidates = (list: ScoredModel[]) => {
      return [...list].sort((a, b) => {
        if (b.matchPercentage !== a.matchPercentage) return b.matchPercentage - a.matchPercentage;
        if ((a.fuelTier ?? 9) !== (b.fuelTier ?? 9)) return (a.fuelTier ?? 9) - (b.fuelTier ?? 9);
        if ((a.bodyTier ?? 9) !== (b.bodyTier ?? 9)) return (a.bodyTier ?? 9) - (b.bodyTier ?? 9);
        if ((a.budgetTier ?? 9) !== (b.budgetTier ?? 9)) return (a.budgetTier ?? 9) - (b.budgetTier ?? 9);
        if (b.equipScore !== a.equipScore) return b.equipScore - a.equipScore;
        return a.startingPrice - b.startingPrice;
      });
    };

    // Deduplicador de familia de modelos (evita recomendar JIMNY y JIMNY 5-DOOR juntos en el Top 3)
    const getFamilyKey = (m: ScoredModel): string => {
      const cleanName = m.modelName
        .toUpperCase()
        .replace(/\b(5-DOOR|3-DOOR|5 PUERTAS|3 PUERTAS|LITE|PRO|MAX|PLUS|NEW|NUEVO|SEDAN|SEDÁN|HATCHBACK|HB)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      return `${m.brandId}_${cleanName || m.modelName}`;
    };

    // =========================================================================
    // CASCADA MULTIDIMENSIONAL PROGRESIVA (WATERFALL)
    // =========================================================================
    // Nivel 0: Match Estricto (Presupuesto exacto, Carrocería 1, Combustible 1, Plazas 1, Terreno 1)
    // Nivel 1: Sustituto Tecnológico Directo y Tolerancia Comercial (ej. incluye HEV cuando pide EV/PHEV, +8% precio, 4/5 plazas)
    // Nivel 2: Sustituto Parcial (ej. incluye MHEV y Crossovers/Hatchbacks elevados dentro de tolerancia de precio)
    // Nivel 3: Escalón de Presupuesto Adyacente manteniendo Tecnología y Silueta
    // Nivel 4: Flexibilización de Motorización (incluye Nafta/Flex eficientes dentro de carrocería y presupuesto)
    // Nivel 5: Flexibilización amplia de Carrocería y Presupuesto Adyacente
    // Nivel 6: Red de seguridad total sobre el catálogo general (Garantiza 0 escenarios vacíos)
    const stagePredicates: Array<{ level: number; check: (m: ScoredModel) => boolean }> = [
      {
        level: 0,
        check: m => (m.budgetTier ?? 1) === 1 && (m.bodyTier ?? 1) === 1 && (m.fuelTier ?? 1) === 1 && (m.plazasTier ?? 1) === 1 && (m.terrainTier ?? 1) === 1
      },
      {
        level: 1,
        check: m => (m.budgetTier ?? 1) <= 2 && (m.bodyTier ?? 1) === 1 && (m.fuelTier ?? 1) <= 2 && (m.plazasTier ?? 1) === 1 && (m.terrainTier ?? 1) <= 2
      },
      {
        level: 2,
        check: m => (m.budgetTier ?? 1) <= 2 && (m.bodyTier ?? 1) <= 2 && (m.fuelTier ?? 1) <= 3 && (m.plazasTier ?? 1) <= 2 && (m.terrainTier ?? 1) <= 2
      },
      {
        level: 3,
        check: m => (m.budgetTier ?? 1) <= 3 && (m.bodyTier ?? 1) <= 2 && (m.fuelTier ?? 1) <= 3 && (m.plazasTier ?? 1) <= 2 && (m.terrainTier ?? 1) <= 3
      },
      {
        level: 4,
        check: m => (m.budgetTier ?? 1) <= 2 && (m.bodyTier ?? 1) <= 2 && (m.fuelTier ?? 1) <= 4 && (m.plazasTier ?? 1) <= 2 && (m.terrainTier ?? 1) <= 3
      },
      {
        level: 5,
        check: m => (m.budgetTier ?? 1) <= 3 && (m.bodyTier ?? 1) <= 3 && (m.fuelTier ?? 1) <= 4 && (m.plazasTier ?? 1) <= 3
      },
      {
        level: 6,
        check: () => true
      }
    ];

    let qualifiedPool: ScoredModel[] = [];
    let appliedLevel = 0;
    const seenIds = new Set<string>();

    for (const stg of stagePredicates) {
      const stageMatches = sortCandidates(allScored.filter(m => !seenIds.has(m.id) && stg.check(m)));
      if (stageMatches.length > 0 && qualifiedPool.length < 3) {
        appliedLevel = stg.level;
      }
      stageMatches.forEach(m => {
        seenIds.add(m.id);
        qualifiedPool.push(m);
      });

      // Contar cuántas familias de modelos distintas tenemos en la piscina calificada
      const distinctFamilies = new Set(qualifiedPool.map(getFamilyKey)).size;
      if (distinctFamilies >= 5 || (distinctFamilies >= 3 && stg.level >= 2)) {
        break;
      }
    }

    // Mensaje transparente de flexibilización según el nivel alcanzado
    if (appliedLevel === 0) {
      setRelaxationInfo(null);
    } else if (appliedLevel === 1) {
      if (hasFuelPref && qualifiedPool.some(m => (m.fuelTier ?? 1) === 2)) {
        setRelaxationInfo({
          level: 1,
          message: 'Sumamos alternativas Híbridas (HEV) dentro de tu segmento y presupuesto para darte las mejores opciones electrificadas del mercado.'
        });
      } else if (reqPlazas !== null && reqPlazas <= 2) {
        setRelaxationInfo({
          level: 1,
          message: 'Incluimos vehículos compactos de 4 y 5 plazas, ideales para 1 o 2 ocupantes dentro de tu presupuesto.'
        });
      } else {
        setRelaxationInfo(null);
      }
    } else if (appliedLevel === 2) {
      setRelaxationInfo({
        level: 2,
        message: 'Ampliamos la búsqueda a motorizaciones Híbridas (HEV / MHEV) y siluetas equivalentes dentro de tu rango de presupuesto.'
      });
    } else if (appliedLevel === 3) {
      setRelaxationInfo({
        level: 3,
        message: 'Ampliamos ligeramente el margen de presupuesto para mostrarte vehículos que cumplen con la tecnología y carrocería que buscás.'
      });
    } else if (appliedLevel === 4) {
      setRelaxationInfo({
        level: 4,
        message: 'Incluimos motorizaciones eficientes adicionales dentro de tu carrocería y rango de presupuesto.'
      });
    } else {
      setRelaxationInfo({
        level: 5,
        message: 'Flexibilizamos los filtros para sugerirte las opciones 0km más cercanas y convenientes a tu búsqueda.'
      });
    }

    // 0. VERIFICACIÓN DEL SLOT PATROCINADO (CAMPAÑAS B2B PARA RECOMENDADOR)
    const now = new Date();
    const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const sponsoredCampaign = ads.find(c => {
      if (c.isActive === false) return false;
      const loc = (c.location || '').toLowerCase();
      const isValidLoc = loc === 'recomendador' || loc === 'ambos' || loc === 'recomendador_slot';
      if (!isValidLoc) return false;
      if (!c.modelId) return false;
      if (c.startDate && c.startDate > localToday) return false;
      if (c.endDate && c.endDate < localToday) return false;
      return true;
    });

    let sponsoredOption: ScoredModel | null = null;
    if (sponsoredCampaign && sponsoredCampaign.modelId) {
      const sponsoredModel = rawModels.find(m => m.id === sponsoredCampaign.modelId);
      if (sponsoredModel) {
        const scoredSponsored = scoreModel(sponsoredModel);
        if (scoredSponsored) {
          scoredSponsored.badge = '⭐ Opción Patrocinada';
          if (sponsoredCampaign.sponsor) {
            scoredSponsored.dealershipStatus = `Pauta Oficial: ${sponsoredCampaign.sponsor}`;
          }
          sponsoredOption = scoredSponsored;
          qualifiedPool = qualifiedPool.filter(m => m.id !== sponsoredModel.id);
        }
      }
    }

    // =========================================================================
    // ADJUDICACIÓN VEROSÍMIL DE LOS 3 SLOTS ORGÁNICOS
    // =========================================================================
    let finalTop3: ScoredModel[] = [];
    const usedFamilies = new Set<string>();

    const pickDistinctCandidate = (list: ScoredModel[]): ScoredModel | undefined => {
      const distinct = list.find(m => !usedFamilies.has(getFamilyKey(m)));
      return distinct || list[0];
    };

    if (qualifiedPool.length >= 3) {
      // 1. Slot #1: 🏆 Mayor Coincidencia (Mejor afinidad integral)
      const top1 = qualifiedPool[0];
      top1.badge = '🏆 Mayor Coincidencia';
      finalTop3.push(top1);
      usedFamilies.add(getFamilyKey(top1));
      qualifiedPool = qualifiedPool.filter(m => m.id !== top1.id);

      // Filtrar la piscina para Slots #2 y #3 de modo que NUNCA caigan a una tecnología
      // desconectada (ej. Nafta tier 4) si existen candidatos de alta afinidad (tier <= 3)
      const bestRemainingFuelTier = Math.min(...qualifiedPool.map(m => m.fuelTier ?? 1));
      const bestRemainingBodyTier = Math.min(...qualifiedPool.map(m => m.bodyTier ?? 1));
      const allowedFuelTier = bestRemainingFuelTier <= 3 ? Math.min(3, bestRemainingFuelTier + 1) : bestRemainingFuelTier + 1;
      const allowedBodyTier = bestRemainingBodyTier <= 2 ? Math.min(2, bestRemainingBodyTier + 1) : bestRemainingBodyTier + 1;

      const coherentSubPool = qualifiedPool.filter(
        m => (m.fuelTier ?? 1) <= allowedFuelTier && (m.bodyTier ?? 1) <= allowedBodyTier
      );
      const activePool = coherentSubPool.length >= 2 ? coherentSubPool : qualifiedPool.slice(0, 8);

      // 2. Slot #2: 💎 Mayor Equipamiento (Mayor puntaje real de ADAS, Airbags, Confort y Pantalla dentro del pool coherente)
      const sortedByEquip = [...activePool].sort((a, b) => b.equipScore - a.equipScore || b.matchPercentage - a.matchPercentage);
      const topEquipped = pickDistinctCandidate(sortedByEquip) || qualifiedPool[0];
      topEquipped.badge = '💎 Mayor Equipamiento';
      finalTop3.push(topEquipped);
      usedFamilies.add(getFamilyKey(topEquipped));
      qualifiedPool = qualifiedPool.filter(m => m.id !== topEquipped.id);

      // 3. Slot #3: ⚖️ Opción Inteligente (Mejor relación Precio Accesible / Equipamiento / Eficiencia dentro del pool coherente)
      const remainingCoherent = activePool.filter(m => m.id !== topEquipped.id);
      const poolForValue = remainingCoherent.length >= 1 ? remainingCoherent : qualifiedPool.slice(0, 6);
      const sortedBySmartValue = [...poolForValue].sort((a, b) => {
        // Priorizar estar en presupuesto (budgetTier <= 2) y mejor precio con buen equipamiento
        if ((a.budgetTier ?? 1) !== (b.budgetTier ?? 1)) return (a.budgetTier ?? 1) - (b.budgetTier ?? 1);
        if ((a.fuelTier ?? 1) !== (b.fuelTier ?? 1)) return (a.fuelTier ?? 1) - (b.fuelTier ?? 1);
        return a.startingPrice - b.startingPrice || b.equipScore - a.equipScore;
      });
      const topValue = pickDistinctCandidate(sortedBySmartValue) || qualifiedPool[0];
      topValue.badge = '⚖️ Opción Inteligente';
      finalTop3.push(topValue);
      usedFamilies.add(getFamilyKey(topValue));
      qualifiedPool = qualifiedPool.filter(m => m.id !== topValue.id);
    } else {
      finalTop3 = qualifiedPool.map((m, idx) => {
        const badges = ['🏆 Mayor Coincidencia', '💎 Mayor Equipamiento', '⚖️ Opción Inteligente'];
        m.badge = badges[idx] || '🏆 Recomendado';
        return m;
      });
    }

    // Ensamble final: 3 slots orgánicos + 1 slot opcional patrocinado (si existe campaña activa)
    const finalMatches: ScoredModel[] = sponsoredOption ? [...finalTop3, sponsoredOption] : finalTop3;

    setTopMatches(finalMatches);
    setOtherMatches(qualifiedPool.slice(0, 4));

    // Selección Inteligente y Contextual de Ads de Banner en el Recomendador (solo campañas de banner sin modelId)
    const bannerCandidates = ads.filter(a => !a.modelId);
    const winningBrand = finalTop3[0]?.brandName?.toLowerCase() || '';
    const winningCategory = finalTop3[0]?.tipo_carroceria?.toLowerCase() || '';

    // 1. Prioridad: Coincidencia por marca del sponsor
    let selectedAd = bannerCandidates.find(a => {
      if (!a.sponsor) return false;
      const sp = a.sponsor.toLowerCase();
      return winningBrand && (sp === winningBrand || sp.includes(winningBrand) || winningBrand.includes(sp));
    });

    // 2. Prioridad: Coincidencia por categoría específica
    if (!selectedAd && winningCategory) {
      selectedAd = bannerCandidates.find(a => {
        if (!a.targetCategory) return false;
        const cat = a.targetCategory.toLowerCase();
        return cat !== 'todas' && cat !== 'todos' && cat === winningCategory;
      });
    }

    // 3. Prioridad: Campañas dirigidas a "Todas" las categorías o generales para Recomendador
    if (!selectedAd) {
      selectedAd = bannerCandidates.find(a => {
        if (!a.targetCategory) return true;
        const cat = a.targetCategory.toLowerCase();
        return cat === 'todas' || cat === 'todos';
      });
    }

    // 4. Prioridad: Cualquier otra campaña activa para el recomendador
    if (!selectedAd && bannerCandidates.length > 0) {
      selectedAd = bannerCandidates[0];
    }

    setSmartAd(selectedAd || null);
    return finalMatches;
  };

  // ==========================================
  // 5. LEAD CAPTURE (EL GATILLO B2B)
  // ==========================================
  const submitLeadAndShowResults = async (e: React.FormEvent) => {
    e.preventDefault();
    track('lead_submit_attempt', { origen: 'Recomendador Interactivo' });
    setIsSubmittingLead(true);
    setFeedback({ type: '', message: 'Analizando base de datos automotriz...' });
    
    const phoneRegex = /^09\d{8}$/;
    if (!phoneRegex.test(leadForm.telefono)) {
      track('lead_submit_error', { origen: 'Recomendador Interactivo', motivo: 'telefono_invalido' });
      setFeedback({ type: 'error', message: 'El celular debe tener 10 dígitos y empezar con 09.' });
      setIsSubmittingLead(false); return;
    }

    // Nombre y email son opcionales (menos fricción para ver resultados). El email
    // solo se valida si el usuario decidió cargarlo -- sirve para enviarle el PDF.
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const emailIngresado = leadForm.email.trim();
    if (emailIngresado && !emailRegex.test(emailIngresado)) {
      track('lead_submit_error', { origen: 'Recomendador Interactivo', motivo: 'email_invalido' });
      setFeedback({ type: 'error', message: 'El correo no parece válido. Podés dejarlo vacío si preferís.' });
      setIsSubmittingLead(false); return;
    }

    const nombreLead = leadForm.nombre.trim() || 'Sin nombre (Recomendador)';

    try {
      await addDoc(collection(db, 'leads'), {
        nombre: nombreLead,
        telefono: leadForm.telefono,
        email: emailIngresado,
        vehiculo: 'Perfilado por Recomendador Interactivo',
        origen: 'Recomendador Interactivo',
        estado: 'Nuevo',
        preferencias_wizard: answers,
        concesionaria_destino: 'A designar (Central DATACAR)',
        concesionaria_destino_norm: 'A DESIGNAR',
        createdAt: serverTimestamp()
      });

      // Telemetría de preferencias del recomendador para el panel de analítica B2B
      try {
        const effectiveAnswers = perfilNovato ? { ...answers, ...derivarPreferenciasNovato(answers) } : answers;
        await addDoc(collection(db, 'wizard_stats'), {
          answers,
          effectiveAnswers,
          perfil: answers['conocimiento'] || (perfilNovato ? 'novato' : 'experto'),
          presupuesto: effectiveAnswers['presupuesto'] || answers['presupuesto'] || null,
          carroceria: effectiveAnswers['carroceria'] || answers['carroceria'] || answers['uso'] || null,
          combustible: effectiveAnswers['combustible'] || answers['combustible'] || null,
          plazas: effectiveAnswers['plazas'] || answers['plazas'] || answers['personas'] || null,
          transmision: effectiveAnswers['transmision'] || answers['transmision'] || null,
          prioridad: answers['prioridad'] || null,
          uso: answers['uso'] || null,
          terreno: answers['terreno'] || null,
          createdAt: serverTimestamp()
        });
      } catch (telemetryErr) {
        console.warn('Error registrando telemetría en wizard_stats:', telemetryErr);
      }

      track('lead_submit_success', { origen: 'Recomendador Interactivo', canal: 'wizard' });

      const finalTop3 = runAlgorithm();

      // Disparo de correo B2B a la gerencia (fail-safe: el lead ya está guardado
      // en DB, sendLeadNotificationEmail nunca throwea, solo loguea si falla).
      await sendLeadNotificationEmail({
        leadName: nombreLead,
        leadPhone: leadForm.telefono,
        leadEmail: emailIngresado || 'No proporcionado',
        vehicleOfInterest: 'Perfilado por Recomendador Interactivo',
        origen: 'Recomendador Interactivo',
        concesionariaDestino: 'A designar (Central DATACAR)',
        wizardAnswers: answers,
        topMatches: finalTop3.map(m => ({
          brandName: m.brandName,
          modelName: m.modelName,
          startingPrice: m.startingPrice,
          matchPercentage: m.matchPercentage,
          badge: m.badge,
        })),
      });

      if (emailIngresado) {
        await sendRecommendationResultsEmail(emailIngresado, finalTop3.map(m => ({
          brandName: m.brandName, modelName: m.modelName, startingPrice: m.startingPrice,
          matchPercentage: m.matchPercentage, badge: m.badge, brandId: m.brandId, modelId: m.id
        })));
      }
      setStep(WIZARD_STEPS.length + 3); // Salta a Resultados
    } catch (error) {
      console.error('Error guardando el lead del recomendador:', error);
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
    
    if (entregaNum >= calcVehicle.startingPrice) { showToast('La entrega debe ser menor al precio total.'); return; }

    setCuotaCalculada(calcularCuotaFrancesa(calcVehicle.startingPrice, entregaNum, plazoNum, finConfig));
  };

  if (loading) return <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center font-bold text-[#0A1F33] tracking-widest uppercase text-sm">Cargando inteligencia de mercado...</div>;

  return (
    <main className="min-h-screen bg-[#F8F9FA] text-[#3A3A3C] font-sans flex flex-col">
      
      {/* NAVBAR FLAT */}
      <Navbar items={[]} cta={{ label: 'Salir', href: '/catalogo', compact: true }} />

      {/* ==========================================
          PASO 0: INTRODUCCIÓN
          ========================================== */}
      {step === 0 && (
        <section className="flex-grow flex flex-col items-center justify-center p-4 py-16">
          <div className="max-w-xl w-full bg-[#FFFFFF] border border-[#0A1F33]/10 p-10 md:p-12 text-center rounded-3xl shadow-xl">
            <h1 className="font-black text-4xl md:text-5xl text-[#0A1F33] uppercase mb-4 leading-tight" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
              ENCONTRÁ TU <br/><span className="text-[#00BFFF]">AUTO IDEAL</span>
            </h1>
            <p className="text-sm text-[#3A3A3C] mb-6 leading-relaxed font-medium" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
              Respondé algunas preguntas y te ayudamos a encontrar el 0km perfecto para vos, basado en tu estilo de vida y preferencias.
            </p>
            <div className="bg-[#E6F4EA] border border-[#1E8E3E]/25 p-3.5 mb-8 text-center rounded-xl">
              <p className="text-[10px] font-bold text-[#1E8E3E] uppercase tracking-wider">
                100% Sin Costo • Precios directos de concesionaria oficial sin comisiones
              </p>
            </div>
            <button onClick={() => setStep(1)} className="w-full bg-[#00BFFF] hover:bg-[#0A1F33] text-[#FFFFFF] font-bold text-sm uppercase tracking-widest py-5 transition-all duration-200 flex justify-center items-center gap-2 rounded-xl shadow-md hover:shadow-lg hover:-translate-y-0.5">
              Empezar <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
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
          <div className="w-full bg-[#FFFFFF]/95 backdrop-blur-md py-6 px-4 md:px-8 border-b border-[#0A1F33]/10 flex flex-col items-center shadow-xs">
            <div className="max-w-3xl w-full flex justify-between items-center mb-2.5">
               <button onClick={() => setStep(step - 1)} className="flex items-center gap-1.5 text-[10px] font-bold text-[#3A3A3C] hover:text-[#0A1F33] uppercase tracking-widest border-none outline-none transition-colors px-2 py-1 rounded-lg hover:bg-[#F8F9FA]">
                 <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg> Volver
               </button>
               <span className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest">Pregunta {step} de {WIZARD_STEPS.length}</span>
               <span className="text-[10px] font-bold text-[#00BFFF] uppercase tracking-widest bg-[#F5FBFF] px-2.5 py-0.5 rounded-full border border-[#00BFFF]/20">{Math.round((step/WIZARD_STEPS.length)*100)}%</span>
            </div>
            <div className="max-w-3xl w-full h-2.5 bg-[#F0F4F8] rounded-full overflow-hidden">
              <div className="h-full bg-[#00BFFF] transition-all duration-300 rounded-full" style={{ width: `${(step / WIZARD_STEPS.length) * 100}%` }}></div>
            </div>
          </div>
          
          <div className="flex-grow flex flex-col items-center justify-start pt-12 p-4">
            <div className="max-w-3xl w-full">
              <div className="mb-10 text-center">
                <h2 className="font-black text-3xl md:text-4xl text-[#0A1F33] mb-2" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
                  {WIZARD_STEPS[step - 1].title}
                </h2>
                <p className="text-sm text-[#C0C0C0] font-medium">{WIZARD_STEPS[step - 1].subtitle}</p>
              </div>

              {/* Grid Dinámico Contemporáneo */}
              <div className={`grid gap-4 ${WIZARD_STEPS[step - 1].id === 'marcas' ? 'grid-cols-2 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2'}`}>
                {WIZARD_STEPS[step - 1].options.map((opt, i) => {
                  const qId = WIZARD_STEPS[step - 1].id;
                  const isMultiple = WIZARD_STEPS[step - 1].isMultiple;
                  const isSelected = isMultiple ? (answers[qId] || []).includes(opt.value) : answers[qId] === opt.value;

                  return (
                    <button 
                      key={i} 
                      onClick={() => handleAnswerClick(qId, opt.value, isMultiple)} 
                      className={`bg-[#FFFFFF] border p-6 transition-all duration-200 flex flex-row items-center gap-4 text-left group rounded-2xl
                        ${isSelected ? 'border-[#00BFFF] bg-[#F5FBFF] shadow-md ring-2 ring-[#00BFFF]/20' : 'border-[#0A1F33]/12 hover:border-[#00BFFF] shadow-sm hover:shadow-md hover:-translate-y-0.5'}`}
                    >
                      {qId === 'carroceria' && opt.value !== 'any' ? (
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-[#00BFFF]/15 text-[#00BFFF]' : 'bg-[#F8F9FA] text-[#3A3A3C] group-hover:text-[#0A1F33]'}`}>
                          <CarroceriaIcon tipo={opt.value} className="w-8 h-8" />
                        </div>
                      ) : opt.icon ? (
                        <div className={`w-11 h-11 rounded-xl bg-[#F8F9FA] flex items-center justify-center text-xl shrink-0 ${isSelected ? 'bg-[#00BFFF]/15' : 'grayscale opacity-75 group-hover:grayscale-0 group-hover:opacity-100'}`}>
                          {opt.icon}
                        </div>
                      ) : null}
                      <div className="flex-grow">
                        <span className={`font-bold text-sm block ${isSelected ? 'text-[#0A1F33]' : 'text-[#3A3A3C] group-hover:text-[#0A1F33]'}`}>{opt.label}</span>
                        {opt.desc && <span className="text-[10px] text-[#3A3A3C]/60 mt-1 block">{opt.desc}</span>}
                      </div>
                      {isMultiple && (
                        <div className={`w-5 h-5 rounded-md border shrink-0 flex items-center justify-center transition-colors ${isSelected ? 'border-[#00BFFF] bg-[#00BFFF]' : 'border-[#C0C0C0]'}`}>
                           {isSelected && <svg className="w-3 h-3 text-[#FFFFFF]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {['combustible', 'features'].includes(WIZARD_STEPS[step - 1].id) && (
                <GlosarioSiglas
                  className="mt-6"
                  titulo="¿Qué significan estas siglas?"
                  fuentes={WIZARD_STEPS[step - 1].options.flatMap(o => [o.label, o.value, o.desc])}
                />
              )}

              {WIZARD_STEPS[step - 1].isMultiple && (
                <div className="mt-8 text-center">
                  <button
                    onClick={() => advanceMultiple(WIZARD_STEPS[step-1].id)}
                    disabled={!answers[WIZARD_STEPS[step-1].id] || answers[WIZARD_STEPS[step-1].id].length === 0}
                    className="bg-[#0A1F33] hover:bg-[#00BFFF] text-[#FFFFFF] font-bold text-xs uppercase tracking-widest py-4 px-12 transition-all duration-200 inline-block disabled:opacity-30 disabled:bg-[#C0C0C0] disabled:cursor-not-allowed rounded-xl shadow-md hover:shadow-lg"
                  >
                    Continuar →
                  </button>
                  <button onClick={() => { setAnswers(prev => ({...prev, [WIZARD_STEPS[step-1].id]: ['any']})); setStep(step+1); }} className="block mx-auto mt-4 text-[10px] text-[#C0C0C0] hover:text-[#0A1F33] font-bold uppercase tracking-widest underline">
                    Saltar pregunta
                  </button>
                </div>
              )}

            </div>
          </div>
        </section>
      )}

      {/* ==========================================
          PASO ADICIONAL: ¿YA TENÉS UN MODELO EN MENTE?
          ========================================== */}
      {step === WIZARD_STEPS.length + 1 && (
        <section className="flex-grow flex flex-col">
          <div className="w-full bg-[#FFFFFF]/95 backdrop-blur-md py-6 px-4 md:px-8 border-b border-[#0A1F33]/10 flex justify-center shadow-xs">
            <button onClick={() => setStep(step - 1)} className="max-w-3xl w-full flex items-center gap-1.5 text-[10px] font-bold text-[#3A3A3C] hover:text-[#0A1F33] uppercase tracking-widest border-none outline-none transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg> Volver
            </button>
          </div>

          <div className="flex-grow flex flex-col items-center justify-start pt-12 p-4">
            <div className="max-w-3xl w-full">
              <div className="mb-10 text-center">
                <h2 className="font-black text-3xl md:text-4xl text-[#0A1F33] mb-2" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>¿Ya tenés un modelo en mente?</h2>
                <p className="text-sm text-[#C0C0C0] font-medium">Lo comparamos directo contra las recomendaciones que arme DATACAR para vos.</p>
              </div>

              {wantsReference === null && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button onClick={() => setWantsReference(true)} className="bg-[#FFFFFF] border border-[#0A1F33]/12 hover:border-[#00BFFF] p-6 transition-all duration-200 flex items-center gap-4 text-left group rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5">
                    <div className="w-11 h-11 rounded-xl bg-[#F8F9FA] flex items-center justify-center text-xl shrink-0">🎯</div>
                    <span className="font-bold text-sm text-[#3A3A3C] group-hover:text-[#0A1F33]">Sí, quiero compararlo</span>
                  </button>
                  <button onClick={() => { setWantsReference(false); setReferenceModelId(null); setStep(step + 1); }} className="bg-[#FFFFFF] border border-[#0A1F33]/12 hover:border-[#0A1F33] p-6 transition-all duration-200 flex items-center gap-4 text-left group rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5">
                    <div className="w-11 h-11 rounded-xl bg-[#F8F9FA] flex items-center justify-center text-xl shrink-0">⚖️</div>
                    <span className="font-bold text-sm text-[#3A3A3C] group-hover:text-[#0A1F33]">No, sorprendeme</span>
                  </button>
                </div>
              )}

              {wantsReference === true && !referenceModelId && (
                <div>
                  <div className="flex border border-[#0A1F33]/20 mb-4 bg-[#FFFFFF] rounded-xl overflow-hidden shadow-sm focus-within:border-[#00BFFF]">
                    <div className="pl-4 flex items-center text-[#C0C0C0]"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg></div>
                    <input type="text" aria-label="Buscar modelo" placeholder="Ej: Toyota Corolla" className="w-full p-4 text-sm focus:outline-none text-[#3A3A3C]" value={refSearchTerm} onChange={e => setRefSearchTerm(e.target.value)} autoFocus />
                  </div>
                  <div className="max-h-80 overflow-y-auto border border-[#0A1F33]/10 custom-scrollbar bg-[#FFFFFF] rounded-2xl shadow-md">
                    {refSearchTerm.length < 2 ? (
                      <div className="p-8 text-center text-[#C0C0C0] text-[10px] font-bold uppercase tracking-widest">Escribí al menos 2 caracteres...</div>
                    ) : (() => {
                      const term = refSearchTerm.toLowerCase();
                      const results = rawModels.filter(m => `${m.brandName} ${m.name}`.toLowerCase().includes(term)).slice(0, 8);
                      return results.length > 0 ? results.map(m => (
                        <button type="button" key={m.id} onClick={() => setReferenceModelId(m.id)} className="appearance-none text-left w-full p-4 border-b border-[#0A1F33]/5 flex justify-between items-center transition-colors cursor-pointer hover:bg-[#F5FBFF]">
                          <span className="font-bold text-xs text-[#0A1F33] uppercase">{m.brandName} {m.name}</span>
                          <span className="text-[10px] text-[#00BFFF] font-black bg-[#F5FBFF] px-3 py-1 rounded-full">+ Elegir</span>
                        </button>
                      )) : <div className="p-8 text-center text-[#C0C0C0] text-[10px] font-bold uppercase tracking-widest">Sin resultados en el catálogo.</div>;
                    })()}
                  </div>
                  <button onClick={() => setWantsReference(null)} className="block mx-auto mt-6 text-[10px] text-[#C0C0C0] hover:text-[#0A1F33] font-bold uppercase tracking-widest underline">
                    Cancelar
                  </button>
                </div>
              )}

              {wantsReference === true && referenceModelId && (() => {
                const chosen = rawModels.find(m => m.id === referenceModelId);
                return (
                  <div className="text-center border border-[#00BFFF] bg-[#F5FBFF] p-8 rounded-2xl shadow-md">
                    <p className="text-[10px] font-bold text-[#00BFFF] uppercase tracking-widest mb-1">Vas a comparar contra</p>
                    <p className="font-black text-xl text-[#0A1F33] uppercase mb-6">{chosen?.brandName} {chosen?.name}</p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                      <button onClick={() => setStep(step + 1)} className="bg-[#0A1F33] hover:bg-[#00BFFF] text-[#FFFFFF] font-bold text-xs uppercase tracking-widest py-4 px-12 transition-colors rounded-xl shadow-sm">
                        Continuar →
                      </button>
                      <button onClick={() => { setReferenceModelId(null); setRefSearchTerm(''); }} className="border border-[#0A1F33]/20 bg-[#FFFFFF] text-[#0A1F33] hover:bg-[#F5F5F5] font-bold text-xs uppercase tracking-widest py-4 px-8 transition-colors rounded-xl">
                        Cambiar
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </section>
      )}

      {/* ==========================================
          PASO 11: LEAD CAPTURE (Gatillo B2B)
          ========================================== */}
      {step === WIZARD_STEPS.length + 2 && (
        <section className="flex-grow flex flex-col items-center justify-center p-4 py-16 relative">
          {/* Preview Blureado del Dossier (Psicología de Recompensa: generar expectativa
              de lo que se desbloquea al completar el formulario, sin revelar datos reales) */}
          <div className="absolute inset-0 flex justify-center items-center pointer-events-none -z-10 overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-[1200px] px-4 blur-sm md:blur-md opacity-25 select-none">
              {['💰 Más Económico', '💎 Tope de Gama', '⚖️ Opción Equilibrada'].map((badge) => (
                <div key={badge} className="bg-[#FFFFFF] border border-[#0A1F33]/10 p-6 flex flex-col gap-4 rounded-2xl">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-[#00BFFF] bg-[#F5FBFF] border border-[#00BFFF]/30 px-2.5 py-1 w-max rounded-full">{badge}</span>
                  <div className="h-32 bg-[#F5F5F5] w-full rounded-xl"></div>
                  <div className="h-3 bg-[#C0C0C0] w-3/4 rounded-full"></div>
                  <div className="h-3 bg-[#C0C0C0] w-1/2 rounded-full"></div>
                  <div className="h-8 bg-[#0A1F33] w-2/3 mt-2 rounded-xl"></div>
                </div>
              ))}
            </div>
          </div>

          <div className="max-w-xl w-full bg-[#FFFFFF] border-t-4 border-t-[#00BFFF] border border-[#0A1F33]/10 p-8 md:p-10 rounded-3xl shadow-2xl z-10">
            <button onClick={() => setStep(WIZARD_STEPS.length + 1)} className="flex items-center gap-1.5 text-[10px] font-bold text-[#3A3A3C] hover:text-[#0A1F33] uppercase tracking-widest border-none outline-none transition-colors mb-6">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg> Volver a modificar respuestas
            </button>
            <h2 className="font-black text-3xl text-[#0A1F33] uppercase mb-2 text-center" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>Ya casi tenés las mejores opciones</h2>
            <p className="text-[11px] text-[#3A3A3C] text-center uppercase tracking-widest mb-8 font-medium">Dejanos un celular y te mostramos los 3 modelos.</p>

            <div className="bg-[#E6F4EA] border border-[#1E8E3E]/25 p-4 mb-8 text-center rounded-2xl">
              <p className="text-[10px] font-bold text-[#1E8E3E] uppercase tracking-widest">100% Sin Costo • Precios Oficiales sin Comisión</p>
              <p className="text-xs text-[#1E8E3E]/80 mt-1">Datacar te conecta directo con la concesionaria oficial al precio de lista o con promociones vigentes. Cero intermediarios, cero recargos.</p>
            </div>

            <form onSubmit={submitLeadAndShowResults} className="flex flex-col gap-4">
              <div>
                <input type="tel" minLength={10} maxLength={10} aria-label="Celular" placeholder="Celular (Ej: 0981234567)" className="w-full border border-[#0A1F33]/15 p-4 text-xs focus:outline-none focus:border-[#00BFFF] bg-[#F8F9FA] rounded-xl transition-all" required value={leadForm.telefono} onChange={e=>setLeadForm({...leadForm, telefono: e.target.value})} />
              </div>
              <div>
                <input type="text" aria-label="Nombre (opcional)" placeholder="Nombre (opcional)" className="w-full border border-[#0A1F33]/15 p-4 text-xs focus:outline-none focus:border-[#00BFFF] bg-[#F8F9FA] rounded-xl transition-all" value={leadForm.nombre} onChange={e=>setLeadForm({...leadForm, nombre: e.target.value})} />
              </div>
              <div>
                <input type="email" aria-label="Correo electrónico (opcional)" placeholder="Correo electrónico (opcional, para el PDF)" className="w-full border border-[#0A1F33]/15 p-4 text-xs focus:outline-none focus:border-[#00BFFF] bg-[#F8F9FA] rounded-xl transition-all" value={leadForm.email} onChange={e=>setLeadForm({...leadForm, email: e.target.value})} />
              </div>

              <button type="submit" disabled={isSubmittingLead} className="w-full bg-[#00BFFF] hover:bg-[#0A1F33] text-[#FFFFFF] font-bold text-xs uppercase tracking-widest py-5 transition-all duration-200 mt-2 disabled:opacity-50 flex items-center justify-center gap-2 rounded-xl shadow-md hover:shadow-lg">
                {isSubmittingLead ? 'Procesando...' : 'Ver mis 3 modelos'} <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
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
      {step === WIZARD_STEPS.length + 3 && (
        <section className="flex-grow w-full pb-20">
          <div className="w-full bg-[#FFFFFF] border-b border-[#0A1F33]/10 py-12 px-4 text-center shadow-xs">
            <span className="text-[10px] font-bold text-[#00BFFF] uppercase tracking-widest block mb-2">100% Sin Costo • Precios Oficiales de Concesionaria</span>
            <h2 className="font-black text-3xl md:text-4xl text-[#0A1F33] uppercase" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
              Elegidos por <span className="text-[#00BFFF]">DATACAR</span>
            </h2>
            <p className="text-xs text-[#3A3A3C] font-medium max-w-lg mx-auto mt-2">
              Comparamos fichas técnicas sin costo y te conectamos directo con el concesionario oficial de cada marca, sin recargos ni comisiones.
            </p>
          </div>

          <div className="max-w-[1200px] mx-auto px-4 lg:px-8 mt-12">

            {/* TU OPCIÓN DE REFERENCIA (si eligió un modelo para comparar) */}
            {referenceMatch && (
              <div className="mb-12">
                <h3 className="font-bold text-[#3A3A3C] text-sm uppercase tracking-widest mb-6 border-b border-[#0A1F33]/10 pb-2">Tu opción</h3>
                <div className="max-w-sm">
                  <article className="bg-[#FFFFFF] border border-[#00BFFF] border-t-4 border-t-[#00BFFF] flex flex-col relative rounded-2xl shadow-md overflow-hidden">
                    <div className="absolute top-4 left-4 bg-[#FFFFFF]/90 backdrop-blur-sm border border-[#0A1F33]/10 text-[#3A3A3C] font-black text-[10px] uppercase tracking-widest px-3 py-1.5 z-10 flex items-center gap-2 rounded-full shadow-xs">
                      <span className="text-[#00BFFF]">•</span> {referenceMatch.matchPercentage}% Match
                    </div>
                    <div className="absolute top-4 right-4 bg-[#00BFFF] text-[#FFFFFF] font-bold text-[9px] uppercase tracking-widest px-3 py-1.5 z-10 rounded-full shadow-xs">
                      🎯 Tu Opción
                    </div>
                    <div className="relative p-4 h-56 border-b border-[#0A1F33]/5 bg-[#F8F9FA]">
                      {isValidImageSrc(referenceMatch.imgUrl) ? (
                        <Image src={referenceMatch.imgUrl} alt={referenceMatch.modelName} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-contain p-4" unoptimized={!isOptimizableImageSrc(referenceMatch.imgUrl)} />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-[#C0C0C0] uppercase tracking-widest">Sin Imagen</div>
                      )}
                    </div>
                    <div className="p-6 flex flex-col flex-grow">
                      <p className="text-[10px] font-bold text-[#C0C0C0] uppercase tracking-widest truncate">{referenceMatch.brandName}</p>
                      <h3 className="font-black text-xl text-[#0A1F33] uppercase leading-tight mb-4" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>{referenceMatch.modelName}</h3>
                      {referenceMatch.matchReasons.length > 0 && (
                        <ul className="flex flex-col gap-1 mb-6 text-[10px] font-bold uppercase tracking-wide">
                          {referenceMatch.matchReasons.map((reason, idx) => (
                            <li key={idx} className={`flex items-center gap-1.5 ${reason.matched ? 'text-[#1E8E3E]' : 'text-[#C0C0C0]'}`}>
                              <span>{reason.matched ? '✓' : '✕'}</span> {reason.label}
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => openLeadModal({
                            vehiculoInteres: `${referenceMatch.brandName} ${referenceMatch.modelName}`,
                            marcaVehiculo: referenceMatch.brandName,
                            modeloVehiculo: referenceMatch.modelName,
                            origenLead: 'Recomendador - Opción Referencia',
                            concesionariaDestino: referenceMatch.concesionaria || ''
                          })}
                          className="w-full bg-[#00BFFF] hover:bg-[#0A1F33] text-[#FFFFFF] font-bold text-[10px] uppercase tracking-widest py-3 transition-colors flex justify-center items-center gap-1 rounded-xl shadow-sm"
                        >
                          {formatHablarCon(referenceMatch.concesionaria)}
                        </button>
                        <Link href={`/catalogo/${referenceMatch.brandId}/${referenceMatch.id}`} className="w-full text-center block bg-[#FFFFFF] border border-[#0A1F33]/20 text-[#0A1F33] hover:bg-[#F5F5F5] font-bold text-[9px] uppercase tracking-widest py-2.5 transition-colors rounded-xl">
                          Ver Detalles Técnicos
                        </Link>
                      </div>
                    </div>
                  </article>
                </div>
              </div>
            )}

            {/* SIN RESULTADOS: la carrocería es excluyente, puede no haber ningún auto de ese segmento dentro del presupuesto */}
            {topMatches.length === 0 && (
              <div className="bg-[#FFE6E6] border border-[#D93025]/30 p-6 mb-8 flex gap-4 items-start shadow-sm rounded-2xl">
                <div className="w-7 h-7 bg-[#D93025] text-[#FFFFFF] flex items-center justify-center font-black rounded-full shrink-0">!</div>
                <div>
                  <p className="text-[11px] font-bold text-[#0A1F33] uppercase tracking-widest mb-1">No encontramos autos con esa combinación exacta</p>
                  <p className="text-xs text-[#3A3A3C] mb-3">No hay vehículos que encajen con lo que buscás dentro de tu presupuesto. Probá ampliando el presupuesto o cambiando alguna respuesta.</p>
                  <button onClick={() => setStep(2)} className="text-[10px] font-bold text-[#D93025] uppercase tracking-widest underline">Volver a revisar mis respuestas</button>
                </div>
              </div>
            )}

            {/* ALERTA DE FLEXIBILIZACIÓN INTELIGENTE / CONTINGENCIA */}
            {relaxationInfo ? (
              <div className="bg-[#F5FBFF] border border-[#00BFFF]/40 p-5 mb-8 flex gap-4 items-start shadow-sm rounded-2xl">
                <div className="w-7 h-7 bg-[#00BFFF] text-[#FFFFFF] flex items-center justify-center font-black rounded-full shrink-0 text-xs">ℹ️</div>
                <div>
                  <p className="text-[11px] font-bold text-[#0A1F33] uppercase tracking-widest mb-1">Búsqueda Optimizada con Flexibilidad Inteligente</p>
                  <p className="text-xs text-[#3A3A3C]">{relaxationInfo.message}</p>
                </div>
              </div>
            ) : (topMatches.length > 0 && topMatches[0].matchPercentage < 80 ? (
              <div className="bg-[#F5FBFF] border border-[#00BFFF]/40 p-6 mb-8 flex gap-4 items-start shadow-sm rounded-2xl">
                <div className="w-7 h-7 bg-[#00BFFF] text-[#FFFFFF] flex items-center justify-center font-black rounded-full shrink-0">!</div>
                <div>
                  <p className="text-[11px] font-bold text-[#0A1F33] uppercase tracking-widest mb-1">Ampliamos la búsqueda para mostrarte opciones</p>
                  <p className="text-xs text-[#3A3A3C]">No encontramos vehículos que cumplan exactamente con el 100% de tus combinaciones excluyentes. Te mostramos las mejores alternativas viables en el país.</p>
                </div>
              </div>
            ) : null)}

            {/* MATCHES PRINCIPALES CON BADGES B2B (3 orgánicos o 4 con patrocinado) */}
            <div className={`grid grid-cols-1 ${topMatches.length === 4 ? 'md:grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-3'} gap-6 mb-12`}>
              {topMatches.map((model) => {
                const isSponsored = model.badge?.includes('Patrocinada');
                return (
                  <article
                    key={model.id}
                    className={`bg-[#FFFFFF] border ${
                      isSponsored
                        ? 'border-[#00BFFF] border-t-4 border-t-[#00BFFF]'
                        : 'border-[#0A1F33]/10 border-t-4 border-t-[#0A1F33]'
                    } flex flex-col hover:border-[#00BFFF] transition-all duration-300 relative group rounded-2xl shadow-sm hover:shadow-xl hover:-translate-y-1 overflow-hidden`}
                  >
                    {/* % Match Box */}
                    <div className="absolute top-4 left-4 bg-[#FFFFFF]/95 backdrop-blur-sm border border-[#0A1F33]/10 text-[#3A3A3C] font-black text-[10px] uppercase tracking-widest px-3 py-1.5 z-10 flex items-center gap-2 rounded-full shadow-xs">
                      <span className="text-[#00BFFF]">•</span> {isSponsored ? 'Patrocinado' : `${model.matchPercentage}% Match`}
                    </div>

                    {/* INSIGNIA B2B INTELIGENTE */}
                    {model.badge && (
                      <div className={`absolute top-4 right-4 ${isSponsored ? 'bg-[#00BFFF] text-[#0A1F33]' : 'bg-[#0A1F33] text-[#FFFFFF]'} font-bold text-[9px] uppercase tracking-widest px-3 py-1.5 z-10 rounded-full shadow-xs`}>
                        {model.badge}
                      </div>
                    )}

                  <div className="relative p-4 h-56 border-b border-[#0A1F33]/5 bg-[#F8F9FA]">
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
                    <h3 className="font-black text-xl text-[#0A1F33] uppercase leading-tight mb-4" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>{model.modelName}</h3>
                    
                    {/* MATRIZ DE PÍLDORAS (PILL TAGS) */}
                    <div className="flex flex-wrap gap-1.5 mb-6">
                      <span className="bg-[#F8F9FA] border border-[#0A1F33]/10 text-[#3A3A3C] text-[8px] font-bold uppercase px-2.5 py-1 truncate max-w-[120px] rounded-md">{model.availableFuels.join(' / ')}</span>
                      <span className="bg-[#F8F9FA] border border-[#0A1F33]/10 text-[#3A3A3C] text-[8px] font-bold uppercase px-2.5 py-1 truncate max-w-[120px] rounded-md">{model.availableTransmissions.join(' / ')}</span>
                      <span className="bg-[#F8F9FA] border border-[#0A1F33]/10 text-[#3A3A3C] text-[8px] font-bold uppercase px-2.5 py-1 truncate max-w-[120px] rounded-md">Hasta {model.maxPlazas} Plazas</span>
                      {model.topFeatures.map((feat, idx) => (
                        <span key={idx} className="bg-[#F8F9FA] border border-[#0A1F33]/10 text-[#3A3A3C] text-[8px] font-bold uppercase px-2.5 py-1 rounded-md">{feat}</span>
                      ))}
                    </div>

                    {/* DESGLOSE: por qué coincide (o no) con lo que se preguntó */}
                    {model.matchReasons.length > 0 && (
                      <ul className="flex flex-col gap-1 mb-6 text-[10px] font-bold uppercase tracking-wide">
                        {model.matchReasons.map((reason, idx) => (
                          <li key={idx} className={`flex items-center gap-1.5 ${reason.matched ? 'text-[#1E8E3E]' : 'text-[#C0C0C0]'}`}>
                            <span>{reason.matched ? '✓' : '✕'}</span> {reason.label}
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="mt-auto pt-4 border-t border-[#0A1F33]/10">
                      <span className="text-[9px] text-[#C0C0C0] font-bold uppercase tracking-widest block mb-0.5">Precio Desde</span>
                      <span className="font-black text-2xl text-[#0A1F33] block mb-4" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>US$ {model.startingPrice.toLocaleString()}</span>
                      
                      {/* TACTICA B2B: Competencia de Agencias */}
                      <div className="border border-[#0A1F33]/10 p-2 text-center text-[10px] uppercase font-bold text-[#3A3A3C] mb-4 bg-[#F8F9FA] rounded-xl">
                         {model.dealershipStatus}
                      </div>

                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => openLeadModal({
                            vehiculoInteres: `${model.brandName} ${model.modelName}`,
                            marcaVehiculo: model.brandName,
                            modeloVehiculo: model.modelName,
                            origenLead: 'Recomendador Inteligente',
                            concesionariaDestino: model.concesionaria || ''
                          })}
                          className="w-full bg-[#00BFFF] hover:bg-[#0A1F33] text-[#FFFFFF] font-bold text-[10px] uppercase tracking-widest py-3 transition-colors flex justify-center items-center gap-1 rounded-xl shadow-sm"
                        >
                          {formatHablarCon(model.concesionaria)}
                        </button>
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setCalcVehicle(model); setCuotaCalculada(null); }}
                            className="flex-1 text-center bg-[#FFFFFF] border border-[#0A1F33]/20 text-[#0A1F33] hover:bg-[#0A1F33] hover:text-[#FFFFFF] font-bold text-[9px] uppercase tracking-widest py-2.5 transition-colors rounded-xl"
                          >
                            Simular Cuota
                          </button>
                          <Link
                            href={`/catalogo/${model.brandId}/${model.id}`}
                            className="flex-1 text-center bg-[#F8F9FA] border border-[#0A1F33]/10 text-[#3A3A3C] hover:border-[#0A1F33] hover:text-[#0A1F33] font-bold text-[9px] uppercase tracking-widest py-2.5 transition-colors rounded-xl"
                          >
                            Detalles
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
            </div>

            {/* ESPACIO #4: BANNER RECOMENDADOR (1200x400 de anunciante o pauta automática DATACAR) */}
            {smartAd ? (() => {
              const targetUrl = normalizeExternalUrl(smartAd.ctaUrl || smartAd.link);
              const isClickable = targetUrl !== '#';
              const isExternal = isClickable && targetUrl.startsWith('http');
              return isValidImageSrc(smartAd.img) ? (
                <a
                  href={targetUrl}
                  target={isExternal ? '_blank' : undefined}
                  rel={isExternal ? 'noopener noreferrer' : undefined}
                  className="block w-full relative group overflow-hidden border border-[#0A1F33]/10 hover:border-[#00BFFF] transition-all mb-12 rounded-2xl bg-transparent shadow-md hover:shadow-xl"
                >
                  <span className="absolute top-3 right-3 bg-[#0A1F33]/85 text-[#FFFFFF] text-[8px] uppercase font-bold px-3 py-1 tracking-widest border border-[#FFFFFF]/20 z-20 backdrop-blur-sm rounded-full">
                    Patrocinado: {smartAd.sponsor}
                  </span>
                  <Image
                    src={smartAd.img}
                    alt={smartAd.sponsor || 'Patrocinio'}
                    width={1200}
                    height={400}
                    sizes="(max-width: 1400px) 100vw, 1200px"
                    className="w-full h-auto block object-cover group-hover:brightness-105 transition-all"
                    unoptimized={!isOptimizableImageSrc(smartAd.img)}
                  />
                  {smartAd.ctaEnabled && smartAd.ctaText && (
                    <span
                      className="absolute bottom-4 right-4 font-bold text-xs uppercase px-5 py-2.5 shadow-lg tracking-wider transition-transform group-hover:scale-105 z-20 rounded-xl"
                      style={{ backgroundColor: smartAd.ctaColor || '#00BFFF', color: '#FFFFFF' }}
                    >
                      {smartAd.ctaText} →
                    </span>
                  )}
                </a>
              ) : (
                <a
                  href={targetUrl}
                  target={isExternal ? '_blank' : undefined}
                  rel={isExternal ? 'noopener noreferrer' : undefined}
                  className="block w-full bg-[#0A1F33] border-2 border-transparent hover:border-[#00BFFF] p-8 mb-12 relative group transition-all shadow-lg rounded-2xl text-center"
                >
                  <span className="absolute top-4 right-4 bg-[#FFFFFF]/10 text-[#FFFFFF] text-[8px] uppercase font-bold px-3 py-1 tracking-widest border border-[#FFFFFF]/20 z-20 rounded-full">
                    Patrocinado: {smartAd.sponsor}
                  </span>
                  <h3 className="font-black text-2xl sm:text-3xl text-[#FFFFFF] uppercase leading-tight break-words mb-2" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
                    {smartAd.headline} <span className="text-[#00BFFF]">{smartAd.highlight}</span>
                  </h3>
                  {smartAd.price && (
                    <p className="font-black text-xl text-[#00BFFF] mt-2 inline-block border-b-2 border-[#00BFFF] pb-1 break-words" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
                      {smartAd.price}
                    </p>
                  )}
                  {smartAd.ctaEnabled && smartAd.ctaText && (
                    <div className="mt-4">
                      <span
                        className="inline-block font-bold text-xs uppercase px-6 py-3 tracking-wider shadow-md rounded-xl"
                        style={{ backgroundColor: smartAd.ctaColor || '#00BFFF', color: '#FFFFFF' }}
                      >
                        {smartAd.ctaText} →
                      </span>
                    </div>
                  )}
                </a>
              );
            })() : (
              /* PAUTA PROPIA DE DATACAR (SE APAGA AUTOMÁTICAMENTE CUANDO HAY UN ANUNCIANTE ACTIVO) */
              <div className="bg-[#0A1F33] border border-[#0A1F33] p-8 md:p-12 mb-12 flex flex-col md:flex-row justify-between items-center gap-8 relative overflow-hidden rounded-3xl shadow-xl">
                <span className="absolute top-4 left-4 bg-[#FFFFFF]/10 border border-[#FFFFFF]/20 text-[#FFFFFF] text-[8px] font-bold uppercase tracking-widest px-3 py-1 inline-block z-20 rounded-full">Servicio DATACAR</span>
                <div className="md:w-1/3 z-10 text-center md:text-left mt-6 md:mt-0">
                  <h3 className="font-black text-3xl text-[#FFFFFF] uppercase leading-tight mb-2" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>¿Indeciso? <br/>Negociamos por vos</h3>
                  <p className="text-[11px] text-[#C0C0C0] font-medium" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>Analizamos las opciones y peleamos el mejor precio directo en concesionaria oficial.</p>
                </div>

                <div className="md:w-2/3 flex flex-col sm:flex-row gap-4 w-full z-10">
                  <div className="bg-[#FFFFFF]/5 border border-[#FFFFFF]/15 p-6 flex-1 hover:border-[#00BFFF] transition-colors text-center md:text-left rounded-2xl">
                    <span className="text-[9px] text-[#00BFFF] font-bold uppercase tracking-widest block mb-2">Opción 1</span>
                    <h4 className="font-bold text-[#FFFFFF] text-sm uppercase mb-1">Comparar Manualmente</h4>
                    <p className="text-[10px] text-[#C0C0C0] mb-4">Usa nuestra herramienta B2B.</p>
                    <Link href="/comparador" className="w-full block border border-[#FFFFFF]/40 text-[#FFFFFF] hover:bg-[#FFFFFF] hover:text-[#0A1F33] font-bold text-[10px] uppercase tracking-widest py-3 transition-colors text-center rounded-xl">Ir al Comparador →</Link>
                  </div>
                  <div className="bg-[#FFFFFF]/5 border border-[#FFFFFF]/15 p-6 flex-1 hover:border-[#00BFFF] transition-colors text-center md:text-left rounded-2xl">
                    <span className="text-[9px] text-[#00BFFF] font-bold uppercase tracking-widest block mb-2">Opción 2</span>
                    <h4 className="font-bold text-[#FFFFFF] text-sm uppercase mb-1">Delegar Compra</h4>
                    <p className="text-[10px] text-[#C0C0C0] mb-4">Ahorro y cero estrés garantizado.</p>
                    <Link href="/negociamos-por-vos" className="w-full block bg-[#00BFFF] text-[#0A1F33] hover:bg-[#FFFFFF] font-bold text-[10px] uppercase tracking-widest py-3 transition-colors border border-transparent text-center rounded-xl shadow-md">Delegar Ahora →</Link>
                  </div>
                </div>
              </div>
            )}

            {/* RUNNER-UPS (OTRAS OPCIONES - HORIZONTAL CONTEMPORÁNEO) */}
            {otherMatches.length > 0 && (
              <div className="mb-12">
                <h3 className="font-bold text-[#3A3A3C] text-sm uppercase tracking-widest mb-6 border-b border-[#0A1F33]/10 pb-2">Otras opciones viables</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {otherMatches.map(auto => (
                    <div key={`other_${auto.id}`} className="bg-[#FFFFFF] border border-[#0A1F33]/10 flex flex-row hover:border-[#00BFFF] transition-all duration-200 group h-32 rounded-2xl shadow-sm hover:shadow-md overflow-hidden">
                      <div className="relative w-1/3 h-full p-2 border-r border-[#0A1F33]/5 bg-[#F8F9FA]">
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
                         <h4 className="font-black text-sm text-[#0A1F33] uppercase leading-tight mb-1 truncate" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>{auto.modelName}</h4>
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

            <div className="text-center mt-12 border-t border-[#0A1F33]/10 pt-12">
              <button onClick={() => { setStep(1); setAnswers({}); setCalcVehicle(null); }} className="bg-[#FFFFFF] border border-[#0A1F33]/20 text-[#0A1F33] hover:bg-[#0A1F33] hover:text-[#FFFFFF] px-8 py-4 text-[10px] font-bold uppercase tracking-widest transition-all inline-flex items-center gap-2 rounded-xl shadow-sm hover:shadow-md">
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> Volver a empezar
              </button>
            </div>

          </div>
        </section>
      )}

      {/* ==========================================
          MODAL CALCULADORA
          ========================================== */}
      <Modal
        isOpen={!!calcVehicle}
        onClose={() => { setCalcVehicle(null); setCuotaCalculada(null); }}
        overlayClassName="fixed inset-0 bg-[#0A1F33]/75 z-50 flex items-center justify-center p-4 backdrop-blur-md"
        panelClassName="bg-[#FFFFFF] p-8 max-w-md w-full border-t-4 border-[#00BFFF] shadow-2xl rounded-2xl relative"
      >
        {calcVehicle && (
          <>
            <button onClick={() => { setCalcVehicle(null); setCuotaCalculada(null); }} className="w-8 h-8 rounded-full bg-[#F8F9FA] flex items-center justify-center absolute top-4 right-4 text-[#C0C0C0] hover:text-[#D93025] hover:bg-[#FFE6E6] font-black text-sm border-none outline-none transition-colors">✕</button>
            <h3 className="font-black text-2xl text-[#0A1F33] uppercase mb-1" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>Plan Financiero</h3>
            <p className="text-[10px] font-bold text-[#C0C0C0] uppercase tracking-widest mb-6 border-b border-[#0A1F33]/10 pb-4">
              Vehículo: {calcVehicle.brandName} {calcVehicle.modelName} (Desde US$ {calcVehicle.startingPrice.toLocaleString()})
            </p>
            
            <form onSubmit={handleCalculate} className="flex flex-col gap-4">
              <div>
                <label htmlFor="recomendador-calc-entrega" className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest block mb-2">Capital de Entrega (USD)</label>
                <input id="recomendador-calc-entrega" type="number" placeholder="Ej: 10000" className="w-full border border-[#0A1F33]/15 p-3.5 text-xs focus:outline-none focus:border-[#00BFFF] bg-[#F8F9FA] rounded-xl" required value={calcForm.entrega} onChange={e=>setCalcForm({...calcForm, entrega: e.target.value})} />
              </div>
              <div>
                <label htmlFor="recomendador-calc-plazo" className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest block mb-2">Plazo de Financiación</label>
                <select id="recomendador-calc-plazo" className="w-full border border-[#0A1F33]/15 p-3.5 text-xs focus:outline-none focus:border-[#00BFFF] bg-[#FFFFFF] cursor-pointer rounded-xl" value={calcForm.plazo} onChange={e=>setCalcForm({...calcForm, plazo: e.target.value})}>
                  <option value="12">12 Meses</option><option value="24">24 Meses</option><option value="36">36 Meses</option><option value="48">48 Meses</option><option value="60">60 Meses</option>
                </select>
              </div>
              
              <button type="submit" className="w-full bg-[#00BFFF] hover:bg-[#0A1F33] text-[#FFFFFF] font-bold text-xs uppercase tracking-widest py-4 transition-colors mt-2 border border-transparent rounded-xl shadow-md">
                Calcular Cuota
              </button>

              {cuotaCalculada !== null && (
                <div className="mt-4 border-t-4 border-[#0A1F33] bg-[#F8F9FA] p-6 text-center rounded-2xl">
                  <p className="text-[11px] font-bold text-[#C0C0C0] uppercase tracking-widest mb-2">Cuota Mensual Estimada</p>
                  <p className="font-black text-4xl text-[#0A1F33]" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>US$ {cuotaCalculada.toLocaleString('en-US', {maximumFractionDigits: 0})}</p>
                  <p className="text-[9px] text-[#3A3A3C] uppercase tracking-widest mt-4 max-w-sm mx-auto leading-relaxed opacity-70">
                    * Sistema francés. Incluye seguro de vida y gastos. Sujeto a evaluación crediticia.
                  </p>
                </div>
              )}
            </form>
          </>
        )}
      </Modal>
    </main>
  );
}