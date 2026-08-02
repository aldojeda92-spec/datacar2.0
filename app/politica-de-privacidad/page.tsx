// app/politica-de-privacidad/page.tsx
// Server Component: solo define metadata estático. Toda la interactividad
// vive en PoliticaClient.tsx ('use client').
import type { Metadata } from 'next';
import PoliticaClient from './PoliticaClient';

export const metadata: Metadata = {
  title: 'Política de Privacidad | Datacar',
  description: 'Política de privacidad y tratamiento de datos personales de Datacar, plataforma de inteligencia de mercado automotriz en Paraguay.',
};

export default function PoliticaPrivacidadPage() {
  return <PoliticaClient />;
}
