'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';
import LeadModal from '../components/LeadModal';

// 1. Definimos la estructura estricta de los datos que necesitamos capturar
interface LeadData {
  vehiculoInteres: string;
  marcaVehiculo: string;
  origenLead: string;
  concesionariaDestino: string;
}

interface LeadContextType {
  openLeadModal: (data: LeadData) => void;
}

const LeadContext = createContext<LeadContextType | undefined>(undefined);

export function LeadProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [leadData, setLeadData] = useState<LeadData>({
    vehiculoInteres: '',
    marcaVehiculo: '',
    origenLead: '',
    concesionariaDestino: ''
  });

  // Función global para inyectar los datos y abrir el modal
  const openLeadModal = (data: LeadData) => {
    setLeadData(data);
    setIsOpen(true);
  };

  return (
    <LeadContext.Provider value={{ openLeadModal }}>
      {children}
      {/* El modal existe una sola vez en toda la aplicación */}
      <LeadModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        vehiculoInteres={leadData.vehiculoInteres}
        marcaVehiculo={leadData.marcaVehiculo}
        origenLead={leadData.origenLead}
        concesionariaDestino={leadData.concesionariaDestino}
      />
    </LeadContext.Provider>
  );
}

// Hook personalizado para usar el contexto fácilmente
export const useLead = () => {
  const context = useContext(LeadContext);
  if (!context) {
    throw new Error('useLead debe utilizarse dentro de un LeadProvider');
  }
  return context;
};