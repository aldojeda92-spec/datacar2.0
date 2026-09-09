'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { track } from '../../lib/analytics';

// Número oficial de Datacar (formato wa.me: solo dígitos, con código de país).
const WA_NUMBER = '595991244469';
const WA_TEXT = encodeURIComponent(
  'Hola Datacar, estoy viendo el sitio y quiero que me asesoren para comprar un 0km.'
);

// Botón flotante global de WhatsApp. Paraguay es mercado WhatsApp-first: es el
// canal de menor fricción. Al hacer clic registra un lead liviano en la bóveda
// (una sola vez por sesión) y abre el chat.
export default function WhatsAppButton() {
  const pathname = usePathname();

  // Fuera del panel administrativo.
  if (pathname?.startsWith('/admin')) return null;

  const handleClick = () => {
    track('whatsapp_click', { origen: pathname || 'sitio' });

    let yaRegistrado = false;
    try {
      yaRegistrado = sessionStorage.getItem('dc_wa_lead') === '1';
    } catch { /* modo incógnito / storage bloqueado */ }

    if (!yaRegistrado) {
      try { sessionStorage.setItem('dc_wa_lead', '1'); } catch { /* noop */ }
      addDoc(collection(db, 'leads'), {
        nombre: 'Contacto vía WhatsApp',
        telefono: 'No proporcionado',
        email: 'No proporcionado',
        vehiculo: `Consulta general (${pathname || '/'})`,
        origen: 'Botón WhatsApp flotante',
        concesionaria_destino: 'A designar (Central DATACAR)',
        concesionaria_destino_norm: 'A DESIGNAR',
        estado: 'Nuevo',
        createdAt: serverTimestamp(),
      }).catch((err) => console.error('No se pudo registrar el lead de WhatsApp:', err));
    }

    window.open(`https://wa.me/${WA_NUMBER}?text=${WA_TEXT}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Escribinos por WhatsApp"
      className="fixed right-4 bottom-20 lg:bottom-6 z-[45] w-14 h-14 bg-[#25D366] hover:bg-[#1EBE5A] flex items-center justify-center transition-colors border border-[#1EBE5A] rounded-none"
    >
      <svg viewBox="0 0 24 24" className="w-7 h-7 fill-[#FFFFFF]" aria-hidden="true">
        <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.82 9.82 0 001.599 5.317l-1.001 3.653 3.892-1.008zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.767.967-.94 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.019-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
      </svg>
    </button>
  );
}
