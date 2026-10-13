// lib/attributeScoring.ts
import { normalizeCombustible } from './combustible';

export interface AttributeWeights {
  motor: number;       // 0 - 100 (%)
  seguridad: number;   // 0 - 100 (%)
  confort: number;     // 0 - 100 (%) (Tecnología / Confort)
  economia: number;    // 0 - 100 (%)
}

export interface VehicleScoreResult {
  vehicleId: string;
  motorScore: number;
  seguridadScore: number;
  confortScore: number;
  economiaScore: number;
  totalScore: number;
  breakdown: {
    motorLabel: string;
    seguridadLabel: string;
    confortLabel: string;
    economiaLabel: string;
  };
}

/**
 * Evalúa el puntaje del motor (0-100) en base a potencia, cilindrada y tecnología de propulsión.
 */
export function calculateMotorScore(v: any): { score: number; label: string } {
  const motorRaw = (v?.specs?.motor || '').toLowerCase();
  const traccionRaw = (v?.specs?.traccion || '').toLowerCase();
  const transmisionRaw = (v?.specs?.transmision || '').toLowerCase();
  const combustibleNorm = normalizeCombustible(v?.specs?.combustible);

  let base = 55;
  let label = 'Estándar';

  // Si es eléctrico puro, entrega torque instantáneo y aceleración superior
  if (combustibleNorm === 'EV') {
    base = 92;
    label = 'Propulsión Eléctrica (Torque instantáneo)';
  } else if (combustibleNorm === 'PHEV' || combustibleNorm === 'REEV') {
    base = 86;
    label = 'Híbrido Enchufable (Alta potencia combinada)';
  } else if (combustibleNorm === 'HEV') {
    base = 78;
    label = 'Híbrido (Asistencia eléctrica)';
  } else if (motorRaw.includes('v8') || motorRaw.includes('v6') || motorRaw.includes('twin turbo') || motorRaw.includes('bi-turbo')) {
    base = 95;
    label = 'Motor V6/V8 de Alto Rendimiento';
  } else if (motorRaw.includes('turbo') || motorRaw.includes('t-gdi') || motorRaw.includes('tsi') || motorRaw.includes('ecoboost')) {
    base = 82;
    label = 'Motor Turboalimentado';
  } else if (motorRaw.includes('2.5') || motorRaw.includes('2.4') || motorRaw.includes('2.0')) {
    base = 72;
    label = 'Motor 2.0L+ Aspirado';
  } else if (motorRaw.includes('1.6') || motorRaw.includes('1.5')) {
    base = 60;
    label = 'Motor 1.5L / 1.6L';
  } else if (motorRaw.includes('1.0') || motorRaw.includes('1.2')) {
    base = 50;
    label = 'Motor Compacto 1.0L / 1.2L';
  }

  // Bonificación por tracción integral AWD / 4WD
  if (traccionRaw.includes('awd') || traccionRaw.includes('4wd') || traccionRaw.includes('4x4') || traccionRaw.includes('integral')) {
    base += 5;
  }

  // Bonificación por caja automática moderna
  if (transmisionRaw.includes('at') || transmisionRaw.includes('autom') || transmisionRaw.includes('dct') || transmisionRaw.includes('cvt')) {
    base += 3;
  }

  return {
    score: Math.min(100, Math.max(20, base)),
    label
  };
}

/**
 * Evalúa el puntaje de seguridad (0-100) en base a airbags y asistencias activas ADAS.
 */
export function calculateSeguridadScore(v: any): { score: number; label: string } {
  let airbagsScore = 15;
  const numAirbags = Number(v?.specs?.airbags) || 0;

  if (numAirbags >= 7) airbagsScore = 45;
  else if (numAirbags === 6) airbagsScore = 40;
  else if (numAirbags >= 4) airbagsScore = 28;
  else if (numAirbags >= 2) airbagsScore = 18;

  // ADAS (Asistencias avanzadas a la conducción)
  let adasScore = 0;
  const adasList: string[] = Array.isArray(v?.features?.adas) 
    ? v.features.adas.filter((a: string) => a && a.trim() !== '' && !a.toLowerCase().includes('sin adas'))
    : [];

  if (adasList.length >= 4) {
    adasScore = 45;
  } else if (adasList.length >= 2) {
    adasScore = 32;
  } else if (adasList.length === 1) {
    adasScore = 20;
  }

  // Cámaras / Sensores
  let camScore = 5;
  const camRaw = (v?.specs?.camaras || '').toLowerCase();
  if (camRaw.includes('360') || camRaw.includes('sensores delanteros y traseros')) {
    camScore = 10;
  } else if (camRaw.includes('retroceso') || camRaw.includes('reversa') || camRaw.includes('cámara')) {
    camScore = 7;
  }

  const finalScore = Math.min(100, Math.max(15, airbagsScore + adasScore + camScore));
  
  let label = `${numAirbags > 0 ? `${numAirbags} Airbags` : 'Airbags estándar'}`;
  if (adasList.length > 0) {
    label += ` • Con Paquete ADAS (${adasList.length})`;
  } else {
    label += ' • Sin ADAS estructural';
  }

  return {
    score: finalScore,
    label
  };
}

/**
 * Evalúa Tecnología y Confort (0-100): Techo panorámico, asientos de cuero, pantalla y conectividad.
 */
export function calculateConfortScore(v: any): { score: number; label: string } {
  let score = 20;
  const featuresDesc: string[] = [];

  // Techo panorámico
  const techo = (v?.features?.techo_panoramico || '').toLowerCase();
  if (techo && !techo.includes('no') && !techo.includes('sin') && !techo.includes('ningun')) {
    score += 25;
    featuresDesc.push('Techo Panorámico');
  }

  // Asientos de cuero
  const cuero = (v?.features?.asiento_cuero || '').toLowerCase();
  if (cuero && (cuero.includes('sí') || cuero.includes('si') || cuero.includes('cuero') || cuero.includes('piel') || cuero.includes('ecocuero'))) {
    score += 20;
    featuresDesc.push('Tapizado de Cuero');
  }

  // Pantalla multimedia
  const pantallaPulgadas = Number(v?.specs?.tamanho_pantalla) || 0;
  if (pantallaPulgadas >= 12) {
    score += 20;
    featuresDesc.push(`Pantalla ${pantallaPulgadas}"`);
  } else if (pantallaPulgadas >= 10) {
    score += 16;
    featuresDesc.push(`Pantalla ${pantallaPulgadas}"`);
  } else if (pantallaPulgadas >= 8) {
    score += 12;
  } else if (pantallaPulgadas > 0) {
    score += 8;
  }

  // Conectividad (CarPlay / Android Auto)
  const conectividad = (v?.specs?.conectividad || '').toLowerCase();
  if (conectividad.includes('carplay') || conectividad.includes('android auto') || conectividad.includes('inalámbrico')) {
    score += 15;
    featuresDesc.push('Apple CarPlay / Android Auto');
  }

  return {
    score: Math.min(100, Math.max(20, score)),
    label: featuresDesc.length > 0 ? featuresDesc.slice(0, 3).join(' • ') : 'Equipamiento base'
  };
}

/**
 * Evalúa Economía y Eficiencia (0-100):
 * Jerarquía estricta solicitada: EV > PHEV > HEV > Nafta > Diésel.
 * Se complementa con la ventaja de precio relativo entre los vehículos comparados.
 */
export function calculateEconomiaScore(v: any, allVehicles: any[]): { score: number; label: string } {
  let canon = normalizeCombustible(v?.specs?.combustible);
  const motorDesc = `${v?.specs?.motor || ''} ${v?.specs?.alimentacion || ''}`.toUpperCase();
  if ((canon === 'NAFTA' || !canon) && (motorDesc.includes('MHEV') || motorDesc.includes('MILD HYBRID') || motorDesc.includes('48V') || motorDesc.includes('MICRO HIBRID'))) {
    canon = 'MHEV';
  }
  
  // Jerarquía estricta de eficiencia: EV > PHEV > HEV > MHEV > Nafta > Diésel
  let fuelScore = 24;
  let fuelName = 'Nafta';

  switch (canon) {
    case 'EV':
      fuelScore = 60;
      fuelName = '100% Eléctrico (EV)';
      break;
    case 'PHEV':
    case 'REEV':
      fuelScore = 50;
      fuelName = 'Híbrido Enchufable (PHEV)';
      break;
    case 'HEV':
      fuelScore = 42;
      fuelName = 'Híbrido Convencional (HEV)';
      break;
    case 'MHEV':
      fuelScore = 32;
      fuelName = 'Micro Híbrido (MHEV)';
      break;
    case 'NAFTA':
    case 'FLEX':
      fuelScore = 24;
      fuelName = 'Combustión Nafta';
      break;
    case 'DIESEL':
      fuelScore = 20;
      fuelName = 'Diésel';
      break;
    default:
      fuelScore = 22;
      fuelName = 'Combustible Convencional';
      break;
  }

  // Ventaja de precio relativo (hasta 40 pts)
  let priceScore = 25;
  const prices = allVehicles.map(veh => Number(veh.price) || 0).filter(p => p > 0);
  if (prices.length > 1) {
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const thisPrice = Number(v.price) || minPrice;

    if (maxPrice > minPrice) {
      // El de menor precio obtiene los 40 puntos completos
      const ratio = (maxPrice - thisPrice) / (maxPrice - minPrice);
      priceScore = Math.round(10 + (30 * ratio));
    } else {
      priceScore = 25;
    }
  }

  const finalScore = Math.min(100, Math.max(20, fuelScore + priceScore));

  return {
    score: finalScore,
    label: `${fuelName} • US$ ${(Number(v.price) || 0).toLocaleString()}`
  };
}

/**
 * Calcula el match total ponderado para una lista de vehículos según los sliders fijados.
 */
export function computeAttributeScores(vehicles: any[], weights: AttributeWeights): VehicleScoreResult[] {
  const totalWeight = weights.motor + weights.seguridad + weights.confort + weights.economia;

  return vehicles.map(v => {
    const motor = calculateMotorScore(v);
    const seguridad = calculateSeguridadScore(v);
    const confort = calculateConfortScore(v);
    const economia = calculateEconomiaScore(v, vehicles);

    let total = 0;
    if (totalWeight === 0) {
      // Si todos los sliders están en 0%, se promedian equitativamente
      total = Math.round((motor.score + seguridad.score + confort.score + economia.score) / 4);
    } else {
      total = Math.round(
        (motor.score * weights.motor +
         seguridad.score * weights.seguridad +
         confort.score * weights.confort +
         economia.score * weights.economia) / totalWeight
      );
    }

    return {
      vehicleId: v.id,
      motorScore: motor.score,
      seguridadScore: seguridad.score,
      confortScore: confort.score,
      economiaScore: economia.score,
      totalScore: total,
      breakdown: {
        motorLabel: motor.label,
        seguridadLabel: seguridad.label,
        confortLabel: confort.label,
        economiaLabel: economia.label,
      }
    };
  });
}
