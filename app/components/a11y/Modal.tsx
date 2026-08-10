'use client';

import React, { useEffect, useRef } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  overlayClassName: string;
  panelClassName: string;
}

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Wrapper de COMPORTAMIENTO, no de estilo: role="dialog", foco inicial, trampa de
// foco Tab/Shift+Tab, cierre con Escape y restauración de foco al elemento que
// abrió el modal. Las clases visuales las define cada call-site vía props para
// no alterar el look de ninguno de los modales existentes.
export default function Modal({ isOpen, onClose, children, overlayClassName, panelClassName }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Foco inicial (y su restauración al cerrar) SOLO debe dispararse en la
  // transición de abrir/cerrar, nunca en cada re-render. Si dependiera de
  // `onClose` -- que en la mayoría de los call-sites es una arrow function
  // inline, recreada en cada render del padre -- el efecto se re-ejecutaría
  // en cada tecla que el usuario escribe dentro del modal, robándole el foco
  // de vuelta al primer elemento enfocable (ej: el botón "✕") y dejando
  // que solo se pueda tipear una letra a la vez.
  useEffect(() => {
    if (!isOpen) return;

    previouslyFocused.current = document.activeElement as HTMLElement;
    const panel = panelRef.current;
    const focusables = panel?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    (focusables?.[0] ?? panel)?.focus();

    return () => {
      previouslyFocused.current?.focus();
    };
  }, [isOpen]);

  // La trampa de foco (Tab/Shift+Tab) y el cierre con Escape sí pueden
  // depender de `onClose` sin problema: volver a registrar el listener no
  // tiene efecto visible para el usuario.
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        const panel = panelRef.current;
        if (!panel) return;
        const items = panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className={overlayClassName}>
      <div ref={panelRef} role="dialog" aria-modal="true" tabIndex={-1} className={panelClassName}>
        {children}
      </div>
    </div>
  );
}
