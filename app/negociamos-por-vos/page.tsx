// app/negociamos-por-vos/page.tsx
// Server Component: solo define metadata estático. Toda la interactividad
// vive en NegociamosClient.tsx ('use client').
import type { Metadata } from 'next';
import NegociamosClient from './NegociamosClient';

export const metadata: Metadata = {
  title: 'Negociamos por vos — Compra Asistida de tu 0KM | Datacar',
  description: 'Dejá que nuestro equipo negocie el mejor precio con las concesionarias por vos. Ahorrá tiempo y dinero en la compra de tu próximo vehículo 0km en Paraguay.',
};

export default function NegociamosPorVosPage() {
  return <NegociamosClient />;
}
