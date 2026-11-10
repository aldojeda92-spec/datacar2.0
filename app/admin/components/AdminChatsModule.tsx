'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  serverTimestamp,
  getDocs,
} from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import {
  censorPhoneNumbers,
  isChatOnlineCurrentlyActive,
  ChatOnlineConfig,
} from '../../../lib/chatPrivacy';
import {
  isLocalhostRuntime,
  fetchLocalSandboxState,
  postLocalSandboxAction,
} from '../../../lib/localSandbox';

interface AdminChatsModuleProps {
  marcasList: any[];
  onToggleBrandChat?: (brandId: string, currentVal: boolean, brandName?: string) => void;
  globalChatEnabled: boolean;
  onToggleGlobalChat: () => void;
}

const PRESET_TOPICS = [
  { key: 'precio', label: '💰 Precio de contado y promociones', match: ['precio', 'contado', 'promo'] },
  { key: 'financiacion', label: '🏦 Opciones de financiación y cuotas', match: ['financiaci', 'cuota'] },
  { key: 'usado', label: '🚗 Entregar mi usado como parte de pago', match: ['usado', 'parte de pago'] },
  { key: 'entrega', label: '📅 Disponibilidad de entrega inmediata', match: ['disponibilidad', 'entrega'] },
];

export default function AdminChatsModule({
  marcasList,
  globalChatEnabled,
  onToggleGlobalChat,
}: AdminChatsModuleProps) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [telemetryEvents, setTelemetryEvents] = useState<any[]>([]);
  const [privateContactsMap, setPrivateContactsMap] = useState<Record<string, any>>({});
  const [selectedSession, setSelectedSession] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [replyText, setReplyText] = useState('');
  const [filterBrand, setFilterBrand] = useState('Todas');
  const [funnelDateFrom, setFunnelDateFrom] = useState('');
  const [funnelDateTo, setFunnelDateTo] = useState('');
  const [censorAlert, setCensorAlert] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);

  // Vistas móviles e interruptores colapsables para que en celular el chat esté arriba del todo
  const [mobileSubTab, setMobileSubTab] = useState<'conversaciones' | 'metricas' | 'config'>('conversaciones');
  const [showDesktopFunnel, setShowDesktopFunnel] = useState(true);

  // Estado de Programación Horaria Automática (config/chat_online)
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleStartTime, setScheduleStartTime] = useState('07:30');
  const [scheduleEndTime, setScheduleEndTime] = useState('22:00');
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleSavedBadge, setScheduleSavedBadge] = useState(false);
  const [liveScheduleState, setLiveScheduleState] = useState<{
    isActive: boolean;
    isWithinSchedule: boolean;
    currentTimePy: string;
  }>({ isActive: true, isWithinSchedule: true, currentTimePy: '--:--' });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const onLocalhost = isLocalhostRuntime();

  // Suscripción a config/chat_online para leer y evaluar el horario programado
  useEffect(() => {
    let currentCfg: ChatOnlineConfig = {
      enabled: globalChatEnabled,
      scheduleEnabled: false,
      startTime: '07:30',
      endTime: '22:00',
    };

    const unsubCfg = onSnapshot(
      doc(db, 'config', 'chat_online'),
      (snap) => {
        if (snap.exists()) {
          const d = snap.data() as any;
          const schOn = Boolean(d.scheduleEnabled);
          const st = d.startTime || '07:30';
          const et = d.endTime || '22:00';
          setScheduleEnabled(schOn);
          setScheduleStartTime(st);
          setScheduleEndTime(et);
          currentCfg = {
            enabled: d.enabled !== false,
            scheduleEnabled: schOn,
            startTime: st,
            endTime: et,
          };
        }
        setLiveScheduleState(isChatOnlineCurrentlyActive(currentCfg));
      },
      () => {}
    );

    const timer = setInterval(() => {
      setLiveScheduleState(
        isChatOnlineCurrentlyActive({
          enabled: globalChatEnabled,
          scheduleEnabled,
          startTime: scheduleStartTime,
          endTime: scheduleEndTime,
        })
      );
    }, 20000);

    return () => {
      unsubCfg();
      clearInterval(timer);
    };
  }, [globalChatEnabled, scheduleEnabled, scheduleStartTime, scheduleEndTime]);

  const handleSaveScheduleConfig = async (
    nextScheduleEnabled: boolean,
    nextStart: string,
    nextEnd: string
  ) => {
    setSavingSchedule(true);
    try {
      await setDoc(
        doc(db, 'config', 'chat_online'),
        {
          scheduleEnabled: nextScheduleEnabled,
          startTime: nextStart,
          endTime: nextEnd,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setScheduleEnabled(nextScheduleEnabled);
      setScheduleStartTime(nextStart);
      setScheduleEndTime(nextEnd);
      setLiveScheduleState(
        isChatOnlineCurrentlyActive({
          enabled: globalChatEnabled,
          scheduleEnabled: nextScheduleEnabled,
          startTime: nextStart,
          endTime: nextEnd,
        })
      );
      setScheduleSavedBadge(true);
      setTimeout(() => setScheduleSavedBadge(false), 3000);
    } catch (err) {
      console.error('Error guardando rango horario del chat:', err);
    } finally {
      setSavingSchedule(false);
    }
  };

  // Sincronización de sesiones de chat y contactos privados
  useEffect(() => {
    const q = query(collection(db, 'chat_sessions'), orderBy('updatedAt', 'desc'));
    const unsub = onSnapshot(
      q,
      async (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setSessions(list);
        if (selectedSession) {
          const updated = list.find((s) => s.id === selectedSession.id);
          if (updated) setSelectedSession(updated);
        } else if (typeof window !== 'undefined') {
          const urlChatId = new URLSearchParams(window.location.search).get('chatId');
          if (urlChatId) {
            const matched = list.find((s) => s.id === urlChatId);
            if (matched) {
              setSelectedSession(matched);
              setMobileSubTab('conversaciones');
            }
          }
        }

        try {
          const privSnap = await getDocs(collection(db, 'chat_private_contacts'));
          const map: Record<string, any> = {};
          privSnap.docs.forEach((docSnap) => {
            map[docSnap.id] = docSnap.data();
          });
          setPrivateContactsMap(map);
        } catch (e) {
          console.warn('Error leyendo chat_private_contacts:', e);
        }
      },
      () => {}
    );

    const unsubTelemetry = onSnapshot(
      collection(db, 'chat_telemetry'),
      (tSnap) => {
        setTelemetryEvents(tSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      () => {}
    );

    return () => {
      unsub();
      unsubTelemetry();
    };
  }, [selectedSession?.id]);

  // Suscripción a los mensajes de la sesión seleccionada
  useEffect(() => {
    if (!selectedSession?.id) {
      setMessages([]);
      return;
    }
    if (selectedSession.id.startsWith('local_chat_')) {
      fetchLocalSandboxState().then((st) => {
        setMessages(st.chatMessages?.[selectedSession.id] || []);
      });
      return;
    }
    const q = query(
      collection(db, 'chat_sessions', selectedSession.id, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      },
      () => {}
    );
    return () => unsub();
  }, [selectedSession?.id]);

  const handleSelectSession = async (s: any) => {
    setSelectedSession(s);
    setMobileSubTab('conversaciones');
    if (s.unreadAdmin && s.unreadAdmin > 0 && !s.id.startsWith('local_chat_')) {
      updateDoc(doc(db, 'chat_sessions', s.id), { unreadAdmin: 0 }).catch(() => {});
    }
  };

  const handleSendAdminReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSession || !replyText.trim()) return;

    const { sanitizedText, hadPhone } = censorPhoneNumbers(replyText.trim());
    if (hadPhone) {
      setCensorAlert(true);
      setTimeout(() => setCensorAlert(false), 6000);
    }

    try {
      if (selectedSession.id.startsWith('local_chat_')) {
        const res = await postLocalSandboxAction('send_chat_message', {
          chatId: selectedSession.id,
          senderRole: 'admin',
          senderName: 'Asesor Oficial DATACAR',
          text: sanitizedText,
          hadPhoneCensored: hadPhone,
        });
        if (res.state?.chatMessages?.[selectedSession.id]) {
          setMessages(res.state.chatMessages[selectedSession.id]);
        }
        setReplyText('');
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
        return;
      }

      const senderLabel =
        selectedSession.brandName && selectedSession.brandName !== 'CENTRAL DATACAR'
          ? `Asesor ${selectedSession.brandName}`
          : 'Asesor DATACAR';

      await addDoc(collection(db, 'chat_sessions', selectedSession.id, 'messages'), {
        senderRole: 'admin',
        senderName: senderLabel,
        text: sanitizedText,
        hadPhoneCensored: hadPhone,
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'chat_sessions', selectedSession.id), {
        lastMessage: sanitizedText,
        unreadUser: (selectedSession.unreadUser || 0) + 1,
        unreadAdmin: 0,
        updatedAt: serverTimestamp(),
      });

      setReplyText('');
    } catch (err) {
      console.error('Error enviando respuesta admin:', err);
    }
  };

  // Solicitar autorización para obtener datos del usuario desde Admin
  const handleSendAdminContactInvite = async () => {
    if (!selectedSession || sendingInvite || selectedSession.convertedToLead) return;
    setSendingInvite(true);
    const inviteText = `¿Querés que un asesor de ${selectedSession.brandName || 'DATACAR'} se comunique con vos a tu celular para enviarte la propuesta?`;

    try {
      const senderLabel =
        selectedSession.brandName && selectedSession.brandName !== 'CENTRAL DATACAR'
          ? `Asesor ${selectedSession.brandName}`
          : 'Asesor DATACAR';

      await addDoc(collection(db, 'chat_sessions', selectedSession.id, 'messages'), {
        senderRole: 'admin',
        senderName: senderLabel,
        text: inviteText,
        messageType: 'contact_request',
        hadPhoneCensored: false,
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'chat_sessions', selectedSession.id), {
        promptedDealerContact: true,
        deferredDealerContact: false,
        lastMessage: '📩 Solicitud de contacto enviada al usuario',
        unreadUser: (selectedSession.unreadUser || 0) + 1,
        unreadAdmin: 0,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('Error enviando solicitud desde admin:', err);
    } finally {
      setSendingInvite(false);
    }
  };

  const handleToggleSessionStatus = async (session: any) => {
    const nextStatus = session.status === 'closed' ? 'active' : 'closed';
    try {
      if (session.id.startsWith('local_chat_')) {
        const res = await postLocalSandboxAction('toggle_chat_status', {
          chatId: session.id,
          status: nextStatus,
        });
        if (res.state?.chatSessions) {
          setSessions(res.state.chatSessions);
          const updated = res.state.chatSessions.find((s: any) => s.id === session.id);
          if (updated) setSelectedSession(updated);
        }
        return;
      }

      await updateDoc(doc(db, 'chat_sessions', session.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('Error cambiando estado del chat:', err);
    }
  };

  const filteredSessions = sessions.filter((s) => {
    if (filterBrand !== 'Todas' && s.brandId !== filterBrand) return false;
    return true;
  });

  // ==========================================
  // CÁLCULO DE REPORTERÍA TIPO FUNNEL DE CHATS ONLINE (A, B, C, D)
  // ==========================================
  const funnelMetrics = useMemo(() => {
    const parseTs = (val: any): number => {
      if (!val) return 0;
      if (typeof val.toDate === 'function') return val.toDate().getTime();
      if (val.seconds) return val.seconds * 1000;
      const d = new Date(val);
      return isNaN(d.getTime()) ? 0 : d.getTime();
    };

    const inRange = (ts: number) => {
      if (!ts) return true;
      if (funnelDateFrom) {
        const fromT = new Date(`${funnelDateFrom}T00:00:00`).getTime();
        if (ts < fromT) return false;
      }
      if (funnelDateTo) {
        const toT = new Date(`${funnelDateTo}T23:59:59.999`).getTime();
        if (ts > toT) return false;
      }
      return true;
    };

    const periodSessions = sessions.filter((s) => {
      if (filterBrand !== 'Todas' && s.brandId !== filterBrand) return false;
      const ts = parseTs(s.createdAt || s.updatedAt);
      return inRange(ts);
    });

    const periodWidgetOpens = telemetryEvents.filter((ev) => {
      if (ev.eventType && ev.eventType !== 'widget_opened') return false;
      const ts = parseTs(ev.createdAt);
      return inRange(ts);
    });

    const totalSessions = periodSessions.length;
    const totalWidgetOpens = Math.max(periodWidgetOpens.length, totalSessions);

    const presetCounts: Record<string, number> = {
      precio: 0,
      financiacion: 0,
      usado: 0,
      entrega: 0,
    };
    let totalPresetCount = 0;
    let totalCustomCount = 0;

    let capturedBrandOrModelCount = 0;
    let capturedFullBrandAndModelCount = 0;
    let advancedWorkflowCount = 0;
    let closedChatsCount = 0;
    let closedByUserCount = 0;
    let activeChatsCount = 0;

    let leadsAuthorizedDealerCount = 0;
    let leadsAdminOnlyCount = 0;

    const brandDemandMap: Record<string, { brandName: string; count: number; authorized: number }> = {};
    const modelDemandMap: Record<string, { fullName: string; count: number }> = {};

    periodSessions.forEach((s) => {
      const topicRaw = (s.initialTopic || s.presetQuestionLabel || s.lastMessage || '').toLowerCase();
      let matchedPresetKey: string | null = null;

      if (s.initialQuestionType === 'custom') {
        matchedPresetKey = null;
      } else {
        for (const pt of PRESET_TOPICS) {
          if (pt.match.some((kw) => topicRaw.includes(kw))) {
            matchedPresetKey = pt.key;
            break;
          }
        }
      }

      if (matchedPresetKey) {
        presetCounts[matchedPresetKey] = (presetCounts[matchedPresetKey] || 0) + 1;
        totalPresetCount++;
      } else {
        totalCustomCount++;
      }

      const hasBrand =
        Boolean(s.vehicleCaptured) ||
        (Boolean(s.brandName) && s.brandName !== 'CENTRAL DATACAR' && s.brandId !== 'datacar');
      const hasModel = Boolean(s.modelName && s.modelName.trim());

      if (hasBrand || hasModel) {
        capturedBrandOrModelCount++;
      }
      if (hasBrand && hasModel) {
        capturedFullBrandAndModelCount++;
      }

      const progressed =
        hasBrand ||
        hasModel ||
        Boolean(s.convertedToLead) ||
        (Number(s.userMessagesCount) || 1) > 1 ||
        (s.lastMessage && s.lastMessage !== s.initialTopic);
      if (progressed) {
        advancedWorkflowCount++;
      }

      if (s.status === 'closed') {
        closedChatsCount++;
        if (s.closedBy === 'user') closedByUserCount++;
      } else {
        activeChatsCount++;
      }

      if (s.convertedToLead) {
        leadsAuthorizedDealerCount++;
      } else {
        leadsAdminOnlyCount++;
      }

      if (hasBrand && s.brandName) {
        const bKey = s.brandName.trim().toUpperCase();
        if (!brandDemandMap[bKey]) {
          brandDemandMap[bKey] = { brandName: bKey, count: 0, authorized: 0 };
        }
        brandDemandMap[bKey].count++;
        if (s.convertedToLead) brandDemandMap[bKey].authorized++;

        if (hasModel) {
          const mFull = `${bKey} ${s.modelName.trim().toUpperCase()}`;
          if (!modelDemandMap[mFull]) {
            modelDemandMap[mFull] = { fullName: mFull, count: 0 };
          }
          modelDemandMap[mFull].count++;
        }
      }
    });

    const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : 0);

    const topBrandsInChat = Object.values(brandDemandMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
    const topModelsInChat = Object.values(modelDemandMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    return {
      totalWidgetOpens,
      totalSessions,
      startRateFromOpenPct: pct(totalSessions, totalWidgetOpens),
      presetCounts,
      totalPresetCount,
      totalCustomCount,
      presetPct: pct(totalPresetCount, totalSessions),
      customPct: pct(totalCustomCount, totalSessions),
      advancedWorkflowCount,
      advancedWorkflowPct: pct(advancedWorkflowCount, totalSessions),
      capturedBrandOrModelCount,
      capturedBrandOrModelPct: pct(capturedBrandOrModelCount, totalSessions),
      capturedFullBrandAndModelCount,
      closedChatsCount,
      closedChatsPct: pct(closedChatsCount, totalSessions),
      closedByUserCount,
      activeChatsCount,
      leadsAuthorizedDealerCount,
      leadsAuthorizedDealerPct: pct(leadsAuthorizedDealerCount, totalSessions),
      leadsAdminOnlyCount,
      leadsAdminOnlyPct: pct(leadsAdminOnlyCount, totalSessions),
      topBrandsInChat,
      topModelsInChat,
    };
  }, [sessions, telemetryEvents, filterBrand, funnelDateFrom, funnelDateTo]);

  const formatTime = (ts: any) => {
    if (!ts) return '';
    try {
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      return d.toLocaleString('es-PY', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const unreadTotal = useMemo(
    () => sessions.reduce((acc, s) => acc + (Number(s.unreadAdmin) || 0), 0),
    [sessions]
  );

  // Cuando en celular hay una sesión abierta, mostramos pantalla completa tipo WhatsApp para responder súper cómodo
  if (selectedSession) {
    const priv = privateContactsMap[selectedSession.id];
    const cleanPhoneDigits = (priv?.userPhone || '').replace(/\D/g, '');
    const waHref = cleanPhoneDigits
      ? `https://wa.me/${cleanPhoneDigits.startsWith('0') ? `595${cleanPhoneDigits.slice(1)}` : cleanPhoneDigits}`
      : '';

    return (
      <div className="fixed inset-0 z-50 lg:static lg:z-auto bg-white lg:border lg:border-[#D4D4D8] flex flex-col lg:h-[76vh]">
        {/* CABECERA COMPACTA DE CONVERSACIÓN (Mobile-first) */}
        <div className="bg-[#0A1F33] text-white px-3 py-2.5 sm:px-4 sm:py-3 flex items-center justify-between gap-2 shrink-0 border-b border-[#00BFFF]/40">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setSelectedSession(null)}
              className="bg-white/10 hover:bg-white/20 text-white px-2.5 py-1.5 text-xs font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
              aria-label="Volver a la lista de chats"
            >
              ← <span className="hidden sm:inline">Lista</span>
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-xs sm:text-sm truncate">
                  {selectedSession.userName || 'Interesado 0km'}
                </span>
                <span className="bg-[#00BFFF] text-[#0A1F33] text-[9px] font-bold uppercase px-1.5 py-0.5">
                  {selectedSession.brandName}
                  {selectedSession.modelName ? ` • ${selectedSession.modelName}` : ''}
                </span>
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.5 ${
                    selectedSession.status === 'closed'
                      ? 'bg-[#D93025] text-white'
                      : 'bg-[#1E8E3E] text-white'
                  }`}
                >
                  {selectedSession.status === 'closed' ? 'Cerrado' : 'Activo'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-white/80 mt-0.5 truncate">
                <span>📱 {priv?.userPhone || 'Sin celular'}</span>
                {selectedSession.convertedToLead && (
                  <span className="text-[#4ADE80] font-medium">• ✓ Autorizó Concesionaria</span>
                )}
              </div>
            </div>
          </div>

          {/* Botones rápidos de acción táctil (Llamar / WhatsApp / Cerrar) */}
          <div className="flex items-center gap-1.5 shrink-0">
            {priv?.userPhone && (
              <>
                <a
                  href={`tel:${priv.userPhone}`}
                  className="bg-white/15 hover:bg-white/25 text-white text-[11px] font-medium px-2.5 py-1.5"
                  title="Llamar al usuario"
                >
                  📞
                </a>
                {waHref && (
                  <a
                    href={waHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-[#1E8E3E] hover:bg-[#166d2f] text-white text-[11px] font-medium px-2.5 py-1.5"
                    title="Abrir WhatsApp directo"
                  >
                    WA
                  </a>
                )}
              </>
            )}
            <button
              type="button"
              onClick={() => handleToggleSessionStatus(selectedSession)}
              className="border border-white/30 hover:bg-white/10 text-white text-[10px] font-medium px-2.5 py-1.5 cursor-pointer"
            >
              {selectedSession.status === 'closed' ? 'Reabrir' : 'Cerrar'}
            </button>
          </div>
        </div>

        {/* BARRA SECUNDARIA DE ACCIÓN RÁPIDA (Solicitar autorización de datos con 1 toque) */}
        {!selectedSession.convertedToLead && (
          <div className="bg-[#F0FDF4] border-b border-[#BBF7D0] px-3 py-2 flex items-center justify-between gap-2 shrink-0">
            <span className="text-[11px] text-[#166534] font-normal truncate">
              ¿Querés pedirle autorización para derivar a la concesionaria?
            </span>
            <button
              type="button"
              onClick={handleSendAdminContactInvite}
              disabled={sendingInvite}
              className="bg-[#1E8E3E] hover:bg-[#166d2f] text-white text-[11px] font-medium px-3 py-1 shrink-0 transition-colors cursor-pointer disabled:opacity-50"
            >
              {sendingInvite ? 'Enviando...' : '📩 Pedir autorización'}
            </button>
          </div>
        )}

        {/* HILO DE MENSAJES (Ocupa todo el alto disponible en el celular) */}
        <div className="flex-1 p-3 sm:p-4 overflow-y-auto bg-[#FAFAFA] flex flex-col gap-2.5">
          {messages.map((msg) => {
            const isUser = msg.senderRole === 'user';
            const isAdminMsg = msg.senderRole === 'admin';
            return (
              <div
                key={msg.id}
                className={`flex flex-col max-w-[86%] sm:max-w-[75%] ${
                  isUser ? 'self-start items-start' : 'self-end items-end'
                }`}
              >
                <span className="text-[10px] text-[#71717A] mb-0.5 px-1">
                  {isUser ? `${selectedSession.userName || 'Usuario'}` : msg.senderName} •{' '}
                  {formatTime(msg.createdAt)}
                </span>
                <div
                  className={`px-3.5 py-2.5 text-[13px] sm:text-xs leading-relaxed border ${
                    isUser
                      ? 'bg-white border-[#D4D4D8] text-[#0A1F33]'
                      : isAdminMsg
                      ? 'bg-[#0A1F33] border-[#0A1F33] text-white'
                      : 'bg-[#F0F9FF] border-[#BAE6FD] text-[#0A1F33]'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {censorAlert && (
          <div className="px-3 py-1.5 bg-[#FFFBEB] border-t border-[#F59E0B]/40 text-[#B45309] text-[11px]">
            🔒 Se ocultó automáticamente un número telefónico por privacidad en el chat.
          </div>
        )}

        {/* CAJA DE RESPUESTA OPTIMIZADA PARA CELULAR (text-base evita auto-zoom en iPhone) */}
        <form
          onSubmit={handleSendAdminReply}
          className="p-2.5 sm:p-3 bg-white border-t border-[#D4D4D8] flex items-center gap-2 shrink-0 pb-[max(0.625rem,env(safe-area-inset-bottom))]"
        >
          <input
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Escribir respuesta al usuario..."
            className="flex-1 border border-[#D4D4D8] px-3.5 py-2.5 text-base sm:text-xs text-[#0A1F33] focus:outline-none focus:border-[#00BFFF]"
          />
          <button
            type="submit"
            className="bg-[#0A1F33] hover:bg-[#00BFFF] hover:text-[#0A1F33] text-white font-semibold text-xs px-5 py-3 sm:py-2.5 transition-colors shrink-0 cursor-pointer"
          >
            Enviar
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* PESTAÑAS RÁPIDAS PARA MÓVIL (< lg) — Prioriza Conversaciones arriba del todo */}
      <div className="grid grid-cols-3 gap-1.5 lg:hidden bg-[#E4E4E7] p-1">
        <button
          type="button"
          onClick={() => setMobileSubTab('conversaciones')}
          className={`py-2.5 px-2 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
            mobileSubTab === 'conversaciones'
              ? 'bg-[#0A1F33] text-white'
              : 'bg-white text-[#3A3A3C]'
          }`}
        >
          <span>💬 Chats ({filteredSessions.length})</span>
          {unreadTotal > 0 && (
            <span className="bg-[#D93025] text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
              {unreadTotal}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setMobileSubTab('config')}
          className={`py-2.5 px-2 text-xs font-semibold transition-colors cursor-pointer ${
            mobileSubTab === 'config'
              ? 'bg-[#0A1F33] text-white'
              : 'bg-white text-[#3A3A3C]'
          }`}
        >
          ⏰ Horario / ON
        </button>
        <button
          type="button"
          onClick={() => setMobileSubTab('metricas')}
          className={`py-2.5 px-2 text-xs font-semibold transition-colors cursor-pointer ${
            mobileSubTab === 'metricas'
              ? 'bg-[#0A1F33] text-white'
              : 'bg-white text-[#3A3A3C]'
          }`}
        >
          📊 Funnel
        </button>
      </div>

      {/* BLOQUE 1: INTERRUPTOR GENERAL + PROGRAMADOR DE RANGO HORARIO AUTOMÁTICO */}
      <div
        className={`${
          mobileSubTab === 'config' ? 'flex' : 'hidden lg:flex'
        } flex-col gap-4 bg-white border border-[#D4D4D8] p-4 sm:p-5`}
      >
        {/* Fila 1: Interruptor General Maestro */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E4E4E7]">
          <div className="flex items-start gap-3">
            <div
              className={`w-9 h-9 shrink-0 flex items-center justify-center font-bold text-sm text-white ${
                liveScheduleState.isActive ? 'bg-[#1E8E3E]' : 'bg-[#D93025]'
              }`}
            >
              {liveScheduleState.isActive ? 'ON' : 'OFF'}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold text-sm text-[#0A1F33]">
                  Estado General del Chat Online en la Web
                </h2>
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 ${
                    liveScheduleState.isActive
                      ? 'bg-[#E6F4EA] text-[#1E8E3E]'
                      : 'bg-[#FCE8E6] text-[#D93025]'
                  }`}
                >
                  {liveScheduleState.isActive
                    ? '● Visible ahora para visitantes'
                    : !globalChatEnabled
                    ? '○ Apagado manualmente'
                    : '🌙 Apagado por horario nocturno'}
                </span>
              </div>
              <p className="text-xs text-[#71717A] mt-0.5">
                Hora actual en Paraguay: <strong>{liveScheduleState.currentTimePy} hs</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onToggleGlobalChat}
            className={`px-4 py-2.5 text-xs font-semibold transition-colors shrink-0 cursor-pointer border ${
              globalChatEnabled
                ? 'bg-white border-[#D93025] text-[#D93025] hover:bg-[#D93025] hover:text-white'
                : 'bg-[#1E8E3E] border-[#1E8E3E] text-white hover:bg-[#166d2f]'
            }`}
          >
            {globalChatEnabled ? 'Apagar todo el Chat Online' : 'Encender Chat Online'}
          </button>
        </div>

        {/* Fila 2: Programador de Rango Horario Automático (Apagado Nocturno) */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#0A1F33]">
                🌙 Programar Rango Horario de Actividad (Apagado Nocturno Automático)
              </span>
              {scheduleSavedBadge && (
                <span className="bg-[#E6F4EA] text-[#1E8E3E] text-[10px] font-medium px-2 py-0.5">
                  ✓ Guardado
                </span>
              )}
            </div>
            <p className="text-xs text-[#71717A] mt-0.5">
              Fuera de este rango horario, el botón y los chats se ocultan automáticamente en toda la web.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer select-none bg-[#F8F9FA] border border-[#D4D4D8] px-3 py-2 text-xs text-[#0A1F33]">
              <input
                type="checkbox"
                checked={scheduleEnabled}
                onChange={(e) =>
                  handleSaveScheduleConfig(e.target.checked, scheduleStartTime, scheduleEndTime)
                }
                className="w-4 h-4 accent-[#0A1F33]"
              />
              <span>Activar horario automático</span>
            </label>

            <div className="flex items-center gap-2">
              <div>
                <label className="text-[10px] text-[#71717A] block">Encender a las</label>
                <input
                  type="time"
                  value={scheduleStartTime}
                  onChange={(e) => setScheduleStartTime(e.target.value)}
                  className="border border-[#D4D4D8] px-2.5 py-1.5 text-xs text-[#0A1F33] bg-white"
                />
              </div>
              <span className="text-xs text-[#71717A] mt-4">a</span>
              <div>
                <label className="text-[10px] text-[#71717A] block">Apagar a las</label>
                <input
                  type="time"
                  value={scheduleEndTime}
                  onChange={(e) => setScheduleEndTime(e.target.value)}
                  className="border border-[#D4D4D8] px-2.5 py-1.5 text-xs text-[#0A1F33] bg-white"
                />
              </div>
              <button
                type="button"
                disabled={savingSchedule}
                onClick={() =>
                  handleSaveScheduleConfig(scheduleEnabled, scheduleStartTime, scheduleEndTime)
                }
                className="mt-4 bg-[#0A1F33] hover:bg-[#00BFFF] hover:text-[#0A1F33] text-white text-xs font-medium px-3.5 py-2 transition-colors cursor-pointer disabled:opacity-50"
              >
                {savingSchedule ? '...' : 'Guardar horario'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* BLOQUE 2: BANDEJA DE CONVERSACIONES (En móvil se ve primero y ocupa todo el ancho) */}
      <div
        className={`${
          mobileSubTab === 'conversaciones' ? 'flex' : 'hidden lg:flex'
        } flex-col bg-white border border-[#D4D4D8]`}
      >
        <div className="p-3.5 sm:p-4 bg-[#F8F9FA] border-b border-[#D4D4D8] flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold text-sm text-[#0A1F33]">
              💬 Conversaciones de Chat ({filteredSessions.length})
            </h3>
            <p className="text-[11px] text-[#71717A]">
              Tocá cualquier conversación para abrir el chat a pantalla completa y responder.
            </p>
          </div>
          <select
            value={filterBrand}
            onChange={(e) => setFilterBrand(e.target.value)}
            className="border border-[#D4D4D8] bg-white px-3 py-2 text-xs text-[#0A1F33]"
          >
            <option value="Todas">Todas las marcas</option>
            <option value="datacar">CENTRAL DATACAR</option>
            {marcasList.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        <div className="divide-y divide-[#E4E4E7] max-h-[68vh] lg:max-h-[460px] overflow-y-auto">
          {filteredSessions.length === 0 ? (
            <div className="p-10 text-center text-[#71717A] text-xs">
              Aún no hay conversaciones en este filtro.
            </div>
          ) : (
            filteredSessions.map((s) => {
              const priv = privateContactsMap[s.id];
              const hasUnread = (Number(s.unreadAdmin) || 0) > 0;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleSelectSession(s)}
                  className={`w-full text-left p-3.5 sm:p-4 transition-colors flex items-center justify-between gap-3 cursor-pointer ${
                    hasUnread ? 'bg-[#F0F9FF]' : 'hover:bg-[#F8F9FA]'
                  }`}
                >
                  <div className="min-w-0 flex-1 flex flex-col gap-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-xs sm:text-sm text-[#0A1F33]">
                        {s.userName || 'Interesado 0km'}
                      </span>
                      <span className="bg-[#0A1F33] text-[#00BFFF] text-[10px] font-medium px-2 py-0.5">
                        {s.brandName}
                        {s.modelName ? ` • ${s.modelName}` : ''}
                      </span>
                      {priv?.userPhone && (
                        <span className="text-[11px] font-medium text-[#1E8E3E] bg-[#E6F4EA] px-2 py-0.5">
                          📱 {priv.userPhone}
                        </span>
                      )}
                      {s.convertedToLead && (
                        <span className="text-[10px] font-medium text-[#1E8E3E]">
                          ✓ Autorizado
                        </span>
                      )}
                      {s.status === 'closed' && (
                        <span className="text-[10px] text-[#D93025]">Cerrado</span>
                      )}
                    </div>

                    <p className="text-xs text-[#52525B] truncate">
                      {s.lastMessage || 'Chat iniciado...'}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[10px] text-[#71717A]">{formatTime(s.updatedAt)}</span>
                    {hasUnread ? (
                      <span className="bg-[#00BFFF] text-[#0A1F33] text-[10px] font-bold px-2 py-0.5">
                        {s.unreadAdmin} nuevo{s.unreadAdmin > 1 ? 's' : ''}
                      </span>
                    ) : (
                      <span className="text-xs text-[#0088CC]">Abrir →</span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* BLOQUE 3: REPORTERÍA EJECUTIVA TIPO FUNNEL DE CHATS ONLINE (A, B, C, D) */}
      <div
        className={`${
          mobileSubTab === 'metricas' ? 'flex' : 'hidden lg:flex'
        } bg-white border border-[#D4D4D8] p-4 sm:p-5 flex-col gap-4`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-[#E4E4E7] pb-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-sm text-[#0A1F33]">
                📊 Reportería Funnel de Chats Online (A, B, C, D)
              </h2>
              <p className="text-xs text-[#71717A]">
                Interacciones, tipo de consulta, captura de marca/modelo y conversión a Lead.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowDesktopFunnel(!showDesktopFunnel)}
              className="hidden lg:inline-block text-xs text-[#0088CC] hover:underline ml-4 cursor-pointer"
            >
              {showDesktopFunnel ? 'Ocultar métricas' : 'Mostrar métricas'}
            </button>
          </div>

          <div className="flex flex-wrap items-end gap-2 shrink-0">
            <div>
              <label className="text-[10px] text-[#71717A] block mb-0.5">Desde</label>
              <input
                type="date"
                value={funnelDateFrom}
                onChange={(e) => setFunnelDateFrom(e.target.value)}
                className="border border-[#D4D4D8] px-2 py-1 text-xs text-[#0A1F33]"
              />
            </div>
            <div>
              <label className="text-[10px] text-[#71717A] block mb-0.5">Hasta</label>
              <input
                type="date"
                value={funnelDateTo}
                onChange={(e) => setFunnelDateTo(e.target.value)}
                className="border border-[#D4D4D8] px-2 py-1 text-xs text-[#0A1F33]"
              />
            </div>
            {(funnelDateFrom || funnelDateTo) && (
              <button
                type="button"
                onClick={() => {
                  setFunnelDateFrom('');
                  setFunnelDateTo('');
                }}
                className="border border-[#D93025] text-[#D93025] text-xs px-2.5 py-1 cursor-pointer"
              >
                ✕ Limpiar
              </button>
            )}
          </div>
        </div>

        {(showDesktopFunnel || mobileSubTab === 'metricas') && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {/* ETAPA A */}
              <div className="bg-[#F8F9FA] border border-[#E4E4E7] p-3.5 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-semibold text-[#71717A] uppercase">
                    A • Interacción con el Chat
                  </span>
                  <span className="font-bold text-2xl text-[#0A1F33] block mt-1">
                    {funnelMetrics.totalSessions}
                  </span>
                </div>
                <div className="mt-2 pt-2 border-t border-[#E4E4E7] text-[11px] flex flex-col gap-0.5">
                  <div className="flex justify-between">
                    <span className="text-[#71717A]">Abrieron widget:</span>
                    <span className="font-medium text-[#0A1F33]">
                      {funnelMetrics.totalWidgetOpens}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#1E8E3E]">Celulares capturados:</span>
                    <span className="font-medium text-[#1E8E3E]">
                      {funnelMetrics.totalSessions} (100%)
                    </span>
                  </div>
                </div>
              </div>

              {/* ETAPA B */}
              <div className="bg-[#F8F9FA] border border-[#E4E4E7] p-3.5 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-semibold text-[#71717A] uppercase">
                    B • Predeterminadas vs Directas
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="font-bold text-2xl text-[#0A1F33]">
                      {funnelMetrics.totalPresetCount}
                    </span>
                    <span className="text-xs text-[#71717A]">
                      Predet. ({funnelMetrics.presetPct}%)
                    </span>
                    <span className="text-[#D4D4D8]">/</span>
                    <span className="font-bold text-xl text-[#0284C7]">
                      {funnelMetrics.totalCustomCount}
                    </span>
                    <span className="text-xs text-[#71717A]">
                      Directas ({funnelMetrics.customPct}%)
                    </span>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-[#E4E4E7]">
                  <div className="w-full h-1.5 bg-[#E4E4E7] flex overflow-hidden">
                    <div
                      className="bg-[#0A1F33] h-full"
                      style={{ width: `${funnelMetrics.presetPct}%` }}
                    />
                    <div
                      className="bg-[#00BFFF] h-full"
                      style={{ width: `${funnelMetrics.customPct}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* ETAPA C */}
              <div className="bg-[#F8F9FA] border border-[#E4E4E7] p-3.5 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-semibold text-[#71717A] uppercase">
                    C • Dejaron Marca / Modelo
                  </span>
                  <span className="font-bold text-2xl text-[#0A1F33] block mt-1">
                    {funnelMetrics.capturedBrandOrModelCount}{' '}
                    <span className="text-xs font-normal text-[#71717A]">
                      ({funnelMetrics.capturedBrandOrModelPct}%)
                    </span>
                  </span>
                </div>
                <div className="mt-2 pt-2 border-t border-[#E4E4E7] text-[11px] flex flex-col gap-0.5">
                  <div className="flex justify-between">
                    <span className="text-[#71717A]">Avanzaron en workflow:</span>
                    <span className="font-medium text-[#0A1F33]">
                      {funnelMetrics.advancedWorkflowCount} ({funnelMetrics.advancedWorkflowPct}%)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#D93025]">Cerraron el chat:</span>
                    <span className="font-medium text-[#D93025]">
                      {funnelMetrics.closedChatsCount} ({funnelMetrics.closedChatsPct}%)
                    </span>
                  </div>
                </div>
              </div>

              {/* ETAPA D */}
              <div className="bg-[#F0FDF4] border border-[#BBF7D0] p-3.5 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-semibold text-[#166534] uppercase">
                    D • Aceptaron pasar a Concesionaria
                  </span>
                  <span className="font-bold text-2xl text-[#1E8E3E] block mt-1">
                    {funnelMetrics.leadsAuthorizedDealerCount}{' '}
                    <span className="text-xs font-normal text-[#0A1F33]">
                      ({funnelMetrics.leadsAuthorizedDealerPct}%)
                    </span>
                  </span>
                </div>
                <div className="mt-2 pt-2 border-t border-[#BBF7D0] text-[11px] flex flex-col gap-0.5">
                  <div className="flex justify-between">
                    <span className="text-[#1E8E3E]">Autorizados a Concesionaria:</span>
                    <span className="font-medium text-[#1E8E3E]">
                      {funnelMetrics.leadsAuthorizedDealerCount}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#0A1F33]">Leads Solo Admin:</span>
                    <span className="font-medium text-[#0A1F33]">
                      {funnelMetrics.leadsAdminOnlyCount}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Desglose de preguntas y marcas */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
              <div className="lg:col-span-7 bg-[#F8F9FA] border border-[#E4E4E7] p-3.5">
                <span className="text-xs font-semibold text-[#0A1F33] block mb-2.5">
                  Segmentación por Tipo de Consulta (B)
                </span>
                <div className="flex flex-col gap-2">
                  {PRESET_TOPICS.map((pt) => {
                    const count = funnelMetrics.presetCounts[pt.key] || 0;
                    const pctVal =
                      funnelMetrics.totalSessions > 0
                        ? Math.round((count / funnelMetrics.totalSessions) * 100)
                        : 0;
                    return (
                      <div key={pt.key}>
                        <div className="flex justify-between text-xs text-[#3A3A3C] mb-1">
                          <span>{pt.label}</span>
                          <span>
                            {count} ({pctVal}%)
                          </span>
                        </div>
                        <div className="w-full bg-[#E4E4E7] h-1.5 overflow-hidden">
                          <div className="bg-[#0A1F33] h-full" style={{ width: `${pctVal}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  <div>
                    <div className="flex justify-between text-xs text-[#0284C7] mb-1">
                      <span>✍️ Mensaje directo / Consulta personalizada</span>
                      <span>
                        {funnelMetrics.totalCustomCount} ({funnelMetrics.customPct}%)
                      </span>
                    </div>
                    <div className="w-full bg-[#E4E4E7] h-1.5 overflow-hidden">
                      <div
                        className="bg-[#00BFFF] h-full"
                        style={{ width: `${funnelMetrics.customPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 bg-[#F8F9FA] border border-[#E4E4E7] p-3.5">
                <span className="text-xs font-semibold text-[#0A1F33] block mb-2.5">
                  Marcas y Modelos Capturados en Chat (C)
                </span>
                {funnelMetrics.topBrandsInChat.length === 0 ? (
                  <p className="text-xs text-[#71717A] py-4 text-center">
                    Sin marcas específicas en este periodo.
                  </p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {funnelMetrics.topBrandsInChat.map((b) => (
                      <div
                        key={b.brandName}
                        className="flex items-center justify-between bg-white border border-[#E4E4E7] px-2.5 py-1.5 text-xs"
                      >
                        <span className="font-semibold text-[#0A1F33]">{b.brandName}</span>
                        <span className="text-[#52525B]">
                          {b.count} chats ({b.authorized} autorizados)
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
