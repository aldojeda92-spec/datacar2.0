// app/catalogo/[marca]/[modelo]/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
// CORRECCIÓN DE RUTAS: 4 niveles para lib (raíz), 3 niveles para components (dentro de app)
import { db } from '../../../../lib/firebase';
import { isOptimizableImageSrc, isValidImageSrc } from '../../../../lib/imageSrc';
import { normalizeCarroceria } from '../../../../lib/carroceria';
import { FinancialConfig, DEFAULT_FINANCIAL_CONFIG, calcularCuotaFrancesa } from '../../../../lib/finance';
import LeadModal from '../../../components/LeadModal';
import NewsletterForm from '../../../components/NewsletterForm';
import Modal from '../../../components/a11y/Modal';
import { useToast } from '../../../context/ToastContext';
import { useDisclosure } from '../../../../lib/useDisclosure';
import { FAQ_FICHA_VEHICULO as faqs } from '../../../../lib/faqData';
import { getStoredCompareList, saveCompareList, clearStoredCompareList } from '../../../../lib/compareStorage';

// ==========================================
// INTERFACES
// ==========================================
interface ModelData {
  id: string; brandId: string; name: string; tipo_carroceria: string; startingPrice: number; imgUrl: string; origen: string;
}
interface VersionData {
  id: string; modelId: string; name: string; price: number; concesionaria?: string; promocion?: string; url_auto?: string;
  specs: { 
    motor: string; transmision: string; combustible: string; traccion: string; plazas: number; 
    airbags: number; tamanho_pantalla: number; garantia: string; alimentacion?: string; autonomi_electrica?: string; conectividad?: string;
  };
  chasis?: { 
    medida_neumatico?: string; tipo_llanta?: string; detalle_suspension?: string; detalles_freno?: string; 
  };
  dimensiones: { largo: number; ancho: number; alto: number; despeje_suelo: number; baulera_litros: number; };
  features: { 
    adas: string[]; asiento_cuero: string; techo_panoramico: string; 
    confort_conveniencia?: string[]; seguridad_standard?: string[]; 
  };
}
interface BrandData { name: string; origen_marca: string; }

export default function ModeloDetailClient() {
  const params = useParams();
  const marcaSlug = params.marca as string;
  const modeloSlug = params.modelo as string;

  const [loading, setLoading] = useState(true);
  const [model, setModel] = useState<ModelData | null>(null);
  const [brand, setBrand] = useState<BrandData | null>(null);
  const [versions, setVersions] = useState<VersionData[]>([]);
  const [baseVersion, setBaseVersion] = useState<VersionData | null>(null);
  
  const [precioDesde, setPrecioDesde] = useState<number>(0);

  // Estados Financieros
  const [config, setConfig] = useState<FinancialConfig>(DEFAULT_FINANCIAL_CONFIG);
  const [cuotaCalculada, setCuotaCalculada] = useState<number | null>(null);

  // Estados UI (Modales y Expansores Flat)
  const [showConsultar, setShowConsultar] = useState(false);
  const [versionToConsult, setVersionToConsult] = useState<VersionData | null>(null); // Nuevo estado dinámico para LeadModal
  const [showCalcular, setShowCalcular] = useState(false);
  const confortDisclosure = useDisclosure(false);
  const securityDisclosure = useDisclosure(false);

  const [compareList, setCompareList] = useState<{id: string, name: string, price: number}[]>([]);

  // Formularios
  const [calcForm, setCalcForm] = useState({ entrega: '', plazo: '36' });
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  // Estado Footer (FAQ)
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const { showToast } = useToast();

  // ==========================================
  // 1. OBTENCIÓN Y CÁLCULO DE DATOS
  // ==========================================
  useEffect(() => {
    const fetchData = async () => {
      if (!modeloSlug || !marcaSlug) return;
      setLoading(true);
      try {
        const confSnap = await getDoc(doc(db, 'config', 'financial'));
        if (confSnap.exists()) setConfig(confSnap.data() as FinancialConfig);

        const modelRef = doc(db, 'models', modeloSlug);
        const modelSnap = await getDoc(modelRef);
        if (!modelSnap.exists()) { setLoading(false); return; }
        const modelData = { id: modelSnap.id, ...modelSnap.data() } as ModelData;
        setModel(modelData);

        const brandRef = doc(db, 'brands', modelData.brandId);
        const brandSnap = await getDoc(brandRef);
        if (brandSnap.exists()) setBrand(brandSnap.data() as BrandData);

        const q = query(collection(db, 'versions'), where('modelId', '==', modelData.id));
        const versionsSnap = await getDocs(q);
        const versionsList = versionsSnap.docs.map(d => ({ id: d.id, ...d.data() } as VersionData));
        
        const validVersions = versionsList.filter(v => v.price > 0);
        validVersions.sort((a, b) => a.price - b.price);
        
        setVersions(validVersions);
        if (validVersions.length > 0) {
          setBaseVersion(validVersions[0]);
          setPrecioDesde(validVersions[0].price);
        } else {
          setPrecioDesde(modelData.startingPrice);
        }

        setCompareList(getStoredCompareList());

      } catch (error) { console.error("Error obteniendo datos:", error); } 
      finally { setLoading(false); }
    };
    fetchData();
  }, [modeloSlug, marcaSlug]);

  // ==========================================
  // LÓGICAS OPERATIVAS
  // ==========================================
  const handleCalcular = (e: React.FormEvent) => {
    e.preventDefault();
    const entregaNum = Number(calcForm.entrega) || 0;
    const plazoNum = Number(calcForm.plazo) || 36;
    if (entregaNum >= precioDesde) { setFeedback({ type: 'error', message: 'La entrega debe ser menor al precio del auto.' }); return; }

    setCuotaCalculada(calcularCuotaFrancesa(precioDesde, entregaNum, plazoNum, config));
    setFeedback({ type: '', message: '' });
  };

  const handleComparar = (version: VersionData) => {
    if (compareList.length >= 3) { showToast('Límite de 3 autos en el comparador.'); return; }
    if (!compareList.find(v => v.id === version.id)) {
      const newItem = { id: version.id, name: `${brand?.name} ${model?.name} ${version.name}`, price: version.price };
      const newList = [...compareList, newItem];
      setCompareList(newList); saveCompareList(newList);
    }
  };

  const handleRemoveCompare = (id: string) => {
    const newList = compareList.filter(v => v.id !== id);
    setCompareList(newList); saveCompareList(newList);
  };

  const clearCompare = () => { setCompareList([]); clearStoredCompareList(); };


  if (loading) return <div className="min-h-screen bg-[#FFFFFF] flex items-center justify-center font-bold text-[#0A1F33] tracking-widest uppercase text-sm">Cargando información del auto...</div>;
  if (!model) return <div className="min-h-screen bg-[#FFFFFF] flex items-center justify-center font-bold text-[#D93025] tracking-widest uppercase text-sm">Vehículo no encontrado.</div>;

  return (
    <main className="min-h-screen bg-[#FFFFFF] text-[#3A3A3C] font-sans pb-32">
      
      {/* NAVBAR CORPORATIVO (Flat) */}
      <nav className="w-full bg-[#FFFFFF] border-b border-[#C0C0C0] px-4 md:px-8 py-4 flex justify-between items-center sticky top-0 z-40">
        <div className="font-black text-2xl tracking-widest text-[#0A1F33] uppercase" style={{ fontFamily: 'Montserrat, sans-serif' }}><Link href="/">DATA<span className="font-light">CAR</span></Link></div>
        <div className="hidden md:flex gap-6 font-bold text-[11px] uppercase items-center text-[#3A3A3C] tracking-wider" style={{ fontFamily: 'Inter, sans-serif' }}>
          <Link href="/recomendador" className="hover:text-[#00BFFF] transition-colors">Recomendador</Link>
          <Link href="/comparador" className="hover:text-[#00BFFF] transition-colors">Comparador</Link>
        </div>
        <Link href="/catalogo" className="bg-[#FFFFFF] border border-[#0A1F33] text-[#0A1F33] font-bold text-[11px] uppercase tracking-widest py-3 px-8 hover:bg-[#0A1F33] hover:text-[#FFFFFF] transition-colors">Volver al Catálogo</Link>
      </nav>

      {/* BREADCRUMBS */}
      <div className="max-w-[1200px] mx-auto px-4 lg:px-8 pt-6 pb-2">
        <p className="text-[10px] font-medium text-[#C0C0C0] uppercase tracking-widest">
          <Link href="/" className="hover:text-[#3A3A3C] transition-colors">Inicio</Link> / 
          <Link href="/catalogo" className="hover:text-[#3A3A3C] transition-colors"> Catálogo</Link> / 
          <Link href={`/catalogo?marca=${brand?.name}`} className="hover:text-[#3A3A3C] transition-colors"> {brand?.name}</Link> / 
          <span className="font-bold text-[#3A3A3C]"> {model.name}</span>
        </p>
      </div>

      {/* ==========================================
          1. HERO SECTION (Propuesta de Valor Flat)
          ========================================== */}
      <section className="max-w-[1200px] mx-auto px-4 lg:px-8 py-4 mb-8">
        <div className="bg-[#FFFFFF] border border-[#C0C0C0] flex flex-col md:flex-row">
          <div className="md:w-3/5 p-10 flex items-center justify-center border-b md:border-b-0 md:border-r border-[#C0C0C0] bg-[#FFFFFF] relative">
            <div className="relative w-full max-w-xl aspect-[4/3]">
              {isValidImageSrc(model.imgUrl) ? (
                <Image
                  src={model.imgUrl}
                  alt={model.name}
                  fill
                  sizes="(max-width: 768px) 90vw, 40vw"
                  className="object-contain hover:scale-105 transition-transform duration-500"
                  preload
                  unoptimized={!isOptimizableImageSrc(model.imgUrl)}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-[#C0C0C0] uppercase tracking-widest">Sin Imagen</div>
              )}
            </div>
            <span className="absolute bottom-4 right-4 text-[9px] text-[#C0C0C0] uppercase tracking-widest">* Imagen de carácter ilustrativo</span>
          </div>

          <div className="md:w-2/5 p-10 flex flex-col justify-center bg-[#F8F9FA]">
            <h1 className="text-xl md:text-2xl text-[#3A3A3C] uppercase tracking-wide mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
              {brand?.name} <span className="font-black text-[#0A1F33] text-3xl md:text-4xl block" style={{ fontFamily: 'Montserrat, sans-serif' }}>{model.name}</span>
            </h1>
            <p className="text-[11px] text-[#C0C0C0] font-bold uppercase tracking-widest mb-6">
              {normalizeCarroceria(model.tipo_carroceria)} | Origen: {model.origen || brand?.origen_marca || 'Consultar'}
            </p>

            <div className="mb-6 border-l-2 border-[#00BFFF] pl-4">
              <span className="text-[10px] uppercase font-bold text-[#3A3A3C] tracking-widest block mb-1">Precio Desde</span>
              <span className="font-black text-4xl text-[#0A1F33]" style={{ fontFamily: 'Montserrat, sans-serif' }}>US$ {precioDesde.toLocaleString()}</span>
              <span className="text-[9px] text-[#C0C0C0] uppercase font-bold tracking-widest block mt-1">+ Gastos de patentamiento</span>
            </div>

            <div className="bg-[#E6F4EA] border border-[#1E8E3E]/30 p-4 mb-8 flex items-start gap-3">
              <svg className="w-5 h-5 text-[#1E8E3E] shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
              <div>
                <p className="text-[11px] font-bold text-[#1E8E3E] uppercase tracking-widest mb-1">Compra Protegida</p>
                <p className="text-[9px] text-[#1E8E3E]/80 uppercase">Gestión documental y análisis sin costo extra.</p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {/* TRIGGER MODAL GLOBAL: Envía el modelo general */}
              <button onClick={() => { setVersionToConsult(null); setShowConsultar(true); }} className="w-full bg-[#00BFFF] hover:bg-[#0A1F33] text-[#FFFFFF] font-bold text-xs uppercase tracking-widest py-4 transition-colors flex items-center justify-center gap-2 border border-transparent rounded-none">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeLinejoin="miter" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg> Consultar Asesor
              </button>
              <button onClick={() => setShowCalcular(true)} className="w-full bg-[#FFFFFF] border border-[#0A1F33] text-[#0A1F33] hover:bg-[#0A1F33] hover:text-[#FFFFFF] font-bold text-xs uppercase tracking-widest py-4 transition-colors flex items-center justify-center gap-2 rounded-none">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeLinejoin="miter" strokeWidth="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg> Calcular Cuota
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ==========================================
          2. LISTA DE VERSIONES
          ========================================== */}
      <section className="max-w-[1200px] mx-auto px-4 lg:px-8 mb-16">
        <div className="flex justify-between items-end border-b border-[#C0C0C0] pb-4 mb-6">
          <h2 className="font-black text-2xl text-[#0A1F33] uppercase" style={{ fontFamily: 'Montserrat, sans-serif' }}>Opciones de Gama</h2>
          <span className="text-[11px] font-bold text-[#C0C0C0] uppercase tracking-widest">{versions.length} versiones</span>
        </div>

        <div className="flex flex-col gap-4">
          {versions.map((ver, idx) => {
            const isInCompare = compareList.some(item => item.id === ver.id);
            return (
              <div key={ver.id} className="bg-[#FFFFFF] border border-[#C0C0C0] p-6 flex flex-col lg:flex-row items-center gap-6 hover:border-[#0A1F33] transition-colors">
                <div className="lg:w-1/2 flex flex-col gap-4 w-full">
                  <div className="flex items-center gap-3">
                    <h3 className="font-black text-xl text-[#0A1F33] uppercase" style={{ fontFamily: 'Montserrat, sans-serif' }}>{ver.name}</h3>
                    {idx === 0 && <span className="bg-[#00BFFF]/10 text-[#00BFFF] border border-[#00BFFF]/30 text-[8px] font-bold uppercase px-2 py-1 tracking-widest">Entrada</span>}
                    {idx === versions.length -1 && versions.length > 1 && <span className="bg-[#0A1F33]/10 text-[#0A1F33] border border-[#0A1F33]/30 text-[8px] font-bold uppercase px-2 py-1 tracking-widest">Tope de Gama</span>}
                  </div>
                  
                  <div className="flex flex-wrap gap-x-6 gap-y-2 text-[11px] text-[#3A3A3C] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                    <div className="flex items-center gap-2"><svg className="w-4 h-4 text-[#C0C0C0]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg> {ver.specs.transmision || 'Consultar'}</div>
                    <div className="flex items-center gap-2"><svg className="w-4 h-4 text-[#C0C0C0]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> {ver.specs.motor || 'Consultar'}</div>
                    {ver.features.techo_panoramico === 'Sí' && (
                      <div className="flex items-center gap-2"><svg className="w-4 h-4 text-[#C0C0C0]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path></svg> Techo Panorámico</div>
                    )}
                  </div>
                </div>

                <div className="lg:w-1/2 flex flex-col sm:flex-row items-center justify-end gap-6 w-full border-t lg:border-t-0 lg:border-l border-[#C0C0C0] pt-6 lg:pt-0 lg:pl-6">
                  <div className="text-center sm:text-left w-full sm:w-auto">
                    <span className="text-[9px] text-[#C0C0C0] font-bold uppercase tracking-widest block mb-0.5">Precio Sugerido</span>
                    <span className="font-black text-2xl text-[#0A1F33] block" style={{ fontFamily: 'Montserrat, sans-serif' }}>US$ {ver.price.toLocaleString()}</span>
                  </div>
                  <div className="flex flex-col gap-2 w-full sm:w-auto">
                    {/* TRIGGER MODAL GLOBAL: Envía la versión específica */}
                    <button onClick={() => { setVersionToConsult(ver); setShowConsultar(true); }} className="w-full sm:w-40 bg-[#00BFFF] hover:bg-[#0A1F33] text-[#FFFFFF] font-bold text-[10px] uppercase tracking-widest py-3 transition-colors border border-transparent rounded-none">Consultar</button>
                    <div className="flex gap-2">
                      <Link href={`/catalogo/${marcaSlug}/${modeloSlug}/${ver.id}`} className="flex-1 sm:w-20 text-center bg-[#FFFFFF] border border-[#0A1F33] text-[#0A1F33] hover:bg-[#0A1F33] hover:text-[#FFFFFF] font-bold text-[9px] uppercase tracking-widest py-2.5 transition-colors rounded-none">Detalles</Link>
                      <button onClick={() => handleComparar(ver)} className={`flex-1 sm:w-24 border font-bold text-[9px] uppercase tracking-widest py-2.5 transition-colors flex justify-center items-center gap-1 rounded-none ${isInCompare ? 'bg-[#E6F4EA] border-[#1E8E3E] text-[#1E8E3E]' : 'bg-[#F8F9FA] border-[#C0C0C0] text-[#3A3A3C] hover:border-[#00BFFF] hover:text-[#00BFFF]'}`}>
                        {isInCompare ? <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg> Agregado</> : '+ Comparar'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ==========================================
          3. Ficha Técnica General (Matriz 5)
          ========================================== */}
      {baseVersion && (
        <section className="max-w-[1200px] mx-auto px-4 lg:px-8 mb-16">
          <h2 className="font-black text-2xl text-[#0A1F33] uppercase mb-6" style={{ fontFamily: 'Montserrat, sans-serif' }}>Ficha Técnica General</h2>
          
          <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-8">
            
            {/* Highlights Superiores */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-8 border-b border-[#C0C0C0]/50 pb-8">
               <div className="flex items-center gap-4">
                 <div className="w-10 h-10 bg-[#F8F9FA] border border-[#C0C0C0] flex items-center justify-center text-[#3A3A3C]">
                   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                 </div>
                 <div><p className="text-[9px] text-[#C0C0C0] font-bold uppercase tracking-widest">Carrocería</p><p className="font-bold text-xs text-[#0A1F33] uppercase">{normalizeCarroceria(model.tipo_carroceria)}</p></div>
               </div>
               <div className="flex items-center gap-4">
                 <div className="w-10 h-10 bg-[#F8F9FA] border border-[#C0C0C0] flex items-center justify-center text-[#3A3A3C]">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                 </div>
                 <div><p className="text-[9px] text-[#C0C0C0] font-bold uppercase tracking-widest">Combustible Base</p><p className="font-bold text-xs text-[#0A1F33] uppercase">{baseVersion.specs.combustible}</p></div>
               </div>
               <div className="flex items-center gap-4">
                 <div className="w-10 h-10 bg-[#F8F9FA] border border-[#C0C0C0] flex items-center justify-center text-[#3A3A3C]">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
                 </div>
                 <div><p className="text-[9px] text-[#C0C0C0] font-bold uppercase tracking-widest">Seguridad Base</p><p className="font-bold text-xs text-[#0A1F33] uppercase">{baseVersion.specs.airbags} Airbags</p></div>
               </div>
               <div className="flex items-center gap-4">
                 <div className="w-10 h-10 bg-[#F8F9FA] border border-[#C0C0C0] flex items-center justify-center text-[#3A3A3C]">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path></svg>
                 </div>
                 <div><p className="text-[9px] text-[#C0C0C0] font-bold uppercase tracking-widest">Habitáculo</p><p className="font-bold text-xs text-[#0A1F33] uppercase">{baseVersion.specs.plazas} Asientos</p></div>
               </div>
            </div>

            {/* Grillas de Datos Detallados */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              
              {/* Columna Izquierda: Dinámica */}
              <div>
                <h3 className="text-xs font-bold text-[#00BFFF] uppercase tracking-widest border-b border-[#00BFFF]/30 pb-2 mb-4">Mecánica y Desempeño</h3>
                <ul className="flex flex-col gap-3 text-[11px] text-[#3A3A3C]">
                  <li className="flex justify-between border-b border-[#F5F5F5] pb-2"><span className="text-[#C0C0C0] uppercase font-bold tracking-widest text-[9px]">Configuración</span> <span className="font-medium text-right uppercase">{baseVersion.specs.motor || '-'}</span></li>
                  <li className="flex justify-between border-b border-[#F5F5F5] pb-2"><span className="text-[#C0C0C0] uppercase font-bold tracking-widest text-[9px]">Alimentación</span> <span className="font-medium text-right uppercase">{baseVersion.specs.alimentacion || 'Inyección Estándar'}</span></li>
                  <li className="flex justify-between border-b border-[#F5F5F5] pb-2"><span className="text-[#C0C0C0] uppercase font-bold tracking-widest text-[9px]">Transmisión</span> <span className="font-medium text-right uppercase">{baseVersion.specs.transmision || '-'}</span></li>
                  <li className="flex justify-between border-b border-[#F5F5F5] pb-2"><span className="text-[#C0C0C0] uppercase font-bold tracking-widest text-[9px]">Tracción</span> <span className="font-medium text-right uppercase">{baseVersion.specs.traccion || '-'}</span></li>
                  {baseVersion.specs.autonomi_electrica && (
                    <li className="flex justify-between border-b border-[#F5F5F5] pb-2"><span className="text-[#00BFFF] uppercase font-bold tracking-widest text-[9px]">Autonomía Eléctrica</span> <span className="font-black text-[#0A1F33] text-right uppercase">{baseVersion.specs.autonomi_electrica}</span></li>
                  )}
                </ul>

                <h3 className="text-xs font-bold text-[#00BFFF] uppercase tracking-widest border-b border-[#00BFFF]/30 pb-2 mb-4 mt-8">Chasis y Arquitectura</h3>
                <ul className="flex flex-col gap-3 text-[11px] text-[#3A3A3C]">
                  <li className="flex justify-between border-b border-[#F5F5F5] pb-2"><span className="text-[#C0C0C0] uppercase font-bold tracking-widest text-[9px]">Suspensión</span> <span className="font-medium text-right uppercase">{baseVersion.chasis?.detalle_suspension || 'Consultar'}</span></li>
                  <li className="flex justify-between border-b border-[#F5F5F5] pb-2"><span className="text-[#C0C0C0] uppercase font-bold tracking-widest text-[9px]">Frenos</span> <span className="font-medium text-right uppercase">{baseVersion.chasis?.detalles_freno || 'Consultar'}</span></li>
                  <li className="flex justify-between border-b border-[#F5F5F5] pb-2"><span className="text-[#C0C0C0] uppercase font-bold tracking-widest text-[9px]">Neumáticos y Llantas</span> <span className="font-medium text-right uppercase">{baseVersion.chasis?.medida_neumatico || 'Consultar'} - {baseVersion.chasis?.tipo_llanta || ''}</span></li>
                  <li className="flex justify-between border-b border-[#F5F5F5] pb-2"><span className="text-[#C0C0C0] uppercase font-bold tracking-widest text-[9px]">Dimensiones (L/A/A)</span> <span className="font-medium text-right uppercase">{baseVersion.dimensiones.largo || '-'} / {baseVersion.dimensiones.ancho || '-'} / {baseVersion.dimensiones.alto || '-'} mm</span></li>
                  <li className="flex justify-between border-b border-[#F5F5F5] pb-2"><span className="text-[#C0C0C0] uppercase font-bold tracking-widest text-[9px]">Capacidad Baulera</span> <span className="font-medium text-right uppercase">{baseVersion.dimensiones.baulera_litros ? `${baseVersion.dimensiones.baulera_litros} Litros` : '-'}</span></li>
                </ul>
              </div>

              {/* Columna Derecha: Equipamiento Estructurado */}
              <div>
                <h3 className="text-xs font-bold text-[#00BFFF] uppercase tracking-widest border-b border-[#00BFFF]/30 pb-2 mb-4">Seguridad Estándar y ADAS</h3>
                <div className="flex flex-col gap-2">
                  {baseVersion.features.seguridad_standard && baseVersion.features.seguridad_standard.length > 0 ? (
                    <>
                      <div {...securityDisclosure.panelProps} className="flex flex-col gap-2">
                        {(securityDisclosure.isOpen ? baseVersion.features.seguridad_standard : baseVersion.features.seguridad_standard.slice(0, 4)).map((item, i) => (
                          <div key={i} className="flex items-start gap-2 text-[11px] text-[#3A3A3C] font-medium leading-tight">
                            <span className="text-[#00BFFF] text-lg leading-none mt-[-2px]">•</span> {item}
                          </div>
                        ))}
                      </div>
                      {baseVersion.features.seguridad_standard.length > 4 && (
                        <button onClick={securityDisclosure.toggle} {...securityDisclosure.buttonProps} className="text-left mt-2 text-[9px] font-bold text-[#0A1F33] hover:text-[#00BFFF] uppercase tracking-widest transition-colors border-none outline-none">
                          {securityDisclosure.isOpen ? 'Ocultar Detalle ↑' : `Ver ${baseVersion.features.seguridad_standard.length - 4} características más ↓`}
                        </button>
                      )}
                    </>
                  ) : <span className="text-[10px] text-[#C0C0C0] uppercase tracking-widest">Información en proceso de carga.</span>}

                  {/* ADAS Dedicado */}
                  {baseVersion.features.adas && baseVersion.features.adas.length > 0 && baseVersion.features.adas[0] !== '' && (
                    <div className="mt-2 p-3 bg-[#F8F9FA] border border-[#C0C0C0]/50">
                      <p className="text-[9px] font-bold text-[#0A1F33] uppercase tracking-widest mb-2">Asistencias a la Conducción (ADAS)</p>
                      {baseVersion.features.adas.map((item, i) => (
                        <div key={`adas_${i}`} className="flex items-start gap-2 text-[10px] text-[#3A3A3C] uppercase font-medium mb-1">
                          <svg className="w-3 h-3 text-[#1E8E3E] shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg> {item}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <h3 className="text-xs font-bold text-[#00BFFF] uppercase tracking-widest border-b border-[#00BFFF]/30 pb-2 mb-4 mt-8">Confort y Tecnología</h3>
                <div className="flex flex-col gap-2">
                  <div className="flex items-start gap-2 text-[11px] text-[#3A3A3C] font-medium leading-tight"><span className="text-[#00BFFF] text-lg leading-none mt-[-2px]">•</span> Pantalla Multimedia: {baseVersion.specs.tamanho_pantalla ? `${baseVersion.specs.tamanho_pantalla}"` : 'Sí'}</div>
                  <div className="flex items-start gap-2 text-[11px] text-[#3A3A3C] font-medium leading-tight"><span className="text-[#00BFFF] text-lg leading-none mt-[-2px]">•</span> Conectividad: {baseVersion.specs.conectividad || 'Consultar'}</div>
                  <div className="flex items-start gap-2 text-[11px] text-[#3A3A3C] font-medium leading-tight"><span className="text-[#00BFFF] text-lg leading-none mt-[-2px]">•</span> Tapizado: {baseVersion.features.asiento_cuero || 'Tela'}</div>
                  
                  {baseVersion.features.confort_conveniencia && baseVersion.features.confort_conveniencia.length > 0 && (
                    <>
                      <div {...confortDisclosure.panelProps} className="flex flex-col gap-2">
                        {(confortDisclosure.isOpen ? baseVersion.features.confort_conveniencia : baseVersion.features.confort_conveniencia.slice(0, 3)).map((item, i) => (
                          <div key={i} className="flex items-start gap-2 text-[11px] text-[#3A3A3C] font-medium leading-tight">
                            <span className="text-[#00BFFF] text-lg leading-none mt-[-2px]">•</span> {item}
                          </div>
                        ))}
                      </div>
                      {baseVersion.features.confort_conveniencia.length > 3 && (
                        <button onClick={confortDisclosure.toggle} {...confortDisclosure.buttonProps} className="text-left mt-2 text-[9px] font-bold text-[#0A1F33] hover:text-[#00BFFF] uppercase tracking-widest transition-colors border-none outline-none">
                          {confortDisclosure.isOpen ? 'Ocultar Detalle ↑' : `Ver ${baseVersion.features.confort_conveniencia.length - 3} detalles más ↓`}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ==========================================
          MODALES DE CONVERSIÓN
          ========================================== */}
      
      {/* INYECCIÓN DEL MODAL GLOBAL B2B */}
      <LeadModal
        isOpen={showConsultar}
        onClose={() => setShowConsultar(false)}
        vehiculoInteres={versionToConsult ? versionToConsult.name : model.name}
        marcaVehiculo={brand?.name || ''}
        origenLead="Ficha Modelo y Versiones"
        concesionariaDestino={versionToConsult?.concesionaria || baseVersion?.concesionaria || brand?.name || 'Central DATACAR'}
      />

      <Modal
        isOpen={showCalcular}
        onClose={() => { setShowCalcular(false); setCuotaCalculada(null); setFeedback({type:'', message:''}); }}
        overlayClassName="fixed inset-0 bg-[#0A1F33]/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
        panelClassName="bg-[#FFFFFF] p-8 max-w-md w-full border-t-4 border-[#0A1F33] rounded-none"
      >
            <button onClick={() => { setShowCalcular(false); setCuotaCalculada(null); setFeedback({type:'', message:''}); }} className="absolute top-4 right-4 text-[#C0C0C0] hover:text-[#D93025] font-black border-none outline-none">✕</button>
            <h3 className="font-black text-2xl text-[#0A1F33] uppercase mb-1" style={{ fontFamily: 'Montserrat, sans-serif' }}>Plan Financiero</h3>
            <p className="text-[10px] font-bold text-[#C0C0C0] uppercase tracking-widest mb-6">Proyección desde US$ {precioDesde.toLocaleString()}</p>
            <form onSubmit={handleCalcular} className="flex flex-col gap-4">
              <div><label htmlFor="modelo-calc-entrega" className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest block mb-2">Entrega Inicial (USD)</label><input id="modelo-calc-entrega" type="number" placeholder="Ej: 10000" className="w-full border border-[#C0C0C0] p-3 text-xs focus:outline-none focus:border-[#0A1F33] bg-[#F8F9FA] rounded-none" required value={calcForm.entrega} onChange={e=>setCalcForm({...calcForm, entrega: e.target.value})} /></div>
              <div>
                <label htmlFor="modelo-calc-plazo" className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest block mb-2">Plazo de Financiación</label>
                <select id="modelo-calc-plazo" className="w-full border border-[#C0C0C0] p-3 text-xs focus:outline-none focus:border-[#0A1F33] bg-[#FFFFFF] rounded-none" value={calcForm.plazo} onChange={e=>setCalcForm({...calcForm, plazo: e.target.value})}>
                  <option value="12">12 Meses</option><option value="24">24 Meses</option><option value="36">36 Meses</option><option value="48">48 Meses</option><option value="60">60 Meses</option>
                </select>
              </div>
              <button type="submit" className="w-full bg-[#00BFFF] hover:bg-[#0A1F33] text-[#FFFFFF] font-bold text-xs uppercase tracking-widest py-4 transition-colors mt-2 border border-transparent rounded-none">Generar Simulación</button>
              {feedback.message && feedback.type === 'error' && <p className="text-[10px] text-center font-bold uppercase tracking-widest mt-2 text-[#D93025]">{feedback.message}</p>}
              {cuotaCalculada !== null && feedback.type !== 'error' && (
                <div className="mt-4 border-t-4 border-[#0A1F33] bg-[#F8F9FA] p-6 text-center">
                  <p className="text-[11px] font-bold text-[#C0C0C0] uppercase tracking-widest mb-2">Cuota Mensual Estimada</p>
                  <p className="font-black text-4xl text-[#0A1F33]" style={{ fontFamily: 'Montserrat, sans-serif' }}>US$ {cuotaCalculada.toLocaleString('en-US', {maximumFractionDigits: 0})}</p>
                  <p className="text-[9px] text-[#3A3A3C] uppercase tracking-widest mt-4 max-w-md mx-auto">* Tasa referencial {(config.tasa_anual * 100).toFixed(1)}% anual. Sujeto a aprobación crediticia.</p>
                </div>
              )}
            </form>
      </Modal>

      {/* DOCK DE COMPARACIÓN FLOTANTE */}
      {compareList.length > 0 && (
        <div className="fixed bottom-0 left-0 w-full bg-[#0A1F33] border-t-4 border-[#00BFFF] text-[#FFFFFF] p-4 z-50 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
            <span className="font-bold text-[11px] uppercase tracking-widest text-[#00BFFF]">Comparador ({compareList.length}/3)</span>
            <div className="flex gap-2 flex-wrap justify-center">
              {compareList.map(v => (
                <div key={v.id} className="bg-[#FFFFFF]/10 border border-[#FFFFFF]/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest flex items-center gap-3">
                  <span className="truncate max-w-[120px]">{v.name}</span>
                  <button onClick={() => handleRemoveCompare(v.id)} className="text-[#C0C0C0] hover:text-[#D93025] transition-colors border-none outline-none" title="Quitar"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg></button>
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-4 w-full md:w-auto justify-center">
            <button onClick={clearCompare} className="text-[10px] font-bold uppercase tracking-widest text-[#C0C0C0] hover:text-[#FFFFFF] transition-colors border-none outline-none">Limpiar</button>
            <Link href="/comparador" className="bg-[#00BFFF] hover:bg-[#FFFFFF] hover:text-[#0A1F33] text-[#FFFFFF] text-[10px] font-bold uppercase tracking-widest px-8 py-3 transition-colors text-center border border-transparent rounded-none">Comparar Ahora</Link>
          </div>
        </div>
      )}

      {/* ==========================================
          FOOTER COMPLETO (FAQ + NEWSLETTER FLAT)
          ========================================== */}
      <div className="w-full bg-[#FFFFFF] border-t border-[#C0C0C0] mt-auto">
        {/* FAQ */}
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
                  aria-expanded={openFaq === index}
                  aria-controls={`faq-modelo-panel-${index}`}
                  className="w-full flex justify-between items-center text-left focus:outline-none group bg-transparent border-none"
                >
                  <span className="font-bold text-sm text-[#0A1F33] group-hover:text-[#00BFFF] transition-colors pr-4" style={{ fontFamily: 'Inter, sans-serif' }}>{faq.q}</span>
                  <span className="text-[#0A1F33] text-2xl font-light">{openFaq === index ? '−' : '+'}</span>
                </button>
                <div id={`faq-modelo-panel-${index}`} className={`overflow-hidden transition-all duration-300 ease-in-out ${openFaq === index ? 'max-h-40 opacity-100 mt-4' : 'max-h-0 opacity-0'}`}>
                  <p className="text-sm text-[#3A3A3C] leading-relaxed font-medium pr-8" style={{ fontFamily: 'Inter, sans-serif' }}>{faq.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* NEWSLETTER FLAT */}
        <div className="bg-[#0A1F33] border-t-4 border-[#00BFFF]">
          <div className="max-w-[1400px] mx-auto px-4 lg:px-8 py-16 flex flex-col md:flex-row justify-between items-center gap-12">
            <div className="md:w-1/2 text-center md:text-left">
              <h3 className="font-black text-3xl md:text-4xl text-[#FFFFFF] uppercase mb-4" style={{ fontFamily: 'Montserrat, sans-serif' }}>Suscribite a las oportunidades.</h3>
              <p className="text-sm text-[#C0C0C0] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>Sé el primero en enterarte de las mejores opciones de 0km en tu e-mail.</p>
            </div>
            <div className="md:w-1/2 w-full max-w-lg">
              <NewsletterForm origen="Ficha de Modelo" />
            </div>
          </div>
        </div>

        {/* DISCLAIMER */}
        <div className="bg-[#0A1F33] border-t border-[#FFFFFF]/10">
          <div className="max-w-[1400px] mx-auto px-4 lg:px-8 py-6">
            <p className="text-[10px] text-[#C0C0C0]/60 font-medium text-center md:text-left leading-relaxed">
              © {new Date().getFullYear()} DATACAR. Los vehículos están verificados con concesionarias oficiales. Los valores expresados no incluyen aranceles de patentamiento ni seguros.
            </p>
          </div>
        </div>
      </div>

    </main>
  );
}