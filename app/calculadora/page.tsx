// app/calculadora/page.tsx
// Server Component: solo define metadata estático. Toda la interactividad
// vive en CalculadoraClient.tsx ('use client').
import type { Metadata } from 'next';
import CalculadoraClient from './CalculadoraClient';

export const metadata: Metadata = {
  title: 'Calculadora de Cuotas 0KM — Simulá tu Financiamiento | Datacar',
  description: 'Calculá la cuota mensual de tu próximo vehículo 0km en Paraguay con tasas reales, o descubrí tu poder de compra según la cuota que podés afrontar.',
};

export default function CalculadoraPage() {
  return <CalculadoraClient />;
}
