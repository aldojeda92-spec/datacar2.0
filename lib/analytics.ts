// lib/analytics.ts
// Instrumentación de embudo. Empuja eventos a `window.dataLayer` (GTM ya está
// cargado en app/layout.tsx vía next/script). Sin dependencias, seguro en SSR
// y si el bloqueador de anuncios mató GTM: nunca tira.
//
// Uso: track('lead_submit_success', { origen: 'Ficha Modelo', canal: 'form' })

type EventParams = Record<string, string | number | boolean | undefined>;

export type FunnelEvent =
  | 'lead_modal_open'
  | 'lead_field_focus'
  | 'lead_submit_attempt'
  | 'lead_submit_error'
  | 'lead_submit_success'
  | 'whatsapp_click'
  | 'calc_run'
  | 'calc_result_view'
  | 'calc_lead_click'
  | 'newsletter_submit'
  | 'comparison_share_submit'
  | 'compare_add';

export function track(event: FunnelEvent, params: EventParams = {}): void {
  if (typeof window === 'undefined') return;
  try {
    const w = window as unknown as { dataLayer?: unknown[] };
    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push({
      event,
      ...Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== '')),
    });
  } catch {
    /* noop: la telemetría nunca debe romper la UI */
  }
}
