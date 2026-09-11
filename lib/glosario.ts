// lib/glosario.ts
// Diccionario de siglas tecnicas del rubro automotor. Se usa para poblar
// tooltips y el bloque "Que significan estas siglas" en las fichas y el
// recomendador, donde el comprador novato ve terminos como CVT, ADAS o PHEV
// sin ninguna explicacion.

export const GLOSARIO: Record<string, string> = {
  // Transmision
  CVT: 'Caja automática de variación continua: no tiene marchas fijas, entrega la aceleración de forma suave y constante.',
  DCT: 'Caja automática de doble embrague: cambia de marcha muy rápido, con sensación deportiva.',
  DHT: 'Transmisión híbrida dedicada: caja pensada para trabajar junto al motor eléctrico.',
  AT: 'Caja automática convencional (con convertidor de par).',
  MT: 'Caja manual (embrague y palanca de cambios).',
  AMT: 'Caja manual automatizada: es una manual que el auto opera solo.',
  // Motorizacion
  EV: 'Vehículo 100% eléctrico: se enchufa para cargar, no usa combustible.',
  BEV: 'Vehículo 100% eléctrico a batería (igual que EV).',
  HEV: 'Híbrido convencional: combina motor naftero y eléctrico, no se enchufa; se recarga solo al andar.',
  MHEV: 'Micro híbrido: un pequeño sistema eléctrico asiste al motor naftero para gastar menos combustible.',
  PHEV: 'Híbrido enchufable: se puede cargar en un enchufe y hacer algunos kilómetros solo en modo eléctrico.',
  REEV: 'Eléctrico de autonomía extendida: se mueve siempre con el motor eléctrico; el motor a combustión solo genera electricidad.',
  EREV: 'Eléctrico de autonomía extendida (igual que REEV).',
  // Asistencias y seguridad
  ADAS: 'Asistencias avanzadas a la conducción: frenado automático de emergencia, mantenimiento de carril, control crucero adaptativo y similares.',
  ABS: 'Sistema antibloqueo de frenos: evita que las ruedas se traben al frenar fuerte.',
  ESP: 'Control electrónico de estabilidad: corrige el auto si empieza a derrapar.',
  ESC: 'Control electrónico de estabilidad (igual que ESP).',
  TCS: 'Control de tracción: evita que las ruedas patinen al acelerar.',
  ISOFIX: 'Anclajes estandarizados para fijar la silla infantil de forma segura.',
  TPMS: 'Monitor de presión de neumáticos: avisa si una goma pierde aire.',
  // Traccion
  AWD: 'Tracción integral: el auto reparte la fuerza a las cuatro ruedas de forma automática.',
  FWD: 'Tracción delantera: mueven las ruedas de adelante.',
  RWD: 'Tracción trasera: mueven las ruedas de atrás.',
};

// Devuelve las siglas del glosario que aparecen como palabra completa en el
// texto (o textos) recibidos, en orden alfabetico y sin repetir.
export function siglasEnTexto(...textos: (string | null | undefined)[]): string[] {
  const hay = textos.filter(Boolean).join(' ').toUpperCase();
  return Object.keys(GLOSARIO)
    .filter(sigla => new RegExp(`(^|[^A-Z0-9])${sigla}([^A-Z0-9]|$)`).test(hay))
    .sort();
}
