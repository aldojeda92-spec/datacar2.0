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

    const htmlTemplate = `
      <div style="font-family: 'Inter', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #C0C0C0; background-color: #F8F9FA;">
        <div style="background-color: #0A1F33; border-bottom: 4px solid #00BFFF; padding: 24px; text-align: center;">
          <h1 style="color: #FFFFFF; font-family: 'Montserrat', Helvetica, Arial, sans-serif; font-size: 24px; font-weight: 900; letter-spacing: 2px; margin: 0;">
            DATA<span style="font-weight: 300;">CAR</span>
          </h1>
          <p style="color: #00BFFF; font-size: 10px; text-transform: uppercase; letter-spacing: 2px; font-weight: 700; margin-top: 8px; margin-bottom: 0;">
            NUEVO LEAD DE VENTAS
          </p>
        </div>
        <div style="padding: 32px 24px;">
          <h2 style="color: #0A1F33; font-size: 16px; text-transform: uppercase; font-weight: 900; margin-top: 0; border-bottom: 1px solid #C0C0C0; padding-bottom: 8px; font-family: 'Montserrat', sans-serif;">
            Ficha del Prospecto
          </h2>
          <table style="width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; color: #3A3A3C;">
            <tr><td style="padding: 12px; border-bottom: 1px solid #E6E6E6; font-weight: 700; width: 35%; text-transform: uppercase; color: #C0C0C0;">Vehículo:</td><td style="padding: 12px; border-bottom: 1px solid #E6E6E6; font-weight: 900; color: #00BFFF; text-transform: uppercase; font-size: 14px;">${params.vehicleOfInterest}</td></tr>
            <tr><td style="padding: 12px; border-bottom: 1px solid #E6E6E6; font-weight: 700; text-transform: uppercase; color: #C0C0C0;">Nombre:</td><td style="padding: 12px; border-bottom: 1px solid #E6E6E6; font-weight: 700; color: #0A1F33;">${params.leadName}</td></tr>
            <tr><td style="padding: 12px; border-bottom: 1px solid #E6E6E6; font-weight: 700; text-transform: uppercase; color: #C0C0C0;">WhatsApp:</td><td style="padding: 12px; border-bottom: 1px solid #E6E6E6; font-weight: 900; color: #0A1F33; font-size: 14px;">${params.leadPhone}</td></tr>
            <tr><td style="padding: 12px; border-bottom: 1px solid #E6E6E6; font-weight: 700; text-transform: uppercase; color: #C0C0C0;">Email:</td><td style="padding: 12px; border-bottom: 1px solid #E6E6E6; color: #3A3A3C;">${params.leadEmail || 'No proporcionado'}</td></tr>
            <tr><td style="padding: 12px; font-weight: 700; text-transform: uppercase; color: #C0C0C0;">Asignación:</td><td style="padding: 12px; font-weight: 900; color: #0A1F33; text-transform: uppercase;">${nombreConcesionariaOficial}</td></tr>
          </table>
          <div style="margin-top: 32px; text-align: center;">
            <a href="${waLink}" style="background-color: #1E8E3E; color: #FFFFFF; padding: 16px 32px; text-decoration: none; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; display: inline-block;">
              Contactar por WhatsApp
            </a>
          </div>
        </div>
      </div>
    `;

    const response = await fetch('/api/mail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        destinatarios: destinatarios,
        subject: `🔥 NUEVO LEAD DATACAR: ${params.vehicleOfInterest}`,
        html: htmlTemplate
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
    const htmlTemplate = `
      <div style="font-family: 'Inter', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #C0C0C0; background-color: #FFFFFF;">
        
        <!-- Header Corporativo (Flat Design) -->
        <div style="background-color: #0A1F33; border-bottom: 4px solid #00BFFF; padding: 32px 24px; text-align: center;">
          <h1 style="color: #FFFFFF; font-family: 'Montserrat', Helvetica, Arial, sans-serif; font-size: 28px; font-weight: 900; letter-spacing: 2px; margin: 0;">
            DATA<span style="font-weight: 300;">CAR</span>
          </h1>
        </div>

        <!-- Cuerpo del Mensaje -->
        <div style="padding: 40px 32px; text-align: center;">
          <h2 style="color: #0A1F33; font-family: 'Montserrat', sans-serif; font-size: 20px; font-weight: 900; text-transform: uppercase; margin-top: 0; margin-bottom: 16px;">
            Bienvenido a la red inteligente.
          </h2>
          <p style="color: #3A3A3C; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
            Gracias por suscribirte. Estás un paso más cerca de encontrar tu próximo 0km con cero estrés. A partir de ahora, recibirás acceso anticipado a comparativas de mercado, análisis de precios reales y oportunidades de compra directa en Paraguay.
          </p>
          
          <div style="margin-top: 32px; margin-bottom: 32px;">
            <a href="https://datacarpy.com/catalogo" style="background-color: #00BFFF; color: #FFFFFF; padding: 16px 32px; text-decoration: none; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; display: inline-block;">
              Explorar Catálogo 0km
            </a>
          </div>

          <hr style="border: none; border-top: 1px solid #C0C0C0; margin: 32px 0;" />
          
          <p style="color: #0A1F33; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">
            ¿Listo para comprar sin lidiar con vendedores?
          </p>
          <p style="color: #3A3A3C; font-size: 11px; margin-top: 8px;">
            Conocé nuestro servicio <a href="https://datacarpy.com/negociamos-por-vos" style="color: #00BFFF; text-decoration: none; font-weight: 700;">Negociamos por vos</a>.
          </p>
        </div>

        <!-- Footer -->
        <div style="background-color: #F8F9FA; padding: 24px; text-align: center; font-size: 10px; color: #C0C0C0; border-top: 1px solid #C0C0C0;">
          Estás recibiendo este correo porque te suscribiste al newsletter de DATACAR en nuestro sitio web.<br><br>
          © ${new Date().getFullYear()} DATACAR Paraguay. Todos los derechos reservados.
        </div>
      </div>
    `;

    // Reutilizamos la misma API Route
    const response = await fetch('/api/mail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        destinatarios: [userEmail], // Se envía directo al cliente
        subject: `Bienvenido a DATACAR 🚘`,
        html: htmlTemplate
      }),
    });

    if (!response.ok) throw new Error('Fallo al enviar correo de bienvenida');

  } catch (error) {
    console.error("❌ Error enviando Welcome Email:", error);
  }
};