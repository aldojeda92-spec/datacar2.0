// app/catalogo/page.tsx
'use client';

import React, { useState, useEffect, useMemo, Suspense, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { getStoredCompareList, saveCompareList } from '../../lib/compareStorage';
import { useToast } from '../context/ToastContext';
import { formatFechaLarga } from '../../lib/fecha';
import CarroceriaIcon from '../components/CarroceriaIcon';
import { getCachedBrands, getCachedModels, getCachedVersions, getCachedCampaigns, getCachedConcesionarias } from '../../lib/catalogCache';
import BotonCotizar from '../components/BotonCotizar';
import { LeadProvider } from '../context/LeadContext';
import NewsletterForm from '../components/NewsletterForm'; // INYECCIÓN B2C
import { isOptimizableImageSrc, isValidImageSrc } from '../../lib/imageSrc';
import { normalizeCarroceria } from '../../lib/carroceria';
import { normalizeCombustible, combustibleLabel } from '../../lib/combustible';
import { normalizeExternalUrl } from '../../lib/externalUrl';
import { buildCheckedDealershipSet, isDatacarCheck, DATACAR_CHECK_BODY } from '../../lib/datacarCheck';
import DatacarCheckBadge from '../components/DatacarCheckBadge';
import Navbar, { NavItem } from '../components/Navbar';

const NAV_ITEMS: NavItem[] = [
  { type: 'link', label: 'Recomendador', href: '/recomendador' },
  {
    type: 'dropdown', label: 'Herramientas', items: [
      { label: 'Comparador de Versiones', href: '/comparador' },
      { label: 'Calculadora de Cuotas', href: '/calculadora' },
    ]
  },
  { type: 'link', label: 'Negociamos por vos', href: '/negociamos-por-vos' },
  { type: 'link', label: 'Catálogo', href: '/catalogo', current: true },
];

// ==========================================
// INTERFACES (Alineadas a Matriz 4 y Ads)
// ==========================================
interface AutoModel {
  id: string;
  versionId: string;
  brandId: string;
  brand: string;
  name: string;
  versionName: string;
  tipo_carroceria: string;
  price: number;
  img: string;
  transmision: string;
  combustible: string;
  traccion: string;
  plazas: string;
  origen_marca: string;
  concesionaria?: string;
  destacado: boolean;
  precioActualizado: string | null;
}

type SortKey = 'relevancia' | 'precio_asc' | 'precio_desc' | 'nombre';
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'relevancia', label: 'Relevancia' },
  { value: 'precio_asc', label: 'Precio: menor a mayor' },
  { value: 'precio_desc', label: 'Precio: mayor a menor' },
  { value: 'nombre', label: 'Marca y modelo (A-Z)' },
];
interface AdCampaign { 
  id: string; sponsor: string; headline: string; highlight: string; 
  price: string; link: string; img: string; location: string; 
  targetCategory?: string; // Necesario para segmentación contextual
  startDate: string; endDate: string; isActive: boolean; 
}


function CatalogoContent() {
  const searchParams = useSearchParams();
  const [autos, setAutos] = useState<AutoModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // INYECCIÓN: Bóveda de Campañas Activas
  const [activeCampaigns, setActiveCampaigns] = useState<AdCampaign[]>([]);

  // DATACAR CHECK: concesionarias oficiales verificadas, se propaga a sus productos
  const [checkedDealershipSet, setCheckedDealershipSet] = useState<Set<string>>(new Set());

  // COMPARADOR: seleccion rapida desde la tarjeta, compartida via localStorage
  // con la ficha y el /comparador (misma key en lib/compareStorage).
  const { showToast } = useToast();
  const [compareItems, setCompareItems] = useState<{ id: string; name: string; price: number }[]>([]);
  useEffect(() => { setCompareItems(getStoredCompareList()); }, []);
  const compareIds = useMemo(() => new Set(compareItems.map(v => v.id)), [compareItems]);

  const toggleCompare = (auto: AutoModel) => {
    if (!auto.versionId) { showToast('Este modelo todavía no tiene una versión para comparar.'); return; }
    setCompareItems(prev => {
      const exists = prev.some(v => v.id === auto.versionId);
      if (exists) {
        const next = prev.filter(v => v.id !== auto.versionId);
        saveCompareList(next);
        return next;
      }
      if (prev.length >= 3) { showToast('El comparador admite hasta 3 autos.'); return prev; }
      const next = [...prev, { id: auto.versionId, name: `${auto.brand} ${auto.name} ${auto.versionName}`.trim(), price: auto.price }];
      saveCompareList(next);
      return next;
    });
  };

  // Referencia para el ancla de paginación
  const topRef = useRef<HTMLDivElement>(null);

  // Estados Dinámicos
  const [marcasDisponibles, setMarcasDisponibles] = useState<string[]>([]);
  const [tiposDisponibles, setTiposDisponibles] = useState<string[]>([]);
  const [plazasDisponibles, setPlazasDisponibles] = useState<string[]>([]);
  const [origenesDisponibles, setOrigenesDisponibles] = useState<string[]>([]);
  const [combustiblesDisponibles, setCombustiblesDisponibles] = useState<string[]>([]);

  // Opciones Semánticas Fijas
  const transmisionesOpciones = ['Automática', 'Manual'];
  const traccionesOpciones = ['4x2 / Simple', '4x4 / Integral'];

  // ==========================================
  // ESTADO DE FILTROS -- se hidrata desde la URL en el primer render y se
  // vuelve a escribir en la URL ante cada cambio (con history.replaceState,
  // sin re-navegar). Asi, al entrar a una ficha y volver con el navegador,
  // los filtros, el orden y la pagina se conservan; ademas el catalogo
  // filtrado queda compartible por link.
  // ==========================================
  // Multi-valor por parametro repetido (?marca=A&marca=B); tolera tambien el
  // formato viejo de valor unico y las variantes de combustible sin normalizar.
  const readListParam = (key: string, normalizer?: (v: string) => string): string[] => {
    const all = searchParams?.getAll(key) ?? [];
    return all.filter(Boolean).map(v => (normalizer ? normalizer(v) : v));
  };

  const [priceRange, setPriceRange] = useState({
    from: searchParams?.get('minPrice') || '',
    to: searchParams?.get('maxPrice') || ''
  });

  const [activeFilters, setActiveFilters] = useState({
    tipos: readListParam('tipo'),
    marcas: readListParam('marca'),
    transmisiones: readListParam('transmision'),
    combustibles: readListParam('combustible', normalizeCombustible),
    tracciones: readListParam('traccion'),
    plazas: readListParam('plazas'),
    origenes: readListParam('origen'),
  });

  // Buscador local del filtro de marca (no va a la URL: es solo para acotar
  // la lista visible de 45+ checkboxes).
  const [marcaQuery, setMarcaQuery] = useState('');

  const [sortBy, setSortBy] = useState<SortKey>(() => {
    const s = searchParams?.get('orden') as SortKey | null;
    return s && SORT_OPTIONS.some(o => o.value === s) ? s : 'relevancia';
  });

  // ESTADO DE PAGINACIÓN
  const [currentPage, setCurrentPage] = useState(() => {
    const p = Number(searchParams?.get('pagina'));
    return Number.isFinite(p) && p > 0 ? p : 1;
  });
  const ITEMS_PER_PAGE = 12; // Múltiplo de 3 para grillas perfectas

  // Evita que el primer render (con la pagina hidratada de la URL) la pise a 1.
  const filtersHydrated = useRef(false);

  // RESETEAR PAGINACIÓN AL CAMBIAR FILTROS (no en el primer render)
  useEffect(() => {
    if (!filtersHydrated.current) { filtersHydrated.current = true; return; }
    setCurrentPage(1);
  }, [activeFilters, priceRange, sortBy]);

  // ESCRIBIR EL ESTADO EN LA URL (sin re-navegar)
  useEffect(() => {
    const params = new URLSearchParams();
    if (priceRange.from) params.set('minPrice', priceRange.from);
    if (priceRange.to) params.set('maxPrice', priceRange.to);
    activeFilters.tipos.forEach(v => params.append('tipo', v));
    activeFilters.marcas.forEach(v => params.append('marca', v));
    activeFilters.transmisiones.forEach(v => params.append('transmision', v));
    activeFilters.combustibles.forEach(v => params.append('combustible', v));
    activeFilters.tracciones.forEach(v => params.append('traccion', v));
    activeFilters.plazas.forEach(v => params.append('plazas', v));
    activeFilters.origenes.forEach(v => params.append('origen', v));
    if (sortBy !== 'relevancia') params.set('orden', sortBy);
    if (currentPage > 1) params.set('pagina', String(currentPage));
    const qs = params.toString();
    window.history.replaceState(null, '', qs ? `/catalogo?${qs}` : '/catalogo');
  }, [activeFilters, priceRange, sortBy, currentPage]);

  // ==========================================
  // 1. SINCRONIZACIÓN Y DEDUPLICACIÓN
  // ==========================================
  useEffect(() => {
    const fetchCatalogo = async () => {
      setIsLoading(true);
      try {
        const [brandsData, modelsData, versionsData, campaignsData, concesionariasData] = await Promise.all([
          getCachedBrands(),
          getCachedModels(),
          getCachedVersions(),
          getCachedCampaigns(),
          getCachedConcesionarias(),
        ]);

        setCheckedDealershipSet(buildCheckedDealershipSet(concesionariasData));

        const brandsMap: Record<string, { name: string, origen: string }> = {};
        const tempMarcas = new Set<string>();
        const tempOrigenes = new Set<string>();

        brandsData.forEach((data) => {
          const origen = data.origen_marca || 'No Definido';
          brandsMap[data.id] = { name: data.name, origen: origen };
          tempMarcas.add(data.name);
          if (data.origen_marca) tempOrigenes.add(data.origen_marca);
        });

        const tempTipos = new Set<string>();
        const tempPlazas = new Set<string>();
        const tempCombustibles = new Set<string>();

        // Agrupar versions por modelId una sola vez (antes era O(modelos×versiones))
        const versionsByModelId = new Map<string, any[]>();
        versionsData.forEach((v) => {
          const list = versionsByModelId.get(v.modelId) || [];
          list.push(v);
          versionsByModelId.set(v.modelId, list);
        });

        const modelsTemp = new Map<string, AutoModel>();

        modelsData.forEach((mData) => {
          const brandInfo = brandsMap[mData.brandId] || { name: 'MARCA', origen: '' };

          const modelVersions = versionsByModelId.get(mData.id) || [];
          const validVersions = modelVersions.filter(v => Number(v.price) > 0);
          validVersions.sort((a, b) => Number(a.price) - Number(b.price));

          const baseVersion = validVersions[0] || modelVersions[0] || {};
          const specs = baseVersion.specs || {};
          const price = Number(baseVersion.price) || Number(mData.startingPrice) || 0;

          const uniqueKey = `${mData.brandId}_${(mData.name || '').toLowerCase()}`;

          const autoData: AutoModel = {
            id: mData.id,
            versionId: baseVersion.id || '',
            brandId: mData.brandId || 'sin-marca',
            brand: brandInfo.name,
            name: mData.name || '',
            versionName: baseVersion.name || '',
            tipo_carroceria: normalizeCarroceria(mData.tipo_carroceria),
            price: price,
            img: mData.imgUrl || '',
            transmision: specs.transmision || '',
            combustible: normalizeCombustible(specs.combustible),
            traccion: specs.traccion || '',
            plazas: specs.plazas?.toString() || '',
            origen_marca: brandInfo.origen,
            concesionaria: baseVersion.concesionaria || mData.concesionaria || '',
            destacado: mData.isPopular === true,
            precioActualizado: formatFechaLarga(baseVersion.updatedAt ?? mData.updatedAt)
          };

          if (modelsTemp.has(uniqueKey)) {
            const existing = modelsTemp.get(uniqueKey)!;
            if (price > 0 && (price < existing.price || existing.price === 0)) {
              modelsTemp.set(uniqueKey, autoData);
            }
          } else {
            modelsTemp.set(uniqueKey, autoData);
          }

          if (mData.tipo_carroceria) tempTipos.add(normalizeCarroceria(mData.tipo_carroceria));
          if (specs.plazas) tempPlazas.add(specs.plazas.toString());
          if (specs.combustible) tempCombustibles.add(normalizeCombustible(specs.combustible));
        });

        setAutos(Array.from(modelsTemp.values()));
        setMarcasDisponibles(Array.from(tempMarcas).sort());
        setTiposDisponibles(Array.from(tempTipos).sort());
        setPlazasDisponibles(Array.from(tempPlazas).sort((a,b) => Number(a) - Number(b)));
        setOrigenesDisponibles(Array.from(tempOrigenes).sort());
        setCombustiblesDisponibles(Array.from(tempCombustibles).sort());

        // Carga y validación de TODAS las campañas vigentes para este contexto
        const today = new Date().toISOString().split('T')[0];
        const validAds = (campaignsData as AdCampaign[]).filter(c =>
          c.isActive === true &&
          (c.location === 'catalogo' || c.location === 'ambos') &&
          c.startDate <= today &&
          c.endDate >= today
        );
        setActiveCampaigns(validAds);

      } catch (error) { console.error("Error Firebase:", error); } finally { setIsLoading(false); }
    };
    fetchCatalogo();
  }, []);

  const toggleFilter = (category: keyof typeof activeFilters, value: string) => {
    setActiveFilters(prev => {
      const currentArray = prev[category] as string[];
      const isSelected = currentArray.some(item => item.toLowerCase() === value.toLowerCase());
      if (isSelected) return { ...prev, [category]: currentArray.filter(item => item.toLowerCase() !== value.toLowerCase()) };
      else return { ...prev, [category]: [...currentArray, value] };
    });
  };

  const marcasFiltradas = useMemo(() => {
    const q = marcaQuery.trim().toLowerCase();
    if (!q) return marcasDisponibles;
    return marcasDisponibles.filter(m => m.toLowerCase().includes(q));
  }, [marcasDisponibles, marcaQuery]);

  const clearFilters = () => {
    setPriceRange({ from: '', to: '' });
    setMarcaQuery('');
    setActiveFilters({ tipos: [], marcas: [], transmisiones: [], combustibles: [], tracciones: [], plazas: [], origenes: [] });
  };

  // ==========================================
  // 2. MOTOR LÓGICO DE FILTRADO (Fuzzy Matching)
  // ==========================================
  const autosFiltrados = useMemo(() => {
    return autos.filter(auto => {
      if (priceRange.from && auto.price < Number(priceRange.from)) return false;
      if (priceRange.to && auto.price > Number(priceRange.to)) return false;
      
      if (activeFilters.tipos.length > 0 && !activeFilters.tipos.map(t=>t.toLowerCase()).includes(auto.tipo_carroceria.toLowerCase())) return false;
      if (activeFilters.marcas.length > 0 && !activeFilters.marcas.map(m=>m.toLowerCase()).includes(auto.brand.toLowerCase())) return false;
      if (activeFilters.combustibles.length > 0 && !activeFilters.combustibles.map(c=>c.toLowerCase()).includes(auto.combustible.toLowerCase())) return false;
      if (activeFilters.plazas.length > 0 && !activeFilters.plazas.includes(auto.plazas)) return false;
      if (activeFilters.origenes.length > 0 && !activeFilters.origenes.map(o=>o.toLowerCase()).includes(auto.origen_marca.toLowerCase())) return false;
      
      if (activeFilters.transmisiones.length > 0) {
        const transText = (auto.transmision || '').toLowerCase();
        const wantsAuto = activeFilters.transmisiones.some(t => t.toLowerCase() === 'automática');
        const wantsMan = activeFilters.transmisiones.some(t => t.toLowerCase() === 'manual');
        let matched = false;
        if (wantsAuto && (transText.includes('auto') || transText.includes('at') || transText.includes('cvt') || transText.includes('dct') || transText.includes('dht'))) matched = true;
        if (wantsMan && (transText.includes('man') || transText.includes('mt') || transText.includes('mec'))) matched = true;
        if (!matched) return false;
      }

      if (activeFilters.tracciones.length > 0) {
        const traccText = (auto.traccion || '').toLowerCase();
        const wants4x4 = activeFilters.tracciones.includes('4x4 / Integral');
        const wants4x2 = activeFilters.tracciones.includes('4x2 / Simple');
        let matched = false;
        if (wants4x4 && (traccText.includes('4x4') || traccText.includes('awd') || traccText.includes('4wd') || traccText.includes('integral') || traccText.includes('permanente'))) matched = true;
        if (wants4x2 && (traccText.includes('4x2') || traccText.includes('fwd') || traccText.includes('2wd') || traccText.includes('delantera') || traccText.includes('trasera'))) matched = true;
        if (!matched) return false;
      }

      return true;
    });
  }, [activeFilters, priceRange, autos]);

  // Orden aplicado sobre el resultado filtrado. "relevancia" respeta el orden
  // de origen (destacados primero como desempate suave).
  const autosOrdenados = useMemo(() => {
    const list = [...autosFiltrados];
    switch (sortBy) {
      case 'precio_asc':
        return list.sort((a, b) => a.price - b.price);
      case 'precio_desc':
        return list.sort((a, b) => b.price - a.price);
      case 'nombre':
        return list.sort((a, b) => `${a.brand} ${a.name}`.localeCompare(`${b.brand} ${b.name}`, 'es'));
      default:
        return list.sort((a, b) => Number(b.destacado) - Number(a.destacado));
    }
  }, [autosFiltrados, sortBy]);

  // ==========================================
  // 3. MOTOR DE INYECCIÓN CONTEXTUAL (ADS)
  // ==========================================
  const adToShow = useMemo(() => {
    if (activeCampaigns.length === 0) return null;

    // Prioridad 1: Hay un filtro de categoría (tipo) activo
    if (activeFilters.tipos.length > 0) {
      const targetCat = activeFilters.tipos[0].toUpperCase();
      const specificAd = activeCampaigns.find(c => c.targetCategory?.toUpperCase() === targetCat);
      if (specificAd) return specificAd;
    }

    // Prioridad 2 (Fallback): Buscar un anuncio Global/Genérico
    const generalAd = activeCampaigns.find(c => c.targetCategory === 'Todas' || !c.targetCategory);
    return generalAd || null;

  }, [activeCampaigns, activeFilters.tipos]);

  // ==========================================
  // 4. LÓGICA DE PAGINACIÓN
  // ==========================================
  const totalPages = Math.ceil(autosOrdenados.length / ITEMS_PER_PAGE);

  // La pagina hidratada de la URL puede quedar fuera de rango si el catalogo
  // devuelve menos resultados que antes.
  useEffect(() => {
    if (!isLoading && totalPages > 0 && currentPage > totalPages) setCurrentPage(totalPages);
  }, [isLoading, totalPages, currentPage]);

  const currentAutos = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return autosOrdenados.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [autosOrdenados, currentPage]);

  const goToPage = (pageNumber: number) => {
    setCurrentPage(pageNumber);
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const FlatCheckbox = ({ label, value, category, subLabel, icon, onToggle }: { label: string, value?: string, category: keyof typeof activeFilters, subLabel?: string, icon?: React.ReactNode, onToggle: () => void }) => {
    const matchValue = value !== undefined ? value : label;
    const isChecked = activeFilters[category].some(item => item.toLowerCase() === matchValue.toLowerCase());

    return (
      <label className="flex items-start gap-3 cursor-pointer group">
        <input type="checkbox" className="sr-only" checked={isChecked} onChange={onToggle} />
        <div aria-hidden="true" className={`mt-0.5 w-4 h-4 border flex items-center justify-center shrink-0 transition-colors ${isChecked ? 'bg-[#00BFFF] border-[#00BFFF]' : 'bg-[#FFFFFF] border-[#C0C0C0] group-hover:border-[#0A1F33]'}`}>
          {isChecked && <svg className="w-3 h-3 text-[#FFFFFF]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeLinejoin="miter" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>}
        </div>
        {icon && <span className={`shrink-0 -mt-0.5 transition-colors ${isChecked ? 'text-[#0A1F33]' : 'text-[#C0C0C0] group-hover:text-[#3A3A3C]'}`}>{icon}</span>}
        <div className="flex flex-col">
          <span className={`text-[11px] uppercase tracking-wide transition-colors ${isChecked ? 'font-bold text-[#0A1F33]' : 'text-[#3A3A3C] font-medium group-hover:text-[#0A1F33]'}`}>{label}</span>
          {subLabel && <span className="text-[9px] text-[#C0C0C0] uppercase tracking-widest">{subLabel}</span>}
        </div>
      </label>
    );
  };

  // Renderizador del Anuncio Contextual
  const renderAdBanner = () => {
    if (!adToShow) return null;
    return (
      <a href={normalizeExternalUrl(adToShow.link)} target="_blank" rel="noopener noreferrer" key={`injected-ad-${adToShow.id}`} className="col-span-full block w-full bg-[#3A3A3C] border-2 border-transparent hover:border-[#00BFFF] flex flex-col md:flex-row justify-between items-center p-6 md:p-8 relative transition-colors group overflow-hidden mb-2 mt-2 rounded-none">
        <span className="absolute top-4 right-4 bg-[#FFFFFF]/10 text-[#FFFFFF] text-[8px] uppercase font-bold px-3 py-1 tracking-widest border border-[#FFFFFF]/20 z-20">Patrocinado: {adToShow.sponsor}</span>
        <div className="flex flex-col text-left z-10 mt-6 md:mt-0">
          <p className="font-black text-2xl sm:text-3xl md:text-4xl text-[#FFFFFF] uppercase leading-tight break-words mb-2" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>{adToShow.headline} <span className="text-[#00BFFF]">{adToShow.highlight}</span></p>
          <p className="font-black text-xl sm:text-2xl text-[#FFFFFF] mt-2 inline-block border-b-4 border-[#00BFFF] w-max pb-1 break-words" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>{adToShow.price}</p>
        </div>
        <div className="mt-6 md:mt-0 flex justify-end z-10 relative h-32 w-full md:w-1/2">
          {isValidImageSrc(adToShow.img) && (
            <Image
              src={adToShow.img}
              alt={adToShow.sponsor}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-contain group-hover:scale-105 transition-transform origin-right"
              style={{ objectPosition: 'right bottom' }}
              unoptimized={!isOptimizableImageSrc(adToShow.img)}
            />
          )}
        </div>
      </a>
    );
  };

  return (
    <>
      <header className="w-full border-b border-[#C0C0C0] bg-[#FFFFFF] pt-6 pb-6">
        <div className="max-w-[1400px] mx-auto px-4 lg:px-8">
          <p className="text-[10px] font-medium text-[#C0C0C0] mb-2 uppercase tracking-widest"><Link href="/" className="hover:text-[#3A3A3C] transition-colors">Inicio</Link> / <span className="font-bold text-[#3A3A3C]">Catálogo</span></p>
          <h1 className="font-black text-3xl md:text-4xl text-[#0A1F33]" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>Catálogo de autos 0km</h1>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-4 lg:px-8 pt-8 flex flex-col md:flex-row gap-8 items-start mb-24" ref={topRef}>
        
        <aside className="w-full md:w-[260px] flex-shrink-0 md:sticky md:top-24 md:max-h-[calc(100vh-8rem)] md:overflow-y-auto custom-scrollbar shadow-none border border-[#C0C0C0]" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
          <div className="bg-[#FFFFFF]">
            <div className="p-4 border-b border-[#C0C0C0] flex justify-between items-center bg-[#F5F5F5] sticky top-0 z-10">
              <h2 className="font-bold text-[#0A1F33] text-sm uppercase tracking-wider">Parámetros</h2>
              <button onClick={clearFilters} className="text-[10px] text-[#D93025] hover:underline font-bold uppercase tracking-widest border-none outline-none">Restablecer</button>
            </div>
            
            <div className="p-5 border-b border-[#C0C0C0]">
              <h3 className="text-[10px] text-[#3A3A3C] mb-3 font-bold uppercase tracking-widest">Presupuesto (USD)</h3>
              <div className="flex flex-col gap-2">
                <input type="number" aria-label="Presupuesto mínimo en dólares" placeholder="Mínimo" className="w-full border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#0A1F33] bg-[#F8F9FA] rounded-none" value={priceRange.from} onChange={(e) => setPriceRange({...priceRange, from: e.target.value})} />
                <input type="number" aria-label="Presupuesto máximo en dólares" placeholder="Máximo" className="w-full border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#0A1F33] bg-[#F8F9FA] rounded-none" value={priceRange.to} onChange={(e) => setPriceRange({...priceRange, to: e.target.value})} />
              </div>
            </div>
            
            <div className="p-5 border-b border-[#C0C0C0]">
              <h3 className="text-[10px] text-[#3A3A3C] mb-3 font-bold uppercase tracking-widest">Marca Automotriz</h3>
              {marcasDisponibles.length > 8 && (
                <input
                  type="search"
                  aria-label="Buscar marca"
                  placeholder="Buscar marca..."
                  className="w-full border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#0A1F33] bg-[#F8F9FA] rounded-none mb-3"
                  value={marcaQuery}
                  onChange={(e) => setMarcaQuery(e.target.value)}
                />
              )}
              <div className="flex flex-col gap-3 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                {marcasDisponibles.length === 0 ? (
                  <span className="text-[10px] text-[#C0C0C0] italic uppercase">Cargando...</span>
                ) : marcasFiltradas.length > 0 ? (
                  marcasFiltradas.map(item => <FlatCheckbox key={item} label={item} category="marcas" onToggle={() => toggleFilter('marcas', item)} />)
                ) : (
                  <span className="text-[10px] text-[#C0C0C0] italic uppercase">Sin marcas para “{marcaQuery}”</span>
                )}
              </div>
            </div>

            <div className="p-5 border-b border-[#C0C0C0]">
              <h3 className="text-[10px] text-[#3A3A3C] mb-4 font-bold uppercase tracking-widest">Tipo de Carrocería</h3>
              <div className="flex flex-col gap-3">
                {tiposDisponibles.map(item => (<FlatCheckbox key={item} label={item} category="tipos" icon={<CarroceriaIcon tipo={item} className="w-5 h-5" />} onToggle={() => toggleFilter('tipos', item)} />))}
              </div>
            </div>

            <div className="p-5 border-b border-[#C0C0C0]">
              <h3 className="text-[10px] text-[#3A3A3C] mb-4 font-bold uppercase tracking-widest">Transmisión</h3>
              <div className="flex flex-col gap-3">
                {transmisionesOpciones.map(item => (<FlatCheckbox key={item} label={item} category="transmisiones" onToggle={() => toggleFilter('transmisiones', item)} />))}
              </div>
            </div>

            <div className="p-5 border-b border-[#C0C0C0]">
              <h3 className="text-[10px] text-[#3A3A3C] mb-4 font-bold uppercase tracking-widest">Motorización</h3>
              <div className="flex flex-col gap-3">
                {combustiblesDisponibles.map(item => (<FlatCheckbox key={item} label={combustibleLabel(item) || item} value={item} category="combustibles" subLabel={combustibleLabel(item) ? item : undefined} onToggle={() => toggleFilter('combustibles', item)} />))}
              </div>
            </div>

            <div className="p-5 border-b border-[#C0C0C0]">
              <h3 className="text-[10px] text-[#3A3A3C] mb-4 font-bold uppercase tracking-widest">Tracción</h3>
              <div className="flex flex-col gap-3">
                {traccionesOpciones.map(item => (<FlatCheckbox key={item} label={item} category="tracciones" onToggle={() => toggleFilter('tracciones', item)} />))}
              </div>
            </div>

            <div className="p-5 border-b border-[#C0C0C0]">
              <h3 className="text-[10px] text-[#3A3A3C] mb-4 font-bold uppercase tracking-widest">Capacidad</h3>
              <div className="flex flex-col gap-3">
                {plazasDisponibles.map(item => (<FlatCheckbox key={item} label={`${item} Plazas`} value={item} category="plazas" onToggle={() => toggleFilter('plazas', item)} />))}
              </div>
            </div>

            <div className="p-5 border-b border-[#C0C0C0]">
              <h3 className="text-[10px] text-[#3A3A3C] mb-4 font-bold uppercase tracking-widest">Origen de Marca</h3>
              <div className="flex flex-col gap-3">
                {origenesDisponibles.map(item => (<FlatCheckbox key={item} label={item} category="origenes" onToggle={() => toggleFilter('origenes', item)} />))}
              </div>
            </div>
            
          </div>
        </aside>

        <section className="flex-1 flex flex-col min-w-0">
          
          {(priceRange.from || priceRange.to) && (
            <div className="bg-[#0A1F33] text-[#FFFFFF] p-5 mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 rounded-none shadow-none border-l-4 border-[#00BFFF]">
              <div className="flex items-center gap-4">
                <div className="bg-[#FFFFFF]/10 p-2 rounded-full shrink-0">
                  <svg className="w-6 h-6 text-[#00BFFF]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-[#00BFFF] uppercase tracking-widest mb-1">Presupuesto Asignado</p>
                  <p className="text-sm font-medium" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
                    Mostrando autos entre <span className="font-bold">US$ {Number(priceRange.from || 0).toLocaleString()}</span> y <span className="font-bold">{priceRange.to ? `US$ ${Number(priceRange.to).toLocaleString()}` : 'Sin límite'}</span>
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setPriceRange({from: '', to: ''})} 
                className="text-[10px] font-bold text-[#FFFFFF] hover:text-[#00BFFF] border border-[#FFFFFF]/20 hover:border-[#00BFFF] px-4 py-2 uppercase tracking-widest transition-colors w-full sm:w-auto rounded-none"
              >
                ✕ Quitar Filtro
              </button>
            </div>
          )}

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6 pb-4 border-b border-[#C0C0C0]">
            <span className="text-[11px] text-[#3A3A3C] uppercase tracking-widest">
              {isLoading ? 'Cargando catálogo...' : <><span className="font-bold text-[#0A1F33] text-sm">{autosOrdenados.length}</span> autos disponibles</>}
              {!isLoading && totalPages > 1 && (
                <span className="text-[#C0C0C0] font-bold"> · Página {currentPage} de {totalPages}</span>
              )}
            </span>
            <label className="flex items-center gap-2 text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest">
              Ordenar por
              <select
                aria-label="Ordenar resultados"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="border border-[#C0C0C0] bg-[#FFFFFF] text-[#0A1F33] text-[11px] font-medium normal-case tracking-normal py-2 px-3 focus:outline-none focus:border-[#0A1F33] rounded-none"
              >
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {isLoading ? (
               <div className="col-span-full py-20 text-center font-bold text-[#C0C0C0] uppercase tracking-widest animate-pulse">Cargando modelos...</div>
            ) : currentAutos.length > 0 ? (
              
              currentAutos.map((auto, index) => {
                // LÓGICA DE INYECCIÓN AD CONTEXTUAL: Aparece antes del 7mo elemento (índice 6)
                // O si es el último elemento de la página y hay menos de 6 autos (contingencia)
                const showAdHere = adToShow && (
                  index === 6 || (index === currentAutos.length - 1 && currentAutos.length <= 6)
                );

                return (
                  <React.Fragment key={auto.id}>
                    {/* Renderizamos el Ad justo ANTES de la tarjeta número 7 */}
                    {showAdHere && index === 6 && renderAdBanner()}

                    <div className="relative h-full bg-[#FFFFFF] border border-[#C0C0C0] flex flex-col hover:border-[#0A1F33] transition-colors group shadow-none rounded-none">
                      {(() => {
                        const enCompare = compareIds.has(auto.versionId);
                        return (
                          <button
                            type="button"
                            onClick={() => toggleCompare(auto)}
                            aria-pressed={enCompare}
                            aria-label={enCompare ? `Quitar ${auto.brand} ${auto.name} del comparador` : `Agregar ${auto.brand} ${auto.name} al comparador`}
                            title={enCompare ? 'Quitar del comparador' : 'Agregar al comparador'}
                            className={`absolute top-2 right-2 z-20 flex items-center gap-1 border px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest transition-colors rounded-none ${enCompare ? 'bg-[#0A1F33] border-[#0A1F33] text-[#FFFFFF]' : 'bg-[#FFFFFF] border-[#C0C0C0] text-[#3A3A3C] hover:border-[#0A1F33] hover:text-[#0A1F33]'}`}
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                            {enCompare ? 'Comparando' : 'Comparar'}
                          </button>
                        );
                      })()}
                      <Link href={`/catalogo/${auto.brandId}/${auto.id}`} className="block flex-grow cursor-pointer">
                        <div className="p-4 h-44 bg-[#FFFFFF] group-hover:bg-[#F8F9FA] transition-colors border-b border-[#C0C0C0]/20 relative">
                          {isDatacarCheck(auto.concesionaria, checkedDealershipSet) && (
                            <div className="absolute top-2 left-2 z-10"><DatacarCheckBadge size="sm" concesionariaNombre={auto.concesionaria} /></div>
                          )}
                          {isValidImageSrc(auto.img) ? (
                            <Image
                              src={auto.img}
                              alt={auto.name}
                              fill
                              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                              className="object-contain p-4 group-hover:scale-[1.02] transition-transform duration-300"
                              unoptimized={!isOptimizableImageSrc(auto.img)}
                            />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-[#C0C0C0] uppercase tracking-widest">Sin Imagen</div>
                          )}
                        </div>
                        
                        <div className="p-5 flex flex-col">
                          <h3 className="text-[14px] text-[#3A3A3C] uppercase tracking-wide mb-1" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
                            {auto.brand} <span className="font-black text-[#0A1F33]" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>{auto.name}</span>
                          </h3>
                          <p className="text-[11px] font-bold text-[#C0C0C0] uppercase mb-2 truncate" title={auto.versionName || 'Versión Base'}>
                            {auto.versionName || 'Versión Base'}
                          </p>
                          <p className="text-[10px] text-[#3A3A3C] font-medium uppercase mb-4 flex items-center gap-1.5" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
                            <CarroceriaIcon tipo={auto.tipo_carroceria} className="w-4 h-4 text-[#C0C0C0]" />
                            {auto.tipo_carroceria} • {auto.transmision || 'Consultar'}
                          </p>
                          
                          <div className="mt-auto pt-4 border-t border-[#C0C0C0]/50 flex justify-between items-end">
                            <div className="flex flex-col min-w-0">
                              <span className="text-[9px] text-[#C0C0C0] font-bold uppercase tracking-widest mb-0.5 truncate">
                                Desde · versión {auto.versionName || 'base'}
                              </span>
                              <span className="font-black text-[18px] text-[#0A1F33]" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
                                US$ {auto.price.toLocaleString()}
                              </span>
                            </div>
                          </div>
                          {auto.precioActualizado && (
                            <p className="text-[9px] text-[#C0C0C0] font-medium tracking-wide mt-2">Actualizado el {auto.precioActualizado}</p>
                          )}
                        </div>
                      </Link>

                      <div className="px-5 pb-5 flex flex-col gap-2 mt-auto">
                        <BotonCotizar 
                          vehiculoInteres={`${auto.brand} ${auto.name} ${auto.versionName}`}
                          marcaVehiculo={auto.brand}
                          concesionariaDestino={auto.concesionaria || ''}
                          origenLead="Catálogo General"
                          textoMenu="Consultar Ahora"
                          variante="primario"
                        />
                        <Link href={`/catalogo/${auto.brandId}/${auto.id}`} className="w-full text-center border border-[#C0C0C0] text-[#3A3A3C] hover:border-[#0A1F33] hover:text-[#0A1F33] font-bold text-xs uppercase tracking-widest py-3 transition-colors rounded-none">
                          Ver Ficha Técnica
                        </Link>
                      </div>
                    </div>

                    {/* Renderizamos el Ad al FINAL si hay menos de 6 autos filtrados */}
                    {showAdHere && index === currentAutos.length - 1 && currentAutos.length <= 6 && renderAdBanner()}

                  </React.Fragment>
                );
              })

            ) : (
              <div className="col-span-full py-20 bg-[#F8F9FA] border border-[#C0C0C0] text-center flex flex-col items-center justify-center rounded-none shadow-none">
                <span className="text-3xl mb-3 opacity-50">🛡️</span>
                <p className="text-sm text-[#0A1F33] font-bold uppercase tracking-widest mb-2">Sin coincidencias</p>
                <p className="text-[10px] text-[#3A3A3C] uppercase tracking-widest mb-6">El catálogo actual no posee autos con estos parámetros.</p>
                <button onClick={clearFilters} className="border border-[#0A1F33] text-[#0A1F33] px-6 py-3 text-[10px] font-bold uppercase tracking-widest hover:bg-[#0A1F33] hover:text-[#FFFFFF] transition-colors rounded-none outline-none">Ver todos los autos</button>
              </div>
            )}
          </div>

          {/* CONTROLES DE PAGINACIÓN B2B */}
          {!isLoading && totalPages > 1 && (
            <div className="flex justify-center flex-wrap gap-2 mt-12 mb-8 border-t border-[#C0C0C0] pt-8">
              <button 
                onClick={() => goToPage(currentPage - 1)} 
                disabled={currentPage === 1}
                className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest border border-[#C0C0C0] bg-[#FFFFFF] text-[#3A3A3C] hover:border-[#0A1F33] disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded-none"
              >
                Anterior
              </button>
              
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => goToPage(page)}
                  className={`w-10 h-10 flex items-center justify-center text-[10px] font-bold uppercase tracking-widest border transition-colors rounded-none ${currentPage === page ? 'bg-[#0A1F33] text-[#FFFFFF] border-[#0A1F33]' : 'bg-[#FFFFFF] text-[#3A3A3C] border-[#C0C0C0] hover:border-[#0A1F33]'}`}
                >
                  {page}
                </button>
              ))}

              <button 
                onClick={() => goToPage(currentPage + 1)} 
                disabled={currentPage === totalPages}
                className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest border border-[#C0C0C0] bg-[#FFFFFF] text-[#3A3A3C] hover:border-[#0A1F33] disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded-none"
              >
                Siguiente
              </button>
            </div>
          )}

        </section>
      </div>

      {compareItems.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-[150] bg-[#0A1F33] border-t-4 border-[#00BFFF] px-4 lg:px-8 py-3">
          <div className="max-w-[1400px] mx-auto flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-[10px] font-bold text-[#00BFFF] uppercase tracking-widest shrink-0">Comparador · {compareItems.length}/3</span>
              <span className="text-[11px] text-[#FFFFFF]/70 truncate hidden sm:block">{compareItems.map(v => v.name).join('  ·  ')}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => { setCompareItems([]); saveCompareList([]); }} className="text-[10px] font-bold text-[#FFFFFF]/70 hover:text-[#FFFFFF] uppercase tracking-widest border border-[#FFFFFF]/20 hover:border-[#FFFFFF] px-3 py-2 transition-colors rounded-none">Vaciar</button>
              <Link href="/comparador" className="text-[10px] font-bold text-[#0A1F33] bg-[#00BFFF] hover:bg-[#FFFFFF] uppercase tracking-widest px-4 py-2 transition-colors rounded-none">Comparar ahora →</Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ==========================================
// COMPONENTE FOOTER MODULAR
// ==========================================
function CatalogoFooter() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const faqs = [
    {
      q: '¿Qué modelos hay en el catálogo?',
      a: 'Nuestro catálogo procesa y audita cientos de autos 0km disponibles en la red de concesionarios oficiales de Paraguay, abarcando desde hatchbacks compactos hasta SUVs y Pick-Ups pesadas.'
    },
    {
      q: '¿Puedo filtrar por presupuesto o características técnicas?',
      a: 'Sí. El panel lateral cuenta con un motor lógico que te permite cruzar parámetros financieros (presupuesto mínimo/máximo) con variables duras como motorización, transmisión y plazas.'
    },
    {
      q: '¿Los precios reflejados son oficiales?',
      a: 'Totalmente. Los valores de inversión publicados provienen de las listas de precios de los representantes oficiales en Paraguay, actualizados y auditados por nuestro equipo. No incluyen fletes internos ni patentamiento.'
    },
    {
      q: '¿El catálogo incluye todas las marcas de Paraguay?',
      a: 'Consolidamos la información de las principales marcas del mercado habilitadas y con respaldo oficial, asegurando garantía y soporte técnico local para tu próximo vehículo.'
    },
    {
      q: '¿Cómo avanzo con la compra de un auto del catálogo?',
      a: 'Al ingresar a la ficha de cualquier modelo, encontrarás el botón "Consultar Asesor". Esto derivará tu solicitud a un especialista comercial que bloqueará las condiciones y gestionará la transacción de forma transparente.'
    },
    {
      q: '¿Qué significa el sello DATACAR CHECK?',
      a: DATACAR_CHECK_BODY
    }
  ];

  return (
    <div className="w-full bg-[#FFFFFF] border-t border-[#C0C0C0]">
      
      {/* SECCIÓN NEWSLETTER B2C INYECTADA */}
      <div className="bg-[#0A1F33] border-b-4 border-[#00BFFF]">
        <div className="max-w-[1400px] mx-auto px-4 lg:px-8 py-16 flex flex-col md:flex-row justify-between items-center gap-12">
          <div className="md:w-1/2 text-center md:text-left">
            <h3 className="font-black text-3xl md:text-4xl text-[#FFFFFF] uppercase mb-4" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>Suscribite a las oportunidades.</h3>
            <p className="text-sm text-[#C0C0C0] font-medium" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>Sé el primero en enterarte de todas las oportunidades de 0km en tu e-mail.</p>
          </div>
          <div className="md:w-1/2 w-full max-w-lg">
            <NewsletterForm />
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 lg:px-8 py-6 border-b border-[#C0C0C0]/30">
        <p className="text-[10px] text-[#C0C0C0] font-medium text-center md:text-left leading-relaxed">
          Los vehículos están verificados con las concesionarias y representantes oficiales de nuestra red comercial. Los valores expresados no incluyen aranceles de patentamiento ni seguros. Son válidos exclusivamente para operaciones analizadas a través de DATACAR.
        </p>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 lg:px-8 py-16 flex flex-col md:flex-row gap-12 items-start">
        <div className="md:w-1/3 shrink-0">
          <h2 className="text-3xl text-[#3A3A3C] font-medium" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
            Preguntas <span className="font-black text-[#0A1F33]" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>frecuentes</span>
          </h2>
        </div>
        
        <div className="md:w-2/3 w-full flex flex-col border-t border-[#C0C0C0]">
          {faqs.map((faq, index) => (
            <div key={index} className="border-b border-[#C0C0C0] py-6">
              <button
                onClick={() => setOpenFaq(openFaq === index ? null : index)}
                aria-expanded={openFaq === index}
                aria-controls={`faq-catalogo-panel-${index}`}
                className="w-full flex justify-between items-center text-left focus:outline-none group border-none bg-transparent"
              >
                <span className="font-bold text-sm text-[#0A1F33] group-hover:text-[#00BFFF] transition-colors pr-4" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>{faq.q}</span>
                <span className="text-[#0A1F33] text-2xl font-light">{openFaq === index ? '−' : '+'}</span>
              </button>

              <div id={`faq-catalogo-panel-${index}`} className={`overflow-hidden transition-all duration-300 ease-in-out ${openFaq === index ? 'max-h-40 opacity-100 mt-4' : 'max-h-0 opacity-0'}`}>
                <p className="text-sm text-[#3A3A3C] leading-relaxed font-medium pr-8" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>{faq.a}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// ESTRUCTURA BASE DE PÁGINA
// ==========================================
export default function CatalogoClient() {
  return (
    <LeadProvider>
      <main className="min-h-screen bg-[#FFFFFF] text-[#3A3A3C] font-sans flex flex-col">
        <Navbar items={NAV_ITEMS} />
        
        <div className="flex-grow">
          <Suspense fallback={<div className="p-20 text-center font-bold text-[#C0C0C0] uppercase tracking-widest text-[10px] animate-pulse">Iniciando motor de filtrado...</div>}>
            <CatalogoContent />
          </Suspense>
        </div>

        <CatalogoFooter />
      </main>
    </LeadProvider>
  );
}