// app/catalogo/[marca]/[modelo]/[version]/page.tsx
// Server Component: resuelve metadata dinámica Y pre-carga versión + modelo +
// marca en el servidor para que el héroe (imagen LCP, título, precio) llegue en
// el HTML inicial en vez de tras la cascada Firestore en cliente. `cache()`
// deduplica la lectura entre generateMetadata y el render.
import type { Metadata } from 'next';
import { cache } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../../../lib/firebase';
import VersionDetailClient, {
  type ModelData,
  type BrandData,
  type VersionData,
} from './VersionDetailClient';

type Props = {
  params: Promise<{ marca: string; modelo: string; version: string }>;
};

const FALLBACK_METADATA: Metadata = {
  title: 'Ficha de vehículo | Datacar',
  description: 'Explorá el catálogo completo de vehículos 0km en Datacar Paraguay: precios, ficha técnica y financiamiento.',
};

const getVersionData = cache(async (marca: string, version: string): Promise<{
  version: VersionData | null;
  model: ModelData | null;
  brand: BrandData | null;
}> => {
  try {
    const versionSnap = await getDoc(doc(db, 'versions', version));
    if (!versionSnap.exists()) return { version: null, model: null, brand: null };
    const versionData = { id: versionSnap.id, ...versionSnap.data() } as VersionData;

    const modelSnap = await getDoc(doc(db, 'models', versionData.modelId));
    if (!modelSnap.exists()) return { version: versionData, model: null, brand: null };
    const model = { id: modelSnap.id, ...modelSnap.data() } as ModelData;

    const brandSnap = await getDoc(doc(db, 'brands', model.brandId || marca));
    const brand = brandSnap.exists() ? (brandSnap.data() as BrandData) : null;

    return { version: versionData, model, brand };
  } catch {
    return { version: null, model: null, brand: null };
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { marca, modelo, version } = await params;

  try {
    const { version: versionData, model, brand } = await getVersionData(marca, version);

    if (!versionData || !model) {
      return {
        title: 'Vehículo no encontrado | Datacar',
        description: 'Explorá el catálogo completo de vehículos 0km en Datacar Paraguay.',
      };
    }

    const brandName = brand?.name || '';
    const modelName = model.name || '';
    const versionName = versionData.name || '';
    const price = Number(versionData.price) || 0;

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

export default async function VersionDetailPage({ params }: Props) {
  const { marca, version } = await params;
  const { version: versionData, model, brand } = await getVersionData(marca, version);

  return (
    <VersionDetailClient
      initialVersion={versionData}
      initialModel={model}
      initialBrand={brand}
    />
  );
}
