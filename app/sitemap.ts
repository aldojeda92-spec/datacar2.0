import type { MetadataRoute } from 'next';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';

const BASE_URL = 'https://datacarpy.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const currentDate = new Date();

  // 1. Rutas Estáticas Principales
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${BASE_URL}/`,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/catalogo`,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/promociones`,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/comparador`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 0.85,
    },
    {
      url: `${BASE_URL}/calculadora`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 0.85,
    },
    {
      url: `${BASE_URL}/recomendador`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/blog`,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 0.85,
    },
    {
      url: `${BASE_URL}/negociamos-por-vos`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/concesionarias`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/faq`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/terminos-y-condiciones`,
      lastModified: currentDate,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/politica-de-privacidad`,
      lastModified: currentDate,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];

  // 2. Rutas Dinámicas desde Firestore
  const dynamicRoutes: MetadataRoute.Sitemap = [];

  try {
    const [brandsSnap, modelsSnap, postsSnap] = await Promise.all([
      getDocs(collection(db, 'brands')),
      getDocs(collection(db, 'models')),
      getDocs(collection(db, 'blog_posts')),
    ]);

    // Marcas en catálogo
    brandsSnap.forEach((docSnap) => {
      const brandId = docSnap.id;
      dynamicRoutes.push({
        url: `${BASE_URL}/catalogo/${brandId}`,
        lastModified: currentDate,
        changeFrequency: 'weekly',
        priority: 0.8,
      });
    });

    // Modelos individuales
    modelsSnap.forEach((docSnap) => {
      const data = docSnap.data();
      const brandId = data.brandId || '';
      const modelId = docSnap.id;
      if (brandId && modelId) {
        dynamicRoutes.push({
          url: `${BASE_URL}/catalogo/${brandId}/${modelId}`,
          lastModified: currentDate,
          changeFrequency: 'weekly',
          priority: 0.85,
        });
      }
    });

    // Artículos de Blog
    postsSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.published !== false) {
        const slug = data.slug || docSnap.id;
        dynamicRoutes.push({
          url: `${BASE_URL}/blog/${slug}`,
          lastModified: data.updatedAt?.toDate?.() || currentDate,
          changeFrequency: 'monthly',
          priority: 0.75,
        });
      }
    });
  } catch (error) {
    console.warn('Advertencia al generar sitemap dinámico desde Firestore:', error);
  }

  return [...staticRoutes, ...dynamicRoutes];
}
