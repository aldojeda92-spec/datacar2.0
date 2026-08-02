// app/politica-de-privacidad/page.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import LegalFooter from '../components/LegalFooter';

export default function PoliticaClient() {
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
          <p className="text-[10px] font-bold text-[#00BFFF] uppercase tracking-widest mb-4">Tratamiento de Datos Personales</p>
          <h1 className="font-black text-3xl md:text-5xl text-[#FFFFFF] uppercase tracking-wide mb-4" style={{ fontFamily: 'Montserrat, sans-serif' }}>
            Política de <span className="text-[#00BFFF]">Privacidad</span>
          </h1>
          <p className="text-sm text-[#C0C0C0] font-medium leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>
            Tus datos son tuyos. Aquí te explicamos exactamente cómo los protegemos y con quién los compartimos para conseguirte el mejor trato.
          </p>
        </div>
      </header>

      {/* CONTENIDO LEGAL (ESTRUCTURA DE LECTURA ERGONÓMICA) */}
      <section className="flex-grow py-16 px-4">
        <div className="max-w-[800px] mx-auto bg-[#FFFFFF] border border-[#C0C0C0] p-8 md:p-12 shadow-none rounded-none" style={{ fontFamily: 'Inter, sans-serif' }}>
          
          <div className="mb-8 border-b border-[#C0C0C0] pb-8">
            <h2 className="text-xl font-bold text-[#0A1F33] uppercase tracking-widest mb-4" style={{ fontFamily: 'Montserrat, sans-serif' }}>1. Recopilación y Uso de la Información</h2>
            <p className="text-sm text-[#3A3A3C] leading-relaxed mb-4">
              Para brindarte un servicio personalizado de cotización, comparación y asesoramiento automotriz, recopilamos datos de contacto básicos (como tu nombre, número de teléfono y correo electrónico) cuando interactúas con nuestros formularios, el recomendador inteligente o solicitas una asesoría.
            </p>
            <p className="text-sm text-[#3A3A3C] leading-relaxed">
              Esta información se utiliza única y exclusivamente para gestionar tu solicitud de compra de un vehículo 0km y facilitarte el mejor escenario de negociación posible.
            </p>
          </div>

          <div className="mb-8 border-b border-[#C0C0C0] pb-8">
            <h2 className="text-xl font-bold text-[#00BFFF] uppercase tracking-widest mb-4" style={{ fontFamily: 'Montserrat, sans-serif' }}>2. Privacidad Estricta: ¿Quién ve tus datos?</h2>
            <p className="text-sm text-[#3A3A3C] leading-relaxed mb-4">
              En DATACAR operamos bajo una política de confidencialidad de <strong>Confianza Cero (Zero-Trust) con terceros</strong>. Tu información personal se maneja bajo el siguiente esquema estricto:
            </p>
            <ul className="list-disc pl-5 text-sm text-[#3A3A3C] leading-relaxed mb-4 space-y-2">
              <li><strong>DATACAR Central:</strong> Conservamos tus datos en nuestros servidores seguros para darle seguimiento a tu caso y asegurar la calidad de la atención.</li>
              <li><strong>La Concesionaria Oficial:</strong> Solo compartimos tus datos con la concesionaria o representante oficial de la marca que <em>tú seleccionaste explícitamente</em> al solicitar una cotización.</li>
            </ul>
            <div className="bg-[#FFE6E6] border-l-4 border-[#D93025] p-4 my-4">
              <p className="text-xs text-[#D93025] font-bold uppercase tracking-widest mb-1">Garantía Anti-Spam:</p>
              <p className="text-xs text-[#3A3A3C] font-medium">
                Bajo ninguna circunstancia venderemos, alquilaremos ni cederemos tus datos a bases de datos de telemarketing, agencias de publicidad externas, brokers de datos u otras concesionarias que no hayas solicitado.
              </p>
            </div>
          </div>

          <div className="mb-8 border-b border-[#C0C0C0] pb-8">
            <h2 className="text-xl font-bold text-[#0A1F33] uppercase tracking-widest mb-4" style={{ fontFamily: 'Montserrat, sans-serif' }}>3. Comunicaciones y tu Consentimiento</h2>
            <p className="text-sm text-[#3A3A3C] leading-relaxed mb-4">
              Al enviarnos tus datos a través de cualquier formulario en DATACAR, <strong>brindas tu consentimiento expreso</strong> para recibir comunicaciones transaccionales (cotizaciones, respuestas a tus dudas) y comunicaciones comerciales (oportunidades de 0km, variaciones de precio o lanzamientos) a través de correo electrónico, WhatsApp o llamadas telefónicas.
            </p>
            <div className="bg-[#F8F9FA] border border-[#C0C0C0] p-4 my-4 flex items-start gap-4">
              <div className="text-[#00BFFF] text-2xl">↺</div>
              <div>
                <p className="text-[11px] text-[#0A1F33] font-bold uppercase tracking-widest mb-1">Derecho de Baja (Opt-out)</p>
                <p className="text-xs text-[#3A3A3C]">
                  El control siempre lo tienes tú. Puedes revocar tu consentimiento y solicitar la baja de nuestras comunicaciones en cualquier momento. Solo debes hacer clic en "Darse de baja" al final de nuestros correos, o escribirnos directamente solicitando tu exclusión temporal o definitiva.
                </p>
              </div>
            </div>
          </div>

          <div className="mb-8 border-b border-[#C0C0C0] pb-8">
            <h2 className="text-xl font-bold text-[#0A1F33] uppercase tracking-widest mb-4" style={{ fontFamily: 'Montserrat, sans-serif' }}>4. Seguridad de la Información</h2>
            <p className="text-sm text-[#3A3A3C] leading-relaxed mb-4">
              Utilizamos infraestructura de grado empresarial (Google Firebase) para alojar nuestra base de datos. Aplicamos protocolos de cifrado y controles de acceso estrictos basados en roles (RBAC) para garantizar que solo el personal autorizado y la concesionaria correspondiente puedan visualizar tu solicitud.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-[#0A1F33] uppercase tracking-widest mb-4" style={{ fontFamily: 'Montserrat, sans-serif' }}>5. Contacto sobre Privacidad</h2>
            <p className="text-sm text-[#3A3A3C] leading-relaxed mb-4">
              Si tienes preguntas sobre cómo manejamos tu información, deseas ejercer tu derecho de modificación de datos o solicitar la eliminación total de tu registro de nuestros servidores, contáctanos:
            </p>
            <p className="text-sm text-[#3A3A3C] font-bold">
              Responsable de Datos: <a href="mailto:aldo.ojeda@datacarpy.com" className="text-[#00BFFF] font-bold hover:underline">aldo.ojeda@datacarpy.com</a>
            </p>
          </div>

        </div>

        {/* CONTENEDOR DE RETORNO (UX) */}
        <div className="max-w-[800px] mx-auto mt-8 flex flex-col sm:flex-row justify-center gap-4">
          <Link href="/" className="bg-[#FFFFFF] border border-[#C0C0C0] text-[#3A3A3C] font-bold text-[10px] uppercase tracking-widest px-8 py-4 text-center hover:border-[#0A1F33] transition-colors rounded-none outline-none">
            Volver a la Portada
          </Link>
          <Link href="/terminos-y-condiciones" className="bg-[#0A1F33] border border-[#0A1F33] text-[#FFFFFF] font-bold text-[10px] uppercase tracking-widest px-8 py-4 text-center hover:bg-[#00BFFF] hover:border-[#00BFFF] transition-colors rounded-none outline-none">
            Ver Términos y Condiciones
          </Link>
        </div>

      </section>

      {/* FOOTER CORPORATIVO */}
      <LegalFooter />

    </main>
  );
}