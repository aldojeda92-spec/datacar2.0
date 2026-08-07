// app/calculadora/page.tsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
// CORRECCIÓN DE RUTAS: Solo un nivel arriba (../) porque components está dentro de app/
import LeadModal from '../components/LeadModal';
import SimpleFooter from '../components/SimpleFooter';
import { useToast } from '../context/ToastContext';
import { FinancialConfig, DEFAULT_FINANCIAL_CONFIG, calcularCuotaFrancesa, calcularPresupuestoInverso } from '../../lib/finance';
import { getCachedBrands, getCachedModels, getCachedVersions } from '../../lib/catalogCache';

// ==========================================
// INTERFACES
// ==========================================
interface BrandItem { id: string; name: string; }
interface ModelItem { id: string; brandId: string; name: string; }
interface VersionItem { id: string; modelId: string; name: string; price: number; }

export default function CalculadoraClient() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<FinancialConfig>(DEFAULT_FINANCIAL_CONFIG);
  
  // TABS: 'directo' (Sabe qué auto quiere) | 'inverso' (Sabe cuánto puede pagar)
  const [calcMode, setCalcMode] = useState<'directo' | 'inverso'>('directo');

  // Datos Firebase para Cascada
  const [brands, setBrands] = useState<BrandItem[]>([]);
  const [models, setModels] = useState<ModelItem[]>([]);
  const [versions, setVersions] = useState<VersionItem[]>([]);

  // ==========================================
  // ESTADOS: ALGORITMO 1 (Cálculo Directo)
  // ==========================================
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedVersion, setSelectedVersion] = useState('');
  const [precioVehiculo, setPrecioVehiculo] = useState<number>(0);
  const [entregaDirecto, setEntregaDirecto] = useState<string>('');
  const [plazoDirecto, setPlazoDirecto] = useState<number>(36);
  const [cuotaCalculada, setCuotaCalculada] = useState<number | null>(null);

  // ==========================================
  // ESTADOS: ALGORITMO 2 (Cálculo Inverso)
  // ==========================================
  const [cuotaObjetivo, setCuotaObjetivo] = useState<string>('');
  const [entregaInverso, setEntregaInverso] = useState<string>('');
  const [plazoInverso, setPlazoInverso] = useState<number>(36);
  const [presupuestoBase, setPresupuestoBase] = useState<number | null>(null);

  // ==========================================
  // ESTADOS: LEAD MODAL B2B
  // ==========================================
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [modalPayload, setModalPayload] = useState({ marca: '', vehiculo: '', concesionaria: '' });

  // ==========================================
  // 1. OBTENCIÓN DE DATOS Y CONFIGURACIÓN
  // ==========================================
  useEffect(() => {
    const fetchBaseData = async () => {
      try {
        const confSnap = await getDoc(doc(db, 'config', 'financial'));
        if (confSnap.exists()) setConfig(confSnap.data() as FinancialConfig);

        const [brandsData, modelsData, versionsData] = await Promise.all([
          getCachedBrands(),
          getCachedModels(),
          getCachedVersions(),
        ]);

        setBrands(brandsData.map(d => ({ id: d.id, name: d.name })).sort((a, b) => a.name.localeCompare(b.name)));
        setModels(modelsData.map(d => ({ id: d.id, brandId: d.brandId, name: d.name })));
        setVersions(versionsData.map(d => ({ id: d.id, modelId: d.modelId, name: d.name, price: Number(d.price) || 0 })));

      } catch (error) { 
        console.error("Error conectando a DB:", error); 
      } finally { 
        setLoading(false); 
      }
    };
    fetchBaseData();
  }, []);

  // Lógica de Filtros en Cascada (Top-Down)
  const filteredModels = useMemo(() => models.filter(m => m.brandId === selectedBrand).sort((a,b) => a.name.localeCompare(b.name)), [models, selectedBrand]);
  const filteredVersions = useMemo(() => versions.filter(v => v.modelId === selectedModel && v.price > 0).sort((a,b) => a.price - b.price), [versions, selectedModel]);

  // Sincronización automática del precio al elegir la versión
  useEffect(() => {
    if (selectedVersion) {
      const v = versions.find(ver => ver.id === selectedVersion);
      if (v) setPrecioVehiculo(v.price);
    } else {
      setPrecioVehiculo(0);
      setCuotaCalculada(null);
    }
  }, [selectedVersion, versions]);

  // ==========================================
  // 2. MOTORES MATEMÁTICOS (lib/finance.ts)
  // ==========================================
  // ALGORITMO 1: Sistema Francés con Capital Bruto
  const calcularCuotaDirecta = (e: React.FormEvent) => {
    e.preventDefault();
    const entregaNum = Number(entregaDirecto) || 0;

    if (precioVehiculo <= 0) return showToast('Seleccioná un vehículo válido primero.');
    if (entregaNum >= precioVehiculo) return showToast('La entrega inicial no puede ser mayor o igual al precio del vehículo.');

    setCuotaCalculada(calcularCuotaFrancesa(precioVehiculo, entregaNum, plazoDirecto, config));
  };

  // ALGORITMO 2: Ingeniería Inversa de Presupuesto
  const calcularPoderDeCompra = (e: React.FormEvent) => {
    e.preventDefault();
    const cuotaNum = Number(cuotaObjetivo) || 0;
    const entregaNum = Number(entregaInverso) || 0;

    if (cuotaNum <= 0) return showToast('Ingresá una cuota mensual válida.');

    setPresupuestoBase(calcularPresupuestoInverso(cuotaNum, entregaNum, plazoInverso, config));
  };

  // ==========================================
  // 3. CAPTURA DE LEADS CENTRALIZADA
  // ==========================================
  const handleOpenLeadModal = () => {
    if (calcMode === 'directo') {
      const bName = brands.find(b => b.id === selectedBrand)?.name || 'Marca No Definida';
      const mName = models.find(m => m.id === selectedModel)?.name || '';
      const vName = versions.find(v => v.id === selectedVersion)?.name || '';
      
      // Armamos el payload dinámico para inyectarlo en el correo
      setModalPayload({
        marca: bName,
        vehiculo: `${mName} ${vName} | (P.Lista: US$ ${precioVehiculo} / Entrega: US$ ${entregaDirecto} / ${plazoDirecto} meses / Cuota Est: US$ ${Math.round(cuotaCalculada || 0)})`,
        concesionaria: bName 
      });
    } else {
      setModalPayload({
        marca: 'Análisis Inverso',
        vehiculo: `Poder de Compra: US$ ${Math.round(presupuestoBase || 0)} | (Cuota Obj: US$ ${cuotaObjetivo} / Entrega: US$ ${entregaInverso} / ${plazoInverso} meses)`,
        concesionaria: 'A designar (Central DATACAR)'
      });
    }
    setIsLeadModalOpen(true);
  };

  // ==========================================
  // RENDERIZADO DE INTERFAZ (Flat Design)
  // ==========================================
  if (loading) return <div className="min-h-screen bg-[#FFFFFF] flex items-center justify-center font-bold text-[#0A1F33] tracking-widest uppercase text-sm">Cargando motor financiero...</div>;

  return (
    <main className="min-h-screen bg-[#F8F9FA] text-[#3A3A3C] font-sans flex flex-col">
      
      {/* NAVBAR */}
      <nav className="w-full bg-[#FFFFFF] border-b border-[#C0C0C0] px-4 md:px-8 py-4 flex justify-between items-center sticky top-0 z-40 shadow-none">
        <div className="font-black text-2xl tracking-widest text-[#0A1F33] uppercase" style={{ fontFamily: 'Montserrat, sans-serif' }}>
          <Link href="/">DATA<span className="font-light">CAR</span></Link>
        </div>
        <div className="hidden md:flex gap-6 font-bold text-[11px] uppercase items-center text-[#3A3A3C] tracking-wider" style={{ fontFamily: 'Inter, sans-serif' }}>
          <Link href="/recomendador" className="hover:text-[#00BFFF] transition-colors">Recomendador</Link>
          <Link href="/comparador" className="hover:text-[#00BFFF] transition-colors">Comparador</Link>
          <Link href="/negociamos-por-vos" className="hover:text-[#00BFFF] transition-colors">Asesoría</Link>
        </div>
        <Link href="/catalogo" className="bg-[#FFFFFF] border border-[#0A1F33] text-[#0A1F33] font-bold text-[11px] uppercase tracking-widest py-3 px-8 hover:bg-[#0A1F33] hover:text-[#FFFFFF] transition-colors rounded-none">
          Catálogo 0KM
        </Link>
      </nav>

      {/* HEADER FINANCIERO */}
      <header className="w-full bg-[#0A1F33] py-16 px-4 border-b-4 border-[#00BFFF]">
        <div className="max-w-[800px] mx-auto text-center">
          <span className="text-[10px] font-bold text-[#00BFFF] uppercase tracking-widest block mb-4 border border-[#00BFFF] bg-[#00BFFF]/10 w-max mx-auto px-4 py-1">Herramienta Financiera</span>
          <h1 className="font-black text-4xl md:text-5xl text-[#FFFFFF] uppercase leading-tight mb-4" style={{ fontFamily: 'Montserrat, sans-serif' }}>
            Proyectá tu Inversión
          </h1>
          <p className="text-sm text-[#C0C0C0] leading-relaxed max-w-xl mx-auto" style={{ fontFamily: 'Inter, sans-serif' }}>
            Nuestra terminal utiliza el sistema de amortización bancario real, absorbiendo seguros y gastos administrativos, garantizando transparencia técnica antes de la firma.
          </p>
        </div>
      </header>

      {/* TAB SELECTOR */}
      <div className="max-w-[800px] mx-auto w-full px-4 mt-8">
        <div className="flex bg-[#FFFFFF] border border-[#C0C0C0]">
          <button 
            onClick={() => { setCalcMode('directo'); setPresupuestoBase(null); }}
            className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-colors border-r border-[#C0C0C0] ${calcMode === 'directo' ? 'bg-[#0A1F33] text-[#FFFFFF]' : 'bg-[#FFFFFF] text-[#3A3A3C] hover:bg-[#F8F9FA]'}`}
          >
            Tengo un vehículo en mente
          </button>
          <button 
            onClick={() => { setCalcMode('inverso'); setCuotaCalculada(null); }}
            className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-colors ${calcMode === 'inverso' ? 'bg-[#0A1F33] text-[#FFFFFF]' : 'bg-[#FFFFFF] text-[#3A3A3C] hover:bg-[#F8F9FA]'}`}
          >
            Tengo una cuota en mente
          </button>
        </div>
      </div>

      {/* ==========================================
          MOTOR 1: CÁLCULO DIRECTO
          ========================================== */}
      {calcMode === 'directo' && (
        <section className="max-w-[800px] mx-auto w-full px-4 py-8 flex-grow">
          <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-8 md:p-12">
            <form onSubmit={calcularCuotaDirecta} className="flex flex-col gap-8">
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border-b border-[#C0C0C0]/50 pb-8">
                <div>
                  <label htmlFor="calc-directo-brand" className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest block mb-2">1. Marca</label>
                  <select id="calc-directo-brand" className="w-full border border-[#C0C0C0] p-3 text-xs focus:outline-none focus:border-[#0A1F33] bg-[#FFFFFF] rounded-none appearance-none cursor-pointer" value={selectedBrand} onChange={e => { setSelectedBrand(e.target.value); setSelectedModel(''); setSelectedVersion(''); }}>
                    <option value="">Seleccionar...</option>
                    {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="calc-directo-model" className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest block mb-2">2. Modelo</label>
                  <select id="calc-directo-model" className="w-full border border-[#C0C0C0] p-3 text-xs focus:outline-none focus:border-[#0A1F33] bg-[#FFFFFF] rounded-none appearance-none cursor-pointer disabled:bg-[#F8F9FA] disabled:cursor-not-allowed" value={selectedModel} onChange={e => { setSelectedModel(e.target.value); setSelectedVersion(''); }} disabled={!selectedBrand}>
                    <option value="">Seleccionar...</option>
                    {filteredModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="calc-directo-version" className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest block mb-2">3. Versión Exacta</label>
                  <select id="calc-directo-version" className="w-full border border-[#C0C0C0] p-3 text-xs focus:outline-none focus:border-[#0A1F33] bg-[#FFFFFF] rounded-none appearance-none cursor-pointer disabled:bg-[#F8F9FA] disabled:cursor-not-allowed" value={selectedVersion} onChange={e => setSelectedVersion(e.target.value)} disabled={!selectedModel}>
                    <option value="">Seleccionar...</option>
                    {filteredVersions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
              </div>

              {precioVehiculo > 0 && (
                <div className="bg-[#F5FBFF] border border-[#00BFFF]/30 p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                  <span className="text-[11px] font-bold text-[#0A1F33] uppercase tracking-widest">Monto del vehículo:</span>
                  <span className="font-black text-3xl text-[#00BFFF]" style={{ fontFamily: 'Montserrat, sans-serif' }}>US$ {precioVehiculo.toLocaleString()}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="calc-directo-entrega" className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest block mb-2">Entrega Inicial (USD)</label>
                  <input id="calc-directo-entrega" type="number" placeholder="Ej: 10000" className="w-full border border-[#C0C0C0] p-4 text-sm focus:outline-none focus:border-[#0A1F33] bg-[#FFFFFF] rounded-none" value={entregaDirecto} onChange={e => setEntregaDirecto(e.target.value)} required />
                </div>
                <div>
                  <label htmlFor="calc-directo-plazo" className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest block mb-2">Plazo de Financiación</label>
                  <select id="calc-directo-plazo" className="w-full border border-[#C0C0C0] p-4 text-sm focus:outline-none focus:border-[#0A1F33] bg-[#FFFFFF] rounded-none appearance-none cursor-pointer" value={plazoDirecto} onChange={e => setPlazoDirecto(Number(e.target.value))}>
                    <option value={12}>12 Meses</option>
                    <option value={24}>24 Meses</option>
                    <option value={36}>36 Meses</option>
                    <option value={48}>48 Meses</option>
                    <option value={60}>60 Meses</option>
                  </select>
                </div>
              </div>

              <button type="submit" className="w-full bg-[#0A1F33] hover:bg-[#00BFFF] text-[#FFFFFF] font-bold text-xs uppercase tracking-widest py-5 transition-colors rounded-none mt-2 border border-transparent">
                Ejecutar Simulación
              </button>

              {cuotaCalculada !== null && (
                <div className="mt-4 border border-[#0A1F33] bg-[#FFFFFF] p-10 text-center">
                  <p className="text-[11px] font-bold text-[#3A3A3C] uppercase tracking-widest mb-4 border-b border-[#C0C0C0]/50 pb-4 inline-block">Cuota Mensual Estimada</p>
                  <p className="font-black text-6xl text-[#0A1F33]" style={{ fontFamily: 'Montserrat, sans-serif' }}>US$ {cuotaCalculada.toLocaleString('en-US', {maximumFractionDigits: 0})}</p>
                  <p className="text-[9px] text-[#C0C0C0] uppercase tracking-widest mt-6 max-w-md mx-auto leading-relaxed border border-[#C0C0C0]/30 p-3 bg-[#F8F9FA]">
                    * Tasa referencial {(config.tasa_anual * 100).toFixed(1)}% nominal anual. Monto calculado sobre sistema Francés. Incluye prorrateo de seguros y gastos de otorgamiento.
                  </p>
                  
                  {/* TRIGGER DEL LEAD MODAL */}
                  <button type="button" onClick={handleOpenLeadModal} className="mt-8 bg-[#1E8E3E] hover:bg-[#0A1F33] text-[#FFFFFF] font-bold text-xs uppercase tracking-widest py-4 px-10 transition-colors rounded-none w-full md:w-auto">
                    Solicitar Crédito Ahora
                  </button>
                </div>
              )}
            </form>
          </div>
        </section>
      )}

      {/* ==========================================
          MOTOR 2: CÁLCULO INVERSO
          ========================================== */}
      {calcMode === 'inverso' && (
        <section className="max-w-[800px] mx-auto w-full px-4 py-8 flex-grow">
          <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-8 md:p-12">
            <form onSubmit={calcularPoderDeCompra} className="flex flex-col gap-8">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="calc-inverso-cuota" className="text-[10px] font-bold text-[#00BFFF] uppercase tracking-widest block mb-2">Cuota Máxima Mensual (USD)</label>
                  <input id="calc-inverso-cuota" type="number" placeholder="Ej: 500" className="w-full border border-[#C0C0C0] p-4 text-sm focus:outline-none focus:border-[#00BFFF] bg-[#F5FBFF] rounded-none" value={cuotaObjetivo} onChange={e => setCuotaObjetivo(e.target.value)} required />
                </div>
                <div>
                  <label htmlFor="calc-inverso-entrega" className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest block mb-2">Capital Inicial Disponible (USD)</label>
                  <input id="calc-inverso-entrega" type="number" placeholder="Ej: 5000" className="w-full border border-[#C0C0C0] p-4 text-sm focus:outline-none focus:border-[#0A1F33] bg-[#FFFFFF] rounded-none" value={entregaInverso} onChange={e => setEntregaInverso(e.target.value)} required />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="calc-inverso-plazo" className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest block mb-2">Plazo de Financiación Deseado</label>
                  <select id="calc-inverso-plazo" className="w-full border border-[#C0C0C0] p-4 text-sm focus:outline-none focus:border-[#0A1F33] bg-[#FFFFFF] rounded-none appearance-none cursor-pointer" value={plazoInverso} onChange={e => setPlazoInverso(Number(e.target.value))}>
                    <option value={12}>12 Meses</option>
                    <option value={24}>24 Meses</option>
                    <option value={36}>36 Meses</option>
                    <option value={48}>48 Meses</option>
                    <option value={60}>60 Meses</option>
                  </select>
                </div>
              </div>

              <button type="submit" className="w-full bg-[#0A1F33] hover:bg-[#00BFFF] text-[#FFFFFF] font-bold text-xs uppercase tracking-widest py-5 transition-colors rounded-none mt-2 border border-transparent">
                Descubrir mi Poder de Compra
              </button>

              {presupuestoBase !== null && (
                <div className="mt-4 border border-[#00BFFF] bg-[#FFFFFF] p-10 text-center">
                  <p className="text-[11px] font-bold text-[#3A3A3C] uppercase tracking-widest mb-4 border-b border-[#C0C0C0]/50 pb-4 inline-block">Presupuesto Real para tu 0KM</p>
                  <p className="font-black text-6xl text-[#0A1F33] mb-6" style={{ fontFamily: 'Montserrat, sans-serif' }}>US$ {presupuestoBase.toLocaleString('en-US', {maximumFractionDigits: 0})}</p>
                  
                  <div className="flex flex-col sm:flex-row justify-center items-center gap-4 text-[#3A3A3C] text-[10px] font-bold uppercase tracking-widest mb-8 bg-[#F8F9FA] p-4 border border-[#C0C0C0]/50">
                    <span>Rango de Precios Sugerido:</span>
                    <span className="bg-[#FFFFFF] border border-[#C0C0C0] px-4 py-2">US$ {(presupuestoBase * 0.9).toLocaleString('en-US', {maximumFractionDigits: 0})}</span>
                    <span className="hidden sm:inline">-</span>
                    <span className="bg-[#FFFFFF] border border-[#C0C0C0] px-4 py-2">US$ {(presupuestoBase * 1.1).toLocaleString('en-US', {maximumFractionDigits: 0})}</span>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <Link 
                      href={`/catalogo?minPrice=${Math.floor(presupuestoBase * 0.9)}&maxPrice=${Math.ceil(presupuestoBase * 1.1)}`} 
                      className="bg-[#FFFFFF] border border-[#0A1F33] text-[#0A1F33] hover:bg-[#0A1F33] hover:text-[#FFFFFF] font-bold text-[10px] uppercase tracking-widest px-8 py-4 transition-colors rounded-none"
                    >
                      Ver Autos en Catálogo
                    </Link>
                    
                    {/* TRIGGER DEL LEAD MODAL */}
                    <button type="button" onClick={handleOpenLeadModal} className="bg-[#1E8E3E] hover:bg-[#0A1F33] text-[#FFFFFF] font-bold text-[10px] uppercase tracking-widest px-8 py-4 transition-colors border border-transparent rounded-none">
                      Solicitar Crédito Ahora
                    </button>
                  </div>
                </div>
              )}
            </form>
          </div>
        </section>
      )}

      {/* ==========================================
          MODAL GLOBAL B2B (Inyectado)
          ========================================== */}
      <LeadModal 
        isOpen={isLeadModalOpen} 
        onClose={() => setIsLeadModalOpen(false)} 
        vehiculoInteres={modalPayload.vehiculo} 
        marcaVehiculo={modalPayload.marca} 
        origenLead="Calculadora Financiera" 
        concesionariaDestino={modalPayload.concesionaria} 
      />

      {/* ==========================================
          FOOTER COMPLETO B2C (Inyectado)
          ========================================== */}
      <SimpleFooter disclaimer="DATACAR PARAGUAY. Las cotizaciones financieras son referenciales y están sujetas a análisis crediticio." />

    </main>
  );
}