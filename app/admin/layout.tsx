// Server Component: fija `robots: noindex/nofollow` para todo /admin (incluido
// /admin/login) y delega la verificación de sesión/rol en AdminAuthGate (client).
import type { Metadata } from 'next';
import AdminAuthGate from './AdminAuthGate';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminAuthGate>{children}</AdminAuthGate>;
}
