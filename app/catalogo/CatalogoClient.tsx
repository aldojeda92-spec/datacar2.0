// app/catalogo/page.tsx
'use client';

import React, { useState, useEffect, useMemo, Suspense, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getCachedBrands, getCachedModels, getCachedVersions, getCachedCampaigns } from '../../lib/catalogCache';
import BotonCotizar from '../components/BotonCotizar';
import { LeadProvider } from '../context/LeadContext';
import NewsletterForm from '../components/NewsletterForm'; // INYECCIÓN B2C

// ==========================================
// INTERFACES (Alineadas a Matriz 4 y Ads)
// ==========================================
interface AutoModel {
  id: string; 
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
}
interface AdCampaign { 
  id: string; sponsor: string; headline: string; highlight: string; 
  price: string; link: string; img: string; location: string; 
  targetCategory?: string; // Necesario para segmentación contextual
  startDate: string; endDate: string; isActive: boolean; 
}

// Diccionario Explicativo de Combustibles
const combustibleLabels: Record<string, string> = {
  'EV': 'Eléctrico Puro',
  'PHEV': 'Híbrido Enchufable',
  'HEV': 'Híbrido Convencional',
  'MHEV': 'Micro Híbrido',
  'REEV': 'Rango Extendido',
  'Flex': 'Nafta/Etanol',
  'Nafta': 'Combustión Interna',
  'Diesel': 'Combustión Interna'
};

function CatalogoContent() {
  const searchParams = useSearchParams();
  const [autos, setAutos] = useState<AutoModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // INYECCIÓN: Bóveda de Campañas Activas
  const [activeCampaigns, setActiveCampaigns] = useState<AdCampaign[]>([]);

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

  // Estados de Filtros URL
  const [priceRange, setPriceRange] = useState({ 
    from: searchParams?.get('minPrice') || '', 
    to: searchParams?.get('maxPrice') || '' 
  });

  const [activeFilters, setActiveFilters] = useState({
    tipos: searchParams?.get('tipo') ? [searchParams.get('tipo') as string] : [],
    marcas: searchParams?.get('marca') ? [searchParams.get('marca') as string] : [],
    transmisiones: [] as string[], 
    combustibles: searchParams?.get('combustible') ? [searchParams.get('combustible') as string] : [],
    tracciones: [] as string[], 
    plazas: [] as string[],
    origenes: [] as string[]
  });

  // ESTADO DE PAGINACIÓN
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 12; // Múltiplo de 3 para grillas perfectas

  useEffect(() => {
    const minP = searchParams?.get('minPrice');
    const maxP = searchParams?.get('maxPrice');
    if (minP || maxP) {
      setPriceRange(prev => ({ ...prev, from: minP || prev.from, to: maxP || prev.to }));
    }
  }, [searchParams]);

  // RESETEAR PAGINACIÓN AL CAMBIAR FILTROS
  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilters, priceRange]);

  // ==========================================
  // 1. SINCRONIZACIÓN Y DEDUPLICACIÓN
  // ==========================================
  useEffect(() => {
    const fetchCatalogo = async () => {
      setIsLoading(true);
      try {
        const [brandsData, modelsData, versionsData, campaignsData] = await Promise.all([
          getCachedBrands(),
          getCachedModels(),
          getCachedVersions(),
          getCachedCampaigns(),
        ]);

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
            brandId: mData.brandId || 'sin-marca',
            brand: brandInfo.name,
            name: mData.name || '',
            versionName: baseVersion.name || '',
            tipo_carroceria: mData.tipo_carroceria || 'Vehículo',
            price: price,
            img: mData.imgUrl || 'https://via.placeholder.com/400x200?text=Sin+Imagen',
            transmision: specs.transmision || '',
            combustible: specs.combustible || '',
            traccion: specs.traccion || '',
            plazas: specs.plazas?.toString() || '',
            origen_marca: brandInfo.origen,
            concesionaria: baseVersion.concesionaria || mData.concesionaria || ''
          };

          if (modelsTemp.has(uniqueKey)) {
            const existing = modelsTemp.get(uniqueKey)!;
            if (price > 0 && (price < existing.price || existing.price === 0)) {
              modelsTemp.set(uniqueKey, autoData);
            }
          } else {
            modelsTemp.set(uniqueKey, autoData);
          }

          if (mData.tipo_carroceria) tempTipos.add(mData.tipo_carroceria);
          if (specs.plazas) tempPlazas.add(specs.plazas.toString());
          if (specs.combustible) tempCombustibles.add(specs.combustible);
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

  const clearFilters = () => {
    setPriceRange({ from: '', to: '' });
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
  const totalPages = Math.ceil(autosFiltrados.length / ITEMS_PER_PAGE);
  
  const currentAutos = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return autosFiltrados.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [autosFiltrados, currentPage]);

  const goToPage = (pageNumber: number) => {
    setCurrentPage(pageNumber);
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const FlatCheckbox = ({ label, value, category, subLabel }: { label: string, value?: string, category: keyof typeof activeFilters, subLabel?: string }) => {
    const matchValue = value !== undefined ? value : label;
    const isChecked = activeFilters[category].some(item => item.toLowerCase() === matchValue.toLowerCase());
    
    return (
      <label className="flex items-start gap-3 cursor-pointer group">
        <div className={`mt-0.5 w-4 h-4 border flex items-center justify-center shrink-0 transition-colors ${isChecked ? 'bg-[#00BFFF] border-[#00BFFF]' : 'bg-[#FFFFFF] border-[#C0C0C0] group-hover:border-[#0A1F33]'}`}>
          {isChecked && <svg className="w-3 h-3 text-[#FFFFFF]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeLinejoin="miter" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>}
        </div>
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
      <Link href={adToShow.link} key={`injected-ad-${adToShow.id}`} className="col-span-full block w-full bg-[#3A3A3C] border-2 border-transparent hover:border-[#00BFFF] flex flex-col md:flex-row justify-between items-center p-8 relative transition-colors group overflow-hidden mb-2 mt-2 rounded-none">
        <span className="absolute top-4 right-4 bg-[#FFFFFF]/10 text-[#FFFFFF] text-[8px] uppercase font-bold px-3 py-1 tracking-widest border border-[#FFFFFF]/20 z-20">Patrocinado: {adToShow.sponsor}</span>
        <div className="flex flex-col text-left z-10">
          <p className="font-black text-4xl text-[#FFFFFF] uppercase leading-none mb-2" style={{ fontFamily: 'Montserrat, sans-serif' }}>{adToShow.headline} <span className="text-[#00BFFF]">{adToShow.highlight}</span></p>
          <p className="font-black text-2xl text-[#FFFFFF] mt-2 inline-block border-b-4 border-[#00BFFF] w-max pb-1" style={{ fontFamily: 'Montserrat, sans-serif' }}>{adToShow.price}</p>
        </div>
        <div className="mt-6 md:mt-0 flex justify-end z-10 relative h-32 w-full md:w-1/2">
          <img src={adToShow.img} alt={adToShow.sponsor} className="absolute right-0 bottom-0 max-h-full object-contain group-hover:scale-105 transition-transform origin-right" />
        </div>
      </Link>
    );
  };

  return (
    <>
      <header className="w-full border-b border-[#C0C0C0] bg-[#FFFFFF] pt-6 pb-6">
        <div className="max-w-[1400px] mx-auto px-4 lg:px-8">
          <p className="text-[10px] font-medium text-[#C0C0C0] mb-2 uppercase tracking-widest"><Link href="/" className="hover:text-[#3A3A3C] transition-colors">Inicio</Link> / <span className="font-bold text-[#3A3A3C]">Catálogo</span></p>
          <h1 className="font-black text-3xl md:text-4xl text-[#0A1F33]" style={{ fontFamily: 'Montserrat, sans-serif' }}>Catálogo de autos 0km</h1>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-4 lg:px-8 pt-8 flex flex-col md:flex-row gap-8 items-start mb-24" ref={topRef}>
        
        <aside className="w-full md:w-[260px] flex-shrink-0 md:sticky md:top-24 md:max-h-[calc(100vh-8rem)] md:overflow-y-auto custom-scrollbar shadow-none border border-[#C0C0C0]" style={{ fontFamily: 'Inter, sans-serif' }}>
          <div className="bg-[#FFFFFF]">
            <div className="p-4 border-b border-[#C0C0C0] flex justify-between items-center bg-[#F5F5F5] sticky top-0 z-10">
              <h2 className="font-bold text-[#0A1F33] text-sm uppercase tracking-wider">Parámetros</h2>
              <button onClick={clearFilters} className="text-[10px] text-[#D93025] hover:underline font-bold uppercase tracking-widest border-none outline-none">Restablecer</button>
            </div>
            
            <div className="p-5 border-b border-[#C0C0C0]">
              <h3 className="text-[10px] text-[#3A3A3C] mb-3 font-bold uppercase tracking-widest">Presupuesto (USD)</h3>
              <div className="flex flex-col gap-2">
                <input type="number" placeholder="Mínimo" className="w-full border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#0A1F33] bg-[#F8F9FA] rounded-none" value={priceRange.from} onChange={(e) => setPriceRange({...priceRange, from: e.target.value})} />
                <input type="number" placeholder="Máximo" className="w-full border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#0A1F33] bg-[#F8F9FA] rounded-none" value={priceRange.to} onChange={(e) => setPriceRange({...priceRange, to: e.target.value})} />
              </div>
            </div>
            
            <div className="p-5 border-b border-[#C0C0C0]">
              <h3 className="text-[10px] text-[#3A3A3C] mb-4 font-bold uppercase tracking-widest">Marca Automotriz</h3>
              <div className="flex flex-col gap-3">
                {marcasDisponibles.length > 0 ? marcasDisponibles.map(item => <div key={item} onClick={() => toggleFilter('marcas', item)}><FlatCheckbox label={item} category="marcas" /></div>) : <span className="text-[10px] text-[#C0C0C0] italic uppercase">Cargando...</span>}
              </div>
            </div>

            <div className="p-5 border-b border-[#C0C0C0]">
              <h3 className="text-[10px] text-[#3A3A3C] mb-4 font-bold uppercase tracking-widest">Tipo de Carrocería</h3>
              <div className="flex flex-col gap-3">
                {tiposDisponibles.map(item => (<div key={item} onClick={() => toggleFilter('tipos', item)}><FlatCheckbox label={item} category="tipos" /></div>))}
              </div>
            </div>

            <div className="p-5 border-b border-[#C0C0C0]">
              <h3 className="text-[10px] text-[#3A3A3C] mb-4 font-bold uppercase tracking-widest">Transmisión</h3>
              <div className="flex flex-col gap-3">
                {transmisionesOpciones.map(item => (<div key={item} onClick={() => toggleFilter('transmisiones', item)}><FlatCheckbox label={item} category="transmisiones" /></div>))}
              </div>
            </div>

            <div className="p-5 border-b border-[#C0C0C0]">
              <h3 className="text-[10px] text-[#3A3A3C] mb-4 font-bold uppercase tracking-widest">Motorización</h3>
              <div className="flex flex-col gap-3">
                {combustiblesDisponibles.map(item => (<div key={item} onClick={() => toggleFilter('combustibles', item)}><FlatCheckbox label={item} category="combustibles" subLabel={combustibleLabels[item.toUpperCase()]} /></div>))}
              </div>
            </div>

            <div className="p-5 border-b border-[#C0C0C0]">
              <h3 className="text-[10px] text-[#3A3A3C] mb-4 font-bold uppercase tracking-widest">Tracción</h3>
              <div className="flex flex-col gap-3">
                {traccionesOpciones.map(item => (<div key={item} onClick={() => toggleFilter('tracciones', item)}><FlatCheckbox label={item} category="tracciones" /></div>))}
              </div>
            </div>

            <div className="p-5 border-b border-[#C0C0C0]">
              <h3 className="text-[10px] text-[#3A3A3C] mb-4 font-bold uppercase tracking-widest">Capacidad</h3>
              <div className="flex flex-col gap-3">
                {plazasDisponibles.map(item => (<div key={item} onClick={() => toggleFilter('plazas', item)}><FlatCheckbox label={`${item} Plazas`} value={item} category="plazas" /></div>))}
              </div>
            </div>

            <div className="p-5 border-b border-[#C0C0C0]">
              <h3 className="text-[10px] text-[#3A3A3C] mb-4 font-bold uppercase tracking-widest">Origen de Marca</h3>
              <div className="flex flex-col gap-3">
                {origenesDisponibles.map(item => (<div key={item} onClick={() => toggleFilter('origenes', item)}><FlatCheckbox label={item} category="origenes" /></div>))}
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
                  <p className="text-sm font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
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

          <div className="flex flex-col sm:flex-row justify-between items-center mb-6 pb-4 border-b border-[#C0C0C0]">
            <span className="text-[11px] text-[#3A3A3C] uppercase tracking-widest">
              {isLoading ? 'Cargando catálogo...' : <><span className="font-bold text-[#0A1F33] text-sm">{autosFiltrados.length}</span> autos disponibles</>}
            </span>
            {!isLoading && totalPages > 1 && (
              <span className="text-[11px] text-[#C0C0C0] font-bold uppercase tracking-widest mt-2 sm:mt-0">
                Página {currentPage} de {totalPages}
              </span>
            )}
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

                    <div className="h-full bg-[#FFFFFF] border border-[#C0C0C0] flex flex-col hover:border-[#0A1F33] transition-colors group shadow-none rounded-none">
                      <Link href={`/catalogo/${auto.brandId}/${auto.id}`} className="block flex-grow cursor-pointer">
                        <div className="p-4 h-44 flex items-center justify-center bg-[#FFFFFF] group-hover:bg-[#F8F9FA] transition-colors border-b border-[#C0C0C0]/20 relative">
                          <img src={auto.img} alt={auto.name} className="w-full max-h-full object-contain group-hover:scale-[1.02] transition-transform duration-300" />
                        </div>
                        
                        <div className="p-5 flex flex-col">
                          <h3 className="text-[14px] text-[#3A3A3C] uppercase tracking-wide mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                            {auto.brand} <span className="font-black text-[#0A1F33]" style={{ fontFamily: 'Montserrat, sans-serif' }}>{auto.name}</span>
                          </h3>
                          <p className="text-[11px] font-bold text-[#C0C0C0] uppercase mb-2 truncate" title={auto.versionName || 'Versión Base'}>
                            {auto.versionName || 'Versión Base'}
                          </p>
                          <p className="text-[10px] text-[#3A3A3C] font-medium uppercase mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
                            {auto.tipo_carroceria} • {auto.transmision || 'Consultar'}
                          </p>
                          
                          <div className="mt-auto pt-4 border-t border-[#C0C0C0]/50 flex justify-between items-end">
                            <div className="flex flex-col">
                              <span className="text-[9px] text-[#C0C0C0] font-bold uppercase tracking-widest mb-0.5">Desde</span>
                              <span className="font-black text-[18px] text-[#0A1F33]" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                                US$ {auto.price.toLocaleString()}
                              </span>
                            </div>
                          </div>
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
    }
  ];

  return (
    <div className="w-full bg-[#FFFFFF] border-t border-[#C0C0C0]">
      
      {/* SECCIÓN NEWSLETTER B2C INYECTADA */}
      <div className="bg-[#0A1F33] border-b-4 border-[#00BFFF]">
        <div className="max-w-[1400px] mx-auto px-4 lg:px-8 py-16 flex flex-col md:flex-row justify-between items-center gap-12">
          <div className="md:w-1/2 text-center md:text-left">
            <h3 className="font-black text-3xl md:text-4xl text-[#FFFFFF] uppercase mb-4" style={{ fontFamily: 'Montserrat, sans-serif' }}>Suscribite a las oportunidades.</h3>
            <p className="text-sm text-[#C0C0C0] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>Sé el primero en enterarte de todas las oportunidades de 0km en tu e-mail.</p>
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
          <h2 className="text-3xl text-[#3A3A3C] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
            Preguntas <span className="font-black text-[#0A1F33]" style={{ fontFamily: 'Montserrat, sans-serif' }}>frecuentes</span>
          </h2>
        </div>
        
        <div className="md:w-2/3 w-full flex flex-col border-t border-[#C0C0C0]">
          {faqs.map((faq, index) => (
            <div key={index} className="border-b border-[#C0C0C0] py-6">
              <button 
                onClick={() => setOpenFaq(openFaq === index ? null : index)}
                className="w-full flex justify-between items-center text-left focus:outline-none group border-none bg-transparent"
              >
                <span className="font-bold text-sm text-[#0A1F33] group-hover:text-[#00BFFF] transition-colors pr-4" style={{ fontFamily: 'Inter, sans-serif' }}>{faq.q}</span>
                <span className="text-[#0A1F33] text-2xl font-light">{openFaq === index ? '−' : '+'}</span>
              </button>
              
              <div className={`overflow-hidden transition-all duration-300 ease-in-out ${openFaq === index ? 'max-h-40 opacity-100 mt-4' : 'max-h-0 opacity-0'}`}>
                <p className="text-sm text-[#3A3A3C] leading-relaxed font-medium pr-8" style={{ fontFamily: 'Inter, sans-serif' }}>{faq.a}</p>
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
        <nav className="w-full bg-[#FFFFFF] border-b border-[#C0C0C0] px-4 md:px-8 py-4 flex justify-between items-center sticky top-0 z-50 shadow-none">
          <div className="font-black text-2xl tracking-widest text-[#0A1F33] uppercase" style={{ fontFamily: 'Montserrat, sans-serif' }}><Link href="/">DATA<span className="font-light">CAR</span></Link></div>
          
          <div className="hidden lg:flex gap-6 font-bold text-[11px] uppercase items-center text-[#3A3A3C] tracking-wider h-full" style={{ fontFamily: 'Inter, sans-serif' }}>
            
            <Link href="/recomendador" className="hover:text-[#00BFFF] transition-colors">Recomendador</Link>
            
            <div className="group relative py-4 cursor-pointer">
              <span className="hover:text-[#00BFFF] transition-colors flex items-center gap-1">Herramientas ▼</span>
              <div className="absolute top-full left-1/2 -translate-x-1/2 bg-[#FFFFFF] border border-[#C0C0C0] shadow-none p-4 w-[250px] flex flex-col gap-2 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all z-50 rounded-none">
                <Link href="/comparador" className="p-3 text-[#3A3A3C] hover:bg-[#F8F9FA] hover:text-[#0A1F33] transition-colors rounded-none border border-transparent">Comparador de Versiones</Link>
                <Link href="/calculadora" className="p-3 text-[#3A3A3C] hover:bg-[#F8F9FA] hover:text-[#0A1F33] transition-colors rounded-none border border-transparent">Calculadora de Cuotas</Link>
              </div>
            </div>

            <Link href="/negociamos-por-vos" className="hover:text-[#00BFFF] transition-colors">Negociamos por vos</Link>
            <a href="#" className="text-[#0A1F33] border-b-2 border-[#0A1F33] pb-1">Catálogo</a>
          </div>
        </nav>
        
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