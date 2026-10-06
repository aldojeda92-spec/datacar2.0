'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import Navbar, { NavItem } from '../components/Navbar';
import InstagramReelsSection from '../components/InstagramReelsSection';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { isValidImageSrc, isOptimizableImageSrc } from '../../lib/imageSrc';
import { BlogPost } from '../../lib/blog';

const CATEGORIES = ['Todas', 'Guías de Compra', 'Comparativas', 'Financiación', 'Lanzamientos 0KM', 'Mercado'];

export default function BlogClient() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

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
    { type: 'link', label: 'Blog & Noticias', href: '/blog', current: true },
  ];

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        const snap = await getDocs(collection(db, 'blog_posts'));
        if (!snap.empty) {
          const list: BlogPost[] = [];
          snap.forEach(docSnap => {
            const data = docSnap.data();
            if (data.published !== false) {
              list.push({
                id: docSnap.id,
                title: data.title || '',
                slug: data.slug || docSnap.id,
                category: data.category || 'Novedades',
                excerpt: data.excerpt || '',
                content: data.content || '',
                coverImage: data.coverImage || '',
                author: data.author || 'Redacción DATACAR',
                published: true,
                publishedAt: data.publishedAt || '',
                readTimeMinutes: Number(data.readTimeMinutes) || 4,
                relatedModelIds: data.relatedModelIds || [],
              });
            }
          });
          if (list.length > 0) {
            setPosts(list);
          }
        }
      } catch (err) {
        console.warn('Cargando posts de referencia:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchPosts();
  }, []);

  const filteredPosts = useMemo(() => {
    return posts.filter(post => {
      const matchesCategory = selectedCategory === 'Todas' || post.category.toLowerCase() === selectedCategory.toLowerCase();
      const matchesSearch = searchQuery.trim() === '' ||
        post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.excerpt.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [posts, selectedCategory, searchQuery]);

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#3A3A3C] font-sans flex flex-col">
      {/* NAVBAR */}
      <Navbar
        items={navItems}
        cta={{ label: 'Catálogo', href: '/catalogo' }}
        secondaryCta={{ label: 'Promociones', href: '/promociones' }}
      />

      {/* HERO DEL BLOG */}
      <section className="bg-[#0A1F33] border-b-4 border-[#00BFFF] text-white pt-16 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="max-w-2xl">
            <span className="text-[10px] font-bold text-[#00BFFF] uppercase tracking-widest block mb-2">
              Inteligencia Automotriz • DATACAR
            </span>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black uppercase tracking-tight text-white leading-tight" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
              Blog, Guías de Compra & <span className="text-[#00BFFF]">Noticias 0KM</span>
            </h1>
            <p className="mt-3 text-sm sm:text-base text-[#C0C0C0] leading-relaxed">
              Análisis imparciales de mercado, comparativas reales entre versiones, guías de financiación con cuotas corridas y novedades del sector automotor paraguayo.
            </p>
          </div>

          {/* BUSCADOR DE NOTAS */}
          <div className="w-full md:w-80">
            <div className="relative">
              <input
                type="text"
                placeholder="Buscar artículo o tema..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-[#FFFFFF] text-[#0A1F33] text-xs px-4 py-3 border border-transparent focus:border-[#00BFFF] outline-none font-medium placeholder:text-[#C0C0C0] rounded-none"
              />
              <span className="absolute right-3 top-3 text-[#C0C0C0]">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="square" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* SECCIÓN REELS / RESEÑAS EN VIDEO (IDÉNTICO A LA REFERENCIA) */}
      <InstagramReelsSection />

      {/* FILTROS POR CATEGORÍA */}
      <section className="bg-[#FFFFFF] border-b border-[#C0C0C0] px-4 sm:px-6 lg:px-8 sticky top-[64px] z-30">
        <div className="max-w-[1400px] mx-auto flex items-center gap-2 overflow-x-auto py-3 no-scrollbar">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`text-xs font-bold uppercase tracking-wider px-4 py-2 whitespace-nowrap transition-colors rounded-none border ${
                selectedCategory === cat
                  ? 'bg-[#0A1F33] text-[#FFFFFF] border-[#0A1F33]'
                  : 'bg-[#F8F9FA] text-[#3A3A3C] border-[#C0C0C0]/60 hover:border-[#0A1F33]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </section>

      {/* LISTADO DE ARTÍCULOS */}
      <main className="flex-grow py-12 px-4 sm:px-6 lg:px-8 max-w-[1400px] mx-auto w-full">
        {loading ? (
          <div className="text-center py-20 bg-[#FFFFFF] border border-[#C0C0C0] p-8">
            <span className="text-xs font-bold uppercase tracking-widest text-[#00BFFF]">Cargando artículos...</span>
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="text-center py-20 bg-[#FFFFFF] border border-[#C0C0C0] p-8 max-w-2xl mx-auto">
            <span className="w-12 h-12 rounded-full bg-[#0A1F33] text-[#00BFFF] inline-flex items-center justify-center font-black text-sm mb-4 border border-[#00BFFF]/30">DC</span>
            <h3 className="font-black text-xl text-[#0A1F33] uppercase mb-2" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
              {posts.length === 0 ? 'Próximamente: Artículos & Guías 0KM' : 'No se encontraron artículos'}
            </h3>
            <p className="text-xs sm:text-sm text-[#3A3A3C] max-w-lg mx-auto leading-relaxed">
              {posts.length === 0
                ? 'Estamos redactando los mejores análisis de mercado, comparativas reales y guías de financiación en cuotas para compradores en Paraguay. Muy pronto vas a poder leer aquí los nuevos artículos de nuestro equipo.'
                : 'Probá con otro término de búsqueda o seleccioná otra categoría.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredPosts.map((post) => (
              <article
                key={post.id}
                className="bg-[#FFFFFF] border border-[#C0C0C0] flex flex-col justify-between hover:border-[#0A1F33] transition-all duration-200 group overflow-hidden"
              >
                <div>
                  {/* IMAGEN DE PORTADA */}
                  <Link href={`/blog/${post.slug}`} className="block relative aspect-[16/9] w-full bg-[#0A1F33] overflow-hidden">
                    {isValidImageSrc(post.coverImage) ? (
                      <Image
                        src={post.coverImage}
                        alt={post.title}
                        fill
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                        unoptimized={!isOptimizableImageSrc(post.coverImage)}
                      />
                    ) : (
                      <div className="w-full h-full bg-[#0A1F33] flex items-center justify-center text-[#FFFFFF]/30 text-xs font-bold">
                        DATACAR Blog
                      </div>
                    )}
                    <span className="absolute top-3 left-3 bg-[#0A1F33]/90 text-[#00BFFF] border border-[#00BFFF]/30 text-[9px] font-bold uppercase tracking-widest px-2.5 py-1">
                      {post.category}
                    </span>
                  </Link>

                  {/* CONTENIDO DE LA TARJETA */}
                  <div className="p-5 sm:p-6">
                    <div className="flex items-center gap-2 text-[10px] text-[#3A3A3C] font-medium uppercase tracking-wider mb-2">
                      <span>{post.publishedAt || 'Reciente'}</span>
                      <span>•</span>
                      <span>{post.readTimeMinutes || 4} min de lectura</span>
                    </div>

                    <h2 className="text-base sm:text-lg font-black text-[#0A1F33] uppercase leading-snug group-hover:text-[#00BFFF] transition-colors mb-2.5" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
                      <Link href={`/blog/${post.slug}`}>
                        {post.title}
                      </Link>
                    </h2>

                    <p className="text-xs text-[#3A3A3C] line-clamp-3 leading-relaxed">
                      {post.excerpt}
                    </p>
                  </div>
                </div>

                {/* ACCIÓN INFERIOR */}
                <div className="p-5 sm:p-6 pt-0 mt-auto">
                  <Link
                    href={`/blog/${post.slug}`}
                    className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#0A1F33] group-hover:text-[#00BFFF] transition-colors border-t border-[#C0C0C0]/40 pt-4 w-full"
                  >
                    <span>Leer artículo completo</span>
                    <span className="transition-transform group-hover:translate-x-1">→</span>
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="w-full bg-[#0A1F33] border-t-4 border-[#00BFFF] text-[#FFFFFF] py-12 px-4 sm:px-6 lg:px-8 mt-12" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
        <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-[#C0C0C0]">
          <div>
            <span className="font-black text-xl text-white uppercase" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>DATA<span className="font-light">CAR</span></span>
            <p className="text-[11px] mt-1">Inteligencia Automotriz y Transparencia para tu próximo 0KM en Paraguay.</p>
          </div>
          <div className="flex items-center gap-6 text-[10px] uppercase font-bold tracking-widest text-[#00BFFF]">
            <Link href="/catalogo" className="hover:text-white transition-colors">Catálogo</Link>
            <Link href="/promociones" className="hover:text-white transition-colors">Promociones</Link>
            <Link href="/comparador" className="hover:text-white transition-colors">Comparador</Link>
            <Link href="/calculadora" className="hover:text-white transition-colors">Calculadora</Link>
            <a href="https://instagram.com/datacarpy" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Instagram</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
