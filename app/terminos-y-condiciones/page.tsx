// app/terminos-y-condiciones/page.tsx
'use client';

import React from 'react';
import Link from 'next/link';

export default function TerminosCondicionesPage() {
  return (
    <main className="min-h-screen bg-[#F8F9FA] text-[#3A3A3C] font-sans flex flex-col">
      
      {/* NAVEGACIÓN GLOBAL */}
      <nav className="w-full bg-[#FFFFFF] border-b border-[#C0C0C0] px-4 md:px-8 py-4 flex justify-between items-center sticky top-0 z-50 shadow-none">
        <div className="font-black text-2xl tracking-widest text-[#0A1F33] uppercase" style={{ fontFamily: 'Montserrat, sans-serif' }}>
          <Link href="/">DATA<span className="font-light">CAR</span></Link>
        </div>
        <div className="hidden lg:flex gap-6 font-bold text-[11px] uppercase items-center text-[#3A3A3C] tracking-wider h-full" style={{ fontFamily: 'Inter, sans-serif' }}>
          <Link href="/recomendador" className="hover:text-[#00BFFF] transition-colors">Recomendador</Link>
          <Link href="/negociamos-por-vos" className="hover:text-[#00BFFF] transition-colors">Negociamos por vos</Link>
          <Link href="/catalogo" className="hover:text-[#00BFFF] transition-colors">Catálogo</Link>
        </div>
      </nav>

      {/* HEADER DE SECCIÓN */}
      <header className="bg-[#0A1F33] border-b-4 border-[#00BFFF] py-16 px-4">
        <div className="max-w-[800px] mx-auto text-center">
          <p className="text-[10px] font-bold text-[#00BFFF] uppercase tracking-widest mb-4">Documento Legal e Informativo</p>
          <h1 className="font-black text-3xl md:text-5xl text-[#FFFFFF] uppercase tracking-wide mb-4" style={{ fontFamily: 'Montserrat, sans-serif' }}>
            Términos y <span className="text-[#00BFFF]">Condiciones</span>
          </h1>
          <p className="text-sm text-[#C0C0C0] font-medium leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>
            Transparencia total en el manejo de datos, precios y procesos operativos de nuestra plataforma.
          </p>
        </div>
      </header>

      {/* CONTENIDO LEGAL (ESTRUCTURA DE LECTURA ERGONÓMICA) */}
      <section className="flex-grow py-16 px-4">
        <div className="max-w-[800px] mx-auto bg-[#FFFFFF] border border-[#C0C0C0] p-8 md:p-12 shadow-none rounded-none" style={{ fontFamily: 'Inter, sans-serif' }}>
          
          <div className="mb-8 border-b border-[#C0C0C0] pb-8">
            <h2 className="text-xl font-bold text-[#0A1F33] uppercase tracking-widest mb-4" style={{ fontFamily: 'Montserrat, sans-serif' }}>1. Naturaleza de la Plataforma e Inventario</h2>
            <p className="text-sm text-[#3A3A3C] leading-relaxed mb-4">
              DATACAR actúa como un integrador tecnológico y facilitador de información B2B/B2C en el rubro automotriz paraguayo. <strong>Nuestra empresa no es propietaria del stock de vehículos exhibidos en la plataforma.</strong> 
            </p>
            <p className="text-sm text-[#3A3A3C] leading-relaxed">
              La totalidad del inventario, la disponibilidad de unidades y los tiempos de entrega dependen exclusivamente de la red de representantes y concesionarias oficiales asociadas a nuestra matriz.
            </p>
          </div>

          <div className="mb-8 border-b border-[#C0C0C0] pb-8">
            <h2 className="text-xl font-bold text-[#0A1F33] uppercase tracking-widest mb-4" style={{ fontFamily: 'Montserrat, sans-serif' }}>2. Dinámica y Variación de Precios</h2>
            <p className="text-sm text-[#3A3A3C] leading-relaxed mb-4">
              La industria automotriz y de importación está sujeta a fluctuaciones del mercado, costos de flete internacional e impuestos aduaneros. Por lo tanto, <strong>los precios publicados en el catálogo pueden sufrir variaciones sin previo aviso.</strong>
            </p>
            <p className="text-sm text-[#3A3A3C] leading-relaxed">
              Los valores expresados son referenciales y corresponden al precio de lista al contado proporcionado por las concesionarias. Estos montos <strong>no incluyen</strong> aranceles de escribanía, trámites de patentamiento municipal ni pólizas de seguro automotor. El precio final y vinculante será el acordado formalmente entre el cliente y el representante comercial de la concesionaria.
            </p>
          </div>

          <div className="mb-8 border-b border-[#C0C0C0] pb-8">
            <h2 className="text-xl font-bold text-[#0A1F33] uppercase tracking-widest mb-4" style={{ fontFamily: 'Montserrat, sans-serif' }}>3. Exactitud de Especificaciones Técnicas</h2>
            <p className="text-sm text-[#3A3A3C] leading-relaxed mb-4">
              Nuestro equipo audita y estructura la información para ofrecer el mejor comparador del mercado. Sin embargo, las fichas técnicas, equipamiento estándar, dimensiones y características de motorización <strong>son suministradas directamente por las concesionarias y marcas importadoras.</strong>
            </p>
            <div className="bg-[#F8F9FA] border-l-4 border-[#0A1F33] p-4 my-4">
              <p className="text-xs text-[#0A1F33] font-bold uppercase tracking-widest mb-1">Nota de Seguridad:</p>
              <p className="text-xs text-[#3A3A3C]">
                Las configuraciones de equipamiento pueden cambiar según el lote de importación. Para su absoluta seguridad y antes de cerrar cualquier operación, le instamos a verificar el equipamiento final en la ficha técnica oficial entregada por el asesor comercial de la marca.
              </p>
            </div>
          </div>

          <div className="mb-8 border-b border-[#C0C0C0] pb-8">
            <h2 className="text-xl font-bold text-[#0A1F33] uppercase tracking-widest mb-4" style={{ fontFamily: 'Montserrat, sans-serif' }}>4. Simulaciones y Calculadora Financiera</h2>
            <p className="text-sm text-[#3A3A3C] leading-relaxed mb-4">
              Las proyecciones de financiamiento, tasas de interés (TAE/TNA) y montos de cuotas arrojados por nuestras calculadoras o estimadores son <strong>estrictamente estimaciones de carácter informativo.</strong>
            </p>
            <p className="text-sm text-[#3A3A3C] leading-relaxed">
              Los valores finales estarán sujetos a la aprobación crediticia por parte de las entidades bancarias o financieras de plaza, su historial crediticio, y a las condiciones vigentes al momento de la facturación.
            </p>
            <div className="mt-4">
              <Link href="/calculadora" className="text-[10px] font-bold text-[#00BFFF] uppercase tracking-widest hover:text-[#0A1F33] transition-colors flex items-center gap-1">
                Ir a la Calculadora Financiera →
              </Link>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-bold text-[#0A1F33] uppercase tracking-widest mb-4" style={{ fontFamily: 'Montserrat, sans-serif' }}>5. Modificaciones y Contacto</h2>
            <p className="text-sm text-[#3A3A3C] leading-relaxed mb-4">
              DATACAR se reserva el derecho de actualizar, modificar o reemplazar estos Términos y Condiciones en cualquier momento, con el fin de alinearlos a nuevas normativas comerciales o mejoras operativas.
            </p>
            <p className="text-sm text-[#3A3A3C] leading-relaxed">
              Si tiene dudas sobre algún dato específico de un vehículo o necesita asistencia con nuestra plataforma comercial, póngase en contacto con nuestra gerencia escribiendo a: <a href="mailto:aldo.ojeda@datacarpy.com" className="text-[#00BFFF] font-bold hover:underline">aldo.ojeda@datacarpy.com</a>.
            </p>
          </div>

        </div>

        {/* CONTENEDOR DE RETORNO (UX) */}
        <div className="max-w-[800px] mx-auto mt-8 flex flex-col sm:flex-row justify-center gap-4">
          <Link href="/" className="bg-[#FFFFFF] border border-[#C0C0C0] text-[#3A3A3C] font-bold text-[10px] uppercase tracking-widest px-8 py-4 text-center hover:border-[#0A1F33] transition-colors rounded-none outline-none">
            Volver a la Portada
          </Link>
          <Link href="/catalogo" className="bg-[#0A1F33] border border-[#0A1F33] text-[#FFFFFF] font-bold text-[10px] uppercase tracking-widest px-8 py-4 text-center hover:bg-[#00BFFF] hover:border-[#00BFFF] transition-colors rounded-none outline-none">
            Explorar el Catálogo 0km
          </Link>
        </div>

      </section>

      {/* FOOTER CORPORATIVO */}
      <footer className="w-full bg-[#0A1F33] border-t-4 border-[#00BFFF] py-12 px-4 text-center mt-auto">
        <div className="max-w-[800px] mx-auto flex flex-col items-center">
          <div className="font-black text-2xl tracking-widest text-[#FFFFFF] uppercase mb-6" style={{ fontFamily: 'Montserrat, sans-serif' }}>
            DATA<span className="font-light">CAR</span>
          </div>
          <p className="text-[10px] text-[#C0C0C0] uppercase tracking-widest font-medium">
            © {new Date().getFullYear()} DATACAR. Inteligencia de Mercado Automotriz en Paraguay.
          </p>
        </div>
      </footer>

    </main>
  );
}   