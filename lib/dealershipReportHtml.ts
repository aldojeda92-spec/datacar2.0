// lib/dealershipReportHtml.ts
// Generador de plantillas Minimalistas (HTML y Texto Plano) para reportes mensuales a concesionarias oficiales

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

const WA_CONTACT_NUMBER = '595991244469';

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

/**
 * Plantilla HTML Minimalista y Ejecutiva
 * Diseñada para máxima legibilidad, estética sobria y alta entregabilidad en servidores corporativos.
 */
export function buildDealershipReportHtml(d: DealershipReportHtmlData): string {
  const dealership = escapeHtml(d.dealershipName || 'Concesionaria Oficial');
  const period = escapeHtml(d.periodLabel || 'últimos 30 días');
  const dateRange = escapeHtml(d.dateRangeText || 'Últimos 30 días');
  const portalUrl = d.portalUrl || 'https://datacarpy.com/concesionarias';

  // WhatsApp oficial 595991244469
  const waComparadorUrl = `https://wa.me/${WA_CONTACT_NUMBER}?text=` + encodeURIComponent(`Hola DATACAR, me comunico desde ${d.dealershipName}. Quiero destacar nuestras marcas en el comparador oficial.`);
  const waRecomendadorUrl = `https://wa.me/${WA_CONTACT_NUMBER}?text=` + encodeURIComponent(`Hola DATACAR, me comunico desde ${d.dealershipName}. Quiero optimizar nuestra presencia en el recomendador inteligente.`);

  // Tendencia de comparaciones (limpia, sin bloques pesados)
  const compSign = d.comparisonChangePct > 0 ? '+' : '';
  const compPctText = `${compSign}${d.comparisonChangePct}%`;
  let compTrendText = '';
  if (d.comparisonTrend === 'up') {
    compTrendText = `<span style="color: #166534; font-weight: 700;">↑ Ha aumentado ${escapeHtml(compPctText)} comparado con el período anterior</span>`;
  } else if (d.comparisonTrend === 'down') {
    compTrendText = `<span style="color: #991B1B; font-weight: 700;">↓ Ha disminuido ${escapeHtml(compPctText)} contra el período anterior</span>`;
  } else {
    compTrendText = `<span style="color: #52525B; font-weight: 700;">— Se mantuvo igual contra el período anterior</span>`;
  }

  // Tendencia de recomendaciones
  const recSign = d.recommendationChangePct > 0 ? '+' : '';
  const recPctText = `${recSign}${d.recommendationChangePct}%`;
  let recTrendText = '';
  if (d.recommendationTrend === 'up') {
    recTrendText = `<span style="color: #166534; font-weight: 700;">↑ Ha aumentado ${escapeHtml(recPctText)} contra el período anterior</span>`;
  } else if (d.recommendationTrend === 'down') {
    recTrendText = `<span style="color: #991B1B; font-weight: 700;">↓ Ha disminuido ${escapeHtml(recPctText)} contra el período anterior</span>`;
  } else {
    recTrendText = `<span style="color: #52525B; font-weight: 700;">— Se mantuvo igual contra el período anterior</span>`;
  }

  // Filas minimalistas de Top 3 Marcas
  const marcasRows = (d.topMarcas && d.topMarcas.length > 0)
    ? d.topMarcas.slice(0, 3).map((m, idx) => `
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #F1F5F9; color: #71717A; font-size: 13px; font-weight: 700; width: 28px;">0${idx + 1}</td>
          <td style="padding: 10px 0; border-bottom: 1px solid #F1F5F9; color: #0A1F33; font-size: 13px; font-weight: 700; text-transform: uppercase;">${escapeHtml(m.name)}</td>
          <td style="padding: 10px 0; border-bottom: 1px solid #F1F5F9; text-align: right; color: #0A1F33; font-size: 13px; font-weight: 800;">
            ${m.count} <span style="font-size: 11px; font-weight: 500; color: #71717A;">comparaciones (${m.sharePct}%)</span>
          </td>
        </tr>
      `).join('')
    : `<tr><td colspan="3" style="padding: 12px 0; color: #A1A1AA; font-size: 12px;">Sin registros en este período.</td></tr>`;

  // Filas minimalistas de Top 3 Modelos
  const modelosRows = (d.topModelos && d.topModelos.length > 0)
    ? d.topModelos.slice(0, 3).map((mod, idx) => `
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #F1F5F9; color: #71717A; font-size: 13px; font-weight: 700; width: 28px;">0${idx + 1}</td>
          <td style="padding: 10px 0; border-bottom: 1px solid #F1F5F9; color: #0A1F33; font-size: 13px; font-weight: 700; text-transform: uppercase;">
            ${escapeHtml(mod.name)}
            ${mod.brandName ? `<span style="font-size: 10px; color: #71717A; font-weight: 600; margin-left: 6px;">(${escapeHtml(mod.brandName)})</span>` : ''}
          </td>
          <td style="padding: 10px 0; border-bottom: 1px solid #F1F5F9; text-align: right; color: #0A1F33; font-size: 13px; font-weight: 800;">
            ${mod.count} <span style="font-size: 11px; font-weight: 500; color: #71717A;">veces</span>
          </td>
        </tr>
      `).join('')
    : `<tr><td colspan="3" style="padding: 12px 0; color: #A1A1AA; font-size: 12px;">Sin registros en este período.</td></tr>`;

  const marcasListText = (d.marcas && d.marcas.length > 0) ? d.marcas.join(' · ') : 'Portafolio Oficial';

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Reporte de Mercado - ${dealership}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #FAFAFA; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #18181B; -webkit-font-smoothing: antialiased; line-height: 1.5;">

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #FAFAFA;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        
        <!-- CONTENEDOR PRINCIPAL MINIMALISTA -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; background-color: #FFFFFF; border: 1px solid #E4E4E7; text-align: left;">
          
          <!-- CABECERA SOBRIA -->
          <tr>
            <td style="padding: 36px 36px 24px 36px; border-bottom: 1px solid #F4F4F5;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td>
                    <div style="font-size: 20px; font-weight: 900; letter-spacing: 2px; color: #0A1F33; font-family: 'Montserrat', Arial, sans-serif;">
                      DATA<span style="font-weight: 300; color: #00BFFF;">CAR</span>
                    </div>
                    <div style="font-size: 9px; font-weight: 700; color: #71717A; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 4px;">
                      Plataforma de Inteligencia Automotriz 0KM
                    </div>
                  </td>
                  <td align="right" style="vertical-align: top;">
                    <span style="font-size: 10px; font-weight: 700; color: #71717A; text-transform: uppercase; letter-spacing: 1px; background-color: #F4F4F5; padding: 4px 10px;">
                      Reporte Oficial B2B
                    </span>
                  </td>
                </tr>
              </table>

              <!-- SECCIÓN D.1: TÍTULO Y CONCESIONARIA -->
              <div style="margin-top: 28px;">
                <div style="font-size: 11px; font-weight: 700; color: #0080B0; text-transform: uppercase; letter-spacing: 1px;">
                  ${dealership} · <span style="color: #71717A;">${escapeHtml(marcasListText)}</span>
                </div>
                <h1 style="font-size: 19px; font-weight: 800; color: #0A1F33; margin: 6px 0 4px 0; line-height: 1.35;">
                  Comparación de las marcas de ${dealership} de los ${period}
                </h1>
                <div style="font-size: 12px; color: #71717A;">
                  Período evaluado: ${dateRange}
                </div>
              </div>
            </td>
          </tr>

          <!-- CUERPO PRINCIPAL -->
          <tr>
            <td style="padding: 32px 36px;">

              <!-- SECCIÓN D.2 & D.4: COMPARADOR TELEMETRÍA -->
              <div style="margin-bottom: 32px;">
                <div style="font-size: 11px; font-weight: 800; color: #71717A; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 8px;">
                  Telemetría del Comparador
                </div>
                
                <div style="font-size: 26px; font-weight: 900; color: #0A1F33; line-height: 1.2;">
                  Tus marcas se han comparado ${d.totalComparisons} veces
                </div>
                
                <div style="font-size: 12px; margin-top: 6px;">
                  ${compTrendText} <span style="color: #71717A;">(período anterior: ${d.prevComparisons})</span>
                </div>

                <!-- CTAs D.4 de análisis directo -->
                <div style="margin-top: 16px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                    <tr>
                      <td style="padding: 4px 0;">
                        <a href="${portalUrl}" style="color: #0A1F33; text-decoration: none; font-size: 12px; font-weight: 700; display: inline-block;">
                          → Conocé contra qué marcas te comparan
                        </a>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 4px 0;">
                        <a href="${portalUrl}" style="color: #0A1F33; text-decoration: none; font-size: 12px; font-weight: 700; display: inline-block;">
                          → Conocé contra qué modelos te comparan
                        </a>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 10px 0 0 0;">
                        <a href="${waComparadorUrl}" style="display: inline-block; background-color: #0A1F33; color: #FFFFFF; text-decoration: none; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 10px 18px; border-radius: 2px;">
                          Quiero destacar en el comparador
                        </a>
                      </td>
                    </tr>
                  </table>
                </div>

                <!-- NOTA INFORMATIVA D.4 (i) -->
                <div style="margin-top: 16px; padding: 12px 16px; background-color: #F8FAFC; border-left: 2px solid #0A1F33; font-size: 11px; color: #52525B; line-height: 1.55;">
                  <strong>(i) ¿Qué es el Comparador DATACAR?</strong><br>
                  Es la herramienta oficial donde compradores automotrices de Paraguay confrontan simultáneamente especificaciones técnicas, motorización, seguridad ADAS, confort y precios de hasta 3 vehículos 0km antes de su decisión de compra.
                </div>
              </div>

              <!-- SECCIÓN D.2: TABLAS TOP 3 MARCAS Y MODELOS -->
              <div style="margin-bottom: 32px; padding-top: 24px; border-top: 1px solid #F4F4F5;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="vertical-align: top; width: 48%; padding-right: 12px;">
                      <div style="font-size: 11px; font-weight: 800; color: #0A1F33; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px;">
                        Top 3 Marcas Comparadas
                      </div>
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                        ${marcasRows}
                      </table>
                    </td>
                    <td style="vertical-align: top; width: 48%; padding-left: 12px;">
                      <div style="font-size: 11px; font-weight: 800; color: #0A1F33; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px;">
                        Top 3 Modelos
                      </div>
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                        ${modelosRows}
                      </table>
                    </td>
                  </tr>
                </table>
              </div>

              <!-- SECCIÓN D.5: TELEMETRÍA DEL RECOMENDADOR -->
              <div style="margin-bottom: 32px; padding-top: 24px; border-top: 1px solid #F4F4F5;">
                <div style="font-size: 11px; font-weight: 800; color: #71717A; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 8px;">
                  Telemetría del Recomendador
                </div>
                
                <div style="font-size: 22px; font-weight: 900; color: #0A1F33; line-height: 1.25;">
                  ${dealership} ha aparecido ${d.totalRecommendations} veces en el recomendador
                </div>

                <div style="font-size: 12px; margin-top: 6px;">
                  ${recTrendText} <span style="color: #71717A;">(período anterior: ${d.prevRecommendations})</span>
                </div>

                <!-- CTA D.5 -->
                <div style="margin-top: 16px;">
                  <a href="${waRecomendadorUrl}" style="display: inline-block; background-color: #0A1F33; color: #FFFFFF; text-decoration: none; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 10px 18px; border-radius: 2px;">
                    Quiero aparecer más veces en el recomendador
                  </a>
                </div>

                <!-- NOTA INFORMATIVA D.5 (i) -->
                <div style="margin-top: 16px; padding: 12px 16px; background-color: #F8FAFC; border-left: 2px solid #0A1F33; font-size: 11px; color: #52525B; line-height: 1.55;">
                  <strong>(i) ¿Qué es el Recomendador DATACAR?</strong><br>
                  Es el asistente interactivo inteligente que procesa las necesidades de compradores reales (presupuesto, uso, equipamiento buscado) y sugiere los modelos 0km exactos del mercado paraguayo que resuelven su perfil.
                </div>
              </div>

              <!-- SECCIÓN D.3: CTA INFORME COMPLETO -->
              <div style="margin-top: 28px; padding: 28px; background-color: #F8FAFC; border: 1px solid #E4E4E7; text-align: center;">
                <div style="font-size: 15px; font-weight: 800; color: #0A1F33; margin-bottom: 6px;">
                  ¿Querés ver el informe completo?
                </div>
                <div style="font-size: 12px; color: #52525B; margin-bottom: 18px; max-width: 440px; margin-left: auto; margin-right: auto; line-height: 1.5;">
                  Accedé a la telemetría detallada de duelos directos por modelo, marcas rivales y preferencias de equipamiento en nuestro portal oficial de concesionarias.
                </div>
                <div>
                  <a href="${portalUrl}" style="display: inline-block; background-color: #00BFFF; color: #0A1F33; text-decoration: none; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; padding: 12px 24px; border-radius: 2px;">
                    Ver Informe Completo en datacarpy.com/concesionarias
                  </a>
                </div>
              </div>

            </td>
          </tr>

          <!-- PIE DE PÁGINA SOBRIO Y PROFESIONAL -->
          <tr>
            <td style="padding: 24px 36px; border-top: 1px solid #F4F4F5; font-size: 11px; color: #71717A; line-height: 1.6; text-align: center;">
              <div style="font-weight: 700; color: #0A1F33;">
                DATACAR Paraguay · Inteligencia Automotriz
              </div>
              <div style="margin-top: 4px;">
                Este informe mensual es generado a partir de la interacción real de usuarios en <a href="https://datacarpy.com" style="color: #0A1F33; text-decoration: underline;">datacarpy.com</a>.
              </div>
              <div style="margin-top: 10px; font-size: 10px; color: #A1A1AA;">
                Asistencia directa por WhatsApp: +595 991 244469 · Asunción, Paraguay
              </div>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>
  `.trim();
}

/**
 * Generador de Texto Plano (Multipart Alternative)
 * Imprescindible para que servidores de correo corporativos (Exchange, Microsoft 365, etc.)
 * no clasifiquen el correo como spam o correo no deseado.
 */
export function buildDealershipReportPlainText(d: DealershipReportHtmlData): string {
  const dealership = d.dealershipName || 'Concesionaria Oficial';
  const period = d.periodLabel || 'últimos 30 días';
  const dateRange = d.dateRangeText || 'Últimos 30 días';
  const marcasListText = (d.marcas && d.marcas.length > 0) ? d.marcas.join(', ') : 'Portafolio Oficial';

  const compSign = d.comparisonChangePct > 0 ? '+' : '';
  const compTrendText = d.comparisonTrend === 'up'
    ? `Ha aumentado +${d.comparisonChangePct}% comparado con el período anterior`
    : d.comparisonTrend === 'down'
      ? `Ha disminuido ${d.comparisonChangePct}% contra el período anterior`
      : `Se mantuvo igual contra el período anterior`;

  const recTrendText = d.recommendationTrend === 'up'
    ? `Ha aumentado +${d.recommendationChangePct}% contra el período anterior`
    : d.recommendationTrend === 'down'
      ? `Ha disminuido ${d.recommendationChangePct}% contra el período anterior`
      : `Se mantuvo igual contra el período anterior`;

  const topMarcasText = (d.topMarcas && d.topMarcas.length > 0)
    ? d.topMarcas.slice(0, 3).map((m, idx) => `  ${idx + 1}. ${m.name}: ${m.count} comparaciones (${m.sharePct}%)`).join('\n')
    : '  Sin registros en este período.';

  const topModelosText = (d.topModelos && d.topModelos.length > 0)
    ? d.topModelos.slice(0, 3).map((m, idx) => `  ${idx + 1}. ${m.name}${m.brandName ? ` (${m.brandName})` : ''}: ${m.count} veces`).join('\n')
    : '  Sin registros en este período.';

  return `
DATACAR PARAGUAY - REPORTE MENSUAL DE INTELIGENCIA AUTOMOTRIZ 0KM
================================================================

Exclusivo para: ${dealership}
Marcas: ${marcasListText}
Período evaluado: ${period} (${dateRange})

----------------------------------------------------------------
1. COMPARADOR DATACAR (ÚLTIMOS 30 DÍAS)
----------------------------------------------------------------
Tus marcas se han comparado ${d.totalComparisons} veces.
Tendencia: ${compTrendText} (Período anterior: ${d.prevComparisons} comparaciones).

Top 3 Marcas Comparadas:
${topMarcasText}

Top 3 Modelos Más Buscados:
${topModelosText}

¿Qué es el Comparador DATACAR?
Es la herramienta donde los usuarios confrontan simultáneamente especificaciones técnicas, motorización, seguridad ADAS y precios de hasta 3 vehículos 0km antes de decidir su compra.

- Conocé contra qué marcas y modelos te comparan: https://datacarpy.com/concesionarias
- Quiero destacar en el comparador (WhatsApp): https://wa.me/${WA_CONTACT_NUMBER}

----------------------------------------------------------------
2. RECOMENDADOR INTELIGENTE
----------------------------------------------------------------
${dealership} ha aparecido ${d.totalRecommendations} veces en el recomendador.
Tendencia: ${recTrendText} (Período anterior: ${d.prevRecommendations} sugerencias).

¿Qué es el Recomendador DATACAR?
Es el asistente interactivo de compra que procesa el presupuesto y equipamiento buscado por compradores reales y sugiere modelos 0km oficiales ideales.

- Quiero aparecer más veces en el recomendador (WhatsApp): https://wa.me/${WA_CONTACT_NUMBER}

----------------------------------------------------------------
3. INFORME COMPLETO Y DETALLADO
----------------------------------------------------------------
¿Querés ver el informe completo?
Accedé a telemetría detallada de consideración, duelos directos y demanda en:
https://datacarpy.com/concesionarias

--
DATACAR Paraguay - Inteligencia Automotriz
Contacto WhatsApp oficial: +595 991 244469
Web: https://datacarpy.com
`.trim();
}
