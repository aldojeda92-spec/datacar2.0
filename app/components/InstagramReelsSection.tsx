'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { isValidImageSrc, isOptimizableImageSrc } from '../../lib/imageSrc';

export interface VideoReview {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  tag?: string;
  order?: number;
}

// 5 Reels Oficiales de DATACAR en Instagram (@datacarpy)
export const DEFAULT_REELS: VideoReview[] = [
  {
    id: 'reel-1',
    title: 'Hoy hablamos de motores: ¿Qué mirar al elegir tu 0KM?',
    url: 'https://www.instagram.com/reel/Dd7gMQANwCl/',
    thumbnail: 'https://images.unsplash.com/photo-1617788138017-80ad40651399?auto=format&fit=crop&w=800&q=80',
    tag: 'Motores & Specs',
    order: 1,
  },
  {
    id: 'reel-2',
    title: 'Comparativas de SUVs Económicos en Paraguay',
    url: 'https://www.instagram.com/reel/DdXj0o9NgWr/',
    thumbnail: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=800&q=80',
    tag: 'Comparativa',
    order: 2,
  },
  {
    id: 'reel-3',
    title: 'Suspensiones: Claves que debés atender al comparar autos',
    url: 'https://www.instagram.com/reel/DdUtYUfpI57/',
    thumbnail: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=80',
    tag: 'Suspensión',
    order: 3,
  },
  {
    id: 'reel-4',
    title: 'Frenos y Seguridad: Todo lo que necesitás saber',
    url: 'https://www.instagram.com/reel/DdSMYvOpvUb/',
    thumbnail: 'https://images.unsplash.com/photo-1486006920555-c77dce18193b?auto=format&fit=crop&w=800&q=80',
    tag: 'Seguridad',
    order: 4,
  },
  {
    id: 'reel-5',
    title: 'Comparativa SUVs Japoneses: Toyota vs Mazda vs Honda',
    url: 'https://www.instagram.com/reel/DdQIo-Htxq_/',
    thumbnail: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=800&q=80',
    tag: 'SUVs Japoneses',
    order: 5,
  },
];

interface InstagramReelsSectionProps {
  title?: string;
  showFollowButton?: boolean;
  className?: string;
}

export default function InstagramReelsSection({
  title = 'DATACAR en Redes',
  showFollowButton = true,
  className = '',
}: InstagramReelsSectionProps) {
  const [reels, setReels] = useState<VideoReview[]>(DEFAULT_REELS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchVideos = async () => {
      try {
        const q = query(collection(db, 'video_reviews'), limit(20));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const list: VideoReview[] = snap.docs.map(doc => ({
            id: doc.id,
            ...(doc.data() as Omit<VideoReview, 'id'>)
          }));
          
          // Fusiona con los 5 reels oficiales por ID si fueron editados en Firestore
          const merged = DEFAULT_REELS.map(def => {
            const custom = list.find(r => r.id === def.id);
            return custom ? { ...def, ...custom } : def;
          });
          const extras = list.filter(r => !DEFAULT_REELS.some(def => def.id === r.id));
          const combined = [...merged, ...extras].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
          
          if (combined.length > 0) {
            setReels(combined.slice(0, 5));
          }
        }
      } catch (err) {
        console.warn('Usando videos de referencia oficiales:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchVideos();
  }, []);

  return (
    <section className={`w-full py-12 px-4 sm:px-6 lg:px-8 bg-[#FFFFFF] border-y border-[#C0C0C0]/50 ${className}`}>
      <div className="max-w-[1400px] mx-auto">
        
        {/* ENCABEZADO ESTILO CANAL / REFERENCIA */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            {/* Avatar DATACAR con aro Instagram */}
            <div className="relative p-0.5 rounded-full bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] shrink-0">
              <div className="w-11 h-11 rounded-full bg-[#0A1F33] border-2 border-white flex items-center justify-center text-[#FFFFFF] font-black text-xs">
                <span>DC</span>
              </div>
            </div>
            
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-black text-[#0A1F33] uppercase" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
                  {title} <span className="bg-gradient-to-r from-[#f09433] via-[#dc2743] to-[#bc1888] bg-clip-text text-transparent lowercase font-black text-lg sm:text-xl">Instagram</span>
                </h2>
              </div>
              <div className="flex items-center gap-2 text-xs text-[#3A3A3C]">
                <span>con <strong className="text-[#0A1F33]">@datacarpy</strong></span>
                <span className="text-[#C0C0C0]">•</span>
                <span className="text-[#00BFFF] font-semibold">Reseñas, Reels & Precios 0KM</span>
              </div>
            </div>
          </div>

          {showFollowButton && (
            <a
              href="https://www.instagram.com/datacarpy/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 bg-gradient-to-r from-[#f09433] via-[#dc2743] to-[#bc1888] hover:opacity-95 text-[#FFFFFF] font-bold text-xs uppercase tracking-widest px-6 py-3 transition-opacity shadow-sm rounded-none"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
              <span>Seguir @datacarpy</span>
            </a>
          )}
        </div>

        {/* CUADRÍCULA DE REELS OFICIALES */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {reels.map((item) => (
            <a
              key={item.id}
              href={item.url || 'https://www.instagram.com/datacarpy/'}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col bg-[#FFFFFF] border border-[#C0C0C0] overflow-hidden hover:border-[#0A1F33] transition-all duration-200"
            >
              {/* Miniatura con botón Play de Instagram Reels */}
              <div className="relative aspect-[16/10] w-full bg-[#0A1F33] overflow-hidden">
                {isValidImageSrc(item.thumbnail) ? (
                  <Image
                    src={item.thumbnail}
                    alt={item.title}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                    unoptimized={!isOptimizableImageSrc(item.thumbnail)}
                  />
                ) : (
                  <div className="w-full h-full bg-[#0A1F33] flex items-center justify-center text-white/40 text-xs">
                    DATACAR Reel
                  </div>
                )}

                {/* Overlay sutil al hover */}
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />

                {/* Badge Instagram en esquina superior */}
                <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 bg-[#0A1F33]/85 backdrop-blur-sm text-white border border-white/20 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5">
                  <svg className="w-2.5 h-2.5 fill-[#E1306C]" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                  <span>{item.tag || 'Reel IG'}</span>
                </div>

                {/* BOTÓN PLAY EN EL CENTRO: ESTILO INSTAGRAM REELS (GRADIENTE + CLAQUETA DE REELS) */}
                <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] flex items-center justify-center text-white shadow-xl shadow-[#dc2743]/40 ring-2 ring-white/90 group-hover:scale-115 group-hover:shadow-[#dc2743]/60 transition-all duration-300">
                    {/* Claqueta oficial de Instagram Reels con símbolo de Play */}
                    <svg className="w-5 h-5 fill-white drop-shadow" viewBox="0 0 24 24">
                      <path d="M18.8 2H5.2C3.4 2 2 3.4 2 5.2v13.6C2 20.6 3.4 22 5.2 22h13.6c1.8 0 3.2-1.4 3.2-3.2V5.2C22 3.4 20.6 2 18.8 2zm1.2 16.8c0 .7-.5 1.2-1.2 1.2H5.2c-.7 0-1.2-.5-1.2-1.2V9.8h16v9zm0-11H4V5.2c0-.7.5-1.2 1.2-1.2h1.6l2 2.2h2.4l-2-2.2h2.4l2 2.2h2.4l-2-2.2h1.6c.7 0 1.2.5 1.2 1.2v2.6zM9.5 12.2l6 3.3-6 3.3v-6.6z"/>
                    </svg>
                  </div>
                </div>
              </div>

              {/* Título inferior */}
              <div className="p-3.5 flex flex-col justify-between flex-grow bg-[#FFFFFF]">
                <h3 className="font-bold text-xs sm:text-sm text-[#0A1F33] leading-snug line-clamp-2 group-hover:text-[#E1306C] transition-colors" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
                  {item.title}
                </h3>
                <div className="mt-2.5 flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider">
                  <span className="text-[#E1306C] group-hover:underline">Ver Reel en Instagram</span>
                  <span className="text-[#E1306C]">↗</span>
                </div>
              </div>
            </a>
          ))}
        </div>

      </div>
    </section>
  );
}
