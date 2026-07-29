// app/components/LeadModal.tsx (Ajusta la ruta del comentario si es diferente)
'use client';

import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
// CORRECCIÓN BUGS DE RUTA: Subimos dos niveles (../../) para encontrar lib/firebase y lib/mailer
import { db } from '../../lib/firebase'; 
import { sendLeadNotificationEmail } from '../../lib/mailer';

interface LeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehiculoInteres: string;      
  marcaVehiculo: string;        
  origenLead: string;           
  concesionariaDestino: string; 
}

export default function LeadModal({ 
  isOpen, 
  onClose, 
  vehiculoInteres, 
  marcaVehiculo, 
  origenLead, 
  concesionariaDestino 
}: LeadModalProps) {
  const [formData, setFormData] = useState({ nombre: '', telefono: '', email: '' });
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');

    // Validación estricta B2B de Paraguay
    const phoneRegex = /^09\d{8}$/;
    if (!phoneRegex.test(formData.telefono)) {
      alert("El celular debe tener 10 dígitos y empezar con 09.");
      setStatus('idle');
      return;
    }

    try {
      // 1. Inyección directa a Firebase (La Bóveda)
      await addDoc(collection(db, 'leads'), {
        nombre: formData.nombre.trim(),
        telefono: formData.telefono.trim(),
        email: formData.email.trim() || 'No proporcionado',
        vehiculo: `${marcaVehiculo} ${vehiculoInteres}`,
        origen: origenLead,
        concesionaria_destino: concesionariaDestino || 'A designar (Central DATACAR)',
        estado: 'Nuevo',
        createdAt: serverTimestamp()
      });

      // 2. Disparo de Mailing B2B a la Concesionaria / DATACAR (Fail-Safe)
      try {
        await sendLeadNotificationEmail({
          leadName: formData.nombre.trim(),
          leadPhone: formData.telefono.trim(),
          leadEmail: formData.email.trim(),
          vehicleOfInterest: `${marcaVehiculo} ${vehiculoInteres}`,
          origen: origenLead,
          concesionariaDestino: concesionariaDestino || 'Central DATACAR'
        });
      } catch (mailError) {
        // Silenciamos el error de correo hacia el cliente. El Lead YA está salvado en DB.
        console.error("El lead se guardó, pero falló el envío del correo B2B:", mailError);
      }

      // 3. UX de Éxito
      setStatus('success');
      setTimeout(() => {
        setStatus('idle');
        setFormData({ nombre: '', telefono: '', email: '' });
        onClose();
      }, 3500);

    } catch (error) {
      console.error("Error guardando el Lead:", error);
      setStatus('error');
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0A1F33]/90 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-[#FFFFFF] w-full max-w-md p-8 border-t-4 border-[#00BFFF] relative shadow-none rounded-none">
        
        {/* BOTÓN CERRAR FLAT */}
        <button 
          onClick={onClose} 
          disabled={status === 'loading'}
          className="absolute top-4 right-4 text-[#C0C0C0] hover:text-[#0A1F33] text-xl font-black transition-colors disabled:opacity-50"
          aria-label="Cerrar modal"
        >
          ✕
        </button>

        {status === 'success' ? (
          <div className="text-center py-10">
            <div className="w-16 h-16 bg-[#F8F9FA] border-2 border-[#00BFFF] text-[#00BFFF] rounded-none flex items-center justify-center mx-auto mb-6 text-3xl font-black">
              ✓
            </div>
            <h3 className="font-black text-2xl text-[#0A1F33] uppercase mb-2" style={{ fontFamily: 'Montserrat, sans-serif' }}>
              ¡Solicitud Enviada!
            </h3>
            <p className="text-xs text-[#3A3A3C] font-medium leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>
              Un asesor de <strong className="text-[#0A1F33]">{concesionariaDestino || 'DATACAR'}</strong> se contactará contigo a la brevedad para avanzar con tu {marcaVehiculo}.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <span className="text-[10px] font-bold text-[#00BFFF] uppercase tracking-widest block mb-1">
                Paso Final
              </span>
              <h3 className="font-black text-2xl text-[#0A1F33] uppercase leading-tight mb-2" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                Solicitar Cotización
              </h3>
              <p className="text-[10px] text-[#C0C0C0] uppercase tracking-widest font-bold border-b border-[#C0C0C0]/50 pb-4">
                Vehículo: <span className="text-[#3A3A3C]">{marcaVehiculo} {vehiculoInteres}</span>
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4" style={{ fontFamily: 'Inter, sans-serif' }}>
              <div>
                <label className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest block mb-1">Nombre y Apellido <span className="text-[#D93025]">*</span></label>
                <input 
                  type="text" 
                  required 
                  disabled={status === 'loading'}
                  className="w-full border border-[#C0C0C0] bg-[#F8F9FA] p-3 text-xs focus:outline-none focus:border-[#0A1F33] transition-colors rounded-none disabled:opacity-50" 
                  placeholder="Ej: Juan Pérez"
                  value={formData.nombre}
                  onChange={(e) => setFormData({...formData, nombre: e.target.value})}
                />
              </div>
              
              <div>
                <label className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest block mb-1">Celular (WhatsApp) <span className="text-[#D93025]">*</span></label>
                <input 
                  type="tel" 
                  required 
                  disabled={status === 'loading'}
                  minLength={10}
                  maxLength={10}
                  className="w-full border border-[#C0C0C0] bg-[#F8F9FA] p-3 text-xs focus:outline-none focus:border-[#0A1F33] transition-colors rounded-none disabled:opacity-50" 
                  placeholder="Ej: 0981234567"
                  value={formData.telefono}
                  onChange={(e) => setFormData({...formData, telefono: e.target.value})}
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest block mb-1">Correo Electrónico <span className="text-[#C0C0C0] font-normal">(Opcional)</span></label>
                <input 
                  type="email" 
                  disabled={status === 'loading'}
                  className="w-full border border-[#C0C0C0] bg-[#F8F9FA] p-3 text-xs focus:outline-none focus:border-[#0A1F33] transition-colors rounded-none disabled:opacity-50" 
                  placeholder="ejemplo@correo.com"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                />
              </div>

              {status === 'error' && (
                <p className="text-[10px] text-[#D93025] font-bold uppercase tracking-widest bg-[#FCE8E6] p-3 text-center border border-[#D93025]/30 mt-2">
                  Ocurrió un error de conexión. Intenta de nuevo.
                </p>
              )}

              <button 
                type="submit" 
                disabled={status === 'loading'}
                className="w-full bg-[#0A1F33] hover:bg-[#00BFFF] text-[#FFFFFF] font-bold text-xs uppercase tracking-widest py-4 mt-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-transparent rounded-none"
              >
                {status === 'loading' ? 'Procesando...' : 'Enviar Solicitud a la Concesionaria →'}
              </button>
              
              {/* Trust Badge (UX/CRO) */}
              <p className="text-[9px] text-center text-[#C0C0C0] uppercase tracking-widest mt-1">
                🔒 Tus datos están encriptados. No enviamos spam.
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}