// lib/csvExport.ts
// Utilidad integral para exportación de bases de datos DATACAR a CSV y archivo ZIP unificado.
import JSZip from 'jszip';

export function escapeCSVField(val: any): string {
  if (val === null || val === undefined) return '';
  if (val instanceof Date) {
    return val.toISOString().replace('T', ' ').substring(0, 19);
  }
  if (typeof val === 'object') {
    if (val.toDate && typeof val.toDate === 'function') {
      try {
        return val.toDate().toISOString().replace('T', ' ').substring(0, 19);
      } catch {
        // fallback
      }
    }
    if (Array.isArray(val)) {
      val = val.join(' | ');
    } else {
      val = JSON.stringify(val);
    }
  }
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r') || str.includes(';')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCSV(headers: string[], rows: any[][]): string {
  const headerLine = headers.map(escapeCSVField).join(',');
  const rowLines = rows.map(row => row.map(escapeCSVField).join(','));
  return [headerLine, ...rowLines].join('\r\n');
}

export function triggerDownload(filename: string, content: string | Blob, mimeType: string) {
  const blob = content instanceof Blob ? content : new Blob(['\uFEFF' + content], { type: `${mimeType};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 300);
}

export function downloadCSV(filename: string, csvContent: string) {
  triggerDownload(filename, csvContent, 'text/csv');
}

export async function downloadZipOfCSVs(zipFilename: string, files: { filename: string; content: string }[]) {
  const zip = new JSZip();
  files.forEach(f => {
    zip.file(f.filename, '\uFEFF' + f.content);
  });
  const blob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(zipFilename, blob, 'application/zip');
}

// ========================================================
// GENERADORES DE CADA TABLA EN FORMATO CSV
// ========================================================

export function generateCatalogoCompletoCSV(versionesList: any[], modelosList: any[], marcasList: any[]): string {
  const marcasMap = new Map<string, any>(marcasList.map(b => [b.id, b]));
  const modelosMap = new Map<string, any>(modelosList.map(m => [m.id, m]));

  const headers = [
    'ID_Version',
    'Marca',
    'Modelo',
    'Version',
    'Ano',
    'Precio_USD',
    'Concesionaria',
    'Disponibilidad',
    'Carroceria',
    'Tipo_Motor',
    'Combustible',
    'Transmision',
    'Cilindrada_CC',
    'Potencia_HP',
    'Torque_NM',
    'Traccion',
    'Consumo_Urbano_kml',
    'Consumo_Extraurbano_kml',
    'Consumo_Mixto_kml',
    'Airbags',
    'Frenos_ABS',
    'Control_Estabilidad_ESP',
    'Isofix',
    'Frenado_Autonomo_AEB',
    'Alerta_Punto_Ciego_BSM',
    'Mantenimiento_Carril_LKA',
    'Pantalla_Pulgadas',
    'Apple_CarPlay',
    'Android_Auto',
    'Climatizador',
    'Techo_Solar',
    'Tapizado',
    'Camara_Retroceso',
    'Sensores_Estacionamiento',
    'Velocidad_Crucero',
    'Llantas_Pulgadas',
    'Garantia_Anos',
    'Garantia_KM',
    'Capacidad_Baul_L',
    'Tanque_Combustible_L',
    'Puertas',
    'Asientos',
    'Origen_Fabricacion',
    'Imagen_Modelo'
  ];

  const rows = versionesList.map(v => {
    const mod = modelosMap.get(v.modelId);
    const brand = mod ? marcasMap.get(mod.brandId) : null;
    const s = v.specs || {};

    return [
      v.id || '',
      brand?.name || v.brandName || '',
      mod?.name || v.modelName || '',
      v.name || v.versionName || '',
      v.year || '',
      v.price || '',
      v.concesionaria || '',
      v.disponible !== false ? 'Disponible' : 'Agotado',
      mod?.tipo_carroceria || s.tipo_carroceria || '',
      s.motor || '',
      s.combustible || '',
      s.transmision || '',
      s.cilindrada || '',
      s.potencia || '',
      s.torque || '',
      s.traccion || '',
      s.consumoUrbano || '',
      s.consumoExtraurbano || '',
      s.consumoMixto || '',
      s.airbags || '',
      s.abs ? 'SÍ' : 'NO',
      s.esp ? 'SÍ' : 'NO',
      s.isofix ? 'SÍ' : 'NO',
      s.aeb ? 'SÍ' : 'NO',
      s.bsm ? 'SÍ' : 'NO',
      s.lka ? 'SÍ' : 'NO',
      s.pantalla || '',
      s.appleCarPlay ? 'SÍ' : 'NO',
      s.androidAuto ? 'SÍ' : 'NO',
      s.climatizador ? 'SÍ' : 'NO',
      s.techoSolar ? 'SÍ' : 'NO',
      s.tapizado || '',
      s.camaraRetroceso ? 'SÍ' : 'NO',
      s.sensoresEstacionamiento ? 'SÍ' : 'NO',
      s.velocidadCrucero ? 'SÍ' : 'NO',
      s.llantas || '',
      s.garantiaAnos || '',
      s.garantiaKm || '',
      s.baul || '',
      s.tanque || '',
      s.puertas || '',
      s.asientos || '',
      s.origen || '',
      mod?.imgUrl || v.imgUrl || ''
    ];
  });

  return buildCSV(headers, rows);
}

export function generateMarcasCSV(marcasList: any[]): string {
  const headers = ['ID_Marca', 'Nombre', 'Pais_Origen', 'Segmento', 'URL_Logo', 'Fecha_Creacion'];
  const rows = marcasList.map(b => [
    b.id || '',
    b.name || '',
    b.country || b.origen || '',
    b.segmento || '',
    b.logoUrl || '',
    b.createdAt || ''
  ]);
  return buildCSV(headers, rows);
}

export function generateModelosCSV(modelosList: any[], marcasList: any[]): string {
  const marcasMap = new Map<string, any>(marcasList.map(b => [b.id, b]));
  const headers = ['ID_Modelo', 'ID_Marca', 'Marca', 'Nombre_Modelo', 'Carroceria', 'Destacado', 'URL_Imagen'];
  const rows = modelosList.map(m => {
    const brand = marcasMap.get(m.brandId);
    return [
      m.id || '',
      m.brandId || '',
      brand?.name || '',
      m.name || '',
      m.tipo_carroceria || '',
      m.isFeatured ? 'SÍ' : 'NO',
      m.imgUrl || ''
    ];
  });
  return buildCSV(headers, rows);
}

export function generateVersionesRawCSV(versionesList: any[], modelosList: any[], marcasList: any[]): string {
  const marcasMap = new Map<string, any>(marcasList.map(b => [b.id, b]));
  const modelosMap = new Map<string, any>(modelosList.map(m => [m.id, m]));
  const headers = ['ID_Version', 'ID_Modelo', 'Marca', 'Modelo', 'Nombre_Version', 'Ano', 'Precio_USD', 'Concesionaria', 'Disponible'];
  const rows = versionesList.map(v => {
    const mod = modelosMap.get(v.modelId);
    const brand = mod ? marcasMap.get(mod.brandId) : null;
    return [
      v.id || '',
      v.modelId || '',
      brand?.name || v.brandName || '',
      mod?.name || v.modelName || '',
      v.name || v.versionName || '',
      v.year || '',
      v.price || '',
      v.concesionaria || '',
      v.disponible !== false ? 'SÍ' : 'NO'
    ];
  });
  return buildCSV(headers, rows);
}

export function generateLeadsCSV(leadsList: any[]): string {
  const headers = [
    'ID_Lead',
    'Fecha',
    'Nombre',
    'Telefono',
    'Email',
    'Vehiculo_Interes',
    'Origen_Lead',
    'Concesionaria_Destino',
    'Estado',
    'Tiene_Auto_Usado',
    'Usado_Auto',
    'Usado_Ano',
    'Usado_Origen_Unidad',
    'Usado_Color',
    'Usado_Transmision',
    'Usado_Kilometraje',
    'Usado_Estado',
    'Usado_Valor_Solicitado_USD',
    'Usado_0KM_Interes',
    'Usado_Diferencia_Estimada_USD',
    'Usado_Comentarios',
    'Preferencias_Wizard'
  ];

  const rows = leadsList.map(l => {
    const u = l.datos_usado || null;
    const hasTradeIn = !!u;
    return [
      l.id || '',
      l.createdAt || '',
      l.nombre || '',
      l.telefono || '',
      l.email || '',
      l.vehiculo || '',
      l.origen || '',
      l.concesionaria_destino || '',
      l.estado || '',
      hasTradeIn ? 'SÍ' : 'NO',
      u?.autoAEntregar || '',
      u?.ano || '',
      u?.origenUnidad || '',
      u?.color || '',
      u?.transmision || '',
      u?.kilometraje || '',
      u?.estado || '',
      u?.valorSolicitado || '',
      u?.ceroKmInteres || '',
      u?.diferenciaEstimada || '',
      u?.comentarios || '',
      l.preferencias_wizard ? JSON.stringify(l.preferencias_wizard) : ''
    ];
  });

  return buildCSV(headers, rows);
}

export function generateConcesionariasCSV(concesionariasList: any[]): string {
  const headers = ['ID_Concesionaria', 'Nombre', 'Slug', 'Direccion', 'Telefono', 'Email', 'Sitio_Web', 'DATACAR_Check', 'Activo'];
  const rows = concesionariasList.map(c => [
    c.id || '',
    c.nombre || '',
    c.slug || '',
    c.direccion || '',
    c.telefono || '',
    c.email || '',
    c.sitioWeb || '',
    c.isDatacarCheck ? 'SÍ' : 'NO',
    c.activo !== false ? 'SÍ' : 'NO'
  ]);
  return buildCSV(headers, rows);
}

export function generateCampaignsCSV(campaignsList: any[]): string {
  const headers = [
    'ID_Campana',
    'Sponsor',
    'Espacio_Ubicacion',
    'Titular',
    'ID_Modelo_Anunciado',
    'Nombre_Modelo_Anunciado',
    'ID_Modelo_Competidor',
    'Nombre_Modelo_Competidor',
    'Alcance_Catalogo',
    'Filtro_Carroceria',
    'Filtro_Movilidad',
    'Fecha_Inicio',
    'Fecha_Fin',
    'Estado_Activo',
    'URL_Enlace',
    'URL_Imagen'
  ];

  const rows = campaignsList.map(c => [
    c.id || '',
    c.sponsor || '',
    c.location || '',
    c.headline || '',
    c.modelId || (Array.isArray(c.modelIds) ? c.modelIds.join(' | ') : ''),
    c.modelName || '',
    c.competitorModelId || '',
    c.competitorModelName || '',
    c.catalogoScope || '',
    c.targetCategory || '',
    c.targetCombustible || '',
    c.startDate || '',
    c.endDate || '',
    c.isActive !== false ? 'Activo' : 'Pausado',
    c.link || '',
    c.img || ''
  ]);

  return buildCSV(headers, rows);
}

export function generateNewsletterCSV(newsletterSubscribers: any[]): string {
  const headers = ['ID_Suscriptor', 'Email', 'Origen', 'Estado', 'Fecha_Registro'];
  const rows = newsletterSubscribers.map(s => [
    s.id || '',
    s.email || '',
    s.origen || '',
    s.estado || '',
    s.createdAt || ''
  ]);
  return buildCSV(headers, rows);
}

export function generateSolicitudesCSV(solicitudesList: any[]): string {
  const headers = ['ID_Solicitud', 'Fecha', 'Nombre_Contacto', 'Empresa_Concesionaria', 'Email', 'Telefono', 'Mensaje'];
  const rows = solicitudesList.map(s => [
    s.id || '',
    s.createdAt || '',
    s.nombre || '',
    s.empresa || '',
    s.email || '',
    s.telefono || '',
    s.mensaje || ''
  ]);
  return buildCSV(headers, rows);
}

export function generateWizardStatsCSV(wizardStatsList: any[]): string {
  const headers = ['ID_Sesion', 'Fecha', 'Presupuesto', 'Uso_Principal', 'Combustible', 'Carroceria', 'Modelo_Recomendado'];
  const rows = wizardStatsList.map(w => [
    w.id || '',
    w.createdAt || '',
    w.budget || '',
    w.usage || '',
    w.fuel || '',
    w.bodyType || '',
    w.recommendedModel || ''
  ]);
  return buildCSV(headers, rows);
}

export async function exportAllDatabasesZip(data: {
  versionesList: any[];
  modelosList: any[];
  marcasList: any[];
  leadsList: any[];
  concesionariasList: any[];
  campaignsList: any[];
  newsletterSubscribers: any[];
  solicitudesList: any[];
  wizardStatsList: any[];
}) {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const zipFilename = `DATACAR_BACKUP_TOTAL_${dateStr}.zip`;

  const files = [
    { filename: '01_catalogo_completo_vehiculos.csv', content: generateCatalogoCompletoCSV(data.versionesList, data.modelosList, data.marcasList) },
    { filename: '02_leads_contactos_y_usados.csv', content: generateLeadsCSV(data.leadsList) },
    { filename: '03_marcas.csv', content: generateMarcasCSV(data.marcasList) },
    { filename: '04_modelos.csv', content: generateModelosCSV(data.modelosList, data.marcasList) },
    { filename: '05_versiones_raw.csv', content: generateVersionesRawCSV(data.versionesList, data.modelosList, data.marcasList) },
    { filename: '06_concesionarias.csv', content: generateConcesionariasCSV(data.concesionariasList) },
    { filename: '07_pautas_publicitarias_ads.csv', content: generateCampaignsCSV(data.campaignsList) },
    { filename: '08_suscriptores_newsletter.csv', content: generateNewsletterCSV(data.newsletterSubscribers) },
    { filename: '09_solicitudes_concesionarias.csv', content: generateSolicitudesCSV(data.solicitudesList) },
    { filename: '10_telemetria_recomendador.csv', content: generateWizardStatsCSV(data.wizardStatsList) }
  ];

  await downloadZipOfCSVs(zipFilename, files);
}
