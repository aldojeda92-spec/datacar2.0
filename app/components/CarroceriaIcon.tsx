import React from 'react';
import { normalizeCarroceria } from '../../lib/carroceria';

// Siluetas esquematicas por tipo de carroceria, en el mismo lenguaje de linea
// que el resto de los iconos del sitio (fill none, stroke currentColor).
// Reemplazan al emoji generico repetido que impedia a un comprador novato
// distinguir un SUV de un sedan o de una pickup.

type Props = { tipo: string | null | undefined; className?: string; title?: string };

const P = ({ d }: { d: string }) => (
  <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
);
const Ruedas = ({ cx1 = 7, cx2 = 17, cy = 17, r = 2.1 }: { cx1?: number; cx2?: number; cy?: number; r?: number }) => (
  <>
    <circle cx={cx1} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth="1.5" />
    <circle cx={cx2} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth="1.5" />
  </>
);

function Shape({ tipo }: { tipo: string }) {
  switch (tipo) {
    case 'SUV':
    case 'CROSSOVER':
      // Techo alto y largo, voladizos cortos.
      return (<><P d="M2 15v-2l2-1 1.5-3.2A2 2 0 0 1 7.3 7h8.4a2 2 0 0 1 1.6.8L20 12l2 1v2" /><P d="M2 15h3M9 15h6M19 15h3" /><Ruedas /></>);
    case 'SEDÁN':
      // Tres volumenes: capot, habitaculo, baul definido.
      return (<><P d="M2 15v-1l3-1 3-3.5A2 2 0 0 1 9.6 8h4.6a2 2 0 0 1 1.5.7L19 13l3 1v1" /><P d="M6.5 13l2.4-2.8h4.3L16 13z" /><P d="M2 15h3M9 15h6M19 15h3" /><Ruedas /></>);
    case 'HATCHBACK':
      // Dos volumenes, porton trasero casi vertical, compacto.
      return (<><P d="M3 15v-1l2.5-1 2.5-3.2A2 2 0 0 1 9.6 9h5.8a2 2 0 0 1 1.5.7L19 13l1 .5.7 1.5" /><P d="M7 13l2-2.6h5.5L16.5 13z" /><P d="M3 15h3.5M9.5 15h5M18 15h3" /><Ruedas cx1={7.5} cx2={16.5} /></>);
    case 'PICKUP':
    case 'PICKUP DOBLE CABINA':
    case 'PICKUP CABINA SIMPLE':
      // Cabina adelante + caja de carga abierta atras.
      return (<><P d="M2 15v-2h9l1.5-3.5A2 2 0 0 1 14.3 8H16v5h6v2" /><P d="M2 13h9M16 8v5" /><P d="M2 15h3M9 15h7M20 15h2" /><Ruedas cx1={7} cx2={18} /></>);
    case 'MINIVAN':
      // Monovolumen: una sola linea continua del capot al porton.
      return (<><P d="M2 15v-2.5l1.5-1L6 7.6A2 2 0 0 1 7.8 6.5h6.4a2 2 0 0 1 1.8 1.1L20 13l2 1v1" /><P d="M2 12.5h20" /><P d="M2 15h3.5M9.5 15h5M18 15h4" /><Ruedas cx1={7.5} cx2={16.5} /></>);
    case 'FURGÓN':
    case 'FURGÓN CARGO':
      // Caja alta y cerrada, frente corto.
      return (<><P d="M3 15V9a1 1 0 0 1 1-1h10.5a1 1 0 0 1 .8.4L18 12h3a1 1 0 0 1 1 1v2" /><P d="M15 8v4h7" /><P d="M3 15h3M9 15h7M20 15h2" /><Ruedas cx1={7.5} cx2={18} /></>);
    case 'MINIBÚS':
      // Caja muy larga y alta, ventanas seguidas.
      return (<><P d="M2 15V8.5a1 1 0 0 1 1-1h17a1 1 0 0 1 1 1V15" /><P d="M2 11h20M6 8v3M11 8v3M16 8v3" /><P d="M2 15h4M9 15h6M19 15h3" /><Ruedas cx1={7} cx2={17} /></>);
    case 'CONVERTIBLE':
    case 'DEPORTIVO':
      // Perfil bajo y largo, techo apenas insinuado.
      return (<><P d="M2 15v-1l3-.5 4-2.2A6 6 0 0 1 12 10.5h4l4 2 2 .5v2" /><P d="M6 12.5l3-1.6" /><P d="M2 15h4M10 15h5M19 15h3" /><Ruedas cx1={7.5} cx2={17.5} /></>);
    default:
      // Silueta neutra de auto.
      return (<><P d="M2 15v-1.5l2.5-1L7 9.2A2 2 0 0 1 8.7 8h6.6a2 2 0 0 1 1.6.8L19 12l3 1v2" /><P d="M2 15h3.5M9.5 15h5M18 15h4" /><Ruedas /></>);
  }
}

export default function CarroceriaIcon({ tipo, className = 'w-6 h-6', title }: Props) {
  const canon = normalizeCarroceria(tipo);
  return (
    <svg viewBox="0 0 24 22" className={className} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      {title ? <title>{title}</title> : null}
      <Shape tipo={canon} />
    </svg>
  );
}
