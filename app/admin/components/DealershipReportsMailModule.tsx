'use client';

import React, { useState, useMemo } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { computeDealershipMetrics, ComputedDealershipMetrics } from '../../../lib/dealershipAnalytics';
import { buildDealershipReportHtml } from '../../../lib/dealershipReportHtml';
import { sendDealershipReportEmail } from '../../../lib/mailer';

interface DealershipReportsMailModuleProps {
  concesionariasList: any[];
  setConcesionariasList: React.Dispatch<React.SetStateAction<any[]>>;
  marcasList: any[];
  modelosList: any[];
  versionesList: any[];
  comparisonStatsList: any[];
  wizardStatsList: any[];
  showToast: (msg: string) => void;
}

export default function DealershipReportsMailModule({
  concesionariasList,
  setConcesionariasList,
  marcasList,
  modelosList,
  versionesList,
  comparisonStatsList,
  wizardStatsList,
  showToast,
}: DealershipReportsMailModuleProps) {
  // Filtros y búsquedas
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'todos' | 'con_email' | 'sin_email' | 'al_dia' | 'pendientes'>('todos');
  const [sortBy, setSortBy] = useState<'nombre' | 'dias_envio' | 'comparaciones'>('nombre');

  // Estado local para edición de los 3 correos por concesionaria: { [dealerId]: [e1, e2, e3] }
  const [emailInputs, setEmailInputs] = useState<Record<string, [string, string, string]>>({});
  const [savingEmailId, setSavingEmailId] = useState<string | null>(null);

  // Estados de envío y modal de preview
  const [previewDealer, setPreviewDealer] = useState<ComputedDealershipMetrics | null>(null);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [testEmailInput, setTestEmailInput] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [sendingDealerId, setSendingDealerId] = useState<string | null>(null);

  // Cálculo memoizado de métricas para todas las concesionarias
  const computedList = useMemo(() => {
    return concesionariasList.map(c => {
      return computeDealershipMetrics(
        c,
        marcasList,
        modelosList,
        versionesList,
        comparisonStatsList,
        wizardStatsList
      );
    });
  }, [concesionariasList, marcasList, modelosList, versionesList, comparisonStatsList, wizardStatsList]);

  // Manejo de valores de los 3 inputs de emails
  const getDealerEmails = (dealer: ComputedDealershipMetrics): [string, string, string] => {
    if (emailInputs[dealer.dealershipId]) {
      return emailInputs[dealer.dealershipId];
    }
    return dealer.reportEmails;
  };

  const handleEmailChange = (dealerId: string, index: 0 | 1 | 2, value: string, currentEmails: [string, string, string]) => {
    const updated: [string, string, string] = [...currentEmails];
    updated[index] = value;
    setEmailInputs(prev => ({
      ...prev,
      [dealerId]: updated,
    }));
  };

  const handleSaveEmails = async (dealerId: string, emails: [string, string, string]) => {
    setSavingEmailId(dealerId);
    try {
      const cleanEmails = emails.map(e => e.trim());
      await updateDoc(doc(db, 'concesionarias', dealerId), {
        reportEmails: cleanEmails,
        report_email_1: cleanEmails[0] || '',
        report_email_2: cleanEmails[1] || '',
        report_email_3: cleanEmails[2] || '',
        updatedAt: serverTimestamp(),
      });

      // Actualizar estado global
      setConcesionariasList(prev => prev.map(c => {
        if (c.id === dealerId) {
          return {
            ...c,
            reportEmails: cleanEmails,
            report_email_1: cleanEmails[0] || '',
            report_email_2: cleanEmails[1] || '',
            report_email_3: cleanEmails[2] || '',
            updatedAt: new Date(),
          };
        }
        return c;
      }));

      showToast('Destinatarios guardados correctamente');
    } catch (error: any) {
      console.error('Error guardando emails:', error);
      showToast('Error al guardar: ' + (error.message || 'Error desconocido'));
    } finally {
      setSavingEmailId(null);
    }
  };

  // Enviar reporte real a la concesionaria
  const handleSendReport = async (dealer: ComputedDealershipMetrics, customRecipients?: string[]) => {
    const emailsToUse = customRecipients || getDealerEmails(dealer).filter(e => e.trim().length > 0 && e.includes('@'));
    
    if (emailsToUse.length === 0) {
      alert(`La concesionaria "${dealer.dealershipName}" no tiene ningún correo electrónico válido configurado.`);
      return;
    }

    const confirmMsg = `¿Confirmás el envío manual del reporte de mercado de los últimos 30 días a ${dealer.dealershipName}?\n\nDestinatarios (${emailsToUse.length}):\n${emailsToUse.join('\n')}`;
    if (!window.confirm(confirmMsg)) return;

    setSendingDealerId(dealer.dealershipId);
    try {
      const html = buildDealershipReportHtml(dealer.reportHtmlData);
      const subject = `DATACAR: Reporte Mensual de Mercado - ${dealer.dealershipName} (Últimos 30 días)`;

      const res = await sendDealershipReportEmail({
        dealershipName: dealer.dealershipName,
        destinatarios: emailsToUse,
        subject,
        customHtml: html,
        data: dealer.reportHtmlData,
      });

      if (!res.success) {
        throw new Error(res.error || 'Fallo en el servicio de correo');
      }

      // Guardar fecha de envío en Firestore (D.7)
      const now = new Date();
      await updateDoc(doc(db, 'concesionarias', dealer.dealershipId), {
        lastReportSentAt: serverTimestamp(),
        lastReportSentCount: (dealer.lastReportSentDate ? 1 : 0) + 1,
        lastReportSentDestinatarios: emailsToUse,
        updatedAt: serverTimestamp(),
      });

      // Actualizar estado local inmediatamente para el contador en vivo
      setConcesionariasList(prev => prev.map(c => {
        if (c.id === dealer.dealershipId) {
          return {
            ...c,
            lastReportSentAt: now,
            updatedAt: now,
          };
        }
        return c;
      }));

      showToast(`¡Reporte enviado exitosamente a ${dealer.dealershipName}! (${emailsToUse.length} correos)`);
      if (previewDealer?.dealershipId === dealer.dealershipId) {
        setPreviewDealer(null);
      }
    } catch (error: any) {
      console.error('Error enviando reporte:', error);
      showToast('Error al enviar reporte: ' + (error.message || 'Error de conexión'));
    } finally {
      setSendingDealerId(null);
    }
  };

  // Enviar correo de prueba
  const handleSendTest = async (dealer: ComputedDealershipMetrics) => {
    if (!testEmailInput.trim() || !testEmailInput.includes('@')) {
      alert('Ingresá un correo electrónico válido para la prueba.');
      return;
    }

    setIsSendingTest(true);
    try {
      const html = buildDealershipReportHtml(dealer.reportHtmlData);
      const subject = `[PRUEBA] DATACAR: Reporte Mensual de Mercado - ${dealer.dealershipName}`;

      const res = await sendDealershipReportEmail({
        dealershipName: dealer.dealershipName,
        destinatarios: [testEmailInput.trim().toLowerCase()],
        subject,
        customHtml: html,
        data: dealer.reportHtmlData,
      });

      if (!res.success) {
        throw new Error(res.error || 'Error enviando prueba');
      }

      showToast(`Prueba enviada correctamente a ${testEmailInput}`);
    } catch (error: any) {
      showToast('Error enviando prueba: ' + error.message);
    } finally {
      setIsSendingTest(false);
    }
  };

  // Filtrado y ordenamiento de la tabla
  const filteredDealerships = useMemo(() => {
    return computedList.filter(d => {
      // Filtro de búsqueda
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchName = d.dealershipName.toLowerCase().includes(q);
        const emails = getDealerEmails(d);
        const matchEmail = emails.some(e => e.toLowerCase().includes(q));
        const matchBrand = d.associatedBrands.some(b => b.toLowerCase().includes(q));
        if (!matchName && !matchEmail && !matchBrand) return false;
      }

      // Filtro por estado
      const emails = getDealerEmails(d).filter(e => e.trim().length > 0);
      const hasEmail = emails.length > 0;
      const days = d.daysSinceLastSent;

      if (filterStatus === 'con_email' && !hasEmail) return false;
      if (filterStatus === 'sin_email' && hasEmail) return false;
      if (filterStatus === 'al_dia' && (days === null || days > 30)) return false;
      if (filterStatus === 'pendientes' && days !== null && days <= 30) return false;

      return true;
    }).sort((a, b) => {
      if (sortBy === 'nombre') {
        return a.dealershipName.localeCompare(b.dealershipName);
      }
      if (sortBy === 'dias_envio') {
        // Los que nunca se enviaron primero (null), luego los que hace más días no se envían
        const daysA = a.daysSinceLastSent === null ? 99999 : a.daysSinceLastSent;
        const daysB = b.daysSinceLastSent === null ? 99999 : b.daysSinceLastSent;
        return daysB - daysA;
      }
      if (sortBy === 'comparaciones') {
        return b.currentComparisons - a.currentComparisons;
      }
      return 0;
    });
  }, [computedList, searchTerm, filterStatus, sortBy, emailInputs]);

  // Estadísticas del encabezado
  const statsSummary = useMemo(() => {
    const total = computedList.length;
    const withEmail = computedList.filter(d => getDealerEmails(d).some(e => e.trim().length > 0)).length;
    const upToDate = computedList.filter(d => d.daysSinceLastSent !== null && d.daysSinceLastSent <= 30).length;
    const pending = total - upToDate;
    return { total, withEmail, upToDate, pending };
  }, [computedList, emailInputs]);

  return (
    <div className="flex flex-col gap-6">

      {/* TARJETA SUPERIOR: RESUMEN Y PROPÓSITO DEL MÓDULO */}
      <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-6 shadow-none">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#C0C0C0]">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-[#0A1F33] text-[#00BFFF] text-[10px] font-black px-2 py-0.5 uppercase tracking-widest">
                Módulo B2B Oficial
              </span>
              <h2 className="text-sm font-black text-[#0A1F33] uppercase tracking-wider">
                Envío de Reportes de Mercado & Telemetría a Concesionarias
              </h2>
            </div>
            <p className="text-xs text-[#3A3A3C] mt-1 max-w-3xl">
              Generá y enviá reportes ejecutivos con estética web de DATACAR. Cada concesionaria recibe la analítica de sus marcas de los últimos 30 días, tendencias comparativas, top marcas y modelos confrontados, y métricas del recomendador.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] text-[#64748B]">
              Período de cálculo: <strong className="text-[#0A1F33]">Últimos 30 días móviles</strong>
            </span>
          </div>
        </div>

        {/* METRICS COUNTER BAR */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div className="bg-[#F8F9FA] border border-[#C0C0C0] p-3 text-center">
            <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-widest block">Total Concesionarias</span>
            <span className="text-xl font-black text-[#0A1F33]">{statsSummary.total}</span>
          </div>
          <div className="bg-[#F8F9FA] border border-[#C0C0C0] p-3 text-center">
            <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-widest block">Con Destinatarios</span>
            <span className="text-xl font-black text-[#0080B0]">{statsSummary.withEmail} <span className="text-xs font-normal text-[#64748B]">/ {statsSummary.total}</span></span>
          </div>
          <div className="bg-[#F8F9FA] border border-[#C0C0C0] p-3 text-center">
            <span className="text-[10px] font-bold text-[#1E8E3E] uppercase tracking-widest block">Reporte al Día (&le; 30d)</span>
            <span className="text-xl font-black text-[#1E8E3E]">{statsSummary.upToDate}</span>
          </div>
          <div className="bg-[#F8F9FA] border border-[#C0C0C0] p-3 text-center">
            <span className="text-[10px] font-bold text-[#D93025] uppercase tracking-widest block">Pendientes (&gt; 30d o sin envío)</span>
            <span className="text-xl font-black text-[#D93025]">{statsSummary.pending}</span>
          </div>
        </div>
      </div>

      {/* BARRA DE FILTROS Y CONTROLES */}
      <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-4 flex flex-col md:flex-row items-center justify-between gap-3 shadow-none">
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Buscador */}
          <div className="relative w-full md:w-64">
            <input
              type="text"
              placeholder="Buscar por nombre, email o marca..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-[#FFFFFF] border border-[#C0C0C0] text-xs px-3 py-2 text-[#0A1F33] focus:outline-none focus:border-[#00BFFF]"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-2 text-[#64748B] hover:text-[#0A1F33] text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filtro por estado */}
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as any)}
            className="bg-[#FFFFFF] border border-[#C0C0C0] text-xs px-3 py-2 text-[#0A1F33] font-bold uppercase focus:outline-none focus:border-[#00BFFF]"
          >
            <option value="todos">Todos los estados</option>
            <option value="con_email">Con emails cargados</option>
            <option value="sin_email">Sin emails cargados</option>
            <option value="al_dia">Al día (&le; 30 días)</option>
            <option value="pendientes">Pendientes (&gt; 30 días)</option>
          </select>

          {/* Ordenamiento */}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
            className="bg-[#FFFFFF] border border-[#C0C0C0] text-xs px-3 py-2 text-[#0A1F33] font-bold uppercase focus:outline-none focus:border-[#00BFFF]"
          >
            <option value="nombre">Ordenar por Nombre (A-Z)</option>
            <option value="dias_envio">Ordenar por Días sin Envío</option>
            <option value="comparaciones">Ordenar por Mayor Volumen de Comparaciones</option>
          </select>
        </div>

        <div className="text-[11px] text-[#64748B] font-bold">
          Mostrando {filteredDealerships.length} de {computedList.length} concesionarias
        </div>
      </div>

      {/* LISTADO DE CONCESIONARIAS */}
      <div className="flex flex-col gap-4">
        {filteredDealerships.length === 0 ? (
          <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-12 text-center text-[#64748B]">
            <p className="text-sm font-bold uppercase">No se encontraron concesionarias que coincidan con los filtros.</p>
          </div>
        ) : (
          filteredDealerships.map(dealer => {
            const currentEmails = getDealerEmails(dealer);
            const isSaving = savingEmailId === dealer.dealershipId;
            const isSending = sendingDealerId === dealer.dealershipId;
            const days = dealer.daysSinceLastSent;

            // Tendencia comparador badge
            const compSign = dealer.comparisonChangePct > 0 ? '+' : '';
            const recSign = dealer.recommendationChangePct > 0 ? '+' : '';

            return (
              <div
                key={dealer.dealershipId}
                className="bg-[#FFFFFF] border border-[#C0C0C0] hover:border-[#00BFFF] transition-colors p-5 shadow-none flex flex-col gap-4"
              >
                {/* FILA 1: CABECERA DE LA CONCESIONARIA + CONTADOR DE ÚLTIMO ENVÍO (D.7) */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-[#F1F5F9]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-black text-[#0A1F33] uppercase tracking-wide">
                        {dealer.dealershipName}
                      </h3>
                      {dealer.associatedBrands.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {dealer.associatedBrands.map(b => (
                            <span
                              key={b}
                              className="bg-[#F1F5F9] border border-[#CBD5E1] text-[#0A1F33] text-[9px] font-black uppercase px-2 py-0.5 rounded-none"
                            >
                              {b}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* CONTADOR D.7: FECHA DE ÚLTIMO ENVÍO & DÍAS TRANSCURRIDOS */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-bold text-[#64748B] uppercase">Último Envío:</span>
                    {days === null ? (
                      <span className="bg-[#FEE2E2] text-[#991B1B] text-[10px] font-black px-2.5 py-1 border border-[#FCA5A5] uppercase tracking-wider">
                        ⚠️ Sin envíos registrados
                      </span>
                    ) : days === 0 ? (
                      <span className="bg-[#DCFCE7] text-[#166534] text-[10px] font-black px-2.5 py-1 border border-[#86EFAC] uppercase tracking-wider">
                        ✓ Enviado hoy ({dealer.lastReportSentDate?.toLocaleDateString('es-PY')})
                      </span>
                    ) : days <= 7 ? (
                      <span className="bg-[#DCFCE7] text-[#166534] text-[10px] font-black px-2.5 py-1 border border-[#86EFAC] uppercase tracking-wider">
                        ✓ Hace {days} {days === 1 ? 'día' : 'días'} ({dealer.lastReportSentDate?.toLocaleDateString('es-PY')})
                      </span>
                    ) : days <= 30 ? (
                      <span className="bg-[#E0F2FE] text-[#0369A1] text-[10px] font-black px-2.5 py-1 border border-[#7DD3FC] uppercase tracking-wider">
                        📅 Hace {days} días ({dealer.lastReportSentDate?.toLocaleDateString('es-PY')})
                      </span>
                    ) : (
                      <span className="bg-[#FEF3C7] text-[#92400E] text-[10px] font-black px-2.5 py-1 border border-[#FCD34D] uppercase tracking-wider">
                        ⚠️ Hace {days} días (Requiere actualización)
                      </span>
                    )}
                  </div>
                </div>

                {/* FILA 2: RESUMEN ANALÍTICO DE LOS ÚLTIMOS 30 DÍAS (D.1, D.2, D.5) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-[#F8FAFC] p-3 border border-[#E2E8F0]">
                  {/* Métrica 1: Comparaciones de tus marcas */}
                  <div className="flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider block">
                        Comparaciones (30 días)
                      </span>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-xl font-black text-[#0A1F33]">{dealer.currentComparisons}</span>
                        <span className="text-[11px] font-bold">
                          {dealer.comparisonTrend === 'up' && <span className="text-[#166534]">▲ {compSign}{dealer.comparisonChangePct}%</span>}
                          {dealer.comparisonTrend === 'down' && <span className="text-[#991B1B]">▼ {dealer.comparisonChangePct}%</span>}
                          {dealer.comparisonTrend === 'same' && <span className="text-[#64748B]">▬ 0%</span>}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] text-[#64748B] mt-1">Período ant: {dealer.prevComparisons}</span>
                  </div>

                  {/* Métrica 2: Recomendador de vehículos */}
                  <div className="flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider block">
                        Apariciones en Recomendador (30 días)
                      </span>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-xl font-black text-[#7C3AED]">{dealer.currentRecommendations}</span>
                        <span className="text-[11px] font-bold">
                          {dealer.recommendationTrend === 'up' && <span className="text-[#166534]">▲ {recSign}{dealer.recommendationChangePct}%</span>}
                          {dealer.recommendationTrend === 'down' && <span className="text-[#991B1B]">▼ {dealer.recommendationChangePct}%</span>}
                          {dealer.recommendationTrend === 'same' && <span className="text-[#64748B]">▬ 0%</span>}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] text-[#64748B] mt-1">Período ant: {dealer.prevRecommendations}</span>
                  </div>

                  {/* Métrica 3: Top marcas y modelos */}
                  <div>
                    <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider block">
                      Top Marcas / Modelos
                    </span>
                    <div className="text-[11px] text-[#0A1F33] mt-1 line-clamp-2">
                      {dealer.topMarcas.length > 0 ? (
                        <span>Marcas: <strong>{dealer.topMarcas.map(m => m.name).join(', ')}</strong></span>
                      ) : (
                        <span className="text-[#94A3B8]">Sin comparaciones aún</span>
                      )}
                      {dealer.topModelos.length > 0 && (
                        <span className="block text-[10px] text-[#64748B]">
                          Modelos: {dealer.topModelos.map(m => m.name).join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* FILA 3: CONFIGURACIÓN DE LOS 3 EMAILS DESTINATARIOS (B) */}
                <div className="border-t border-[#F1F5F9] pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black text-[#0A1F33] uppercase tracking-widest flex items-center gap-1.5">
                      <span>📬</span> Destinatarios del Reporte (3 Emails Máx)
                    </span>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => handleSaveEmails(dealer.dealershipId, currentEmails)}
                      className="bg-[#0A1F33] hover:bg-[#00BFFF] text-[#FFFFFF] hover:text-[#0A1F33] text-[10px] font-black uppercase px-3 py-1 transition-colors disabled:opacity-50"
                    >
                      {isSaving ? 'Guardando...' : '💾 Guardar Destinatarios'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div>
                      <label className="text-[9px] font-bold text-[#64748B] uppercase block mb-1">
                        Email 1 (Gerencia General)
                      </label>
                      <input
                        type="email"
                        placeholder="gerencia@concesionaria.com.py"
                        value={currentEmails[0]}
                        onChange={e => handleEmailChange(dealer.dealershipId, 0, e.target.value, currentEmails)}
                        className="w-full bg-[#FFFFFF] border border-[#CBD5E1] text-xs px-2.5 py-1.5 text-[#0A1F33] focus:outline-none focus:border-[#00BFFF]"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-[#64748B] uppercase block mb-1">
                        Email 2 (Jefatura de Ventas)
                      </label>
                      <input
                        type="email"
                        placeholder="ventas@concesionaria.com.py"
                        value={currentEmails[1]}
                        onChange={e => handleEmailChange(dealer.dealershipId, 1, e.target.value, currentEmails)}
                        className="w-full bg-[#FFFFFF] border border-[#CBD5E1] text-xs px-2.5 py-1.5 text-[#0A1F33] focus:outline-none focus:border-[#00BFFF]"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-[#64748B] uppercase block mb-1">
                        Email 3 (Marketing / Comercial)
                      </label>
                      <input
                        type="email"
                        placeholder="marketing@concesionaria.com.py"
                        value={currentEmails[2]}
                        onChange={e => handleEmailChange(dealer.dealershipId, 2, e.target.value, currentEmails)}
                        className="w-full bg-[#FFFFFF] border border-[#CBD5E1] text-xs px-2.5 py-1.5 text-[#0A1F33] focus:outline-none focus:border-[#00BFFF]"
                      />
                    </div>
                  </div>
                </div>

                {/* FILA 4: BOTONES DE ACCIÓN: PREVISUALIZAR (D.6) Y ENVIAR MANUAL */}
                <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-[#F1F5F9]">
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewDealer(dealer);
                      setTestEmailInput(currentEmails[0] || 'aldo.ojeda@datacarpy.com');
                    }}
                    className="bg-[#FFFFFF] border border-[#0A1F33] text-[#0A1F33] hover:bg-[#F8FAFC] text-[11px] font-black uppercase px-4 py-2 transition-colors flex items-center gap-1.5"
                  >
                    <span>👁️</span> Previsualizar Reporte HTML
                  </button>

                  <button
                    type="button"
                    disabled={isSending}
                    onClick={() => handleSendReport(dealer)}
                    className="bg-[#00BFFF] hover:bg-[#0A1F33] text-[#0A1F33] hover:text-[#FFFFFF] text-[11px] font-black uppercase px-5 py-2 transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                  >
                    <span>📤</span> {isSending ? 'Enviando Reporte...' : 'Enviar Reporte Ahora'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL DE PREVIEW DEL CORREO (D.6) */}
      {previewDealer && (
        <div className="fixed inset-0 z-50 bg-[#0A1F33]/80 backdrop-blur-sm flex items-center justify-center p-2 md:p-6 overflow-hidden">
          <div className="bg-[#FFFFFF] border border-[#0A1F33] w-full max-w-5xl h-[94vh] flex flex-col shadow-2xl overflow-hidden">
            
            {/* CABECERA DEL MODAL */}
            <div className="p-4 bg-[#0A1F33] text-white flex flex-col md:flex-row md:items-center justify-between gap-3 border-b-2 border-[#00BFFF]">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black bg-[#00BFFF] text-[#0A1F33] px-2 py-0.5 uppercase tracking-wider">
                    Vista Previa Fiel
                  </span>
                  <h3 className="text-sm font-black uppercase tracking-wide">
                    Reporte Mensual: {previewDealer.dealershipName}
                  </h3>
                </div>
                <div className="text-[11px] text-[#94A3B8] mt-1">
                  Destinatarios configurados: <strong>{getDealerEmails(previewDealer).filter(Boolean).join(', ') || 'Ninguno cargado'}</strong>
                </div>
              </div>

              {/* CONTROLES DISPOSITIVO Y CERRAR */}
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-[#FFFFFF]/10 border border-[#FFFFFF]/20 p-0.5">
                  <button
                    type="button"
                    onClick={() => setPreviewDevice('desktop')}
                    className={`px-3 py-1 text-[10px] font-black uppercase tracking-wider ${previewDevice === 'desktop' ? 'bg-[#00BFFF] text-[#0A1F33]' : 'text-white hover:bg-white/10'}`}
                  >
                    💻 Escritorio (640px)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewDevice('mobile')}
                    className={`px-3 py-1 text-[10px] font-black uppercase tracking-wider ${previewDevice === 'mobile' ? 'bg-[#00BFFF] text-[#0A1F33]' : 'text-white hover:bg-white/10'}`}
                  >
                    📱 Celular (375px)
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setPreviewDealer(null)}
                  className="bg-[#D93025] hover:bg-[#B71C1C] text-white font-black text-xs px-3 py-1.5 transition-colors"
                >
                  ✕ Cerrar
                </button>
              </div>
            </div>

            {/* BARRA DE ACCIÓN DIRECTA DESDE EL MODAL */}
            <div className="p-3 bg-[#F8FAFC] border-b border-[#E2E8F0] flex flex-col md:flex-row items-center justify-between gap-3">
              {/* Formulario de Envío de Prueba */}
              <div className="flex items-center gap-2 w-full md:w-auto">
                <span className="text-[10px] font-bold text-[#64748B] uppercase shrink-0">Prueba personal:</span>
                <input
                  type="email"
                  placeholder="tu.email@datacarpy.com"
                  value={testEmailInput}
                  onChange={e => setTestEmailInput(e.target.value)}
                  className="bg-white border border-[#CBD5E1] text-xs px-2.5 py-1 text-[#0A1F33] w-56 focus:outline-none focus:border-[#00BFFF]"
                />
                <button
                  type="button"
                  disabled={isSendingTest}
                  onClick={() => handleSendTest(previewDealer)}
                  className="bg-[#0A1F33] hover:bg-[#00BFFF] text-white hover:text-[#0A1F33] text-[10px] font-black uppercase px-3 py-1.5 transition-colors shrink-0 disabled:opacity-50"
                >
                  {isSendingTest ? 'Enviando...' : 'Enviar Prueba'}
                </button>
              </div>

              {/* Botón de Envío Real */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={sendingDealerId === previewDealer.dealershipId}
                  onClick={() => handleSendReport(previewDealer)}
                  className="bg-[#00BFFF] hover:bg-[#0A1F33] text-[#0A1F33] hover:text-[#FFFFFF] text-[11px] font-black uppercase px-5 py-2 transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  <span>🚀</span> Confirmar y Enviar a Concesionaria
                </button>
              </div>
            </div>

            {/* CONTENEDOR IFRAME DE PREVISUALIZACIÓN */}
            <div className="flex-1 bg-[#E2E8F0] overflow-auto p-4 flex justify-center items-start">
              <div
                className="bg-white shadow-lg transition-all duration-300 overflow-hidden border border-[#CBD5E1]"
                style={{
                  width: previewDevice === 'desktop' ? '680px' : '385px',
                  minHeight: '800px',
                }}
              >
                <iframe
                  title="Previsualización de Reporte"
                  srcDoc={buildDealershipReportHtml(previewDealer.reportHtmlData)}
                  className="w-full h-[760px] border-none"
                />
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
