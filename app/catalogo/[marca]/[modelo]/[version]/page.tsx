// app/catalogo/[marca]/[modelo]/[version]/page.tsx
// Server Component: solo resuelve metadata dinámica. Toda la interactividad
// vive en VersionDetailClient.tsx ('use client'), porque generateMetadata
// solo se soporta en Server Components.
import type { Metadata } from 'next';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../../../lib/firebase';
import VersionDetailClient from './VersionDetailClient';

type Props = {
  params: Promise<{ marca: string; modelo: string; version: string }>;
};

const FALLBACK_METADATA: Metadata = {
  title: 'Ficha de vehículo | Datacar',
  description: 'Explorá el catálogo completo de vehículos 0km en Datacar Paraguay: precios, ficha técnica y financiamiento.',
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { marca, modelo, version } = await params;

  try {
    const [brandSnap, modelSnap, versionSnap] = await Promise.all([
      getDoc(doc(db, 'brands', marca)),
      getDoc(doc(db, 'models', modelo)),
      getDoc(doc(db, 'versions', version)),
    ]);

    if (!brandSnap.exists() || !modelSnap.exists() || !versionSnap.exists()) {
      return {
        title: 'Vehículo no encontrado | Datacar',
        description: 'Explorá el catálogo completo de vehículos 0km en Datacar Paraguay.',
      };
    }

    const brandName = brandSnap.data()?.name || '';
    const modelName = modelSnap.data()?.name || '';
    const versionData = versionSnap.data();
    const versionName = versionData?.name || '';
    const price = Number(versionData?.price) || 0;

    const title = `${brandName} ${modelName} ${versionName} — Precio, ficha técnica y financiamiento | Datacar`;
    const description = `Precio${price > 0 ? ` desde US$ ${price.toLocaleString('en-US')}` : ''}, especificaciones técnicas completas y opciones de financiamiento de ${brandName} ${modelName} ${versionName} en Paraguay. Comparalo y cotizalo con Datacar.`;

    return {
      title,
      description,
      openGraph: { title, description },
    };
  } catch {
    return FALLBACK_METADATA;
  }
}

export default function VersionDetailPage() {
  return <VersionDetailClient />;
}
