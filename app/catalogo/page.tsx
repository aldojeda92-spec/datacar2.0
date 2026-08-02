// app/catalogo/page.tsx
// Server Component: solo define metadata estático. Toda la interactividad
// vive en CatalogoClient.tsx ('use client').
import type { Metadata } from 'next';
import CatalogoClient from './CatalogoClient';

export const metadata: Metadata = {
  title: 'Catálogo de Vehículos 0KM en Paraguay | Datacar',
  description: 'Explorá y filtrá el catálogo completo de vehículos 0km disponibles en Paraguay: desde hatchbacks compactos hasta SUVs y pick-ups, con precios de todas las concesionarias oficiales en un solo lugar.',
};

export default function CatalogoPage() {
  return <CatalogoClient />;
}
