// lib/faqData.ts
// FAQ compartida entre la ficha de modelo y la ficha de versión (antes duplicada
// palabra por palabra en ambos archivos). Las FAQ de otras páginas (home, catálogo,
// negociamos-por-vos, /faq) tienen contenido genuinamente distinto y no se tocan.

export interface FaqItem {
  q: string;
  a: string;
}

export const FAQ_FICHA_VEHICULO: FaqItem[] = [
  { q: '¿Los precios reflejados son finales?', a: 'Los valores publicados son precios de lista oficiales sugeridos por los representantes en Paraguay. No incluyen gastos de patentamiento ni fletes internos.' },
  { q: '¿Puedo financiar este modelo?', a: 'Sí. Trabajamos con las principales entidades bancarias del país. Al usar nuestra calculadora o contactar a un asesor, te gestionamos la pre-aprobación con tasas preferenciales.' },
  { q: '¿Toman mi vehículo usado como parte de pago?', a: 'El servicio de toma de usados depende de la concesionaria oficial que disponga del stock. Nuestro equipo se encarga de negociar la mejor cotización para tu unidad actual.' },
  { q: '¿Qué incluye el servicio "Negociamos por vos"?', a: 'Es un servicio premium donde nosotros interactuamos con las concesionarias. Buscamos el stock, negociamos el precio final, gestionamos el papeleo y te entregamos el 0km, ahorrándote tiempo y dinero.' },
];
