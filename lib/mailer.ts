import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
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
  brandOfInterest?: string;
  marca?: string;
  brandId?: string;
  wizardAnswers?: Record<string, any>;
  tradeInData?: {
    vehiculoEntregar: string;
    marca: string;
    modelo: string;
    version: string;
    anio: string;
    origenUnidad: string;
    color: string;
    transmision: string;
    kilometraje: string;
    estadoGeneral: string;
    valorSolicitadoUsd: number;
    vehiculoInteres0km: string;
    diferenciaEstimadaUsd?: number | null;
    comentarios?: string | null;
  };
  topMatches?: Array<{
    brandName: string;
    modelName: string;
    startingPrice: number;
    matchPercentage: number;
    badge?: string;
  }>;
}

export const sendLeadNotificationEmail = async (params: LeadNotificationParams) => {
  try {
    const destinatarios: string[] = ['aldo.ojeda@datacarpy.com']; // Auditoría DATACAR

    let nombreConcesionariaOficial = 'Central DATACAR';

    // Si es un lead de perfilado inicial, NO se asigna marca ni concesionaria (va únicamente a auditoría DATACAR)
    const isProfilingLead = (params.vehicleOfInterest || '').toLowerCase().includes('perfilado') ||
                            (params.origen || '').toLowerCase().includes('perfilado');

    // 1. Determinar la marca objetivo del lead (solo si no es perfilado inicial)
    let targetBrandName = '';
    let targetBrandId = '';

    if (!isProfilingLead) {
      targetBrandName = (params.brandOfInterest || params.marca || '').trim();
      targetBrandId = (params.brandId || '').trim();

      if (!targetBrandName && params.vehicleOfInterest) {
        const firstWord = params.vehicleOfInterest.trim().split(' ')[0];
        if (firstWord && !['perfilado', 'recomendados:', 'recomendado', 'a'].includes(firstWord.toLowerCase())) {
          targetBrandName = firstWord;
        }
      }
    }

    // 2. Buscar correos de la MARCA en Firestore (soporta hasta 2 correos por marca)
    let foundBrandEmails = false;
    if (targetBrandName || targetBrandId) {
      let brandDocData: any = null;

      if (targetBrandId) {
        try {
          const bSnap = await getDoc(doc(db, 'brands', targetBrandId));
          if (bSnap.exists()) brandDocData = bSnap.data();
        } catch {}
      }

      if (!brandDocData && targetBrandName) {
        try {
          const slugId = targetBrandName.toLowerCase().replace(/\s+/g, '-');
          const bSnapSlug = await getDoc(doc(db, 'brands', slugId));
          if (bSnapSlug.exists()) {
            brandDocData = bSnapSlug.data();
          } else {
            const qBrand = query(collection(db, 'brands'), where('name', '==', targetBrandName.toUpperCase()));
            const qSnap = await getDocs(qBrand);
            if (!qSnap.empty) {
              brandDocData = qSnap.docs[0].data();
            }
          }
        } catch {}
      }

      if (brandDocData) {
        nombreConcesionariaOficial = `Marca: ${brandDocData.name || targetBrandName.toUpperCase()}`;

        // Correo #1 de gerencia de la marca
        if (brandDocData.email_gerencia && typeof brandDocData.email_gerencia === 'string') {
          const e1 = brandDocData.email_gerencia.trim();
          if (e1 && !destinatarios.map((d: string) => d.toLowerCase()).includes(e1.toLowerCase())) {
            destinatarios.push(e1);
            foundBrandEmails = true;
          }
        }

        // Correo #2 de gerencia de la marca
        if (brandDocData.email_gerencia_2 && typeof brandDocData.email_gerencia_2 === 'string') {
          const e2 = brandDocData.email_gerencia_2.trim();
          if (e2 && !destinatarios.map((d: string) => d.toLowerCase()).includes(e2.toLowerCase())) {
            destinatarios.push(e2);
            foundBrandEmails = true;
          }
        }
      }
    }

    // 3. Fallback: si no es perfilado y la marca aún no tiene correos asignados, verificar concesionaria
    if (!isProfilingLead && !foundBrandEmails && params.concesionariaDestino && !params.concesionariaDestino.toLowerCase().includes('designar') && !params.concesionariaDestino.toLowerCase().includes('central datacar')) {
      try {
        const q = query(collection(db, 'concesionarias'), where('name', '==', params.concesionariaDestino.toUpperCase()));
        const snap = await getDocs(q);

        if (!snap.empty) {
          const concesionariaData = snap.docs[0].data();
          nombreConcesionariaOficial = concesionariaData.name;
          if (concesionariaData.email_gerencia) {
            const cEmail = concesionariaData.email_gerencia.trim();
            if (cEmail && !destinatarios.map((d: string) => d.toLowerCase()).includes(cEmail.toLowerCase())) {
              destinatarios.push(cEmail);
            }
          }
        }
      } catch {}
    }

    // El lead puede no haber dejado celular (ahora es opcional). Solo armamos el
    // link de WhatsApp si el número es un móvil PY válido.
    const isValidMobile = /^09\d{8}$/.test(params.leadPhone || '');
    const waPreMessage = encodeURIComponent(`Hola ${params.leadName}, recibimos tu consulta desde DATACAR por el ${params.vehicleOfInterest}. ¿Cómo te podemos ayudar?`);
    const waLink = isValidMobile
      ? `https://wa.me/595${params.leadPhone.substring(1)}?text=${waPreMessage}`
      : '';

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
          wizardAnswers: params.wizardAnswers,
          topMatches: params.topMatches,
          origen: params.origen,
          tradeInData: params.tradeInData,
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

// ==========================================
// 3. MAILING PARA "GUARDAR COMPARATIVA" (comparador)
// ==========================================
export const sendComparisonLinkEmail = async (userEmail: string, shareLink: string): Promise<boolean> => {
  try {
    const response = await fetch('/api/mail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'comparison_link',
        destinatarios: [userEmail],
        data: { shareLink },
      }),
    });

    if (!response.ok) throw new Error('Fallo al enviar el enlace de comparativa');
    return true;
  } catch (error) {
    console.error("❌ Error enviando enlace de comparativa:", error);
    return false;
  }
};

// ==========================================
// 4. MAILING PARA RESULTADOS DEL RECOMENDADOR (B2C)
// ==========================================
export interface RecommendationMatch {
  brandName: string;
  modelName: string;
  startingPrice: number;
  matchPercentage: number;
  badge?: string;
  brandId: string;
  modelId: string;
}

export const sendRecommendationResultsEmail = async (userEmail: string, matches: RecommendationMatch[]): Promise<boolean> => {
  try {
    const response = await fetch('/api/mail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'recommendation_results',
        destinatarios: [userEmail],
        data: { matches },
      }),
    });

    if (!response.ok) throw new Error('Fallo al enviar los resultados del recomendador');
    return true;
  } catch (error) {
    console.error("❌ Error enviando resultados del recomendador:", error);
    return false;
  }
};

// ==========================================
// 5. MAILING PARA ALTA B2B (portal de concesionarias)
// ==========================================
export interface DealershipRequestParams {
  concesionaria: string;
  nombre: string;
  cargo: string;
  marcas: string;
  telefono: string;
  email: string;
}

export const sendDealershipRequestEmail = async (params: DealershipRequestParams): Promise<boolean> => {
  try {
    const response = await fetch('/api/mail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'dealership_request',
        destinatarios: ['aldo.ojeda@datacarpy.com'],
        data: params,
      }),
    });

    if (!response.ok) throw new Error('Fallo al notificar la solicitud de alta B2B');
    return true;
  } catch (error) {
    console.error("❌ Error notificando alta B2B:", error);
    return false;
  }
};

export interface DealershipApprovedParams {
  email: string;
  nombre: string;
  concesionaria: string;
  marcas: string[];
  tempPassword?: string;
  portalUrl?: string;
}

export const sendDealershipApprovedEmail = async (params: DealershipApprovedParams): Promise<boolean> => {
  try {
    const response = await fetch('/api/mail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'dealership_approved',
        destinatarios: [params.email],
        data: params,
      }),
    });

    if (!response.ok) throw new Error('Fallo al enviar notificación de aprobación');
    return true;
  } catch (error) {
    console.error("❌ Error enviando aprobación de concesionaria:", error);
    return false;
  }
};

export interface DealershipRejectedParams {
  email: string;
  nombre: string;
  concesionaria: string;
  motivo?: string;
}

export const sendDealershipRejectedEmail = async (params: DealershipRejectedParams): Promise<boolean> => {
  try {
    const response = await fetch('/api/mail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'dealership_rejected',
        destinatarios: [params.email],
        data: params,
      }),
    });

    if (!response.ok) throw new Error('Fallo al enviar notificación de rechazo');
    return true;
  } catch (error) {
    console.error("❌ Error enviando rechazo de concesionaria:", error);
    return false;
  }
};

// ==========================================
// 6. MAILING PARA DIFUSIÓN DE NEWSLETTER (ADMIN)
// ==========================================
export interface ReportsAccessRequestParams {
  dealershipName: string;
  userName: string;
  userEmail: string;
  marcas: string[];
}

export const sendReportsAccessRequestEmail = async (params: ReportsAccessRequestParams): Promise<boolean> => {
  try {
    const response = await fetch('/api/mail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'reports_access_request',
        destinatarios: ['aldo.ojeda@datacarpy.com'],
        data: params,
      }),
    });
    return response.ok;
  } catch (error) {
    console.error("❌ Error enviando solicitud de reportes:", error);
    return false;
  }
};

export interface NewsletterBroadcastParams {
  subject: string;
  headline?: string;
  contentHtml: string;
  buttonText?: string;
  buttonUrl?: string;
  destinatarios: string[];
}

export interface NewsletterBroadcastResult {
  success: boolean;
  simulated?: boolean;
  message?: string;
  previewUrl?: string;
  destinatariosCount?: number;
  error?: string;
}

export const sendNewsletterBroadcast = async (params: NewsletterBroadcastParams): Promise<NewsletterBroadcastResult> => {
  try {
    const response = await fetch('/api/mail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'newsletter_broadcast',
        destinatarios: params.destinatarios,
        data: {
          subject: params.subject,
          headline: params.headline,
          contentHtml: params.contentHtml,
          buttonText: params.buttonText,
          buttonUrl: params.buttonUrl,
        },
      }),
    });

    const resJson = await response.json();
    if (!response.ok) {
      throw new Error(resJson.error || resJson.details || 'Fallo en el envío del newsletter');
    }

    return resJson;
  } catch (error: any) {
    console.error("❌ Error enviando difusión de newsletter:", error);
    return {
      success: false,
      error: error.message || 'Error de conexión con el servidor de correo'
    };
  }
};


// ==========================================
// 7. MAILING PARA REPORTES DE TELEMETRÍA A CONCESIONARIAS (B2B)
// ==========================================
export interface DealershipReportEmailParams {
  destinatarios: string[];
  dealershipName: string;
  data: any;
  customHtml?: string;
  subject?: string;
}

export interface DealershipReportEmailResult {
  success: boolean;
  simulated?: boolean;
  message?: string;
  previewUrl?: string;
  destinatariosCount?: number;
  error?: string;
}

export const sendDealershipReportEmail = async (params: DealershipReportEmailParams): Promise<DealershipReportEmailResult> => {
  try {
    const response = await fetch('/api/mail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'dealership_report',
        destinatarios: params.destinatarios,
        data: {
          dealershipName: params.dealershipName,
          subject: params.subject,
          customHtml: params.customHtml,
          ...params.data,
        },
      }),
    });

    const resJson = await response.json();
    if (!response.ok) {
      throw new Error(resJson.error || resJson.details || 'Fallo en el envío del reporte');
    }

    return resJson;
  } catch (error: any) {
    console.error("❌ Error enviando reporte a concesionaria:", error);
    return {
      success: false,
      error: error.message || 'Error de conexión con el servidor de correo'
    };
  }
};
