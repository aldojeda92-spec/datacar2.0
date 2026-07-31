// lib/finance.ts
// Sistema de amortización francés usado en calculadora, recomendador y fichas de modelo/versión.
// Antes estaba duplicado literalmente en los 4 lugares; esta es la única fuente de verdad.

export interface FinancialConfig {
  tasa_anual: number;
  gastos_admin: number;
  seguro_vida: number;
}

// Fallback usado si config/financial no existe todavía en Firestore.
export const DEFAULT_FINANCIAL_CONFIG: FinancialConfig = {
  tasa_anual: 0.09,
  gastos_admin: 0.022,
  seguro_vida: 0.005,
};

function retencionTotal(config: FinancialConfig): number {
  return config.gastos_admin + config.seguro_vida;
}

function tasaMensual(config: FinancialConfig): number {
  return config.tasa_anual / 12;
}

/** Precio del vehículo -> cuota mensual (sistema francés, absorbiendo retenciones). */
export function calcularCuotaFrancesa(
  precio: number,
  entrega: number,
  plazoMeses: number,
  config: FinancialConfig
): number {
  const retencion_total = retencionTotal(config);
  const r_mensual = tasaMensual(config);
  const principalBruto = (precio - entrega) / (1 - retencion_total);
  return (principalBruto * (r_mensual * Math.pow(1 + r_mensual, plazoMeses))) / (Math.pow(1 + r_mensual, plazoMeses) - 1);
}

/** Cuota mensual objetivo -> poder de compra total (préstamo neto + entrega). */
export function calcularPresupuestoInverso(
  cuotaObjetivo: number,
  entrega: number,
  plazoMeses: number,
  config: FinancialConfig
): number {
  const retencion_total = retencionTotal(config);
  const r_mensual = tasaMensual(config);
  const prestamoBruto = (cuotaObjetivo * (1 - Math.pow(1 + r_mensual, -plazoMeses))) / r_mensual;
  const dineroNeto = prestamoBruto * (1 - retencion_total);
  return dineroNeto + entrega;
}
