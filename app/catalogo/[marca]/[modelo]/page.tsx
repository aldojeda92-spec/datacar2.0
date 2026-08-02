// app/catalogo/[marca]/[modelo]/page.tsx
// Server Component: solo resuelve metadata dinámica. Toda la interactividad
// vive en ModeloDetailClient.tsx ('use client'), porque generateMetadata
// solo se soporta en Server Components.
import type { Metadata } from 'next';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../../lib/firebase';
import ModeloDetailClient from './ModeloDetailClient';

type Props = {
  params: Promise<{ marca: string; modelo: string }>;
};

const FALLBACK_METADATA: Metadata = {
  title: 'Ficha de modelo | Datacar',
  description: 'Explorá el catálogo completo de vehículos 0km en Datacar Paraguay: precios, ficha técnica y financiamiento.',
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { marca, modelo } = await params;

  try {
    const [brandSnap, modelSnap] = await Promise.all([
      getDoc(doc(db, 'brands', marca)),
      getDoc(doc(db, 'models', modelo)),
    ]);

    if (!brandSnap.exists() || !modelSnap.exists()) {
      return {
        title: 'Modelo no encontrado | Datacar',
        description: 'Explorá el catálogo completo de vehículos 0km en Datacar Paraguay.',
      };
    }

    const brandName = brandSnap.data()?.name || '';
    const modelData = modelSnap.data();
    const modelName = modelData?.name || '';
    const startingPrice = Number(modelData?.startingPrice) || 0;

    const title = `${brandName} ${modelName} — Precio, ficha técnica y financiamiento | Datacar`;
    const description = `Precio${startingPrice > 0 ? ` desde US$ ${startingPrice.toLocaleString('en-US')}` : ''}, versiones disponibles, ficha técnica y opciones de financiamiento de ${brandName} ${modelName} en Paraguay. Comparalo y cotizalo con Datacar.`;

    return {
      title,
      description,
      openGraph: { title, description },
    };
  } catch {
    return FALLBACK_METADATA;
  }
}

export default function ModeloDetailPage() {
  return <ModeloDetailClient />;
}
