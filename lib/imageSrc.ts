// lib/imageSrc.ts
// Datos legacy en Firestore incluyen valores basura tipo "-" o "N/D" en vez de
// una URL real (ver auditoría de migración a Storage). `next/image` tira un
// error duro si `src` no es un path relativo ni una URL absoluta válida, a
// diferencia de `<img>` que los toleraba en silencio. Por eso toda imagen que
// venga de Firestore se valida con `isValidImageSrc` antes de renderizarse.
export function isValidImageSrc(src: string | undefined | null): src is string {
  if (!src) return false;
  if (src.startsWith('/')) return true;
  try {
    new URL(src);
    return true;
  } catch {
    return false;
  }
}

// Solo firebasestorage.googleapis.com está whitelisteado en next.config.ts
// (ver Paso 4). Las imágenes viejas con URLs externas (wixstatic, wikimedia,
// etc.) todavía no migradas deben cargarse con `unoptimized` para no
// devolver 400, en vez de whitelistear dominios arbitrarios.
// Asumir un `src` ya validado con `isValidImageSrc`.
const OPTIMIZABLE_HOSTS = ['firebasestorage.googleapis.com'];

export function isOptimizableImageSrc(src: string | undefined | null): boolean {
  if (!src) return true;
  if (src.startsWith('/')) return true;
  try {
    return OPTIMIZABLE_HOSTS.includes(new URL(src).hostname);
  } catch {
    return true;
  }
}
