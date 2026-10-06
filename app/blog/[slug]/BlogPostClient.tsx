'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import Navbar, { NavItem } from '../../components/Navbar';
import { BlogPost } from '../../../lib/blog';
import { isValidImageSrc, isOptimizableImageSrc } from '../../../lib/imageSrc';
import { useToast } from '../../context/ToastContext';

interface BlogPostClientProps {
  post: BlogPost;
}

export default function BlogPostClient({ post }: BlogPostClientProps) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);

  const navItems: NavItem[] = [
    { type: 'link', label: 'Catálogo', href: '/catalogo' },
    { type: 'link', label: 'Promociones', href: '/promociones' },
    {
      type: 'dropdown', label: 'Herramientas', items: [
        { label: 'Comparador de Versiones', href: '/comparador' },
        { label: 'Calculadora de Cuotas', href: '/calculadora' },
        { label: 'Recomendador Interactivo', href: '/recomendador', highlight: true },
      ]
    },
    { type: 'link', label: 'Negociamos por vos', href: '/negociamos-por-vos' },
    { type: 'link', label: 'Blog & Noticias', href: '/blog' },
  ];

  const shareUrl = typeof window !== 'undefined' ? window.location.href : `https://datacarpy.com/blog/${post.slug}`;

  const handleCopyLink = () => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      showToast('Enlace copiado al portapapeles', 'success');
      setTimeout(() => setCopied(false), 2500);
    }
  };

  // Renderizador liviano de contenido markdown/texto estructurado
  const renderContent = (content: string) => {
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let listBuffer: string[] = [];

    const flushList = (key: number) => {
      if (listBuffer.length > 0) {
        elements.push(
          <ul key={`list-${key}`} className="list-disc list-inside space-y-2 my-4 text-[#3A3A3C] text-sm sm:text-base leading-relaxed pl-2">
            {listBuffer.map((item, idx) => (
              <li key={idx} className="marker:text-[#00BFFF]">
                <span dangerouslySetInnerHTML={{ __html: item.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
              </li>
            ))}
          </ul>
        );
        listBuffer = [];
      }
    };

    lines.forEach((line, index) => {
      const trimmed = line.trim();

      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        listBuffer.push(trimmed.substring(2));
        return;
      }

      flushList(index);

      if (trimmed.startsWith('## ')) {
        elements.push(
          <h2 key={index} className="text-xl sm:text-2xl font-black text-[#0A1F33] uppercase mt-10 mb-4 border-b border-[#C0C0C0]/50 pb-2" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
            {trimmed.substring(3)}
          </h2>
        );
      } else if (trimmed.startsWith('### ')) {
        elements.push(
          <h3 key={index} className="text-lg font-bold text-[#0A1F33] uppercase mt-8 mb-3" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
            {trimmed.substring(4)}
          </h3>
        );
      } else if (trimmed.startsWith('> ')) {
        elements.push(
          <blockquote key={index} className="border-l-4 border-[#00BFFF] bg-[#F8F9FA] p-4 italic text-[#3A3A3C] text-sm my-6 font-medium">
            {trimmed.substring(2)}
          </blockquote>
        );
      } else if (trimmed.length > 0) {
        elements.push(
          <p
            key={index}
            className="text-sm sm:text-base text-[#3A3A3C] leading-relaxed my-4"
            dangerouslySetInnerHTML={{ __html: trimmed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }}
          />
        );
      }
    });

    flushList(lines.length);
    return elements;
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#3A3A3C] font-sans flex flex-col">
      {/* NAVBAR */}
      <Navbar
        items={navItems}
        cta={{ label: 'Catálogo', href: '/catalogo' }}
        secondaryCta={{ label: 'Promociones', href: '/promociones' }}
      />

      {/* BREADCRUMB */}
      <div className="bg-[#FFFFFF] border-b border-[#C0C0C0] py-3 px-4 sm:px-6 lg:px-8">
        <div className="max-w-[1000px] mx-auto flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#3A3A3C]">
          <Link href="/" className="hover:text-[#00BFFF] transition-colors">Inicio</Link>
          <span>/</span>
          <Link href="/blog" className="hover:text-[#00BFFF] transition-colors">Blog</Link>
          <span>/</span>
          <span className="text-[#00BFFF]">{post.category}</span>
        </div>
      </div>

      <article className="max-w-[1000px] mx-auto w-full px-4 sm:px-6 lg:px-8 py-10 flex-grow">
        
        {/* ENCABEZADO DEL ARTÍCULO */}
        <header className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="bg-[#0A1F33] text-[#00BFFF] text-[10px] font-bold uppercase tracking-widest px-3 py-1">
              {post.category}
            </span>
            <span className="text-xs text-[#3A3A3C]">
              {post.publishedAt || 'Reciente'}
            </span>
            <span className="text-[#C0C0C0]">•</span>
            <span className="text-xs text-[#3A3A3C]">
              {post.readTimeMinutes || 4} min de lectura
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-[#0A1F33] uppercase leading-tight tracking-tight mb-4" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
            {post.title}
          </h1>

          <p className="text-sm sm:text-lg text-[#3A3A3C] leading-relaxed font-medium text-justify">
            {post.excerpt}
          </p>

          {/* AUTOR Y COMPARTIR */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4 my-6 border-y border-[#C0C0C0]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#0A1F33] text-white flex items-center justify-center font-bold text-xs border border-[#00BFFF]">
                DC
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-[#0A1F33] uppercase tracking-wider">{post.author}</span>
                <span className="text-[10px] text-[#3A3A3C]">DATACAR Paraguay • Inteligencia Automotriz</span>
              </div>
            </div>

            {/* BOTONES SOCIALES */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest mr-1">Compartir:</span>
              <a
                href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`${post.title} - ${shareUrl}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-[#25D366] text-white p-2 hover:opacity-90 transition-opacity"
                title="Compartir en WhatsApp"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z"/></svg>
              </a>
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-[#1877F2] text-white p-2 hover:opacity-90 transition-opacity"
                title="Compartir en Facebook"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              </a>
              <button
                onClick={handleCopyLink}
                className="bg-[#0A1F33] text-white p-2 hover:bg-[#00BFFF] transition-colors"
                title="Copiar Enlace"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="square" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        {/* IMAGEN DESTACADA */}
        {isValidImageSrc(post.coverImage) && (
          <div className="relative aspect-[16/9] w-full bg-[#0A1F33] border border-[#C0C0C0] mb-8 overflow-hidden">
            <Image
              src={post.coverImage}
              alt={post.title}
              fill
              priority
              sizes="(max-width: 1000px) 100vw, 1000px"
              className="object-cover"
              unoptimized={!isOptimizableImageSrc(post.coverImage)}
            />
          </div>
        )}

        {/* CUERPO DEL ARTÍCULO */}
        <div className="prose prose-neutral max-w-none">
          {renderContent(post.content)}
        </div>

        {/* BANNER INTERACTIVO DE CONVERSIÓN DATACAR */}
        <div className="mt-12 bg-[#0A1F33] text-white p-6 sm:p-8 border-l-4 border-[#00BFFF]">
          <span className="text-[10px] font-bold text-[#00BFFF] uppercase tracking-widest block mb-2">
            Herramientas Gratuitas de DATACAR
          </span>
          <h3 className="text-xl sm:text-2xl font-black uppercase text-white mb-3" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
            ¿Estás por comprar un 0KM en Paraguay?
          </h3>
          <p className="text-xs sm:text-sm text-[#C0C0C0] max-w-2xl mb-6 leading-relaxed">
            Compará fichas técnicas lado a lado, calculá tu cuota estimada con el sistema francés de amortización o descubrí qué modelo se adapta a tus necesidades con nuestro test interactivo.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/comparador"
              className="bg-[#00BFFF] text-white font-bold text-xs uppercase tracking-widest px-6 py-3 hover:bg-white hover:text-[#0A1F33] transition-colors"
            >
              Comparar Versiones
            </Link>
            <Link
              href="/calculadora"
              className="bg-transparent border border-white text-white font-bold text-xs uppercase tracking-widest px-6 py-3 hover:bg-white hover:text-[#0A1F33] transition-colors"
            >
              Calcular Cuota
            </Link>
            <Link
              href="/catalogo"
              className="bg-transparent border border-[#00BFFF] text-[#00BFFF] font-bold text-xs uppercase tracking-widest px-6 py-3 hover:bg-[#00BFFF] hover:text-white transition-colors"
            >
              Ver Catálogo Completo
            </Link>
          </div>
        </div>

        {/* VOLVER AL BLOG */}
        <div className="mt-10 border-t border-[#C0C0C0] pt-6 flex justify-between items-center">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#0A1F33] hover:text-[#00BFFF] transition-colors"
          >
            <span>← Volver al listado de artículos</span>
          </Link>
          <a
            href="https://www.instagram.com/datacarpy/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-bold uppercase tracking-wider text-[#E1306C] hover:underline"
          >
            Ver más en Instagram @datacarpy →
          </a>
        </div>
      </article>

      {/* FOOTER */}
      <footer className="w-full bg-[#0A1F33] border-t-4 border-[#00BFFF] text-[#FFFFFF] py-8 px-4 sm:px-6 lg:px-8 mt-12" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
        <div className="max-w-[1000px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#C0C0C0]">
          <div>
            <span className="font-black text-lg text-white uppercase" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>DATA<span className="font-light">CAR</span></span>
          </div>
          <p className="text-[11px]">© {new Date().getFullYear()} DATACAR PARAGUAY. Todos los derechos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
