'use client';

import React from 'react';
import { GLOSARIO, siglasEnTexto } from '../../lib/glosario';
import { useDisclosure } from '../../lib/useDisclosure';

// Bloque "¿Qué significan estas siglas?" que se auto-arma con las siglas
// tecnicas presentes en los textos que recibe (transmision, combustible,
// ADAS...). Si no hay ninguna sigla conocida no renderiza nada.
export default function GlosarioSiglas({
  fuentes,
  titulo = '¿Qué significan estas siglas?',
  className = '',
}: {
  fuentes: (string | null | undefined)[];
  titulo?: string;
  className?: string;
}) {
  const { isOpen, toggle, buttonProps, panelProps } = useDisclosure(false);
  const siglas = siglasEnTexto(...fuentes);

  if (siglas.length === 0) return null;

  return (
    <div className={`border border-[#C0C0C0] bg-[#F8F9FA] ${className}`}>
      <button
        type="button"
        onClick={toggle}
        {...buttonProps}
        className="w-full flex justify-between items-center gap-3 px-4 py-3 text-left group"
      >
        <span className="text-[10px] font-bold text-[#0A1F33] uppercase tracking-widest">
          {titulo} <span className="text-[#C0C0C0]">({siglas.length})</span>
        </span>
        <span className="text-[#0A1F33] text-lg font-light leading-none">{isOpen ? '−' : '+'}</span>
      </button>
      <dl {...panelProps} hidden={!isOpen} className="px-4 pb-4 flex flex-col gap-3">
        {siglas.map(sigla => (
          <div key={sigla}>
            <dt className="text-[11px] font-bold text-[#0A1F33] uppercase tracking-wide">{sigla}</dt>
            <dd className="text-[11px] text-[#3A3A3C] leading-snug mt-0.5">{GLOSARIO[sigla]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
