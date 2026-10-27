// lib/dealershipReportHtml.ts
// Generador del template HTML para los reportes mensuales de mercado automotriz a concesionarias oficiales

export interface DealershipReportBrandStat {
  name: string;
  count: number;
  sharePct: number;
}

export interface DealershipReportModelStat {
  name: string;
  brandName?: string;
  count: number;
}

export interface DealershipReportRivalStat {
  name: string;
  count: number;
}

export interface DealershipReportHtmlData {
  dealershipName: string;
  marcas: string[];
  periodLabel?: string;
  dateRangeText?: string;
  // Comparador
  totalComparisons: number;
  prevComparisons: number;
  comparisonChangePct: number;
  comparisonTrend: 'up' | 'down' | 'same';
  topMarcas: DealershipReportBrandStat[];
  topModelos: DealershipReportModelStat[];
  topRivalMarcas?: DealershipReportRivalStat[];
  topRivalModelos?: DealershipReportRivalStat[];
  // Recomendador
  totalRecommendations: number;
  prevRecommendations: number;
  recommendationChangePct: number;
  recommendationTrend: 'up' | 'down' | 'same';
  topRecommendedModels?: DealershipReportModelStat[];
  // URLs & Contact
  portalUrl?: string;
  comparadorUrl?: string;
  recomendadorUrl?: string;
  contactUrl?: string;
}

function escapeHtml(val: unknown): string {
  const ESCAPE_MAP: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return String(val ?? '').replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
}

export function buildDealershipReportHtml(d: DealershipReportHtmlData): string {
  const dealership = escapeHtml(d.dealershipName || 'Concesionaria Oficial');
  const period = escapeHtml(d.periodLabel || 'Últimos 30 días');
  const dateRange = escapeHtml(d.dateRangeText || 'Últimos 30 días');
  const portalUrl = d.portalUrl || 'https://datacarpy.com/concesionarias';
  const comparadorUrl = d.comparadorUrl || 'https://datacarpy.com/comparador';
  const recomendadorUrl = d.recomendadorUrl || 'https://datacarpy.com/recomendador';
  const contactUrl = d.contactUrl || 'https://wa.me/595981000000?text=' + encodeURIComponent(`Hola DATACAR, me comunico desde ${d.dealershipName} sobre el reporte de telemetría.`);

  // Tendencia de comparaciones
  const compSign = d.comparisonChangePct > 0 ? '+' : '';
  const compPctText = `${compSign}${d.comparisonChangePct}%`;
  let compTrendBadge = '';
  if (d.comparisonTrend === 'up') {
    compTrendBadge = `<span style="background-color: #DCFCE7; color: #166534; font-weight: 800; font-size: 11px; padding: 4px 10px; border-radius: 4px; display: inline-block;">▲ Ha aumentado ${escapeHtml(compPctText)} comparado con el período anterior</span>`;
  } else if (d.comparisonTrend === 'down') {
    compTrendBadge = `<span style="background-color: #FEE2E2; color: #991B1B; font-weight: 800; font-size: 11px; padding: 4px 10px; border-radius: 4px; display: inline-block;">▼ Ha disminuido ${escapeHtml(compPctText)} contra el período anterior</span>`;
  } else {
    compTrendBadge = `<span style="background-color: #F1F5F9; color: #475569; font-weight: 800; font-size: 11px; padding: 4px 10px; border-radius: 4px; display: inline-block;">▬ Se mantuvo igual contra el período anterior</span>`;
  }

  // Tendencia de recomendaciones
  const recSign = d.recommendationChangePct > 0 ? '+' : '';
  const recPctText = `${recSign}${d.recommendationChangePct}%`;
  let recTrendBadge = '';
  if (d.recommendationTrend === 'up') {
    recTrendBadge = `<span style="background-color: #DCFCE7; color: #166534; font-weight: 800; font-size: 11px; padding: 4px 10px; border-radius: 4px; display: inline-block;">▲ Ha aumentado ${escapeHtml(recPctText)} contra el período anterior</span>`;
  } else if (d.recommendationTrend === 'down') {
    recTrendBadge = `<span style="background-color: #FEE2E2; color: #991B1B; font-weight: 800; font-size: 11px; padding: 4px 10px; border-radius: 4px; display: inline-block;">▼ Ha disminuido ${escapeHtml(recPctText)} contra el período anterior</span>`;
  } else {
    recTrendBadge = `<span style="background-color: #F1F5F9; color: #475569; font-weight: 800; font-size: 11px; padding: 4px 10px; border-radius: 4px; display: inline-block;">▬ Se mantuvo igual contra el período anterior</span>`;
  }

  // Filas de Top 3 Marcas
  const marcasHtml = (d.topMarcas && d.topMarcas.length > 0)
    ? d.topMarcas.slice(0, 3).map((m, idx) => {
        const barWidth = Math.min(100, Math.max(10, m.sharePct || Math.round((m.count / Math.max(d.totalComparisons, 1)) * 100)));
        return `
          <tr>
            <td style="padding: 10px 12px; border-bottom: 1px solid #E2E8F0; width: 35px; text-align: center;">
              <span style="background-color: #0A1F33; color: #00BFFF; font-weight: 900; font-size: 11px; width: 22px; height: 22px; line-height: 22px; display: inline-block; border-radius: 3px;">#${idx + 1}</span>
            </td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #E2E8F0;">
              <div style="font-weight: 800; font-size: 13px; color: #0A1F33; text-transform: uppercase;">${escapeHtml(m.name)}</div>
              <div style="background-color: #F1F5F9; border-radius: 4px; height: 6px; width: 100%; margin-top: 5px; overflow: hidden;">
                <div style="background-color: #00BFFF; height: 6px; width: ${barWidth}%;"></div>
              </div>
            </td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #E2E8F0; text-align: right; width: 100px;">
              <span style="font-weight: 900; font-size: 13px; color: #0A1F33;">${m.count}</span>
              <span style="font-size: 10px; color: #64748B; display: block;">duelos (${m.sharePct}%)</span>
            </td>
          </tr>
        `;
      }).join('')
    : `<tr><td colspan="3" style="padding: 16px; text-align: center; color: #94A3B8; font-size: 12px;">Sin registros de marcas en este período.</td></tr>`;

  // Filas de Top 3 Modelos
  const modelosHtml = (d.topModelos && d.topModelos.length > 0)
    ? d.topModelos.slice(0, 3).map((mod, idx) => {
        return `
          <tr>
            <td style="padding: 10px 12px; border-bottom: 1px solid #E2E8F0; width: 35px; text-align: center;">
              <span style="background-color: #F1F5F9; color: #0A1F33; font-weight: 900; font-size: 11px; width: 22px; height: 22px; line-height: 22px; display: inline-block; border-radius: 3px; border: 1px solid #CBD5E1;">#${idx + 1}</span>
            </td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #E2E8F0;">
              <div style="font-weight: 800; font-size: 13px; color: #0A1F33; text-transform: uppercase;">${escapeHtml(mod.name)}</div>
              ${mod.brandName ? `<span style="font-size: 10px; color: #0080B0; font-weight: 700; text-transform: uppercase;">${escapeHtml(mod.brandName)}</span>` : ''}
            </td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #E2E8F0; text-align: right; width: 100px;">
              <span style="font-weight: 900; font-size: 13px; color: #0A1F33;">${mod.count}</span>
              <span style="font-size: 10px; color: #64748B; display: block;">comparaciones</span>
            </td>
          </tr>
        `;
      }).join('')
    : `<tr><td colspan="3" style="padding: 16px; text-align: center; color: #94A3B8; font-size: 12px;">Sin registros de modelos en este período.</td></tr>`;

  // Marcas gestionadas list
  const marcasListText = (d.marcas && d.marcas.length > 0)
    ? d.marcas.join(' • ')
    : 'Portafolio Oficial';

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reporte de Comparativas - ${dealership}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F4F6F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #1E293B;">
  <div style="background-color: #F4F6F9; padding: 24px 12px;">
    
    <!-- CONTENEDOR PRINCIPAL TIPO TARJETA -->
    <div style="max-width: 640px; margin: 0 auto; background-color: #FFFFFF; border: 1px solid #E2E8F0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); overflow: hidden;">

      <!-- CABECERA PRINCIPAL DATACAR -->
      <div style="background-color: #0A1F33; padding: 32px 28px; text-align: center; border-bottom: 4px solid #00BFFF;">
        <div style="font-family: 'Montserrat', Helvetica, Arial, sans-serif; font-size: 30px; font-weight: 900; letter-spacing: 2px; color: #FFFFFF; margin: 0; line-height: 1;">
          DATA<span style="color: #00BFFF; font-weight: 300;">CAR</span>
        </div>
        <div style="font-size: 10px; font-weight: 800; letter-spacing: 2.5px; color: #00BFFF; text-transform: uppercase; margin-top: 8px;">
          PLATAFORMA DE INTELIGENCIA AUTOMOTRIZ 0KM
        </div>
        <div style="margin-top: 18px; padding-top: 14px; border-top: 1px solid rgba(255, 255, 255, 0.15);">
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #94A3B8; font-weight: 700;">
            REPORTE EXCLUSIVO DE TELEMETRÍA PARA
          </div>
          <div style="font-size: 20px; font-weight: 900; color: #FFFFFF; text-transform: uppercase; margin-top: 4px; letter-spacing: 0.5px;">
            ${dealership}
          </div>
          <div style="font-size: 11px; color: #38BDF8; font-weight: 600; margin-top: 4px;">
            Marcas: ${escapeHtml(marcasListText)}
          </div>
        </div>
      </div>

      <!-- BANNER D.1: TÍTULO DEL PERÍODO -->
      <div style="background-color: #F8FAFC; padding: 18px 28px; border-bottom: 1px solid #E2E8F0; text-align: center;">
        <span style="background-color: #0A1F33; color: #FFFFFF; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; padding: 4px 10px; border-radius: 3px; display: inline-block;">
          D.1 • RESUMEN DE ACTIVIDAD
        </span>
        <h1 style="font-size: 17px; font-weight: 900; color: #0A1F33; margin: 10px 0 4px 0; text-transform: uppercase; line-height: 1.3;">
          Comparación de las marcas de ${dealership} de los ${period}
        </h1>
        <div style="font-size: 11px; color: #64748B; font-weight: 600;">
          Rango evaluado: ${dateRange}
        </div>
      </div>

      <!-- CUERPO PRINCIPAL -->
      <div style="padding: 28px 24px;">

        <!-- TARJETA D.2 & D.4: ANALÍTICA ICONOGRÁFICA DE COMPARACIONES -->
        <div style="background-color: #FFFFFF; border: 2px solid #00BFFF; border-radius: 8px; padding: 22px; margin-bottom: 24px;">
          <div style="font-size: 11px; font-weight: 800; color: #0080B0; text-transform: uppercase; letter-spacing: 1.5px;">
            ⚡ TELEMETRÍA DEL COMPARADOR OFICIAL
          </div>
          <div style="margin-top: 8px; font-size: 22px; font-weight: 900; color: #0A1F33; line-height: 1.2;">
            Tus marcas se han comparado <span style="color: #0080B0;">${d.totalComparisons}</span> veces
          </div>
          <div style="margin-top: 10px;">
            ${compTrendBadge}
          </div>
          <div style="font-size: 12px; color: #475569; margin-top: 10px; line-height: 1.5;">
            En los últimos 30 días, compradores automotrices de Paraguay han confrontado activamente tus modelos 0km en el comparador de DATACAR. (Período anterior: <strong>${d.prevComparisons} comparativas</strong>).
          </div>

          <!-- CTAs DE DESCUBRIMIENTO D.4 -->
          <div style="margin-top: 18px; padding-top: 16px; border-top: 1px dashed #CBD5E1; display: flex; flex-wrap: wrap; gap: 8px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 4px; width: 50%;">
                  <a href="${portalUrl}" style="background-color: #0A1F33; color: #FFFFFF; padding: 10px 14px; text-decoration: none; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; display: block; text-align: center; border-radius: 4px;">
                    🎯 Conocé contra qué marcas te comparan →
                  </a>
                </td>
                <td style="padding: 4px; width: 50%;">
                  <a href="${portalUrl}" style="background-color: #0A1F33; color: #FFFFFF; padding: 10px 14px; text-decoration: none; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; display: block; text-align: center; border-radius: 4px;">
                    🚘 Conocé contra qué modelos te comparan →
                  </a>
                </td>
              </tr>
              <tr>
                <td colspan="2" style="padding: 4px; padding-top: 8px;">
                  <a href="${contactUrl}" style="background-color: #1E8E3E; color: #FFFFFF; padding: 11px 18px; text-decoration: none; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; display: block; text-align: center; border-radius: 4px;">
                    ⭐ Quiero destacar en el comparador (Sello DATACAR CHECK) →
                  </a>
                </td>
              </tr>
            </table>
          </div>

          <!-- EXPLICACIÓN D.4: ¿QUÉ ES EL COMPARADOR? (i) -->
          <div style="background-color: #F8FAFC; border-left: 3px solid #00BFFF; padding: 12px 14px; margin-top: 16px; border-radius: 0 4px 4px 0;">
            <div style="font-size: 11px; font-weight: 800; color: #0A1F33; text-transform: uppercase; margin-bottom: 4px;">
              ℹ️ ¿Qué es el Comparador DATACAR?
            </div>
            <div style="font-size: 11px; color: #475569; line-height: 1.5;">
              Es la herramienta insignia de DATACAR donde los potenciales compradores confrontan simultáneamente especificaciones técnicas, motorización, seguridad ADAS, confort y precios oficiales de hasta 3 vehículos 0km del mercado paraguayo para definir su decisión de compra.
            </div>
          </div>
        </div>

        <!-- TOP 3 MARCAS & TOP 3 MODELOS (D.2) -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
          <tr>
            <!-- COLUMNA TOP MARCAS -->
            <td style="width: 50%; vertical-align: top; padding-right: 8px;">
              <div style="background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 6px; overflow: hidden;">
                <div style="background-color: #0A1F33; color: #FFFFFF; padding: 10px 14px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">
                  🏆 Top 3 Marcas Comparadas
                </div>
                <table style="width: 100%; border-collapse: collapse;">
                  ${marcasHtml}
                </table>
              </div>
            </td>

            <!-- COLUMNA TOP MODELOS -->
            <td style="width: 50%; vertical-align: top; padding-left: 8px;">
              <div style="background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 6px; overflow: hidden;">
                <div style="background-color: #0A1F33; color: #FFFFFF; padding: 10px 14px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">
                  🚗 Top 3 Modelos Más Buscados
                </div>
                <table style="width: 100%; border-collapse: collapse;">
                  ${modelosHtml}
                </table>
              </div>
            </td>
          </tr>
        </table>

        <!-- TARJETA D.5: TELEMETRÍA DEL RECOMENDADOR INTELIGENTE -->
        <div style="background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; padding: 22px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
          <div style="font-size: 11px; font-weight: 800; color: #7C3AED; text-transform: uppercase; letter-spacing: 1.5px;">
            🤖 TELEMETRÍA DEL RECOMENDADOR DE VEHÍCULOS
          </div>
          <div style="margin-top: 8px; font-size: 20px; font-weight: 900; color: #0A1F33; line-height: 1.2;">
            ${dealership} ha aparecido <span style="color: #7C3AED;">${d.totalRecommendations}</span> veces en el recomendador
          </div>
          <div style="margin-top: 10px;">
            ${recTrendBadge}
          </div>
          <div style="font-size: 12px; color: #475569; margin-top: 10px; line-height: 1.5;">
            Los usuarios han completado el cuestionario guiado de necesidades y tu catálogo fue sugerido como solución óptima de compra. (Período anterior: <strong>${d.prevRecommendations} sugerencias</strong>).
          </div>

          <!-- CTA D.5 -->
          <div style="margin-top: 16px;">
            <a href="${contactUrl}" style="background-color: #7C3AED; color: #FFFFFF; padding: 12px 20px; text-decoration: none; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; display: inline-block; text-align: center; border-radius: 4px;">
              🚀 Quiero aparecer más veces en el recomendador →
            </a>
          </div>

          <!-- EXPLICACIÓN D.5: ¿QUÉ ES EL RECOMENDADOR? (i) -->
          <div style="background-color: #FAF5FF; border-left: 3px solid #7C3AED; padding: 12px 14px; margin-top: 16px; border-radius: 0 4px 4px 0;">
            <div style="font-size: 11px; font-weight: 800; color: #5B21B6; text-transform: uppercase; margin-bottom: 4px;">
              ℹ️ ¿Qué es el Recomendador DATACAR?
            </div>
            <div style="font-size: 11px; color: #475569; line-height: 1.5;">
              Es el asistente inteligente de compra de DATACAR. A través de un cuestionario dinámico, los usuarios indican su presupuesto, tamaño de familia, tipo de terreno, preferencia de combustible y equipamiento deseado. El recomendador procesa el inventario nacional y sugiere las versiones exactas que mejor calzan con su perfil.
            </div>
          </div>
        </div>

        <!-- SECCIÓN D.3: CTA INFORME COMPLETO -->
        <div style="background: linear-gradient(135deg, #0A1F33 0%, #102A43 100%); border-radius: 8px; padding: 28px 24px; text-align: center; color: #FFFFFF; margin-bottom: 24px;">
          <div style="font-size: 11px; font-weight: 800; color: #00BFFF; text-transform: uppercase; letter-spacing: 2px;">
            ANÁLISIS DE BUSINESS INTELLIGENCE
          </div>
          <h2 style="font-size: 20px; font-weight: 900; margin: 10px 0 6px 0; text-transform: uppercase; color: #FFFFFF;">
            ¿Querés ver el informe completo y detallado?
          </h2>
          <p style="font-size: 12px; color: #CBD5E1; margin: 0 auto 20px auto; max-width: 480px; line-height: 1.5;">
            Accedé al panel interactivo de concesionarias para visualizar análisis de rivales directos, cuota de consideración por slot, preferencias de compradores (ADAS, confort, motor) y segmentación por carrocería.
          </p>
          <div>
            <a href="${portalUrl}" style="background-color: #00BFFF; color: #0A1F33; padding: 14px 28px; text-decoration: none; font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; display: inline-block; border-radius: 4px; box-shadow: 0 4px 10px rgba(0, 191, 255, 0.3);">
              Ver Informe Completo en datacarpy.com/concesionarias →
            </a>
          </div>
        </div>

      </div>

      <!-- FOOTER INSTITUCIONAL -->
      <div style="background-color: #F8FAFC; padding: 24px; border-top: 1px solid #E2E8F0; text-align: center; font-size: 11px; color: #64748B; line-height: 1.6;">
        <div style="font-weight: 800; color: #0A1F33; text-transform: uppercase; margin-bottom: 4px;">
          DATACAR PARAGUAY • Inteligencia Automotriz
        </div>
        <div>
          Este informe mensual automatizado se genera a partir de la actividad real de usuarios en <a href="https://datacarpy.com" style="color: #0080B0; text-decoration: underline; font-weight: 700;">datacarpy.com</a>.
        </div>
        <div style="margin-top: 10px; font-size: 10px; color: #94A3B8;">
          © ${new Date().getFullYear()} DATACAR. Todos los derechos reservados. Si tenés dudas sobre este reporte o deseás optimizar la presencia de tu marca, respondé este correo o comunicate con tu asesor comercial.
        </div>
      </div>

    </div>

  </div>
</body>
</html>
  `.trim();
}
