'use client';

import React from 'react';

export type ToastVariant = 'error' | 'success' | 'info';

const VARIANT_STYLES: Record<ToastVariant, string> = {
  error: 'border-[#D93025]',
  success: 'border-[#1E8E3E]',
  info: 'border-[#00BFFF]',
};

interface ToastProps {
  message: string;
  variant: ToastVariant;
  onDismiss: () => void;
}

export default function Toast({ message, variant, onDismiss }: ToastProps) {
  return (
    <div className={`bg-[#0A1F33] text-[#FFFFFF] border-l-4 ${VARIANT_STYLES[variant]} shadow-lg px-5 py-4 flex items-start justify-between gap-4`}>
      <p className="text-xs font-bold uppercase tracking-widest leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>
        {message}
      </p>
      <button
        onClick={onDismiss}
        aria-label="Cerrar notificación"
        className="text-[#C0C0C0] hover:text-[#FFFFFF] text-sm font-black shrink-0"
      >
        ✕
      </button>
    </div>
  );
}
