'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Modal from './a11y/Modal';

export type NavItem =
  | { type: 'link'; label: string; href: string; current?: boolean }
  | { type: 'dropdown'; label: string; items: { label: string; href: string; highlight?: boolean }[] }
  | { type: 'megamenu'; label: string; columns: 1 | 2 | 3; width: number; items: { label: string; href: string; highlight?: boolean }[] };

interface NavbarProps {
  items: NavItem[];
  cta?: { label: string; href: string; compact?: boolean };
  logoHref?: string;
}

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="square" strokeWidth="2" d="M19 9l-7 7-7-7" />
  </svg>
);

export default function Navbar({ items, cta, logoHref = '/' }: NavbarProps) {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openAccordion, setOpenAccordion] = useState<string | null>(null);
  const closeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bloquea el scroll del body mientras el drawer mobile está abierto.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) setOpenAccordion(null);
  }, [mobileOpen]);

  // Mismo mecanismo accesible (mouse + foco + Escape) que ya usaban los
  // mega-menús de HomeClient, generalizado para cualquier dropdown/megamenu.
  const handleMouseEnter = (label: string) => {
    if (closeTimeout.current) clearTimeout(closeTimeout.current);
    setActiveMenu(label);
  };
  const handleMouseLeave = () => {
    closeTimeout.current = setTimeout(() => setActiveMenu(null), 150);
  };
  const handleMenuBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setActiveMenu(null);
  };
  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      setActiveMenu(null);
      (e.currentTarget.querySelector('button') as HTMLButtonElement | null)?.focus();
    }
  };

  const hasItems = items.length > 0;
  const ctaClasses = cta?.compact
    ? 'bg-[#FFFFFF] border border-[#0A1F33] text-[#0A1F33] font-bold text-[11px] uppercase tracking-widest py-2 px-6 hover:bg-[#0A1F33] hover:text-[#FFFFFF] transition-colors'
    : 'bg-[#FFFFFF] border border-[#0A1F33] text-[#0A1F33] font-bold text-[11px] uppercase tracking-widest py-3 px-8 hover:bg-[#0A1F33] hover:text-[#FFFFFF] transition-colors';

  return (
    <nav className="w-full bg-[#FFFFFF] border-b border-[#C0C0C0] px-4 lg:px-8 py-4 flex justify-between items-center sticky top-0 z-50 shadow-none">
      <div className="font-black text-2xl tracking-widest text-[#0A1F33] uppercase" style={{ fontFamily: 'Montserrat, sans-serif' }}>
        <Link href={logoHref}>DATA<span className="font-light">CAR</span></Link>
      </div>

      {hasItems && (
        <div className="hidden lg:flex gap-6 font-bold text-[11px] uppercase items-center text-[#3A3A3C] tracking-wider h-full" style={{ fontFamily: 'Inter, sans-serif' }}>
          {items.map((item) => {
            if (item.type === 'link') {
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  aria-current={item.current ? 'page' : undefined}
                  className={item.current ? 'text-[#0A1F33] border-b-2 border-[#0A1F33] pb-1' : 'hover:text-[#00BFFF] transition-colors'}
                >
                  {item.label}
                </Link>
              );
            }

            const isOpen = activeMenu === item.label;
            const width = item.type === 'megamenu' ? item.width : 250;
            const cols = item.type === 'megamenu' ? item.columns : 1;

            return (
              <div
                key={item.label}
                className="relative py-4"
                onMouseEnter={() => handleMouseEnter(item.label)}
                onMouseLeave={handleMouseLeave}
                onBlur={handleMenuBlur}
                onKeyDown={handleMenuKeyDown}
              >
                <button
                  type="button"
                  onFocus={() => handleMouseEnter(item.label)}
                  aria-expanded={isOpen}
                  aria-haspopup="true"
                  className={`hover:text-[#00BFFF] transition-colors flex items-center gap-1 ${isOpen ? 'text-[#00BFFF]' : ''}`}
                >
                  {item.label}
                  <ChevronIcon open={isOpen} />
                </button>
                {isOpen && (
                  <div
                    className="absolute top-full left-1/2 -translate-x-1/2 bg-[#FFFFFF] border-2 border-[#0A1F33] border-t-4 border-t-[#00BFFF] p-6 grid gap-y-4 gap-x-8"
                    style={{ width, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                  >
                    {item.items.map((sub) => (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        className={sub.highlight
                          ? 'p-3 text-[#00BFFF] font-black hover:bg-[#F5FBFF] transition-colors border border-transparent hover:border-[#00BFFF]/30 block truncate'
                          : 'text-[#3A3A3C] hover:text-[#0A1F33] hover:font-black hover:pl-2 transition-all block truncate border-b border-transparent hover:border-[#00BFFF]'}
                      >
                        {sub.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-4">
        {cta && (
          <Link href={cta.href} className={`${hasItems ? 'hidden lg:inline-flex' : 'inline-flex'} ${ctaClasses}`}>
            {cta.label}
          </Link>
        )}

        {hasItems && (
          <>
            <button
              type="button"
              className="lg:hidden p-2 text-[#0A1F33]"
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav-drawer"
              aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'}
              onClick={() => setMobileOpen((o) => !o)}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileOpen
                  ? <path strokeLinecap="square" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  : <path strokeLinecap="square" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />}
              </svg>
            </button>

            <Modal
              isOpen={mobileOpen}
              onClose={() => setMobileOpen(false)}
              overlayClassName="fixed inset-0 bg-[#0A1F33]/80 z-[60] backdrop-blur-sm lg:hidden"
              panelClassName="fixed inset-y-0 right-0 z-[70] w-full max-w-xs bg-[#FFFFFF] border-l-4 border-[#00BFFF] flex flex-col overflow-y-auto lg:hidden"
            >
              <div id="mobile-nav-drawer" className="flex flex-col min-h-full">
                <div className="flex justify-between items-center p-4 border-b border-[#C0C0C0] shrink-0">
                  <span className="font-black text-lg tracking-widest text-[#0A1F33] uppercase" style={{ fontFamily: 'Montserrat, sans-serif' }}>Menú</span>
                  <button type="button" aria-label="Cerrar menú" className="p-2 text-[#0A1F33]" onClick={() => setMobileOpen(false)}>
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="square" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="flex flex-col p-4 gap-1 font-bold text-xs uppercase tracking-wider text-[#3A3A3C]" style={{ fontFamily: 'Inter, sans-serif' }}>
                  {items.map((item) => {
                    if (item.type === 'link') {
                      return (
                        <Link
                          key={item.label}
                          href={item.href}
                          aria-current={item.current ? 'page' : undefined}
                          className={`p-3 border-b border-[#F8F9FA] ${item.current ? 'text-[#0A1F33] bg-[#F8F9FA]' : 'hover:text-[#00BFFF]'}`}
                          onClick={() => setMobileOpen(false)}
                        >
                          {item.label}
                        </Link>
                      );
                    }

                    const isOpen = openAccordion === item.label;
                    return (
                      <div key={item.label} className="border-b border-[#F8F9FA]">
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          className="w-full flex justify-between items-center p-3 hover:text-[#00BFFF]"
                          onClick={() => setOpenAccordion(isOpen ? null : item.label)}
                        >
                          {item.label}
                          <ChevronIcon open={isOpen} />
                        </button>
                        {isOpen && (
                          <div className="flex flex-col pb-2 pl-4">
                            {item.items.map((sub) => (
                              <Link
                                key={sub.href}
                                href={sub.href}
                                className={`p-2 normal-case font-medium ${sub.highlight ? 'text-[#00BFFF] font-black' : 'text-[#3A3A3C] hover:text-[#0A1F33]'}`}
                                onClick={() => setMobileOpen(false)}
                              >
                                {sub.label}
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {cta && (
                  <div className="p-4 mt-auto border-t border-[#C0C0C0] shrink-0">
                    <Link
                      href={cta.href}
                      className="block text-center bg-[#0A1F33] text-[#FFFFFF] font-bold text-[11px] uppercase tracking-widest py-4 px-8 hover:bg-[#00BFFF] transition-colors"
                      onClick={() => setMobileOpen(false)}
                    >
                      {cta.label}
                    </Link>
                  </div>
                )}
              </div>
            </Modal>
          </>
        )}
      </div>
    </nav>
  );
}
