'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  addDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { censorPhoneNumbers } from '../../lib/chatPrivacy';

interface DealershipChatsViewProps {
  dealershipName: string;
  marcasPermitidas: string[];
  marcasList: any[];
  onUnreadChange?: (count: number) => void;
  onGoToLeads?: () => void;
}

export default function DealershipChatsView({
  dealershipName,
  marcasPermitidas,
  marcasList,
  onUnreadChange,
  onGoToLeads,
}: DealershipChatsViewProps) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [replyText, setReplyText] = useState('');
  const [censorAlert, setCensorAlert] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const permittedUpper = marcasPermitidas.map((m) => m.trim().toUpperCase());
  const allowsAll = permittedUpper.includes('ALL') || permittedUpper.includes('TODAS');

  useEffect(() => {
    const q = query(collection(db, 'chat_sessions'), orderBy('updatedAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
      const filtered = all.filter((s) => {
        if (allowsAll) return true;
        const bNameUpper = (s.brandName || '').trim().toUpperCase();
        const bObj = marcasList.find((b) => b.id === s.brandId);
        const objNameUpper = (bObj?.name || '').trim().toUpperCase();
        return permittedUpper.includes(bNameUpper) || permittedUpper.includes(objNameUpper);
      });

      setSessions(filtered);
      const totalUnread = filtered.reduce((acc, s) => acc + (Number(s.unreadDealer) || 0), 0);
      if (onUnreadChange) onUnreadChange(totalUnread);

      if (selectedSession) {
        const updated = filtered.find((s) => s.id === selectedSession.id);
        if (updated) setSelectedSession(updated);
      }
    });
    return () => unsub();
  }, [allowsAll, marcasPermitidas, marcasList, selectedSession?.id]);

  // Suscripción a mensajes de la conversación activa
  useEffect(() => {
    if (!selectedSession?.id) {
      setMessages([]);
      return;
    }

    if ((selectedSession.unreadDealer || 0) > 0) {
      updateDoc(doc(db, 'chat_sessions', selectedSession.id), {
        unreadDealer: 0,
      }).catch(() => {});
    }

    const q = query(
      collection(db, 'chat_sessions', selectedSession.id, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });
    return () => unsub();
  }, [selectedSession?.id]);

  const isClosed = selectedSession?.status === 'closed';

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSession || isClosed || !replyText.trim()) return;

    const { sanitizedText, hadPhone } = censorPhoneNumbers(replyText.trim());
    if (hadPhone) {
      setCensorAlert(true);
      setTimeout(() => setCensorAlert(false), 7000);
    }

    try {
      await addDoc(collection(db, 'chat_sessions', selectedSession.id, 'messages'), {
        senderRole: 'concesionaria',
        senderName: `${selectedSession.brandName} (${dealershipName})`,
        text: sanitizedText,
        hadPhoneCensored: hadPhone,
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'chat_sessions', selectedSession.id), {
        lastMessage: sanitizedText,
        unreadUser: (selectedSession.unreadUser || 0) + 1,
        unreadDealer: 0,
        updatedAt: serverTimestamp(),
      });

      setReplyText('');
    } catch (err) {
      console.error('Error enviando respuesta de concesionaria:', err);
    }
  };

  // Solicitar autorización al usuario para obtener sus datos de contacto
  const handleRequestDataAuthorization = async () => {
    if (!selectedSession || isClosed || sendingInvite || selectedSession.convertedToLead) return;
    setSendingInvite(true);
    const inviteText = `Para enviarte la cotización detallada o comunicarnos con vos por ${selectedSession.brandName}, por favor autorizá compartir tus datos presionando el botón de abajo:`;

    try {
      await addDoc(collection(db, 'chat_sessions', selectedSession.id, 'messages'), {
        senderRole: 'concesionaria',
        senderName: `${selectedSession.brandName} (${dealershipName})`,
        text: inviteText,
        messageType: 'contact_request',
        hadPhoneCensored: false,
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'chat_sessions', selectedSession.id), {
        lastMessage: '📩 Solicitud de autorización de datos enviada al usuario',
        unreadUser: (selectedSession.unreadUser || 0) + 1,
        unreadDealer: 0,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('Error solicitando autorización de datos:', err);
    } finally {
      setSendingInvite(false);
    }
  };

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

  return (
    <div className="flex flex-col gap-5">
      {/* Banner informativo */}
      <div className="bg-[#0A1F33] text-white border-l-4 border-[#00BFFF] p-4">
        <span className="text-[9px] font-black text-[#00BFFF] uppercase tracking-widest block">
          💬 Chat Online • Privacidad de Datos
        </span>
        <p className="text-xs text-white/90 mt-0.5 leading-relaxed">
          Aquí podés responder consultas específicas en vivo o presionar{' '}
          <strong>&ldquo;Solicitar autorización para obtener datos&rdquo;</strong>. Cuando el usuario autoriza, el Lead ingresa automáticamente a tu pestaña de <strong>Recepción de Leads</strong>. Si el usuario cierra la conversación, esta queda finalizada de forma permanente.
        </p>
      </div>

      {/* Consola de Chat en 2 Columnas */}
      <div className="bg-[#FFFFFF] border border-[#C0C0C0] grid grid-cols-1 lg:grid-cols-12 min-h-[540px]">
        {/* Columna izquierda: Lista de sesiones */}
        <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-[#C0C0C0] flex flex-col">
          <div className="p-4 bg-[#F5F5F5] border-b border-[#C0C0C0]">
            <h2 className="font-black text-xs text-[#0A1F33] uppercase tracking-widest">
              Conversaciones ({sessions.length})
            </h2>
            <span className="text-[9px] text-[#3A3A3C] uppercase font-bold">
              Marcas: {marcasPermitidas.join(', ')}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[#C0C0C0]/50 max-h-[480px]">
            {sessions.length === 0 ? (
              <div className="p-10 text-center text-[#C0C0C0] text-xs font-bold uppercase tracking-widest">
                No hay chats para tus marcas.
              </div>
            ) : (
              sessions.map((s) => {
                const isSelected = selectedSession?.id === s.id;
                const unread = Number(s.unreadDealer) || 0;
                const sessionClosed = s.status === 'closed';
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedSession(s)}
                    className={`w-full text-left p-4 transition-colors flex flex-col gap-1.5 cursor-pointer ${
                      isSelected ? 'bg-[#F0F9FF] border-l-4 border-[#00BFFF]' : 'hover:bg-[#F8F9FA]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="bg-[#0A1F33] text-[#00BFFF] text-[9px] font-black uppercase px-2 py-0.5">
                        {s.brandName}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {sessionClosed && (
                          <span className="bg-[#FFE6E6] text-[#D93025] text-[8px] font-black uppercase px-1.5 py-0.5">
                            Cerrado
                          </span>
                        )}
                        {unread > 0 && !sessionClosed && (
                          <span className="bg-[#1E8E3E] text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">
                            {unread}
                          </span>
                        )}
                        <span className="text-[9px] text-[#71717A]">{formatTime(s.updatedAt)}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <span className="font-black text-xs text-[#0A1F33] uppercase">
                        👤 {s.userName}
                      </span>
                      {s.convertedToLead ? (
                        <span className="text-[9px] text-[#1E8E3E] bg-[#E6F4EA] border border-[#1E8E3E] px-1.5 py-0.5 font-black uppercase">
                          ✓ Autorizado
                        </span>
                      ) : (
                        <span className="text-[9px] text-[#71717A] bg-[#F8F9FA] border border-[#C0C0C0] px-1.5 py-0.5 font-bold">
                          🔒 Datos ocultos
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-[#3A3A3C] truncate mt-0.5">
                      {s.lastMessage || 'Consulta iniciada'}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Columna derecha: Hilo de conversación */}
        <div className="lg:col-span-8 flex flex-col bg-[#F8F9FA]">
          {!selectedSession ? (
            <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
              <span className="text-3xl mb-2">💬</span>
              <p className="text-xs font-black text-[#0A1F33] uppercase tracking-widest">
                Seleccioná una conversación a la izquierda
              </p>
            </div>
          ) : (
            <>
              <div className="p-4 bg-[#FFFFFF] border-b border-[#C0C0C0] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="font-black text-sm text-[#0A1F33] uppercase">
                    👤 {selectedSession.userName}
                  </span>
                  <span className="bg-[#0A1F33] text-[#00BFFF] text-[9px] font-black uppercase px-2 py-0.5">
                    {selectedSession.brandName}
                  </span>
                  {isClosed && (
                    <span className="bg-[#FFE6E6] text-[#D93025] text-[9px] font-black uppercase px-2 py-0.5">
                      🔒 Conversación cerrada por el usuario
                    </span>
                  )}
                </div>

                {/* Botón para solicitar autorización de datos o ver el Lead si ya autorizó */}
                {selectedSession.convertedToLead ? (
                  <div className="flex items-center gap-2">
                    <span className="bg-[#E6F4EA] border border-[#1E8E3E] text-[#1E8E3E] text-[9px] font-black uppercase px-2.5 py-1.5">
                      ✓ Datos Autorizados
                    </span>
                    {onGoToLeads && (
                      <button
                        type="button"
                        onClick={onGoToLeads}
                        className="bg-[#0A1F33] hover:bg-[#00BFFF] hover:text-[#0A1F33] text-white text-[9px] font-black uppercase tracking-wider px-3 py-1.5 transition-colors cursor-pointer"
                      >
                        Ver en Recepción de Leads →
                      </button>
                    )}
                  </div>
                ) : (
                  !isClosed && (
                    <button
                      type="button"
                      onClick={handleRequestDataAuthorization}
                      disabled={sendingInvite}
                      className="bg-[#1E8E3E] hover:bg-[#0A1F33] text-white text-[9px] font-black uppercase tracking-wider px-3 py-2 transition-colors cursor-pointer"
                    >
                      {sendingInvite
                        ? 'Enviando...'
                        : '📩 Solicitar autorización para obtener datos del usuario'}
                    </button>
                  )
                )}
              </div>

              <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-3 max-h-[370px]">
                {messages.map((msg) => {
                  const isUser = msg.senderRole === 'user';
                  const isInvite = msg.messageType === 'contact_request';
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col max-w-[82%] ${
                        isUser ? 'self-start items-start' : 'self-end items-end'
                      }`}
                    >
                      <span className="text-[9px] font-bold uppercase text-[#71717A] mb-0.5 px-1">
                        {msg.senderName} • {formatTime(msg.createdAt)}
                      </span>
                      <div
                        className={`px-3.5 py-2.5 text-xs leading-relaxed border ${
                          isInvite
                            ? 'bg-[#E6F4EA] border-[#1E8E3E] text-[#0A1F33] font-bold'
                            : isUser
                            ? 'bg-white border-[#C0C0C0] text-[#0A1F33]'
                            : 'bg-[#0A1F33] border-[#0A1F33] text-white'
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
                <div className="mx-4 mb-2 p-2.5 bg-[#FFFBEB] border border-[#F59E0B] text-[#B45309] text-[10px] font-bold">
                  🔒 Los números de teléfono se ocultan automáticamente. Usá el botón &ldquo;Solicitar autorización para obtener datos del usuario&rdquo;.
                </div>
              )}

              {isClosed ? (
                <div className="p-3.5 bg-[#FFE6E6] border-t border-[#D93025] text-[#D93025] text-xs font-bold text-center">
                  🔒 Esta conversación fue cerrada por el usuario y no puede reabrirse desde la concesionaria.
                </div>
              ) : (
                <form onSubmit={handleSendReply} className="p-3 bg-white border-t border-[#C0C0C0] flex gap-2">
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={`Responder consulta específica de ${selectedSession.userName}...`}
                    className="flex-1 border border-[#C0C0C0] px-3 py-2.5 text-xs focus:outline-none focus:border-[#00BFFF]"
                  />
                  <button
                    type="submit"
                    className="bg-[#00BFFF] hover:bg-[#0A1F33] text-white font-black text-[10px] uppercase tracking-widest px-6 py-2.5 transition-colors cursor-pointer"
                  >
                    Responder
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
