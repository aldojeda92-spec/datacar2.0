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
    const canonicalUrl = `https://datacarpy.com/catalogo/${marca}/${modelo}`;

    return {
      title,
      description,
      alternates: {
        canonical: canonicalUrl,
      },
      openGraph: {
        title,
        description,
        url: canonicalUrl,
        images: model.imgUrl ? [{ url: model.imgUrl, alt: `${brandName} ${modelName}` }] : [],
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: model.imgUrl ? [model.imgUrl] : [],
      },
    };
  } catch {
    return FALLBACK_METADATA;
  }
}

export default async function ModeloDetailPage({ params }: Props) {
  const { marca, modelo } = await params;
  const { model, brand } = await getModeloData(marca, modelo);

  const brandName = brand?.name || '';
  const modelName = model?.name || '';
  const startingPrice = Number(model?.startingPrice) || 0;

  const vehicleSchema = model ? {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Car',
        '@id': `https://datacarpy.com/catalogo/${marca}/${modelo}#vehicle`,
        name: `${brandName} ${modelName}`,
        brand: {
          '@type': 'Brand',
          name: brandName,
        },
        image: model.imgUrl || undefined,
        bodyType: model.tipo_carroceria || undefined,
        offers: startingPrice > 0 ? {
          '@type': 'Offer',
          price: startingPrice,
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
          url: `https://datacarpy.com/catalogo/${marca}/${modelo}`,
          seller: {
            '@type': 'AutoDealer',
            name: 'DATACAR Paraguay',
          },
        } : undefined,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Inicio',
            item: 'https://datacarpy.com',
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Catálogo',
            item: 'https://datacarpy.com/catalogo',
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: brandName || 'Marca',
            item: `https://datacarpy.com/catalogo?marca=${encodeURIComponent(brandName)}`,
          },
          {
            '@type': 'ListItem',
            position: 4,
            name: modelName,
            item: `https://datacarpy.com/catalogo/${marca}/${modelo}`,
          },
        ],
      },
    ],
  } : null;

  return (
    <>
      {vehicleSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(vehicleSchema) }}
        />
      )}
      <ModeloDetailClient initialModel={model} initialBrand={brand} />
    </>
  );
}
