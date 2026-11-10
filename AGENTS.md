<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 🚨 REGLA INQUEBRANTABLE DE ENTORNO: LOCALHOST SIEMPRE APUNTA A LA BASE DE PRUEBA

1. **PROHIBIDO CONECTAR `localhost` A PRODUCCIÓN (`datacar2-0`)**:
   - En desarrollo local (`localhost` / `127.0.0.1` / `.env.local`), el proyecto **SIEMPRE** debe apuntar exclusivamente a la base de datos de **PRUEBA** en Firebase: **`gestion-taller-e578f`** (`NEXT_PUBLIC_FIREBASE_PROJECT_ID=gestion-taller-e578f`).
   - La base de producción (`datacar2-0`) es **exclusiva para Vercel (producción)**. Nunca reemplaces `.env.local` con las credenciales de `datacar2-0`.
   - `lib/firebase.ts` cuenta con un candado automático que fuerza `gestion-taller-e578f` cuando corre en `localhost` o `NODE_ENV === 'development'`. **Jamás elimines ese candado.**

---

# Subagentes y Guardianes Oficiales de DATACAR (`datacar2.0`)

En el proyecto DATACAR contamos con **2 subagentes especializados** que deben velar permanentemente por la calidad del producto:

1. **`seo-guardian` (Guardián de SEO)**:
   - Responsable de auditar y garantizar el posicionamiento orgánico en Paraguay (`datacarpy.com`), metadatos (`metadata` / `generateMetadata`), datos estructurados JSON-LD (`Schema.org`), jerarquía semántica HTML (`<h1>`-`<h3>`), atributos `alt` en imágenes, `sitemap.ts` y `robots.ts`.
   - Ver guía detallada en `.agents/skills/seo-guardian/SKILL.md`.

2. **`ui-ux-guardian` (Guardián de UI/UX)**:
   - Responsable de velar por el sistema de diseño corporativo (`#0A1F33`, `#00BFFF`, `#1E8E3E`, `#3A3A3C`, `#C0C0C0`, tipografías Montserrat e Inter), experiencia mobile-first, accesibilidad (`label` / `aria-label`) y optimización de conversión sin fricción (CRO).
   - Ver guía detallada en `.agents/skills/ui-ux-guardian/SKILL.md`.
