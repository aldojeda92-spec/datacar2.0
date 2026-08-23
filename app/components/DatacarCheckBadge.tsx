'use client';

import React, { useState } from 'react';
import Modal from './a11y/Modal';
import { DATACAR_CHECK_TITLE, DATACAR_CHECK_BODY } from '../../lib/datacarCheck';

interface DatacarCheckBadgeProps {
  /** 'sm' para tarjetas de catálogo/comparador, 'md' para fichas de detalle. */
  size?: 'sm' | 'md';
  /** Nombre de la concesionaria responsable, se muestra en el panel explicativo. */
  concesionariaNombre?: string;
  className?: string;
}

// Ícono de escudo con check: es el mismo lenguaje visual que ya usa el sitio
// para transmitir "verificado" (ver bloque "Compra Protegida" en la ficha de
// modelo), así el sello DATACAR CHECK se siente nativo del manual de marca.
function ShieldCheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
      />
    </svg>
  );
}

export default function DatacarCheckBadge({ size = 'sm', concesionariaNombre, className = '' }: DatacarCheckBadgeProps) {
  const [showInfo, setShowInfo] = useState(false);
  const isSmall = size === 'sm';

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowInfo(true); }}
        title="¿Qué es DATACAR CHECK?"
        className={`inline-flex items-center bg-[#E6F4EA] border border-[#1E8E3E] text-[#1E8E3E] font-black uppercase tracking-widest hover:bg-[#1E8E3E] hover:text-[#FFFFFF] transition-colors rounded-none outline-none cursor-pointer ${isSmall ? 'text-[8px] px-1.5 py-0.5 gap-1' : 'text-[10px] px-2.5 py-1.5 gap-1.5'} ${className}`}
      >
        <ShieldCheckIcon className={isSmall ? 'w-2.5 h-2.5 shrink-0' : 'w-3.5 h-3.5 shrink-0'} />
        DATACAR CHECK
      </button>

      <Modal
        isOpen={showInfo}
        onClose={() => setShowInfo(false)}
        overlayClassName="fixed inset-0 bg-[#0A1F33]/80 z-[60] flex items-center justify-center p-4 backdrop-blur-sm"
        panelClassName="bg-[#FFFFFF] p-8 max-w-md w-full border-t-4 border-[#1E8E3E] rounded-none relative"
      >
        <button onClick={() => setShowInfo(false)} className="absolute top-4 right-4 text-[#C0C0C0] hover:text-[#D93025] font-black border-none outline-none">✕</button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-[#1E8E3E] flex items-center justify-center text-[#FFFFFF] shrink-0">
            <ShieldCheckIcon className="w-5 h-5" />
          </div>
          <h3 className="font-black text-xl text-[#0A1F33] uppercase" style={{ fontFamily: 'Montserrat, sans-serif' }}>{DATACAR_CHECK_TITLE}</h3>
        </div>

        <p className="text-sm text-[#3A3A3C] leading-relaxed font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
          {DATACAR_CHECK_BODY}
        </p>

        {concesionariaNombre && (
          <p className="mt-4 text-[10px] font-bold text-[#1E8E3E] uppercase tracking-widest border-t border-[#C0C0C0] pt-4">
            Concesionaria responsable de este producto: {concesionariaNombre}
          </p>
        )}
      </Modal>
    </>
  );
}
