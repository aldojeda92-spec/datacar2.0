/**
 * NOTA ARQUITECTÓNICA IMPORTANTE:
 * `localhost` ya apunta SIEMPRE y por defecto al proyecto Firebase de PRUEBA (`gestion-taller-e578f`)
 * gracias a `.env.local` y al candado en `lib/firebase.ts`.
 *
 * Por lo tanto, todas las operaciones de Firestore en `localhost` operan de forma nativa
 * contra la base de datos de PRUEBA (`gestion-taller-e578f`) y NUNCA contra producción (`datacar2-0`).
 * Mantenemos `isLocalhostRuntime()` en `false` para que Firestore (`gestion-taller-e578f`)
 * maneje todo en tiempo real de punta a punta.
 */

export function isLocalhostRuntime(): boolean {
  return false;
}

export async function fetchLocalSandboxState(): Promise<{
  brandChatOverrides: Record<string, boolean>;
  chatSessions: any[];
  chatMessages: Record<string, any[]>;
  chatPrivateContacts: Record<string, any>;
  sandboxLeads: any[];
}> {
  return {
    brandChatOverrides: {},
    chatSessions: [],
    chatMessages: {},
    chatPrivateContacts: {},
    sandboxLeads: [],
  };
}

export async function postLocalSandboxAction(_action: string, _payload?: any): Promise<any> {
  return { success: true };
}
