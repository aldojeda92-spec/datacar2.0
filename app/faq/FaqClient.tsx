// app/faq/page.tsx
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Navbar, { NavItem } from '../components/Navbar';

const NAV_ITEMS: NavItem[] = [
  { type: 'link', label: 'Recomendador', href: '/recomendador' },
  { type: 'link', label: 'Negociamos por vos', href: '/negociamos-por-vos' },
  { type: 'link', label: 'Catálogo', href: '/catalogo' },
];

// ==========================================
// DATA DE PREGUNTAS FRECUENTES (RAM)
// ==========================================
const faqData = [
  {
    pregunta: "¿Qué es exactamente DATACAR?",
    respuesta: "No somos una concesionaria. DATACAR es una plataforma B2B/B2C de inteligencia de mercado. Consolidamos, auditamos y estructuramos la información de todos los vehículos 0km disponibles en Paraguay a través de representantes oficiales. Nuestro objetivo es que tomes decisiones de inversión basadas en datos duros, no en emociones.",
    linkUrl: "/catalogo",
    linkText: "Explorar el Catálogo"
  },
  {
    pregunta: "¿Los precios publicados son finales?",
    respuesta: "Los precios mostrados son los valores oficiales de lista al contado proporcionados por las concesionarias. No incluyen gastos de patentamiento, escribanía ni seguros, ya que estos varían según la negociación final y las normativas municipales.",
    linkUrl: "/calculadora",
    linkText: "Usar Calculadora Financiera"
  },
  {
    pregunta: "¿Qué significa el servicio 'Negociamos por vos'?",
    respuesta: "Es nuestro servicio premium. En lugar de que visites múltiples concesionarias y negocies con distintos asesores, un especialista de DATACAR toma tu caso. Nosotros cruzamos información, peleamos el mejor precio, buscamos disponibilidad inmediata y te entregamos la mejor oferta en bandeja.",
    linkUrl: "/negociamos-por-vos",
    linkText: "Conocer más del servicio"
  },
  {
    pregunta: "¿Venden autos usados o importados vía Iquique?",
    respuesta: "No. En DATACAR nos enfocamos exclusivamente en vehículos 0km respaldados por los representantes oficiales de las marcas en Paraguay. Esto garantiza el acceso a garantías de fábrica, servicio técnico autorizado y repuestos legítimos.",
    linkUrl: null,
    linkText: null
  },
  {
    pregunta: "No sé qué auto comprar, ¿cómo me pueden ayudar?",
    respuesta: "Hemos desarrollado un Motor de Recomendación Inteligente. Al responder unas breves preguntas sobre tu estilo de vida, presupuesto y necesidades técnicas, nuestro algoritmo cruza la base de datos y te arroja los modelos con el mayor porcentaje de compatibilidad (Match).",
    linkUrl: "/recomendador",
    linkText: "Usar el Recomendador Inteligente"
  },
  {
    pregunta: "¿Tiene algún costo buscar autos en la plataforma?",
    respuesta: "El uso del Catálogo, el Comparador y el Recomendador Inteligente es 100% gratuito para el usuario final. DATACAR opera mediante alianzas estratégicas B2B con las redes de concesionarias oficiales.",
    linkUrl: "/",
    linkText: "Volver al Inicio"
  }
];

export default function FaqClient() {
  const [openIndex, setOpenIndex] = useState<number | null>(0); // La primera abierta por defecto

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <main className="min-h-screen bg-[#F8F9FA] text-[#3A3A3C] font-sans flex flex-col">
      
      {/* NAVEGACIÓN GLOBAL (Referencial) */}
      <Navbar items={NAV_ITEMS} />

      {/* HEADER DE SECCIÓN */}
      <header className="bg-[#0A1F33] border-b-4 border-[#00BFFF] py-16 px-4">
        <div className="max-w-[800px] mx-auto text-center">
          <h1 className="font-black text-3xl md:text-5xl text-[#FFFFFF] uppercase tracking-wide mb-4" style={{ fontFamily: 'Montserrat, sans-serif' }}>
            Respuestas Claras.<br/><span className="text-[#00BFFF]">Sin Rodeos.</span>
          </h1>
          <p className="text-sm text-[#C0C0C0] font-medium leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>
            Todo lo que necesitas saber sobre nuestra plataforma de inteligencia automotriz y cómo operamos en el mercado de 0km.
          </p>
        </div>
      </header>

      {/* CONTENIDO FAQ (ACORDEÓN FLAT DESIGN) */}
      <section className="flex-grow py-16 px-4">
        <div className="max-w-[800px] mx-auto bg-[#FFFFFF] border border-[#C0C0C0] flex flex-col shadow-none rounded-none">
          {faqData.map((faq, index) => {
            const isOpen = openIndex === index;
            
            return (
              <div key={index} className="border-b border-[#C0C0C0] last:border-b-0">
                <button
                  onClick={() => toggleFAQ(index)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-page-panel-${index}`}
                  className="w-full text-left p-6 flex justify-between items-center bg-[#FFFFFF] hover:bg-[#F8F9FA] transition-colors outline-none cursor-pointer group"
                >
                  <span 
                    className={`font-bold text-sm md:text-base pr-8 transition-colors ${isOpen ? 'text-[#00BFFF]' : 'text-[#0A1F33] group-hover:text-[#00BFFF]'}`} 
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  >
                    {faq.pregunta}
                  </span>
                  <div className={`w-6 h-6 flex items-center justify-center shrink-0 border transition-colors duration-300 ${isOpen ? 'border-[#00BFFF] bg-[#00BFFF] text-[#FFFFFF]' : 'border-[#C0C0C0] text-[#0A1F33]'}`}>
                    <span className="font-mono text-sm leading-none">{isOpen ? '−' : '+'}</span>
                  </div>
                </button>
                
                <div
                  id={`faq-page-panel-${index}`}
                  className={`overflow-hidden transition-all duration-300 ease-in-out bg-[#F8F9FA] ${isOpen ? 'max-h-[500px] opacity-100 border-t border-[#C0C0C0]/50' : 'max-h-0 opacity-0'}`}
                >
                  <div className="p-6">
                    <p className="text-[#3A3A3C] text-sm leading-relaxed mb-4 font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {faq.respuesta}
                    </p>
                    
                    {/* INYECCIÓN DE ENLACE INTERNO (CTA B2C) */}
                    {faq.linkUrl && faq.linkText && (
                      <Link href={faq.linkUrl} className="inline-block mt-2 border border-[#0A1F33] bg-[#FFFFFF] text-[#0A1F33] px-6 py-3 text-[10px] font-bold uppercase tracking-widest hover:bg-[#0A1F33] hover:text-[#FFFFFF] transition-colors rounded-none outline-none">
                        {faq.linkText} →
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* FOOTER CALL TO ACTION */}
      <footer className="w-full bg-[#FFFFFF] border-t border-[#C0C0C0] py-16 px-4 text-center">
        <div className="max-w-[600px] mx-auto">
          <h2 className="font-black text-2xl text-[#0A1F33] uppercase mb-4" style={{ fontFamily: 'Montserrat, sans-serif' }}>
            ¿Aún no encuentras tu respuesta?
          </h2>
          <p className="text-xs text-[#3A3A3C] uppercase tracking-widest mb-8 font-bold">
            Contacta directamente con nuestra gerencia operativa.
          </p>
          <a href="mailto:aldo.ojeda@datacarpy.com" className="inline-block bg-[#00BFFF] text-[#0A1F33] font-bold text-xs uppercase tracking-widest px-8 py-4 hover:bg-[#0A1F33] hover:text-[#FFFFFF] transition-colors rounded-none">
            Escribir a Soporte B2B
          </a>
        </div>
      </footer>

    </main>
  );
}