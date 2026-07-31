// lib/compareStorage.ts
// Persistencia en localStorage del dock flotante "agregar a comparar", compartida
// por la ficha de modelo, la ficha de versión y el comparador. Antes cada página
// leía/escribía la key 'datacar_compare' a mano de forma redundante. Este helper
// SOLO centraliza el acceso a localStorage — la lógica de UI (límite de 3, alerts,
// reload vs no) sigue viviendo en cada página porque difiere entre ellas a propósito.

export interface CompareVehicle {
  id: string;
  name: string;
  price: number;
}

export const COMPARE_STORAGE_KEY = 'datacar_compare';

export function getStoredCompareList(): CompareVehicle[] {
  try {
    return JSON.parse(localStorage.getItem(COMPARE_STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveCompareList(list: CompareVehicle[]): void {
  localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(list));
}

export function clearStoredCompareList(): void {
  localStorage.removeItem(COMPARE_STORAGE_KEY);
}
