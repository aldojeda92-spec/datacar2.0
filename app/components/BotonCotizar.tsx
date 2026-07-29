'use client';

import React from 'react';
import { useLead } from '../context/LeadContext';

interface BotonCotizarProps {
  vehiculoInteres: string;
  marcaVehiculo: string;
  origenLead: string;
  concesionariaDestino: string;
  textoMenu?: string;
  variante?: 'primario' | 'secundario';
}

export default function BotonCotizar({ 
  vehiculoInteres, 
  marcaVehiculo, 
  origenLead, 
  concesionariaDestino,
  textoMenu = 'Consultar',
  variante = 'primario'
}: BotonCotizarProps) {
  const { openLeadModal } = useLead();

  const handleClick = () => {
    openLeadModal({
      vehiculoInteres,
      marcaVehiculo,
      origenLead,
      concesionariaDestino
    });
  };

  // Estilos basados estrictamente en el Manual de Marca DATACAR v2.1
  const estilosBase = "w-full font-bold text-xs uppercase tracking-widest py-3 transition-colors text-center cursor-pointer";
  const estilosPrimario = "bg-[#00BFFF] text-[#0A1F33] hover:bg-[#0A1F33] hover:text-[#FFFFFF]";
  const estilosSecundario = "border border-[#0A1F33] text-[#0A1F33] hover:bg-[#0A1F33] hover:text-[#FFFFFF]";

  return (
    <button 
      onClick={handleClick}
      className={`${estilosBase} ${variante === 'primario' ? estilosPrimario : estilosSecundario}`}
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      {textoMenu}
    </button>
  );
}