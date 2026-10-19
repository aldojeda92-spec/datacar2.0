'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { isOptimizableImageSrc, isValidImageSrc } from '../../lib/imageSrc';
import { normalizeExternalUrl } from '../../lib/externalUrl';

export interface HomeSliderSlide {
  id: string;
  order: number;
  isActive: boolean;
  modelId: string;
  brandId?: string;
  brandName?: string;
  modelName?: string;
  badgeText?: string;
  customText: string;
  ctaText: string;
  ctaAction: 'cotizar' | 'ficha' | 'url';
  ctaUrl?: string;
  customImgUrl?: string;
}

export interface HomeSliderConfig {
  enabled: boolean;
  autoPlayMs?: number;
  slides: HomeSliderSlide[];
}

export interface EnrichedSliderSlide extends HomeSliderSlide {
  resolvedBrandId: string;
  resolvedBrandName: string;
  resolvedModelName: string;
  resolvedImg: string;
  resolvedPrice: number;
  resolvedCategory: string;
  resolvedCombustible?: string;
  resolvedTransmision?: string;
  resolvedPlazas?: number;
  resolvedConcesionaria?: string;
  resolvedVersionesCount?: number;
}

interface HomeModelSliderProps {
  slides: EnrichedSliderSlide[];
  autoPlayMs?: number;
  onQuoteModel: (slide: EnrichedSliderSlide) => void;
}

export default function HomeModelSlider({
  slides,
  autoPlayMs = 6000,
  onQuoteModel,
}: HomeModelSliderProps) {
  const activeSlides = slides.filter((s) => s.isActive !== false).slice(0, 3);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (currentIndex >= activeSlides.length) {
      setCurrentIndex(0);
    }
  }, [activeSlides.length, currentIndex]);

  useEffect(() => {
    if (activeSlides.length <= 1 || isPaused) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % activeSlides.length);
    }, autoPlayMs);
    return () => clearInterval(timer);
  }, [activeSlides.length, isPaused, autoPlayMs]);

  if (activeSlides.length === 0) return null;

  const current = activeSlides[currentIndex] || activeSlides[0];
  const fichaUrl = `/catalogo/${current.resolvedBrandId}/${current.modelId}`;

  const goPrev = () => {
    setCurrentIndex((prev) => (prev - 1 + activeSlides.length) % activeSlides.length);
  };

  const goNext = () => {
    setCurrentIndex((prev) => (prev + 1) % activeSlides.length);
  };

  const renderPrimaryCta = (slide: EnrichedSliderSlide) => {
    const baseClasses =
      'bg-[#0A1F33] hover:bg-[#00BFFF] text-[#FFFFFF] hover:text-[#0A1F33] font-bold text-xs uppercase tracking-widest py-4 px-8 rounded-xl shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all inline-flex items-center justify-center gap-2 cursor-pointer';

    const label = slide.ctaText?.trim() || 'Cotizar Modelo';

    if (slide.ctaAction === 'ficha') {
      return (
        <Link href={`/catalogo/${slide.resolvedBrandId}/${slide.modelId}`} className={baseClasses}>
          <span>{label}</span>
          <span>→</span>
        </Link>
      );
    }

    if (slide.ctaAction === 'url' && slide.ctaUrl?.trim()) {
      const targetUrl = normalizeExternalUrl(slide.ctaUrl.trim());
      const isExt = targetUrl.startsWith('http');
      return (
        <a
          href={targetUrl}
          target={isExt ? '_blank' : undefined}
          rel={isExt ? 'noopener noreferrer' : undefined}
          className={baseClasses}
        >
          <span>{label}</span>
          <span>→</span>
        </a>
      );
    }

    return (
      <button type="button" onClick={() => onQuoteModel(slide)} className={baseClasses}>
        <span>{label}</span>
        <span>→</span>
      </button>
    );
  };

  return (
    <section
      className="max-w-[1400px] mx-auto px-4 lg:px-8 my-14 w-full"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="bg-[#FFFFFF] rounded-3xl border border-[#0A1F33]/12 shadow-xl overflow-hidden">
        {/* Cabecera Editorial + Selector de los hasta 3 Modelos Destacados */}
        <div className="bg-[#F8F9FA] border-b border-[#0A1F33]/10 px-6 sm:px-10 py-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-8 rounded-full bg-[#00BFFF] block"></span>
            <div>
              <span className="text-[10px] font-bold text-[#00BFFF] uppercase tracking-widest block">
                Selección Destacada DATACAR
              </span>
              <h2
                className="font-black text-xl sm:text-2xl text-[#0A1F33] uppercase"
                style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}
              >
                Modelos más <span className="text-[#3A3A3C]">vendidos</span>
              </h2>
            </div>
          </div>

          {/* Pestañas de los hasta 3 modelos + flechas */}
          <div className="flex flex-wrap items-center gap-2">
            {activeSlides.map((slide, idx) => {
              const isCurrent = idx === currentIndex;
              return (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => setCurrentIndex(idx)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border flex items-center gap-2 cursor-pointer ${
                    isCurrent
                      ? 'bg-[#0A1F33] text-[#FFFFFF] border-[#0A1F33] shadow-sm'
                      : 'bg-[#FFFFFF] text-[#3A3A3C] border-[#0A1F33]/15 hover:border-[#00BFFF] hover:text-[#0A1F33]'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-black ${
                      isCurrent ? 'bg-[#00BFFF] text-[#0A1F33]' : 'bg-[#F8F9FA] text-[#3A3A3C]'
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <span>
                    {slide.resolvedBrandName} {slide.resolvedModelName}
                  </span>
                </button>
              );
            })}

            {activeSlides.length > 1 && (
              <div className="flex items-center gap-1 ml-1">
                <button
                  type="button"
                  onClick={goPrev}
                  aria-label="Anterior"
                  className="w-8 h-8 rounded-xl border border-[#0A1F33]/15 bg-[#FFFFFF] hover:bg-[#0A1F33] text-[#0A1F33] hover:text-[#FFFFFF] flex items-center justify-center transition-colors font-bold cursor-pointer"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  aria-label="Siguiente"
                  className="w-8 h-8 rounded-xl border border-[#0A1F33]/15 bg-[#FFFFFF] hover:bg-[#0A1F33] text-[#0A1F33] hover:text-[#FFFFFF] flex items-center justify-center transition-colors font-bold cursor-pointer"
                >
                  ›
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Cuerpo Principal de la Vitrina */}
        <div className="grid grid-cols-1 lg:grid-cols-12 items-center p-6 sm:p-10 gap-8 bg-gradient-to-br from-[#FFFFFF] via-[#FFFFFF] to-[#F5FBFF]">
          {/* Escenario Visual del Vehículo (Izquierda) */}
          <div className="lg:col-span-6 relative">
            <div className="relative h-60 sm:h-72 rounded-2xl bg-gradient-to-b from-[#F8F9FA] to-[#FFFFFF] border border-[#0A1F33]/10 p-6 flex items-center justify-center overflow-hidden">
              <div className="absolute top-4 left-4 z-10 flex flex-wrap gap-2">
                <span className="bg-[#0A1F33] text-[#00BFFF] text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-xs">
                  {current.badgeText || '⭐ Destacado'}
                </span>
                <span className="bg-[#FFFFFF] border border-[#0A1F33]/15 text-[#0A1F33] text-[9px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
                  {current.resolvedCategory}
                </span>
              </div>

              {isValidImageSrc(current.resolvedImg) ? (
                <Image
                  src={current.resolvedImg}
                  alt={`${current.resolvedBrandName} ${current.resolvedModelName}`}
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-contain p-6 transition-transform duration-500 hover:scale-105"
                  unoptimized={!isOptimizableImageSrc(current.resolvedImg)}
                />
              ) : (
                <div className="text-xs font-bold text-[#C0C0C0] uppercase tracking-widest">
                  Sin imagen disponible
                </div>
              )}
            </div>
          </div>

          {/* Detalles del Modelo + Texto Admin + CTA Admin (Derecha) */}
          <div className="lg:col-span-6 flex flex-col items-start">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-xs font-black text-[#00BFFF] uppercase tracking-widest">
                {current.resolvedBrandName}
              </span>
              {current.resolvedConcesionaria && (
                <span className="text-[10px] font-bold text-[#1E8E3E] bg-[#E6F4EA] border border-[#1E8E3E]/25 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  ✓ Oficial: {current.resolvedConcesionaria}
                </span>
              )}
            </div>

            <h3
              className="font-black text-3xl sm:text-4xl text-[#0A1F33] uppercase leading-tight mb-3"
              style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}
            >
              {current.resolvedModelName}
            </h3>

            {/* Texto configurado desde el ADMIN */}
            <div className="w-full bg-[#F8F9FA] border-l-4 border-[#00BFFF] rounded-r-xl p-4 mb-5">
              <p
                className="text-xs sm:text-sm text-[#3A3A3C] font-medium leading-relaxed"
                style={{ fontFamily: 'var(--font-inter), sans-serif' }}
              >
                {current.customText}
              </p>
            </div>

            {/* Cuadrícula de Especificaciones y Precio */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 w-full mb-6">
              <div className="bg-[#0A1F33] text-[#FFFFFF] rounded-xl p-3">
                <span className="text-[8px] font-bold text-[#00BFFF] uppercase tracking-widest block mb-0.5">
                  Desde Contado
                </span>
                <span
                  className="font-black text-sm sm:text-base text-[#FFFFFF]"
                  style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}
                >
                  US$ {current.resolvedPrice.toLocaleString()}
                </span>
              </div>

              <div className="bg-[#F8F9FA] border border-[#0A1F33]/10 rounded-xl p-3">
                <span className="text-[8px] font-bold text-[#6A6A6C] uppercase tracking-widest block mb-0.5">
                  Motorización
                </span>
                <span className="font-bold text-xs text-[#0A1F33] uppercase truncate block">
                  {current.resolvedCombustible || 'Nafta'}
                </span>
              </div>

              <div className="bg-[#F8F9FA] border border-[#0A1F33]/10 rounded-xl p-3">
                <span className="text-[8px] font-bold text-[#6A6A6C] uppercase tracking-widest block mb-0.5">
                  Transmisión
                </span>
                <span className="font-bold text-xs text-[#0A1F33] uppercase truncate block">
                  {current.resolvedTransmision &&
                  (current.resolvedTransmision.toLowerCase().includes('auto') ||
                    current.resolvedTransmision.toLowerCase().includes('at') ||
                    current.resolvedTransmision.toLowerCase().includes('cvt'))
                    ? 'Automática'
                    : 'Manual'}
                </span>
              </div>

              <div className="bg-[#F8F9FA] border border-[#0A1F33]/10 rounded-xl p-3">
                <span className="text-[8px] font-bold text-[#6A6A6C] uppercase tracking-widest block mb-0.5">
                  Capacidad
                </span>
                <span className="font-bold text-xs text-[#0A1F33] uppercase truncate block">
                  {current.resolvedPlazas || 5} Plazas
                </span>
              </div>
            </div>

            {/* Acciones: CTA configurado en ADMIN + Enlace a Ficha Técnica */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full">
              {renderPrimaryCta(current)}
              {current.ctaAction !== 'ficha' && (
                <Link
                  href={fichaUrl}
                  className="border border-[#0A1F33]/20 bg-[#FFFFFF] hover:border-[#00BFFF] text-[#0A1F33] hover:text-[#00BFFF] font-bold text-xs uppercase tracking-widest py-4 px-6 rounded-xl transition-all text-center"
                >
                  Ver Ficha y Versiones →
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
