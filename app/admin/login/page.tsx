'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../../lib/firebase';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      await signInWithEmailAndPassword(auth, email, password);
      // Si el login es exitoso, Firebase guarda el token y redirigimos al Dashboard
      router.push('/admin');
    } catch (err: any) {
      console.error("Error de autenticación:", err);
      setError('Credenciales inválidas o acceso denegado.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0A1F33] flex flex-col justify-center items-center p-4 font-sans relative overflow-hidden">
      
      {/* Fondo Arquitectónico */}
      <div className="absolute top-0 left-0 w-full h-1 bg-[#00BFFF]"></div>
      <div className="absolute bottom-0 right-0 w-64 h-64 bg-[#FFFFFF] opacity-5 transform rotate-45 translate-y-1/2 translate-x-1/4"></div>

      <div className="w-full max-w-md bg-[#FFFFFF] border border-[#C0C0C0] p-10 md:p-14 relative z-10 shadow-2xl">
        
        {/* Cabecera del Login */}
        <div className="text-center mb-10">
          <div className="font-black text-4xl tracking-widest text-[#0A1F33] uppercase mb-2" style={{ fontFamily: 'Montserrat, sans-serif' }}>
            DATA<span className="font-light">CAR</span>
          </div>
          <span className="border border-[#00BFFF] text-[#00BFFF] text-[9px] font-bold uppercase px-3 py-1 tracking-widest inline-block" style={{ fontFamily: 'Inter, sans-serif' }}>
            Portal de Operaciones
          </span>
        </div>

        {error && (
          <div className="bg-[#FFE6E6] border border-[#D93025] text-[#D93025] p-4 mb-6 text-[10px] font-bold uppercase tracking-widest text-center" style={{ fontFamily: 'Inter, sans-serif' }}>
            {error}
          </div>
        )}

        {/* Formulario Estricto B2B */}
        <form onSubmit={handleLogin} className="flex flex-col gap-6" style={{ fontFamily: 'Inter, sans-serif' }}>
          <div>
            <label className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest block mb-2">Correo Corporativo</label>
            <input 
              type="email" 
              className="w-full border border-[#C0C0C0] p-4 text-sm focus:outline-none focus:border-[#0A1F33] bg-[#F8F9FA] text-[#3A3A3C]"
              placeholder="ejemplo@datacar.com.py"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest block mb-2">Clave de Acceso</label>
            <input 
              type="password" 
              className="w-full border border-[#C0C0C0] p-4 text-sm focus:outline-none focus:border-[#0A1F33] bg-[#F8F9FA] text-[#3A3A3C]"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button 
            type="submit" 
            disabled={isLoading || !email || !password}
            className="mt-4 w-full bg-[#00BFFF] hover:bg-[#0A1F33] text-[#FFFFFF] font-bold text-xs uppercase tracking-widest py-4 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-transparent"
          >
            {isLoading ? 'Verificando...' : 'Autenticar Protocolo'}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-[#C0C0C0]/50 text-center">
          <p className="text-[9px] text-[#C0C0C0] uppercase tracking-widest" style={{ fontFamily: 'Inter, sans-serif' }}>
            Acceso restringido a personal autorizado. Toda actividad es auditada.
          </p>
        </div>
      </div>
    </main>
  );
}