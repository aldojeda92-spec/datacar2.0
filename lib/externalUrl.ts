// Normaliza URLs externas cargadas a mano en el admin (ej. links de ads/sponsors).
// Si a alguien se le olvida escribir "https://" (ej. "www.toyotoshi.com.py"), un
// <Link> de Next.js lo trata como ruta interna relativa y navega a
// "datacar.com.py/www.toyotoshi.com.py" en vez de salir al sitio del sponsor.
export function normalizeExternalUrl(url: string | undefined | null): string {
  if (!url) return '#';
  const trimmed = url.trim();
  if (!trimmed) return '#';
  // Ruta interna (ej. "/negociamos-por-vos") o ancla: no tocar.
  if (trimmed.startsWith('/') || trimmed.startsWith('#')) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
