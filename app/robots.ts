import type { MetadataRoute } from 'next';

// El panel administrativo y su login no deben indexarse ni rastrearse.
// La protección real de datos vive en firestore.rules; esto solo evita que
// /admin aparezca en buscadores.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/admin/'],
    },
  };
}
