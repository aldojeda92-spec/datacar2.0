// app/comparador/page.tsx
'use client';

import React, { useState, useEffect, Suspense, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { doc, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { isOptimizableImageSrc, isValidImageSrc } from '../../lib/imageSrc';
import { getStoredCompareList, saveCompareList, clearStoredCompareList } from '../../lib/compareStorage';
import { getCachedBrands, getCachedModels, getCachedVersions } from '../../lib/catalogCache';
import LeadModal from '../components/LeadModal'; // INYECCIÓN B2B CENTRALIZADA

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
    <ul className="flex flex-col gap-2 text-[10px] text-[#3A3A3C] text-left">
      {items.map((item, index) => (
        <li key={index} className="flex items-start gap-1.5 leading-tight">
          <span className="text-[#00BFFF] mt-[-1px] text-[12px] font-black">•</span> <span>{item}</span>
        </li>
      ))}
    </ul>
  );
};

// ==========================================
// COMPONENTE PRINCIPAL (Lógica Aislada)
// ==========================================
function ComparadorContent() {
  const searchParams = useSearchParams();
  const [compareItems, setCompareList] = useState<CompareItem[]>([]);
  const [vehiclesData, setVehiclesData] = useState<VersionDetail[]>([]);
  const [loading, setLoading] = useState(true);

  // Estados Predictivos del Buscador
  const [allVersions, setAllVersions] = useState<any[]>([]);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Estados de Lead (Asesoría Directa a través de LeadModal)
  const [consultingVehicle, setConsultingVehicle] = useState<VersionDetail | null>(null);

  // Estados para Lead Magnet (Compartir PDF/Enlace)
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [shareFeedback, setShareFeedback] = useState({ type: '', message: '' });

  // Ref para Telemetría Silenciosa
  const trackedRef = useRef<string>('');

  // ==========================================
  // 1. CARGA DE DATOS Y LECTURA DE URL
  // ==========================================
  useEffect(() => {
    const fetchCompareData = async () => {
      setLoading(true);
      try {
        const urlAutos = searchParams?.get('autos');
        let idsToFetch: string[] = [];

        // Prioridad 1: Si hay parámetros en la URL (?autos=id1,id2)
        if (urlAutos) {
          idsToFetch = urlAutos.split(',').slice(0, 3); // Límite estricto de 3
        } else {
          // Prioridad 2: Memoria Local del navegador
          const savedList: CompareItem[] = getStoredCompareList();
          idsToFetch = savedList.map(item => item.id);
        }
        
        if (idsToFetch.length > 0) {
          const loadedData: VersionDetail[] = [];
          const hydratedCompareItems: CompareItem[] = []; 

          for (const vId of idsToFetch) {
            const vSnap = await getDoc(doc(db, 'versions', vId));
            
            // SELF-HEALING: Descartar si el auto fue borrado de la DB
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
              loadedData.push({ ...vData, id: vSnap.id, brandName, modelName, imgUrl: isValidImageSrc(imgUrl) ? imgUrl : 'https://via.placeholder.com/400x200?text=Auto' });
              hydratedCompareItems.push({ id: vSnap.id, name: `${brandName} ${modelName} ${vData.name}`, price: Number(vData.price) || 0 });
            }
          }
          
          setVehiclesData(loadedData);
          setCompareList(hydratedCompareItems);
          
          // Sincronizar LocalStorage con lo cargado de la URL
          saveCompareList(hydratedCompareItems);
        }

        // Descargar Índice Ligero para el Buscador Predictivo
        const [allVersions, allModels, allBrands] = await Promise.all([
          getCachedVersions(),
          getCachedModels(),
          getCachedBrands(),
        ]);

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
  // 2. RASTREADOR SILENCIOSO DE BIG DATA B2B
  // ==========================================
  useEffect(() => {
    // Si hay una comparación activa de 2 o más vehículos, guardamos la estadística
    if (vehiclesData.length >= 2) {
      // Ordenamos alfabéticamente para que A vs B no se duplique como B vs A
      const sortedIds = vehiclesData.map(v => v.id).sort();
      const comboKey = sortedIds.join('_');
      
      // Verificamos el Ref para que no dispare múltiples veces en la misma sesión
      if (trackedRef.current !== comboKey) {
        trackedRef.current = comboKey;
        
        // Disparo asíncrono sin bloquear la interfaz de usuario
        addDoc(collection(db, 'comparison_stats'), {
          combo: vehiclesData.map(v => `${v.brandName} ${v.modelName}`).join(' vs '),
          ids: sortedIds,
          timestamp: serverTimestamp()
        }).catch(err => console.error("Error telemetría", err));
      }
    }
  }, [vehiclesData]);

  // Buscador Predictivo (Fuzzy Matching)
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

    // Actualizar URL silenciosamente para mantener la limpieza
    const newUrlParams = newList.length > 0 ? `?autos=${newList.map(i=>i.id).join(',')}` : window.location.pathname;
    window.history.replaceState({}, '', newUrlParams);
  };

  const handleAddVersion = (v: any) => {
    if (compareItems.length >= 3) return;
    const newItem = { id: v.id, name: `${v.brandName} ${v.modelName} ${v.versionName}`, price: v.price };
    const newList = [...compareItems, newItem];
    saveCompareList(newList);
    // Modificamos la URL y recargamos para que el SSR limpie el caché
    window.location.href = `/comparador?autos=${newList.map(i=>i.id).join(',')}`;
  };

  const clearCompare = () => {
    clearStoredCompareList();
    setCompareList([]);
    setVehiclesData([]);
    window.history.replaceState({}, '', window.location.pathname);
  };

  // ==========================================
  // 4. LÓGICA DE COMPARTIR Y ENVIAR (LEAD MAGNET)
  // ==========================================
  const handleShareSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareEmail) return;

    setShareFeedback({ type: '', message: 'Enviando comparativa a tu correo...' });
    
    // Construimos la URL unívoca
    const shareLink = `${window.location.origin}/comparador?autos=${compareItems.map(i=>i.id).join(',')}`;

    try {
      // 1. Guardar el Lead en la bóveda
      await addDoc(collection(db, 'leads'), {
        email: shareEmail,
        nombre: 'Interesado Comparativa',
        telefono: '-',
        origen: 'Generador Enlace Comparativa',
        vehiculo: compareItems.map(i=>i.name).join(' VS '),
        enlace_generado: shareLink,
        estado: 'Nuevo',
        createdAt: serverTimestamp()
      });

      // 2. Disparo de correo B2C usando la API de Next.js ya existente
      const htmlTemplate = `
        <div style="font-family: 'Inter', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #C0C0C0; background-color: #FFFFFF;">
          <div style="background-color: #0A1F33; border-bottom: 4px solid #00BFFF; padding: 32px 24px; text-align: center;">
            <h1 style="color: #FFFFFF; font-family: 'Montserrat', Helvetica, Arial, sans-serif; font-size: 28px; font-weight: 900; letter-spacing: 2px; margin: 0;">DATA<span style="font-weight: 300;">CAR</span></h1>
          </div>
          <div style="padding: 40px 32px; text-align: center;">
            <h2 style="color: #0A1F33; font-family: 'Montserrat', sans-serif; font-size: 20px; font-weight: 900; text-transform: uppercase; margin-top: 0; margin-bottom: 16px;">Tu Comparativa Guardada</h2>
            <p style="color: #3A3A3C; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">Aquí tienes el enlace seguro para acceder a la comparativa de vehículos que acabas de generar.</p>
            <div style="margin-top: 32px; margin-bottom: 32px;">
              <a href="${shareLink}" style="background-color: #00BFFF; color: #FFFFFF; padding: 16px 32px; text-decoration: none; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; display: inline-block;">Ver Comparativa</a>
            </div>
          </div>
          <div style="background-color: #F8F9FA; padding: 24px; text-align: center; font-size: 10px; color: #C0C0C0; border-top: 1px solid #C0C0C0;">
            © ${new Date().getFullYear()} DATACAR Paraguay. Todos los derechos reservados.
          </div>
        </div>
      `;

      const response = await fetch('/api/mail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destinatarios: [shareEmail],
          subject: '⚖️ Tu Comparativa Guardada - DATACAR',
          html: htmlTemplate
        }),
      });

      if (!response.ok) throw new Error('Error despachando correo');

      // 3. Por UX, le copiamos el link directamente al portapapeles
      await navigator.clipboard.writeText(shareLink);
      setShareFeedback({ type: 'success', message: '¡Enviado a tu correo y copiado al portapapeles!' });
      
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
      
      {/* NAVBAR */}
      <nav className="w-full bg-[#FFFFFF] border-b border-[#C0C0C0] px-4 md:px-8 py-4 flex justify-between items-center sticky top-0 z-50">
        <div className="font-black text-2xl tracking-widest text-[#0A1F33] uppercase" style={{ fontFamily: 'Montserrat, sans-serif' }}>
          <Link href="/">DATA<span className="font-light">CAR</span></Link>
        </div>
        <div className="hidden md:flex gap-6 font-bold text-[11px] uppercase items-center text-[#3A3A3C] tracking-wider" style={{ fontFamily: 'Inter, sans-serif' }}>
          <Link href="/recomendador" className="hover:text-[#00BFFF] transition-colors">Recomendador</Link>
          <Link href="/negociamos-por-vos" className="hover:text-[#00BFFF] transition-colors">Asesoría</Link>
          <Link href="/catalogo" className="hover:text-[#00BFFF] transition-colors">Catálogo</Link>
        </div>
        <Link href="/catalogo" className="bg-[#FFFFFF] border border-[#0A1F33] text-[#0A1F33] font-bold text-[11px] uppercase tracking-widest py-3 px-8 hover:bg-[#0A1F33] hover:text-[#FFFFFF] transition-colors rounded-none">
          Buscar Más Autos
        </Link>
      </nav>

      {/* HEADER */}
      <header className="w-full border-b border-[#C0C0C0] bg-[#FFFFFF] py-8">
        <div className="max-w-[1400px] mx-auto px-4 lg:px-8 flex flex-col md:flex-row justify-between md:items-end gap-4">
          <div>
            <p className="text-[10px] font-medium text-[#C0C0C0] mb-2 uppercase tracking-widest">
              <Link href="/" className="hover:text-[#3A3A3C] transition-colors">Inicio</Link> / <span className="font-bold text-[#3A3A3C]">Comparador</span>
            </p>
            <h1 className="font-black text-3xl md:text-4xl text-[#0A1F33] uppercase" style={{ fontFamily: 'Montserrat, sans-serif' }}>
              Comparador de <span className="text-[#00BFFF]">Autos</span>
            </h1>
          </div>
          {compareItems.length > 0 && (
            <button onClick={clearCompare} className="text-[10px] text-[#D93025] font-bold uppercase tracking-widest hover:underline text-left md:text-right border-none outline-none">
              Limpiar Comparador
            </button>
          )}
        </div>
      </header>

      {/* MATRIZ DE DATOS */}
      <div className="max-w-[1400px] mx-auto px-4 lg:px-8 pt-8 flex-grow mb-12">
        {vehiclesData.length === 0 ? (
          <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-16 text-center flex flex-col items-center justify-center my-8 shadow-none">
            <span className="text-4xl mb-4">⚖️</span>
            <h2 className="font-black text-2xl text-[#0A1F33] uppercase mb-2" style={{ fontFamily: 'Montserrat, sans-serif' }}>
              No hay autos seleccionados
            </h2>
            <p className="text-[11px] text-[#3A3A3C] uppercase tracking-widest mb-8">
              Utilizá el buscador para agregar hasta 3 opciones y comparar sus diferencias.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <button onClick={() => setSearchModalOpen(true)} className="bg-[#FFFFFF] border border-[#0A1F33] text-[#0A1F33] font-bold text-xs uppercase tracking-widest py-4 px-8 transition-colors hover:bg-[#0A1F33] hover:text-[#FFFFFF]">
                Buscar un Auto
              </button>
              <Link href="/catalogo" className="bg-[#00BFFF] hover:bg-[#0A1F33] text-[#FFFFFF] font-bold text-xs uppercase tracking-widest py-4 px-10 transition-colors border border-transparent">
                Ir al Catálogo
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar border border-[#C0C0C0] bg-[#FFFFFF] shadow-none">
            <table className="w-full text-left border-collapse min-w-[900px] bg-[#FFFFFF]">
              
              {/* CABECERAS DE VEHÍCULOS */}
              <thead className="sticky top-0 z-30 shadow-none border-b-4 border-[#0A1F33]">
                <tr className="bg-[#FFFFFF]">
                  <th className="p-6 bg-[#F8F9FA] w-1/4 align-bottom border-r border-[#C0C0C0]">
                    <span className="text-[10px] font-bold text-[#C0C0C0] uppercase tracking-widest block mb-1">Características</span>
                    <span className="font-black text-xl text-[#0A1F33] uppercase" style={{ fontFamily: 'Montserrat, sans-serif' }}>Detalles</span>
                  </th>
                  
                  {[0, 1, 2].map(idx => {
                    const veh = vehiclesData[idx];
                    return (
                      <th key={idx} className="p-6 w-1/4 border-r border-[#C0C0C0] last:border-0 align-top relative bg-[#FFFFFF]">
                        {veh ? (
                          <div className="flex flex-col h-full justify-between gap-4">
                            <button onClick={() => handleRemove(veh.id)} className="absolute top-4 right-4 text-[#C0C0C0] hover:text-[#D93025] font-black text-xs uppercase tracking-widest transition-colors border-none outline-none" title="Quitar auto">✕</button>
                            
                            <div>
                              <div className="relative h-24 md:h-32 mb-4 bg-[#FFFFFF] p-2 border-b border-[#C0C0C0]/20">
                                <Image
                                  src={veh.imgUrl || ''}
                                  alt={veh.name}
                                  fill
                                  sizes="25vw"
                                  className="object-contain p-2"
                                  unoptimized={!isOptimizableImageSrc(veh.imgUrl)}
                                />
                              </div>
                              <p className="text-[10px] font-bold text-[#C0C0C0] uppercase tracking-widest truncate">{veh.brandName}</p>
                              <h3 className="font-black text-base md:text-lg text-[#0A1F33] uppercase leading-tight line-clamp-1" style={{ fontFamily: 'Montserrat, sans-serif' }}>{veh.modelName}</h3>
                              <p className="text-[10px] text-[#00BFFF] font-bold uppercase tracking-wider mb-2 truncate" title={veh.name}>{veh.name}</p>
                            </div>
                            
                            <div className="pt-4 border-t border-[#C0C0C0]/40 mt-auto">
                              <span className="text-[9px] text-[#C0C0C0] font-bold uppercase tracking-widest block mb-1">Precio Contado</span>
                              <span className="font-black text-xl md:text-2xl text-[#0A1F33] block mb-4" style={{ fontFamily: 'Montserrat, sans-serif' }}>US$ {veh.price.toLocaleString()}</span>
                              
                              <button onClick={() => setConsultingVehicle(veh)} className="w-full bg-[#00BFFF] hover:bg-[#0A1F33] text-[#FFFFFF] font-bold text-[10px] uppercase tracking-widest py-3 border border-transparent transition-colors">
                                Consultar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="h-full min-h-[300px] border border-dashed border-[#C0C0C0] flex flex-col justify-center items-center p-6 text-center bg-[#F8F9FA] hover:bg-[#F5FBFF] transition-colors cursor-pointer group" onClick={() => setSearchModalOpen(true)}>
                            <svg className="w-8 h-8 text-[#C0C0C0] group-hover:text-[#00BFFF] mb-3 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeLinejoin="miter" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                            <p className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest mb-1">Espacio Disponible</p>
                            <p className="text-[9px] text-[#C0C0C0] uppercase tracking-widest">Clic para agregar auto</p>
                          </div>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody className="text-xs text-[#3A3A3C]" style={{ fontFamily: 'Inter, sans-serif' }}>
                
                {/* 1. MOTOR Y TRANSMISIÓN */}
                <tr className="bg-[#0A1F33] text-[#FFFFFF] border-b border-[#C0C0C0]">
                  <td colSpan={4} className="p-3 font-bold text-[10px] uppercase tracking-widest pl-6">1. Motor y Transmisión</td>
                </tr>
                <tr className="border-b border-[#C0C0C0]/50 hover:bg-[#F8F9FA] transition-colors">
                  <td className="p-4 font-bold bg-[#F8F9FA] border-r border-[#C0C0C0] text-[10px] uppercase tracking-widest text-[#C0C0C0]">Combustible</td>
                  {[0, 1, 2].map(i => <td key={`combustible_${i}`} className="p-4 border-r border-[#C0C0C0] last:border-0 font-medium uppercase text-center">{vehiclesData[i]?.specs?.combustible || '-'}</td>)}
                </tr>
                <tr className="border-b border-[#C0C0C0]/50 hover:bg-[#F8F9FA] transition-colors">
                  <td className="p-4 font-bold bg-[#F8F9FA] border-r border-[#C0C0C0] text-[10px] uppercase tracking-widest text-[#C0C0C0]">Motor</td>
                  {[0, 1, 2].map(i => <td key={`motor_${i}`} className="p-4 border-r border-[#C0C0C0] last:border-0 font-medium uppercase text-center">{vehiclesData[i]?.specs?.motor || '-'}</td>)}
                </tr>
                <tr className="border-b border-[#C0C0C0]/50 hover:bg-[#F8F9FA] transition-colors">
                  <td className="p-4 font-bold bg-[#F8F9FA] border-r border-[#C0C0C0] text-[10px] uppercase tracking-widest text-[#C0C0C0]">Transmisión</td>
                  {[0, 1, 2].map(i => <td key={`transmision_${i}`} className="p-4 border-r border-[#C0C0C0] last:border-0 font-medium uppercase text-center">{vehiclesData[i]?.specs?.transmision || '-'}</td>)}
                </tr>
                <tr className="border-b border-[#C0C0C0]/50 hover:bg-[#F8F9FA] transition-colors">
                  <td className="p-4 font-bold bg-[#F8F9FA] border-r border-[#C0C0C0] text-[10px] uppercase tracking-widest text-[#C0C0C0]">Tracción</td>
                  {[0, 1, 2].map(i => <td key={`traccion_${i}`} className="p-4 border-r border-[#C0C0C0] last:border-0 font-medium uppercase text-center">{vehiclesData[i]?.specs?.traccion || '-'}</td>)}
                </tr>

                {/* 2. CHASIS Y DIMENSIONES */}
                <tr className="bg-[#0A1F33] text-[#FFFFFF] border-b border-[#C0C0C0]">
                  <td colSpan={4} className="p-3 font-bold text-[10px] uppercase tracking-widest pl-6">2. Chasis y Dimensiones</td>
                </tr>
                <tr className="border-b border-[#C0C0C0]/50 hover:bg-[#F8F9FA] transition-colors">
                  <td className="p-4 font-bold bg-[#F8F9FA] border-r border-[#C0C0C0] text-[10px] uppercase tracking-widest text-[#C0C0C0] align-top">Suspensión</td>
                  {[0, 1, 2].map(i => <td key={`suspension_${i}`} className="p-4 border-r border-[#C0C0C0] last:border-0 align-top">{vehiclesData[i] ? renderBulletList(vehiclesData[i].chasis?.detalle_suspension) : '-'}</td>)}
                </tr>
                <tr className="border-b border-[#C0C0C0]/50 hover:bg-[#F8F9FA] transition-colors">
                  <td className="p-4 font-bold bg-[#F8F9FA] border-r border-[#C0C0C0] text-[10px] uppercase tracking-widest text-[#C0C0C0] align-top">Frenos</td>
                  {[0, 1, 2].map(i => <td key={`frenos_${i}`} className="p-4 border-r border-[#C0C0C0] last:border-0 align-top">{vehiclesData[i] ? renderBulletList(vehiclesData[i].chasis?.detalles_freno) : '-'}</td>)}
                </tr>
                <tr className="border-b border-[#C0C0C0]/50 hover:bg-[#F8F9FA] transition-colors">
                  <td className="p-4 font-bold bg-[#F8F9FA] border-r border-[#C0C0C0] text-[10px] uppercase tracking-widest text-[#C0C0C0]">Baulera</td>
                  {[0, 1, 2].map(i => <td key={`baulera_${i}`} className="p-4 border-r border-[#C0C0C0] last:border-0 font-medium uppercase text-center">{vehiclesData[i]?.dimensiones?.baulera_litros ? `${vehiclesData[i].dimensiones.baulera_litros} L` : '-'}</td>)}
                </tr>
                <tr className="border-b border-[#C0C0C0]/50 hover:bg-[#F8F9FA] transition-colors">
                  <td className="p-4 font-bold bg-[#F8F9FA] border-r border-[#C0C0C0] text-[10px] uppercase tracking-widest text-[#C0C0C0]">Largo total</td>
                  {[0, 1, 2].map(i => <td key={`largo_${i}`} className="p-4 border-r border-[#C0C0C0] last:border-0 font-medium uppercase text-center">{vehiclesData[i]?.dimensiones?.largo ? `${vehiclesData[i].dimensiones.largo} mm` : '-'}</td>)}
                </tr>

                {/* 3. CONFORT Y TECNOLOGÍA */}
                <tr className="bg-[#0A1F33] text-[#FFFFFF] border-b border-[#C0C0C0]">
                  <td colSpan={4} className="p-3 font-bold text-[10px] uppercase tracking-widest pl-6">3. Confort y Tecnología</td>
                </tr>
                <tr className="border-b border-[#C0C0C0]/50 hover:bg-[#F8F9FA] transition-colors">
                  <td className="p-4 font-bold bg-[#F8F9FA] border-r border-[#C0C0C0] text-[10px] uppercase tracking-widest text-[#C0C0C0]">Pantalla</td>
                  {[0, 1, 2].map(i => <td key={`pantalla_${i}`} className="p-4 border-r border-[#C0C0C0] last:border-0 font-medium uppercase text-center">{vehiclesData[i]?.specs?.tamanho_pantalla ? `${vehiclesData[i].specs.tamanho_pantalla}"` : '-'}</td>)}
                </tr>
                <tr className="border-b border-[#C0C0C0]/50 hover:bg-[#F8F9FA] transition-colors">
                  <td className="p-4 font-bold bg-[#F8F9FA] border-r border-[#C0C0C0] text-[10px] uppercase tracking-widest text-[#C0C0C0] align-top">Conectividad</td>
                  {[0, 1, 2].map(i => <td key={`conectividad_${i}`} className="p-4 border-r border-[#C0C0C0] last:border-0 align-top">{vehiclesData[i] ? renderBulletList(vehiclesData[i].specs?.conectividad) : '-'}</td>)}
                </tr>
                <tr className="border-b border-[#C0C0C0]/50 hover:bg-[#F8F9FA] transition-colors">
                  <td className="p-4 font-bold bg-[#F8F9FA] border-r border-[#C0C0C0] text-[10px] uppercase tracking-widest text-[#C0C0C0]">Tapizado</td>
                  {[0, 1, 2].map(i => <td key={`cuero_${i}`} className="p-4 border-r border-[#C0C0C0] last:border-0 font-medium uppercase text-center">{vehiclesData[i]?.features?.asiento_cuero || '-'}</td>)}
                </tr>
                <tr className="border-b border-[#C0C0C0]/50 hover:bg-[#F8F9FA] transition-colors">
                  <td className="p-4 font-bold bg-[#F8F9FA] border-r border-[#C0C0C0] text-[10px] uppercase tracking-widest text-[#C0C0C0] align-top">Detalles de Confort</td>
                  {[0, 1, 2].map(i => <td key={`confort_${i}`} className="p-4 border-r border-[#C0C0C0] last:border-0 align-top">{vehiclesData[i] ? renderBulletList(vehiclesData[i].features?.confort_conveniencia) : '-'}</td>)}
                </tr>

                {/* 4. SEGURIDAD */}
                <tr className="bg-[#0A1F33] text-[#FFFFFF] border-b border-[#C0C0C0]">
                  <td colSpan={4} className="p-3 font-bold text-[10px] uppercase tracking-widest pl-6">4. Seguridad</td>
                </tr>
                <tr className="border-b border-[#C0C0C0]/50 hover:bg-[#F8F9FA] transition-colors">
                  <td className="p-4 font-bold bg-[#F8F9FA] border-r border-[#C0C0C0] text-[10px] uppercase tracking-widest text-[#C0C0C0]">Airbags Totales</td>
                  {[0, 1, 2].map(i => <td key={`airbags_${i}`} className="p-4 border-r border-[#C0C0C0] last:border-0 font-black text-[#0A1F33] text-center text-sm">{vehiclesData[i]?.specs?.airbags || '-'}</td>)}
                </tr>
                <tr className="border-b border-[#C0C0C0]/50 hover:bg-[#F8F9FA] transition-colors">
                  <td className="p-4 font-bold bg-[#F8F9FA] border-r border-[#C0C0C0] text-[10px] uppercase tracking-widest text-[#C0C0C0] align-top">Asistencias ADAS</td>
                  {[0, 1, 2].map(i => (
                    <td key={`adas_${i}`} className="p-4 border-r border-[#C0C0C0] last:border-0 font-medium align-top">
                      {vehiclesData[i]?.features?.adas && vehiclesData[i].features.adas.length > 0 && vehiclesData[i].features.adas[0] !== '' ? (
                        <ul className="flex flex-col gap-1.5 text-[10px] text-[#3A3A3C]">
                          {vehiclesData[i].features.adas.map((ad, k) => (
                            <li key={k} className="flex items-start gap-1.5 leading-tight">
                              <span className="text-[#1E8E3E] mt-0.5 font-bold">▪</span> <span className="uppercase">{ad}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (vehiclesData[i] ? <span className="text-[#C0C0C0] text-center block uppercase text-[10px] font-bold tracking-widest">Sin ADAS Estructural</span> : null)}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-[#F8F9FA] transition-colors">
                  <td className="p-4 font-bold bg-[#F8F9FA] border-r border-[#C0C0C0] text-[10px] uppercase tracking-widest text-[#C0C0C0] align-top">Seguridad Estándar</td>
                  {[0, 1, 2].map(i => <td key={`seguridad_${i}`} className="p-4 border-r border-[#C0C0C0] last:border-0 align-top">{vehiclesData[i] ? renderBulletList(vehiclesData[i].features?.seguridad_standard) : '-'}</td>)}
                </tr>
                
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* FOOTER DE CONVERSIÓN CON LEAD MAGNET */}
      {vehiclesData.length > 0 && (
        <footer className="w-full bg-[#0A1F33] text-[#FFFFFF] py-12 mt-auto border-t-4 border-[#00BFFF]">
          <div className="max-w-[1400px] mx-auto px-4 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="md:w-1/2 text-center md:text-left">
              <h4 className="font-black text-2xl uppercase mb-2" style={{ fontFamily: 'Montserrat, sans-serif' }}>¿Dudas sobre esta comparativa?</h4>
              <p className="text-[11px] text-[#C0C0C0] uppercase tracking-widest mb-6">Un especialista te asesora en 5 minutos para acompañarte en tu decisión.</p>
              <Link href="/negociamos-por-vos" className="bg-[#1E8E3E] hover:bg-[#FFFFFF] hover:text-[#1E8E3E] text-[#FFFFFF] font-bold text-xs uppercase tracking-widest px-8 py-4 border border-transparent transition-colors flex items-center justify-center gap-3 w-full md:w-max">
                Solicitar Asesoría Personalizada
              </Link>
            </div>
            <div className="md:w-1/3 flex flex-col gap-3">
              <button onClick={() => setShareModalOpen(true)} className="w-full border border-[#C0C0C0] text-[#C0C0C0] hover:bg-[#FFFFFF] hover:text-[#0A1F33] hover:border-[#0A1F33] font-bold text-[10px] uppercase tracking-widest py-4 px-6 transition-colors flex items-center justify-center gap-2">
                Compartir / Enviar Comparativa
              </button>
            </div>
          </div>
        </footer>
      )}

      {/* MODAL: BUSCADOR PREDICTIVO */}
      {searchModalOpen && (
        <div className="fixed inset-0 bg-[#0A1F33]/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[#FFFFFF] p-8 max-w-2xl w-full border-t-4 border-[#00BFFF] relative shadow-none">
            <button onClick={() => { setSearchModalOpen(false); setSearchTerm(''); }} className="absolute top-4 right-4 text-[#C0C0C0] hover:text-[#D93025] font-black text-lg border-none outline-none">✕</button>
            <h3 className="font-black text-2xl text-[#0A1F33] uppercase mb-1" style={{ fontFamily: 'Montserrat, sans-serif' }}>Agregar Auto</h3>
            <p className="text-[10px] font-bold text-[#C0C0C0] uppercase tracking-widest mb-6">Busca modelo o versión específica para comparar</p>

            <div className="flex border border-[#0A1F33] mb-4 bg-[#FFFFFF]">
              <div className="pl-4 flex items-center text-[#C0C0C0]"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg></div>
              <input type="text" placeholder="Ej: Kia Sportage EX..." className="w-full p-4 text-sm focus:outline-none text-[#3A3A3C]" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} autoFocus />
            </div>

            <div className="max-h-80 overflow-y-auto border border-[#C0C0C0] custom-scrollbar bg-[#F8F9FA]">
              {searchTerm.length < 2 ? (
                <div className="p-8 text-center text-[#C0C0C0] text-[10px] font-bold uppercase tracking-widest">Ingrese al menos 2 caracteres...</div>
              ) : searchResults.length > 0 ? (
                searchResults.map(v => {
                  const isAlreadyAdded = compareItems.some(ci => ci.id === v.id);
                  return (
                    <div key={v.id} onClick={() => !isAlreadyAdded && handleAddVersion(v)} className={`p-4 border-b border-[#C0C0C0]/40 flex justify-between items-center transition-colors ${isAlreadyAdded ? 'opacity-50 cursor-not-allowed bg-[#E6E6E6]' : 'cursor-pointer hover:bg-[#FFFFFF] hover:border-l-4 hover:border-l-[#00BFFF]'}`}>
                      <div className="flex flex-col"><span className="font-bold text-xs text-[#0A1F33] uppercase">{v.brandName} {v.modelName}</span><span className="text-[10px] text-[#3A3A3C] uppercase tracking-widest">{v.versionName}</span></div>
                      <div className="flex items-center gap-4"><span className="text-[11px] font-black text-[#0A1F33]" style={{ fontFamily: 'Montserrat, sans-serif' }}>US$ {v.price.toLocaleString()}</span>{isAlreadyAdded ? <span className="text-[9px] text-[#D93025] font-bold uppercase">Agregado</span> : <span className="text-[10px] text-[#00BFFF] font-black">+ Agregar</span>}</div>
                    </div>
                  )
                })
              ) : (
                <div className="p-8 text-center text-[#C0C0C0] text-[10px] font-bold uppercase tracking-widest">Sin resultados en el catálogo.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: COMPARTIR ENLACE Y CAPTURA DE CORREO (LEAD MAGNET) */}
      {shareModalOpen && (
        <div className="fixed inset-0 bg-[#0A1F33]/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[#FFFFFF] p-8 max-w-md w-full border-t-4 border-[#00BFFF] relative shadow-none">
            <button onClick={() => { setShareModalOpen(false); setShareFeedback({type:'', message:''}); }} className="absolute top-4 right-4 text-[#C0C0C0] hover:text-[#D93025] font-black border-none outline-none">✕</button>
            <h3 className="font-black text-2xl text-[#0A1F33] uppercase mb-1" style={{ fontFamily: 'Montserrat, sans-serif' }}>Guardar Comparativa</h3>
            <p className="text-[10px] font-bold text-[#C0C0C0] uppercase tracking-widest mb-6">Ingresá tu correo para recibir un enlace único y no perder tu búsqueda.</p>
            
            <form onSubmit={handleShareSubmit} className="flex flex-col gap-4">
              <div>
                <label className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest block mb-1">Correo Electrónico <span className="text-[#D93025]">*</span></label>
                <input type="email" placeholder="ejemplo@empresa.com" className="w-full border border-[#C0C0C0] p-4 text-xs focus:outline-none focus:border-[#0A1F33] bg-[#F8F9FA]" required value={shareEmail} onChange={e=>setShareEmail(e.target.value)} />
              </div>
              <button type="submit" className="w-full bg-[#0A1F33] hover:bg-[#00BFFF] text-[#FFFFFF] font-bold text-xs uppercase tracking-widest py-4 transition-colors mt-2 border border-transparent">
                Obtener Enlace
              </button>
              {shareFeedback.message && <p className={`text-[10px] text-center font-bold uppercase tracking-widest mt-2 ${shareFeedback.type==='error'?'text-[#D93025]':'text-[#1E8E3E]'}`}>{shareFeedback.message}</p>}
            </form>
          </div>
        </div>
      )}

      {/* ==========================================
          INYECCIÓN DEL MODAL INTELIGENTE (LEAD B2B)
          ========================================== */}
      <LeadModal 
        isOpen={!!consultingVehicle} 
        onClose={() => setConsultingVehicle(null)} 
        vehiculoInteres={consultingVehicle?.name || ''} 
        marcaVehiculo={`${consultingVehicle?.brandName} ${consultingVehicle?.modelName}`} 
        origenLead="Comparador B2C" 
        concesionariaDestino={consultingVehicle?.concesionaria || ''} 
      />
    </main>
  );
}

// ==========================================
// PUNTO DE ENTRADA CON SUSPENSE (Solución Build Error)
// ==========================================
export default function ComparadorPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center font-bold text-[#0A1F33] tracking-widest uppercase text-sm">Inicializando entorno de comparación...</div>}>
      <ComparadorContent />
    </Suspense>
  );
}