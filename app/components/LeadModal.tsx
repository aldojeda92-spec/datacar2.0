// app/components/LeadModal.tsx
'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
// CORRECCIÓN BUGS DE RUTA: Subimos dos niveles (../../) para encontrar lib/firebase y lib/mailer
import { db } from '../../lib/firebase';
import { sendLeadNotificationEmail } from '../../lib/mailer';
import { normalizePhonePY, sanitizePhonePY, validatePhonePY, formatPhonePYDisplay } from '../../lib/phone';
import { track } from '../../lib/analytics';
import { sanitizeDealershipName, formatHablarCon } from '../../lib/dealerships';
import { formatLeadVehicleTitle } from '../../lib/vehicleTitle';
import Modal from './a11y/Modal';

interface LeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehiculoInteres: string;
  marcaVehiculo: string;
  modeloVehiculo?: string;
  origenLead: string;
  concesionariaDestino: string;
}

export default function LeadModal({
  isOpen,
  onClose,
  vehiculoInteres,
  marcaVehiculo,
  modeloVehiculo,
  origenLead,
  concesionariaDestino,
}: LeadModalProps) {
  const [formData, setFormData] = useState({ nombre: '', telefono: '', email: '' });
  const [useEmailInstead, setUseEmailInstead] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [fieldErrors, setFieldErrors] = useState<{ nombre?: string; telefono?: string; email?: string }>({});
  const nombreRef = useRef<HTMLInputElement>(null);
  const idPrefix = useId();
  const nombreId = `${idPrefix}-nombre`;
  const telefonoId = `${idPrefix}-telefono`;
  const emailId = `${idPrefix}-email`;
  const telefonoErrId = `${idPrefix}-telefono-err`;
  const emailErrId = `${idPrefix}-email-err`;

  const cleanConcesionaria = sanitizeDealershipName(concesionariaDestino);
  const fullVehicleDisplay = formatLeadVehicleTitle(marcaVehiculo, modeloVehiculo, vehiculoInteres);

  // Telemetría de embudo: apertura del modal (con su origen).
  useEffect(() => {
    if (isOpen) {
      setUseEmailInstead(false);
      setFieldErrors({});
      track('lead_modal_open', { origen: origenLead, marca: marcaVehiculo });
    }
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

    if (!useEmailInstead) {
      const pVal = validatePhonePY(formData.telefono);
      if (!pVal.valid) {
        errors.telefono = pVal.error || 'Ingresá tu número de celular (ej: 0981 123 456)';
      }
    } else {
      if (!email || !emailRegex.test(email)) {
        errors.email = 'Ingresá un correo electrónico válido.';
      }
    }
    return { errors, normalizedPhone: phone.canonical };
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

    const telefonoFinal = !useEmailInstead && normalizePhonePY(formData.telefono).valid
      ? normalizedPhone
      : 'No proporcionado';

    const cleanConcesionaria = sanitizeDealershipName(concesionariaDestino);
    const fullVehicleDisplay = formatLeadVehicleTitle(marcaVehiculo, modeloVehiculo, vehiculoInteres);

    try {
      // 1. Inyección directa a Firebase (La Bóveda)
      await addDoc(collection(db, 'leads'), {
        nombre: formData.nombre.trim(),
        telefono: telefonoFinal,
        email: formData.email.trim() || 'No proporcionado',
        vehiculo: fullVehicleDisplay,
        modelo: modeloVehiculo || '',
        marca: marcaVehiculo,
        origen: origenLead,
        concesionaria_destino: cleanConcesionaria || 'A designar (Central DATACAR)',
        concesionaria_destino_norm: (cleanConcesionaria || 'A DESIGNAR').toUpperCase().trim(),
        estado: 'Nuevo',
        createdAt: serverTimestamp(),
      });

      // 2. Disparo de Mailing B2B a la Concesionaria / DATACAR (Fail-Safe)
      try {
        await sendLeadNotificationEmail({
          leadName: formData.nombre.trim(),
          leadPhone: telefonoFinal,
          leadEmail: formData.email.trim(),
          vehicleOfInterest: fullVehicleDisplay,
          brandOfInterest: marcaVehiculo,
          marca: marcaVehiculo,
          origen: origenLead,
          concesionariaDestino: cleanConcesionaria || 'Central DATACAR',
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
    'w-full border bg-[#F8FAFC] p-3.5 text-xs focus:outline-none transition-all rounded-2xl disabled:opacity-50 font-medium focus:bg-white focus:ring-4 focus:ring-[#00BFFF]/10 focus:border-[#00BFFF]';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      overlayClassName="fixed inset-0 bg-[#0A1F33]/85 z-[100] flex items-center justify-center p-4 backdrop-blur-md"
      panelClassName="bg-[#FFFFFF] w-full max-w-xl p-7 sm:p-9 border border-[#0A1F33]/10 relative shadow-2xl rounded-3xl overflow-hidden"
    >
      {/* BOTÓN CERRAR CONTEMPORÁNEO */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#0A1F33] via-[#00BFFF] to-[#0A1F33]" />
      {/* BOTÓN CERRAR CONTEMPORÁNEO */}
      <button
        onClick={onClose}
        disabled={status === 'loading'}
        className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-[#C0C0C0] hover:text-[#0A1F33] hover:bg-[#F8F9FA] text-lg font-black transition-all disabled:opacity-50"
        aria-label="Cerrar modal"
      >
        ✕
      </button>

      {status === 'success' ? (
        <div className="text-center py-10">
          <div className="w-16 h-16 bg-[#F8F9FA] border-2 border-[#00BFFF] text-[#00BFFF] rounded-2xl shadow-sm flex items-center justify-center mx-auto mb-6 text-3xl font-black">
            ✓
          </div>
          <h3 className="font-black text-2xl text-[#0A1F33] uppercase mb-2" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
            ¡Listo, te contactamos!
          </h3>
          <p className="text-xs text-[#3A3A3C] font-medium leading-relaxed" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
            Un asesor de <strong className="text-[#0A1F33]">{cleanConcesionaria || 'la concesionaria oficial'}</strong> te va a contactar en menos de 2 h hábiles para avanzar con tu {marcaVehiculo}.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-5 border-b border-[#0A1F33]/10 pb-3.5">
            <h3 className="font-black text-xl sm:text-2xl text-[#0A1F33] uppercase leading-tight mb-1" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
              {formatHablarCon(cleanConcesionaria)}
            </h3>
            <p className="text-[11px] text-[#71717A] font-bold uppercase tracking-wider truncate">
              {fullVehicleDisplay}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5" style={{ fontFamily: 'var(--font-inter), sans-serif' }} noValidate>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
              <div>
                <label htmlFor={nombreId} className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest block mb-1">Tu Nombre <span className="text-[#D93025]">*</span></label>
                <input
                  ref={nombreRef}
                  id={nombreId}
                  type="text"
                  autoComplete="name"
                  required
                  disabled={status === 'loading'}
                  aria-invalid={!!fieldErrors.nombre}
                  className={`${inputBase} ${fieldErrors.nombre ? 'border-[#D93025] bg-[#FCE8E6]' : 'border-[#0A1F33]/15 focus:border-[#00BFFF] focus:bg-[#FFFFFF]'}`}
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

              {!useEmailInstead ? (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor={telefonoId} className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest">
                      WhatsApp <span className="text-[#D93025]">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => { setUseEmailInstead(true); setFieldErrors({}); }}
                      className="text-[9.5px] font-bold text-[#00BFFF] hover:text-[#0A1F33] underline cursor-pointer"
                    >
                      Usar correo
                    </button>
                  </div>
                  <div className={`flex rounded-2xl overflow-hidden border bg-[#F8FAFC] focus-within:bg-white focus-within:border-[#00BFFF] focus-within:ring-4 focus-within:ring-[#00BFFF]/10 transition-all ${fieldErrors.telefono ? 'border-[#D93025] bg-[#FCE8E6]' : 'border-[#E2E8F0]'}`}>
                    <div className="bg-[#EDF2F7] border-r border-[#E2E8F0] px-3 py-3.5 flex items-center gap-1 text-xs font-bold text-[#0A1F33] select-none shrink-0">
                      <span className="text-sm">🇵🇾</span>
                      <span>+595</span>
                    </div>
                    <input
                      id={telefonoId}
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      maxLength={14}
                      required
                      disabled={status === 'loading'}
                      aria-invalid={!!fieldErrors.telefono}
                      aria-describedby={fieldErrors.telefono ? telefonoErrId : undefined}
                      className="w-full p-3.5 text-xs text-[#0A1F33] focus:outline-none bg-transparent font-bold tracking-wide"
                      placeholder="0981 234 567"
                      value={formatPhonePYDisplay(formData.telefono)}
                      onFocus={() => track('lead_field_focus', { origen: origenLead, campo: 'telefono' })}
                      onChange={(e) => {
                        const cleaned = sanitizePhonePY(e.target.value);
                        setFormData({ ...formData, telefono: cleaned });
                        if (fieldErrors.telefono) setFieldErrors({ ...fieldErrors, telefono: undefined });
                      }}
                    />
                  </div>
                  {fieldErrors.telefono && (
                    <p id={telefonoErrId} className="text-[10px] text-[#D93025] font-bold mt-1">{fieldErrors.telefono}</p>
                  )}
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor={emailId} className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest">
                      Correo <span className="text-[#D93025]">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => { setUseEmailInstead(false); setFieldErrors({}); }}
                      className="text-[9.5px] font-bold text-[#00BFFF] hover:text-[#0A1F33] underline cursor-pointer"
                    >
                      Usar WhatsApp
                    </button>
                  </div>
                  <input
                    id={emailId}
                    type="email"
                    autoComplete="email"
                    required
                    disabled={status === 'loading'}
                    aria-invalid={!!fieldErrors.email}
                    aria-describedby={fieldErrors.email ? emailErrId : undefined}
                    className={`${inputBase} ${fieldErrors.email ? 'border-[#D93025] bg-[#FCE8E6]' : 'border-[#0A1F33]/15 focus:border-[#00BFFF] focus:bg-[#FFFFFF]'}`}
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
              )}
            </div>

            {status === 'error' && (
              <p className="text-[10px] text-[#D93025] font-bold uppercase tracking-widest bg-[#FCE8E6] p-3 text-center border border-[#D93025]/30 rounded-xl mt-1">
                Ocurrió un error de conexión. Intentá de nuevo.
              </p>
            )}

            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full bg-[#00BFFF] hover:bg-[#0A1F33] text-[#FFFFFF] font-bold text-xs uppercase tracking-widest py-4 mt-1 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl shadow-md hover:shadow-lg cursor-pointer flex items-center justify-center gap-2"
            >
              {status === 'loading' ? 'Procesando...' : formatHablarCon(cleanConcesionaria)}
            </button>

            <p className="text-[10px] text-center text-[#71717A] font-medium" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
              🔒 Sin costo ni spam.
            </p>
          </form>
        </>
      )}
    </Modal>
  );
}
