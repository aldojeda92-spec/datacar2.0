// app/components/LeadModal.tsx
'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
// CORRECCIÓN BUGS DE RUTA: Subimos dos niveles (../../) para encontrar lib/firebase y lib/mailer
import { db } from '../../lib/firebase';
import { sendLeadNotificationEmail } from '../../lib/mailer';
import { normalizePhonePY } from '../../lib/phone';
import { track } from '../../lib/analytics';
import Modal from './a11y/Modal';

interface LeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehiculoInteres: string;
  marcaVehiculo: string;
  origenLead: string;
  concesionariaDestino: string;
}

// Negocio aceptó leads sin celular (2026): pedimos nombre + al menos un medio
// de contacto (celular O correo). El backend (firestore.rules) ya acepta
// `telefono: 'No proporcionado'`.
const TELEFONO_OBLIGATORIO = false;

export default function LeadModal({
  isOpen,
  onClose,
  vehiculoInteres,
  marcaVehiculo,
  origenLead,
  concesionariaDestino,
}: LeadModalProps) {
  const [formData, setFormData] = useState({ nombre: '', telefono: '', email: '' });
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [fieldErrors, setFieldErrors] = useState<{ nombre?: string; telefono?: string; email?: string }>({});
  const nombreRef = useRef<HTMLInputElement>(null);
  const idPrefix = useId();
  const nombreId = `${idPrefix}-nombre`;
  const telefonoId = `${idPrefix}-telefono`;
  const emailId = `${idPrefix}-email`;
  const telefonoErrId = `${idPrefix}-telefono-err`;
  const emailErrId = `${idPrefix}-email-err`;

  // Telemetría de embudo: apertura del modal (con su origen).
  useEffect(() => {
    if (isOpen) track('lead_modal_open', { origen: origenLead, marca: marcaVehiculo });
  }, [isOpen, origenLead, marcaVehiculo]);

  // Autofocus en el primer campo real (el Modal a11y enfoca el botón ✕).
  useEffect(() => {
    if (isOpen && status === 'idle') {
      const t = setTimeout(() => nombreRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [isOpen, status]);

  if (!isOpen) return null;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const validate = () => {
    const errors: { nombre?: string; telefono?: string; email?: string } = {};
    const email = formData.email.trim();
    const phone = normalizePhonePY(formData.telefono);

    if (formData.nombre.trim().length < 2) errors.nombre = 'Ingresá tu nombre.';

    if (TELEFONO_OBLIGATORIO || formData.telefono.trim()) {
      if (!phone.valid) errors.telefono = 'Celular inválido. Debe ser un número paraguayo, ej: 0981 234 567.';
    }
    if (email && !emailRegex.test(email)) {
      errors.email = 'Revisá el formato del correo.';
    }
    if (!TELEFONO_OBLIGATORIO && !phone.valid && !email) {
      errors.telefono = 'Dejanos al menos un celular o un correo para contactarte.';
    }
    return { errors, normalizedPhone: phone.value };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    track('lead_submit_attempt', { origen: origenLead });

    const { errors, normalizedPhone } = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      track('lead_submit_error', { origen: origenLead, motivo: Object.keys(errors).join(',') });
      return;
    }
    setFieldErrors({});
    setStatus('loading');

    const telefonoFinal = normalizedPhone && normalizePhonePY(normalizedPhone).valid
      ? normalizedPhone
      : 'No proporcionado';

    try {
      // 1. Inyección directa a Firebase (La Bóveda)
      await addDoc(collection(db, 'leads'), {
        nombre: formData.nombre.trim(),
        telefono: telefonoFinal,
        email: formData.email.trim() || 'No proporcionado',
        vehiculo: `${marcaVehiculo} ${vehiculoInteres}`,
        marca: marcaVehiculo,
        origen: origenLead,
        concesionaria_destino: concesionariaDestino || 'A designar (Central DATACAR)',
        concesionaria_destino_norm: (concesionariaDestino || 'A DESIGNAR').toUpperCase().trim(),
        estado: 'Nuevo',
        createdAt: serverTimestamp(),
      });

      // 2. Disparo de Mailing B2B a la Concesionaria / DATACAR (Fail-Safe)
      try {
        await sendLeadNotificationEmail({
          leadName: formData.nombre.trim(),
          leadPhone: telefonoFinal,
          leadEmail: formData.email.trim(),
          vehicleOfInterest: `${marcaVehiculo} ${vehiculoInteres}`,
          origen: origenLead,
          concesionariaDestino: concesionariaDestino || 'Central DATACAR',
        });
      } catch (mailError) {
        // Silenciamos el error de correo hacia el cliente. El Lead YA está salvado en DB.
        console.error('El lead se guardó, pero falló el envío del correo B2B:', mailError);
      }

      track('lead_submit_success', {
        origen: origenLead,
        marca: marcaVehiculo,
        con_telefono: telefonoFinal !== 'No proporcionado',
        con_email: !!formData.email.trim(),
      });

      // 3. UX de Éxito
      setStatus('success');
      setTimeout(() => {
        setStatus('idle');
        setFormData({ nombre: '', telefono: '', email: '' });
        onClose();
      }, 3500);
    } catch (error) {
      console.error('Error guardando el Lead:', error);
      track('lead_submit_error', { origen: origenLead, motivo: 'firestore' });
      setStatus('error');
    }
  };

  const inputBase =
    'w-full border bg-[#F8F9FA] p-3 text-xs focus:outline-none transition-colors rounded-none disabled:opacity-50';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      overlayClassName="fixed inset-0 bg-[#0A1F33]/90 z-[100] flex items-center justify-center p-4 backdrop-blur-sm"
      panelClassName="bg-[#FFFFFF] w-full max-w-md p-8 border-t-4 border-[#00BFFF] relative shadow-none rounded-none"
    >
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
          <h3 className="font-black text-2xl text-[#0A1F33] uppercase mb-2" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
            ¡Listo, te contactamos!
          </h3>
          <p className="text-xs text-[#3A3A3C] font-medium leading-relaxed" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
            Un asesor de <strong className="text-[#0A1F33]">{concesionariaDestino || 'DATACAR'}</strong> te va a contactar en menos de 2 h hábiles para avanzar con tu {marcaVehiculo}.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-6">
            <span className="text-[10px] font-bold text-[#00BFFF] uppercase tracking-widest block mb-1">
              Asesoría sin costo
            </span>
            <h3 className="font-black text-2xl text-[#0A1F33] uppercase leading-tight mb-2" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
              Quiero que me contacten
            </h3>
            <p className="text-[10px] text-[#C0C0C0] uppercase tracking-widest font-bold border-b border-[#C0C0C0]/50 pb-4">
              Vehículo: <span className="text-[#3A3A3C]">{marcaVehiculo} {vehiculoInteres}</span>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4" style={{ fontFamily: 'var(--font-inter), sans-serif' }} noValidate>
            <div>
              <label htmlFor={nombreId} className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest block mb-1">Nombre y Apellido <span className="text-[#D93025]">*</span></label>
              <input
                ref={nombreRef}
                id={nombreId}
                type="text"
                required
                disabled={status === 'loading'}
                aria-invalid={!!fieldErrors.nombre}
                className={`${inputBase} ${fieldErrors.nombre ? 'border-[#D93025] bg-[#FCE8E6]' : 'border-[#C0C0C0] focus:border-[#0A1F33]'}`}
                placeholder="Ej: Juan Pérez"
                value={formData.nombre}
                onFocus={() => track('lead_field_focus', { origen: origenLead, campo: 'nombre' })}
                onChange={(e) => {
                  setFormData({ ...formData, nombre: e.target.value });
                  if (fieldErrors.nombre) setFieldErrors({ ...fieldErrors, nombre: undefined });
                }}
              />
              {fieldErrors.nombre && (
                <p className="text-[10px] text-[#D93025] font-bold mt-1">{fieldErrors.nombre}</p>
              )}
            </div>

            <div>
              <label htmlFor={telefonoId} className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest block mb-1">
                Celular (WhatsApp) {TELEFONO_OBLIGATORIO ? <span className="text-[#D93025]">*</span> : <span className="text-[#C0C0C0] font-normal">(o dejá tu correo)</span>}
              </label>
              <input
                id={telefonoId}
                type="tel"
                inputMode="tel"
                required={TELEFONO_OBLIGATORIO}
                disabled={status === 'loading'}
                aria-invalid={!!fieldErrors.telefono}
                aria-describedby={fieldErrors.telefono ? telefonoErrId : undefined}
                className={`${inputBase} ${fieldErrors.telefono ? 'border-[#D93025] bg-[#FCE8E6]' : 'border-[#C0C0C0] focus:border-[#0A1F33]'}`}
                placeholder="Ej: 0981 234 567"
                value={formData.telefono}
                onFocus={() => track('lead_field_focus', { origen: origenLead, campo: 'telefono' })}
                onChange={(e) => {
                  setFormData({ ...formData, telefono: e.target.value });
                  if (fieldErrors.telefono) setFieldErrors({ ...fieldErrors, telefono: undefined });
                }}
              />
              {fieldErrors.telefono && (
                <p id={telefonoErrId} className="text-[10px] text-[#D93025] font-bold mt-1">{fieldErrors.telefono}</p>
              )}
            </div>

            <div>
              <label htmlFor={emailId} className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest block mb-1">
                Correo Electrónico <span className="text-[#C0C0C0] font-normal">{TELEFONO_OBLIGATORIO ? '(Opcional)' : '(o dejá tu celular)'}</span>
              </label>
              <input
                id={emailId}
                type="email"
                disabled={status === 'loading'}
                aria-invalid={!!fieldErrors.email}
                aria-describedby={fieldErrors.email ? emailErrId : undefined}
                className={`${inputBase} ${fieldErrors.email ? 'border-[#D93025] bg-[#FCE8E6]' : 'border-[#C0C0C0] focus:border-[#0A1F33]'}`}
                placeholder="ejemplo@correo.com"
                value={formData.email}
                onFocus={() => track('lead_field_focus', { origen: origenLead, campo: 'email' })}
                onChange={(e) => {
                  setFormData({ ...formData, email: e.target.value });
                  if (fieldErrors.email) setFieldErrors({ ...fieldErrors, email: undefined });
                }}
              />
              {fieldErrors.email && (
                <p id={emailErrId} className="text-[10px] text-[#D93025] font-bold mt-1">{fieldErrors.email}</p>
              )}
            </div>

            {status === 'error' && (
              <p className="text-[10px] text-[#D93025] font-bold uppercase tracking-widest bg-[#FCE8E6] p-3 text-center border border-[#D93025]/30 mt-2">
                Ocurrió un error de conexión. Intentá de nuevo.
              </p>
            )}

            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full bg-[#0A1F33] hover:bg-[#00BFFF] text-[#FFFFFF] font-bold text-xs uppercase tracking-widest py-4 mt-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-transparent rounded-none"
            >
              {status === 'loading' ? 'Procesando...' : 'Quiero que me contacten'}
            </button>

            <p className="text-[10px] text-center text-[#3A3A3C] font-medium leading-relaxed mt-1" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
              Te contactamos por WhatsApp o correo en menos de 2 h hábiles. Sin llamados fríos, sin spam.
            </p>
          </form>
        </>
      )}
    </Modal>
  );
}
