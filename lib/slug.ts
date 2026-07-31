// lib/slug.ts
// Usado por el panel admin y el portal de concesionarias para generar IDs
// deterministas de Firestore a partir de nombres (ej. al inyectar un CSV).

export const generarSlug = (texto: string): string =>
  texto?.toString().toLowerCase().replace(/[\s_]+/g, '-').replace(/[^\w-]+/g, '') || '';
