'use client';

import React, { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
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
import { db } from '../../lib/firebase';
import {
  censorPhoneNumbers,
  isValidChatPhone,
  isChatOnlineCurrentlyActive,
  ChatOnlineConfig,
} from '../../lib/chatPrivacy';
import { sendChatInitiatedEmail, sendLeadNotificationEmail } from '../../lib/mailer';
import { sanitizePhonePY } from '../../lib/phone';

interface BrandChatOption {
  id: string;
  name: string;
  chatOnlineEnabled?: boolean;
}

interface ModelChatOption {
  id: string;
  brandId: string;
  name: string;
}

const PRESET_QUESTIONS = [
  '💰 Precio de contado y promociones',
  '🏦 Opciones de financiación y cuotas',
  '🚗 Entregar mi usado como parte de pago',
  '📅 Disponibilidad de entrega inmediata',
];

function buildFirstAutoReply(question: string, brandName: string, modelName?: string): string {
  const q = question.toLowerCase();
  const hasFullVehicle = !!(brandName && brandName !== 'CENTRAL DATACAR' && modelName);
  const targetDesc =
    brandName && brandName !== 'CENTRAL DATACAR'
      ? `${brandName}${modelName ? ` ${modelName}` : ''}`
      : '';

  if (hasFullVehicle) {
    return `¡Hola! 👋 Ya registramos tu consulta por el ${targetDesc}. ¿Querés hablar con alguien de la concesionaria de ${brandName} o que te contacten a tu celular para pasarte todos los detalles?`;
  }

  if (q.includes('precio') || q.includes('contado') || q.includes('promo')) {
    return targetDesc
      ? `¡Hola! 👋 Podés ver todas las promociones vigentes en datacarpy.com/promociones. Como te interesa ${targetDesc}, confirmame abajo el modelo exacto (o escribinos qué versión buscás) así te ayudamos con el precio de contado y bonos disponibles:`
      : `¡Hola! 👋 Podés ver las promociones vigentes de 0km en datacarpy.com/promociones. Si buscás algo específico, seleccioná o contanos abajo qué marca y modelo te interesa así te ayudamos:`;
  }

  if (q.includes('financiaci') || q.includes('cuota')) {
    return targetDesc
      ? `¡Hola! 👋 Algunas concesionarias cuentan con financiación propia y ya podés simular cuotas bancarias en datacarpy.com/calculadora. Para estimar tu poder de compra en ${targetDesc}, indicanos abajo qué modelo específico estás evaluando:`
      : `¡Hola! 👋 Algunas concesionarias cuentan con financiación propia, pero ya podés simular tus cuotas bancarias en datacarpy.com/calculadora. Contanos o seleccioná abajo qué marca y modelo querés evaluar para ayudarte a estimar tu poder de compra:`;
  }

  if (q.includes('usado') || q.includes('parte de pago')) {
    return targetDesc
      ? `¡Hola! 👋 Podés cargar los datos de tu vehículo actual en datacarpy.com/entregar-usado para recibir tasación. Para ayudarte a calcular la diferencia por tu ${targetDesc} 0km, confirmame abajo qué modelo exacto buscás (o escribinos qué usado tenés para entregar):`
      : `¡Hola! 👋 Podés cotizar la entrega de tu vehículo en datacarpy.com/entregar-usado. Para ayudarte mejor, seleccioná abajo qué marca y modelo 0km te interesa (y si querés escribinos qué auto tenés hoy):`;
  }

  if (q.includes('disponibilidad') || q.includes('entrega')) {
    return targetDesc
      ? `¡Hola! 👋 Podés explorar las versiones de cada vehículo en datacarpy.com/catalogo. Para verificarte ahora mismo stock, colores y entrega inmediata en ${targetDesc}, confirmame abajo el modelo exacto que buscás:`
      : `¡Hola! 👋 Podés explorar todo el catálogo en datacarpy.com/catalogo. Para verificarte disponibilidad de entrega inmediata y colores en stock, seleccioná abajo qué marca y modelo estás buscando:`;
  }

  return targetDesc
    ? `¡Hola! 👋 Recibimos tu consulta sobre ${targetDesc}. Seleccioná o escribinos abajo qué modelo específico estás evaluando:`
    : `¡Hola! 👋 Recibimos tu consulta. Para darte información exacta, seleccioná o escribinos abajo qué marca y modelo estás evaluando:`;
}

// Convierte URLs como datacarpy.com/promociones en links clicables dentro de las burbujas del chat
function renderMessageWithLinks(text: string) {
  const urlRegex = /(datacarpy\.com\/[a-zA-Z0-9\-_/]+|https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, idx) => {
    if (part.match(urlRegex)) {
      const cleanPath = part.replace(/^https?:\/\/(www\.)?datacarpy\.com/, '').replace(/^datacarpy\.com/, '');
      const href = cleanPath.startsWith('/') ? cleanPath : `https://${part}`;
      if (href.startsWith('/')) {
        return (
          <Link
            key={idx}
            href={href}
            className="text-[#0284C7] font-medium underline hover:text-[#0A1F33] mx-0.5"
          >
            {part}
          </Link>
        );
      }
      return (
        <a
          key={idx}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#0284C7] font-medium underline mx-0.5"
        >
          {part}
        </a>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export default function OnlineBrandChatWidget() {
  const pathname = usePathname();

  const [isOpen, setIsOpen] = useState(false);
  const [globalChatEnabled, setGlobalChatEnabled] = useState(true);
  const [rawBrands, setRawBrands] = useState<BrandChatOption[]>([]);
  const [allModels, setAllModels] = useState<ModelChatOption[]>([]);

  // Formulario minimalista de inicio (Sin pedir marca al inicio; se captura durante el chat)
  const [userName, setUserName] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [selectedPreset, setSelectedPreset] = useState(PRESET_QUESTIONS[0]);
  const [customInitialMessage, setCustomInitialMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [startingChat, setStartingChat] = useState(false);

  // Sesión activa
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [censorWarning, setCensorWarning] = useState(false);
  const [authorizingDealer, setAuthorizingDealer] = useState(false);

  // Estado de simulación "Escribiendo..." con delay realista
  const [isBotTyping, setIsBotTyping] = useState(false);
  const [typingSenderLabel, setTypingSenderLabel] = useState('Asesor DATACAR');

  // Selector interactivo de Marca y Modelo dentro del chat (para capturar datos en vivo)
  const [captureBrandId, setCaptureBrandId] = useState('');
  const [captureModelName, setCaptureModelName] = useState('');
  const [savingVehicleCapture, setSavingVehicleCapture] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const botTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPendingBotTimeout = () => {
    if (botTimeoutRef.current) {
      clearTimeout(botTimeoutRef.current);
      botTimeoutRef.current = null;
    }
  };

  const isHiddenRoute =
    pathname?.startsWith('/admin') || pathname?.startsWith('/concesionarias');

  // Todas las marcas del catálogo ordenadas (para capturar qué marca busca el usuario dentro del chat)
  const sortedAllBrands = React.useMemo(() => {
    return [...rawBrands].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [rawBrands]);

  // Marcas con Chat Online activado por Admin (para el selector inicial)
  const enabledBrands = React.useMemo(() => {
    return sortedAllBrands.filter((b) => !!b.chatOnlineEnabled);
  }, [sortedAllBrands]);

  // 1. Cargar marcas y modelos + recuperar sesión activa
  useEffect(() => {
    if (isHiddenRoute) return;

    let latestConfig: ChatOnlineConfig | null = null;
    const unsubGlobalChat = onSnapshot(
      doc(db, 'config', 'chat_online'),
      (snap) => {
        latestConfig = snap.exists() ? (snap.data() as ChatOnlineConfig) : null;
        setGlobalChatEnabled(isChatOnlineCurrentlyActive(latestConfig).isActive);
      },
      () => {}
    );

    const scheduleTimer = setInterval(() => {
      setGlobalChatEnabled(isChatOnlineCurrentlyActive(latestConfig).isActive);
    }, 30000);

    const unsubBrands = onSnapshot(
      collection(db, 'brands'),
      (snap) => {
        setRawBrands(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as BrandChatOption))
        );
      },
      () => {}
    );

    getDocs(collection(db, 'models'))
      .then((mSnap) => {
        setAllModels(
          mSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as ModelChatOption))
        );
      })
      .catch(() => {});

    try {
      const savedChatId = localStorage.getItem('dc_active_chat_id');
      const savedPhone = localStorage.getItem('dc_chat_user_phone');
      const savedName = localStorage.getItem('dc_chat_user_name');
      if (savedChatId) setActiveChatId(savedChatId);
      if (savedPhone) setUserPhone(savedPhone);
      if (savedName && savedName !== 'Interesado 0km') setUserName(savedName);
    } catch {}

    return () => {
      unsubGlobalChat();
      unsubBrands();
      clearInterval(scheduleTimer);
    };
  }, [isHiddenRoute]);

  // 2. Escuchar evento desde fichas del catálogo (`datacar:open-chat`)
  useEffect(() => {
    const handleOpenChatEvent = (ev: Event) => {
      if (!globalChatEnabled) return;
      const customEv = ev as CustomEvent<{
        brandId?: string;
        brandName?: string;
        modelName?: string;
      }>;
      const detail = customEv.detail || {};

      let matchedBrand = sortedAllBrands.find((b) => b.id === detail.brandId);
      if (!matchedBrand && detail.brandName) {
        matchedBrand = sortedAllBrands.find(
          (b) => (b.name || '').toUpperCase() === detail.brandName!.toUpperCase()
        );
      }

      if (matchedBrand) setCaptureBrandId(matchedBrand.id);
      if (detail.modelName) setCaptureModelName(detail.modelName);
      setIsOpen(true);
    };

    window.addEventListener('datacar:open-chat', handleOpenChatEvent);
    return () => window.removeEventListener('datacar:open-chat', handleOpenChatEvent);
  }, [sortedAllBrands, globalChatEnabled]);

  // 2.5 Registrar evento de apertura del widget de Chat para el Funnel (1 vez por sesión de navegador)
  useEffect(() => {
    if (!isOpen || isHiddenRoute) return;
    try {
      const alreadyTracked = sessionStorage.getItem('dc_chat_widget_opened_tracked');
      if (!alreadyTracked) {
        sessionStorage.setItem('dc_chat_widget_opened_tracked', '1');
        addDoc(collection(db, 'chat_telemetry'), {
          eventType: 'widget_opened',
          pathname: pathname || '/',
          createdAt: serverTimestamp(),
        }).catch(() => {});
      }
    } catch {}
  }, [isOpen, isHiddenRoute, pathname]);

  // 3. Suscripción en tiempo real a la sesión de chat activa
  useEffect(() => {
    if (!activeChatId) {
      setActiveSession(null);
      setMessages([]);
      return;
    }

    const unsubSession = onSnapshot(
      doc(db, 'chat_sessions', activeChatId),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = { id: docSnap.id, ...(docSnap.data() as any) };
          if (data.status === 'closed') {
            setActiveChatId(null);
            setActiveSession(null);
            setMessages([]);
            try {
              localStorage.removeItem('dc_active_chat_id');
            } catch {}
            return;
          }
          setActiveSession(data);
          if (data.brandId && data.brandId !== 'datacar' && !captureBrandId) {
            setCaptureBrandId(data.brandId);
          }
        } else {
          setActiveChatId(null);
          try {
            localStorage.removeItem('dc_active_chat_id');
          } catch {}
        }
      },
      () => setActiveChatId(null)
    );

    const qMessages = query(
      collection(db, 'chat_sessions', activeChatId, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const unsubMessages = onSnapshot(
      qMessages,
      (snap) => {
        setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      },
      () => {}
    );

    return () => {
      unsubSession();
      unsubMessages();
    };
  }, [activeChatId]);

  // Limpiar contador de no leídos del usuario al abrir el chat
  useEffect(() => {
    if (isOpen && activeChatId && (Number(activeSession?.unreadUser) || 0) > 0) {
      updateDoc(doc(db, 'chat_sessions', activeChatId), { unreadUser: 0 }).catch(() => {});
    }
  }, [isOpen, activeChatId, activeSession?.unreadUser]);

  // Modelos filtrados para el capturador interactivo dentro del chat
  const captureBrandModels = React.useMemo(() => {
    if (!captureBrandId) return [];
    return allModels
      .filter((m) => m.brandId === captureBrandId)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [allModels, captureBrandId]);

  if (isHiddenRoute || !globalChatEnabled) return null;

  const unreadUserCount = Number(activeSession?.unreadUser) || 0;

  // INICIAR CHAT (Sin pedir marca al inicio; si escribe mensaje directo se usa ese, o la opción predeterminada)
  const handleStartChat = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const cleanPhone = userPhone.trim();
    const cleanName = userName.trim() || 'Interesado 0km';
    const cleanCustom = customInitialMessage.trim();
    const cleanQuestion = cleanCustom || selectedPreset.trim();

    if (!isValidChatPhone(cleanPhone)) {
      setFormError('Ingresá un número de celular válido (ej: 0981 123 456).');
      return;
    }
    if (!cleanQuestion) {
      setFormError('Seleccioná una consulta predeterminada o escribí tu mensaje.');
      return;
    }

    const { sanitizedText, hadPhone } = censorPhoneNumbers(cleanQuestion);

    // Si en su mensaje inicial directo escribió una marca/modelo, lo detectamos automáticamente
    let detectedBrand: BrandChatOption | undefined;
    let detectedModel: ModelChatOption | undefined;
    const upperMsg = sanitizedText.toUpperCase();

    for (const m of allModels) {
      if (m.name && m.name.length >= 3 && upperMsg.includes(m.name.toUpperCase())) {
        detectedModel = m;
        detectedBrand = sortedAllBrands.find((b) => b.id === m.brandId);
        break;
      }
    }
    if (!detectedBrand) {
      for (const b of sortedAllBrands) {
        if (b.name && b.name.length >= 2 && upperMsg.includes(b.name.toUpperCase())) {
          detectedBrand = b;
          break;
        }
      }
    }

    const effectiveBrandId = detectedBrand ? detectedBrand.id : 'datacar';
    const effectiveBrandName = detectedBrand ? detectedBrand.name : 'CENTRAL DATACAR';
    const effectiveModelName = detectedModel ? detectedModel.name : '';

    setStartingChat(true);
    try {
      const chatRef = doc(collection(db, 'chat_sessions'));
      const chatId = chatRef.id;

      // CASO A (Por defecto): Se registra el Lead inmediatamente SOLO PARA ADMIN DATACAR
      const vehicleTitle = `${effectiveBrandName}${effectiveModelName ? ` ${effectiveModelName}` : ''}`.trim();
      const leadDocRef = await addDoc(collection(db, 'leads'), {
        nombre: cleanName,
        telefono: cleanPhone,
        email: 'No proporcionado',
        vehiculo: vehicleTitle,
        marca: effectiveBrandName,
        modelo: effectiveModelName,
        origen: `Chat Online (${sanitizedText}) - Solo Admin`,
        concesionaria_destino: 'Solo Admin DATACAR (Sin autorizar concesionaria)',
        concesionaria_destino_norm: 'SOLO_ADMIN_DATACAR',
        chatId,
        estado: 'Nuevo',
        createdAt: serverTimestamp(),
      });

      await setDoc(chatRef, {
        brandId: effectiveBrandId,
        brandName: effectiveBrandName,
        modelName: effectiveModelName,
        userName: cleanName,
        leadDocId: leadDocRef.id,
        initialTopic: sanitizedText,
        initialQuestionType: cleanCustom ? 'custom' : 'preset',
        presetQuestionLabel: cleanCustom ? '' : selectedPreset,
        vehicleCaptured: !!(detectedBrand && detectedModel),
        promptedDealerContact: false,
        deferredDealerContact: false,
        userMessagesCount: 1,
        status: 'active',
        lastMessage: sanitizedText,
        unreadDealer: 1,
        unreadAdmin: 1,
        unreadUser: 0,
        convertedToLead: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await setDoc(doc(db, 'chat_private_contacts', chatId), {
        chatId,
        leadDocId: leadDocRef.id,
        userName: cleanName,
        userPhone: cleanPhone,
        brandId: effectiveBrandId,
        brandName: effectiveBrandName,
        modelName: effectiveModelName,
        createdAt: serverTimestamp(),
      });

      // 1) Primer mensaje del usuario aparece de inmediato
      await addDoc(collection(db, 'chat_sessions', chatId, 'messages'), {
        senderRole: 'user',
        senderName: cleanName,
        text: sanitizedText,
        hadPhoneCensored: hadPhone,
        createdAt: serverTimestamp(),
      });

      try {
        localStorage.setItem('dc_active_chat_id', chatId);
        localStorage.setItem('dc_chat_user_phone', cleanPhone);
        if (userName.trim()) localStorage.setItem('dc_chat_user_name', userName.trim());
      } catch {}

      if (detectedBrand) setCaptureBrandId(detectedBrand.id);
      if (detectedModel) setCaptureModelName(detectedModel.name);
      setCustomInitialMessage('');
      setActiveChatId(chatId);

      // Notificación por correo a Admin (con link directo al chat) y a Marca
      sendChatInitiatedEmail({
        chatId,
        userName: cleanName,
        userPhone: cleanPhone,
        brandId: effectiveBrandId,
        brandName: effectiveBrandName,
        modelName: effectiveModelName || 'Por definir en chat',
        firstMessage: sanitizedText,
      });

      // 2) DELAY REALISTA DE CHAT ("Escribiendo..." durante 1.8 segundos antes de mostrar la respuesta automática)
      clearPendingBotTimeout();
      const senderLabel = detectedBrand ? `Asesor ${detectedBrand.name}` : 'Asesor DATACAR';
      setTypingSenderLabel(senderLabel);
      setIsBotTyping(true);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);

      botTimeoutRef.current = setTimeout(async () => {
        try {
          const autoReply = buildFirstAutoReply(sanitizedText, effectiveBrandName, effectiveModelName);
          const alreadyHasBothBrandAndModel = !!(detectedBrand && detectedModel);
          await addDoc(collection(db, 'chat_sessions', chatId, 'messages'), {
            senderRole: 'system',
            senderName: senderLabel,
            text: autoReply,
            messageType: alreadyHasBothBrandAndModel ? 'vehicle_captured_prompt' : 'welcome_auto',
            hadPhoneCensored: false,
            createdAt: serverTimestamp(),
          });
          if (alreadyHasBothBrandAndModel) {
            await updateDoc(doc(db, 'chat_sessions', chatId), {
              promptedDealerContact: true,
              updatedAt: serverTimestamp(),
            }).catch(() => {});
          }
        } catch (e) {
          console.error('Error enviando respuesta automática con delay:', e);
        } finally {
          setIsBotTyping(false);
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
      }, 1800);
    } catch (err) {
      console.error('Error al iniciar chat:', err);
      setFormError('No se pudo iniciar el chat. Intentá de nuevo.');
    } finally {
      setStartingChat(false);
    }
  };

  // CAPTURA DE MARCA Y MODELO DENTRO DEL CHAT + SEGUNDA RESPUESTA CON DELAY ("Escribiendo...")
  const handleConfirmVehicleInChat = async () => {
    if (!activeSession || !captureBrandId || savingVehicleCapture) return;
    const brandObj = sortedAllBrands.find((b) => b.id === captureBrandId);
    if (!brandObj) return;

    const chosenBrandName = brandObj.name;
    const chosenModel = captureModelName.trim() || 'Todos los modelos';
    const hasSpecificModel = chosenModel !== 'Todos los modelos';
    const fullVehicleLabel = hasSpecificModel
      ? `${chosenBrandName} ${chosenModel}`
      : chosenBrandName;

    clearPendingBotTimeout();
    setSavingVehicleCapture(true);
    try {
      const displayUserName = activeSession.userName || userName.trim() || 'Interesado 0km';
      const sessionId = activeSession.id;

      // 1) El usuario envía su selección como mensaje en el chat
      await addDoc(collection(db, 'chat_sessions', sessionId, 'messages'), {
        senderRole: 'user',
        senderName: displayUserName,
        text: `🚘 Me interesa: ${fullVehicleLabel}`,
        createdAt: serverTimestamp(),
      });

      // 2) Actualizamos la sesión de chat y el Lead de Admin con la marca y el modelo capturados
      // (Aún NO activamos promptedDealerContact hasta que termine el "Escribiendo...")
      await updateDoc(doc(db, 'chat_sessions', sessionId), {
        brandId: brandObj.id,
        brandName: chosenBrandName,
        modelName: hasSpecificModel ? chosenModel : '',
        vehicleCaptured: true,
        promptedDealerContact: false,
        deferredDealerContact: false,
        userMessagesCount: (Number(activeSession.userMessagesCount) || 1) + 1,
        lastMessage: `🚘 Interés confirmado: ${fullVehicleLabel}`,
        unreadDealer: (Number(activeSession.unreadDealer) || 0) + 1,
        unreadAdmin: (Number(activeSession.unreadAdmin) || 0) + 1,
        updatedAt: serverTimestamp(),
      });

      if (activeSession.leadDocId) {
        await updateDoc(doc(db, 'leads', activeSession.leadDocId), {
          vehiculo: fullVehicleLabel,
          marca: chosenBrandName,
          modelo: hasSpecificModel ? chosenModel : '',
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }

      await updateDoc(doc(db, 'chat_private_contacts', sessionId), {
        brandId: brandObj.id,
        brandName: chosenBrandName,
        modelName: hasSpecificModel ? chosenModel : '',
        updatedAt: serverTimestamp(),
      }).catch(() => {});

      // 3) Simular "Escribiendo..." por 1.5s y recién ahí preguntar si quiere que lo derivemos con la concesionaria oficial
      const senderLabel = `Asesor ${chosenBrandName}`;
      setTypingSenderLabel(senderLabel);
      setIsBotTyping(true);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);

      const promptText = hasSpecificModel
        ? `¡Excelente elección el ${fullVehicleLabel}! 🎯 Ya registramos tu preferencia. ¿Querés que te derivemos ahora mismo con un asesor de la concesionaria de ${chosenBrandName} para que te contacten?`
        : `¡Excelente elección ${chosenBrandName}! 🎯 Ya registramos tu preferencia. ¿Querés que te derivemos ahora mismo con un asesor de la concesionaria de ${chosenBrandName} para que te contacten?`;

      botTimeoutRef.current = setTimeout(async () => {
        try {
          await addDoc(collection(db, 'chat_sessions', sessionId, 'messages'), {
            senderRole: 'system',
            senderName: senderLabel,
            text: promptText,
            messageType: 'vehicle_captured_prompt',
            hadPhoneCensored: false,
            createdAt: serverTimestamp(),
          });
          await updateDoc(doc(db, 'chat_sessions', sessionId), {
            promptedDealerContact: true,
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        } catch {} finally {
          setIsBotTyping(false);
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
      }, 1500);
    } catch (err) {
      console.error('Error guardando marca/modelo en el chat:', err);
    } finally {
      setSavingVehicleCapture(false);
    }
  };

  // Permite al usuario volver a abrir el selector de marca/modelo en cualquier momento
  const handleResetVehicleSelection = async () => {
    if (!activeSession) return;
    clearPendingBotTimeout();
    setCaptureModelName('');
    try {
      await updateDoc(doc(db, 'chat_sessions', activeSession.id), {
        vehicleCaptured: false,
        promptedDealerContact: false,
        deferredDealerContact: false,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('Error al reiniciar selector de vehículo:', err);
    }
  };

  // CASO B: El usuario presiona "Sí" para ser contactado por la concesionaria
  const handleAuthorizeShareWithDealership = async () => {
    if (!activeSession || activeSession.convertedToLead || authorizingDealer) return;
    clearPendingBotTimeout();
    setAuthorizingDealer(true);

    try {
      const sessionId = activeSession.id;
      const savedPhone =
        userPhone ||
        (typeof window !== 'undefined' ? localStorage.getItem('dc_chat_user_phone') || '' : '');
      const displayUserName = activeSession.userName || userName.trim() || 'Interesado 0km';
      const vehicleTitle = `${activeSession.brandName} ${activeSession.modelName || ''}`.trim();

      if (activeSession.leadDocId) {
        await updateDoc(doc(db, 'leads', activeSession.leadDocId), {
          vehiculo: vehicleTitle,
          marca: activeSession.brandName,
          modelo: activeSession.modelName || '',
          origen: 'Chat Online (Autorizado para Concesionaria)',
          concesionaria_destino: `Marca: ${activeSession.brandName}`,
          concesionaria_destino_norm: 'CHAT_AUTORIZADO_MARCA',
          updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, 'leads'), {
          nombre: displayUserName,
          telefono: savedPhone || 'Autorizado desde Chat',
          email: 'No proporcionado',
          vehiculo: vehicleTitle,
          marca: activeSession.brandName,
          modelo: activeSession.modelName || '',
          origen: 'Chat Online (Autorizado para Concesionaria)',
          concesionaria_destino: `Marca: ${activeSession.brandName}`,
          concesionaria_destino_norm: 'CHAT_AUTORIZADO_MARCA',
          estado: 'Nuevo',
          createdAt: serverTimestamp(),
        });
      }

      await updateDoc(doc(db, 'chat_sessions', sessionId), {
        convertedToLead: true,
        deferredDealerContact: false,
        lastMessage: 'Sí, quiero que me contacten.',
        unreadDealer: (Number(activeSession.unreadDealer) || 0) + 1,
        unreadAdmin: (Number(activeSession.unreadAdmin) || 0) + 1,
        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(db, 'chat_sessions', sessionId, 'messages'), {
        senderRole: 'user',
        senderName: displayUserName,
        text: 'Sí',
        createdAt: serverTimestamp(),
      });

      sendLeadNotificationEmail({
        leadName: displayUserName,
        leadPhone: savedPhone,
        vehicleOfInterest: vehicleTitle,
        brandId: activeSession.brandId,
        brandOfInterest: activeSession.brandName,
        marca: activeSession.brandName,
        origen: 'Chat Online (Autorizado para Concesionaria)',
        concesionariaDestino: activeSession.brandName,
      });

      const senderLabel =
        activeSession.brandName && activeSession.brandName !== 'CENTRAL DATACAR'
          ? `Asesor ${activeSession.brandName}`
          : 'Asesor DATACAR';
      setTypingSenderLabel(senderLabel);
      setIsBotTyping(true);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);

      botTimeoutRef.current = setTimeout(async () => {
        try {
          await addDoc(collection(db, 'chat_sessions', sessionId, 'messages'), {
            senderRole: 'system',
            senderName: senderLabel,
            text: 'En breve se contactarán contigo.',
            messageType: 'dealer_authorized_ack',
            hadPhoneCensored: false,
            createdAt: serverTimestamp(),
          });
        } catch {} finally {
          setIsBotTyping(false);
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
      }, 1000);
    } catch (err) {
      console.error('Error autorizando datos con concesionaria:', err);
    } finally {
      setAuthorizingDealer(false);
    }
  };

  // El usuario elige "En otro momento"
  const handleDeferShareWithDealership = async () => {
    if (!activeSession || activeSession.convertedToLead || authorizingDealer) return;
    clearPendingBotTimeout();
    setAuthorizingDealer(true);

    try {
      const sessionId = activeSession.id;
      const displayUserName = activeSession.userName || userName.trim() || 'Interesado 0km';

      await updateDoc(doc(db, 'chat_sessions', sessionId), {
        deferredDealerContact: true,
        promptedDealerContact: false,
        lastMessage: 'En otro momento',
        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(db, 'chat_sessions', sessionId, 'messages'), {
        senderRole: 'user',
        senderName: displayUserName,
        text: 'En otro momento',
        createdAt: serverTimestamp(),
      });

      const senderLabel =
        activeSession.brandName && activeSession.brandName !== 'CENTRAL DATACAR'
          ? `Asesor ${activeSession.brandName}`
          : 'Asesor DATACAR';
      setTypingSenderLabel(senderLabel);
      setIsBotTyping(true);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);

      botTimeoutRef.current = setTimeout(async () => {
        try {
          await addDoc(collection(db, 'chat_sessions', sessionId, 'messages'), {
            senderRole: 'system',
            senderName: senderLabel,
            text: '¡Sin problema! Te invitamos a que sigas navegando por nuestro catálogo en datacarpy.com/catalogo para comparar modelos y precios. Si necesitás algo más, escribinos por acá.',
            messageType: 'dealer_deferred_ack',
            hadPhoneCensored: false,
            createdAt: serverTimestamp(),
          });
        } catch {} finally {
          setIsBotTyping(false);
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
      }, 1000);
    } catch (err) {
      console.error('Error registrando respuesta en otro momento:', err);
    } finally {
      setAuthorizingDealer(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChatId || !activeSession || !messageInput.trim()) return;

    clearPendingBotTimeout();
    const rawText = messageInput.trim();
    const { sanitizedText, hadPhone } = censorPhoneNumbers(rawText);
    if (hadPhone) {
      setCensorWarning(true);
      setTimeout(() => setCensorWarning(false), 6000);
    }

    // Detectar si el usuario escribió el nombre de alguna marca o modelo en su mensaje libre
    let detectedBrand: BrandChatOption | undefined;
    let detectedModel: ModelChatOption | undefined;
    const upperMsg = sanitizedText.toUpperCase();

    for (const m of allModels) {
      if (m.name && m.name.length >= 3 && upperMsg.includes(m.name.toUpperCase())) {
        detectedModel = m;
        detectedBrand = sortedAllBrands.find((b) => b.id === m.brandId);
        break;
      }
    }
    if (!detectedBrand) {
      for (const b of sortedAllBrands) {
        if (b.name && b.name.length >= 2 && upperMsg.includes(b.name.toUpperCase())) {
          detectedBrand = b;
          break;
        }
      }
    }

    try {
      setMessageInput('');
      await addDoc(collection(db, 'chat_sessions', activeChatId, 'messages'), {
        senderRole: 'user',
        senderName: activeSession.userName || 'Interesado 0km',
        text: sanitizedText,
        hadPhoneCensored: hadPhone,
        createdAt: serverTimestamp(),
      });

      const newUserMsgCount = (Number(activeSession.userMessagesCount) || 1) + 1;
      const sessionUpdates: any = {
        lastMessage: sanitizedText,
        userMessagesCount: newUserMsgCount,
        unreadDealer: (Number(activeSession.unreadDealer) || 0) + 1,
        unreadAdmin: (Number(activeSession.unreadAdmin) || 0) + 1,
        updatedAt: serverTimestamp(),
      };

      const lowerMsg = sanitizedText
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

      // CASO 0: El usuario pide consultar "otro modelo", "otra marca", "cambiar marca/modelo" sin mencionar cuál todavía
      const asksForAnotherVehicle =
        /\b(otro modelo|otra marca|otros modelos|otras marcas|cambiar marca|cambiar de marca|cambiar modelo|cambiar de modelo|ver otro|ver otra|otro auto|otro vehiculo|y otro)\b/.test(
          lowerMsg
        );

      if (asksForAnotherVehicle && !detectedBrand && !detectedModel) {
        if (lowerMsg.includes('marca')) {
          setCaptureBrandId('');
        }
        setCaptureModelName('');

        sessionUpdates.vehicleCaptured = false;
        sessionUpdates.promptedDealerContact = false;
        sessionUpdates.deferredDealerContact = false;
        await updateDoc(doc(db, 'chat_sessions', activeChatId), sessionUpdates);

        const senderLabel =
          activeSession.brandName && activeSession.brandName !== 'CENTRAL DATACAR'
            ? `Asesor ${activeSession.brandName}`
            : 'Asesor DATACAR';
        setTypingSenderLabel(senderLabel);
        setIsBotTyping(true);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);

        botTimeoutRef.current = setTimeout(async () => {
          try {
            await addDoc(collection(db, 'chat_sessions', activeChatId, 'messages'), {
              senderRole: 'system',
              senderName: senderLabel,
              text: '¡Claro! Seleccioná o escribinos acá abajo qué otra marca o modelo te gustaría consultar:',
              messageType: 'reset_vehicle_prompt',
              hadPhoneCensored: false,
              createdAt: serverTimestamp(),
            });
          } catch {} finally {
            setIsBotTyping(false);
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
          }
        }, 1100);
        return;
      }

      // CASO 1: El usuario escribió una marca o modelo en el texto (nuevo o diferente al anterior)
      const isNewOrUpdatedVehicle =
        !!detectedBrand &&
        (!activeSession.vehicleCaptured ||
          detectedBrand.name !== activeSession.brandName ||
          (detectedModel && detectedModel.name !== activeSession.modelName));

      if (isNewOrUpdatedVehicle && detectedBrand) {
        const newBrandName = detectedBrand.name;
        const newModelName = detectedModel
          ? detectedModel.name
          : detectedBrand.name === activeSession.brandName
          ? activeSession.modelName || ''
          : '';
        const fullVeh = `${newBrandName}${newModelName ? ` ${newModelName}` : ''}`.trim();

        setCaptureBrandId(detectedBrand.id);
        setCaptureModelName(newModelName);

        sessionUpdates.brandId = detectedBrand.id;
        sessionUpdates.brandName = newBrandName;
        sessionUpdates.modelName = newModelName;
        sessionUpdates.vehicleCaptured = true;
        sessionUpdates.promptedDealerContact = false;
        sessionUpdates.deferredDealerContact = false;

        if (activeSession.leadDocId) {
          updateDoc(doc(db, 'leads', activeSession.leadDocId), {
            vehiculo: fullVeh,
            marca: newBrandName,
            modelo: newModelName,
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }

        updateDoc(doc(db, 'chat_private_contacts', activeChatId), {
          brandId: detectedBrand.id,
          brandName: newBrandName,
          modelName: newModelName,
          updatedAt: serverTimestamp(),
        }).catch(() => {});

        await updateDoc(doc(db, 'chat_sessions', activeChatId), sessionUpdates);

        // Respuesta con delay ("Escribiendo...") que habilita la pregunta de Sí / En otro momento
        setTypingSenderLabel(`Asesor ${newBrandName}`);
        setIsBotTyping(true);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);

        botTimeoutRef.current = setTimeout(async () => {
          try {
            await addDoc(collection(db, 'chat_sessions', activeChatId, 'messages'), {
              senderRole: 'system',
              senderName: `Asesor ${newBrandName}`,
              text: `¡Anotado tu interés en ${fullVeh}! 🎯 ¿Querés que te derivemos con un asesor de la concesionaria de ${newBrandName} para que te contacten?`,
              messageType: 'vehicle_captured_prompt',
              hadPhoneCensored: false,
              createdAt: serverTimestamp(),
            });
            await updateDoc(doc(db, 'chat_sessions', activeChatId), {
              promptedDealerContact: true,
              updatedAt: serverTimestamp(),
            }).catch(() => {});
          } catch {} finally {
            setIsBotTyping(false);
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
          }
        }, 1500);
        return;
      }

      const lastSysMsg = [...messages].reverse().find((m) => m.senderRole !== 'user');
      const dealerOfferCurrentlyActive =
        !!activeSession.promptedDealerContact ||
        lastSysMsg?.messageType === 'vehicle_captured_prompt' ||
        lastSysMsg?.messageType === 'contact_request' ||
        lastSysMsg?.messageType === 'free_text_dealer_prompt';

      // CASO 2: Se le está ofreciendo hablar con la concesionaria y responde "sí" o "en otro momento" por escrito
      if (dealerOfferCurrentlyActive && !activeSession.convertedToLead && !activeSession.deferredDealerContact) {
        const isAffirmative =
          /^(si|sii|sip|claro|dale|ok|bueno|por favor|quiero|me gustaria|contactame|contactenme|autorizo)\b/.test(
            lowerMsg
          );
        const isNegativeOrLater =
          /^(no\b|en otro momento|despues|mas tarde|ahora no|todavia no|solo miro|gracias)/.test(
            lowerMsg
          );

        if (isAffirmative) {
          const savedPhone =
            userPhone ||
            (typeof window !== 'undefined' ? localStorage.getItem('dc_chat_user_phone') || '' : '');
          const displayUserName = activeSession.userName || userName.trim() || 'Interesado 0km';
          const vehicleTitle = `${activeSession.brandName} ${activeSession.modelName || ''}`.trim();

          sessionUpdates.convertedToLead = true;
          sessionUpdates.deferredDealerContact = false;
          await updateDoc(doc(db, 'chat_sessions', activeChatId), sessionUpdates);

          if (activeSession.leadDocId) {
            updateDoc(doc(db, 'leads', activeSession.leadDocId), {
              vehiculo: vehicleTitle,
              marca: activeSession.brandName,
              modelo: activeSession.modelName || '',
              origen: 'Chat Online (Autorizado para Concesionaria)',
              concesionaria_destino: `Marca: ${activeSession.brandName}`,
              concesionaria_destino_norm: 'CHAT_AUTORIZADO_MARCA',
              updatedAt: serverTimestamp(),
            }).catch(() => {});
          }

          sendLeadNotificationEmail({
            leadName: displayUserName,
            leadPhone: savedPhone,
            vehicleOfInterest: vehicleTitle,
            brandId: activeSession.brandId,
            brandOfInterest: activeSession.brandName,
            marca: activeSession.brandName,
            origen: 'Chat Online (Autorizado para Concesionaria)',
            concesionariaDestino: activeSession.brandName,
          });

          const senderLabel =
            activeSession.brandName && activeSession.brandName !== 'CENTRAL DATACAR'
              ? `Asesor ${activeSession.brandName}`
              : 'Asesor DATACAR';
          setTypingSenderLabel(senderLabel);
          setIsBotTyping(true);
          botTimeoutRef.current = setTimeout(async () => {
            try {
              await addDoc(collection(db, 'chat_sessions', activeChatId, 'messages'), {
                senderRole: 'system',
                senderName: senderLabel,
                text: 'En breve se contactarán contigo.',
                messageType: 'dealer_authorized_ack',
                hadPhoneCensored: false,
                createdAt: serverTimestamp(),
              });
            } catch {} finally {
              setIsBotTyping(false);
            }
          }, 1000);
          return;
        }

        if (isNegativeOrLater) {
          sessionUpdates.deferredDealerContact = true;
          sessionUpdates.promptedDealerContact = false;
          await updateDoc(doc(db, 'chat_sessions', activeChatId), sessionUpdates);

          const senderLabel =
            activeSession.brandName && activeSession.brandName !== 'CENTRAL DATACAR'
              ? `Asesor ${activeSession.brandName}`
              : 'Asesor DATACAR';
          setTypingSenderLabel(senderLabel);
          setIsBotTyping(true);
          botTimeoutRef.current = setTimeout(async () => {
            try {
              await addDoc(collection(db, 'chat_sessions', activeChatId, 'messages'), {
                senderRole: 'system',
                senderName: senderLabel,
                text: '¡Sin problema! Te invitamos a que sigas navegando por nuestro catálogo en datacarpy.com/catalogo para comparar modelos y precios. Si necesitás algo más, escribinos por acá.',
                messageType: 'dealer_deferred_ack',
                hadPhoneCensored: false,
                createdAt: serverTimestamp(),
              });
            } catch {} finally {
              setIsBotTyping(false);
            }
          }, 1000);
          return;
        }
      }

      // CASO 3: El usuario sigue haciendo preguntas desde la caja de texto (sin haber elegido vehículo o después de haber puesto "En otro momento")
      if (!activeSession.convertedToLead) {
        sessionUpdates.promptedDealerContact = false;
        sessionUpdates.deferredDealerContact = false;
        await updateDoc(doc(db, 'chat_sessions', activeChatId), sessionUpdates);

        const senderLabel =
          activeSession.brandName && activeSession.brandName !== 'CENTRAL DATACAR'
            ? `Asesor ${activeSession.brandName}`
            : 'Asesor DATACAR';
        setTypingSenderLabel(senderLabel);
        setIsBotTyping(true);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);

        botTimeoutRef.current = setTimeout(async () => {
          try {
            await addDoc(collection(db, 'chat_sessions', activeChatId, 'messages'), {
              senderRole: 'system',
              senderName: senderLabel,
              text: '¡Recibido! Ya tomamos nota de tu consulta. ¿Querés que un asesor se comunique con vos a tu celular para pasarte todos los detalles?',
              messageType: 'free_text_dealer_prompt',
              hadPhoneCensored: false,
              createdAt: serverTimestamp(),
            });
            await updateDoc(doc(db, 'chat_sessions', activeChatId), {
              promptedDealerContact: true,
              updatedAt: serverTimestamp(),
            }).catch(() => {});
          } catch {} finally {
            setIsBotTyping(false);
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
          }
        }, 1500);
      } else {
        await updateDoc(doc(db, 'chat_sessions', activeChatId), sessionUpdates);
      }
    } catch (err) {
      console.error('Error enviando mensaje:', err);
    }
  };

  // El usuario cierra la conversación (la concesionaria NO puede reabrirla)
  const handleCloseConversationByUser = async () => {
    if (!activeSession?.id) return;
    const closingId = activeSession.id;

    try {
      await addDoc(collection(db, 'chat_sessions', closingId, 'messages'), {
        senderRole: 'system',
        senderName: 'Sistema DATACAR',
        text: '🔒 El usuario dio por finalizada esta conversación.',
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'chat_sessions', closingId), {
        status: 'closed',
        closedBy: 'user',
        lastMessage: '🔒 Conversación finalizada por el usuario.',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('Error cerrando chat:', err);
    }

    setActiveChatId(null);
    setActiveSession(null);
    setMessages([]);
    setIsBotTyping(false);
    try {
      localStorage.removeItem('dc_active_chat_id');
    } catch {}
  };

  return (
    <>
      {/* BOTÓN FLOTANTE */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed right-20 bottom-20 lg:bottom-6 z-[45] bg-[#0A1F33] hover:bg-[#00BFFF] text-white hover:text-[#0A1F33] border-2 border-[#00BFFF] px-4 h-14 flex items-center gap-2.5 shadow-xl transition-all cursor-pointer group"
          aria-label="Abrir Chat Online"
        >
          {unreadUserCount > 0 && (
            <span className="absolute -top-2.5 -left-2 bg-[#D93025] text-white text-[9px] font-black uppercase px-2 py-0.5 shadow-md animate-bounce border border-white">
              🔔 {unreadUserCount} nueva{unreadUserCount > 1 ? 's' : ''}
            </span>
          )}
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#1E8E3E] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#1E8E3E]"></span>
          </span>
          <div className="text-left">
            <span
              className="block font-black text-[10px] uppercase tracking-widest leading-none"
              style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}
            >
              {activeSession ? `💬 ${activeSession.brandName}` : '💬 Chat Online 0km'}
            </span>
            <span className="block text-[9px] text-[#00BFFF] group-hover:text-[#0A1F33] font-bold uppercase tracking-wider mt-0.5">
              Consulta rápida • Sin Spam
            </span>
          </div>
        </button>
      )}

      {/* VENTANA MINIMALISTA DE CHAT */}
      {isOpen && (
        <div className="fixed right-4 bottom-4 z-[60] w-[calc(100vw-2rem)] sm:w-[385px] bg-[#FFFFFF] border border-[#D4D4D8] shadow-xl flex flex-col max-h-[85vh] overflow-hidden">
          {/* CABECERA */}
          <div className="bg-[#0A1F33] border-b border-[#00BFFF]/50 px-4 py-3 flex items-center justify-between text-white">
            <div className="min-w-0">
              <h3
                className="font-semibold text-xs tracking-wide truncate"
                style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}
              >
                {activeSession ? `💬 ${activeSession.brandName}` : '💬 Chat Online DATACAR'}
              </h3>
              <p className="text-[10px] text-white/75 font-normal truncate mt-0.5">
                🔒 Tu celular es privado
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {activeSession && (
                <button
                  type="button"
                  onClick={handleCloseConversationByUser}
                  className="border border-white/25 hover:border-[#D93025] hover:bg-[#D93025] text-white/90 hover:text-white text-[10px] font-medium px-2.5 py-1 transition-colors cursor-pointer"
                  title="Cerrar conversación definitivamente"
                >
                  ✕ Cerrar chat
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-white/70 hover:text-white font-medium text-sm px-1.5 cursor-pointer"
                aria-label="Minimizar ventana"
                title="Minimizar"
              >
                —
              </button>
            </div>
          </div>

          {/* VISTA 1: INICIO MINIMALISTA */}
          {!activeSession ? (
            <form onSubmit={handleStartChat} className="p-4 flex flex-col gap-3 overflow-y-auto">
              {formError && (
                <div className="p-2.5 bg-[#FFE6E6] border border-[#D93025]/40 text-[#D93025] text-xs font-medium">
                  {formError}
                </div>
              )}

              {/* 1. Nombre (Opcional) y Celular (Obligatorio) */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-medium text-[#71717A] block mb-1">
                    Nombre (opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Tu nombre"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    className="w-full border border-[#D4D4D8] p-2 text-xs text-[#0A1F33] focus:outline-none focus:border-[#00BFFF]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-[#0A1F33] block mb-1">
                    Celular *
                  </label>
                  <input
                    type="tel"
                    required
                    inputMode="numeric"
                    maxLength={12}
                    placeholder="0981 123 456"
                    value={userPhone}
                    onChange={(e) => setUserPhone(sanitizePhonePY(e.target.value))}
                    className="w-full border border-[#D4D4D8] p-2 text-xs text-[#0A1F33] focus:outline-none focus:border-[#00BFFF]"
                  />
                </div>
              </div>

              {/* 2. Opciones predeterminadas */}
              <div>
                <label className="text-[11px] font-medium text-[#0A1F33] block mb-1.5">
                  Seleccioná tu consulta
                </label>
                <div className="flex flex-col gap-1.5">
                  {PRESET_QUESTIONS.map((q) => {
                    const selected = !customInitialMessage.trim() && selectedPreset === q;
                    return (
                      <button
                        key={q}
                        type="button"
                        onClick={() => {
                          setSelectedPreset(q);
                          setCustomInitialMessage('');
                        }}
                        className={`w-full text-left px-3 py-2 text-xs border transition-colors cursor-pointer ${
                          selected
                            ? 'bg-[#F0F9FF] text-[#0A1F33] border-[#00BFFF] font-medium'
                            : 'bg-white text-[#3A3A3C] border-[#E4E4E7] hover:border-[#00BFFF]'
                        }`}
                      >
                        {q}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. Espacio de texto para mensaje directo opcional */}
              <div>
                <label className="text-[11px] font-medium text-[#71717A] block mb-1">
                  O escribí un mensaje directo
                </label>
                <textarea
                  rows={2}
                  placeholder="Ej: Hola, quiero consultar por el Kia Sportage..."
                  value={customInitialMessage}
                  onChange={(e) => setCustomInitialMessage(e.target.value)}
                  className="w-full border border-[#D4D4D8] p-2 text-xs text-[#0A1F33] focus:outline-none focus:border-[#00BFFF] resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={startingChat}
                className="w-full bg-[#0A1F33] hover:bg-[#00BFFF] hover:text-[#0A1F33] text-white font-semibold text-xs py-3 transition-colors cursor-pointer disabled:opacity-50"
              >
                {startingChat ? 'Iniciando...' : 'Iniciar chat'}
              </button>
            </form>
          ) : (
            /* VISTA 2: CONVERSACIÓN ACTIVA */
            <div className="flex flex-col flex-1 min-h-[380px] max-h-[72vh]">
              {/* Hilo de Mensajes */}
              <div className="flex-1 p-3.5 overflow-y-auto bg-[#FAFAFA] flex flex-col gap-2.5">
                {messages.map((msg) => {
                  const isMe = msg.senderRole === 'user';
                  const isAuthRequest = msg.messageType === 'contact_request';

                  if (isAuthRequest) {
                    return (
                      <div
                        key={msg.id}
                        className="bg-white border border-[#E4E4E7] p-3 text-xs leading-relaxed text-[#3A3A3C]"
                      >
                        <span className="text-[10px] font-medium text-[#71717A] block mb-1">
                          {msg.senderName}
                        </span>
                        <p className="mb-2.5 text-[#0A1F33] font-normal">{msg.text}</p>
                        {!activeSession.convertedToLead && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={handleAuthorizeShareWithDealership}
                              disabled={authorizingDealer}
                              className="bg-[#1E8E3E] hover:bg-[#166d2f] text-white font-medium text-xs py-1.5 px-4 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              Sí
                            </button>
                            <button
                              type="button"
                              onClick={handleDeferShareWithDealership}
                              disabled={authorizingDealer}
                              className="bg-white hover:bg-[#F4F4F5] text-[#52525B] border border-[#D4D4D8] font-normal text-xs py-1.5 px-3.5 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              En otro momento
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col max-w-[88%] ${
                        isMe ? 'self-end items-end' : 'self-start items-start'
                      }`}
                    >
                      <span className="text-[10px] font-normal text-[#71717A] mb-0.5 px-1">
                        {isMe ? 'Vos' : msg.senderName}
                      </span>
                      <div
                        className={`px-3 py-2 text-xs font-normal leading-relaxed border ${
                          isMe
                            ? 'bg-[#0A1F33] border-[#0A1F33] text-white'
                            : 'bg-white border-[#E4E4E7] text-[#27272A]'
                        }`}
                      >
                        {renderMessageWithLinks(msg.text || '')}
                      </div>
                    </div>
                  );
                })}

                {/* INDICADOR "ESCRIBIENDO..." CON DELAY REALISTA */}
                {isBotTyping && (
                  <div className="self-start flex flex-col items-start max-w-[85%]">
                    <span className="text-[10px] font-normal text-[#71717A] mb-0.5 px-1">
                      {typingSenderLabel}
                    </span>
                    <div className="bg-white border border-[#E4E4E7] px-3 py-2 flex items-center gap-2 text-xs text-[#52525B]">
                      <span className="flex gap-1 items-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#00BFFF] animate-bounce" />
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-[#00BFFF] animate-bounce"
                          style={{ animationDelay: '150ms' }}
                        />
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-[#00BFFF] animate-bounce"
                          style={{ animationDelay: '300ms' }}
                        />
                      </span>
                      <span className="text-[11px] font-normal text-[#71717A] italic">
                        Escribiendo...
                      </span>
                    </div>
                  </div>
                )}

                {/* PASO 1: CAPTURADOR RÁPIDO DE MARCA Y MODELO EN EL CHAT (Aparece tras la primera respuesta automática, o cuando el usuario pide consultar otro modelo/marca) */}
                {!isBotTyping &&
                  !activeSession.vehicleCaptured &&
                  !activeSession.promptedDealerContact &&
                  messages.length >= 2 && (
                  <div className="bg-white border border-[#E4E4E7] p-3 flex flex-col gap-2">
                    <span className="text-[11px] font-medium text-[#3A3A3C]">
                      🚘 Indicá la marca y modelo que buscás:
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <select
                        value={captureBrandId}
                        onChange={(e) => {
                          setCaptureBrandId(e.target.value);
                          setCaptureModelName('');
                        }}
                        className="border border-[#D4D4D8] bg-white p-2 text-xs font-normal text-[#0A1F33] focus:outline-none focus:border-[#00BFFF]"
                      >
                        <option value="">Elegir marca...</option>
                        {sortedAllBrands.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>

                      <select
                        value={captureModelName}
                        onChange={(e) => setCaptureModelName(e.target.value)}
                        disabled={!captureBrandId}
                        className="border border-[#D4D4D8] bg-white p-2 text-xs font-normal text-[#0A1F33] disabled:bg-[#F5F5F5] focus:outline-none focus:border-[#00BFFF]"
                      >
                        <option value="">Modelo (Todos)</option>
                        {captureBrandModels.map((m) => (
                          <option key={m.id} value={m.name}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      disabled={!captureBrandId || savingVehicleCapture}
                      onClick={handleConfirmVehicleInChat}
                      className="w-full bg-[#0A1F33] hover:bg-[#00BFFF] hover:text-[#0A1F33] text-white font-medium text-xs py-2 transition-colors disabled:opacity-40 cursor-pointer"
                    >
                      {savingVehicleCapture ? 'Guardando...' : 'Confirmar vehículo'}
                    </button>
                  </div>
                )}

                {/* PASO 2: BLOQUE MINIMALISTA DE CONTACTO ("Sí" / "En otro momento") — Solo aparece DESPUÉS de que el mensaje de pregunta del bot ya se haya publicado */}
                {(() => {
                  const lastSystemMsg = [...messages].reverse().find((m) => m.senderRole !== 'user');
                  const isAwaitingDealerDecision =
                    !isBotTyping &&
                    messages.length >= 2 &&
                    !activeSession.convertedToLead &&
                    !activeSession.deferredDealerContact &&
                    !!activeSession.promptedDealerContact &&
                    lastSystemMsg?.messageType !== 'contact_request';

                  if (isAwaitingDealerDecision) {
                    return (
                      <div className="bg-white border border-[#E4E4E7] p-3 flex flex-col gap-2.5">
                        <p className="text-xs text-[#3A3A3C] font-normal leading-snug">
                          ¿Querés hablar con alguien de la concesionaria o que te contacten a tu celular?
                        </p>
                        <div className="flex items-center flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={handleAuthorizeShareWithDealership}
                            disabled={authorizingDealer}
                            className="bg-[#1E8E3E] hover:bg-[#166d2f] text-white font-medium text-xs py-1.5 px-5 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            Sí
                          </button>
                          <button
                            type="button"
                            onClick={handleDeferShareWithDealership}
                            disabled={authorizingDealer}
                            className="bg-white hover:bg-[#F4F4F5] text-[#52525B] border border-[#D4D4D8] font-normal text-xs py-1.5 px-4 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            En otro momento
                          </button>
                          {activeSession.vehicleCaptured && (
                            <button
                              type="button"
                              onClick={handleResetVehicleSelection}
                              className="text-[11px] text-[#0088CC] hover:underline font-normal ml-auto cursor-pointer"
                            >
                              Consultar otro modelo
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  }

                  if (
                    !isBotTyping &&
                    activeSession.vehicleCaptured &&
                    (activeSession.deferredDealerContact || activeSession.convertedToLead)
                  ) {
                    return (
                      <div className="self-start">
                        <button
                          type="button"
                          onClick={handleResetVehicleSelection}
                          className="bg-white hover:bg-[#F0F9FF] text-[#0A1F33] border border-[#D4D4D8] hover:border-[#00BFFF] text-[11px] font-normal px-3 py-1.5 transition-colors cursor-pointer"
                        >
                          🔄 Consultar otra marca o modelo
                        </button>
                      </div>
                    );
                  }

                  return null;
                })()}

                <div ref={messagesEndRef} />
              </div>

              {censorWarning && (
                <div className="px-3 py-1.5 bg-[#FFFBEB] border-t border-[#F59E0B]/40 text-[#B45309] text-[11px] font-normal">
                  🔒 Los números de teléfono están protegidos en el chat.
                </div>
              )}

              {/* Input para pregunta específica o para escribir la marca/modelo */}
              <form
                onSubmit={handleSendMessage}
                className="p-2.5 bg-white border-t border-[#E4E4E7] flex gap-2"
              >
                <input
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder="Escribí marca, modelo o tu consulta acá..."
                  className="flex-1 border border-[#D4D4D8] px-3 py-2 text-xs font-normal text-[#0A1F33] focus:outline-none focus:border-[#00BFFF]"
                />
                <button
                  type="submit"
                  className="bg-[#00BFFF] hover:bg-[#0A1F33] text-white font-medium text-xs px-4 py-2 transition-colors cursor-pointer"
                >
                  Enviar
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </>
  );
}
