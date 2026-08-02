// app/terminos-y-condiciones/page.tsx
// Server Component: solo define metadata estático. Toda la interactividad
// vive en TerminosClient.tsx ('use client').
import type { Metadata } from 'next';
import TerminosClient from './TerminosClient';

export const metadata: Metadata = {
  title: 'Términos y Condiciones | Datacar',
  description: 'Términos y condiciones de uso de la plataforma Datacar, inteligencia de mercado automotriz en Paraguay.',
};

export default function TerminosCondicionesPage() {
  return <TerminosClient />;
}
