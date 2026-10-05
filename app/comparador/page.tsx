// app/comparador/page.tsx
'use client';

import React, { useState, useEffect, Suspense, useRef, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams, useRouter } from 'next/navigation';
import { doc, getDoc, collection, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { isOptimizableImageSrc, isValidImageSrc } from '../../lib/imageSrc';
import { getStoredCompareList, saveCompareList, clearStoredCompareList } from '../../lib/compareStorage';
import { combustibleLabel } from '../../lib/combustible';
import { getCachedBrands, getCachedModels, getCachedVersions, getCachedConcesionarias } from '../../lib/catalogCache';
import LeadModal from '../components/LeadModal';
import Modal from '../components/a11y/Modal';
import { sendComparisonLinkEmail, sendLeadNotificationEmail } from '../../lib/mailer';
import { buildCheckedDealershipSet, isDatacarCheck } from '../../lib/datacarCheck';
import { track } from '../../lib/analytics';
import DatacarCheckBadge from '../components/DatacarCheckBadge';
import Navbar, { NavItem } from '../components/Navbar';

// ==========================================
// INTERFACES (Estructura de Datos)
// ==========================================
interface CompareItem { id: string; name: string; price: number; }

interface VersionDetail {
  id: string; modelId: string; name: string; price: number; concesionaria?: string;
  specs: { 
    motor: string; transmision: string; combustible: string; traccion: string; plazas: number; 
    airbags: number; tamanho_pantalla: number; conectividad?: string; camaras?: string; garantia?: string; 
    alimentacion?: string; autonomi_electrica?: string; 
  };
  chasis?: { 
    medida_neumatico?: string; tipo_llanta?: string; detalle_suspension?: string; detalles_freno?: string; 
  };
  dimensiones: { largo: number; ancho: number; alto: number; despeje_suelo: number; baulera_litros: number; };
  features: { 
    adas: string[]; asiento_cuero: string; techo_panoramico: string; 
    confort_conveniencia?: string[]; seguridad_standard?: string[]; 
  };
  brandName?: string; modelName?: string; imgUrl?: string;
}

interface SpecRow {
  id: string;
  label: string;
  getValue: (veh?: VersionDetail) => React.ReactNode;
  getRaw: (veh?: VersionDetail) => string;
}

interface SpecSection {
  id: string;
  title: string;
  icon: string;
  rows: SpecRow[];
}

// Utilidad para renderizar strings con separadores como viñetas escaneables
const renderBulletList = (text: string | string[] | undefined) => {
  if (!text) return <span className="text-[#C0C0C0] text-center block uppercase text-[10px] font-bold tracking-widest">No detallado</span>;
  
  let items: string[] = [];
  if (Array.isArray(text)) {
    items = text;
  } else if (typeof text === 'string') {
    if (text.includes('|') || text.includes(';')) {
      items = text.split(/(?:\||;)/).map(i => i.trim()).filter(Boolean);
    } else {
      items = [text.trim()];
    }
  }

  if (items.length === 0) return <span className="text-[#C0C0C0] text-center block uppercase text-[10px] font-bold tracking-widest">No detallado</span>;

  return (
    <ul className="flex flex-col gap-1.5 text-[10px] text-[#3A3A3C] text-left">
      {items.map((item, index) => (
        <li key={index} className="flex items-start gap-1.5 leading-tight">
          <span className="text-[#00BFFF] mt-[-1px] text-[12px] font-black">•</span> <span>{item}</span>
        </li>
      ))}
    </ul>
  );
};

const NAV_ITEMS: NavItem[] = [
  { type: 'link', label: 'Recomendador', href: '/recomendador' },
  { type: 'link', label: 'Promociones', href: '/promociones' },
  { type: 'link', label: 'Asesoría', href: '/negociamos-por-vos' },
  { type: 'link', label: 'Catálogo', href: '/catalogo' },
];

// ==========================================
// CONFIGURACIÓN DE SECCIONES Y ESPECIFICACIONES
// ==========================================
const SPEC_SECTIONS: SpecSection[] = [
  {
    id: 'sec-motor',
    title: '1. Motor y Transmisión',
    icon: '⚡',
    rows: [
      {
        id: 'combustible',
        label: 'Combustible',
        getValue: (v) => combustibleLabel(v?.specs?.combustible) || '-',
        getRaw: (v) => combustibleLabel(v?.specs?.combustible) || ''
      },
      {
        id: 'motor',
        label: 'Motor',
        getValue: (v) => v?.specs?.motor || '-',
        getRaw: (v) => v?.specs?.motor || ''
      },
      {
        id: 'transmision',
        label: 'Transmisión',
        getValue: (v) => v?.specs?.transmision || '-',
        getRaw: (v) => v?.specs?.transmision || ''
      },
      {
        id: 'traccion',
        label: 'Tracción',
        getValue: (v) => v?.specs?.traccion || '-',
        getRaw: (v) => v?.specs?.traccion || ''
      },
      {
        id: 'alimentacion',
        label: 'Alimentación / Autonomía',
        getValue: (v) => v?.specs?.autonomi_electrica ? `${v.specs.autonomi_electrica} (Autonomía)` : (v?.specs?.alimentacion || '-'),
        getRaw: (v) => v?.specs?.autonomi_electrica || v?.specs?.alimentacion || ''
      }
    ]
  },
  {
    id: 'sec-chasis',
    title: '2. Chasis y Dimensiones',
    icon: '🚗',
    rows: [
      {
        id: 'baulera',
        label: 'Capacidad de Baulera',
        getValue: (v) => v?.dimensiones?.baulera_litros ? `${v.dimensiones.baulera_litros} L` : '-',
        getRaw: (v) => v?.dimensiones?.baulera_litros ? String(v.dimensiones.baulera_litros) : ''
      },
      {
        id: 'largo',
        label: 'Largo Total',
        getValue: (v) => v?.dimensiones?.largo ? `${v.dimensiones.largo} mm` : '-',
        getRaw: (v) => v?.dimensiones?.largo ? String(v.dimensiones.largo) : ''
      },
      {
        id: 'ancho',
        label: 'Ancho Total',
        getValue: (v) => v?.dimensiones?.ancho ? `${v.dimensiones.ancho} mm` : '-',
        getRaw: (v) => v?.dimensiones?.ancho ? String(v.dimensiones.ancho) : ''
      },
      {
        id: 'alto',
        label: 'Alto Total',
        getValue: (v) => v?.dimensiones?.alto ? `${v.dimensiones.alto} mm` : '-',
        getRaw: (v) => v?.dimensiones?.alto ? String(v.dimensiones.alto) : ''
      },
      {
        id: 'despeje',
        label: 'Despeje del Suelo',
        getValue: (v) => v?.dimensiones?.despeje_suelo ? `${v.dimensiones.despeje_suelo} mm` : '-',
        getRaw: (v) => v?.dimensiones?.despeje_suelo ? String(v.dimensiones.despeje_suelo) : ''
      },
      {
        id: 'suspension',
        label: 'Suspensión',
        getValue: (v) => v ? renderBulletList(v.chasis?.detalle_suspension) : '-',
        getRaw: (v) => v?.chasis?.detalle_suspension || ''
      },
      {
        id: 'frenos',
        label: 'Frenos',
        getValue: (v) => v ? renderBulletList(v.chasis?.detalles_freno) : '-',
        getRaw: (v) => v?.chasis?.detalles_freno || ''
      }
    ]
  },
  {
    id: 'sec-confort',
    title: '3. Confort y Tecnología',
    icon: '📱',
    rows: [
      {
        id: 'pantalla',
        label: 'Pantalla Multimedia',
        getValue: (v) => v?.specs?.tamanho_pantalla ? `${v.specs.tamanho_pantalla}"` : '-',
        getRaw: (v) => v?.specs?.tamanho_pantalla ? String(v.specs.tamanho_pantalla) : ''
      },
      {
        id: 'conectividad',
        label: 'Conectividad',
        getValue: (v) => v ? renderBulletList(v.specs?.conectividad) : '-',
        getRaw: (v) => v?.specs?.conectividad || ''
      },
      {
        id: 'asiento_cuero',
        label: 'Tapizado de Asientos',
        getValue: (v) => v?.features?.asiento_cuero || '-',
        getRaw: (v) => v?.features?.asiento_cuero || ''
      },
      {
        id: 'techo',
        label: 'Techo Panorámico',
        getValue: (v) => v?.features?.techo_panoramico || '-',
        getRaw: (v) => v?.features?.techo_panoramico || ''
      },
      {
        id: 'confort',
        label: 'Detalles de Confort',
        getValue: (v) => v ? renderBulletList(v.features?.confort_conveniencia) : '-',
        getRaw: (v) => Array.isArray(v?.features?.confort_conveniencia) ? v.features.confort_conveniencia.join(' ') : (v?.features?.confort_conveniencia || '')
      }
    ]
  },
  {
    id: 'sec-seguridad',
    title: '4. Seguridad y Asistencias',
    icon: '🛡️',
    rows: [
      {
        id: 'airbags',
        label: 'Airbags Totales',
        getValue: (v) => v?.specs?.airbags ? `${v.specs.airbags} Airbags` : '-',
        getRaw: (v) => v?.specs?.airbags ? String(v.specs.airbags) : ''
      },
      {
        id: 'camaras',
        label: 'Cámaras y Sensores',
        getValue: (v) => v?.specs?.camaras || '-',
        getRaw: (v) => v?.specs?.camaras || ''
      },
      {
        id: 'adas',
        label: 'Asistencias ADAS',
        getValue: (v) => {
          if (!v) return '-';
          if (v.features?.adas && v.features.adas.length > 0 && v.features.adas[0] !== '') {
            return (
              <ul className="flex flex-col gap-1.5 text-[10px] text-[#3A3A3C]">
                {v.features.adas.map((ad, k) => (
                  <li key={k} className="flex items-start gap-1.5 leading-tight">
                    <span className="text-[#1E8E3E] mt-0.5 font-bold">▪</span> <span className="uppercase">{ad}</span>
                  </li>
                ))}
              </ul>
            );
          }
          return <span className="text-[#C0C0C0] text-center block uppercase text-[10px] font-bold tracking-widest">Sin ADAS Estructural</span>;
        },
        getRaw: (v) => Array.isArray(v?.features?.adas) ? v.features.adas.join(' ') : (v?.features?.adas || '')
      },
      {
        id: 'seguridad_standard',
        label: 'Seguridad Estándar',
        getValue: (v) => v ? renderBulletList(v.features?.seguridad_standard) : '-',
        getRaw: (v) => Array.isArray(v?.features?.seguridad_standard) ? v.features.seguridad_standard.join(' ') : (v?.features?.seguridad_standard || '')
      }
    ]
  }
];

// Helper para detectar si un atributo difiere entre los autos presentes
const isRowDifferent = (row: SpecRow, vehicles: VersionDetail[]) => {
  if (vehicles.length < 2) return false;
  const values = vehicles.map(v => row.getRaw(v).trim().toLowerCase());
  return values.some(val => val !== values[0]);
};

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================
function ComparadorContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [compareItems, setCompareList] = useState<CompareItem[]>([]);
  const [vehiclesData, setVehiclesData] = useState<VersionDetail[]>([]);
  const [loading, setLoading] = useState(true);

  // Estados Predictivos del Buscador
  const [allVersions, setAllVersions] = useState<any[]>([]);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Estados de Lead
  const [consultingVehicle, setConsultingVehicle] = useState<VersionDetail | null>(null);
  const [comparativaLeadOpen, setComparativaLeadOpen] = useState(false);

  // Estados para Lead Magnet (Compartir PDF/Enlace)
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [shareFeedback, setShareFeedback] = useState({ type: '', message: '' });

  // NUEVOS CONTROLES DE EXPERIENCIA (DESKTOP & MOBILE)
  const [onlyDifferences, setOnlyDifferences] = useState<boolean>(false);
  const [mobileViewMode, setMobileViewMode] = useState<'versus' | 'tabla'>('versus');
  const [mobileComparePair, setMobileComparePair] = useState<[number, number]>([0, 1]);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  // Ref para Telemetría Silenciosa
  const trackedRef = useRef<string>('');

  // DATACAR CHECK
  const [checkedDealershipSet, setCheckedDealershipSet] = useState<Set<string>>(new Set());

  // Popular Comparisons
  const [popularComparisons, setPopularComparisons] = useState<{combo: string, ids: string[], count: number}[]>([]);

  // ==========================================
  // 1. CARGA DE DATOS Y LECTURA DE URL
  // ==========================================
  useEffect(() => {
    const fetchCompareData = async () => {
      setLoading(true);
      try {
        const urlAutos = searchParams?.get('autos');
        let idsToFetch: string[] = [];

        if (urlAutos) {
          idsToFetch = urlAutos.split(',').slice(0, 3);
        } else {
          const savedList: CompareItem[] = getStoredCompareList();
          idsToFetch = savedList.map(item => item.id);
        }
        
        if (idsToFetch.length > 0) {
          const loadedData: VersionDetail[] = [];
          const hydratedCompareItems: CompareItem[] = []; 

          for (const vId of idsToFetch) {
            const vSnap = await getDoc(doc(db, 'versions', vId));
            
            if (vSnap.exists()) {
              const vData = vSnap.data() as VersionDetail;
              const mSnap = await getDoc(doc(db, 'models', vData.modelId));
              let brandName = ''; let modelName = ''; let imgUrl = '';

              if (mSnap.exists()) {
                const mData = mSnap.data();
                modelName = mData.name; imgUrl = mData.imgUrl;
                const bSnap = await getDoc(doc(db, 'brands', mData.brandId));
                if (bSnap.exists()) brandName = bSnap.data().name;
              }
              loadedData.push({ ...vData, id: vSnap.id, brandName, modelName, imgUrl: imgUrl || '' });
              hydratedCompareItems.push({ id: vSnap.id, name: `${brandName} ${modelName} ${vData.name}`, price: Number(vData.price) || 0 });
            }
          }
          
          setVehiclesData(loadedData);
          setCompareList(hydratedCompareItems);
          saveCompareList(hydratedCompareItems);
        }

        const [allVersions, allModels, allBrands, allConcesionarias] = await Promise.all([
          getCachedVersions(),
          getCachedModels(),
          getCachedBrands(),
          getCachedConcesionarias(),
        ]);

        setCheckedDealershipSet(buildCheckedDealershipSet(allConcesionarias));

        const brandsMap: Record<string, string> = {};
        allBrands.forEach(b => brandsMap[b.id] = b.name);

        const modelsMap: Record<string, { name: string, img: string, brandId: string }> = {};
        allModels.forEach(m => modelsMap[m.id] = { name: m.name, img: m.imgUrl, brandId: m.brandId });

        const formattedAll = allVersions.map(data => {
          const modelObj = modelsMap[data.modelId] || { name: '', img: '', brandId: '' };
          const bName = brandsMap[modelObj.brandId] || '';
          return { id: data.id, brandName: bName, modelName: modelObj.name, versionName: data.name, price: Number(data.price) || 0 };
        });

        setAllVersions(formattedAll.filter(v => v.price > 0));

      } catch (error) {
        console.error("Error cargando comparador:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchCompareData();
  }, [searchParams]);

  // ==========================================
  // 1.5. CARGA DE COMPARACIONES POPULARES
  // ==========================================
  useEffect(() => {
    const fetchPopularComparisons = async () => {
      try {
        const statsSnap = await getDocs(collection(db, 'comparison_stats'));
        const counts: Record<string, { combo: string, ids: string[], count: number }> = {};
        
        statsSnap.forEach(docSnap => {
          const data = docSnap.data();
          if (data.combo && data.ids && Array.isArray(data.ids)) {
            if (!counts[data.combo]) {
              counts[data.combo] = { combo: data.combo, ids: data.ids, count: 0 };
            }
            counts[data.combo].count += 1;
          }
        });

        const sortedComparisons = Object.values(counts)
          .sort((a, b) => b.count - a.count)
          .slice(0, 8);

        setPopularComparisons(sortedComparisons);
      } catch (error) {
        console.error("Error fetching popular comparisons", error);
      }
    };
    fetchPopularComparisons();
  }, []);

  // ==========================================
  // 2. TELEMETRÍA B2B
  // ==========================================
  useEffect(() => {
    if (vehiclesData.length >= 2) {
      const sortedIds = vehiclesData.map(v => v.id).sort();
      const comboKey = sortedIds.join('_');
      
      if (trackedRef.current !== comboKey) {
        trackedRef.current = comboKey;
        addDoc(collection(db, 'comparison_stats'), {
          combo: vehiclesData.map(v => `${v.brandName} ${v.modelName}`).join(' vs '),
          ids: sortedIds,
          timestamp: serverTimestamp()
        }).catch(err => console.error("Error telemetría", err));
      }
    }
  }, [vehiclesData]);

  // Buscador Predictivo
  useEffect(() => {
    if (searchTerm.length >= 2) {
      const results = allVersions.filter(v => 
        `${v.brandName} ${v.modelName} ${v.versionName}`.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setSearchResults(results.slice(0, 8));
    } else {
      setSearchResults([]);
    }
  }, [searchTerm, allVersions]);

  // ==========================================
  // 3. CONTROLES DE INTERFAZ
  // ==========================================
  const handleRemove = (id: string) => {
    const newList = compareItems.filter(i => i.id !== id);
    setCompareList(newList);
    setVehiclesData(vehiclesData.filter(v => v.id !== id));
    saveCompareList(newList);

    const newUrlParams = newList.length > 0 ? `?autos=${newList.map(i=>i.id).join(',')}` : window.location.pathname;
    window.history.replaceState({}, '', newUrlParams);
  };

  const handleAddVersion = (v: any) => {
    if (compareItems.length >= 3) return;
    const newItem = { id: v.id, name: `${v.brandName} ${v.modelName} ${v.versionName}`, price: v.price };
    const newList = [...compareItems, newItem];
    saveCompareList(newList);
    track('compare_add', { total: newList.length });
    setSearchModalOpen(false);
    setSearchTerm('');
    router.push(`/comparador?autos=${newList.map(i => i.id).join(',')}`);
  };

  const clearCompare = () => {
    clearStoredCompareList();
    setCompareList([]);
    setVehiclesData([]);
    window.history.replaceState({}, '', window.location.pathname);
  };

  const toggleSectionCollapse = (secId: string) => {
    setCollapsedSections(prev => ({ ...prev, [secId]: !prev[secId] }));
  };

  const scrollToSection = (secId: string) => {
    const el = document.getElementById(secId);
    if (el) {
      const yOffset = -135;
      const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  // Cálculo de total de diferencias detectadas
  const totalDifferences = useMemo(() => {
    if (vehiclesData.length < 2) return 0;
    let count = 0;
    SPEC_SECTIONS.forEach(sec => {
      sec.rows.forEach(r => {
        if (isRowDifferent(r, vehiclesData)) count++;
      });
    });
    return count;
  }, [vehiclesData]);

  // ==========================================
  // 4. LÓGICA DE COMPARTIR Y ENVIAR
  // ==========================================
  const handleShareSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareEmail) return;

    track('comparison_share_submit', { autos: compareItems.length });
    setShareFeedback({ type: '', message: 'Enviando comparativa a tu correo...' });
    
    const shareLink = `${window.location.origin}/comparador?autos=${compareItems.map(i=>i.id).join(',')}`;

    try {
      await addDoc(collection(db, 'leads'), {
        email: shareEmail,
        nombre: 'Interesado Comparativa',
        telefono: 'No proporcionado',
        origen: 'Generador Enlace Comparativa',
        vehiculo: compareItems.map(i=>i.name).join(' VS '),
        concesionaria_destino: 'A designar (Central DATACAR)',
        concesionaria_destino_norm: 'A DESIGNAR',
        estado: 'Nuevo',
        createdAt: serverTimestamp()
      });

      const emailSent = await sendComparisonLinkEmail(shareEmail, shareLink);

      sendLeadNotificationEmail({
        leadName: 'Interesado Comparativa',
        leadPhone: 'No proporcionado',
        leadEmail: shareEmail,
        vehicleOfInterest: compareItems.map(i=>i.name).join(' VS '),
        origen: 'Generador Enlace Comparativa',
        concesionariaDestino: 'A designar (Central DATACAR)'
      });

      await navigator.clipboard.writeText(shareLink);
      setShareFeedback({
        type: emailSent ? 'success' : 'error',
        message: emailSent
          ? '¡Enviado a tu correo y copiado al portapapeles!'
          : 'No pudimos enviar el correo, pero copiamos el enlace a tu portapapeles.'
      });

      setTimeout(() => {
        setShareModalOpen(false);
        setShareFeedback({ type:'', message:'' });
        setShareEmail('');
      }, 3500);
    } catch (error) {
      setShareFeedback({ type: 'error', message: 'Error de conexión. Intenta nuevamente.' });
    }
  };

  if (loading) return <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center font-bold text-[#0A1F33] tracking-widest uppercase text-sm">Cargando motor de comparativas...</div>;

  return (
    <main className="min-h-screen bg-[#F8F9FA] text-[#3A3A3C] font-sans flex flex-col">
      
      {/* NAVBAR CORPORATIVO */}
      <Navbar items={NAV_ITEMS} cta={{ label: 'Explorar Catálogo', href: '/catalogo' }} />

      {/* HEADER PRINCIPAL */}
      <header className="w-full border-b border-[#C0C0C0] bg-[#FFFFFF] py-6 sm:py-8">
        <div className="max-w-[1400px] mx-auto px-4 lg:px-8 flex flex-col md:flex-row justify-between md:items-end gap-4">
          <div>
            <p className="text-[10px] font-medium text-[#C0C0C0] mb-1.5 uppercase tracking-widest">
              <Link href="/" className="hover:text-[#3A3A3C] transition-colors">Inicio</Link> / <span className="font-bold text-[#3A3A3C]">Comparador</span>
            </p>
            <h1 className="font-black text-2xl sm:text-3xl md:text-4xl text-[#0A1F33] uppercase" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
              Comparador de <span className="text-[#00BFFF]">Autos 0KM</span>
            </h1>
          </div>
          {compareItems.length > 0 && (
            <div className="flex items-center gap-4">
              <button onClick={() => setShareModalOpen(true)} className="text-[10px] text-[#00BFFF] hover:text-[#0A1F33] font-bold uppercase tracking-widest transition-colors flex items-center gap-1.5 border border-[#00BFFF]/30 hover:border-[#0A1F33] px-3 py-1.5 bg-[#F5FBFF]">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"></path></svg> Compartir
              </button>
              <button onClick={clearCompare} className="text-[10px] text-[#D93025] font-bold uppercase tracking-widest hover:underline border-none outline-none">
                Limpiar todo
              </button>
            </div>
          )}
        </div>
      </header>

      {/* CONTENEDOR PRINCIPAL */}
      <div className="w-full max-w-[1400px] mx-auto px-4 lg:px-8 pt-6 flex-grow mb-16 min-w-0">
        
        {vehiclesData.length === 0 ? (
          /* ==========================================
             ESTADO VACÍO (SIN AUTOS SELECCIONADOS)
             ========================================== */
          <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-12 sm:p-16 text-center flex flex-col items-center justify-center my-8 shadow-none">
            <span className="text-4xl mb-4">⚖️</span>
            <h2 className="font-black text-2xl text-[#0A1F33] uppercase mb-2" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
              No hay autos seleccionados
            </h2>
            <p className="text-[11px] text-[#3A3A3C] uppercase tracking-widest mb-8 max-w-md">
              Seleccioná hasta 3 vehículos desde el catálogo o utilizá el buscador predictivo para comparar specs, dimensiones y equipamiento.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <button onClick={() => setSearchModalOpen(true)} className="bg-[#FFFFFF] border-2 border-[#0A1F33] text-[#0A1F33] font-bold text-xs uppercase tracking-widest py-4 px-8 transition-colors hover:bg-[#0A1F33] hover:text-[#FFFFFF] rounded-none">
                Buscar un Auto
              </button>
              <Link href="/catalogo" className="bg-[#00BFFF] hover:bg-[#0A1F33] text-[#FFFFFF] font-bold text-xs uppercase tracking-widest py-4 px-10 transition-colors border border-transparent rounded-none">
                Ir al Catálogo
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6">

            {/* ========================================================
                1. HERO SHOWCASE DE VEHÍCULOS (COMPRIMIDO Y ESCANEABLE)
                ======================================================== */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[0, 1, 2].map((idx) => {
                const veh = vehiclesData[idx];
                return (
                  <div key={idx} className="relative bg-[#FFFFFF] border border-[#C0C0C0] flex flex-col justify-between transition-all group overflow-hidden">
                    {veh ? (
                      <>
                        {/* Botón Quitar */}
                        <button
                          onClick={() => handleRemove(veh.id)}
                          className="absolute top-2.5 right-2.5 z-20 w-7 h-7 flex items-center justify-center bg-[#FFFFFF]/90 hover:bg-[#D93025] hover:text-[#FFFFFF] text-[#C0C0C0] border border-[#C0C0C0]/60 transition-colors"
                          title="Quitar este vehículo"
                        >
                          ✕
                        </button>

                        {/* Top: Foto y Marca */}
                        <div className="p-4 pb-2">
                          <div className="flex items-center justify-between gap-2 mb-2 pr-8">
                            <span className="text-[9px] font-bold text-[#00BFFF] uppercase tracking-widest truncate">{veh.brandName}</span>
                            {isDatacarCheck(veh.concesionaria, checkedDealershipSet) && (
                              <DatacarCheckBadge size="sm" concesionariaNombre={veh.concesionaria} />
                            )}
                          </div>

                          <h3 className="font-black text-base text-[#0A1F33] uppercase leading-tight line-clamp-1 mb-0.5" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
                            {veh.modelName}
                          </h3>
                          <p className="text-[10px] text-[#3A3A3C] font-semibold uppercase tracking-wider truncate mb-3" title={veh.name}>
                            {veh.name}
                          </p>

                          {/* Imagen Compacta y Nítida */}
                          <div className="relative h-28 sm:h-32 w-full bg-[#FFFFFF] p-2 flex items-center justify-center border-y border-[#C0C0C0]/20">
                            {isValidImageSrc(veh.imgUrl) ? (
                              <Image
                                src={veh.imgUrl}
                                alt={`${veh.brandName} ${veh.modelName}`}
                                fill
                                sizes="(max-width: 768px) 100vw, 33vw"
                                className="object-contain p-1 group-hover:scale-105 transition-transform duration-300"
                                unoptimized={!isOptimizableImageSrc(veh.imgUrl)}
                              />
                            ) : (
                              <div className="text-[10px] font-bold text-[#C0C0C0] uppercase tracking-widest">Sin Imagen</div>
                            )}
                          </div>
                        </div>

                        {/* Bottom: Precio y Cotizar */}
                        <div className="p-4 pt-3 bg-[#F8F9FA] border-t border-[#C0C0C0]/40 flex items-center justify-between gap-3">
                          <div>
                            <span className="text-[8px] font-bold text-[#C0C0C0] uppercase tracking-widest block leading-none mb-1">Precio Contado</span>
                            <span className="font-black text-lg sm:text-xl text-[#0A1F33] leading-none" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
                              US$ {veh.price.toLocaleString()}
                            </span>
                          </div>
                          <button
                            onClick={() => setConsultingVehicle(veh)}
                            className="bg-[#00BFFF] hover:bg-[#0A1F33] text-[#FFFFFF] font-bold text-[10px] uppercase tracking-widest py-2.5 px-4 transition-colors shrink-0 rounded-none"
                          >
                            Consultar
                          </button>
                        </div>
                      </>
                    ) : (
                      /* Slot Vacío para Agregar Auto */
                      <button
                        type="button"
                        onClick={() => setSearchModalOpen(true)}
                        className="h-full min-h-[220px] sm:min-h-[260px] p-6 border-2 border-dashed border-[#C0C0C0] flex flex-col items-center justify-center text-center bg-[#F8F9FA]/60 hover:bg-[#F5FBFF] hover:border-[#00BFFF] transition-all cursor-pointer group rounded-none"
                      >
                        <div className="w-10 h-10 border border-[#C0C0C0] group-hover:border-[#00BFFF] group-hover:bg-[#00BFFF] group-hover:text-[#FFFFFF] text-[#C0C0C0] flex items-center justify-center mb-3 transition-colors">
                          <span className="text-xl font-light leading-none">+</span>
                        </div>
                        <span className="text-[11px] font-black text-[#0A1F33] uppercase tracking-wider mb-1" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
                          Agregar Auto
                        </span>
                        <span className="text-[9px] text-[#C0C0C0] uppercase tracking-widest">
                          Hasta 3 vehículos simultáneos
                        </span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ========================================================
                2. BARRA DE CONTROL Y CATEGORÍAS (INTERACTIVA)
                ======================================================== */}
            <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-3 sm:p-4 flex flex-col md:flex-row justify-between items-center gap-4">
              
              {/* Salto Rápido a Categorías */}
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full md:w-auto">
                <span className="text-[9px] font-black uppercase tracking-widest text-[#0A1F33] mr-1 hidden sm:inline-block">Ir a:</span>
                {SPEC_SECTIONS.map((sec) => (
                  <button
                    key={sec.id}
                    onClick={() => scrollToSection(sec.id)}
                    className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider px-2.5 py-1.5 border border-[#C0C0C0] hover:border-[#00BFFF] hover:text-[#00BFFF] bg-[#F8F9FA] transition-colors rounded-none"
                  >
                    {sec.icon} {sec.title.split('. ')[1]}
                  </button>
                ))}
              </div>

              {/* Controles de Vista: Solo Diferencias + Switch Mobile */}
              <div className="flex items-center justify-between sm:justify-end gap-3 w-full md:w-auto border-t md:border-t-0 pt-3 md:pt-0 border-[#C0C0C0]/50">
                {/* Selector Modo Mobile (Versus vs Tabla) */}
                <div className="flex md:hidden items-center border border-[#C0C0C0] p-0.5 bg-[#F8F9FA]">
                  <button
                    onClick={() => setMobileViewMode('versus')}
                    className={`px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest transition-colors ${mobileViewMode === 'versus' ? 'bg-[#0A1F33] text-[#FFFFFF]' : 'text-[#3A3A3C]'}`}
                  >
                    Versus (2x)
                  </button>
                  <button
                    onClick={() => setMobileViewMode('tabla')}
                    className={`px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest transition-colors ${mobileViewMode === 'tabla' ? 'bg-[#0A1F33] text-[#FFFFFF]' : 'text-[#3A3A3C]'}`}
                  >
                    Tabla ({vehiclesData.length})
                  </button>
                </div>

                {/* Switch "Solo Diferencias" */}
                {vehiclesData.length >= 2 && (
                  <button
                    onClick={() => setOnlyDifferences(!onlyDifferences)}
                    className={`flex items-center gap-2 px-3 py-1.5 border text-[10px] font-bold uppercase tracking-widest transition-colors rounded-none ${onlyDifferences ? 'bg-[#0A1F33] text-[#00BFFF] border-[#0A1F33]' : 'bg-[#FFFFFF] text-[#3A3A3C] border-[#C0C0C0] hover:border-[#0A1F33]'}`}
                  >
                    <span className={`w-2.5 h-2.5 border flex items-center justify-center ${onlyDifferences ? 'bg-[#00BFFF] border-[#00BFFF]' : 'border-[#C0C0C0]'}`}>
                      {onlyDifferences && <span className="w-1.5 h-1.5 bg-[#0A1F33]"></span>}
                    </span>
                    <span>Solo diferencias</span>
                    {totalDifferences > 0 && (
                      <span className="bg-[#00BFFF] text-[#0A1F33] text-[8px] font-black px-1.5 py-0.2">
                        {totalDifferences}
                      </span>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* ========================================================
                3. VISTA MOBILE DEDICADA: VERSUS DIRECTO 1 A 1
                (Activa en pantallas < 768px cuando se elige Modo Versus)
                ======================================================== */}
            {mobileViewMode === 'versus' && vehiclesData.length >= 2 && (
              <div className="md:hidden flex flex-col gap-4">
                {/* Selector de Pareja a Comparar (si hay 3 autos) */}
                {vehiclesData.length === 3 && (
                  <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-2.5 flex items-center justify-between gap-2">
                    <span className="text-[9px] font-bold text-[#C0C0C0] uppercase tracking-widest">Comparar:</span>
                    <div className="flex gap-1.5">
                      {[
                        { pair: [0, 1] as [number, number], label: 'Auto 1 vs 2' },
                        { pair: [0, 2] as [number, number], label: 'Auto 1 vs 3' },
                        { pair: [1, 2] as [number, number], label: 'Auto 2 vs 3' },
                      ].map((item, idx) => (
                        <button
                          key={idx}
                          onClick={() => setMobileComparePair(item.pair)}
                          className={`text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 border transition-colors ${mobileComparePair[0] === item.pair[0] && mobileComparePair[1] === item.pair[1] ? 'bg-[#00BFFF] text-[#0A1F33] border-[#00BFFF]' : 'bg-[#F8F9FA] text-[#3A3A3C] border-[#C0C0C0]'}`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sticky Header Mini para Mobile */}
                <div className="sticky top-[58px] z-30 bg-[#FFFFFF] border-b-2 border-[#0A1F33] shadow-md grid grid-cols-2 divide-x divide-[#C0C0C0] py-2 px-2">
                  {[mobileComparePair[0], mobileComparePair[1]].map((vIdx) => {
                    const veh = vehiclesData[vIdx];
                    if (!veh) return null;
                    return (
                      <div key={veh.id} className="flex items-center gap-2 px-1">
                        <div className="relative w-8 h-8 shrink-0 bg-[#FFFFFF]">
                          {isValidImageSrc(veh.imgUrl) && (
                            <Image src={veh.imgUrl} alt={veh.modelName || 'Vehículo'} fill className="object-contain" unoptimized={!isOptimizableImageSrc(veh.imgUrl)} />
                          )}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-[10px] font-black text-[#0A1F33] uppercase truncate leading-tight" style={{ fontFamily: 'var(--font-montserrat)' }}>
                            {veh.modelName}
                          </span>
                          <span className="text-[10px] font-bold text-[#00BFFF] leading-none">
                            US$ {veh.price.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Tarjetas de Especificaciones Mobile */}
                {SPEC_SECTIONS.map((sec) => {
                  const comparedVehs = [vehiclesData[mobileComparePair[0]], vehiclesData[mobileComparePair[1]]].filter(Boolean);
                  const filteredRows = onlyDifferences
                    ? sec.rows.filter(r => isRowDifferent(r, comparedVehs))
                    : sec.rows;

                  if (filteredRows.length === 0) return null;
                  const isCollapsed = collapsedSections[sec.id];

                  return (
                    <div key={sec.id} id={sec.id} className="bg-[#FFFFFF] border border-[#C0C0C0] overflow-hidden">
                      <button
                        onClick={() => toggleSectionCollapse(sec.id)}
                        className="w-full bg-[#0A1F33] text-[#FFFFFF] px-4 py-3 flex items-center justify-between text-left border-none outline-none"
                      >
                        <span className="text-[11px] font-black uppercase tracking-widest" style={{ fontFamily: 'var(--font-montserrat)' }}>
                          {sec.icon} {sec.title}
                        </span>
                        <span className="text-xs text-[#00BFFF]">{isCollapsed ? '▼' : '▲'}</span>
                      </button>

                      {!isCollapsed && (
                        <div className="divide-y divide-[#C0C0C0]/40">
                          {filteredRows.map((row) => {
                            const diff = isRowDifferent(row, comparedVehs);
                            return (
                              <div key={row.id} className={`p-3 ${diff ? 'bg-[#F5FBFF]/60' : 'bg-[#FFFFFF]'}`}>
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-[9px] font-bold uppercase tracking-widest text-[#C0C0C0]">{row.label}</span>
                                  {diff && <span className="text-[7px] font-black uppercase px-1.5 py-0.2 bg-[#00BFFF]/20 text-[#0A1F33]">Diferencia</span>}
                                </div>
                                <div className="grid grid-cols-2 divide-x divide-[#C0C0C0]/50 text-xs">
                                  <div className="pr-2 font-medium text-[#0A1F33]">
                                    {row.getValue(vehiclesData[mobileComparePair[0]])}
                                  </div>
                                  <div className="pl-2 font-medium text-[#0A1F33]">
                                    {row.getValue(vehiclesData[mobileComparePair[1]])}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ========================================================
                4. MATRIZ EXPANSIVA (DESKTOP + TABLA MOBILE DESLIZABLE)
                ======================================================== */}
            {(mobileViewMode === 'tabla' || vehiclesData.length < 2 || typeof window !== 'undefined') && (
              <div className={`${mobileViewMode === 'versus' && vehiclesData.length >= 2 ? 'hidden md:block' : 'block'} border border-[#C0C0C0] bg-[#FFFFFF]`}>
                
                {/* Contenedor sin alto acotado artificial: scroll natural con encabezado compacto flotante */}
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left border-separate border-spacing-0 min-w-[760px] lg:min-w-[900px] bg-[#FFFFFF]">

                    {/* ENCABEZADO COMPACTO FLOTANTE (STICKY DOCK ~62px DE ALTO) */}
                    <thead className="sticky top-[64px] z-30 bg-[#FFFFFF] border-b-2 border-[#0A1F33] shadow-md">
                      <tr className="bg-[#FFFFFF]">
                        
                        {/* Columna 0: Título de Atributos */}
                        <th className="p-3.5 bg-[#F8F9FA] w-1/4 border-r border-[#C0C0C0] sticky left-0 z-40 align-middle">
                          <span className="text-[8px] font-bold text-[#C0C0C0] uppercase tracking-widest block leading-none mb-1">
                            {onlyDifferences ? 'Filtrando diferencias' : 'Matriz Técnica'}
                          </span>
                          <span className="font-black text-xs text-[#0A1F33] uppercase leading-tight" style={{ fontFamily: 'var(--font-montserrat)' }}>
                            Especificaciones
                          </span>
                        </th>

                        {/* Columnas 1, 2, 3: Autos con Mini Card Compacta */}
                        {[0, 1, 2].map((idx) => {
                          const veh = vehiclesData[idx];
                          return (
                            <th key={idx} className="p-2.5 sm:p-3 w-1/4 border-r border-[#C0C0C0] last:border-0 align-middle bg-[#FFFFFF]">
                              {veh ? (
                                <div className="flex items-center justify-between gap-2.5">
                                  {/* Miniatura + Datos */}
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className="relative w-12 h-8 shrink-0 bg-[#FFFFFF] hidden sm:block">
                                      {isValidImageSrc(veh.imgUrl) && (
                                        <Image
                                          src={veh.imgUrl}
                                          alt={veh.modelName || 'Vehículo'}
                                          fill
                                          sizes="48px"
                                          className="object-contain"
                                          unoptimized={!isOptimizableImageSrc(veh.imgUrl)}
                                        />
                                      )}
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                      <span className="font-black text-[11px] sm:text-xs text-[#0A1F33] uppercase truncate leading-tight" style={{ fontFamily: 'var(--font-montserrat)' }}>
                                        {veh.modelName}
                                      </span>
                                      <span className="font-bold text-[10px] text-[#00BFFF] leading-none">
                                        US$ {veh.price.toLocaleString()}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Botón rápido cotizar y quitar */}
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                      onClick={() => setConsultingVehicle(veh)}
                                      className="bg-[#00BFFF] hover:bg-[#0A1F33] text-[#FFFFFF] text-[9px] font-bold uppercase tracking-wider py-1 px-2.5 transition-colors rounded-none"
                                      title="Cotizar este vehículo"
                                    >
                                      Cotizar
                                    </button>
                                    <button
                                      onClick={() => handleRemove(veh.id)}
                                      className="text-[#C0C0C0] hover:text-[#D93025] font-black text-xs px-1"
                                      title="Quitar"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setSearchModalOpen(true)}
                                  className="w-full py-2 text-center text-[10px] font-bold text-[#00BFFF] uppercase tracking-wider border border-dashed border-[#C0C0C0] hover:bg-[#F5FBFF] transition-colors"
                                >
                                  + Agregar Auto
                                </button>
                              )}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>

                    {/* CUERPO DE DATOS CON MÁXIMO ESPACIO VERTICAL */}
                    <tbody className="text-xs text-[#3A3A3C]" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
                      {SPEC_SECTIONS.map((sec) => {
                        const filteredRows = onlyDifferences
                          ? sec.rows.filter(r => isRowDifferent(r, vehiclesData))
                          : sec.rows;

                        if (filteredRows.length === 0) return null;

                        return (
                          <React.Fragment key={sec.id}>
                            {/* Encabezado de Sección */}
                            <tr id={sec.id} className="bg-[#0A1F33] text-[#FFFFFF] border-b border-[#C0C0C0]">
                              <td colSpan={4} className="p-3 font-bold text-[10px] uppercase tracking-widest pl-4 sm:pl-6">
                                {sec.icon} {sec.title}
                              </td>
                            </tr>

                            {/* Filas de Especificaciones */}
                            {filteredRows.map((row) => {
                              const diff = isRowDifferent(row, vehiclesData);
                              return (
                                <tr
                                  key={row.id}
                                  className={`border-b border-[#C0C0C0]/50 transition-colors ${diff && vehiclesData.length >= 2 ? 'bg-[#F5FBFF]/40 hover:bg-[#F5FBFF]' : 'hover:bg-[#F8F9FA]'}`}
                                >
                                  {/* Columna Atributo (Sticky a la izquierda en scroll horizontal) */}
                                  <td className="p-3.5 font-bold bg-[#F8F9FA] border-r border-[#C0C0C0] text-[10px] uppercase tracking-widest text-[#3A3A3C] sticky left-0 z-20">
                                    <div className="flex items-center justify-between gap-1">
                                      <span>{row.label}</span>
                                      {diff && vehiclesData.length >= 2 && (
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#00BFFF] shrink-0" title="Diferencia detectada"></span>
                                      )}
                                    </div>
                                  </td>

                                  {/* Celdas de Valores de cada Auto */}
                                  {[0, 1, 2].map((idx) => {
                                    const veh = vehiclesData[idx];
                                    return (
                                      <td
                                        key={`val_${row.id}_${idx}`}
                                        className="p-3.5 border-r border-[#C0C0C0] last:border-0 font-medium text-center align-middle"
                                      >
                                        {veh ? row.getValue(veh) : '-'}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        )}

        {/* COMPONENTE: LOS USUARIOS TAMBIÉN COMPARAN */}
        {popularComparisons.length > 0 && (
          <div className="w-full mt-12 mb-8 text-center flex flex-col items-center">
            <p className="text-[10px] text-[#C0C0C0] uppercase tracking-widest mb-1.5">Tendencias de Mercado</p>
            <h3 className="font-black text-[#0A1F33] text-xl md:text-2xl uppercase mb-6" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
              {vehiclesData.length === 0 ? 'Las comparaciones más consultadas' : 'Otras combinaciones frecuentes'}
            </h3>
            <div className="flex flex-wrap justify-center gap-2.5">
              {popularComparisons.map((comp, idx) => (
                <Link 
                  key={idx}
                  href={`/comparador?autos=${comp.ids.join(',')}`}
                  className="border border-[#C0C0C0] hover:border-[#00BFFF] text-[#3A3A3C] hover:text-[#00BFFF] px-4 py-2 text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors bg-[#FFFFFF]"
                >
                  {comp.combo}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* FOOTER DE CONVERSIÓN CON LEAD MAGNET */}
      {vehiclesData.length > 0 && (
        <footer className="w-full bg-[#0A1F33] text-[#FFFFFF] py-12 mt-auto border-t-4 border-[#00BFFF]">
          <div className="max-w-[1400px] mx-auto px-4 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="md:w-1/2 text-center md:text-left">
              <h4 className="font-black text-2xl uppercase mb-2" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>¿Dudas sobre esta comparativa?</h4>
              <p className="text-[11px] text-[#C0C0C0] uppercase tracking-widest mb-6">Nuestros auditores automotrices te asesoran en minutos para negociar el mejor precio.</p>
              <button onClick={() => setComparativaLeadOpen(true)} className="bg-[#1E8E3E] hover:bg-[#FFFFFF] hover:text-[#1E8E3E] text-[#FFFFFF] font-bold text-xs uppercase tracking-widest px-8 py-4 border border-transparent transition-colors flex items-center justify-center gap-3 w-full md:w-max rounded-none">
                Solicitar Asesoría Personalizada
              </button>
            </div>
            <div className="md:w-1/3 flex flex-col gap-3">
              <button onClick={() => setShareModalOpen(true)} className="w-full border border-[#C0C0C0] text-[#C0C0C0] hover:bg-[#FFFFFF] hover:text-[#0A1F33] hover:border-[#0A1F33] font-bold text-[10px] uppercase tracking-widest py-4 px-6 transition-colors flex items-center justify-center gap-2 rounded-none">
                Guardar o Compartir Comparativa
              </button>
            </div>
          </div>
        </footer>
      )}

      {/* MODAL: BUSCADOR PREDICTIVO */}
      <Modal
        isOpen={searchModalOpen}
        onClose={() => { setSearchModalOpen(false); setSearchTerm(''); }}
        overlayClassName="fixed inset-0 bg-[#0A1F33]/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
        panelClassName="bg-[#FFFFFF] p-8 max-w-2xl w-full border-t-4 border-[#00BFFF] relative shadow-none"
      >
        <button onClick={() => { setSearchModalOpen(false); setSearchTerm(''); }} className="absolute top-4 right-4 text-[#C0C0C0] hover:text-[#D93025] font-black text-lg border-none outline-none">✕</button>
        <h3 className="font-black text-2xl text-[#0A1F33] uppercase mb-1" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>Agregar Auto al Comparador</h3>
        <p className="text-[10px] font-bold text-[#C0C0C0] uppercase tracking-widest mb-6">Escribe la marca, modelo o versión deseada</p>

        <div className="flex border border-[#0A1F33] mb-4 bg-[#FFFFFF]">
          <div className="pl-4 flex items-center text-[#C0C0C0]"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg></div>
          <input type="text" aria-label="Buscar vehículo por marca o modelo" placeholder="Ej: Kia Sportage, Toyota Corolla Cross..." className="w-full p-4 text-sm focus:outline-none text-[#3A3A3C]" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} autoFocus />
        </div>

        <div className="max-h-80 overflow-y-auto border border-[#C0C0C0] custom-scrollbar bg-[#F8F9FA]">
          {searchTerm.length < 2 ? (
            <div className="p-8 text-center text-[#C0C0C0] text-[10px] font-bold uppercase tracking-widest">Ingrese al menos 2 caracteres para buscar...</div>
          ) : searchResults.length > 0 ? (
            searchResults.map(v => {
              const isAlreadyAdded = compareItems.some(ci => ci.id === v.id);
              return (
                <button type="button" key={v.id} disabled={isAlreadyAdded} onClick={() => !isAlreadyAdded && handleAddVersion(v)} className={`appearance-none text-left w-full p-4 border-b border-[#C0C0C0]/40 flex justify-between items-center transition-colors ${isAlreadyAdded ? 'opacity-50 cursor-not-allowed bg-[#E6E6E6]' : 'cursor-pointer hover:bg-[#FFFFFF] hover:border-l-4 hover:border-l-[#00BFFF]'}`}>
                  <div className="flex flex-col"><span className="font-bold text-xs text-[#0A1F33] uppercase">{v.brandName} {v.modelName}</span><span className="text-[10px] text-[#3A3A3C] uppercase tracking-widest">{v.versionName}</span></div>
                  <div className="flex items-center gap-4"><span className="text-[11px] font-black text-[#0A1F33]" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>US$ {v.price.toLocaleString()}</span>{isAlreadyAdded ? <span className="text-[9px] text-[#D93025] font-bold uppercase">Agregado</span> : <span className="text-[10px] text-[#00BFFF] font-black">+ Agregar</span>}</div>
                </button>
              );
            })
          ) : (
            <div className="p-8 text-center text-[#C0C0C0] text-[10px] font-bold uppercase tracking-widest">Sin resultados en el catálogo.</div>
          )}
        </div>
      </Modal>

      {/* MODAL: COMPARTIR ENLACE (LEAD MAGNET) */}
      <Modal
        isOpen={shareModalOpen}
        onClose={() => { setShareModalOpen(false); setShareFeedback({type:'', message:''}); }}
        overlayClassName="fixed inset-0 bg-[#0A1F33]/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
        panelClassName="bg-[#FFFFFF] p-8 max-w-md w-full border-t-4 border-[#00BFFF] relative shadow-none"
      >
        <button onClick={() => { setShareModalOpen(false); setShareFeedback({type:'', message:''}); }} className="absolute top-4 right-4 text-[#C0C0C0] hover:text-[#D93025] font-black border-none outline-none">✕</button>
        <h3 className="font-black text-2xl text-[#0A1F33] uppercase mb-1" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>Guardar Comparativa</h3>
        <p className="text-[10px] font-bold text-[#C0C0C0] uppercase tracking-widest mb-6">Ingresá tu correo para recibir un enlace directo a esta comparación técnica.</p>
        
        <form onSubmit={handleShareSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="comparador-share-email" className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest block mb-1">Correo Electrónico <span className="text-[#D93025]">*</span></label>
            <input id="comparador-share-email" type="email" placeholder="ejemplo@correo.com" className="w-full border border-[#C0C0C0] p-4 text-xs focus:outline-none focus:border-[#0A1F33] bg-[#F8F9FA] rounded-none" required value={shareEmail} onChange={e=>setShareEmail(e.target.value)} />
          </div>
          <button type="submit" className="w-full bg-[#0A1F33] hover:bg-[#00BFFF] text-[#FFFFFF] font-bold text-xs uppercase tracking-widest py-4 transition-colors mt-2 border border-transparent rounded-none">
            Obtener Enlace Permanente
          </button>
          {shareFeedback.message && <p className={`text-[10px] text-center font-bold uppercase tracking-widest mt-2 ${shareFeedback.type==='error'?'text-[#D93025]':'text-[#1E8E3E]'}`}>{shareFeedback.message}</p>}
        </form>
      </Modal>

      {/* MODAL INTELIGENTE (LEAD B2B) */}
      <LeadModal
        isOpen={!!consultingVehicle}
        onClose={() => setConsultingVehicle(null)}
        vehiculoInteres={consultingVehicle?.name || ''}
        marcaVehiculo={consultingVehicle?.brandName || ''}
        origenLead="Comparador B2C"
        concesionariaDestino={consultingVehicle?.concesionaria || ''}
      />

      <LeadModal
        isOpen={comparativaLeadOpen}
        onClose={() => setComparativaLeadOpen(false)}
        vehiculoInteres={`Comparativa: ${vehiclesData.map(v => `${v.brandName} ${v.modelName}`).join(' vs ')}`}
        marcaVehiculo={vehiclesData.map(v => v.brandName).join(' / ')}
        origenLead="Comparador — Asesoría comparativa"
        concesionariaDestino="A designar (Central DATACAR)"
      />
    </main>
  );
}

// ==========================================
// PUNTO DE ENTRADA CON SUSPENSE
// ==========================================
export default function ComparadorPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center font-bold text-[#0A1F33] tracking-widest uppercase text-sm">Inicializando entorno de comparación...</div>}>
      <ComparadorContent />
    </Suspense>
  );
}