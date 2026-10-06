import type { Metadata } from 'next';
import BlogClient from './BlogClient';

export const metadata: Metadata = {
  title: 'Blog Automotriz & Guías de Compra en Paraguay | DATACAR',
  description: 'Análisis de precios, comparativas reales, guías de financiación con cuotas corridas y reseñas de vehículos 0KM en Paraguay.',
  alternates: {
    canonical: 'https://datacarpy.com/blog',
  },
  openGraph: {
    title: 'Blog Automotriz & Guías de Compra en Paraguay | DATACAR',
    description: 'Análisis de precios, comparativas reales, guías de financiación con cuotas corridas y reseñas de vehículos 0KM en Paraguay.',
    url: 'https://datacarpy.com/blog',
    type: 'website',
  },
};

export default function BlogPage() {
  return <BlogClient />;
}
