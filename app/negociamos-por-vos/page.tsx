'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { getCachedBrands, getCachedModels } from '../../lib/catalogCache';
import LeadModal from '../components/LeadModal'; // INYECCIÓN DEL MODAL B2B
import SimpleFooter from '../components/SimpleFooter';

// ==========================================
// INTERFACES
// ==========================================
interface BrandItem { id: string; name: string; }
interface ModelItem { id: string; brandId: string; name: string; }

export default function NegociamosPorVosPage() {
  const [loadingData, setLoadingData] = useState(true);
  const [brands, setBrands] = useState<BrandItem[]>([]);
  const [models, setModels] = useState<ModelItem[]>([]);

  // Estados del Formulario (Ahora simplificado)
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  
  // Estado para gatillar el LeadModal
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Estado del Acordeón FAQ
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // ==========================================
  // 1. CARGA DE BASE DE DATOS B2B
  // ==========================================
  useEffect(() => {
    const fetchVehicles = async () => {
      try {
        const [brandsData, modelsData] = await Promise.all([
          getCachedBrands(),
          getCachedModels(),
        ]);

        setBrands(brandsData.map(d => ({ id: d.id, name: d.name })).sort((a, b) => a.name.localeCompare(b.name)));
        setModels(modelsData.map(d => ({ id: d.id, brandId: d.brandId, name: d.name })).sort((a, b) => a.name.localeCompare(b.name)));
      } catch (error) {
        console.error("Error cargando base de datos:", error);
      } finally {
        setLoadingData(false);
      }
    };
    fetchVehicles();
  }, []);

  const filteredModels = useMemo(() => models.filter(m => m.brandId === selectedBrand), [models, selectedBrand]);

  const faqs = [
    { q: '¿Qué incluye exactamente el servicio?', a: 'Incluye la búsqueda del vehículo en toda nuestra red oficial, negociación del precio final (flete, patentamiento y accesorios), auditoría de la documentación y acompañamiento personalizado hasta el día que retirás tu 0km.' },
    { q: '¿Puedo elegir cualquier marca y modelo?', a: 'Sí. Seleccioná el auto que tenés en mente en el formulario. Si todavía estás comparando opciones, un especialista te ayudará a tomar la decisión final con datos objetivos.' },
    { q: '¿El costo del servicio cuenta como seña del auto?', a: 'No. El pago de US$ 200 es exclusivo por nuestros honorarios de gestión comercial, auditoría y negociación B2B. No representa un anticipo a cuenta del vehículo.' },
    { q: '¿Me ayudan con la entrega de mi usado?', a: 'No gestionamos la venta de usados entre particulares, pero sí negociamos fuertemente el valor de toma de tu usado frente a la concesionaria para que no pierdas rentabilidad en la permuta.' },
    { q: '¿Tengo que hablar yo con el vendedor de la agencia?', a: 'En absoluto. Nosotros somos tu escudo. Centralizamos todas las llamadas, presupuestos y peleas de precios. Solo intervenís para firmar los documentos y retirar el auto.' }
  ];

  // Cálculo de variables para el Modal
  const brandName = brands.find(b => b.id === selectedBrand)?.name || 'Marca a definir';
  const modelName = models.find(m => m.id === selectedModel)?.name || 'Modelo a definir';

  return (
    <main className="min-h-screen bg-[#F8F9FA] text-[#3A3A3C] font-sans flex flex-col">
      
      {/* ==========================================
          NAVBAR CORPORATIVO (Flat Design)
          ========================================== */}
      <nav className="w-full bg-[#FFFFFF] border-b border-[#C0C0C0] px-4 md:px-8 py-4 flex justify-between items-center sticky top-0 z-50 shadow-none">
        <div className="font-black text-2xl tracking-widest text-[#0A1F33] uppercase" style={{ fontFamily: 'Montserrat, sans-serif' }}>
          <Link href="/">DATA<span className="font-light">CAR</span></Link>
        </div>
        <div className="hidden md:flex gap-6 font-bold text-[11px] uppercase items-center text-[#3A3A3C] tracking-wider" style={{ fontFamily: 'Inter, sans-serif' }}>
          <Link href="/recomendador" className="hover:text-[#00BFFF] transition-colors">Recomendador</Link>
          <Link href="/comparador" className="hover:text-[#00BFFF] transition-colors">Comparador</Link>
          <Link href="/catalogo" className="hover:text-[#00BFFF] transition-colors">Catálogo</Link>
        </div>
        <Link href="/catalogo" className="bg-[#FFFFFF] border border-[#0A1F33] text-[#0A1F33] font-bold text-[11px] uppercase tracking-widest py-3 px-8 hover:bg-[#0A1F33] hover:text-[#FFFFFF] transition-colors rounded-none">
          Explorar Autos
        </Link>
      </nav>

      {/* ==========================================
          1. HERO SECTION (Propuesta de Valor y Formulario)
          ========================================== */}
      <section className="w-full bg-[#FFFFFF] border-b border-[#C0C0C0] py-12 md:py-20 relative overflow-hidden">
        {/* Elemento Decorativo Flat */}
        <div className="absolute right-0 top-0 w-1/3 h-full bg-[#F5FBFF] border-l border-[#00BFFF]/20 hidden lg:block"></div>

        <div className="max-w-[1200px] mx-auto px-4 lg:px-8 flex flex-col lg:flex-row gap-16 relative z-10">
          
          {/* Copywriting Persuasivo */}
          <div className="lg:w-1/2 flex flex-col justify-center">
            <span className="text-[10px] font-bold text-[#0A1F33] border border-[#0A1F33] px-3 py-1 uppercase tracking-widest mb-6 w-max bg-[#F8F9FA]">Servicio Premium</span>
            <h1 className="font-black text-4xl md:text-6xl text-[#0A1F33] uppercase leading-[1.1] mb-6" style={{ fontFamily: 'Montserrat, sans-serif' }}>
              Basta de <span className="text-[#00BFFF]">lidiar</span> con concesionarias.
            </h1>
            <p className="text-sm md:text-base text-[#3A3A3C] leading-relaxed mb-8 font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
              Conseguimos el 0km que buscás inmediatamente, sin que tengas que hablar con vendedores. Negociamos el precio real, evitamos sobrecostos ocultos en fletes o seguros, y auditamos los papeles por vos.
            </p>

            {/* Price Anchoring (Promoción) */}
            <div className="flex items-stretch border border-[#C0C0C0] bg-[#FFFFFF] w-max">
              <div className="bg-[#0A1F33] text-[#FFFFFF] p-4 flex flex-col justify-center border-r border-[#0A1F33]">
                <span className="text-[9px] font-bold uppercase tracking-widest text-[#00BFFF] mb-1">Promo Limitada</span>
                <span className="font-black text-3xl" style={{ fontFamily: 'Montserrat, sans-serif' }}>US$ 200</span>
              </div>
              <div className="p-4 flex flex-col justify-center bg-[#F8F9FA]">
                <span className="text-[10px] text-[#C0C0C0] font-bold uppercase tracking-widest line-through">Precio Regular US$ 350</span>
                <span className="text-[10px] text-[#3A3A3C] font-bold uppercase tracking-widest mt-1">Pago único de gestión.</span>
              </div>
            </div>

            <div className="flex gap-4 mt-8">
              <span className="flex items-center gap-2 text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest bg-[#E6F4EA] border border-[#1E8E3E]/30 px-3 py-1.5"><span className="text-[#1E8E3E]">✓</span> Asesor Dedicado</span>
              <span className="flex items-center gap-2 text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest bg-[#E6F4EA] border border-[#1E8E3E]/30 px-3 py-1.5"><span className="text-[#1E8E3E]">✓</span> Cero Burocracia</span>
            </div>
          </div>

          {/* Formulario de Micro-Compromiso (Abre LeadModal) */}
          <div className="lg:w-1/2 w-full">
            <div className="bg-[#FFFFFF] border-t-4 border-[#0A1F33] border-l border-r border-b border-[#C0C0C0] p-8 md:p-10 shadow-none rounded-none">
              <h2 className="font-black text-2xl text-[#0A1F33] uppercase mb-2" style={{ fontFamily: 'Montserrat, sans-serif' }}>Elegí tu próximo auto</h2>
              <p className="text-[11px] font-medium text-[#C0C0C0] uppercase tracking-widest mb-8">Iniciá tu asesoría comercial en menos de un minuto.</p>
              
              <form onSubmit={(e) => { e.preventDefault(); setIsModalOpen(true); }} className="flex flex-col gap-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest block mb-2">1. Marca de Interés</label>
                    <select 
                      className="w-full border border-[#C0C0C0] p-3 text-xs focus:outline-none focus:border-[#0A1F33] bg-[#FFFFFF] appearance-none rounded-none" 
                      value={selectedBrand} 
                      onChange={e => { setSelectedBrand(e.target.value); setSelectedModel(''); }}
                      required
                    >
                      <option value="">Buscar marca...</option>
                      {loadingData ? <option disabled>Cargando...</option> : brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest block mb-2">2. Modelo Deseado</label>
                    <select 
                      className="w-full border border-[#C0C0C0] p-3 text-xs focus:outline-none focus:border-[#0A1F33] bg-[#FFFFFF] appearance-none disabled:bg-[#F8F9FA] rounded-none" 
                      value={selectedModel} 
                      onChange={e => setSelectedModel(e.target.value)}
                      disabled={!selectedBrand}
                    >
                      <option value="">A definir (Opcional)</option>
                      {filteredModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                </div>

                <button type="submit" className="w-full bg-[#00BFFF] hover:bg-[#0A1F33] text-[#FFFFFF] font-bold text-xs uppercase tracking-widest py-4 transition-colors mt-4 rounded-none border border-transparent">
                  Quiero delegar mi compra
                </button>
              </form>
            </div>
          </div>

        </div>
      </section>

      {/* ==========================================
          2. CÓMO FUNCIONA (Proceso en 3 Pasos)
          ========================================== */}
      <section className="w-full bg-[#F8F9FA] py-20 border-b border-[#C0C0C0]">
        <div className="max-w-[1200px] mx-auto px-4 lg:px-8 text-center mb-16">
          <span className="text-[10px] font-bold text-[#00BFFF] border border-[#00BFFF] px-3 py-1 uppercase tracking-widest mb-4 inline-block">Mecánica del Servicio</span>
          <h2 className="font-black text-3xl md:text-4xl text-[#0A1F33] uppercase" style={{ fontFamily: 'Montserrat, sans-serif' }}>
            Tres pasos para tener tu <span className="text-[#00BFFF]">0KM</span>
          </h2>
          <p className="text-sm text-[#C0C0C0] font-medium mt-4 uppercase tracking-widest">Acompañamiento corporativo en cada etapa, sin que tengas que negociar solo.</p>
        </div>

        <div className="max-w-[1200px] mx-auto px-4 lg:px-8 grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Línea conectora Desktop */}
          <div className="hidden md:block absolute top-[20%] left-[15%] w-[70%] h-0.5 bg-[#C0C0C0]/50 z-0"></div>

          {/* Paso 1 */}
          <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-8 relative z-10 hover:border-[#0A1F33] transition-colors rounded-none">
            <div className="flex justify-between items-start mb-6">
              <div className="w-10 h-10 bg-[#F5FBFF] border border-[#00BFFF]/30 flex items-center justify-center text-[#00BFFF]"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg></div>
              <span className="font-black text-4xl text-[#C0C0C0]/30" style={{ fontFamily: 'Montserrat, sans-serif' }}>01</span>
            </div>
            <h3 className="font-black text-lg text-[#0A1F33] uppercase mb-3" style={{ fontFamily: 'Montserrat, sans-serif' }}>Elegís el auto</h3>
            <p className="text-[12px] text-[#3A3A3C] font-medium leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>Partimos del modelo exacto que tenés en mente. Si tenés dudas, nuestro equipo técnico te audita las mejores opciones según tu presupuesto real.</p>
          </div>

          {/* Paso 2 (Destacado) */}
          <div className="bg-[#0A1F33] border-t-4 border-[#00BFFF] p-8 relative z-10 shadow-none text-[#FFFFFF] transform md:-translate-y-4 rounded-none">
            <div className="flex justify-between items-start mb-6">
              <div className="w-10 h-10 bg-[#00BFFF]/20 border border-[#00BFFF] flex items-center justify-center text-[#00BFFF]"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg></div>
              <span className="font-black text-4xl text-[#FFFFFF]/10" style={{ fontFamily: 'Montserrat, sans-serif' }}>02</span>
            </div>
            <h3 className="font-black text-lg text-[#FFFFFF] uppercase mb-3" style={{ fontFamily: 'Montserrat, sans-serif' }}>Negociamos por vos</h3>
            <p className="text-[12px] text-[#C0C0C0] font-medium leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>Rastreamos el stock en todas las concesionarias del país. Comparamos condiciones, eliminamos cotizaciones infladas y cerramos el mejor precio de contado o financiado.</p>
          </div>

          {/* Paso 3 */}
          <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-8 relative z-10 hover:border-[#0A1F33] transition-colors rounded-none">
            <div className="flex justify-between items-start mb-6">
              <div className="w-10 h-10 bg-[#E6F4EA] border border-[#1E8E3E]/30 flex items-center justify-center text-[#1E8E3E]"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg></div>
              <span className="font-black text-4xl text-[#C0C0C0]/30" style={{ fontFamily: 'Montserrat, sans-serif' }}>03</span>
            </div>
            <h3 className="font-black text-lg text-[#0A1F33] uppercase mb-3" style={{ fontFamily: 'Montserrat, sans-serif' }}>Blindamos el cierre</h3>
            <p className="text-[12px] text-[#3A3A3C] font-medium leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>Auditamos los papeles de facturación, coordinamos los pagos seguros con la agencia y te acompañamos logísticamente hasta que tenés la llave en la mano.</p>
          </div>
        </div>
      </section>

      {/* ==========================================
          3. PARA QUIÉN ES (Target Profile)
          ========================================== */}
      <section className="w-full bg-[#FFFFFF] py-20 border-b border-[#C0C0C0]">
        <div className="max-w-[1000px] mx-auto px-4 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-[10px] font-bold text-[#00BFFF] border border-[#00BFFF] px-3 py-1 uppercase tracking-widest mb-4 inline-block">Perfil del Inversor</span>
            <h2 className="font-black text-3xl text-[#0A1F33] uppercase" style={{ fontFamily: 'Montserrat, sans-serif' }}>
              Delegá la compra de tu 0km
            </h2>
            <p className="text-[11px] text-[#C0C0C0] font-bold mt-4 uppercase tracking-widest">Centralizamos el estrés para que no te ocupes de nada.</p>
          </div>

          <div className="flex flex-col md:flex-row gap-8">
            
            {/* Es para vos si... */}
            <div className="md:w-2/3 bg-[#FFFFFF] border border-[#C0C0C0] p-8 md:p-12 rounded-none">
              <h3 className="font-bold text-sm text-[#0A1F33] uppercase tracking-widest mb-8 border-b border-[#C0C0C0]/50 pb-4">Este servicio es para vos si...</h3>
              <ul className="flex flex-col gap-6">
                <li className="flex items-start gap-4">
                  <div className="w-6 h-6 bg-[#00BFFF] flex items-center justify-center text-[#FFFFFF] shrink-0 mt-1"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg></div>
                  <div>
                    <p className="font-bold text-sm text-[#0A1F33] uppercase tracking-wide">Querés delegar la gestión</p>
                    <p className="text-[11px] text-[#3A3A3C] font-medium mt-1">Tu tiempo vale dinero. Preferís que un especialista técnico resuelva la burocracia comercial.</p>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <div className="w-6 h-6 bg-[#00BFFF] flex items-center justify-center text-[#FFFFFF] shrink-0 mt-1"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg></div>
                  <div>
                    <p className="font-bold text-sm text-[#0A1F33] uppercase tracking-wide">Es tu primer auto o tenés inseguridades</p>
                    <p className="text-[11px] text-[#3A3A3C] font-medium mt-1">El mercado es agresivo. Te acompañamos para avanzar con claridad técnica y legal.</p>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <div className="w-6 h-6 bg-[#00BFFF] flex items-center justify-center text-[#FFFFFF] shrink-0 mt-1"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg></div>
                  <div>
                    <p className="font-bold text-sm text-[#0A1F33] uppercase tracking-wide">Vivís en el interior</p>
                    <p className="text-[11px] text-[#3A3A3C] font-medium mt-1">Estás lejos de las casas matrices. Buscamos y aseguramos la unidad a distancia de forma segura.</p>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <div className="w-6 h-6 bg-[#00BFFF] flex items-center justify-center text-[#FFFFFF] shrink-0 mt-1"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg></div>
                  <div>
                    <p className="font-bold text-sm text-[#0A1F33] uppercase tracking-wide">Querés el mejor negocio financiero</p>
                    <p className="text-[11px] text-[#3A3A3C] font-medium mt-1">Comparamos ofertas reales, destruimos costos extra inflados y aseguramos las mejores condiciones de mercado.</p>
                  </div>
                </li>
              </ul>
            </div>

            {/* No es para vos si... */}
            <div className="md:w-1/3 bg-[#F8F9FA] border border-[#C0C0C0] p-8 md:p-10 flex flex-col justify-center rounded-none">
              <h3 className="font-bold text-xs text-[#3A3A3C] uppercase tracking-widest mb-6 border-b border-[#C0C0C0]/50 pb-4">No es para vos si...</h3>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-[#C0C0C0] flex items-center justify-center text-[#FFFFFF] shrink-0 mt-0.5"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg></div>
                <div>
                  <p className="font-bold text-xs text-[#3A3A3C] uppercase tracking-wide">Ya recorriste concesionarias</p>
                  <p className="text-[10px] text-[#C0C0C0] font-bold uppercase mt-2 leading-relaxed">Si ya tenés varios presupuestos firmes en mano y solo querés elegir uno, el trabajo grueso ya lo hiciste vos.</p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ==========================================
          4. PREGUNTAS FRECUENTES (FAQ Flat)
          ========================================== */}
      <section className="w-full bg-[#FFFFFF] py-20 border-b border-[#C0C0C0]">
        <div className="max-w-[1000px] mx-auto px-4 lg:px-8">
          <h2 className="text-3xl text-[#3A3A3C] font-medium mb-12 text-center md:text-left" style={{ fontFamily: 'Inter, sans-serif' }}>
            Preguntas <span className="font-black text-[#0A1F33]" style={{ fontFamily: 'Montserrat, sans-serif' }}>frecuentes</span>
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
            {faqs.map((faq, index) => (
              <div key={index} className="border border-[#C0C0C0] bg-[#F8F9FA] p-6 hover:border-[#0A1F33] transition-colors rounded-none">
                <button onClick={() => setOpenFaq(openFaq === index ? null : index)} className="w-full flex justify-between items-center text-left focus:outline-none group bg-transparent border-none outline-none">
                  <span className="font-bold text-xs text-[#0A1F33] uppercase tracking-wide pr-4" style={{ fontFamily: 'Inter, sans-serif' }}>{faq.q}</span>
                  <span className="text-[#00BFFF] text-xl font-black">{openFaq === index ? '−' : '+'}</span>
                </button>
                <div className={`overflow-hidden transition-all duration-300 ease-in-out ${openFaq === index ? 'max-h-40 opacity-100 mt-4 pt-4 border-t border-[#C0C0C0]/50' : 'max-h-0 opacity-0'}`}>
                  <p className="text-[11px] text-[#3A3A3C] leading-relaxed font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>{faq.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ==========================================
          MODAL GLOBAL B2B INYECTADO
          ========================================== */}
      <LeadModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        vehiculoInteres={modelName}
        marcaVehiculo={brandName}
        origenLead="Servicio Premium - Negociamos por vos"
        concesionariaDestino="A designar (Central DATACAR)"
      />

      {/* ==========================================
          5. FOOTER CORPORATIVO B2C INYECTADO
          ========================================== */}
      <SimpleFooter disclaimer="DATACAR PARAGUAY. Plataforma analítica y transaccional para el mercado automotriz." />

    </main>
  );
}