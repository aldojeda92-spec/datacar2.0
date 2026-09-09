// app/catalogo/[marca]/page.tsx
// Server Component: resuelve metadata dinámica Y pre-carga marca + modelos en el
// servidor para que la grilla (con su primera imagen LCP) llegue en el HTML
// inicial en vez de tras el spinner "Sincronizando inventario oficial...".
import type { Metadata } from 'next';
import { cache } from 'react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import MarcaClient, { type ModelData } from './MarcaClient';

type Props = {
  params: Promise<{ marca: string }>;
};

const getMarcaData = cache(async (marcaSlug: string): Promise<{
  brandName: string;
  models: ModelData[] | null;
}> => {
  try {
    const [brandDoc, modelsSnap] = await Promise.all([
      getDoc(doc(db, 'brands', marcaSlug)),
      getDocs(query(collection(db, 'models'), where('brandId', '==', marcaSlug))),
    ]);

    const brandName = brandDoc.exists()
      ? brandDoc.data().name
      : marcaSlug.replace(/-/g, ' ').toUpperCase();

    const models = modelsSnap.docs
      .map(d => ({ id: d.id, ...d.data() }) as ModelData)
      .sort((a, b) => a.name.localeCompare(b.name));

    return { brandName, models };
  } catch {
    return { brandName: marcaSlug.replace(/-/g, ' ').toUpperCase(), models: null };
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { marca } = await params;
  const { brandName, models } = await getMarcaData(marca);
  const count = models?.length ?? 0;

  const title = `Autos 0km ${brandName} en Paraguay — Precios y ficha técnica | Datacar`;
  const description = `${count > 0 ? `${count} modelos ` : ''}0km de ${brandName} disponibles en Paraguay: precio base oficial, carrocería y financiamiento. Comparalos y cotizalos con Datacar.`;

  return { title, description, openGraph: { title, description } };
}

export default async function CatalogoMarcaPage({ params }: Props) {
  const { marca } = await params;
  const { brandName, models } = await getMarcaData(marca);

  return <MarcaClient marcaSlug={marca} initialBrandName={brandName} initialModels={models} />;
}
