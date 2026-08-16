import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

const ALLOWED_ORIGINS = [
  'https://datacarpy.com',
  'https://www.datacarpy.com',
  'https://datacar2-0.vercel.app',
  'http://localhost:3000',
];

// Rate limit best-effort en memoria (por IP). En serverless se resetea entre
// cold starts/instancias, pero frena abuso automatizado básico sin agregar infraestructura.
const hits = new Map<string, { count: number; resetAt: number }>();

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

function buildLeadHtml(d: any): string {
  return `
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
          <tr><td style="padding: 12px; border-bottom: 1px solid #E6E6E6; font-weight: 700; width: 35%; text-transform: uppercase; color: #C0C0C0;">Vehículo:</td><td style="padding: 12px; border-bottom: 1px solid #E6E6E6; font-weight: 900; color: #00BFFF; text-transform: uppercase; font-size: 14px;">${escapeHtml(d?.vehicleOfInterest)}</td></tr>
          <tr><td style="padding: 12px; border-bottom: 1px solid #E6E6E6; font-weight: 700; text-transform: uppercase; color: #C0C0C0;">Nombre:</td><td style="padding: 12px; border-bottom: 1px solid #E6E6E6; font-weight: 700; color: #0A1F33;">${escapeHtml(d?.leadName)}</td></tr>
          <tr><td style="padding: 12px; border-bottom: 1px solid #E6E6E6; font-weight: 700; text-transform: uppercase; color: #C0C0C0;">WhatsApp:</td><td style="padding: 12px; border-bottom: 1px solid #E6E6E6; font-weight: 900; color: #0A1F33; font-size: 14px;">${escapeHtml(d?.leadPhone)}</td></tr>
          <tr><td style="padding: 12px; border-bottom: 1px solid #E6E6E6; font-weight: 700; text-transform: uppercase; color: #C0C0C0;">Email:</td><td style="padding: 12px; border-bottom: 1px solid #E6E6E6; color: #3A3A3C;">${escapeHtml(d?.leadEmail || 'No proporcionado')}</td></tr>
          <tr><td style="padding: 12px; font-weight: 700; text-transform: uppercase; color: #C0C0C0;">Asignación:</td><td style="padding: 12px; font-weight: 900; color: #0A1F33; text-transform: uppercase;">${escapeHtml(d?.nombreConcesionariaOficial)}</td></tr>
        </table>
        <div style="margin-top: 32px; text-align: center;">
          <a href="${escapeHtml(d?.waLink)}" style="background-color: #1E8E3E; color: #FFFFFF; padding: 16px 32px; text-decoration: none; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; display: inline-block;">
            Contactar por WhatsApp
          </a>
        </div>
      </div>
    </div>
  `;
}

function buildComparisonHtml(d: any): string {
  const shareLink = escapeHtml(d?.shareLink);
  return `
    <div style="font-family: 'Inter', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #C0C0C0; background-color: #FFFFFF;">
      <div style="background-color: #0A1F33; border-bottom: 4px solid #00BFFF; padding: 32px 24px; text-align: center;">
        <h1 style="color: #FFFFFF; font-family: 'Montserrat', Helvetica, Arial, sans-serif; font-size: 28px; font-weight: 900; letter-spacing: 2px; margin: 0;">DATA<span style="font-weight: 300;">CAR</span></h1>
      </div>
      <div style="padding: 40px 32px; text-align: center;">
        <h2 style="color: #0A1F33; font-family: 'Montserrat', sans-serif; font-size: 20px; font-weight: 900; text-transform: uppercase; margin-top: 0; margin-bottom: 16px;">Tu Comparativa Guardada</h2>
        <p style="color: #3A3A3C; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">Aquí tienes el enlace seguro para acceder a la comparativa de vehículos que acabas de generar.</p>
        <div style="margin-top: 32px; margin-bottom: 32px;">
          <a href="${shareLink}" style="background-color: #00BFFF; color: #FFFFFF; padding: 16px 32px; text-decoration: none; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; display: inline-block;">Ver Comparativa</a>
        </div>
      </div>
      <div style="background-color: #F8F9FA; padding: 24px; text-align: center; font-size: 10px; color: #C0C0C0; border-top: 1px solid #C0C0C0;">
        © ${new Date().getFullYear()} DATACAR Paraguay. Todos los derechos reservados.
      </div>
    </div>
  `;
}

function buildDealershipRequestHtml(d: any): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #C0C0C0;">
      <h2 style="color: #0A1F33; border-bottom: 2px solid #00BFFF; padding-bottom: 10px;">NUEVA SOLICITUD DE ALTA B2B</h2>
      <p><strong>Concesionaria:</strong> ${escapeHtml(d?.concesionaria)}</p>
      <p><strong>Solicitante:</strong> ${escapeHtml(d?.nombre)} (${escapeHtml(d?.cargo)})</p>
      <p><strong>Marcas Representadas:</strong> ${escapeHtml(d?.marcas)}</p>
      <p><strong>Teléfono:</strong> ${escapeHtml(d?.telefono)}</p>
      <p><strong>Email:</strong> ${escapeHtml(d?.email)}</p>
      <hr style="margin: 20px 0; border: none; border-top: 1px solid #C0C0C0;" />
      <p style="font-size: 12px; color: #3A3A3C;">Ingresa a Firebase Auth y crea manualmente este usuario. Luego, asígnale sus permisos en el panel de administrador.</p>
    </div>
  `;
}

function buildWelcomeHtml(): string {
  return `
    <div style="font-family: 'Inter', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #C0C0C0; background-color: #FFFFFF;">
      <div style="background-color: #0A1F33; border-bottom: 4px solid #00BFFF; padding: 32px 24px; text-align: center;">
        <h1 style="color: #FFFFFF; font-family: 'Montserrat', Helvetica, Arial, sans-serif; font-size: 28px; font-weight: 900; letter-spacing: 2px; margin: 0;">
          DATA<span style="font-weight: 300;">CAR</span>
        </h1>
      </div>
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
      <div style="background-color: #F8F9FA; padding: 24px; text-align: center; font-size: 10px; color: #C0C0C0; border-top: 1px solid #C0C0C0;">
        Estás recibiendo este correo porque te suscribiste al newsletter de DATACAR en nuestro sitio web.<br><br>
        © ${new Date().getFullYear()} DATACAR Paraguay. Todos los derechos reservados.
      </div>
    </div>
  `;
}

function buildRecommendationResultsHtml(d: any): string {
  const matches: any[] = Array.isArray(d?.matches) ? d.matches : [];
  const cards = matches.map((m) => {
    const badgeHtml = m?.badge
      ? `<p style="color: #00BFFF; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; margin: 0 0 8px 0;">${escapeHtml(m.badge)}</p>`
      : '';
    const detailLink = `https://datacarpy.com/catalogo/${escapeHtml(m?.brandId)}/${escapeHtml(m?.modelId)}`;
    const price = Number(m?.startingPrice) || 0;
    return `
      <div style="border: 1px solid #C0C0C0; background-color: #FFFFFF; padding: 24px; margin-bottom: 16px; text-align: left;">
        ${badgeHtml}
        <h3 style="color: #0A1F33; font-family: 'Montserrat', sans-serif; font-size: 16px; font-weight: 900; text-transform: uppercase; margin: 0 0 8px 0;">${escapeHtml(m?.brandName)} ${escapeHtml(m?.modelName)}</h3>
        <p style="color: #3A3A3C; font-size: 14px; margin: 0 0 4px 0;">Desde US$ ${escapeHtml(price.toLocaleString('en-US'))}</p>
        <p style="color: #1E8E3E; font-size: 12px; font-weight: 700; margin: 0 0 16px 0;">${escapeHtml(m?.matchPercentage)}% de coincidencia</p>
        <a href="${detailLink}" style="background-color: #0A1F33; color: #FFFFFF; padding: 12px 24px; text-decoration: none; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; display: inline-block;">Ver Ficha</a>
      </div>
    `;
  }).join('');

  return `
    <div style="font-family: 'Inter', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #C0C0C0; background-color: #F8F9FA;">
      <div style="background-color: #0A1F33; border-bottom: 4px solid #00BFFF; padding: 32px 24px; text-align: center;">
        <h1 style="color: #FFFFFF; font-family: 'Montserrat', Helvetica, Arial, sans-serif; font-size: 28px; font-weight: 900; letter-spacing: 2px; margin: 0;">DATA<span style="font-weight: 300;">CAR</span></h1>
      </div>
      <div style="padding: 40px 32px;">
        <h2 style="color: #0A1F33; font-family: 'Montserrat', sans-serif; font-size: 20px; font-weight: 900; text-transform: uppercase; margin-top: 0; margin-bottom: 24px; text-align: center;">Tus Resultados del Recomendador</h2>
        ${cards}
        <div style="margin-top: 32px; text-align: center;">
          <a href="https://datacarpy.com/catalogo" style="background-color: #00BFFF; color: #FFFFFF; padding: 16px 32px; text-decoration: none; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; display: inline-block;">Ver Catálogo Completo</a>
        </div>
      </div>
      <div style="background-color: #F8F9FA; padding: 24px; text-align: center; font-size: 10px; color: #C0C0C0; border-top: 1px solid #C0C0C0;">
        © ${new Date().getFullYear()} DATACAR Paraguay. Todos los derechos reservados.
      </div>
    </div>
  `;
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin') || request.headers.get('referer') || '';
  if (!ALLOWED_ORIGINS.some((o) => origin.startsWith(o))) {
    return NextResponse.json({ error: 'Origen no permitido' }, { status: 403 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Demasiadas solicitudes' }, { status: 429 });
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 10_000) {
    return NextResponse.json({ error: 'Payload demasiado grande' }, { status: 413 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const { type, destinatarios, data } = body || {};

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (
    !Array.isArray(destinatarios) ||
    destinatarios.length === 0 ||
    destinatarios.length > 3 ||
    !destinatarios.every((e: unknown) => typeof e === 'string' && emailRegex.test(e))
  ) {
    return NextResponse.json({ error: 'Destinatarios inválidos' }, { status: 400 });
  }

  let subject: string;
  let html: string;
  if (type === 'lead_notification') {
    subject = `🔥 NUEVO LEAD DATACAR: ${escapeHtml(data?.vehicleOfInterest)}`;
    html = buildLeadHtml(data);
  } else if (type === 'welcome') {
    subject = 'Bienvenido a DATACAR 🚘';
    html = buildWelcomeHtml();
  } else if (type === 'comparison_link') {
    subject = '⚖️ Tu Comparativa Guardada - DATACAR';
    html = buildComparisonHtml(data);
  } else if (type === 'dealership_request') {
    subject = `🚨 ALTA B2B: ${escapeHtml(data?.concesionaria)} quiere unirse a DATACAR`;
    html = buildDealershipRequestHtml(data);
  } else if (type === 'recommendation_results') {
    subject = 'Tus resultados del Recomendador - DATACAR';
    html = buildRecommendationResultsHtml(data);
  } else {
    return NextResponse.json({ error: 'Tipo de correo no soportado' }, { status: 400 });
  }

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error('❌ [API MAIL] Fallo: Credenciales .env.local ausentes.');
    return NextResponse.json({ error: 'Credenciales SMTP ausentes' }, { status: 500 });
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: `"DATACAR CRM" <${process.env.EMAIL_USER}>`,
      to: destinatarios.join(', '),
      subject,
      html,
    });
    return NextResponse.json({ success: true, message: 'Correo enviado.', id: info.messageId });
  } catch (error: any) {
    console.error('❌ [API MAIL] Error crítico de SMTP:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
