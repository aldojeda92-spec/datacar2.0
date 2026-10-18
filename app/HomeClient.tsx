// app/page.tsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { getCachedBrands, getCachedModels, getCachedCampaigns, getCachedVersions } from '../lib/catalogCache';
// CORRECCIÓN BUGS DE RUTA: Apuntamos al directorio actual porque components está dentro de app/
import NewsletterForm from './components/NewsletterForm';
import { isOptimizableImageSrc, isValidImageSrc } from '../lib/imageSrc';
import { normalizeCarroceria } from '../lib/carroceria';
import { normalizeCombustible, combustibleLabel } from '../lib/combustible';
import { normalizeExternalUrl } from '../lib/externalUrl';
import Navbar, { NavItem } from './components/Navbar';
import InstagramReelsSection from './components/InstagramReelsSection';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { FinancialConfig, DEFAULT_FINANCIAL_CONFIG, calcularCuotaFrancesa } from '../lib/finance';
import { useLead } from './context/LeadContext';
import { fetchPopularComparisonsData, PopularComparisonItem } from '../lib/popularComparisons';
import { resolveModelDealership, sanitizeDealershipName } from '../lib/dealerships';
// ==========================================
// INTERFACES B2B 
// ==========================================
interface AutoModel {
  id: string;
  brandId: string;
  brand: string;
  name: string;
  category: string;
  price: number;
  img: string;
  isPopular?: boolean;
  combustible?: string;
  transmision?: string;
  plazas?: number;
  concesionaria?: string;
  versionesCount?: number;
}
interface SearchItem { id: string; type: 'Marca' | 'Modelo'; title: string; subtitle?: string; brandId?: string; modelId?: string; }
interface BrandItem { id: string; name: string; logoUrl?: string; }
interface AdCampaign { id: string; sponsor: string; headline: string; highlight: string; price: string; link: string; img: string; location: string; startDate: string; endDate: string; isActive: boolean; }

// ==========================================
// COMPONENTE FOOTER (AHORA MODULARIZADO)
// ==========================================
const Footer = () => {
  return (
    <footer className="w-full bg-[#0A1F33] border-t-4 border-[#00BFFF] text-[#FFFFFF]" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
      <div className="border-b border-[#FFFFFF]/10">
        <div className="max-w-[1400px] mx-auto px-4 lg:px-8 py-16 flex flex-col md:flex-row items-center justify-between gap-10">
          <div className="md:w-1/2">
            <span className="text-[10px] font-bold text-[#00BFFF] uppercase tracking-widest mb-2 block">Inteligencia de Mercado</span>
            <h3 className="font-black text-3xl text-[#FFFFFF] uppercase leading-tight mb-3" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>Auditorías y precios 0KM <br className="hidden md:block" /> directo a tu correo.</h3>
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
            <div className="font-black text-3xl tracking-widest text-[#FFFFFF] uppercase mb-4" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>DATA<span className="font-light text-[#C0C0C0]">CAR</span></div>
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
              <li><Link href="/blog" className="hover:text-[#00BFFF] transition-colors">Blog & Noticias</Link></li>
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

  // Comparaciones Populares (5 a 8)
  const [topComparisons, setTopComparisons] = useState<PopularComparisonItem[]>([]);

  // Calculadora Financiera
  const { openLeadModal } = useLead();
  const [financialConfig, setFinancialConfig] = useState<FinancialConfig>(DEFAULT_FINANCIAL_CONFIG);
  const [calcModel, setCalcModel] = useState<SearchItem | null>(null);
  const [calcDownPayment, setCalcDownPayment] = useState<string>('');
  const [calcTerm, setCalcTerm] = useState<number>(60);
  const [calcResult, setCalcResult] = useState<number | null>(null);
  const [calcSearchTerm, setCalcSearchTerm] = useState('');
  const [calcSearchResults, setCalcSearchResults] = useState<SearchItem[]>([]);
  const [calcDropdownOpen, setCalcDropdownOpen] = useState(false);

  // 1. Buscador
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<SearchItem[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  // 2. Banner Publicitario
  const [activeAd, setActiveAd] = useState<AdCampaign | null>(null);

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
        const [brandsData, modelsData, campaignsData, versionsData] = await Promise.all([
          getCachedBrands(),
          getCachedModels(),
          getCachedCampaigns(),
          getCachedVersions(),
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

        const versionsByModel = new Map<string, any[]>();
        versionsData.forEach((v: any) => {
          if (!v.modelId) return;
          const list = versionsByModel.get(v.modelId) || [];
          list.push(v);
          versionsByModel.set(v.modelId, list);
        });

        const fetchedAutos: AutoModel[] = modelsData.map((data) => {
          const brandName = brandsMap[data.brandId] || 'MARCA';
          const cleanCategory = normalizeCarroceria(data.tipo_carroceria);
          tempTipos.add(cleanCategory);

          const mVers = versionsByModel.get(data.id) || [];
          const repVer = [...mVers].sort((a: any, b: any) => (Number(a.price) || 0) - (Number(b.price) || 0))[0] || mVers[0];
          const rawComb = repVer ? normalizeCombustible(repVer.specs?.combustible) : '';
          const cleanComb = rawComb ? combustibleLabel(rawComb) || rawComb : '';
          const transmision = repVer?.specs?.transmision || '';
          const plazas = Number(repVer?.specs?.plazas) || 5;
          const concesionaria = resolveModelDealership(mVers, repVer);

          tempSearchIndex.push({ id: `m_${data.id}`, type: 'Modelo', title: `${brandName} ${data.name}`, subtitle: cleanCategory, brandId: data.brandId, modelId: data.id });
          return {
            id: data.id,
            brandId: data.brandId,
            brand: brandName,
            name: data.name,
            category: cleanCategory,
            price: Number(data.startingPrice) || 0,
            img: data.imgUrl || '',
            isPopular: data.isPopular || false,
            combustible: cleanComb,
            transmision: transmision,
            plazas: plazas,
            concesionaria: concesionaria,
            versionesCount: mVers.length,
          };
        });

        setMarcas(tempMarcas.sort((a, b) => a.name.localeCompare(b.name)));
        setAutos(fetchedAutos);
        setSearchIndex(tempSearchIndex);
        setTiposDisponibles(Array.from(tempTipos).sort());

        // Carga de Pauta (Espacio #1: Home)
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const validCampaign = (campaignsData as AdCampaign[]).find(c =>
          c.isActive !== false &&
          (c.location === 'home' || c.location === 'ambos') &&
          (!c.startDate || c.startDate <= today) &&
          (!c.endDate || c.endDate >= today)
        );
        if (validCampaign) setActiveAd(validCampaign);

        // Carga de Configuración Financiera
        try {
          const finDoc = await getDoc(doc(db, 'config', 'financial'));
          if (finDoc.exists()) {
            setFinancialConfig(finDoc.data() as FinancialConfig);
          }
        } catch (err) {
          console.warn("Configuración financiera no disponible:", err);
        }

        // Carga de Comparaciones Populares (5 a 8 items con fallback)
        try {
          const comps = await fetchPopularComparisonsData(versionsData, modelsData, brandsData);
          setTopComparisons(comps);
        } catch (err) {
          console.warn("Error cargando comparaciones populares:", err);
        }

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

  // Lógica Predictiva de Calculadora
  useEffect(() => {
    if (calcSearchTerm.length >= 2) {
      const results = searchIndex.filter(item => item.type === 'Modelo' && item.title.toLowerCase().includes(calcSearchTerm.toLowerCase()));
      setCalcSearchResults(results.slice(0, 5));
      setCalcDropdownOpen(true);
    } else {
      setCalcSearchResults([]);
      setCalcDropdownOpen(false);
    }
  }, [calcSearchTerm, searchIndex]);

  const handleCalculate = () => {
    if (!calcModel || !calcModel.modelId) return;
    const model = autos.find(a => a.id === calcModel.modelId);
    if (!model) return;
    
    const dp = parseFloat(calcDownPayment) || 0;
    const cuota = calcularCuotaFrancesa(model.price, dp, calcTerm, financialConfig);
    setCalcResult(cuota);
  };

  // Selección inteligente de "Lo más buscado" (2 filas de 4 = 8 modelos)
  const autosMasBuscados = useMemo(() => {
    const featured = autos.filter(a => a.isPopular);
    if (featured.length >= 8) return featured.slice(0, 8);
    // Si hay menos de 8 populares marcados, completar con los primeros autos del catálogo hasta 8
    const others = autos.filter(a => !a.isPopular);
    return [...featured, ...others].slice(0, 8);
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
    return autos.filter(auto => currentTab.filter(auto.price)).slice(0, 10);
  }, [autos, activePriceTab, priceTabs]);

  const navItems: NavItem[] = useMemo(() => [
    {
      type: 'megamenu', label: 'Por Tipo', columns: 2, width: 400,
      items: tiposDisponibles.map(tipo => ({ label: tipo, href: `/catalogo?tipo=${encodeURIComponent(tipo)}` })),
    },
    {
      type: 'megamenu', label: 'Por Marca', columns: 3, width: 600,
      items: marcas.map(marca => ({ label: marca.name, href: `/catalogo?marca=${encodeURIComponent(marca.name)}` })),
    },
    {
      type: 'megamenu', label: 'Herramientas', columns: 1, width: 300,
      items: [
        { label: 'Comparador de Versiones', href: '/comparador' },
        { label: 'Calculadora de Cuotas', href: '/calculadora' },
        { label: 'Recomendador Interactivo', href: '/recomendador', highlight: true },
      ],
    },
    { type: 'link', label: 'Negociamos por vos', href: '/negociamos-por-vos' },
    { type: 'link', label: 'Blog & Noticias', href: '/blog' },
  ], [tiposDisponibles, marcas]);

  return (
    <main className="min-h-screen bg-[#F8F9FA] text-[#3A3A3C] font-sans flex flex-col relative">

      {/* ==========================================
          NAVBAR CORPORATIVO CON MEGA-MENÚS (FLAT)
          ========================================== */}
      <Navbar
        items={navItems}
        cta={{ label: 'Catálogo', href: '/catalogo' }}
        secondaryCta={{ label: 'Promociones', href: '/promociones' }}
      />

      {/* ==========================================
          2.1 BUSCADOR Y FILTROS RÁPIDOS
          ========================================== */}
      <section className="w-full bg-[#0A1F33] pt-20 pb-16 px-4 flex flex-col items-center relative z-40 border-b-4 border-[#00BFFF]">
        <div className="text-center mb-10">
          <span className="bg-[#FFFFFF]/10 text-[#00BFFF] border border-[#00BFFF]/30 rounded-full font-bold tracking-widest uppercase px-5 py-1.5 text-[10px] mb-6 inline-block backdrop-blur-sm">100% Sin Costo • Precios Oficiales de Concesionaria</span>
          <h1 className="font-black text-3xl sm:text-4xl md:text-5xl lg:text-6xl text-[#FFFFFF] uppercase leading-tight break-words" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
            Visitá todas las concesionarias<br/><span className="text-[#00BFFF]">en un solo lugar.</span>
          </h1>
          <div className="flex flex-col sm:flex-row justify-center gap-4 mt-8">
            <Link href="/catalogo" className="bg-[#00BFFF] hover:bg-[#00BFFF]/90 text-[#FFFFFF] font-bold text-sm uppercase tracking-widest py-4 px-10 rounded-2xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all">Explorar Catálogo</Link>
            <Link href="/recomendador" className="border-2 border-[#FFFFFF]/20 bg-[#FFFFFF] text-[#0A1F33] font-bold text-sm uppercase tracking-widest py-4 px-10 rounded-2xl shadow-lg hover:bg-[#00BFFF] hover:text-[#FFFFFF] hover:border-[#00BFFF] hover:-translate-y-0.5 transition-all">Encontrá tu Auto Ideal</Link>
          </div>
        </div>

        <div className="w-full max-w-4xl relative mb-6">
          <div className="flex bg-[#FFFFFF] border-2 border-transparent focus-within:border-[#00BFFF] rounded-2xl shadow-xl transition-all overflow-hidden">
            <div className="pl-6 flex items-center text-[#C0C0C0]"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg></div>
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
            <div className="absolute top-full left-0 w-full bg-[#FFFFFF] border border-[#00BFFF]/40 rounded-2xl shadow-2xl max-h-80 overflow-y-auto z-50 mt-2">
              <ul id="home-search-listbox" role="listbox" className="flex flex-col">
                {searchResults.length > 0 ? searchResults.map((item) => {
                    const dynamicUrl = item.type === 'Modelo' && item.brandId && item.modelId
                      ? `/catalogo/${item.brandId}/${item.modelId}`
                      : `/catalogo?marca=${encodeURIComponent(item.title)}`;
                    return (
                      <li key={item.id} role="option" aria-selected="false" className="border-b border-[#0A1F33]/10 last:border-0 hover:bg-[#F8F9FA] transition-colors">
                        <Link href={dynamicUrl} className="flex justify-between items-center px-6 py-4">
                          <div className="flex flex-col"><span className="font-bold text-sm text-[#0A1F33] uppercase">{item.title}</span>{item.subtitle && <span className="text-[10px] text-[#3A3A3C] font-medium uppercase mt-1">{item.subtitle}</span>}</div>
                          <span className={`text-[9px] font-bold uppercase tracking-widest px-3 py-1 rounded-full border ${item.type === 'Marca' ? 'border-[#00BFFF] text-[#00BFFF] bg-[#F0FBFF]' : 'border-[#3A3A3C]/30 text-[#3A3A3C] bg-[#F8F9FA]'}`}>{item.type}</span>
                        </Link>
                      </li>
                    )
                  }) : <li className="px-6 py-4 text-sm text-[#3A3A3C] text-center font-bold uppercase tracking-widest">No encontramos vehículos</li>}
              </ul>
            </div>
          )}
        </div>

        {/* Microcopy de Transparencia Comercial */}
        <p className="text-[11px] text-[#C0C0C0] uppercase font-bold tracking-wider mb-2 text-center">
          Compará sin costo • Precios directos de concesionaria, 0% recargos ni comisiones
        </p>

        {/* Filtros Rápidos */}
        <div className="flex flex-wrap justify-center gap-3 px-2 mt-4 max-w-5xl" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
          <Link href="/catalogo?tipo=SUV" className="bg-[#FFFFFF] px-5 py-3 text-[11px] font-bold text-[#3A3A3C] hover:text-[#0A1F33] rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all flex items-center gap-2 border border-[#FFFFFF]/80">
            <svg className="w-4 h-4 text-[#00BFFF]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h8l2 4v7a1 1 0 01-1 1H7a1 1 0 01-1-1v-7l2-4z"></path></svg> SUVs
          </Link>
          <Link href="/catalogo?tipo=SEDAN" className="bg-[#FFFFFF] px-5 py-3 text-[11px] font-bold text-[#3A3A3C] hover:text-[#0A1F33] rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all flex items-center gap-2 border border-[#FFFFFF]/80">
            <svg className="w-4 h-4 text-[#00BFFF]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4-4h6l4 4m-14 0v4a1 1 0 001 1h12a1 1 0 001-1v-4M5 13h14"></path></svg> Sedanes
          </Link>
          <Link href="/catalogo?tipo=PICKUP" className="bg-[#FFFFFF] px-5 py-3 text-[11px] font-bold text-[#3A3A3C] hover:text-[#0A1F33] rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all flex items-center gap-2 border border-[#FFFFFF]/80">
            <svg className="w-4 h-4 text-[#00BFFF]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h12m-6 4h12M3 14v4a1 1 0 001 1h16a1 1 0 001-1v-4M5 10l2-4h10l2 4"></path></svg> Pick-ups
          </Link>
          <Link href="/catalogo?combustible=EV" className="bg-[#FFFFFF] px-5 py-3 text-[11px] font-bold text-[#3A3A3C] hover:text-[#0A1F33] rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all flex items-center gap-2 border border-[#FFFFFF]/80">
            <svg className="w-4 h-4 text-[#1E8E3E]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> Movilidad Eléctrica
          </Link>
          <Link href="/negociamos-por-vos" className="bg-[#E6F4EA] px-5 py-3 text-[11px] font-bold text-[#1E8E3E] hover:bg-[#1E8E3E] hover:text-[#FFFFFF] rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all flex items-center gap-2 border border-[#1E8E3E]/30 hover:border-[#1E8E3E]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg> Delegar Negociación
          </Link>
          <Link href="/recomendador" className="bg-[#F5FBFF] px-5 py-3 text-[11px] font-bold text-[#00BFFF] hover:bg-[#00BFFF] hover:text-[#FFFFFF] rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all flex items-center gap-2 border border-[#00BFFF]/30 hover:border-[#00BFFF]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg> Usar Recomendador
          </Link>
        </div>
      </section>

      {/* ==========================================
          2.2 BANNER PUBLICITARIO
          ========================================== */}
      {activeAd && (
        <section className="max-w-[1400px] mx-auto px-4 md:px-8 mt-12 mb-6 w-full">
          {isValidImageSrc(activeAd.img) ? (
            <a
              href={normalizeExternalUrl(activeAd.link)}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full relative group overflow-hidden rounded-2xl border border-[#0A1F33]/10 hover:border-[#00BFFF] transition-all shadow-md hover:shadow-xl bg-transparent"
            >
              <span className="absolute top-3 right-3 bg-[#0A1F33]/85 text-[#FFFFFF] text-[8px] uppercase font-bold px-3.5 py-1 rounded-full tracking-widest border border-[#FFFFFF]/20 z-20 backdrop-blur-sm">
                Auspicio Oficial: {activeAd.sponsor}
              </span>
              <Image
                src={activeAd.img}
                alt={activeAd.sponsor || 'Auspicio'}
                width={1200}
                height={400}
                sizes="(max-width: 1400px) 100vw, 1400px"
                className="w-full h-auto block object-cover group-hover:brightness-105 transition-all"
                unoptimized={!isOptimizableImageSrc(activeAd.img)}
                priority
              />
            </a>
          ) : (
            <a
              href={normalizeExternalUrl(activeAd.link)}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full bg-[#0A1F33] rounded-2xl border-2 border-transparent hover:border-[#00BFFF] p-8 md:p-12 relative transition-all shadow-md hover:shadow-xl group overflow-hidden text-center"
            >
              <span className="absolute top-4 right-4 bg-[#FFFFFF]/10 text-[#FFFFFF] text-[8px] uppercase font-bold px-3.5 py-1 rounded-full tracking-widest border border-[#FFFFFF]/20 z-20">
                Auspicio Oficial: {activeAd.sponsor}
              </span>
              <p className="font-black text-3xl md:text-5xl text-[#FFFFFF] uppercase leading-tight mb-2" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
                {activeAd.headline} <span className="text-[#00BFFF]">{activeAd.highlight}</span>
              </p>
              {activeAd.price && (
                <p className="font-black text-2xl text-[#00BFFF] mt-2 inline-block border-b-2 border-[#00BFFF] pb-1" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
                  {activeAd.price}
                </p>
              )}
            </a>
          )}
        </section>
      )}


      {/* ==========================================
          3. LO MÁS BUSCADO (AUTOS DESTACADOS AMPLIADOS)
          ========================================== */}
      <section className="max-w-[1400px] mx-auto px-4 lg:px-8 mt-14 mb-16">
        <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4 mb-8 border-b border-[#0A1F33]/10 pb-4">
          <div>
            <span className="text-[10px] font-bold text-[#00BFFF] uppercase tracking-widest block mb-1">Tendencias del Mercado</span>
            <h2 className="font-black text-3xl sm:text-4xl text-[#0A1F33] uppercase" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
              Lo más <span className="text-[#3A3A3C]">buscado</span>
            </h2>
          </div>
          <Link href="/catalogo" className="text-[11px] font-bold text-[#00BFFF] hover:underline uppercase tracking-widest transition-colors mb-1 sm:mb-0" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
            Ver catálogo completo →
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {isLoading ? (
            <div className="col-span-full py-16 text-center font-bold text-[#C0C0C0] uppercase tracking-widest text-xs">
              Cargando inventario 0KM...
            </div>
          ) : autosMasBuscados.length > 0 ? (
            autosMasBuscados.map((auto) => (
              <Link href={`/catalogo/${auto.brandId}/${auto.id}`} key={`pop_${auto.id}`} className="block group h-full">
                <div className="h-full bg-[#FFFFFF] border border-[#0A1F33]/10 rounded-2xl shadow-sm hover:border-[#00BFFF] hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between overflow-hidden relative">
                  
                  {/* Top Bar: Marca & Categoría */}
                  <div className="px-5 py-3.5 border-b border-[#0A1F33]/5 flex justify-between items-center bg-[#F8F9FA]">
                    <span className="text-[10px] font-black text-[#00BFFF] uppercase tracking-wider">
                      {auto.brand}
                    </span>
                    <span className="text-[9px] font-bold text-[#3A3A3C] uppercase tracking-wider border border-[#0A1F33]/10 rounded-full px-3 py-0.5 bg-[#FFFFFF]">
                      {auto.category}
                    </span>
                  </div>

                  {/* Imagen del Vehículo */}
                  <div className="relative w-full h-44 sm:h-48 bg-gradient-to-b from-[#FAFBFD] to-[#FFFFFF] p-4 flex items-center justify-center overflow-hidden">
                    {isValidImageSrc(auto.img) ? (
                      <Image
                        src={auto.img}
                        alt={`${auto.brand} ${auto.name}`}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                        className="object-contain p-2 group-hover:scale-105 transition-transform duration-300"
                        unoptimized={!isOptimizableImageSrc(auto.img)}
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-[#C0C0C0] uppercase tracking-widest">
                        Sin Imagen
                      </div>
                    )}
                  </div>

                  {/* Información Detallada del Modelo */}
                  <div className="p-5 pt-3 flex flex-col flex-grow bg-[#FFFFFF]">
                    <h3 className="font-black text-lg text-[#0A1F33] uppercase leading-tight mb-2 truncate group-hover:text-[#00BFFF] transition-colors" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
                      {auto.name}
                    </h3>

                    {/* Ficha Rápida / Atributos Detallados */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {auto.combustible && (
                        <span className="text-[9px] font-bold text-[#3A3A3C] bg-[#F4F5F7] px-2.5 py-0.5 rounded-lg border border-[#E0E2E6] uppercase">
                          ⛽ {auto.combustible}
                        </span>
                      )}
                      {auto.transmision && (
                        <span className="text-[9px] font-bold text-[#3A3A3C] bg-[#F4F5F7] px-2.5 py-0.5 rounded-lg border border-[#E0E2E6] uppercase">
                          ⚙️ {auto.transmision.toLowerCase().includes('auto') || auto.transmision.toLowerCase().includes('at') || auto.transmision.toLowerCase().includes('cvt') ? 'Automática' : 'Manual'}
                        </span>
                      )}
                      {auto.plazas ? (
                        <span className="text-[9px] font-bold text-[#3A3A3C] bg-[#F4F5F7] px-2.5 py-0.5 rounded-lg border border-[#E0E2E6] uppercase">
                          👥 {auto.plazas} Plazas
                        </span>
                      ) : null}
                      {auto.versionesCount && auto.versionesCount > 1 ? (
                        <span className="text-[9px] font-bold text-[#00BFFF] bg-[#F0FBFF] px-2.5 py-0.5 rounded-lg border border-[#00BFFF]/30 uppercase">
                          {auto.versionesCount} Versiones
                        </span>
                      ) : null}
                    </div>

                    {/* Concesionaria oficial */}
                    {auto.concesionaria && (
                      <p className="text-[9px] text-[#6A6A6C] uppercase font-semibold tracking-wider mb-3 truncate flex items-center gap-1">
                        <span className="text-[#1E8E3E]">✓</span> Oficial: <span className="font-bold text-[#3A3A3C]">{auto.concesionaria}</span>
                      </p>
                    )}

                    {/* Precio Contado */}
                    <div className="mt-auto pt-3 border-t border-[#0A1F33]/10">
                      <span className="text-[9px] text-[#6A6A6C] font-bold uppercase tracking-widest block mb-0.5">
                        Precio contado desde
                      </span>
                      <p className="font-black text-2xl text-[#0A1F33] leading-none" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
                        US$ {auto.price.toLocaleString()}
                      </p>
                    </div>

                    {/* CTA Claro y Prominente */}
                    <div className="mt-4 w-full bg-[#0A1F33] group-hover:bg-[#00BFFF] text-[#FFFFFF] group-hover:text-[#0A1F33] font-bold text-xs uppercase tracking-widest py-3 rounded-xl text-center transition-all flex items-center justify-center gap-2 border border-transparent shadow-xs">
                      <span>Ver Ficha y Versiones</span>
                      <span className="group-hover:translate-x-1 transition-transform">→</span>
                    </div>

                  </div>
                </div>
              </Link>
            ))
          ) : (
            <div className="col-span-full py-16 text-center font-bold text-[#C0C0C0] uppercase tracking-widest text-xs">
              Base de datos sincronizando...
            </div>
          )}
        </div>
      </section>

      {/* ==========================================
          4. CALCULADORA FINANCIERA COMPRIMIDA HORIZONTALMENTE
          ========================================== */}
      <section className="max-w-[1400px] mx-auto px-4 lg:px-8 my-14">
        <div className="bg-[#FFFFFF] border border-[#0A1F33]/15 rounded-3xl shadow-lg p-6 lg:p-8">
          <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-2 mb-6 border-b border-[#0A1F33]/10 pb-4">
            <div>
              <span className="text-[10px] font-bold text-[#00BFFF] uppercase tracking-widest block mb-1">Simulación Financiera</span>
              <h2 className="font-black text-2xl md:text-3xl text-[#0A1F33] uppercase leading-tight" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
                ¿Qué modelo podés comprar por tu cuota?
              </h2>
            </div>
            <p className="text-xs text-[#C0C0C0] font-medium">Calculá tu financiación 0KM en segundos</p>
          </div>

          <div className="flex flex-col xl:flex-row items-stretch xl:items-end gap-5">
            {/* Controles de Entrada Horizontales */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 flex-grow">
              {/* 1. Selección de Modelo */}
              <div className="relative">
                <label className="text-[10px] font-bold text-[#0A1F33] uppercase tracking-widest mb-1.5 block">1. Modelo</label>
                <div className="flex bg-[#F8F9FA] border border-[#0A1F33]/15 rounded-xl focus-within:border-[#00BFFF] focus-within:bg-[#FFFFFF] transition-all relative">
                  <input
                    type="text"
                    placeholder="Escribí modelo..."
                    className="w-full py-3 px-3.5 text-xs font-medium text-[#3A3A3C] bg-transparent focus:outline-none rounded-xl"
                    value={calcModel ? calcModel.title : calcSearchTerm}
                    onChange={(e) => { setCalcSearchTerm(e.target.value); setCalcModel(null); }}
                    onFocus={() => calcSearchTerm.length >= 2 && setCalcDropdownOpen(true)}
                  />
                </div>
                {calcDropdownOpen && calcSearchResults.length > 0 && (
                  <ul className="absolute top-full left-0 w-full bg-[#FFFFFF] border border-[#00BFFF]/40 rounded-xl max-h-48 overflow-y-auto z-50 shadow-xl mt-1">
                    {calcSearchResults.map(item => (
                      <li key={item.id} className="px-3.5 py-2.5 hover:bg-[#F8F9FA] cursor-pointer text-xs border-b border-[#0A1F33]/5 last:border-none" onClick={() => { setCalcModel(item); setCalcSearchTerm(''); setCalcDropdownOpen(false); }}>
                        <span className="font-bold text-[#0A1F33] uppercase">{item.title}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* 2. Entrega Inicial */}
              <div>
                <label className="text-[10px] font-bold text-[#0A1F33] uppercase tracking-widest mb-1.5 block">2. Entrega (US$)</label>
                <input
                  type="number"
                  placeholder="Ej: 5000"
                  className="w-full py-3 px-3.5 text-xs font-medium text-[#3A3A3C] bg-[#F8F9FA] border border-[#0A1F33]/15 rounded-xl focus:outline-none focus:border-[#00BFFF] focus:bg-[#FFFFFF]"
                  value={calcDownPayment}
                  onChange={(e) => setCalcDownPayment(e.target.value)}
                />
              </div>

              {/* 3. Plazo en Meses */}
              <div>
                <label className="text-[10px] font-bold text-[#0A1F33] uppercase tracking-widest mb-1.5 block">3. Plazo</label>
                <select
                  value={calcTerm}
                  onChange={(e) => setCalcTerm(Number(e.target.value))}
                  className="w-full py-3 px-3.5 text-xs font-medium text-[#3A3A3C] bg-[#F8F9FA] border border-[#0A1F33]/15 rounded-xl focus:outline-none focus:border-[#00BFFF] focus:bg-[#FFFFFF] cursor-pointer"
                >
                  {[12, 24, 36, 48, 60].map(term => (
                    <option key={term} value={term}>{term} meses</option>
                  ))}
                </select>
              </div>

              {/* 4. Botón Calcular */}
              <div className="flex flex-col justify-end">
                <button
                  type="button"
                  onClick={handleCalculate}
                  className="w-full bg-[#00BFFF] text-[#0A1F33] hover:bg-[#0A1F33] hover:text-[#FFFFFF] font-bold text-xs uppercase tracking-widest py-3.5 px-4 transition-all rounded-xl shadow-sm text-center"
                >
                  Calcular
                </button>
              </div>
            </div>

            {/* Separador Vertical */}
            <div className="hidden xl:block w-px self-stretch bg-[#0A1F33]/10"></div>

            {/* Resultado a la Derecha Mismo */}
            <div className="xl:w-80 bg-[#0A1F33] text-[#FFFFFF] p-6 rounded-2xl shadow-md flex flex-col justify-between shrink-0">
              {calcResult !== null ? (
                <>
                  <div className="mb-3">
                    <span className="text-[9px] font-bold text-[#00BFFF] uppercase tracking-widest block">Cuota Mensual Estimada</span>
                    <p className="font-black text-2xl lg:text-3xl text-[#FFFFFF] mt-0.5" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
                      US$ {calcResult.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs font-normal text-[#C0C0C0]">/mes</span>
                    </p>
                  </div>
                  <button
                    onClick={() => openLeadModal({
                      vehiculoInteres: calcModel?.title || 'Cotización Financiera',
                      marcaVehiculo: calcModel?.brandId || '',
                      origenLead: 'Calculadora Rápida Home',
                      concesionariaDestino: 'Central'
                    })}
                    className="w-full bg-[#00BFFF] hover:bg-[#FFFFFF] text-[#0A1F33] font-bold text-[11px] uppercase tracking-widest py-3 px-4 rounded-xl transition-all text-center shadow-sm"
                  >
                    Solicitá tu crédito →
                  </button>
                </>
              ) : (
                <div className="py-4 flex flex-col justify-center items-center text-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#C0C0C0]">
                    Ingresá los datos y presioná Calcular
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ==========================================
          5. AUTOS POR MENOS DE
          ========================================== */}
      <section className="w-full max-w-[1400px] mx-auto px-4 lg:px-8 my-16 min-w-0">
        <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4 mb-6 border-b border-[#0A1F33]/10 pb-4">
          <div>
            <span className="text-[10px] font-bold text-[#00BFFF] uppercase tracking-widest block mb-1">Segmentos de Precio</span>
            <h2 className="font-black text-3xl text-[#0A1F33] uppercase" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
              Autos por <span className="text-[#3A3A3C]">menos de</span>
            </h2>
          </div>
          <Link href="/catalogo" className="text-[11px] font-bold text-[#00BFFF] hover:underline uppercase tracking-widest mb-1 sm:mb-0" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
            Ver todos →
          </Link>
        </div>
        
        {/* Pestañas Lógicas Dinámicas */}
        <div className="flex gap-2.5 mb-8 overflow-x-auto custom-scrollbar pb-2">
          {validPriceTabs.map(tab => (
            <button 
              key={tab.id} 
              onClick={() => setActivePriceTab(tab.id)} 
              className={`px-6 py-3 text-[11px] font-bold uppercase tracking-widest whitespace-nowrap rounded-xl transition-all border ${activePriceTab === tab.id ? 'bg-[#0A1F33] text-[#FFFFFF] border-[#0A1F33] shadow-sm' : 'bg-[#FFFFFF] text-[#3A3A3C] border-[#0A1F33]/15 hover:border-[#0A1F33]'}`}
            >
              {tab.label} <span className={`font-normal text-[10px] ml-1 ${activePriceTab === tab.id ? 'text-[#00BFFF]' : 'text-[#3A3A3C]/70'}`}>({tab.count} autos)</span>
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
              <Link href={`/catalogo/${auto.brandId}/${auto.id}`} key={`precio_${auto.id}`} className="block h-full">
                <div className="h-full bg-[#FFFFFF] border border-[#0A1F33]/10 rounded-2xl shadow-xs hover:shadow-lg hover:-translate-y-0.5 flex flex-col hover:border-[#00BFFF] transition-all duration-300 group overflow-hidden">
                  <div className="p-3 flex justify-end shrink-0 h-10 border-b border-[#0A1F33]/5">
                    <span className="text-[8px] border border-[#0A1F33]/10 rounded-full text-[#3A3A3C] px-2.5 py-0.5 uppercase font-bold bg-[#F8F9FA] truncate max-w-full block">
                      {auto.category}
                    </span>
                  </div>
                  <div className="relative p-4 pt-0 shrink-0 h-32 bg-[#FFFFFF] group-hover:bg-[#F8F9FA]/50 transition-colors">
                    {isValidImageSrc(auto.img) ? (
                      <Image
                        src={auto.img}
                        alt={auto.name}
                        fill
                        sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 20vw"
                        className="object-contain p-4 group-hover:scale-105 transition-transform duration-300"
                        unoptimized={!isOptimizableImageSrc(auto.img)}
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-[#C0C0C0] uppercase tracking-widest">Sin Imagen</div>
                    )}
                  </div>
                  <div className="p-4 flex flex-col flex-grow border-t border-[#0A1F33]/5 bg-[#F8F9FA]">
                    <p className="text-[9px] font-bold text-[#00BFFF] uppercase tracking-widest mb-1 truncate">{auto.brand}</p>
                    <h3 className="font-black text-[13px] text-[#0A1F33] uppercase leading-tight h-8 line-clamp-2 group-hover:text-[#00BFFF] transition-colors" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
                      {auto.name}
                    </h3>
                    <div className="mt-auto pt-3 border-t border-[#0A1F33]/10">
                      <p className="text-[8px] uppercase tracking-widest text-[#3A3A3C] font-bold mb-0.5">Desde</p>
                      <p className="font-black text-[14px] text-[#0A1F33] leading-none" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
                        US$ {auto.price.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <div className="col-span-full py-10 border border-[#0A1F33]/10 rounded-2xl bg-[#F8F9FA] text-center font-bold text-[#C0C0C0] uppercase tracking-widest text-[10px]">
              Selecciona un rango de precios.
            </div>
          )}
        </div>
      </section>

      {/* ==========================================
          6. MARCAS POPULARES
          ========================================== */}
      <section id="marcas-section" className="max-w-[1400px] mx-auto px-4 lg:px-8 my-16">
        <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4 mb-8 border-b border-[#0A1F33]/10 pb-4">
          <div>
            <span className="text-[10px] font-bold text-[#00BFFF] uppercase tracking-widest block mb-1">Ecosistema Oficial</span>
            <h2 className="font-black text-3xl text-[#0A1F33] uppercase" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
              Buscá por <span className="text-[#3A3A3C]">marca</span>
            </h2>
          </div>
          <Link href="/catalogo" className="text-[11px] font-bold text-[#00BFFF] hover:underline uppercase tracking-widest transition-colors mb-1 sm:mb-0">
            Ver todas las marcas →
          </Link>
        </div>
        <div className="flex flex-wrap gap-4 justify-center">
          {isLoading ? (
            <p className="text-[10px] uppercase text-[#C0C0C0] font-bold tracking-widest">Escaneando mercado...</p>
          ) : marcas.length > 0 ? (
            marcas.slice(0, 10).map((marca) => (
              <Link href={`/catalogo?marca=${encodeURIComponent(marca.name)}`} key={marca.id} className="w-28 h-28 bg-[#FFFFFF] border border-[#0A1F33]/10 rounded-2xl shadow-xs hover:shadow-md hover:-translate-y-0.5 flex flex-col justify-center items-center hover:border-[#00BFFF] transition-all group">
                {isValidImageSrc(marca.logoUrl) ? (
                  <div className="relative w-12 h-12 mb-3 opacity-85 group-hover:opacity-100 transition-opacity">
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
                  <div className="w-12 h-12 bg-[#F8F9FA] rounded-xl mb-3 flex justify-center items-center group-hover:bg-[#0A1F33] transition-colors text-[10px] text-[#3A3A3C] group-hover:text-[#FFFFFF] uppercase font-bold">
                    {marca.name.substring(0,2)}
                  </div>
                )}
                <span className="text-[9px] font-bold text-[#3A3A3C] group-hover:text-[#0A1F33] uppercase tracking-widest truncate max-w-[90%]">
                  {marca.name}
                </span>
              </Link>
            ))
          ) : (
            <p className="text-[10px] uppercase text-[#C0C0C0] font-bold tracking-widest">Sin marcas registradas</p>
          )}
          
          {marcas.length > 10 && (
            <Link href="/catalogo" className="w-28 h-28 bg-[#F8F9FA] border border-dashed border-[#0A1F33]/20 rounded-2xl flex flex-col justify-center items-center hover:border-[#00BFFF] hover:bg-[#FFFFFF] transition-all group">
              <span className="text-2xl text-[#C0C0C0] group-hover:text-[#00BFFF] mb-2">+</span>
              <span className="text-[9px] font-bold text-[#C0C0C0] group-hover:text-[#00BFFF] uppercase tracking-widest text-center px-2">Ver Todas</span>
            </Link>
          )}
        </div>
      </section>

      {/* ==========================================
          7. COMPARACIONES POPULARES
          ========================================== */}
      <section className="max-w-[1400px] mx-auto px-4 lg:px-8 my-16">
        <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4 mb-8 border-b border-[#0A1F33]/10 pb-4">
          <div>
            <span className="text-[10px] font-bold text-[#00BFFF] uppercase tracking-widest block mb-1">Métricas de Interés</span>
            <h2 className="font-black text-3xl text-[#0A1F33] uppercase" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
              Comparaciones populares
            </h2>
            <p className="text-sm text-[#C0C0C0] font-medium mt-1">Lo que más comparan los compradores en Paraguay</p>
          </div>
          <Link href="/comparador" className="text-[11px] font-bold text-[#00BFFF] hover:underline uppercase tracking-widest transition-colors mb-1 sm:mb-0">
            Ir al comparador →
          </Link>
        </div>
        <div className="flex flex-wrap gap-3.5">
          {topComparisons.length > 0 ? (
            topComparisons.map((comp, idx) => (
              <Link
                key={idx}
                href={`/comparador?autos=${Array.isArray(comp.ids) ? comp.ids.join(',') : comp.ids}`}
                className="border border-[#0A1F33]/10 hover:border-[#00BFFF] bg-[#FFFFFF] rounded-xl shadow-xs hover:shadow-md hover:-translate-y-0.5 px-5 py-4 text-center font-bold text-[#0A1F33] text-[11px] uppercase tracking-widest transition-all hover:text-[#00BFFF]"
              >
                {comp.combo}
              </Link>
            ))
          ) : (
            <p className="text-[10px] text-[#C0C0C0] font-bold uppercase tracking-widest">Cargando comparaciones...</p>
          )}
        </div>
      </section>

      {/* ==========================================
          8. NEGOCIAMOS POR VOS
          ========================================== */}
      <section className="max-w-[1400px] mx-auto px-4 lg:px-8 my-16">
        <div className="bg-[#0A1F33] border border-[#0A1F33] rounded-3xl shadow-xl overflow-hidden w-full p-6 md:p-14 flex flex-col md:flex-row items-center justify-between relative">
          <div className="absolute top-0 left-0 w-2 h-full bg-[#00BFFF]"></div>
          <div className="md:w-1/2 z-10 mb-8 md:mb-0 md:pr-8">
            <span className="border border-[#00BFFF]/50 text-[#00BFFF] rounded-full text-[9px] font-bold uppercase px-3.5 py-1 tracking-widest mb-4 inline-block bg-[#FFFFFF]/5">Nuevo Servicio</span>
            <h2 className="font-black text-3xl sm:text-4xl md:text-5xl lg:text-6xl text-[#FFFFFF] uppercase leading-tight break-words mb-6" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>Negociamos <br/><span className="text-[#C0C0C0]">por vos.</span></h2>
            <p className="text-[#C0C0C0] text-sm max-w-md mb-8 leading-relaxed" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>El mercado vende autos todos los días. Vos comprás uno cada 5 años. Ponemos nuestra experiencia técnica y financiera a tu favor.</p>
            <Link href="/negociamos-por-vos" className="bg-[#00BFFF] hover:bg-[#FFFFFF] text-[#0A1F33] font-bold text-xs uppercase tracking-widest py-4 px-10 rounded-xl shadow-md transition-all inline-block">Consultar Asesoría →</Link>
          </div>
          <div className="md:w-1/2 flex justify-end w-full z-10">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3.5 w-full max-w-lg text-center">
              <div className="border border-[#FFFFFF]/15 rounded-2xl p-6 bg-[#FFFFFF]/5 hover:bg-[#FFFFFF]/10 transition-all backdrop-blur-xs"><p className="font-black text-3xl text-[#00BFFF] mb-2" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>$3,5M</p><p className="text-[9px] text-[#C0C0C0] uppercase font-bold tracking-widest">Ahorro Promedio</p></div>
              <div className="border border-[#FFFFFF]/15 rounded-2xl p-6 bg-[#FFFFFF]/5 hover:bg-[#FFFFFF]/10 transition-all backdrop-blur-xs"><p className="font-black text-3xl text-[#00BFFF] mb-2" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>35x</p><p className="text-[9px] text-[#C0C0C0] uppercase font-bold tracking-widest">Retorno del Servicio</p></div>
              <div className="border border-[#FFFFFF]/15 rounded-2xl p-6 bg-[#FFFFFF]/5 col-span-2 lg:col-span-1 hover:bg-[#FFFFFF]/10 transition-all backdrop-blur-xs"><p className="font-black text-3xl text-[#00BFFF] mb-2" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>700+</p><p className="text-[9px] text-[#C0C0C0] uppercase font-bold tracking-widest">Autos Gestionados</p></div>
              <p className="col-span-2 lg:col-span-3 text-[9px] text-[#C0C0C0]/70 leading-relaxed text-left mt-1">
                Promedios sobre operaciones cerradas a través de DATACAR. El ahorro compara el precio final negociado contra el precio de lista publicado; el retorno es ese ahorro frente al costo del servicio.
              </p>
            </div>
          </div>
        </div>
      </section>


      {/* ==========================================
          8.5 DATACAR EN INSTAGRAM (REELS & RESEÑAS)
          ========================================== */}
      <InstagramReelsSection />

      {/* ==========================================
          2.8 FOOTER CORPORATIVO INYECTADO
          ========================================== */}
      <Footer />
    </main>
  );
}