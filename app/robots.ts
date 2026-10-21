import type { MetadataRoute } from 'next';

// Configuración de rastreo para motores de búsqueda (Googlebot, Bingbot, etc.).
// - Protege el panel administrativo y los endpoints internos de la API.
// - Optimiza el Crawl Budget de Google para centrarse 100% en el catálogo, comparador y blog.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/admin',
        '/admin/',
        '/api/',
        '/api/*',
      ],
    },
    sitemap: 'https://datacarpy.com/sitemap.xml',
  };
}
