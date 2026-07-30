'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'authorized' | 'unauthorized'>('loading');
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // El observador de Firebase revisa el token en tiempo real y valida el rol admin
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (pathname === '/admin/login') {
        setStatus('unauthorized');
        return;
      }

      if (!user) {
        setStatus('unauthorized');
        router.push('/admin/login');
        return;
      }

      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists() && snap.data().role === 'admin') {
          setStatus('authorized');
        } else {
          await signOut(auth);
          setStatus('unauthorized');
          router.push('/admin/login');
        }
      } catch {
        await signOut(auth);
        setStatus('unauthorized');
        router.push('/admin/login');
      }
    });

    return () => unsubscribe();
  }, [router, pathname]);

  // Ruta de login: siempre se renderiza, sin importar el estado de auth
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  // Pantalla de carga mientras Firebase verifica el token y el rol (Latencia B2B)
  if (status !== 'authorized') {
    return (
      <div className="min-h-screen bg-[#0A1F33] flex items-center justify-center text-[#FFFFFF]">
        <div className="font-black text-2xl tracking-widest uppercase animate-pulse" style={{ fontFamily: 'Montserrat, sans-serif' }}>
          DATA<span className="font-light text-[#C0C0C0]">CAR</span>
          <p className="text-[9px] font-bold text-[#00BFFF] tracking-widest mt-2 text-center">Verificando Credenciales...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
