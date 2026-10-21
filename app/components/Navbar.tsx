'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Modal from './a11y/Modal';

export type NavSubItem = {
  label: string;
  href: string;
  highlight?: boolean;
  badge?: string;
};

export type NavItem =
  | { type: 'link'; label: string; href: string; current?: boolean; highlightStyle?: 'underline-caps' }
  | { type: 'dropdown'; label: string; items: NavSubItem[] }
  | { type: 'megamenu'; label: string; columns: 1 | 2 | 3; width: number; items: NavSubItem[] };

interface NavbarProps {
  items: NavItem[];
  cta?: { label: string; href: string; compact?: boolean };
  secondaryCta?: { label: string; href: string; compact?: boolean };
  logoHref?: string;
}

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="square" strokeWidth="2" d="M19 9l-7 7-7-7" />
  </svg>
);

export default function Navbar({ items, cta, secondaryCta, logoHref = '/' }: NavbarProps) {
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
    ? 'bg-[#FFFFFF] border border-[#0A1F33]/20 text-[#0A1F33] font-bold text-[11px] uppercase tracking-widest py-2 px-5 hover:bg-[#0A1F33] hover:text-[#FFFFFF] hover:border-[#0A1F33] transition-all rounded-xl shadow-xs'
    : 'bg-[#FFFFFF] border border-[#0A1F33]/20 text-[#0A1F33] font-bold text-[11px] uppercase tracking-widest py-3 px-6 hover:bg-[#0A1F33] hover:text-[#FFFFFF] hover:border-[#0A1F33] transition-all rounded-xl shadow-xs';

  return (
    <>
      <nav className="w-full bg-[#FFFFFF] border-b border-[#0A1F33]/10 px-4 lg:px-8 py-4 flex justify-between items-center sticky top-0 z-50 shadow-xs">
        <div className="font-black text-2xl tracking-widest text-[#0A1F33] uppercase shrink-0" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
          <Link href={logoHref}>DATA<span className="font-light">CAR</span></Link>
        </div>

        {hasItems && (
          <div className="hidden lg:flex gap-4 xl:gap-6 font-bold text-[11px] uppercase items-center text-[#3A3A3C] tracking-wider h-full" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
            {items.map((item) => {
              if (item.type === 'link') {
                const isUnderlineHighlight = item.highlightStyle === 'underline-caps';
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    aria-current={item.current ? 'page' : undefined}
                    className={
                      isUnderlineHighlight
                        ? 'text-[#0A1F33] font-black uppercase underline decoration-[#00BFFF] decoration-2 underline-offset-4 hover:text-[#00BFFF] transition-colors tracking-widest whitespace-nowrap'
                        : item.current
                          ? 'text-[#0A1F33] border-b-2 border-[#00BFFF] pb-1 whitespace-nowrap'
                          : 'hover:text-[#00BFFF] transition-colors whitespace-nowrap'
                    }
                  >
                    {item.label}
                  </Link>
                );
              }

              const isOpen = activeMenu === item.label;
              const width = item.type === 'megamenu' ? item.width : 260;
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
                    className={`hover:text-[#00BFFF] transition-colors flex items-center gap-1 whitespace-nowrap ${isOpen ? 'text-[#00BFFF]' : ''}`}
                  >
                    {item.label}
                    <ChevronIcon open={isOpen} />
                  </button>
                  {isOpen && (
                    <div
                      className="absolute top-full left-1/2 -translate-x-1/2 bg-[#FFFFFF] border border-[#0A1F33]/10 border-t-4 border-t-[#00BFFF] rounded-2xl shadow-xl p-6 grid gap-y-2.5 gap-x-6 mt-1 max-h-[75vh] overflow-y-auto"
                      style={{ width, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                    >
                      {item.items.map((sub) => (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          onClick={() => setActiveMenu(null)}
                          className={sub.highlight
                            ? 'p-3 text-[#00BFFF] font-black bg-[#F5FBFF] hover:bg-[#00BFFF] hover:text-[#0A1F33] rounded-xl transition-all border border-[#00BFFF]/20 flex items-center justify-between gap-2 leading-snug'
                            : 'text-[#3A3A3C] hover:text-[#0A1F33] hover:bg-[#F8F9FA] px-3 py-2 rounded-lg transition-all flex items-center justify-between gap-2 leading-snug group'}
                        >
                          <span className="truncate">{sub.label}</span>
                          {sub.badge && (
                            <span className="text-[10px] font-bold text-[#0080B0] bg-[#F0FBFF] border border-[#00BFFF]/25 group-hover:bg-[#00BFFF] group-hover:text-[#0A1F33] px-2 py-0.5 rounded-full shrink-0 normal-case transition-colors">
                              {sub.badge}
                            </span>
                          )}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-2.5 shrink-0">
          {secondaryCta && (
            <Link
              href={secondaryCta.href}
              className={`${hasItems ? 'hidden lg:inline-flex' : 'inline-flex'} bg-[#00BFFF] border border-[#00BFFF] text-[#0A1F33] font-bold text-[11px] uppercase tracking-widest ${secondaryCta.compact ? 'py-2 px-5' : 'py-3 px-5'} hover:bg-[#0A1F33] hover:text-[#FFFFFF] hover:border-[#0A1F33] transition-all rounded-xl shadow-sm`}
            >
              {secondaryCta.label}
            </Link>
          )}

          {cta && (
            <Link href={cta.href} className={`${hasItems ? 'hidden lg:inline-flex' : 'inline-flex'} ${ctaClasses}`}>
              {cta.label}
            </Link>
          )}

          {hasItems && (
            <button
              type="button"
              className="lg:hidden p-2 text-[#0A1F33] rounded-xl hover:bg-[#F8F9FA]"
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav-drawer"
              aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'}
              onClick={() => setMobileOpen((o) => !o)}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileOpen
                  ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />}
              </svg>
            </button>
          )}
        </div>
      </nav>

      {hasItems && (
        <Modal
          isOpen={mobileOpen}
          onClose={() => setMobileOpen(false)}
          overlayClassName="fixed inset-0 bg-[#0A1F33]/80 z-[60] backdrop-blur-sm lg:hidden"
          panelClassName="fixed inset-y-0 right-0 z-[70] w-full max-w-xs h-[100dvh] bg-[#FFFFFF] border-l-4 border-[#00BFFF] rounded-l-3xl shadow-2xl flex flex-col overflow-y-auto lg:hidden"
        >
          <div id="mobile-nav-drawer" className="flex flex-col min-h-full">
            <div className="flex justify-between items-center p-5 border-b border-[#0A1F33]/10 shrink-0">
              <span className="font-black text-lg tracking-widest text-[#0A1F33] uppercase" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>Menú</span>
              <button type="button" aria-label="Cerrar menú" className="p-2 text-[#0A1F33] rounded-xl hover:bg-[#F8F9FA]" onClick={() => setMobileOpen(false)}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex flex-col p-4 gap-1 font-bold text-xs uppercase tracking-wider text-[#3A3A3C] flex-grow" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
              {items.map((item) => {
                if (item.type === 'link') {
                  const isUnderlineHighlight = item.highlightStyle === 'underline-caps';
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      aria-current={item.current ? 'page' : undefined}
                      className={
                        isUnderlineHighlight
                          ? 'p-3 rounded-xl transition-colors font-black text-[#0A1F33] uppercase underline decoration-[#00BFFF] decoration-2 underline-offset-4 bg-[#F5FBFF] border border-[#00BFFF]/20 hover:bg-[#00BFFF]/10 mt-1'
                          : `p-3 rounded-xl transition-colors ${item.current ? 'text-[#0A1F33] bg-[#F8F9FA]' : 'hover:text-[#00BFFF] hover:bg-[#F8F9FA]'}`
                      }
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
                      className="w-full flex justify-between items-center p-3 rounded-xl hover:text-[#00BFFF] hover:bg-[#F8F9FA]"
                      onClick={() => setOpenAccordion(isOpen ? null : item.label)}
                    >
                      {item.label}
                      <ChevronIcon open={isOpen} />
                    </button>
                    {isOpen && (
                      <div className="flex flex-col pb-2 pl-4 gap-1">
                        {item.items.map((sub) => (
                          <Link
                            key={sub.href}
                            href={sub.href}
                            className={`p-2.5 rounded-xl normal-case font-medium flex items-center justify-between gap-2 ${sub.highlight ? 'text-[#00BFFF] font-black bg-[#F5FBFF]' : 'text-[#3A3A3C] hover:text-[#0A1F33] hover:bg-[#F8F9FA]'}`}
                            onClick={() => setMobileOpen(false)}
                          >
                            <span>{sub.label}</span>
                            {sub.badge && (
                              <span className="text-[10px] font-bold text-[#0080B0] bg-[#F0FBFF] border border-[#00BFFF]/25 px-2 py-0.5 rounded-full shrink-0">
                                {sub.badge}
                              </span>
                            )}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {(cta || secondaryCta) && (
              <div className="p-4 mt-auto border-t border-[#0A1F33]/10 shrink-0 flex flex-col gap-2.5 bg-[#FFFFFF]">
                {secondaryCta && (
                  <Link
                    href={secondaryCta.href}
                    className="block text-center bg-[#00BFFF] text-[#0A1F33] font-bold text-[11px] uppercase tracking-widest py-3.5 px-6 hover:bg-[#0A1F33] hover:text-[#FFFFFF] transition-all rounded-xl shadow-sm"
                    onClick={() => setMobileOpen(false)}
                  >
                    {secondaryCta.label}
                  </Link>
                )}
                {cta && (
                  <Link
                    href={cta.href}
                    className="block text-center bg-[#0A1F33] text-[#FFFFFF] font-bold text-[11px] uppercase tracking-widest py-3.5 px-6 hover:bg-[#00BFFF] hover:text-[#0A1F33] transition-all rounded-xl shadow-sm"
                    onClick={() => setMobileOpen(false)}
                  >
                    {cta.label}
                  </Link>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
