'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../lib/firebase';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // El observador de Firebase revisa el token en tiempo real
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
        // Si no está logueado y no está ya en la página de login, lo expulsamos
        if (pathname !== '/admin/login') {
          router.push('/admin/login');
        }
      }
    });

    return () => unsubscribe();
  }, [router, pathname]);

  // Pantalla de carga mientras Firebase verifica el token (Latencia B2B)
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-[#0A1F33] flex items-center justify-center text-[#FFFFFF]">
        <div className="font-black text-2xl tracking-widest uppercase animate-pulse" style={{ fontFamily: 'Montserrat, sans-serif' }}>
          DATA<span className="font-light text-[#C0C0C0]">CAR</span>
          <p className="text-[9px] font-bold text-[#00BFFF] tracking-widest mt-2 text-center">Verificando Credenciales...</p>
        </div>
      </div>
    );
  }

  // Si no está autenticado y está en la ruta de login, renderizamos el login (los children)
  if (!isAuthenticated && pathname === '/admin/login') {
    return <>{children}</>;
  }

  // Si está autenticado, renderizamos el panel de control normalmente
  if (isAuthenticated) {
    return <>{children}</>;
  }

  return null;
}