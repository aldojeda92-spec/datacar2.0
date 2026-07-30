import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';

// ==========================================
// 1. MAILING PARA LEADS B2B (EXISTENTE)
// ==========================================
export interface LeadNotificationParams {
  leadName: string;
  leadPhone: string;
  leadEmail?: string;
  vehicleOfInterest: string;
  origen: string;
  concesionariaDestino: string;
}

export const sendLeadNotificationEmail = async (params: LeadNotificationParams) => {
  try {
    const destinatarios: string[] = ['aldo.ojeda@datacarpy.com']; // Auditoría DATACAR

    let nombreConcesionariaOficial = 'Central DATACAR';

    if (params.concesionariaDestino && !params.concesionariaDestino.toLowerCase().includes('designar')) {
      const q = query(collection(db, 'concesionarias'), where('name', '==', params.concesionariaDestino.toUpperCase()));
      const snap = await getDocs(q);

      if (!snap.empty) {
        const concesionariaData = snap.docs[0].data();
        nombreConcesionariaOficial = concesionariaData.name;
        if (concesionariaData.email_gerencia) {
          destinatarios.push(concesionariaData.email_gerencia.trim());
        }
      }
    }

    const waNumber = params.leadPhone.startsWith('0') ? `595${params.leadPhone.substring(1)}` : params.leadPhone;
    const waPreMessage = encodeURIComponent(`Hola ${params.leadName}, recibimos tu consulta desde DATACAR por el ${params.vehicleOfInterest}. ¿Cómo te podemos ayudar?`);
    const waLink = `https://wa.me/${waNumber}?text=${waPreMessage}`;

    // El servidor (/api/mail) arma y escapa el HTML; acá solo se envían datos crudos.
    const response = await fetch('/api/mail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'lead_notification',
        destinatarios,
        data: {
          leadName: params.leadName,
          leadPhone: params.leadPhone,
          leadEmail: params.leadEmail,
          vehicleOfInterest: params.vehicleOfInterest,
          nombreConcesionariaOficial,
          waLink,
        },
      }),
    });

    if (!response.ok) throw new Error('Fallo en la respuesta de la API');

  } catch (error) {
    console.error("❌ Error en envío de Lead:", error);
  }
};


// ==========================================
// 2. MAILING PARA NEWSLETTER B2C (NUEVO)
// ==========================================
export const sendWelcomeEmail = async (userEmail: string) => {
  try {
    // Reutilizamos la misma API Route; el servidor arma el HTML de bienvenida.
    const response = await fetch('/api/mail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'welcome',
        destinatarios: [userEmail],
        data: {},
      }),
    });

    if (!response.ok) throw new Error('Fallo al enviar correo de bienvenida');

  } catch (error) {
    console.error("❌ Error enviando Welcome Email:", error);
  }
};
