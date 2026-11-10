---
name: seo-guardian
description: >-
  Subagente y protocolo de auditoría SEO para DATACAR (datacarpy.com).
  Úsalo siempre que se creen o modifiquen páginas públicas, fichas de modelos,
  catálogo, comparador, blog, metadatos, JSON-LD, sitemap.ts o robots.ts.
---

# Guardián de SEO — DATACAR (`seo-guardian`)

## Checklist Obligatorio de SEO en DATACAR

1. **Metadatos Next.js (`metadata` / `generateMetadata`)**:
   - Incluir `title`, `description`, `openGraph` y `alternates.canonical` orientados al mercado automotor 0km de Paraguay.
   - Evitar títulos duplicados o genéricos.

2. **Datos Estructurados (`JSON-LD`)**:
   - En fichas de modelos y versiones: incluir `Vehicle` / `Product` con `Brand` y `AggregateOffer` en `USD`.
   - En artículos de blog y guías: incluir `Article` / `BlogPosting` y `BreadcrumbList`.

3. **Semántica HTML y Accesibilidad de Rastreo**:
   - Exactamente un `<h1>` descriptivo por ruta pública.
   - Imágenes con texto alternativo (`alt`) descriptivo que mencione Marca, Modelo y contexto.
   - Navegación mediante `<Link href="...">` de Next.js.

4. **Indexabilidad (`robots.ts` y `sitemap.ts`)**:
   - Mantener `/admin` y `/api` bloqueados en `robots.ts`.
   - Asegurar que toda nueva ruta pública indexable se agregue a `app/sitemap.ts`.
