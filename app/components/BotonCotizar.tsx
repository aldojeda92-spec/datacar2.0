'use client';

import React from 'react';
import { useLead } from '../context/LeadContext';
import { sanitizeDealershipName, formatHablarCon } from '../../lib/dealerships';

interface BotonCotizarProps {
  vehiculoInteres: string;
  marcaVehiculo: string;
  modeloVehiculo?: string;
  origenLead: string;
  concesionariaDestino: string;
  textoMenu?: string;
  variante?: 'primario' | 'secundario';
}

export default function BotonCotizar({ 
  vehiculoInteres, 
  marcaVehiculo, 
  modeloVehiculo,
  origenLead, 
  concesionariaDestino,
  textoMenu,
  variante = 'primario'
}: BotonCotizarProps) {
  const { openLeadModal } = useLead();
  const cleanConcesionaria = sanitizeDealershipName(concesionariaDestino);

  const handleClick = () => {
    openLeadModal({
      vehiculoInteres,
      marcaVehiculo,
      modeloVehiculo,
      origenLead,
      concesionariaDestino: cleanConcesionaria
    });
  };

  const labelBoton = textoMenu || formatHablarCon(cleanConcesionaria);

  // Estilos basados estrictamente en el Manual de Marca DATACAR v2.1 (Contemporary Web-App)
  const estilosBase = "w-full font-bold text-xs uppercase tracking-widest py-3 transition-all duration-200 text-center cursor-pointer rounded-xl shadow-xs hover:shadow-md";
  const estilosPrimario = "bg-[#00BFFF] text-[#0A1F33] hover:bg-[#0A1F33] hover:text-[#FFFFFF]";
  const estilosSecundario = "border border-[#0A1F33]/20 text-[#0A1F33] hover:bg-[#0A1F33] hover:text-[#FFFFFF]";

  return (
    <button 
      onClick={handleClick}
      className={`${estilosBase} ${variante === 'primario' ? estilosPrimario : estilosSecundario}`}
      style={{ fontFamily: 'var(--font-inter), sans-serif' }}
    >
      {labelBoton}
    </button>
  );
}