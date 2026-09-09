// app/catalogo/[marca]/[modelo]/page.tsx
// Server Component: resuelve metadata dinámica Y pre-carga marca+modelo en el
// servidor para que el HÉROE (imagen LCP, título, precio) llegue en el HTML
// inicial. Antes todo se resolvía client-side tras descargar el SDK de Firebase
// y una cadena de lecturas Firestore en serie => LCP de 11s en el segmento con
// fricción. `cache()` deduplica la lectura entre generateMetadata y el render.
import type { Metadata } from 'next';
import { cache } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../../lib/firebase';
import ModeloDetailClient, { type ModelData, type BrandData } from './ModeloDetailClient';

type Props = {
  params: Promise<{ marca: string; modelo: string }>;
};

const FALLBACK_METADATA: Metadata = {
  title: 'Ficha de modelo | Datacar',
  description: 'Explorá el catálogo completo de vehículos 0km en Datacar Paraguay: precios, ficha técnica y financiamiento.',
};

const getModeloData = cache(async (marca: string, modelo: string): Promise<{
  model: ModelData | null;
  brand: BrandData | null;
}> => {
  try {
    const modelSnap = await getDoc(doc(db, 'models', modelo));
    if (!modelSnap.exists()) return { model: null, brand: null };

    const model = { id: modelSnap.id, ...modelSnap.data() } as ModelData;

    const brandId = model.brandId || marca;
    const brandSnap = await getDoc(doc(db, 'brands', brandId));
    const brand = brandSnap.exists() ? (brandSnap.data() as BrandData) : null;

    return { model, brand };
  } catch {
    return { model: null, brand: null };
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { marca, modelo } = await params;

  try {
    const { model, brand } = await getModeloData(marca, modelo);

    if (!model) {
      return {
        title: 'Modelo no encontrado | Datacar',
        description: 'Explorá el catálogo completo de vehículos 0km en Datacar Paraguay.',
      };
    }

    const brandName = brand?.name || '';
    const modelName = model.name || '';
    const startingPrice = Number(model.startingPrice) || 0;

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

export default async function ModeloDetailPage({ params }: Props) {
  const { marca, modelo } = await params;
  const { model, brand } = await getModeloData(marca, modelo);

  return <ModeloDetailClient initialModel={model} initialBrand={brand} />;
}
