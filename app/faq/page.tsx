// app/faq/page.tsx
// Server Component: solo define metadata estático. Toda la interactividad
// vive en FaqClient.tsx ('use client').
import type { Metadata } from 'next';
import FaqClient from './FaqClient';

export const metadata: Metadata = {
  title: 'Preguntas Frecuentes | Datacar',
  description: 'Resolvé tus dudas sobre cómo funciona Datacar: comparación de precios, financiamiento, garantías y el proceso de compra de vehículos 0km en Paraguay.',
};

export default function FAQPage() {
  return <FaqClient />;
}
