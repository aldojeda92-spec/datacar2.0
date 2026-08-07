// app/page.tsx
'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { getCachedBrands, getCachedModels, getCachedCampaigns } from '../lib/catalogCache';
// CORRECCIÓN BUGS DE RUTA: Apuntamos al directorio actual porque components está dentro de app/
import NewsletterForm from './components/NewsletterForm';
import { isOptimizableImageSrc, isValidImageSrc } from '../lib/imageSrc';

// ==========================================
// INTERFACES B2B 
// ==========================================
interface AutoModel {
  id: string; brandId: string; brand: string; name: string; category: string; price: number; img: string; isPopular?: boolean;
}
interface SearchItem { id: string; type: 'Marca' | 'Modelo'; title: string; subtitle?: string; brandId?: string; modelId?: string; }
interface BrandItem { id: string; name: string; logoUrl?: string; }
interface AdCampaign { id: string; sponsor: string; headline: string; highlight: string; price: string; link: string; img: string; location: string; startDate: string; endDate: string; isActive: boolean; }

// ==========================================
// COMPONENTE FOOTER (AHORA MODULARIZADO)
// ==========================================
const Footer = () => {
  return (
    <footer className="w-full bg-[#0A1F33] border-t-4 border-[#00BFFF] text-[#FFFFFF]" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="border-b border-[#FFFFFF]/10">
        <div className="max-w-[1400px] mx-auto px-4 lg:px-8 py-16 flex flex-col md:flex-row items-center justify-between gap-10">
          <div className="md:w-1/2">
            <span className="text-[10px] font-bold text-[#00BFFF] uppercase tracking-widest mb-2 block">Inteligencia de Mercado</span>
            <h3 className="font-black text-3xl text-[#FFFFFF] uppercase leading-tight mb-3" style={{ fontFamily: 'Montserrat, sans-serif' }}>Auditorías y precios 0KM <br className="hidden md:block" /> directo a tu correo.</h3>
            <p className="text-sm text-[#C0C0C0] max-w-md leading-relaxed">Sé el primero en acceder a fluctuaciones de precios, análisis de nuevas versiones y reportes de rentabilidad automotriz.</p>
          </div>
          <div className="md:w-1/2 w-full max-w-lg">
            {/* INYECCIÓN DEL FORMULARIO INTELIGENTE B2C */}
            <NewsletterForm />
          </div>
        </div>
      </div>
      <div className="max-w-[1400px] mx-auto px-4 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          <div className="md:col-span-1">
            <div className="font-black text-3xl tracking-widest text-[#FFFFFF] uppercase mb-4" style={{ fontFamily: 'Montserrat, sans-serif' }}>DATA<span className="font-light text-[#C0C0C0]">CAR</span></div>
            <p className="text-[11px] text-[#C0C0C0] leading-relaxed mb-6">Plataforma analítica y transaccional para la adquisición inteligente de vehículos 0KM en Paraguay.</p>
            <div className="flex flex-col gap-3 text-[10px] font-bold uppercase tracking-widest text-[#00BFFF]">
              <a href="https://instagram.com/datacarpy" target="_blank" rel="noopener noreferrer" className="hover:text-[#FFFFFF] transition-colors flex items-center gap-2 border border-[#00BFFF]/30 hover:border-[#FFFFFF] p-2 w-max">
                Instagram: @datacarpy
              </a>
              <a href="https://tiktok.com/@datacar.paraguay" target="_blank" rel="noopener noreferrer" className="hover:text-[#FFFFFF] transition-colors flex items-center gap-2 border border-[#00BFFF]/30 hover:border-[#FFFFFF] p-2 w-max">
                TikTok: @datacar.paraguay
              </a>
            </div>
          </div>
          <div className="md:col-span-1">
            <h4 className="text-[10px] font-bold text-[#C0C0C0] uppercase tracking-widest mb-6 border-b border-[#FFFFFF]/10 pb-2">Plataforma</h4>
            <ul className="flex flex-col gap-4 text-xs font-medium text-[#FFFFFF]">
              <li><Link href="/catalogo" className="hover:text-[#00BFFF] transition-colors">Catálogo de Vehículos</Link></li>
              <li><Link href="/recomendador" className="hover:text-[#00BFFF] transition-colors">Recomendador Interactivo</Link></li>
              <li><Link href="/comparador" className="hover:text-[#00BFFF] transition-colors">Comparador de Versiones</Link></li>
              <li><Link href="/negociamos-por-vos" className="hover:text-[#00BFFF] transition-colors">Servicio: Negociamos por vos</Link></li>
              <li><Link href="/concesionarias" className="hover:text-[#00BFFF] transition-colors">Portal de Concesionarias (B2B)</Link></li>
            </ul>
          </div>
          <div className="md:col-span-1">
            <h4 className="text-[10px] font-bold text-[#C0C0C0] uppercase tracking-widest mb-6 border-b border-[#FFFFFF]/10 pb-2">Vehículos</h4>
            <ul className="flex flex-col gap-4 text-xs font-medium text-[#FFFFFF]">
              <li><Link href="/catalogo?tipo=SUV" className="hover:text-[#00BFFF] transition-colors">Explorar SUVs</Link></li>
              <li><Link href="/catalogo?tipo=PICKUP" className="hover:text-[#00BFFF] transition-colors">Explorar Pick-ups</Link></li>
              <li><Link href="/catalogo?combustible=EV" className="hover:text-[#00BFFF] transition-colors">Movilidad Eléctrica</Link></li>
              <li><Link href="/catalogo?tipo=SEDAN" className="hover:text-[#00BFFF] transition-colors">Sedanes Corporativos</Link></li>
            </ul>
          </div>
          <div className="md:col-span-1">
            <h4 className="text-[10px] font-bold text-[#C0C0C0] uppercase tracking-widest mb-6 border-b border-[#FFFFFF]/10 pb-2">Soporte</h4>
            <ul className="flex flex-col gap-4 text-xs font-medium text-[#FFFFFF]">
              <li><Link href="/faq" className="font-bold text-[#00BFFF] hover:text-[#FFFFFF] transition-colors flex items-center gap-2">Preguntas Frecuentes</Link></li>
              <li><a href="/terminos-y-condiciones" className="hover:text-[#00BFFF] transition-colors">Términos y Condiciones</a></li>
              <li><a href="/politica-de-privacidad" className="hover:text-[#00BFFF] transition-colors">Política de Privacidad</a></li>
              <li><a href="mailto:contacto@datacarpy.com" className="hover:text-[#00BFFF] transition-colors">contacto@datacarpy.com</a></li>
            </ul>
          </div>
        </div>
        <div className="pt-8 border-t border-[#FFFFFF]/10 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] text-[#C0C0C0]">
          <p>Los vehículos están sujetos a disponibilidad y verificación de stock físico. Los precios son referenciales y no incluyen gastos de patentamiento ni flete.</p>
          <p className="font-bold uppercase tracking-widest shrink-0">© {new Date().getFullYear()} DATACAR PARAGUAY.</p>
        </div>
      </div>
    </footer>
  );
};

// ==========================================
// HOME PAGE - ESTRUCTURA PRINCIPAL
// ==========================================
export default function HomeClient() {
  const [autos, setAutos] = useState<AutoModel[]>([]);
  const [marcas, setMarcas] = useState<BrandItem[]>([]);
  const [searchIndex, setSearchIndex] = useState<SearchItem[]>([]);
  const [tiposDisponibles, setTiposDisponibles] = useState<string[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);

  // 1. Buscador
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<SearchItem[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  // 2. Banner Publicitario
  const [activeAd, setActiveAd] = useState<AdCampaign | null>(null);

  // Estados de Mega-Menús (Navbar)
  const [activeMegaMenu, setActiveMegaMenu] = useState<'marcas' | 'tipos' | 'herramientas' | null>(null);
  const megaMenuTimeout = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = (menu: 'marcas' | 'tipos' | 'herramientas') => {
    if (megaMenuTimeout.current) clearTimeout(megaMenuTimeout.current);
    setActiveMegaMenu(menu);
  };

  const handleMouseLeave = () => {
    megaMenuTimeout.current = setTimeout(() => {
      setActiveMegaMenu(null);
    }, 150);
  };

  // Soporte de teclado para los mega-menús: se abren al enfocar el trigger y se
  // cierran cuando el foco sale por completo del contenedor (Tab hacia afuera) o
  // con Escape, sin tocar el comportamiento existente de mouse.
  const handleMegaMenuBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setActiveMegaMenu(null);
    }
  };

  const handleMegaMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      setActiveMegaMenu(null);
      (e.currentTarget.querySelector('button') as HTMLButtonElement | null)?.focus();
    }
  };

  // 7. Filtros de Presupuesto (Dinámicos y Armónicos)
  const priceTabs = useMemo(() => [
    { id: 1, label: 'Hasta USD 15.000', filter: (p: number) => p > 0 && p <= 15000 },
    { id: 2, label: 'USD 15.000 a USD 20.000', filter: (p: number) => p > 15000 && p <= 20000 },
    { id: 3, label: 'USD 20.000 a USD 30.000', filter: (p: number) => p > 20000 && p <= 30000 },
    { id: 4, label: 'Más de USD 30.000', filter: (p: number) => p > 30000 }
  ], []);
  
  const [activePriceTab, setActivePriceTab] = useState<number | null>(null);

  useEffect(() => {
    const fetchEcosistema = async () => {
      setIsLoading(true);
      try {
        const [brandsData, modelsData, campaignsData] = await Promise.all([
          getCachedBrands(),
          getCachedModels(),
          getCachedCampaigns(),
        ]);

        const brandsMap: Record<string, string> = {};
        const tempMarcas: BrandItem[] = [];
        const tempSearchIndex: SearchItem[] = [];
        const tempTipos = new Set<string>();

        brandsData.forEach((brandData) => {
          const brandName = brandData.name;
          brandsMap[brandData.id] = brandName;
          tempMarcas.push({ id: brandData.id, name: brandName, logoUrl: brandData.logoUrl });
          tempSearchIndex.push({ id: `b_${brandData.id}`, type: 'Marca', title: brandName });
        });

        const fetchedAutos: AutoModel[] = modelsData.map((data) => {
          const brandName = brandsMap[data.brandId] || 'MARCA';
          const rawCategory = data.tipo_carroceria || 'Vehículo';
          const cleanCategory = rawCategory.trim().toUpperCase();
          tempTipos.add(cleanCategory);

          tempSearchIndex.push({ id: `m_${data.id}`, type: 'Modelo', title: `${brandName} ${data.name}`, subtitle: cleanCategory, brandId: data.brandId, modelId: data.id });
          return {
            id: data.id,
            brandId: data.brandId,
            brand: brandName,
            name: data.name,
            category: cleanCategory,
            price: Number(data.startingPrice) || 0,
            img: isValidImageSrc(data.imgUrl) ? data.imgUrl : 'https://via.placeholder.com/400x200?text=Auto',
            isPopular: data.isPopular || false
          };
        });

        setMarcas(tempMarcas.sort((a, b) => a.name.localeCompare(b.name)));
        setAutos(fetchedAutos);
        setSearchIndex(tempSearchIndex);
        setTiposDisponibles(Array.from(tempTipos).sort());

        // Carga de Pauta (Home)
        const today = new Date().toISOString().split('T')[0];
        const validCampaign = (campaignsData as AdCampaign[]).find(c =>
          c.isActive === true &&
          (c.location === 'home' || c.location === 'ambos') &&
          c.startDate <= today && c.endDate >= today
        );
        if (validCampaign) setActiveAd(validCampaign);

      } catch (error) {
        console.error("Error Firebase:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchEcosistema();
  }, []);

  // Lógica Predictiva
  useEffect(() => {
    if (searchTerm.length >= 2) {
      const results = searchIndex.filter(item => item.title.toLowerCase().includes(searchTerm.toLowerCase()));
      setSearchResults(results.slice(0, 8)); 
      setIsDropdownOpen(true);
    } else {
      setSearchResults([]);
      setIsDropdownOpen(false);
    }
  }, [searchTerm, searchIndex]);

  // Selección inteligente de "Lo más buscado"
  const autosMasBuscados = useMemo(() => {
    const featured = autos.filter(a => a.isPopular);
    return featured.length > 0 ? featured.slice(0, 6) : autos.slice(0, 6);
  }, [autos]);
  
  // Calcula la cantidad de autos por pestaña y determina cuáles mostrar
  const validPriceTabs = useMemo(() => {
    const tabsWithCounts = priceTabs.map(tab => ({
      ...tab,
      count: autos.filter(a => tab.filter(a.price)).length
    }));
    return tabsWithCounts.filter(tab => tab.count > 0);
  }, [autos, priceTabs]);

  // Inicializa la primera pestaña válida
  useEffect(() => {
    if (validPriceTabs.length > 0 && activePriceTab === null) {
      setActivePriceTab(validPriceTabs[0].id);
    }
  }, [validPriceTabs, activePriceTab]);
  
  const autosFiltradosPorPrecio = useMemo(() => {
    if (!activePriceTab) return [];
    const currentTab = priceTabs.find(t => t.id === activePriceTab);
    if (!currentTab) return [];
    return autos.filter(auto => currentTab.filter(auto.price)).slice(0, 5);
  }, [autos, activePriceTab, priceTabs]);

  return (
    <main className="min-h-screen bg-[#F8F9FA] text-[#3A3A3C] font-sans flex flex-col relative">
      
      {/* ==========================================
          NAVBAR CORPORATIVO CON MEGA-MENÚS (FLAT)
          ========================================== */}
      <nav className="w-full bg-[#FFFFFF] border-b border-[#C0C0C0] px-4 md:px-8 py-4 flex justify-between items-center sticky top-0 z-50">
        <div className="font-black text-2xl tracking-widest text-[#0A1F33] uppercase" style={{ fontFamily: 'Montserrat, sans-serif' }}><Link href="/">DATA<span className="font-light">CAR</span></Link></div>
        
        <div className="hidden lg:flex gap-6 font-bold text-[11px] uppercase items-center text-[#3A3A3C] tracking-wider h-full" style={{ fontFamily: 'Inter, sans-serif' }}>
          
          {/* Menú: Por Tipo */}
          <div className="relative py-4" onMouseEnter={() => handleMouseEnter('tipos')} onMouseLeave={handleMouseLeave} onBlur={handleMegaMenuBlur} onKeyDown={handleMegaMenuKeyDown}>
            <button onFocus={() => handleMouseEnter('tipos')} aria-expanded={activeMegaMenu === 'tipos'} aria-haspopup="true" className={`hover:text-[#00BFFF] transition-colors flex items-center gap-1 ${activeMegaMenu === 'tipos' ? 'text-[#00BFFF]' : ''}`}>
              Por Tipo <svg className={`w-3 h-3 transition-transform ${activeMegaMenu === 'tipos' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </button>
            {activeMegaMenu === 'tipos' && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 bg-[#FFFFFF] border-2 border-[#0A1F33] border-t-4 border-t-[#00BFFF] p-6 w-[400px] grid grid-cols-2 gap-y-4 gap-x-8">
                {tiposDisponibles.map(tipo => (
                  <Link key={tipo} href={`/catalogo?tipo=${encodeURIComponent(tipo)}`} className="text-[#3A3A3C] hover:text-[#0A1F33] hover:font-black hover:pl-2 transition-all block truncate border-b border-transparent hover:border-[#00BFFF]">
                    {tipo}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Menú: Por Marca */}
          <div className="relative py-4" onMouseEnter={() => handleMouseEnter('marcas')} onMouseLeave={handleMouseLeave} onBlur={handleMegaMenuBlur} onKeyDown={handleMegaMenuKeyDown}>
            <button onFocus={() => handleMouseEnter('marcas')} aria-expanded={activeMegaMenu === 'marcas'} aria-haspopup="true" className={`hover:text-[#00BFFF] transition-colors flex items-center gap-1 ${activeMegaMenu === 'marcas' ? 'text-[#00BFFF]' : ''}`}>
              Por Marca <svg className={`w-3 h-3 transition-transform ${activeMegaMenu === 'marcas' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </button>
            {activeMegaMenu === 'marcas' && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 bg-[#FFFFFF] border-2 border-[#0A1F33] border-t-4 border-t-[#00BFFF] p-8 w-[600px] grid grid-cols-3 gap-y-4 gap-x-6">
                {marcas.map(marca => (
                  <Link key={marca.id} href={`/catalogo?marca=${encodeURIComponent(marca.name)}`} className="text-[#3A3A3C] hover:text-[#0A1F33] hover:font-black hover:pl-2 transition-all block truncate text-[10px] border-b border-transparent hover:border-[#00BFFF]">
                    {marca.name}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Menú: Herramientas */}
          <div className="relative py-4" onMouseEnter={() => handleMouseEnter('herramientas')} onMouseLeave={handleMouseLeave} onBlur={handleMegaMenuBlur} onKeyDown={handleMegaMenuKeyDown}>
            <button onFocus={() => handleMouseEnter('herramientas')} aria-expanded={activeMegaMenu === 'herramientas'} aria-haspopup="true" className={`hover:text-[#00BFFF] transition-colors flex items-center gap-1 ${activeMegaMenu === 'herramientas' ? 'text-[#00BFFF]' : ''}`}>
              Herramientas <svg className={`w-3 h-3 transition-transform ${activeMegaMenu === 'herramientas' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </button>
            {activeMegaMenu === 'herramientas' && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 bg-[#FFFFFF] border-2 border-[#0A1F33] border-t-4 border-t-[#00BFFF] p-4 w-[250px] flex flex-col gap-2">
                <Link href="/comparador" className="p-3 text-[#3A3A3C] hover:bg-[#F8F9FA] hover:text-[#0A1F33] transition-colors border border-transparent hover:border-[#C0C0C0]">Comparador de Versiones</Link>
                <Link href="/calculadora" className="p-3 text-[#3A3A3C] hover:bg-[#F8F9FA] hover:text-[#0A1F33] transition-colors border border-transparent hover:border-[#C0C0C0]">Calculadora de Cuotas</Link>
                <Link href="/recomendador" className="p-3 text-[#00BFFF] font-black hover:bg-[#F5FBFF] transition-colors border border-transparent hover:border-[#00BFFF]/30">Recomendador Interactivo</Link>
              </div>
            )}
          </div>

          <Link href="/negociamos-por-vos" className="text-[#0A1F33] hover:text-[#00BFFF] transition-colors">Negociamos por vos</Link>
        </div>
        <Link href="/catalogo" className="bg-[#FFFFFF] border border-[#0A1F33] text-[#0A1F33] font-bold text-[11px] uppercase tracking-widest py-3 px-8 hover:bg-[#0A1F33] hover:text-[#FFFFFF] transition-colors">Catálogo</Link>
      </nav>

      {/* ==========================================
          2.1 BUSCADOR Y FILTROS RÁPIDOS
          ========================================== */}
      <section className="w-full bg-[#0A1F33] pt-20 pb-16 px-4 flex flex-col items-center relative z-40 border-b-4 border-[#00BFFF]">
        <div className="text-center mb-10">
          <span className="bg-[#FFFFFF]/10 text-[#00BFFF] border border-[#00BFFF]/30 font-bold tracking-widest uppercase px-4 py-1 text-[10px] mb-6 inline-block">Antes de comprar, compará</span>
          <h1 className="font-black text-4xl md:text-5xl lg:text-6xl text-[#FFFFFF] uppercase leading-tight" style={{ fontFamily: 'Montserrat, sans-serif' }}>
            Visitá todas las concesionarias<br/><span className="text-[#00BFFF]">en un solo lugar.</span>
          </h1>
        </div>

        <div className="w-full max-w-4xl relative mb-6">
          <div className="flex bg-[#FFFFFF] border-2 border-transparent focus-within:border-[#00BFFF] transition-colors overflow-hidden">
            <div className="pl-6 flex items-center text-[#C0C0C0]"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg></div>
            <input
              type="text"
              role="combobox"
              aria-expanded={isDropdownOpen}
              aria-controls="home-search-listbox"
              aria-autocomplete="list"
              aria-label="Buscar marca, modelo o versión"
              placeholder="Buscá por marca, modelo o versión exacta..."
              className="flex-1 py-5 px-4 text-sm md:text-base font-medium text-[#3A3A3C] focus:outline-none placeholder:text-[#C0C0C0]"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => searchTerm.length >= 2 && setIsDropdownOpen(true)}
            />
          </div>
          
          {isDropdownOpen && (
            <div className="absolute top-full left-0 w-full bg-[#FFFFFF] border-2 border-t-0 border-[#00BFFF] max-h-80 overflow-y-auto z-50 mt-0">
              <ul id="home-search-listbox" role="listbox" className="flex flex-col">
                {searchResults.length > 0 ? searchResults.map((item) => {
                    const dynamicUrl = item.type === 'Modelo' && item.brandId && item.modelId
                      ? `/catalogo/${item.brandId}/${item.modelId}`
                      : `/catalogo?marca=${encodeURIComponent(item.title)}`;
                    return (
                      <li key={item.id} role="option" aria-selected="false" className="border-b border-[#C0C0C0]/40 last:border-0 hover:bg-[#F8F9FA] transition-colors">
                        <Link href={dynamicUrl} className="flex justify-between items-center px-6 py-4">
                          <div className="flex flex-col"><span className="font-bold text-sm text-[#0A1F33] uppercase">{item.title}</span>{item.subtitle && <span className="text-[10px] text-[#3A3A3C] font-medium uppercase mt-1">{item.subtitle}</span>}</div>
                          <span className={`text-[9px] font-bold uppercase tracking-widest px-3 py-1 border ${item.type === 'Marca' ? 'border-[#00BFFF] text-[#00BFFF]' : 'border-[#3A3A3C] text-[#3A3A3C]'}`}>{item.type}</span>
                        </Link>
                      </li>
                    )
                  }) : <li className="px-6 py-4 text-sm text-[#3A3A3C] text-center font-bold uppercase tracking-widest">No encontramos vehículos</li>}
              </ul>
            </div>
          )}
        </div>

        {/* Filtros Rápidos */}
        <div className="flex flex-wrap justify-center gap-3 px-2 mt-4 max-w-5xl" style={{ fontFamily: 'Inter, sans-serif' }}>
          <Link href="/catalogo?tipo=SUV" className="bg-[#FFFFFF] px-5 py-3 text-[11px] font-bold text-[#3A3A3C] hover:text-[#0A1F33] transition-colors flex items-center gap-2 border border-[#C0C0C0] hover:border-[#0A1F33]">
            <svg className="w-4 h-4 text-[#C0C0C0]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeWidth="2" d="M8 7h8l2 4v7a1 1 0 01-1 1H7a1 1 0 01-1-1v-7l2-4z"></path></svg> SUVs
          </Link>
          <Link href="/catalogo?tipo=SEDAN" className="bg-[#FFFFFF] px-5 py-3 text-[11px] font-bold text-[#3A3A3C] hover:text-[#0A1F33] transition-colors flex items-center gap-2 border border-[#C0C0C0] hover:border-[#0A1F33]">
            <svg className="w-4 h-4 text-[#C0C0C0]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeWidth="2" d="M5 13l4-4h6l4 4m-14 0v4a1 1 0 001 1h12a1 1 0 001-1v-4M5 13h14"></path></svg> Sedanes
          </Link>
          <Link href="/catalogo?tipo=PICKUP" className="bg-[#FFFFFF] px-5 py-3 text-[11px] font-bold text-[#3A3A3C] hover:text-[#0A1F33] transition-colors flex items-center gap-2 border border-[#C0C0C0] hover:border-[#0A1F33]">
            <svg className="w-4 h-4 text-[#C0C0C0]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeWidth="2" d="M3 10h12m-6 4h12M3 14v4a1 1 0 001 1h16a1 1 0 001-1v-4M5 10l2-4h10l2 4"></path></svg> Pick-ups
          </Link>
          <Link href="/catalogo?combustible=EV" className="bg-[#FFFFFF] px-5 py-3 text-[11px] font-bold text-[#3A3A3C] hover:text-[#0A1F33] transition-colors flex items-center gap-2 border border-[#C0C0C0] hover:border-[#0A1F33]">
            <svg className="w-4 h-4 text-[#1E8E3E]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> Movilidad Eléctrica
          </Link>
          <Link href="/negociamos-por-vos" className="bg-[#E6F4EA] px-5 py-3 text-[11px] font-bold text-[#1E8E3E] hover:bg-[#1E8E3E] hover:text-[#FFFFFF] transition-colors flex items-center gap-2 border border-[#1E8E3E]/30 hover:border-[#1E8E3E]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg> Delegar Negociación
          </Link>
          <Link href="/recomendador" className="bg-[#F5FBFF] px-5 py-3 text-[11px] font-bold text-[#00BFFF] hover:bg-[#00BFFF] hover:text-[#FFFFFF] transition-colors flex items-center gap-2 border border-[#00BFFF]/30 hover:border-[#00BFFF]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg> Usar Recomendador
          </Link>
        </div>
      </section>

      {/* ==========================================
          2.2 BANNER PUBLICITARIO
          ========================================== */}
      {activeAd && (
        <section className="max-w-[1400px] mx-auto px-4 md:px-8 mt-12 mb-4 w-full">
            <Link href={activeAd.link} className="block w-full bg-[#3A3A3C] border-2 border-[#3A3A3C] flex flex-col md:flex-row justify-between items-center p-10 relative hover:border-[#00BFFF] transition-colors group overflow-hidden">
              <span className="absolute top-4 right-4 bg-[#FFFFFF]/10 text-[#FFFFFF] text-[8px] uppercase font-bold px-3 py-1 tracking-widest border border-[#FFFFFF]/20 z-20">Auspicio Oficial: {activeAd.sponsor}</span>
              <div className="flex flex-col text-left md:w-1/2 z-10">
                <p className="font-black text-5xl md:text-6xl text-[#FFFFFF] uppercase leading-none mb-2" style={{ fontFamily: 'Montserrat, sans-serif' }}>{activeAd.headline} <span className="text-[#00BFFF]">{activeAd.highlight}</span></p>
                <p className="font-black text-3xl md:text-4xl text-[#FFFFFF] mt-2 inline-block border-b-4 border-[#00BFFF] w-max pb-1" style={{ fontFamily: 'Montserrat, sans-serif' }}>{activeAd.price}</p>
              </div>
              <div className="md:w-1/2 mt-6 md:mt-0 flex justify-end z-10 w-full relative h-48 md:h-64">
                {isValidImageSrc(activeAd.img) && (
                  <Image
                    src={activeAd.img}
                    alt={activeAd.sponsor}
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    className="object-contain group-hover:scale-105 transition-transform origin-right"
                    style={{ objectPosition: 'right bottom' }}
                    unoptimized={!isOptimizableImageSrc(activeAd.img)}
                  />
                )}
              </div>
            </Link>
        </section>
      )}

      {/* ==========================================
          2.3 LO MÁS BUSCADO
          ========================================== */}
      <section className="max-w-[1400px] mx-auto px-4 lg:px-8 mt-10 mb-12">
        <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4 mb-8 border-b border-[#C0C0C0] pb-4">
          <h2 className="font-black text-3xl text-[#0A1F33] uppercase" style={{ fontFamily: 'Montserrat, sans-serif' }}>Lo más <span className="text-[#3A3A3C]">buscado</span></h2>
          <Link href="/catalogo" className="text-[11px] font-bold text-[#00BFFF] hover:underline uppercase tracking-widest transition-colors mb-1 sm:mb-0" style={{ fontFamily: 'Inter, sans-serif' }}>Ver catálogo completo →</Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {isLoading ? <div className="col-span-full py-10 text-center font-bold text-[#C0C0C0] uppercase tracking-widest text-[10px]">Cargando inventario...</div> : autosMasBuscados.length > 0 ? autosMasBuscados.map((auto) => (
            <Link href={`/catalogo/${auto.brandId}/${auto.id}`} key={`pop_${auto.id}`} className="block">
              <div className="h-full bg-[#FFFFFF] border border-[#C0C0C0] flex flex-col hover:border-[#0A1F33] transition-colors group">
                <div className="relative p-4 flex-grow h-28 bg-[#FFFFFF] group-hover:bg-[#F8F9FA] transition-colors border-b border-[#C0C0C0]/30">
                  <Image
                    src={auto.img}
                    alt={auto.name}
                    fill
                    sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 16vw"
                    className="object-contain p-4 group-hover:scale-105 transition-transform"
                    unoptimized={!isOptimizableImageSrc(auto.img)}
                  />
                </div>
                <div className="p-4 flex flex-col">
                  <p className="text-[9px] font-bold text-[#C0C0C0] uppercase tracking-widest mb-1 truncate">{auto.brand}</p>
                  <h3 className="font-black text-[13px] text-[#0A1F33] uppercase leading-tight mb-1 h-8 line-clamp-2" style={{ fontFamily: 'Montserrat, sans-serif' }}>{auto.name}</h3>
                  <div className="mt-2 pt-2 border-t border-[#C0C0C0]/50"><p className="font-black text-[11px] text-[#0A1F33]" style={{ fontFamily: 'Montserrat, sans-serif' }}>US$ {auto.price.toLocaleString()}</p></div>
                </div>
              </div>
            </Link>
          )) : <div className="col-span-full py-10 text-center font-bold text-[#C0C0C0] uppercase tracking-widest text-[10px]">Base de datos sincronizando...</div>}
        </div>
      </section>

      {/* ==========================================
          2.4 NEGOCIAMOS POR VOS
          ========================================== */}
      <section className="max-w-[1400px] mx-auto px-4 lg:px-8 my-16">
        <div className="bg-[#0A1F33] border border-[#0A1F33] w-full p-10 md:p-14 flex flex-col md:flex-row items-center justify-between relative">
          <div className="absolute top-0 left-0 w-2 h-full bg-[#00BFFF]"></div>
          <div className="md:w-1/2 z-10 mb-8 md:mb-0 pr-8">
            <span className="border border-[#00BFFF] text-[#00BFFF] text-[9px] font-bold uppercase px-3 py-1 tracking-widest mb-4 inline-block bg-[#FFFFFF]/5">Nuevo Servicio</span>
            <h2 className="font-black text-5xl lg:text-6xl text-[#FFFFFF] uppercase leading-none mb-6" style={{ fontFamily: 'Montserrat, sans-serif' }}>Negociamos <br/><span className="text-[#C0C0C0]">por vos.</span></h2>
            <p className="text-[#C0C0C0] text-sm max-w-md mb-8 leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>El mercado vende autos todos los días. Vos comprás uno cada 5 años. Ponemos nuestra experiencia técnica y financiera a tu favor.</p>
            <Link href="/negociamos-por-vos" className="bg-[#00BFFF] hover:bg-[#FFFFFF] text-[#0A1F33] font-bold text-xs uppercase tracking-widest py-4 px-10 transition-colors inline-block">Consultar Asesoría →</Link>
          </div>
          <div className="md:w-1/2 flex justify-end w-full z-10">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 w-full max-w-lg text-center">
              <div className="border border-[#FFFFFF]/20 p-6 bg-[#FFFFFF]/5 hover:bg-[#FFFFFF]/10 transition-colors"><p className="font-black text-3xl text-[#00BFFF] mb-2" style={{ fontFamily: 'Montserrat, sans-serif' }}>$3,5M</p><p className="text-[9px] text-[#C0C0C0] uppercase font-bold tracking-widest">Ahorro Promedio</p></div>
              <div className="border border-[#FFFFFF]/20 p-6 bg-[#FFFFFF]/5 hover:bg-[#FFFFFF]/10 transition-colors"><p className="font-black text-3xl text-[#00BFFF] mb-2" style={{ fontFamily: 'Montserrat, sans-serif' }}>35x</p><p className="text-[9px] text-[#C0C0C0] uppercase font-bold tracking-widest">Retorno del Servicio</p></div>
              <div className="border border-[#FFFFFF]/20 p-6 bg-[#FFFFFF]/5 col-span-2 lg:col-span-1 hover:bg-[#FFFFFF]/10 transition-colors"><p className="font-black text-3xl text-[#00BFFF] mb-2" style={{ fontFamily: 'Montserrat, sans-serif' }}>700+</p><p className="text-[9px] text-[#C0C0C0] uppercase font-bold tracking-widest">Autos Gestionados</p></div>
            </div>
          </div>
        </div>
      </section>

      {/* ==========================================
          2.5 BUSCAR POR MARCA
          ========================================== */}
      <section id="marcas-section" className="max-w-[1400px] mx-auto px-4 lg:px-8 my-16">
        <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4 mb-8 border-b border-[#C0C0C0] pb-4">
          <h2 className="font-black text-3xl text-[#0A1F33] uppercase" style={{ fontFamily: 'Montserrat, sans-serif' }}>Buscá por <span className="text-[#3A3A3C]">marca</span></h2>
          <Link href="/catalogo" className="text-[11px] font-bold text-[#00BFFF] hover:underline uppercase tracking-widest transition-colors mb-1 sm:mb-0">Ver todas las marcas →</Link>
        </div>
        <div className="flex flex-wrap gap-4 justify-center">
          {isLoading ? <p className="text-[10px] uppercase text-[#C0C0C0] font-bold tracking-widest">Escaneando mercado...</p> : marcas.length > 0 ? marcas.slice(0, 10).map((marca) => (
            <Link href={`/catalogo?marca=${encodeURIComponent(marca.name)}`} key={marca.id} className="w-28 h-28 bg-[#FFFFFF] border border-[#C0C0C0] flex flex-col justify-center items-center hover:border-[#0A1F33] transition-colors group">
               {isValidImageSrc(marca.logoUrl) ? (
                 <div className="relative w-12 h-12 mb-3 opacity-80 group-hover:opacity-100 transition-opacity">
                   <Image
                     src={marca.logoUrl}
                     alt={marca.name}
                     fill
                     sizes="48px"
                     className="object-contain"
                     unoptimized={!isOptimizableImageSrc(marca.logoUrl)}
                   />
                 </div>
               ) : (
                 <div className="w-12 h-12 bg-[#F5F5F5] mb-3 flex justify-center items-center group-hover:bg-[#0A1F33] transition-colors text-[10px] text-[#C0C0C0] group-hover:text-[#FFFFFF] uppercase font-bold">{marca.name.substring(0,2)}</div>
               )}
               <span className="text-[9px] font-bold text-[#3A3A3C] uppercase tracking-widest truncate max-w-[90%]">{marca.name}</span>
            </Link>
          )) : <p className="text-[10px] uppercase text-[#C0C0C0] font-bold tracking-widest">Sin marcas registradas</p>}
          
          {marcas.length > 10 && (
             <Link href="/catalogo" className="w-28 h-28 bg-[#F8F9FA] border border-dashed border-[#C0C0C0] flex flex-col justify-center items-center hover:border-[#00BFFF] transition-colors group">
                <span className="text-2xl text-[#C0C0C0] group-hover:text-[#00BFFF] mb-2">+</span>
                <span className="text-[9px] font-bold text-[#C0C0C0] group-hover:text-[#00BFFF] uppercase tracking-widest text-center px-2">Ver Todas</span>
             </Link>
          )}
        </div>
      </section>

      {/* ==========================================
          2.6 CÓMO FUNCIONA DATACAR
          ========================================== */}
      <section className="bg-[#0A1F33] border-y border-[#0A1F33] py-20 my-16">
        <div className="max-w-[1400px] mx-auto px-4 lg:px-8 flex flex-col lg:flex-row gap-12 items-center">
          <div className="lg:w-1/3 border-b lg:border-b-0 lg:border-r border-[#FFFFFF]/20 pb-8 lg:pb-0 lg:pr-8 text-center lg:text-left">
            <h2 className="font-black text-3xl md:text-4xl text-[#FFFFFF] uppercase leading-tight mb-4" style={{ fontFamily: 'Montserrat, sans-serif' }}>¿Cómo funciona <br/><span className="text-[#00BFFF]">DataCar?</span></h2>
            <Link href="/catalogo" className="bg-[#FFFFFF]/10 text-[#00BFFF] text-[10px] font-bold uppercase px-6 py-3 tracking-widest border border-[#00BFFF] hover:bg-[#00BFFF] hover:text-[#0A1F33] transition-colors inline-block mt-2">Explorar Catálogo →</Link>
          </div>
          <div className="lg:w-2/3 grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
            <div className="bg-[#FFFFFF]/5 p-8 border border-[#FFFFFF]/10 hover:border-[#00BFFF] transition-colors">
              <span className="text-[#00BFFF] font-black text-5xl block mb-4" style={{ fontFamily: 'Montserrat, sans-serif' }}>1.</span>
              <h3 className="text-[#FFFFFF] font-bold text-sm uppercase mb-3 tracking-wide" style={{ fontFamily: 'Inter, sans-serif' }}>Buscá tu auto</h3>
              <p className="text-[#C0C0C0] text-[11px] leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>Entre cientos de modelos disponibles con datos duros, especificaciones exactas y sin ruido comercial.</p>
            </div>
            <div className="bg-[#FFFFFF]/5 p-8 border border-[#FFFFFF]/10 hover:border-[#00BFFF] transition-colors">
              <span className="text-[#00BFFF] font-black text-5xl block mb-4" style={{ fontFamily: 'Montserrat, sans-serif' }}>2.</span>
              <h3 className="text-[#FFFFFF] font-bold text-sm uppercase mb-3 tracking-wide" style={{ fontFamily: 'Inter, sans-serif' }}>Compará Ofertas</h3>
              <p className="text-[#C0C0C0] text-[11px] leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>De concesionarias oficiales de Paraguay, al instante y con total transparencia en precios y garantías.</p>
            </div>
            <div className="bg-[#FFFFFF]/5 p-8 border border-[#FFFFFF]/10 hover:border-[#00BFFF] transition-colors">
              <span className="text-[#00BFFF] font-black text-5xl block mb-4" style={{ fontFamily: 'Montserrat, sans-serif' }}>3.</span>
              <h3 className="text-[#FFFFFF] font-bold text-sm uppercase mb-3 tracking-wide" style={{ fontFamily: 'Inter, sans-serif' }}>Elegí y Avanzá</h3>
              <p className="text-[#C0C0C0] text-[11px] leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>Contactá directamente o delegá la transacción en nuestros expertos para proteger el valor de tu inversión.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ==========================================
          2.7 AUTOS POR MENOS DE
          ========================================== */}
      <section className="max-w-[1400px] mx-auto px-4 lg:px-8 my-16 mb-24">
        <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4 mb-6 border-b border-[#C0C0C0] pb-4">
          <h2 className="font-black text-3xl text-[#0A1F33] uppercase" style={{ fontFamily: 'Montserrat, sans-serif' }}>Autos por <span className="text-[#3A3A3C]">menos de</span></h2>
          <Link href="/catalogo" className="text-[11px] font-bold text-[#00BFFF] hover:underline uppercase tracking-widest mb-1 sm:mb-0" style={{ fontFamily: 'Inter, sans-serif' }}>Ver todos →</Link>
        </div>
        
        {/* Pestañas Lógicas Dinámicas */}
        <div className="flex gap-2 mb-8 overflow-x-auto custom-scrollbar pb-2">
          {validPriceTabs.map(tab => (
            <button 
              key={tab.id} 
              onClick={() => setActivePriceTab(tab.id)} 
              className={`px-6 py-3 text-[11px] font-bold uppercase tracking-widest whitespace-nowrap transition-colors border ${activePriceTab === tab.id ? 'bg-[#0A1F33] text-[#FFFFFF] border-[#0A1F33]' : 'bg-[#F5F5F5] text-[#3A3A3C] border-[#C0C0C0] hover:border-[#0A1F33]'}`}
            >
              {tab.label} <span className={`font-normal text-[10px] ml-1 ${activePriceTab === tab.id ? 'text-[#C0C0C0]' : 'text-[#3A3A3C]/70'}`}>({tab.count} autos)</span>
            </button>
          ))}
          {validPriceTabs.length === 0 && !isLoading && (
            <span className="text-[10px] text-[#C0C0C0] font-bold uppercase tracking-widest">Sin rangos de precio disponibles.</span>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {isLoading ? (
             <div className="col-span-full py-10 text-center font-bold text-[#C0C0C0] uppercase tracking-widest text-[10px]">Filtrando mercado...</div>
          ) : autosFiltradosPorPrecio.length > 0 ? (
            autosFiltradosPorPrecio.map((auto) => (
              <Link href={`/catalogo/${auto.brandId}/${auto.id}`} key={`precio_${auto.id}`} className="block">
                <div className="h-full bg-[#FFFFFF] border border-[#C0C0C0] flex flex-col hover:border-[#0A1F33] transition-colors group overflow-hidden">
                  <div className="p-3 flex justify-end shrink-0 h-10 border-b border-[#C0C0C0]/20">
                    <span className="text-[8px] border border-[#C0C0C0] text-[#3A3A3C] px-2 py-1 uppercase font-bold bg-[#F8F9FA] truncate max-w-full block">
                      {auto.category}
                    </span>
                  </div>
                  <div className="relative p-4 pt-0 shrink-0 h-32 bg-[#FFFFFF] group-hover:bg-[#F8F9FA] transition-colors">
                    <Image
                      src={auto.img}
                      alt={auto.name}
                      fill
                      sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 20vw"
                      className="object-contain p-4 group-hover:scale-105 transition-transform duration-300"
                      unoptimized={!isOptimizableImageSrc(auto.img)}
                    />
                  </div>
                  <div className="p-4 flex flex-col flex-grow border-t border-[#C0C0C0] bg-[#F8F9FA]">
                    <p className="text-[9px] font-bold text-[#C0C0C0] uppercase tracking-widest mb-1 truncate">{auto.brand}</p>
                    <h3 className="font-black text-[13px] text-[#0A1F33] uppercase leading-tight h-8 line-clamp-2" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                      {auto.name}
                    </h3>
                    <div className="mt-auto pt-3 border-t border-[#C0C0C0]/50">
                      <p className="text-[8px] uppercase tracking-widest text-[#3A3A3C] font-bold mb-0.5">Desde</p>
                      <p className="font-black text-[14px] text-[#0A1F33] leading-none" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                        US$ {auto.price.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <div className="col-span-full py-10 border border-[#C0C0C0] bg-[#F8F9FA] text-center font-bold text-[#C0C0C0] uppercase tracking-widest text-[10px]">
              Selecciona un rango de precios.
            </div>
          )}
        </div>
      </section>

      {/* ==========================================
          2.8 FOOTER CORPORATIVO INYECTADO
          ========================================== */}
      <Footer />
    </main>
  );
}