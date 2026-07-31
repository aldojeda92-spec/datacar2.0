// app/components/NewsletterForm.tsx
'use client';

import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp, query, where, getDocs, limit } from 'firebase/firestore';
// CORRECCIÓN BUGS DE RUTA: Subimos dos niveles (../../) para llegar a la raíz del proyecto
import { db } from '../../lib/firebase';
import { sendWelcomeEmail } from '../../lib/mailer';

export default function NewsletterForm({ origen = 'Footer Home' }: { origen?: string }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error' | 'exists'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    // Validación básica B2C
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setStatus('error');
      return;
    }

    setStatus('loading');

    try {
      // 1. Evitar duplicados (Psicología UX: no saturar al cliente con correos repetidos)
      const q = query(collection(db, 'newsletter_subscribers'), where('email', '==', email.toLowerCase().trim()), limit(1));
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        setStatus('exists');
        setTimeout(() => setStatus('idle'), 3000);
        return;
      }

      // 2. Guardar en Firebase (Bóveda de Audiencia)
      await addDoc(collection(db, 'newsletter_subscribers'), {
        email: email.toLowerCase().trim(),
        origen,
        estado: 'Activo',
        createdAt: serverTimestamp()
      });

      // 3. Disparar el Correo B2C (Welcome)
      await sendWelcomeEmail(email.toLowerCase().trim());

      setStatus('success');
      setEmail('');
      setTimeout(() => setStatus('idle'), 4000);

    } catch (error) {
      console.error("Error en suscripción:", error);
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  return (
    <div className="w-full max-w-md mt-6">
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-0">
        <input 
          type="email" 
          placeholder="Tu correo electrónico" 
          disabled={status === 'loading'}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-grow p-4 text-xs text-[#3A3A3C] bg-[#FFFFFF] border border-[#C0C0C0] focus:outline-none focus:border-[#0A1F33] rounded-none disabled:opacity-50"
          style={{ fontFamily: 'Inter, sans-serif' }}
          required
        />
        <button 
          type="submit" 
          disabled={status === 'loading'}
          className="bg-[#00BFFF] hover:bg-[#0A1F33] text-[#FFFFFF] font-bold text-[10px] uppercase tracking-widest px-8 py-4 transition-colors disabled:bg-[#C0C0C0] border border-[#00BFFF] hover:border-[#0A1F33] rounded-none sm:w-auto w-full"
        >
          {status === 'loading' ? 'Procesando...' : 'Suscribirme'}
        </button>
      </form>

      {/* UX Feedback Micro-copy */}
      <div className="mt-2 h-4">
        {status === 'success' && <p className="text-[10px] text-[#1E8E3E] font-bold uppercase tracking-widest">¡Revisa tu bandeja de entrada!</p>}
        {status === 'error' && <p className="text-[10px] text-[#D93025] font-bold uppercase tracking-widest">Error. Revisa tu correo o conexión.</p>}
        {status === 'exists' && <p className="text-[10px] text-[#0A1F33] font-bold uppercase tracking-widest">Este correo ya está suscrito.</p>}
      </div>
    </div>
  );
}