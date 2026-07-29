'use client';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

// ==========================================
// MOCK DATA: Simulación de las Versiones que traeremos de Firebase
// ==========================================
const versionesDisponibles = [
  { id: "v1", name: "MT LT New", badge: "Entrada de gama", specs: { potencia: "116 HP", caja: "Manual", llantas: "Aleación 15\"", tapizado: "Tela" }, price: 19900 },
  { id: "v2", name: "LTZ AT New", badge: "Versión intermedia", specs: { potencia: "116 HP", caja: "Automática", llantas: "Aleación 16\"", tapizado: "Cuero" }, price: 22500 },
  { id: "v3", name: "Premier AT New", badge: "Tope de gama", specs: { potencia: "116 HP", caja: "Automática", llantas: "Aleación 16\"", tapizado: "Cuero Premium" }, price: 24900 }
];

export default function DatosModeloPage() {
  // 1. LECTURA DINÁMICA DE LA URL
  const params = useParams();
  
  // Sanitización de los parámetros de la URL para mostrarlos bonitos en el título
  const marcaParam = typeof params?.marca === 'string' ? params.marca.replace(/-/g, ' ').toUpperCase() : 'MARCA';
  const modeloParam = typeof params?.modelo === 'string' ? params.modelo.replace(/-/g, ' ').toUpperCase() : 'MODELO';

  return (
    <main className="min-h-screen bg-[#FFFFFF] text-[#3A3A3C] pb-20">
      
      {/* NAVBAR CORPORATIVO */}
      <nav className="w-full bg-[#FFFFFF] border-b border-[#C0C0C0] px-4 md:px-8 py-4 flex justify-between items-center sticky top-0 z-50">
        <div className="font-black text-2xl tracking-widest text-[#0A1F33] uppercase" style={{ fontFamily: 'Montserrat, sans-serif' }}>
          <Link href="/">DATA<span className="font-light">CAR</span></Link>
        </div>
        <div className="hidden lg:flex gap-8 text-xs font-bold uppercase items-center text-[#3A3A3C]" style={{ fontFamily: 'Inter, sans-serif' }}>
          <Link href="/catalogo" className="hover:text-[#00BFFF] transition-colors">Volver al Catálogo</Link>
        </div>
      </nav>

      {/* BREADCRUMBS DINÁMICOS */}
      <div className="max-w-[1200px] mx-auto px-4 lg:px-0 py-6">
        <p className="text-[11px] font-medium text-[#C0C0C0] uppercase tracking-wider" style={{ fontFamily: 'Inter, sans-serif' }}>
          <Link href="/" className="hover:text-[#3A3A3C] transition-colors">Inicio</Link> /{' '}
          <Link href="/catalogo" className="hover:text-[#3A3A3C] transition-colors">Catálogo</Link> /{' '}
          {marcaParam} / <span className="font-bold text-[#3A3A3C]">{modeloParam}</span>
        </p>
      </div>

      {/* HERO DEL MODELO */}
      <section className="max-w-[1200px] mx-auto px-4 lg:px-0 grid grid-cols-1 lg:grid-cols-3 gap-10 mb-16">
        
        {/* Columna Izquierda: Imagen + Banner B2B */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          
          <div className="w-full bg-[#F8F9FA] border border-[#C0C0C0] flex flex-col items-center justify-center py-12 relative">
             {/* IMAGEN DINÁMICA: Toma los nombres de la URL para simular la foto correcta */}
             <img 
               src={`https://via.placeholder.com/800x400?text=${marcaParam}+${modeloParam}`} 
               alt={`${marcaParam} ${modeloParam}`} 
               className="w-full max-w-2xl object-contain px-4" 
             />
             <div className="w-full flex justify-between items-center px-6 mt-8">
               <span className="text-[10px] font-bold text-[#00BFFF] tracking-widest uppercase">datacar.com.py</span>
               <span className="text-[10px] text-[#C0C0C0] uppercase tracking-widest">* Imagen ilustrativa</span>
             </div>
          </div>

          <div className="bg-[#0A1F33] border border-[#0A1F33] p-8 flex flex-col md:flex-row gap-8 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-2 h-full bg-[#00BFFF]"></div>
            <div className="md:w-1/3 border-r border-[#FFFFFF]/20 pr-6">
              <h3 className="font-black text-2xl text-[#FFFFFF] uppercase leading-tight mb-2" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                ¿Cómo funciona <span className="text-[#00BFFF]">DataCar?</span>
              </h3>
              <span className="bg-[#00BFFF] text-[#FFFFFF] text-[10px] font-bold uppercase px-2 py-1 tracking-widest inline-block">
                Servicio Gratuito
              </span>
            </div>
            <div className="md:w-2/3 grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <span className="text-[#00BFFF] font-black text-2xl block mb-1" style={{ fontFamily: 'Montserrat, sans-serif' }}>1. Compará ofertas</span>
                <p className="text-[#C0C0C0] text-[11px] leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>De concesionarias oficiales, al instante y con transparencia total de precios.</p>
              </div>
              <div>
                <span className="text-[#00BFFF] font-black text-2xl block mb-1" style={{ fontFamily: 'Montserrat, sans-serif' }}>2. Elegí y avanzá</span>
                <p className="text-[#C0C0C0] text-[11px] leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>Con asesoramiento B2B personalizado para garantizar la protección de tu inversión.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Columna Derecha: Tarjeta de Cotización */}
        <div className="lg:col-span-1">
          <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-8 sticky top-24">
            
            {/* TÍTULOS DINÁMICOS BASADOS EN LA URL */}
            <h1 className="font-black text-3xl text-[#0A1F33] uppercase leading-none mb-2" style={{ fontFamily: 'Montserrat, sans-serif' }}>
              <span className="font-light text-xl block mb-1">{marcaParam}</span>
              {modeloParam}
            </h1>
            <p className="text-[11px] text-[#3A3A3C] font-bold uppercase tracking-widest mb-8" style={{ fontFamily: 'Inter, sans-serif' }}>
              Vehículo 0KM • Conexión Dinámica
            </p>
            
            <div className="mb-8 border-t border-b border-[#C0C0C0] py-6">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#3A3A3C] block mb-1">Precio Desde</span>
              <p className="font-black text-4xl text-[#0A1F33]" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                US$ 19,900
              </p>
              <span className="text-[10px] text-[#C0C0C0] uppercase tracking-widest mt-1 block">+ gastos de patentamiento</span>
            </div>

            <div className="border border-[#1E8E3E] bg-[#FFFFFF] p-4 mb-8 flex items-center gap-4">
              <svg className="w-6 h-6 text-[#1E8E3E] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeLinejoin="miter" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
              <div>
                <p className="text-xs font-bold text-[#1E8E3E] uppercase tracking-wider">Compra protegida - Gratis</p>
                <p className="text-[10px] text-[#3A3A3C] mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>Sin costos adicionales ocultos.</p>
              </div>
            </div>

            <button className="w-full bg-[#00BFFF] hover:bg-[#00A0D6] text-[#FFFFFF] font-bold text-sm uppercase tracking-widest py-4 transition-colors">
              Consultar Modelo
            </button>
          </div>
        </div>
      </section>

      {/* SECCIÓN INFERIOR: TABLA DE VERSIONES */}
      <section className="max-w-[1200px] mx-auto px-4 lg:px-0">
        <div className="flex flex-col sm:flex-row justify-between items-end mb-6 border-b border-[#C0C0C0] pb-4">
          <h2 className="font-black text-2xl text-[#0A1F33] uppercase" style={{ fontFamily: 'Montserrat, sans-serif' }}>
            Precios de {marcaParam} {modeloParam} 0KM
          </h2>
          <span className="text-[11px] font-bold text-[#3A3A3C] uppercase bg-[#F5F5F5] px-4 py-2 border border-[#C0C0C0] mt-4 sm:mt-0">
            {versionesDisponibles.length} Versiones Disponibles
          </span>
        </div>

        <div className="flex flex-col gap-4">
          {versionesDisponibles.map((version) => (
            <div key={version.id} className="bg-[#FFFFFF] border border-[#C0C0C0] p-6 lg:p-8 flex flex-col md:flex-row items-center gap-8 hover:border-[#0A1F33] transition-colors group">
              
              <div className="flex-1 w-full">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
                  <h3 className="font-black text-2xl text-[#0A1F33] uppercase" style={{ fontFamily: 'Montserrat, sans-serif' }}>{version.name}</h3>
                  <span className="bg-[#0A1F33] text-[#FFFFFF] text-[10px] uppercase font-bold px-3 py-1 tracking-widest w-max">
                    {version.badge}
                  </span>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  <span className="border border-[#C0C0C0] text-[10px] uppercase font-bold px-3 py-2 text-[#3A3A3C] bg-[#F5F5F5]">Potencia: <span className="text-[#0A1F33]">{version.specs.potencia}</span></span>
                  <span className="border border-[#C0C0C0] text-[10px] uppercase font-bold px-3 py-2 text-[#3A3A3C] bg-[#F5F5F5]">Caja: <span className="text-[#0A1F33]">{version.specs.caja}</span></span>
                  <span className="border border-[#C0C0C0] text-[10px] uppercase font-bold px-3 py-2 text-[#3A3A3C] bg-[#F5F5F5]">Llantas: <span className="text-[#0A1F33]">{version.specs.llantas}</span></span>
                  <span className="border border-[#C0C0C0] text-[10px] uppercase font-bold px-3 py-2 text-[#3A3A3C] bg-[#F5F5F5]">Tapizado: <span className="text-[#0A1F33]">{version.specs.tapizado}</span></span>
                </div>
              </div>

              <div className="flex flex-col md:items-end w-full md:w-[300px] border-t md:border-t-0 md:border-l border-[#C0C0C0] pt-6 md:pt-0 md:pl-8">
                <div className="md:text-right w-full mb-6">
                  <p className="text-[10px] text-[#3A3A3C] font-bold uppercase tracking-widest mb-1">Mejor Precio</p>
                  <p className="font-black text-3xl text-[#0A1F33]" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                    US$ {version.price.toLocaleString()}
                  </p>
                </div>
                
                <div className="flex flex-col gap-3 w-full">
                  <button className="w-full bg-[#00BFFF] hover:bg-[#00A0D6] text-[#FFFFFF] font-bold uppercase text-[11px] tracking-widest py-4 transition-colors">
                    Consultar
                  </button>
                  <div className="grid grid-cols-2 gap-3">
                    <button className="bg-[#FFFFFF] border border-[#0A1F33] text-[#0A1F33] hover:bg-[#0A1F33] hover:text-[#FFFFFF] font-bold uppercase text-[10px] py-3 text-center transition-colors">
                      Ver Detalles
                    </button>
                    <button className="bg-[#F5F5F5] border border-[#C0C0C0] text-[#3A3A3C] hover:border-[#3A3A3C] font-bold uppercase text-[10px] py-3 transition-colors flex justify-center items-center gap-1">
                      <span>+</span> Comparar
                    </button>
                  </div>
                </div>

              </div>
            </div>
          ))}
        </div>
      </section>

    </main>
  );
}