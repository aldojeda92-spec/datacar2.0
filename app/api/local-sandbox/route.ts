import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

/**
 * Sandboxing local para desarrollo en `localhost` (GET / POST /api/local-sandbox).
 *
 * Permite que todos los experimentos de escrituras hechas desde `localhost` (Chats Online,
 * Toggles de Chat por Marca, Leads de prueba, etc.) se almacenen en un archivo JSON local
 * (`.local-sandbox-db.json` ignorado por Git) sin ensuciar la base de datos de producción
 * en Firebase (`datacar2.0`), y sin depender de que las reglas de Firestore nuevas hayan sido
 * desplegadas a producción antes de probar en `localhost`.
 */

const SANDBOX_FILE = path.join(process.cwd(), '.local-sandbox-db.json');

export interface LocalSandboxState {
  brandChatOverrides: Record<string, boolean>; // brandId -> chatOnlineEnabled
  chatSessions: any[];
  chatMessages: Record<string, any[]>; // chatId -> messages[]
  chatPrivateContacts: Record<string, any>; // chatId -> { userName, userPhone, ... }
  sandboxLeads: any[];
}

const DEFAULT_STATE: LocalSandboxState = {
  brandChatOverrides: {},
  chatSessions: [],
  chatMessages: {},
  chatPrivateContacts: {},
  sandboxLeads: [],
};

function readSandbox(): LocalSandboxState {
  try {
    if (!fs.existsSync(SANDBOX_FILE)) {
      fs.writeFileSync(SANDBOX_FILE, JSON.stringify(DEFAULT_STATE, null, 2), 'utf-8');
      return { ...DEFAULT_STATE };
    }
    const raw = fs.readFileSync(SANDBOX_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      brandChatOverrides: parsed.brandChatOverrides || {},
      chatSessions: Array.isArray(parsed.chatSessions) ? parsed.chatSessions : [],
      chatMessages: parsed.chatMessages || {},
      chatPrivateContacts: parsed.chatPrivateContacts || {},
      sandboxLeads: Array.isArray(parsed.sandboxLeads) ? parsed.sandboxLeads : [],
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function writeSandbox(state: LocalSandboxState) {
  try {
    fs.writeFileSync(SANDBOX_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error guardando .local-sandbox-db.json:', err);
  }
}

export async function GET() {
  const state = readSandbox();
  return NextResponse.json(state);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, payload } = body || {};
    const state = readSandbox();
    const nowIso = new Date().toISOString();

    if (action === 'toggle_brand_chat') {
      const { brandId, enabled } = payload || {};
      if (brandId) {
        state.brandChatOverrides[brandId] = !!enabled;
        writeSandbox(state);
      }
      return NextResponse.json({ success: true, state });
    }

    if (action === 'create_chat_session') {
      const {
        chatId,
        brandId,
        brandName,
        modelName,
        userName,
        userPhone,
        firstMessage,
        hadPhoneCensored,
        isDatacarFallback,
      } = payload || {};

      const id = chatId || `local_chat_${Date.now()}`;
      const newSession = {
        id,
        brandId: brandId || 'datacar',
        brandName: brandName || 'DATACAR ASESORÍA',
        modelName: modelName || '',
        userName,
        isDatacarFallback: !!isDatacarFallback,
        status: 'active',
        lastMessage: firstMessage,
        unreadDealer: 1,
        unreadAdmin: 1,
        unreadUser: 0,
        convertedToLead: false,
        isLocalSandbox: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      state.chatSessions = [newSession, ...state.chatSessions.filter((s) => s.id !== id)];
      state.chatPrivateContacts[id] = {
        chatId: id,
        userName,
        userPhone,
        brandId: brandId || 'datacar',
        brandName: brandName || 'DATACAR ASESORÍA',
        modelName: modelName || '',
        createdAt: nowIso,
      };
      state.chatMessages[id] = [
        {
          id: `msg_${Date.now()}`,
          senderRole: 'user',
          senderName: userName,
          text: firstMessage,
          hadPhoneCensored: !!hadPhoneCensored,
          createdAt: nowIso,
        },
      ];

      writeSandbox(state);
      return NextResponse.json({ success: true, chatId: id, session: newSession, state });
    }

    if (action === 'send_chat_message') {
      const { chatId, senderRole, senderName, text, hadPhoneCensored } = payload || {};
      if (!chatId || !text) {
        return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
      }
      const msg = {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        senderRole: senderRole || 'user',
        senderName: senderName || 'Usuario',
        text,
        hadPhoneCensored: !!hadPhoneCensored,
        createdAt: nowIso,
      };
      if (!state.chatMessages[chatId]) state.chatMessages[chatId] = [];
      state.chatMessages[chatId].push(msg);

      state.chatSessions = state.chatSessions.map((s) => {
        if (s.id !== chatId) return s;
        return {
          ...s,
          lastMessage: text,
          unreadDealer: senderRole === 'user' ? (s.unreadDealer || 0) + 1 : 0,
          unreadAdmin: senderRole === 'user' ? (s.unreadAdmin || 0) + 1 : 0,
          unreadUser: senderRole !== 'user' ? (s.unreadUser || 0) + 1 : 0,
          updatedAt: nowIso,
        };
      });

      writeSandbox(state);
      return NextResponse.json({ success: true, message: msg, state });
    }

    if (action === 'mark_chat_read') {
      const { chatId, role } = payload || {};
      state.chatSessions = state.chatSessions.map((s) => {
        if (s.id !== chatId) return s;
        if (role === 'dealer') return { ...s, unreadDealer: 0 };
        if (role === 'admin') return { ...s, unreadAdmin: 0 };
        return { ...s, unreadUser: 0 };
      });
      writeSandbox(state);
      return NextResponse.json({ success: true, state });
    }

    if (action === 'toggle_chat_status') {
      const { chatId, status } = payload || {};
      state.chatSessions = state.chatSessions.map((s) =>
        s.id === chatId ? { ...s, status, updatedAt: nowIso } : s
      );
      writeSandbox(state);
      return NextResponse.json({ success: true, state });
    }

    if (action === 'convert_chat_to_lead') {
      const { chatId, leadData } = payload || {};
      state.chatSessions = state.chatSessions.map((s) =>
        s.id === chatId ? { ...s, convertedToLead: true, updatedAt: nowIso } : s
      );
      if (state.chatMessages[chatId]) {
        state.chatMessages[chatId].push({
          id: `msg_${Date.now()}`,
          senderRole: 'user',
          senderName: leadData?.nombre || 'Usuario',
          text: '📋 He autorizado el formulario de contacto para que un asesor se comunique conmigo.',
          createdAt: nowIso,
        });
      }
      if (leadData) {
        state.sandboxLeads = [
          {
            id: `sandbox_lead_${Date.now()}`,
            ...leadData,
            isLocalSandbox: true,
            createdAt: nowIso,
          },
          ...state.sandboxLeads,
        ];
      }
      writeSandbox(state);
      return NextResponse.json({ success: true, state });
    }

    if (action === 'create_sandbox_lead') {
      const { leadData } = payload || {};
      if (leadData) {
        const newLead = {
          id: `sandbox_lead_${Date.now()}`,
          ...leadData,
          isLocalSandbox: true,
          createdAt: nowIso,
        };
        state.sandboxLeads = [newLead, ...state.sandboxLeads];
        writeSandbox(state);
        return NextResponse.json({ success: true, lead: newLead, state });
      }
      return NextResponse.json({ error: 'Datos de lead vacíos' }, { status: 400 });
    }

    if (action === 'clear_sandbox') {
      writeSandbox(DEFAULT_STATE);
      return NextResponse.json({ success: true, state: DEFAULT_STATE });
    }

    return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error en sandbox' }, { status: 500 });
  }
}
