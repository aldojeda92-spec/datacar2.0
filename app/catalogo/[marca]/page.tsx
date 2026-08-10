// app/catalogo/[marca]/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase'; // CORRECCIÓN CRÍTICA DE RUTA
import { isOptimizableImageSrc, isValidImageSrc } from '../../../lib/imageSrc';
import { normalizeCarroceria } from '../../../lib/carroceria';

// ==========================================
// INTERFACES DE DATOS
// ==========================================
interface ModelData {
  id: string;
  name: string;
  brandId: string;
  tipo_carroceria: string;
  startingPrice: number;
  imgUrl: string;
}

export default function CatalogoMarcaPage() {
  const params = useParams();
  const marcaSlug = params.marca as string;

  const [brandName, setBrandName] = useState<string>('');
  const [models, setModels] = useState<ModelData[]>([]);
  const [loading, setLoading] = useState(true);

  // ==========================================
  // MOTOR DE CONSULTA OPTIMIZADO (FIREBASE)
  // ==========================================
  useEffect(() => {
    const fetchMarcaYModelos = async () => {
      if (!marcaSlug) return;
      try {
        // 1. Obtener el nombre oficial de la marca
        const brandDoc = await getDoc(doc(db, 'brands', marcaSlug));
        if (brandDoc.exists()) {
          setBrandName(brandDoc.data().name);
        } else {
          // Fallback visual (Auto-sanación)
          setBrandName(marcaSlug.replace(/-/g, ' ').toUpperCase());
        }

        // 2. Consulta indexada: Traer SOLO modelos de esta marca
        const qModels = query(collection(db, 'models'), where('brandId', '==', marcaSlug));
        const modelsSnap = await getDocs(qModels);
        
        const modelsData = modelsSnap.docs.map(d => ({
          id: d.id,
          ...d.data()
        })) as ModelData[];

        // Ordenar alfabéticamente
        modelsData.sort((a, b) => a.name.localeCompare(b.name));
        setModels(modelsData);

      } catch (error) {
        console.error("Error sincronizando catálogo:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchMarcaYModelos();
  }, [marcaSlug]);

  // ==========================================
  // ESTADO DE CARGA CORPORATIVO
  // ==========================================
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#00BFFF] border-t-[#0A1F33] rounded-full animate-spin mb-4"></div>
        <p className="font-bold text-[#0A1F33] tracking-widest uppercase text-[10px]" style={{ fontFamily: 'Inter, sans-serif' }}>
          Sincronizando inventario oficial...
        </p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#F8F9FA] text-[#3A3A3C] font-sans flex flex-col">
      
      {/* NAVEGACIÓN GLOBAL B2C */}
      <nav className="w-full bg-[#FFFFFF] border-b border-[#C0C0C0] px-4 md:px-8 py-4 flex justify-between items-center sticky top-0 z-50 shadow-none">
        <div className="font-black text-2xl tracking-widest text-[#0A1F33] uppercase" style={{ fontFamily: 'Montserrat, sans-serif' }}>
          <Link href="/">DATA<span className="font-light">CAR</span></Link>
        </div>
        <div className="hidden lg:flex gap-6 font-bold text-[11px] uppercase items-center text-[#3A3A3C] tracking-wider h-full" style={{ fontFamily: 'Inter, sans-serif' }}>
          <Link href="/recomendador" className="hover:text-[#00BFFF] transition-colors">Recomendador</Link>
          <Link href="/negociamos-por-vos" className="hover:text-[#00BFFF] transition-colors">Negociamos por vos</Link>
          <Link href="/catalogo" className="text-[#00BFFF] border-b-2 border-[#00BFFF] pb-1">Catálogo</Link>
        </div>
      </nav>

      {/* CABECERA DE MARCA */}
      <header className="bg-[#FFFFFF] border-b border-[#C0C0C0] py-8 px-4 md:px-8">
        <div className="max-w-[1200px] mx-auto">
          {/* Breadcrumbs */}
          <div className="text-[10px] text-[#C0C0C0] uppercase tracking-widest font-bold mb-4 flex gap-2 items-center" style={{ fontFamily: 'Inter, sans-serif' }}>
            <Link href="/" className="hover:text-[#00BFFF] transition-colors">Inicio</Link>
            <span>/</span>
            <Link href="/catalogo" className="hover:text-[#00BFFF] transition-colors">Catálogo</Link>
            <span>/</span>
            <span className="text-[#0A1F33]">{brandName}</span>
          </div>

          <h1 className="font-black text-3xl md:text-4xl text-[#0A1F33] uppercase tracking-wide" style={{ fontFamily: 'Montserrat, sans-serif' }}>
            Catálogo de autos 0km <span className="text-[#00BFFF]">{brandName}</span>
          </h1>
          <p className="text-xs text-[#3A3A3C] mt-2 font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
            {models.length} modelos disponibles en Paraguay.
          </p>
        </div>
      </header>

      {/* GRILLA DE VEHÍCULOS (FLAT DESIGN) */}
      <section className="flex-grow py-12 px-4 md:px-8">
        <div className="max-w-[1200px] mx-auto">
          {models.length === 0 ? (
            <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-16 text-center">
              <p className="text-sm font-bold text-[#0A1F33] uppercase tracking-widest">No hay modelos cargados para esta marca.</p>
              <Link href="/catalogo" className="inline-block mt-4 text-[10px] text-[#00BFFF] font-bold uppercase hover:underline">
                ← Volver al catálogo general
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {models.map((model, index) => (
                <article key={model.id} className="bg-[#FFFFFF] border border-[#C0C0C0] flex flex-col hover:border-[#0A1F33] transition-colors group cursor-pointer shadow-none rounded-none">
                  
                  {/* Etiqueta Visual de Disponibilidad B2B */}
                  <div className="absolute mt-4 ml-4 z-10">
                    <span className="bg-[#E6F4EA] border border-[#1E8E3E]/30 text-[#1E8E3E] text-[8px] font-bold uppercase px-2 py-1 tracking-widest">
                      Stock Verificado
                    </span>
                  </div>

                  {/* Imagen del Vehículo */}
                  <div className="relative w-full aspect-[4/3] bg-[#F8F9FA] border-b border-[#C0C0C0] overflow-hidden">
                    {isValidImageSrc(model.imgUrl) ? (
                      <Image
                        src={model.imgUrl}
                        alt={`${brandName} ${model.name}`}
                        fill
                        sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-contain p-4 group-hover:scale-105 transition-transform duration-500"
                        preload={index === 0}
                        unoptimized={!isOptimizableImageSrc(model.imgUrl)}
                      />
                    ) : (
                      <span className="text-[10px] font-bold text-[#C0C0C0] uppercase tracking-widest">Sin Imagen</span>
                    )}
                  </div>

                  {/* Datos Duros */}
                  <div className="p-6 flex flex-col flex-grow">
                    <h2 className="font-black text-xl text-[#0A1F33] uppercase leading-tight" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                      <span className="text-[#3A3A3C] font-medium text-sm block mb-1">{brandName}</span>
                      {model.name}
                    </h2>
                    
                    <p className="text-[10px] text-[#C0C0C0] uppercase tracking-widest font-bold mt-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {normalizeCarroceria(model.tipo_carroceria)}
                    </p>

                    <div className="mt-auto pt-6">
                      <p className="text-[10px] text-[#3A3A3C] uppercase tracking-widest font-bold mb-1">Precio Base Oficial</p>
                      <p className="font-black text-2xl text-[#0A1F33] tracking-tight" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                        US$ {model.startingPrice.toLocaleString()}
                      </p>
                    </div>

                    {/* Botón de Acción (Digital Cyan) */}
                    <Link 
                      href={`/catalogo/${marcaSlug}/${model.id}`} 
                      className="mt-6 block w-full bg-[#00BFFF] hover:bg-[#0A1F33] text-[#FFFFFF] text-center font-bold text-[10px] uppercase py-4 tracking-widest transition-colors border border-transparent rounded-none"
                    >
                      Ver Versiones →
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* FOOTER CORPORATIVO */}
      <footer className="w-full bg-[#0A1F33] border-t-4 border-[#00BFFF] py-12 px-4 md:px-8 text-center mt-auto shrink-0">
        <div className="max-w-[1200px] mx-auto flex flex-col items-center">
          <div className="font-black text-2xl tracking-widest text-[#FFFFFF] uppercase mb-6" style={{ fontFamily: 'Montserrat, sans-serif' }}>
            DATA<span className="font-light">CAR</span>
          </div>
          <p className="text-[10px] text-[#C0C0C0] uppercase tracking-widest font-medium">
            Plataforma B2B/B2C de inteligencia automotriz. Los precios son referenciales y no incluyen gastos de patentamiento.
          </p>
        </div>
      </footer>
    </main>
  );
}