'use client';

import { useId, useState, useCallback } from 'react';

// Para toggles booleanos simples (acordeones de un solo item, "ver más/ocultar").
// Genera un id estable para enlazar aria-expanded/aria-controls con el panel.
export function useDisclosure(initialOpen = false) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const id = useId();
  const toggle = useCallback(() => setIsOpen(v => !v), []);

  return {
    isOpen,
    toggle,
    buttonProps: {
      'aria-expanded': isOpen,
      'aria-controls': id,
    } as const,
    panelProps: {
      id,
    } as const,
  };
}
