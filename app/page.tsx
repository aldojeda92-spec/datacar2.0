// app/page.tsx
// Server Component: solo define metadata estático. Toda la interactividad
// vive en HomeClient.tsx ('use client').
import type { Metadata } from 'next';
import HomeClient from './HomeClient';

export const metadata: Metadata = {
  title: 'Datacar | Comparador de Precios y Catálogo de 0KM en Paraguay',
  description: 'Visitá todas las concesionarias de Paraguay en un solo lugar. Comparación transparente de precios, ficha técnica, financiamiento y recomendador inteligente de vehículos 0km.',
};

export default function HomePage() {
  return <HomeClient />;
}
