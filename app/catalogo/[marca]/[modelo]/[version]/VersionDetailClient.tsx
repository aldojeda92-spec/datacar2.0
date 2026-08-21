'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../../../lib/firebase';
import { isOptimizableImageSrc, isValidImageSrc } from '../../../../../lib/imageSrc';
import { normalizeCarroceria } from '../../../../../lib/carroceria';
import { FinancialConfig, DEFAULT_FINANCIAL_CONFIG, calcularCuotaFrancesa } from '../../../../../lib/finance';
import LeadModal from '../../../../components/LeadModal'; // INYECCIÓN B2B
import NewsletterForm from '../../../../components/NewsletterForm'; // INYECCIÓN B2C
import Modal from '../../../../components/a11y/Modal';
import { useToast } from '../../../../context/ToastContext';
import { FAQ_FICHA_VEHICULO as faqs } from '../../../../../lib/faqData';
import { getStoredCompareList, saveCompareList, clearStoredCompareList } from '../../../../../lib/compareStorage';
import Navbar, { NavItem } from '../../../../components/Navbar';

const NAV_ITEMS: NavItem[] = [
  { type: 'link', label: 'Recomendador', href: '/recomendador' },
  { type: 'link', label: 'Comparador', href: '/comparador' },
];

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
    airbags: number; tamanho_pantalla: number; conectividad?: string; camaras?: string; garantia: string; 
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
}
interface BrandData { name: string; origen_marca: string; }

export default function VersionDetailClient() {
  const params = useParams();
  const versionId = params.version as string;
  const marcaSlug = params.marca as string;
  const modeloSlug = params.modelo as string;

  const [loading, setLoading] = useState(true);
  const [model, setModel] = useState<ModelData | null>(null);
  const [brand, setBrand] = useState<BrandData | null>(null);
  const [version, setVersion] = useState<VersionData | null>(null);
  
  const [config, setConfig] = useState<FinancialConfig>(DEFAULT_FINANCIAL_CONFIG);
  const [cuotaCalculada, setCuotaCalculada] = useState<number | null>(null);

  // Estados UI
  const [showConsultar, setShowConsultar] = useState(false);
  const [showCalcular, setShowCalcular] = useState(false);
  const [compareList, setCompareList] = useState<{id: string, name: string, price: number}[]>([]);

  // Formulario de Calculadora
  const [calcForm, setCalcForm] = useState({ entrega: '', plazo: '36' });
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  // Estados Footer (FAQ)
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const { showToast } = useToast();

  useEffect(() => {
    const fetchData = async () => {
      if (!versionId) return;
      setLoading(true);
      try {
        const confSnap = await getDoc(doc(db, 'config', 'financial'));
        if (confSnap.exists()) setConfig(confSnap.data() as FinancialConfig);

        const versionRef = doc(db, 'versions', versionId);
        const versionSnap = await getDoc(versionRef);
        
        if (!versionSnap.exists()) { setLoading(false); return; }
        const vData = { id: versionSnap.id, ...versionSnap.data() } as VersionData;
        setVersion(vData);

        const modelRef = doc(db, 'models', vData.modelId);
        const modelSnap = await getDoc(modelRef);
        if (modelSnap.exists()) {
          const mData = { id: modelSnap.id, ...modelSnap.data() } as ModelData;
          setModel(mData);
          
          const brandRef = doc(db, 'brands', mData.brandId);
          const brandSnap = await getDoc(brandRef);
          if (brandSnap.exists()) setBrand(brandSnap.data() as BrandData);
        }

        setCompareList(getStoredCompareList());

      } catch (error) { console.error("Error crítico leyendo datos:", error); } 
      finally { setLoading(false); }
    };
    fetchData();
  }, [versionId]);

  // ==========================================
  // LÓGICAS OPERATIVAS FRONTEND
  // ==========================================
  const handleCalcular = (e: React.FormEvent) => {
    e.preventDefault();
    if (!version) return;
    const entregaNum = Number(calcForm.entrega) || 0;
    const plazoNum = Number(calcForm.plazo) || 36;
    if (entregaNum >= version.price) { setFeedback({ type: 'error', message: 'La entrega debe ser inferior al precio.' }); return; }

    setCuotaCalculada(calcularCuotaFrancesa(version.price, entregaNum, plazoNum, config));
    setFeedback({ type: '', message: '' });
  };

  const handleComparar = () => {
    if (!version) return;
    if (compareList.length >= 3) { showToast('Matriz comparativa llena (Max 3 autos).'); return; }
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

  if (loading) return <div className="min-h-screen bg-[#FFFFFF] flex items-center justify-center font-bold text-[#0A1F33] tracking-widest uppercase text-sm">Cargando detalles del vehículo...</div>;
  if (!version || !model) return <div className="min-h-screen bg-[#FFFFFF] flex items-center justify-center font-bold text-[#D93025] tracking-widest uppercase text-sm">Registro no encontrado en base de datos.</div>;

  const isInCompare = compareList.some(item => item.id === version.id);

  return (
    <main className="min-h-screen bg-[#FFFFFF] text-[#3A3A3C] font-sans flex flex-col">
      
      <Navbar items={NAV_ITEMS} cta={{ label: 'Volver al Modelo', href: `/catalogo/${marcaSlug}/${modeloSlug}` }} />

      <div className="max-w-[1200px] mx-auto px-4 lg:px-8 pt-6 pb-2">
        <p className="text-[10px] font-medium text-[#C0C0C0] uppercase tracking-widest">
          <Link href="/" className="hover:text-[#3A3A3C] transition-colors">Inicio</Link> / 
          <Link href="/catalogo" className="hover:text-[#3A3A3C] transition-colors"> Catálogo</Link> / 
          <Link href={`/catalogo?marca=${brand?.name}`} className="hover:text-[#3A3A3C] transition-colors"> {brand?.name}</Link> / 
          <Link href={`/catalogo/${marcaSlug}/${modeloSlug}`} className="hover:text-[#3A3A3C] transition-colors"> {model.name}</Link> / 
          <span className="font-bold text-[#3A3A3C]"> {version.name}</span>
        </p>
      </div>

      <div className="flex-grow">
        <section className="max-w-[1200px] mx-auto px-4 lg:px-8 py-4 mb-8">
          <div className="bg-[#FFFFFF] border border-[#C0C0C0] flex flex-col md:flex-row">
            
            <div className="md:w-1/2 p-10 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-[#C0C0C0] bg-[#FFFFFF] relative">
              <div className="relative w-full max-w-lg aspect-[4/3] mb-6">
                {isValidImageSrc(model.imgUrl) ? (
                  <Image
                    src={model.imgUrl}
                    alt={version.name}
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
              <div className="w-full grid grid-cols-3 gap-2 border-t border-[#C0C0C0] pt-6">
                <div className="text-center"><p className="text-[9px] text-[#C0C0C0] font-bold uppercase tracking-widest mb-1">Combustible</p><p className="font-black text-xs text-[#0A1F33] uppercase">{version.specs.combustible}</p></div>
                <div className="text-center border-l border-r border-[#C0C0C0]"><p className="text-[9px] text-[#C0C0C0] font-bold uppercase tracking-widest mb-1">Transmisión</p><p className="font-black text-xs text-[#0A1F33] uppercase">{version.specs.transmision}</p></div>
                <div className="text-center"><p className="text-[9px] text-[#C0C0C0] font-bold uppercase tracking-widest mb-1">Garantía</p><p className="font-black text-xs text-[#00BFFF] uppercase">{version.specs.garantia || 'Consultar'}</p></div>
              </div>
            </div>

            <div className="md:w-1/2 p-10 flex flex-col justify-center bg-[#F8F9FA]">
              <h1 className="text-xl text-[#3A3A3C] uppercase tracking-wide mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                {brand?.name} {model.name} <span className="font-black text-[#0A1F33] text-2xl md:text-3xl block mt-1" style={{ fontFamily: 'Montserrat, sans-serif' }}>{version.name}</span>
              </h1>
              <p className="text-[11px] text-[#C0C0C0] font-bold uppercase tracking-widest mb-6">
                {normalizeCarroceria(model.tipo_carroceria)} | Origen: {model.origen || brand?.origen_marca || 'Consultar'} | ID: {version.id}
              </p>

              <div className="mb-8 border-l-4 border-[#0A1F33] pl-4 bg-[#FFFFFF] p-4 border-t border-r border-b border-[#C0C0C0]">
                <span className="text-[10px] uppercase font-bold text-[#C0C0C0] tracking-widest block mb-1">Precio de Lista Sugerido</span>
                <span className="font-black text-4xl text-[#0A1F33]" style={{ fontFamily: 'Montserrat, sans-serif' }}>US$ {version.price.toLocaleString()}</span>
                {version.promocion && <span className="mt-2 inline-block bg-[#00BFFF]/10 border border-[#00BFFF]/30 text-[#00BFFF] text-[9px] font-bold uppercase px-2 py-1 tracking-widest">{version.promocion}</span>}
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button onClick={() => setShowConsultar(true)} className="flex-1 bg-[#00BFFF] hover:bg-[#0A1F33] text-[#FFFFFF] font-bold text-xs uppercase tracking-widest py-4 transition-colors flex items-center justify-center gap-2 border border-transparent rounded-none">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeLinejoin="miter" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg> Contactar a un Asesor
                </button>
                <button onClick={() => setShowCalcular(true)} className="flex-1 bg-[#FFFFFF] border border-[#0A1F33] text-[#0A1F33] hover:bg-[#0A1F33] hover:text-[#FFFFFF] font-bold text-xs uppercase tracking-widest py-4 transition-colors flex items-center justify-center gap-2 rounded-none">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeLinejoin="miter" strokeWidth="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg> Simular Cuotas
                </button>
              </div>
              
              <div className="mt-4">
                <button onClick={handleComparar} className={`w-full border font-bold text-[10px] uppercase tracking-widest py-3 transition-colors flex justify-center items-center gap-2 rounded-none ${isInCompare ? 'bg-[#E6F4EA] border-[#1E8E3E] text-[#1E8E3E]' : 'bg-[#F8F9FA] border-[#C0C0C0] text-[#3A3A3C] hover:border-[#00BFFF] hover:text-[#00BFFF]'}`}>
                  {isInCompare ? <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg> Vehículo en Comparador</> : '+ Añadir a Comparador'}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-[1200px] mx-auto px-4 lg:px-8 mb-16">
          <h2 className="font-black text-2xl text-[#0A1F33] uppercase mb-6" style={{ fontFamily: 'Montserrat, sans-serif' }}>Ficha Técnica Detallada</h2>
          
          <div className="bg-[#FFFFFF] border border-[#C0C0C0] overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-2">
              <div className="p-8 border-b lg:border-b-0 lg:border-r border-[#C0C0C0]">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 bg-[#0A1F33] flex items-center justify-center text-[#FFFFFF]"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg></div>
                  <h3 className="text-sm font-bold text-[#0A1F33] uppercase tracking-widest">Tren Motriz</h3>
                </div>
                <ul className="flex flex-col gap-3 text-[11px] text-[#3A3A3C]">
                  <li className="flex justify-between border-b border-[#F5F5F5] pb-2"><span className="text-[#C0C0C0] uppercase font-bold tracking-widest">Motorización</span> <span className="font-medium text-right uppercase w-1/2">{version.specs.motor || '-'}</span></li>
                  <li className="flex justify-between border-b border-[#F5F5F5] pb-2"><span className="text-[#C0C0C0] uppercase font-bold tracking-widest">Alimentación</span> <span className="font-medium text-right uppercase w-1/2">{version.specs.alimentacion || 'Convencional'}</span></li>
                  <li className="flex justify-between border-b border-[#F5F5F5] pb-2"><span className="text-[#C0C0C0] uppercase font-bold tracking-widest">Transmisión</span> <span className="font-medium text-right uppercase">{version.specs.transmision || '-'}</span></li>
                  <li className="flex justify-between border-b border-[#F5F5F5] pb-2"><span className="text-[#C0C0C0] uppercase font-bold tracking-widest">Tracción</span> <span className="font-medium text-right uppercase">{version.specs.traccion || '-'}</span></li>
                  {version.specs.autonomi_electrica && (
                    <li className="flex justify-between border-b border-[#F5F5F5] pb-2"><span className="text-[#00BFFF] uppercase font-bold tracking-widest">Autonomía Eléctrica</span> <span className="font-black text-[#0A1F33] text-right uppercase">{version.specs.autonomi_electrica}</span></li>
                  )}
                </ul>
              </div>

              <div className="p-8 border-b border-[#C0C0C0]">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 bg-[#0A1F33] flex items-center justify-center text-[#FFFFFF]"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg></div>
                  <h3 className="text-sm font-bold text-[#0A1F33] uppercase tracking-widest">Chasis y Arquitectura</h3>
                </div>
                <ul className="flex flex-col gap-3 text-[11px] text-[#3A3A3C]">
                  <li className="flex justify-between border-b border-[#F5F5F5] pb-2"><span className="text-[#C0C0C0] uppercase font-bold tracking-widest">Suspensión</span> <span className="font-medium text-right uppercase w-1/2">{version.chasis?.detalle_suspension || 'No especificada'}</span></li>
                  <li className="flex justify-between border-b border-[#F5F5F5] pb-2"><span className="text-[#C0C0C0] uppercase font-bold tracking-widest">Frenos</span> <span className="font-medium text-right uppercase w-1/2">{version.chasis?.detalles_freno || 'No especificados'}</span></li>
                  <li className="flex justify-between border-b border-[#F5F5F5] pb-2"><span className="text-[#C0C0C0] uppercase font-bold tracking-widest">Neumáticos</span> <span className="font-medium text-right uppercase">{version.chasis?.medida_neumatico || '-'}</span></li>
                  <li className="flex justify-between border-b border-[#F5F5F5] pb-2"><span className="text-[#C0C0C0] uppercase font-bold tracking-widest">Llantas</span> <span className="font-medium text-right uppercase">{version.chasis?.tipo_llanta || '-'}</span></li>
                  <li className="flex justify-between border-b border-[#F5F5F5] pb-2"><span className="text-[#C0C0C0] uppercase font-bold tracking-widest">Dimensiones (L/A/A)</span> <span className="font-medium text-right uppercase">{version.dimensiones.largo || '-'} / {version.dimensiones.ancho || '-'} / {version.dimensiones.alto || '-'} mm</span></li>
                  <li className="flex justify-between border-b border-[#F5F5F5] pb-2"><span className="text-[#C0C0C0] uppercase font-bold tracking-widest">Despeje y Baulera</span> <span className="font-medium text-right uppercase">{version.dimensiones.despeje_suelo} mm | {version.dimensiones.baulera_litros} L</span></li>
                </ul>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 bg-[#F8F9FA]">
              <div className="p-8 border-b lg:border-b-0 lg:border-r border-[#C0C0C0]">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 bg-[#00BFFF] flex items-center justify-center text-[#FFFFFF]"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg></div>
                  <h3 className="text-sm font-bold text-[#0A1F33] uppercase tracking-widest">Equipamiento de Seguridad</h3>
                </div>
                
                <div className="flex gap-4 mb-6">
                   <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-3 flex-1 text-center"><span className="block text-[20px] font-black text-[#0A1F33]">{version.specs.airbags}</span><span className="text-[8px] font-bold text-[#C0C0C0] uppercase tracking-widest">Airbags</span></div>
                   <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-3 flex-1 text-center"><span className="block text-[12px] font-black text-[#0A1F33] uppercase truncate mt-1.5 mb-1.5">{version.specs.camaras || 'No'}</span><span className="text-[8px] font-bold text-[#C0C0C0] uppercase tracking-widest">Cámaras</span></div>
                </div>

                {version.features.adas && version.features.adas.length > 0 && version.features.adas[0] !== '' && (
                  <div className="mb-6 p-4 bg-[#FFFFFF] border-l-4 border-[#1E8E3E]">
                    <p className="text-[9px] font-bold text-[#1E8E3E] uppercase tracking-widest mb-3">Asistencias a la Conducción (ADAS)</p>
                    <div className="grid grid-cols-1 gap-2">
                      {version.features.adas.map((item, i) => (
                        <div key={`adas_${i}`} className="flex items-start gap-2 text-[10px] text-[#3A3A3C] uppercase font-medium">
                          <svg className="w-3 h-3 text-[#1E8E3E] shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg> {item}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <p className="text-[9px] font-bold text-[#C0C0C0] uppercase tracking-widest mb-2">Seguridad Estándar</p>
                  {version.features.seguridad_standard && version.features.seguridad_standard.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
                      {version.features.seguridad_standard.map((item, i) => (
                        <div key={i} className="flex items-start gap-2 text-[10px] text-[#3A3A3C] font-medium leading-tight">
                          <span className="text-[#00BFFF] text-sm leading-none mt-[-2px]">•</span> {item}
                        </div>
                      ))}
                    </div>
                  ) : <span className="text-[10px] text-[#C0C0C0] uppercase tracking-widest">Información no parametrizada.</span>}
                </div>
              </div>

              <div className="p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 bg-[#00BFFF] flex items-center justify-center text-[#FFFFFF]"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"></path></svg></div>
                  <h3 className="text-sm font-bold text-[#0A1F33] uppercase tracking-widest">Confort y Tecnología</h3>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
                   <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-3 text-center"><span className="block text-[14px] font-black text-[#0A1F33] mt-1">{version.specs.tamanho_pantalla ? `${version.specs.tamanho_pantalla}"` : 'No'}</span><span className="text-[8px] font-bold text-[#C0C0C0] uppercase tracking-widest block mt-1">Pantalla</span></div>
                   <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-3 text-center"><span className="block text-[10px] font-black text-[#0A1F33] uppercase truncate mt-2">{version.features.techo_panoramico || 'No'}</span><span className="text-[8px] font-bold text-[#C0C0C0] uppercase tracking-widest block mt-1.5">Techo Pan.</span></div>
                   <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-3 text-center col-span-2 sm:col-span-1"><span className="block text-[10px] font-black text-[#0A1F33] uppercase truncate mt-2">{version.features.asiento_cuero || 'Tela'}</span><span className="text-[8px] font-bold text-[#C0C0C0] uppercase tracking-widest block mt-1.5">Tapizado</span></div>
                </div>

                <div className="flex flex-col gap-2">
                  <p className="text-[9px] font-bold text-[#C0C0C0] uppercase tracking-widest mb-2">Amenidades de Cabina</p>
                  {version.features.confort_conveniencia && version.features.confort_conveniencia.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
                      {version.features.confort_conveniencia.map((item, i) => (
                        <div key={i} className="flex items-start gap-2 text-[10px] text-[#3A3A3C] font-medium leading-tight">
                          <span className="text-[#00BFFF] text-sm leading-none mt-[-2px]">•</span> {item}
                        </div>
                      ))}
                    </div>
                  ) : <span className="text-[10px] text-[#C0C0C0] uppercase tracking-widest">Información no parametrizada.</span>}
                </div>
              </div>
            </div>

          </div>
        </section>
      </div>

      {/* ==========================================
          MODALES DE CONVERSIÓN CON NUEVAS REGLAS B2B
          ========================================== */}
      
      {/* INYECCIÓN DEL MODAL GLOBAL B2B */}
      <LeadModal
        isOpen={showConsultar}
        onClose={() => setShowConsultar(false)}
        vehiculoInteres={version.name}
        marcaVehiculo={brand?.name || ''}
        origenLead="Ficha Versión Exacta"
        concesionariaDestino={version.concesionaria || brand?.name || 'Central DATACAR'}
      />

      <Modal
        isOpen={showCalcular}
        onClose={() => { setShowCalcular(false); setCuotaCalculada(null); setFeedback({type:'', message:''}); }}
        overlayClassName="fixed inset-0 bg-[#0A1F33]/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
        panelClassName="bg-[#FFFFFF] p-8 max-w-md w-full border-t-4 border-[#0A1F33] rounded-none"
      >
            <button onClick={() => { setShowCalcular(false); setCuotaCalculada(null); setFeedback({type:'', message:''}); }} className="absolute top-4 right-4 text-[#C0C0C0] hover:text-[#D93025] font-black border-none outline-none">✕</button>
            <h3 className="font-black text-2xl text-[#0A1F33] uppercase mb-1" style={{ fontFamily: 'Montserrat, sans-serif' }}>Plan Financiero</h3>
            <p className="text-[10px] font-bold text-[#C0C0C0] uppercase tracking-widest mb-6">Proyección base: US$ {version.price.toLocaleString()}</p>
            <form onSubmit={handleCalcular} className="flex flex-col gap-4">
              <div><label htmlFor="version-calc-entrega" className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest block mb-2">Capital de Entrega (USD)</label><input id="version-calc-entrega" type="number" placeholder="Ej: 15000" className="w-full border border-[#C0C0C0] p-3 text-xs focus:outline-none focus:border-[#0A1F33] bg-[#F8F9FA] rounded-none" required value={calcForm.entrega} onChange={e=>setCalcForm({...calcForm, entrega: e.target.value})} /></div>
              <div>
                <label htmlFor="version-calc-plazo" className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest block mb-2">Plazo de Financiación</label>
                <select id="version-calc-plazo" className="w-full border border-[#C0C0C0] p-3 text-xs focus:outline-none focus:border-[#0A1F33] bg-[#FFFFFF] rounded-none" value={calcForm.plazo} onChange={e=>setCalcForm({...calcForm, plazo: e.target.value})}>
                  <option value="12">12 Meses</option><option value="24">24 Meses</option><option value="36">36 Meses</option><option value="48">48 Meses</option><option value="60">60 Meses</option>
                </select>
              </div>
              <button type="submit" className="w-full bg-[#00BFFF] hover:bg-[#0A1F33] text-[#FFFFFF] font-bold text-xs uppercase tracking-widest py-4 transition-colors mt-2 border border-transparent rounded-none">Calcular Cuotas</button>
              {feedback.message && feedback.type === 'error' && <p className="text-[10px] text-center font-bold uppercase tracking-widest mt-2 text-[#D93025]">{feedback.message}</p>}
              {cuotaCalculada !== null && feedback.type !== 'error' && (
                <div className="mt-4 border-t-4 border-[#0A1F33] bg-[#F8F9FA] p-6 text-center">
                  <p className="text-[11px] font-bold text-[#C0C0C0] uppercase tracking-widest mb-2">Cuota Mensual Estimada</p>
                  <p className="font-black text-4xl text-[#0A1F33]" style={{ fontFamily: 'Montserrat, sans-serif' }}>US$ {cuotaCalculada.toLocaleString('en-US', {maximumFractionDigits: 0})}</p>
                  <p className="text-[9px] text-[#3A3A3C] uppercase tracking-widest mt-4 max-w-md mx-auto">* Tasa referencial {(config.tasa_anual * 100).toFixed(1)}% anual. Sujeto a evaluación crediticia.</p>
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

      <div className="w-full bg-[#FFFFFF] border-t border-[#C0C0C0] mt-auto">
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
                  aria-controls={`faq-version-panel-${index}`}
                  className="w-full flex justify-between items-center text-left focus:outline-none group bg-transparent border-none"
                >
                  <span className="font-bold text-sm text-[#0A1F33] group-hover:text-[#00BFFF] transition-colors pr-4" style={{ fontFamily: 'Inter, sans-serif' }}>{faq.q}</span>
                  <span className="text-[#0A1F33] text-2xl font-light">{openFaq === index ? '−' : '+'}</span>
                </button>
                <div id={`faq-version-panel-${index}`} className={`overflow-hidden transition-all duration-300 ease-in-out ${openFaq === index ? 'max-h-40 opacity-100 mt-4' : 'max-h-0 opacity-0'}`}>
                  <p className="text-sm text-[#3A3A3C] leading-relaxed font-medium pr-8" style={{ fontFamily: 'Inter, sans-serif' }}>{faq.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#0A1F33] border-t-4 border-[#00BFFF]">
          <div className="max-w-[1400px] mx-auto px-4 lg:px-8 py-16 flex flex-col md:flex-row justify-between items-center gap-12">
            <div className="md:w-1/2 text-center md:text-left">
              <h3 className="font-black text-3xl md:text-4xl text-[#FFFFFF] uppercase mb-4" style={{ fontFamily: 'Montserrat, sans-serif' }}>Suscribite a las oportunidades.</h3>
              <p className="text-sm text-[#C0C0C0] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>Sé el primero en enterarte de las mejores opciones de 0km en tu e-mail.</p>
            </div>
            <div className="md:w-1/2 w-full max-w-lg">
              {/* INYECCIÓN DEL COMPONENTE NEWSLETTER B2C */}
              <NewsletterForm />
            </div>
          </div>
        </div>

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