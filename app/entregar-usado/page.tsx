'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { getCachedBrands, getCachedModels, getCachedVersions } from '../../lib/catalogCache';
import { isOptimizableImageSrc, isValidImageSrc } from '../../lib/imageSrc';
import { resolveModelDealership, sanitizeDealershipName } from '../../lib/dealerships';
import { sendLeadNotificationEmail } from '../../lib/mailer';
import Navbar, { NavItem } from '../components/Navbar';

const NAV_ITEMS: NavItem[] = [
  { type: 'link', label: 'Catálogo 0KM', href: '/catalogo' },
  { type: 'link', label: 'Recomendador', href: '/recomendador' },
  {
    type: 'dropdown',
    label: 'Herramientas',
    items: [
      { label: 'Comparador de Versiones', href: '/comparador' },
      { label: 'Calculadora de Cuotas', href: '/calculadora' },
    ],
  },
  { type: 'link', label: 'Negociamos por vos', href: '/negociamos-por-vos' },
  { type: 'link', label: 'Blog & Noticias', href: '/blog' },
  { type: 'link', label: 'ENTREGÁ TU USADO', href: '/entregar-usado', current: true, highlightStyle: 'underline-caps' },
];

const USED_BRAND_OPTIONS = [
  'TOYOTA',
  'KIA',
  'HYUNDAI',
  'VOLKSWAGEN',
  'CHEVROLET',
  'NISSAN',
  'FORD',
  'MAZDA',
  'MERCEDES-BENZ',
  'BMW',
  'SUZUKI',
  'HONDA',
  'JEEP',
  'MITSUBISHI',
  'CHERY',
  'GEELY',
  'GWM',
  'BYD',
  'PEUGEOT',
  'RENAULT',
  'CITROËN',
  'FIAT',
  'ISUZU',
  'AUDI',
  'VOLVO',
  'SUBARU',
  'LAND ROVER',
  'JAC',
  'CHANGAN',
  'MG',
  'RAM',
  'SSANGYONG',
  'LEXUS',
];

const YEAR_OPTIONS = Array.from({ length: 27 }, (_, i) => String(2026 - i)); // 2026 a 2000

const COLOR_LIST = [
  'Blanco',
  'Negro',
  'Gris Plata',
  'Gris Oscuro / Grafito',
  'Rojo',
  'Azul',
  'Beige / Champagne',
  'Verde',
  'Marrón / Bronce',
];

const KM_RANGES = [
  'Menos de 20.000 km',
  'Entre 20.000 y 50.000 km',
  'Entre 50.000 y 80.000 km',
  'Entre 80.000 y 120.000 km',
  'Más de 120.000 km',
];

const CONDITION_OPTIONS: Array<{
  id: 'Excelente' | 'Bien' | 'Puede estar mejor';
  title: string;
  badge: string;
  desc: string;
}> = [
  {
    id: 'Excelente',
    title: 'Excelente',
    badge: '✨ Impecable',
    desc: 'Sin detalles estéticos ni mecánicos, mantenimientos al día y listo para transferir.',
  },
  {
    id: 'Bien',
    title: 'Bien',
    badge: '👍 Uso Normal',
    desc: 'Buen funcionamiento general, con el desgaste lógico del uso cotidiano.',
  },
  {
    id: 'Puede estar mejor',
    title: 'Puede estar mejor',
    badge: '🔧 Con Detalles',
    desc: 'Requiere algún retoque de pintura, chapería o mantenimiento mecánico puntual.',
  },
];

interface CatalogModelItem {
  id: string;
  brandId: string;
  brandName: string;
  name: string;
  price: number;
  imgUrl: string;
  concesionaria: string;
  versions: Array<{ id: string; name: string; price: number; concesionaria?: string }>;
}

export default function EntregarUsadoPage() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [catalogBrands, setCatalogBrands] = useState<Array<{ id: string; name: string }>>([]);
  const [catalogModels, setCatalogModels] = useState<CatalogModelItem[]>([]);

  // Paso 1: Auto que quiere entregar (Lista de opciones o escritura manual)
  const [usadoMarcaSelect, setUsadoMarcaSelect] = useState('');
  const [usadoMarcaManual, setUsadoMarcaManual] = useState('');
  const [usadoModelo, setUsadoModelo] = useState('');
  const [usadoVersion, setUsadoVersion] = useState('');
  const [usadoAnioSelect, setUsadoAnioSelect] = useState('2021');
  const [usadoAnioManual, setUsadoAnioManual] = useState('');
  const [origenUnidad, setOrigenUnidad] = useState<'De Concesionaria (Representante)' | 'Importación Directa' | ''>('');

  // Paso 2: Ficha, Estado y Valor Solicitado
  const [colorSelect, setColorSelect] = useState('Blanco');
  const [colorManual, setColorManual] = useState('');
  const [transmision, setTransmision] = useState<'Automática' | 'Manual' | ''>('Automática');
  const [kilometrajeModo, setKilometrajeModo] = useState<'rango' | 'exacto'>('exacto');
  const [kilometrajeRango, setKilometrajeRango] = useState('Entre 20.000 y 50.000 km');
  const [kilometrajeExacto, setKilometrajeExacto] = useState('');
  const [estadoGeneral, setEstadoGeneral] = useState<'Excelente' | 'Bien' | 'Puede estar mejor' | ''>('Excelente');
  const [valorSolicitado, setValorSolicitado] = useState('');

  // Paso 3: Marca / Modelo / Versión 0KM de interés
  const [interesBrandId, setInteresBrandId] = useState('');
  const [interesModelId, setInteresModelId] = useState('');
  const [interesVersionName, setInteresVersionName] = useState('Cualquier versión / A definir');
  const [interesLibreTexto, setInteresLibreTexto] = useState('');
  const [modoSeleccion0km, setModoSeleccion0km] = useState<'catalogo' | 'manual'>('catalogo');

  // Paso 4: Datos del Lead
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [comentarios, setComentarios] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const loadCatalog = async () => {
      try {
        const [brandsData, modelsData, versionsData] = await Promise.all([
          getCachedBrands(),
          getCachedModels(),
          getCachedVersions(),
        ]);

        const bMap: Record<string, string> = {};
        const sortedBrands = [...brandsData]
          .map((b) => {
            bMap[b.id] = b.name;
            return { id: b.id, name: b.name };
          })
          .sort((a, b) => a.name.localeCompare(b.name));

        const vByModel = new Map<string, any[]>();
        versionsData.forEach((v: any) => {
          if (!v.modelId) return;
          const arr = vByModel.get(v.modelId) || [];
          arr.push(v);
          vByModel.set(v.modelId, arr);
        });

        const formattedModels: CatalogModelItem[] = modelsData
          .map((m) => {
            const mVers = (vByModel.get(m.id) || [])
              .filter((v: any) => v && v.name)
              .sort((a: any, b: any) => (Number(a.price) || 0) - (Number(b.price) || 0));
            const repVer = mVers[0];
            const minPrice = Number(repVer?.price) || Number(m.startingPrice) || 0;
            return {
              id: m.id,
              brandId: m.brandId,
              brandName: bMap[m.brandId] || 'MARCA',
              name: m.name,
              price: minPrice,
              imgUrl: m.imgUrl || '',
              concesionaria: resolveModelDealership(mVers, repVer) || m.concesionaria || 'Central',
              versions: mVers.map((v: any) => ({
                id: v.id,
                name: v.name,
                price: Number(v.price) || 0,
                concesionaria: v.concesionaria,
              })),
            };
          })
          .sort((a, b) => a.brandName.localeCompare(b.brandName) || a.name.localeCompare(b.name));

        const uniqueBrandMap = new Map<string, { id: string; name: string }>();
        sortedBrands.forEach((b) => {
          const clean = (b.name || '').trim().toUpperCase();
          if (clean && !uniqueBrandMap.has(clean)) {
            uniqueBrandMap.set(clean, { id: b.id, name: clean });
          }
        });
        setCatalogBrands(Array.from(uniqueBrandMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'es')));
        setCatalogModels(formattedModels);
      } catch (err) {
        console.error('Error cargando catálogo en Entregar Usado:', err);
      }
    };
    loadCatalog();
  }, []);

  // Lista combinada de marcas para el selector del usado (catálogo + tradicionales de usados)
  // Deduplicada estrictamente en mayúsculas sin duplicados por sensibilidad a mayúsculas/minúsculas
  const opcionesMarcasUsado = useMemo(() => {
    const brandsMap = new Map<string, string>();
    USED_BRAND_OPTIONS.forEach((name) => {
      const clean = (name || '').trim().toUpperCase();
      if (clean) brandsMap.set(clean, clean);
    });
    catalogBrands.forEach((b) => {
      const clean = (b.name || '').trim().toUpperCase();
      if (clean) brandsMap.set(clean, clean);
    });
    return Array.from(brandsMap.values()).sort((a, b) => a.localeCompare(b, 'es'));
  }, [catalogBrands]);

  const usadoMarcaFinal = useMemo(() => {
    return usadoMarcaSelect === '__MANUAL__' ? usadoMarcaManual.trim() : usadoMarcaSelect.trim();
  }, [usadoMarcaSelect, usadoMarcaManual]);

  const usadoAnioFinal = useMemo(() => {
    return usadoAnioSelect === '__MANUAL__' ? usadoAnioManual.trim() : usadoAnioSelect.trim();
  }, [usadoAnioSelect, usadoAnioManual]);

  const colorFinal = useMemo(() => {
    return colorSelect === '__MANUAL__' ? (colorManual.trim() || 'Otro color') : colorSelect;
  }, [colorSelect, colorManual]);

  const kilometrajeFinal = useMemo(() => {
    if (kilometrajeModo === 'exacto') {
      const val = kilometrajeExacto.trim();
      if (!val) return '';
      return val.toLowerCase().includes('km') ? val : `${val} km`;
    }
    return kilometrajeRango;
  }, [kilometrajeModo, kilometrajeExacto, kilometrajeRango]);

  const modelosDeMarcaInteres = useMemo(() => {
    if (!interesBrandId) return [];
    return catalogModels.filter((m) => m.brandId === interesBrandId);
  }, [catalogModels, interesBrandId]);

  const selectedModel0km = useMemo(() => {
    if (!interesModelId) return null;
    return catalogModels.find((m) => m.id === interesModelId) || null;
  }, [catalogModels, interesModelId]);

  const selectedVersion0km = useMemo(() => {
    if (!selectedModel0km) return null;
    return selectedModel0km.versions.find((v) => v.name === interesVersionName) || null;
  }, [selectedModel0km, interesVersionName]);

  const precioReferencia0km = useMemo(() => {
    if (selectedVersion0km && selectedVersion0km.price > 0) return selectedVersion0km.price;
    if (selectedModel0km && selectedModel0km.price > 0) return selectedModel0km.price;
    return 0;
  }, [selectedModel0km, selectedVersion0km]);

  const valorSolicitadoNum = useMemo(() => {
    const cleaned = valorSolicitado.replace(/[^\d]/g, '');
    return cleaned ? Number(cleaned) : 0;
  }, [valorSolicitado]);

  const diferenciaEstimada = useMemo(() => {
    if (precioReferencia0km <= 0 || valorSolicitadoNum <= 0) return null;
    return Math.max(0, precioReferencia0km - valorSolicitadoNum);
  }, [precioReferencia0km, valorSolicitadoNum]);

  const autoUsadoResumen = useMemo(() => {
    const parts = [usadoMarcaFinal, usadoModelo.trim(), usadoVersion.trim()].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : 'Tu vehículo actual';
  }, [usadoMarcaFinal, usadoModelo, usadoVersion]);

  const auto0kmResumen = useMemo(() => {
    if (modoSeleccion0km === 'manual') {
      return interesLibreTexto.trim() || 'A definir con asesor';
    }
    if (!selectedModel0km) return 'Pendiente de selección';
    const verLabel =
      interesVersionName && interesVersionName !== 'Cualquier versión / A definir'
        ? ` — ${interesVersionName}`
        : '';
    return `${selectedModel0km.brandName} ${selectedModel0km.name}${verLabel}`;
  }, [modoSeleccion0km, interesLibreTexto, selectedModel0km, interesVersionName]);

  const validateStep1 = () => {
    if (!usadoMarcaFinal || !usadoModelo.trim()) {
      setErrorMsg('Por favor seleccioná o escribí la Marca y el Modelo del vehículo que querés entregar.');
      return false;
    }
    if (!usadoAnioFinal) {
      setErrorMsg('Por favor seleccioná o escribí el año de tu vehículo.');
      return false;
    }
    if (!origenUnidad) {
      setErrorMsg('Por favor elegí si tu auto es de Concesionaria (Representante) o de Importación Directa.');
      return false;
    }
    setErrorMsg('');
    return true;
  };

  const validateStep2 = () => {
    if (!colorFinal) {
      setErrorMsg('Indicá el color de tu vehículo.');
      return false;
    }
    if (!transmision) {
      setErrorMsg('Seleccioná el tipo de transmisión de tu vehículo.');
      return false;
    }
    if (!kilometrajeFinal) {
      setErrorMsg('Indicá el kilometraje aproximado de tu unidad.');
      return false;
    }
    if (!estadoGeneral) {
      setErrorMsg('Seleccioná el estado en el que considerás que está tu auto.');
      return false;
    }
    if (!valorSolicitadoNum || valorSolicitadoNum < 500) {
      setErrorMsg('Ingresá el valor aproximado que solicitás por tu vehículo en USD.');
      return false;
    }
    setErrorMsg('');
    return true;
  };

  const validateStep3 = () => {
    if (modoSeleccion0km === 'catalogo' && !selectedModel0km) {
      setErrorMsg('Seleccioná la Marca y el Modelo 0KM de tu interés (o cambiá a ingreso manual si buscás otro).');
      return false;
    }
    if (modoSeleccion0km === 'manual' && !interesLibreTexto.trim()) {
      setErrorMsg('Escribí la Marca, Modelo y Versión del vehículo de tu interés.');
      return false;
    }
    setErrorMsg('');
    return true;
  };

  const handleNextStep = () => {
    if (step === 1 && validateStep1()) setStep(2);
    else if (step === 2 && validateStep2()) setStep(3);
    else if (step === 3 && validateStep3()) setStep(4);
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value.replace(/\D/g, '');
    if (cleaned.length <= 10) setTelefono(cleaned);
  };

  const isPhoneValid = /^09\d{8}$/.test(telefono);

  const handleSubmitLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      setErrorMsg('Por favor ingresá tu nombre y apellido.');
      return;
    }
    if (!isPhoneValid) {
      setErrorMsg('Ingresá un número de celular paraguayo válido de 10 dígitos (Ej: 0981123456).');
      return;
    }

    setErrorMsg('');
    setIsSubmitting(true);

    try {
      const targetDealershipRaw =
        selectedVersion0km?.concesionaria ||
        selectedModel0km?.concesionaria ||
        'Central';
      const cleanDestino = sanitizeDealershipName(targetDealershipRaw) || 'Central';

      const vehiculoEntregarStr = `${usadoMarcaFinal} ${usadoModelo.trim()} ${usadoVersion.trim()}`.trim();
      const vehiculoInteresStr = auto0kmResumen;
      const resumenLeadVehiculo = `${vehiculoInteresStr} (Parte de Pago: ${vehiculoEntregarStr} ${usadoAnioFinal} • USD ${valorSolicitadoNum.toLocaleString('es-PY')})`;

      const datosUsadoPayload = {
        marca: usadoMarcaFinal,
        modelo: usadoModelo.trim(),
        version: usadoVersion.trim() || 'No especificada',
        vehiculo_entregar: vehiculoEntregarStr,
        anio: usadoAnioFinal,
        origen_unidad: origenUnidad,
        color: colorFinal,
        transmision,
        kilometraje: kilometrajeFinal,
        estado_general: estadoGeneral,
        valor_solicitado_usd: valorSolicitadoNum,
        vehiculo_interes_marca: selectedModel0km?.brandName || interesLibreTexto.trim(),
        vehiculo_interes_modelo: selectedModel0km?.name || interesLibreTexto.trim(),
        vehiculo_interes_version: modoSeleccion0km === 'catalogo' ? interesVersionName : 'Especificado manualmente',
        vehiculo_interes_completo: vehiculoInteresStr,
        precio_0km_referencia: precioReferencia0km || null,
        diferencia_estimada_usd: diferenciaEstimada,
        comentarios: comentarios.trim() || null,
      };

      await addDoc(collection(db, 'leads'), {
        nombre: nombre.trim(),
        telefono: telefono.trim(),
        email: email.trim() ? email.trim().toLowerCase() : 'No proporcionado',
        vehiculo: resumenLeadVehiculo,
        vehiculo_interes: vehiculoInteresStr,
        marca: selectedModel0km?.brandName || usadoMarcaFinal,
        origen: 'Entrega de Usado (Parte de Pago)',
        concesionaria_destino: cleanDestino,
        concesionaria_destino_norm: cleanDestino.trim().toLowerCase(),
        estado: 'Nuevo',
        datos_usado: datosUsadoPayload,
        createdAt: serverTimestamp(),
      });

      await sendLeadNotificationEmail({
        leadName: nombre.trim(),
        leadPhone: telefono.trim(),
        leadEmail: email.trim() ? email.trim().toLowerCase() : undefined,
        vehicleOfInterest: vehiculoInteresStr,
        origen: 'Entrega de Usado (Parte de Pago)',
        concesionariaDestino: cleanDestino,
        tradeInData: {
          vehiculoEntregar: vehiculoEntregarStr,
          marca: usadoMarcaFinal,
          modelo: usadoModelo.trim(),
          version: usadoVersion.trim() || 'No especificada',
          anio: usadoAnioFinal,
          origenUnidad: origenUnidad,
          color: colorFinal,
          transmision: transmision,
          kilometraje: kilometrajeFinal,
          estadoGeneral: estadoGeneral,
          valorSolicitadoUsd: valorSolicitadoNum,
          vehiculoInteres0km: vehiculoInteresStr,
          diferenciaEstimadaUsd: diferenciaEstimada,
          comentarios: comentarios.trim() || null,
        },
      });

      setIsSuccess(true);
    } catch (err) {
      console.error('Error guardando lead de parte de pago:', err);
      setErrorMsg('Ocurrió un inconveniente al enviar tu solicitud. Por favor intentá nuevamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#F8F9FA] text-[#3A3A3C] font-sans flex flex-col">
      <Navbar
        items={NAV_ITEMS}
        cta={{ label: 'Catálogo', href: '/catalogo' }}
        secondaryCta={{ label: 'Promociones', href: '/promociones' }}
      />

      {/* HERO DE BIENVENIDA CONVERSACIONAL */}
      <section className="w-full bg-[#0A1F33] text-[#FFFFFF] border-b-4 border-[#00BFFF] py-12 lg:py-16 px-4 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            background: 'radial-gradient(circle at 80% 20%, #00BFFF 0%, transparent 55%)',
          }}
        />
        <div className="max-w-[1320px] mx-auto relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 bg-[#00BFFF]/15 text-[#00BFFF] border border-[#00BFFF]/40 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-4">
              🔄 Plan Renovación 0KM • Parte de Pago
            </span>
            <h1
              className="font-black text-3xl sm:text-4xl lg:text-5xl uppercase leading-tight tracking-tight mb-3"
              style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}
            >
              Entregá tu usado y subite a tu <span className="text-[#00BFFF]">próximo 0KM.</span>
            </h1>
            <p className="text-sm sm:text-base text-[#C0C0C0] leading-relaxed">
              Contanos paso a paso las características de tu vehículo actual y qué 0KM te gustaría retirar. Conectamos tu propuesta con el representante oficial para gestionar la toma de tu unidad.
            </p>
          </div>

          {/* Indicador de pasos visual */}
          <div className="bg-[#FFFFFF]/5 border border-[#FFFFFF]/15 rounded-2xl p-4 sm:p-5 backdrop-blur-md shrink-0">
            <p className="text-[10px] font-bold text-[#00BFFF] uppercase tracking-widest mb-3">
              Tu progreso ({step} de 4)
            </p>
            <div className="grid grid-cols-4 gap-2 sm:gap-3">
              {[
                { n: 1, title: 'Tu Auto' },
                { n: 2, title: 'Estado & Valor' },
                { n: 3, title: 'El 0KM' },
                { n: 4, title: 'Propuesta' },
              ].map((item) => {
                const active = step === item.n;
                const done = step > item.n || isSuccess;
                return (
                  <button
                    key={item.n}
                    type="button"
                    onClick={() => {
                      if (done) setStep(item.n as 1 | 2 | 3 | 4);
                    }}
                    className={`flex flex-col items-center text-center px-3 py-2.5 rounded-xl border transition-all ${
                      active
                        ? 'bg-[#00BFFF] text-[#0A1F33] border-[#00BFFF] font-black shadow-md'
                        : done
                          ? 'bg-[#00BFFF]/20 text-[#FFFFFF] border-[#00BFFF]/40 cursor-pointer'
                          : 'bg-[#FFFFFF]/5 text-[#C0C0C0] border-[#FFFFFF]/10 cursor-default'
                    }`}
                  >
                    <span className="text-xs font-black">{done ? '✓' : item.n}</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider mt-0.5 whitespace-nowrap">
                      {item.title}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* CONTENIDO PRINCIPAL: ASISTENTE INTERACTIVO + TARJETA EN VIVO */}
      <section className="max-w-[1320px] w-full mx-auto px-4 lg:px-8 py-10 lg:py-14 flex-grow">
        {isSuccess ? (
          <div className="max-w-3xl mx-auto bg-[#FFFFFF] border-2 border-[#00BFFF] rounded-3xl shadow-2xl p-8 sm:p-12 text-center">
            <div className="w-20 h-20 rounded-full bg-[#E6F4EA] border-2 border-[#1E8E3E] text-[#1E8E3E] flex items-center justify-center mx-auto mb-6 text-4xl font-black">
              ✓
            </div>
            <span className="inline-block bg-[#F0FBFF] text-[#0080B0] border border-[#00BFFF]/30 px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-3">
              Solicitud Registrada como Lead Prioritario
            </span>
            <h2
              className="font-black text-2xl sm:text-3xl text-[#0A1F33] uppercase mb-3"
              style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}
            >
              ¡Excelente, {nombre.split(' ')[0]}! Ya recibimos la ficha de tu usado.
            </h2>
            <p className="text-sm text-[#3A3A3C] max-w-xl mx-auto leading-relaxed mb-8">
              Un asesor especializado revisará los datos de tu{' '}
              <strong className="text-[#0A1F33]">
                {autoUsadoResumen} ({usadoAnioFinal})
              </strong>{' '}
              para coordinar la tasación física y armar tu plan de diferencia por el{' '}
              <strong className="text-[#0080B0]">{auto0kmResumen}</strong>.
            </p>

            <div className="bg-[#F8F9FA] border border-[#0A1F33]/10 rounded-2xl p-6 text-left grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              <div>
                <span className="text-[10px] font-bold text-[#C0C0C0] uppercase tracking-widest block">
                  Vehículo que entregás
                </span>
                <p className="font-black text-sm text-[#0A1F33] uppercase mt-0.5">
                  {autoUsadoResumen} • Año {usadoAnioFinal}
                </p>
                <p className="text-xs text-[#3A3A3C] mt-1">
                  {origenUnidad} • {colorFinal} • {transmision} • {kilometrajeFinal}
                </p>
              </div>
              <div>
                <span className="text-[10px] font-bold text-[#C0C0C0] uppercase tracking-widest block">
                  Valor Solicitado & 0KM de Interés
                </span>
                <p className="font-black text-sm text-[#1E8E3E] uppercase mt-0.5">
                  Pretensión: USD {valorSolicitadoNum.toLocaleString('es-PY')} ({estadoGeneral})
                </p>
                <p className="text-xs font-bold text-[#0080B0] mt-1">
                  Busca: {auto0kmResumen}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Link
                href="/catalogo"
                className="bg-[#0A1F33] hover:bg-[#00BFFF] text-[#FFFFFF] hover:text-[#0A1F33] font-black text-xs uppercase tracking-widest py-4 px-8 rounded-xl transition-all shadow-md"
              >
                Seguir Explorando el Catálogo 0KM
              </Link>
              <Link
                href="/"
                className="bg-[#FFFFFF] border border-[#0A1F33]/20 hover:border-[#0A1F33] text-[#0A1F33] font-bold text-xs uppercase tracking-widest py-4 px-8 rounded-xl transition-all"
              >
                Volver al Inicio
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* COLUMNA IZQUIERDA (8 COLS): EXPERIENCIA GUIADA PASO A PASO */}
            <div className="lg:col-span-8 bg-[#FFFFFF] border border-[#0A1F33]/10 rounded-3xl shadow-lg p-6 sm:p-10">
              {errorMsg && (
                <div className="mb-6 bg-[#FCE8E6] border-l-4 border-[#D93025] text-[#D93025] p-4 rounded-xl text-xs font-bold flex items-center justify-between">
                  <span>⚠️ {errorMsg}</span>
                  <button
                    type="button"
                    onClick={() => setErrorMsg('')}
                    className="text-[#D93025] font-black ml-4"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* ==========================================
                  PASO 1: EL AUTO QUE QUERÉS ENTREGAR
                  ========================================== */}
              {step === 1 && (
                <div className="flex flex-col gap-8">
                  <div className="border-b border-[#0A1F33]/10 pb-5">
                    <span className="text-[10px] font-black text-[#00BFFF] uppercase tracking-widest block mb-1">
                      Paso 1 de 4 • Tu Vehículo Actual
                    </span>
                    <h2
                      className="font-black text-2xl sm:text-3xl text-[#0A1F33] uppercase"
                      style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}
                    >
                      ¿Qué auto te gustaría entregar como parte de pago?
                    </h2>
                    <p className="text-xs sm:text-sm text-[#3A3A3C] mt-1">
                      Elegí de la lista o ingresá manualmente la marca, modelo, versión, año y origen de tu vehículo.
                    </p>
                  </div>

                  {/* 1. Marca, Modelo y Versión (Lista de opciones o escribir manualmente) */}
                  <div>
                    <label className="text-[11px] font-black text-[#0A1F33] uppercase tracking-widest block mb-3">
                      1. Marca, Modelo y Versión del auto a entregar *
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-wider block mb-1.5">
                          Marca *
                        </label>
                        <select
                          value={usadoMarcaSelect}
                          onChange={(e) => setUsadoMarcaSelect(e.target.value)}
                          className="w-full bg-[#F8F9FA] border-2 border-[#0A1F33]/15 focus:border-[#00BFFF] focus:bg-[#FFFFFF] rounded-xl px-4 py-3 text-sm font-bold text-[#0A1F33] focus:outline-none transition-all"
                        >
                          <option value="">— Seleccionar Marca —</option>
                          {opcionesMarcasUsado.map((b) => (
                            <option key={b} value={b}>
                              {b}
                            </option>
                          ))}
                          <option value="__MANUAL__">✏️ Otra marca (Escribir manualmente)</option>
                        </select>
                        {usadoMarcaSelect === '__MANUAL__' && (
                          <input
                            type="text"
                            placeholder="Escribí la marca de tu auto..."
                            value={usadoMarcaManual}
                            onChange={(e) => setUsadoMarcaManual(e.target.value)}
                            className="mt-2 w-full bg-[#FFFFFF] border-2 border-[#00BFFF] rounded-xl px-4 py-2.5 text-sm font-bold text-[#0A1F33] focus:outline-none"
                          />
                        )}
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-wider block mb-1.5">
                          Modelo *
                        </label>
                        <input
                          type="text"
                          placeholder="Ej: Hilux / Corolla / Sportage"
                          value={usadoModelo}
                          onChange={(e) => setUsadoModelo(e.target.value)}
                          className="w-full bg-[#F8F9FA] border-2 border-[#0A1F33]/15 focus:border-[#00BFFF] focus:bg-[#FFFFFF] rounded-xl px-4 py-3 text-sm font-bold text-[#0A1F33] focus:outline-none transition-all"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-wider block mb-1.5">
                          Versión
                        </label>
                        <input
                          type="text"
                          placeholder="Ej: SRV 4x4 2.8 / EX / Full"
                          value={usadoVersion}
                          onChange={(e) => setUsadoVersion(e.target.value)}
                          className="w-full bg-[#F8F9FA] border-2 border-[#0A1F33]/15 focus:border-[#00BFFF] focus:bg-[#FFFFFF] rounded-xl px-4 py-3 text-sm font-bold text-[#0A1F33] focus:outline-none transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 2. Año del vehículo (Lista desplegable o escribir manualmente) */}
                  <div className="max-w-md">
                    <label className="text-[11px] font-black text-[#0A1F33] uppercase tracking-widest block mb-2">
                      2. ¿De qué año es tu vehículo? *
                    </label>
                    <select
                      value={usadoAnioSelect}
                      onChange={(e) => setUsadoAnioSelect(e.target.value)}
                      className="w-full bg-[#F8F9FA] border-2 border-[#0A1F33]/15 focus:border-[#00BFFF] focus:bg-[#FFFFFF] rounded-xl px-4 py-3 text-sm font-bold text-[#0A1F33] focus:outline-none transition-all"
                    >
                      {YEAR_OPTIONS.map((yr) => (
                        <option key={yr} value={yr}>
                          Año {yr}
                        </option>
                      ))}
                      <option value="__MANUAL__">✏️ Otro año (Escribir manualmente)</option>
                    </select>
                    {usadoAnioSelect === '__MANUAL__' && (
                      <input
                        type="number"
                        min={1980}
                        max={2026}
                        placeholder="Escribí el año (Ej: 1998)"
                        value={usadoAnioManual}
                        onChange={(e) => setUsadoAnioManual(e.target.value)}
                        className="mt-2 w-full bg-[#FFFFFF] border-2 border-[#00BFFF] rounded-xl px-4 py-2.5 text-sm font-bold text-[#0A1F33] focus:outline-none"
                      />
                    )}
                  </div>

                  {/* 3. Origen: Concesionaria vs Importación Directa */}
                  <div>
                    <label className="text-[11px] font-black text-[#0A1F33] uppercase tracking-widest block mb-3">
                      3. ¿Cuál es el origen de tu vehículo? *
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <button
                        type="button"
                        onClick={() => setOrigenUnidad('De Concesionaria (Representante)')}
                        className={`text-left p-5 rounded-2xl border-2 transition-all flex flex-col justify-between ${
                          origenUnidad === 'De Concesionaria (Representante)'
                            ? 'border-[#00BFFF] bg-[#F0FBFF] shadow-md'
                            : 'border-[#0A1F33]/10 bg-[#F8F9FA] hover:border-[#00BFFF]/50'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full mb-2">
                          <span className="text-2xl">🏢</span>
                          <span
                            className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full ${
                              origenUnidad === 'De Concesionaria (Representante)'
                                ? 'bg-[#00BFFF] text-[#0A1F33]'
                                : 'bg-[#FFFFFF] text-[#3A3A3C]'
                            }`}
                          >
                            Título del Representante
                          </span>
                        </div>
                        <p className="font-black text-base text-[#0A1F33] uppercase">
                          De Concesionaria Oficial
                        </p>
                        <p className="text-xs text-[#3A3A3C] mt-1 leading-relaxed">
                          Retirado originalmente de un representante oficial de la marca en Paraguay.
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setOrigenUnidad('Importación Directa')}
                        className={`text-left p-5 rounded-2xl border-2 transition-all flex flex-col justify-between ${
                          origenUnidad === 'Importación Directa'
                            ? 'border-[#00BFFF] bg-[#F0FBFF] shadow-md'
                            : 'border-[#0A1F33]/10 bg-[#F8F9FA] hover:border-[#00BFFF]/50'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full mb-2">
                          <span className="text-2xl">🚢</span>
                          <span
                            className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full ${
                              origenUnidad === 'Importación Directa'
                                ? 'bg-[#00BFFF] text-[#0A1F33]'
                                : 'bg-[#FFFFFF] text-[#3A3A3C]'
                            }`}
                          >
                            Importado Independiente
                          </span>
                        </div>
                        <p className="font-black text-base text-[#0A1F33] uppercase">
                          Importación Directa
                        </p>
                        <p className="text-xs text-[#3A3A3C] mt-1 leading-relaxed">
                          Importado de forma particular o por playa (Corea, EE.UU., Europa, Vía Chile, etc.).
                        </p>
                      </button>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-[#0A1F33]/10 flex justify-end">
                    <button
                      type="button"
                      onClick={handleNextStep}
                      className="bg-[#0A1F33] hover:bg-[#00BFFF] text-[#FFFFFF] hover:text-[#0A1F33] font-black text-xs uppercase tracking-widest py-4 px-8 rounded-2xl shadow-md transition-all"
                    >
                      Continuar a Estado y Valor →
                    </button>
                  </div>
                </div>
              )}

              {/* ==========================================
                  PASO 2: COLOR, TRANSMISIÓN, KM, ESTADO Y VALOR
                  ========================================== */}
              {step === 2 && (
                <div className="flex flex-col gap-8">
                  <div className="border-b border-[#0A1F33]/10 pb-5">
                    <span className="text-[10px] font-black text-[#00BFFF] uppercase tracking-widest block mb-1">
                      Paso 2 de 4 • Ficha y Valoración
                    </span>
                    <h2
                      className="font-black text-2xl sm:text-3xl text-[#0A1F33] uppercase"
                      style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}
                    >
                      Contanos cómo está tu {autoUsadoResumen}
                    </h2>
                    <p className="text-xs sm:text-sm text-[#3A3A3C] mt-1">
                      Estos datos permiten a la concesionaria pre-evaluar tu unidad antes de la inspección física.
                    </p>
                  </div>

                  {/* Color y Transmisión en una fila limpia */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label className="text-[11px] font-black text-[#0A1F33] uppercase tracking-widest block mb-2">
                        4. Color de tu vehículo *
                      </label>
                      <select
                        value={colorSelect}
                        onChange={(e) => setColorSelect(e.target.value)}
                        className="w-full bg-[#F8F9FA] border-2 border-[#0A1F33]/15 focus:border-[#00BFFF] focus:bg-[#FFFFFF] rounded-xl px-4 py-3 text-sm font-bold text-[#0A1F33] focus:outline-none"
                      >
                        {COLOR_LIST.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                        <option value="__MANUAL__">✏️ Otro color (Escribir manualmente)</option>
                      </select>
                      {colorSelect === '__MANUAL__' && (
                        <input
                          type="text"
                          placeholder="Escribí el color (Ej: Bordo, Naranja...)"
                          value={colorManual}
                          onChange={(e) => setColorManual(e.target.value)}
                          className="mt-2 w-full bg-[#FFFFFF] border-2 border-[#00BFFF] rounded-xl px-4 py-2.5 text-sm font-bold text-[#0A1F33] focus:outline-none"
                        />
                      )}
                    </div>

                    <div>
                      <label className="text-[11px] font-black text-[#0A1F33] uppercase tracking-widest block mb-2">
                        5. Transmisión *
                      </label>
                      <select
                        value={transmision}
                        onChange={(e) => setTransmision(e.target.value as 'Automática' | 'Manual')}
                        className="w-full bg-[#F8F9FA] border-2 border-[#0A1F33]/15 focus:border-[#00BFFF] focus:bg-[#FFFFFF] rounded-xl px-4 py-3 text-sm font-bold text-[#0A1F33] focus:outline-none"
                      >
                        <option value="Automática">Automática (AT / Secuencial / CVT)</option>
                        <option value="Manual">Manual / Mecánica</option>
                      </select>
                    </div>
                  </div>

                  {/* Kilometraje (Escribir manualmente o elegir rango de lista) */}
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <label className="text-[11px] font-black text-[#0A1F33] uppercase tracking-widest">
                        6. Kilometraje del vehículo *
                      </label>
                      <button
                        type="button"
                        onClick={() => setKilometrajeModo(kilometrajeModo === 'exacto' ? 'rango' : 'exacto')}
                        className="text-[10px] font-bold text-[#0080B0] hover:underline uppercase tracking-wider"
                      >
                        {kilometrajeModo === 'exacto' ? '¿Preferís elegir un rango aproximado?' : '¿Preferís escribir el kilometraje exacto?'}
                      </button>
                    </div>

                    {kilometrajeModo === 'exacto' ? (
                      <div className="flex items-center max-w-md bg-[#F8F9FA] border-2 border-[#0A1F33]/15 focus-within:border-[#00BFFF] focus-within:bg-[#FFFFFF] rounded-xl overflow-hidden">
                        <input
                          type="text"
                          placeholder="Ej: 45.000"
                          value={kilometrajeExacto}
                          onChange={(e) => setKilometrajeExacto(e.target.value)}
                          className="w-full px-4 py-3 text-sm font-bold text-[#0A1F33] bg-transparent focus:outline-none"
                        />
                        <span className="px-4 py-3 text-xs font-black text-[#3A3A3C] bg-[#0A1F33]/5 uppercase select-none">
                          KM
                        </span>
                      </div>
                    ) : (
                      <select
                        value={kilometrajeRango}
                        onChange={(e) => setKilometrajeRango(e.target.value)}
                        className="w-full max-w-md bg-[#F8F9FA] border-2 border-[#0A1F33]/15 focus:border-[#00BFFF] focus:bg-[#FFFFFF] rounded-xl px-4 py-3 text-sm font-bold text-[#0A1F33] focus:outline-none"
                      >
                        {KM_RANGES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Estado general */}
                  <div>
                    <label className="text-[11px] font-black text-[#0A1F33] uppercase tracking-widest block mb-3">
                      7. ¿En qué estado considerás que está? *
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {CONDITION_OPTIONS.map((cond) => {
                        const active = estadoGeneral === cond.id;
                        return (
                          <button
                            key={cond.id}
                            type="button"
                            onClick={() => setEstadoGeneral(cond.id)}
                            className={`text-left p-5 rounded-2xl border-2 transition-all flex flex-col justify-between ${
                              active
                                ? 'border-[#00BFFF] bg-[#F0FBFF] shadow-md'
                                : 'border-[#0A1F33]/10 bg-[#F8F9FA] hover:border-[#00BFFF]/50'
                            }`}
                          >
                            <div>
                              <span
                                className={`inline-block text-[10px] font-black uppercase px-2.5 py-1 rounded-full mb-2 ${
                                  active ? 'bg-[#00BFFF] text-[#0A1F33]' : 'bg-[#FFFFFF] text-[#3A3A3C]'
                                }`}
                              >
                                {cond.badge}
                              </span>
                              <p className="font-black text-base text-[#0A1F33] uppercase">{cond.title}</p>
                            </div>
                            <p className="text-xs text-[#3A3A3C] mt-2 leading-relaxed">{cond.desc}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Valor Solicitado en USD */}
                  <div className="bg-[#F8F9FA] border-2 border-[#0A1F33]/10 rounded-2xl p-5 sm:p-6">
                    <label className="text-[11px] font-black text-[#0A1F33] uppercase tracking-widest block mb-2">
                      8. ¿Cuál es el valor que solicitás por tu usado? (en Dólares USD) *
                    </label>
                    <p className="text-xs text-[#3A3A3C] mb-4">
                      Indicá el monto orientativo que tenés en mente recibir en parte de pago.
                    </p>
                    <div className="flex items-center max-w-sm bg-[#FFFFFF] border-2 border-[#0A1F33]/20 focus-within:border-[#00BFFF] rounded-2xl overflow-hidden shadow-xs">
                      <span className="bg-[#0A1F33] text-[#00BFFF] font-black text-sm px-4 py-3.5 select-none">
                        USD
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="Ej: 16500"
                        value={valorSolicitado}
                        onChange={(e) => setValorSolicitado(e.target.value.replace(/[^\d.]/g, ''))}
                        className="w-full px-4 py-3 text-lg font-black text-[#0A1F33] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-[#0A1F33]/10 flex justify-between items-center">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="text-xs font-bold uppercase tracking-widest text-[#3A3A3C] hover:text-[#0A1F33] py-3 px-4"
                    >
                      ← Volver al Paso 1
                    </button>
                    <button
                      type="button"
                      onClick={handleNextStep}
                      className="bg-[#0A1F33] hover:bg-[#00BFFF] text-[#FFFFFF] hover:text-[#0A1F33] font-black text-xs uppercase tracking-widest py-4 px-8 rounded-2xl shadow-md transition-all"
                    >
                      Elegir el 0KM de Interés →
                    </button>
                  </div>
                </div>
              )}

              {/* ==========================================
                  PASO 3: MARCA / MODELO / VERSIÓN DE INTERÉS
                  ========================================== */}
              {step === 3 && (
                <div className="flex flex-col gap-8">
                  <div className="border-b border-[#0A1F33]/10 pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <span className="text-[10px] font-black text-[#00BFFF] uppercase tracking-widest block mb-1">
                        Paso 3 de 4 • El 0KM que Buscás
                      </span>
                      <h2
                        className="font-black text-2xl sm:text-3xl text-[#0A1F33] uppercase"
                        style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}
                      >
                        ¿Qué 0KM te interesa retirar?
                      </h2>
                      <p className="text-xs sm:text-sm text-[#3A3A3C] mt-1">
                        Seleccioná la marca, modelo y versión de interés de nuestro catálogo o escribilo manualmente.
                      </p>
                    </div>

                    <div className="flex bg-[#F8F9FA] p-1 rounded-xl border border-[#0A1F33]/10 shrink-0 self-start">
                      <button
                        type="button"
                        onClick={() => setModoSeleccion0km('catalogo')}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                          modoSeleccion0km === 'catalogo'
                            ? 'bg-[#0A1F33] text-[#00BFFF]'
                            : 'text-[#3A3A3C] hover:text-[#0A1F33]'
                        }`}
                      >
                        Lista del Catálogo
                      </button>
                      <button
                        type="button"
                        onClick={() => setModoSeleccion0km('manual')}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                          modoSeleccion0km === 'manual'
                            ? 'bg-[#0A1F33] text-[#00BFFF]'
                            : 'text-[#3A3A3C] hover:text-[#0A1F33]'
                        }`}
                      >
                        Escribir Manualmente
                      </button>
                    </div>
                  </div>

                  {modoSeleccion0km === 'catalogo' ? (
                    <div className="flex flex-col gap-6">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {/* 1. Marca de interés */}
                        <div>
                          <label className="text-[10px] font-black text-[#0A1F33] uppercase tracking-widest block mb-1.5">
                            Marca 0KM *
                          </label>
                          <select
                            value={interesBrandId}
                            onChange={(e) => {
                              setInteresBrandId(e.target.value);
                              setInteresModelId('');
                              setInteresVersionName('Cualquier versión / A definir');
                            }}
                            className="w-full bg-[#F8F9FA] border-2 border-[#0A1F33]/15 focus:border-[#00BFFF] rounded-xl px-4 py-3.5 text-sm font-bold text-[#0A1F33] focus:outline-none"
                          >
                            <option value="">— Seleccionar Marca —</option>
                            {catalogBrands.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* 2. Modelo de interés */}
                        <div>
                          <label className="text-[10px] font-black text-[#0A1F33] uppercase tracking-widest block mb-1.5">
                            Modelo 0KM *
                          </label>
                          <select
                            value={interesModelId}
                            disabled={!interesBrandId}
                            onChange={(e) => {
                              const mId = e.target.value;
                              setInteresModelId(mId);
                              const found = modelosDeMarcaInteres.find((m) => m.id === mId);
                              setInteresVersionName(found?.versions[0]?.name || 'Cualquier versión / A definir');
                            }}
                            className="w-full bg-[#F8F9FA] border-2 border-[#0A1F33]/15 focus:border-[#00BFFF] rounded-xl px-4 py-3.5 text-sm font-bold text-[#0A1F33] focus:outline-none disabled:opacity-50"
                          >
                            <option value="">
                              {interesBrandId ? '— Seleccionar Modelo —' : '— Primero elegí Marca —'}
                            </option>
                            {modelosDeMarcaInteres.map((mdl) => (
                              <option key={mdl.id} value={mdl.id}>
                                {mdl.name} {mdl.price > 0 ? `(Desde USD ${mdl.price.toLocaleString('es-PY')})` : ''}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* 3. Versión de interés */}
                        <div>
                          <label className="text-[10px] font-black text-[#0A1F33] uppercase tracking-widest block mb-1.5">
                            Versión de Interés
                          </label>
                          <select
                            value={interesVersionName}
                            disabled={!selectedModel0km}
                            onChange={(e) => setInteresVersionName(e.target.value)}
                            className="w-full bg-[#F8F9FA] border-2 border-[#0A1F33]/15 focus:border-[#00BFFF] rounded-xl px-4 py-3.5 text-sm font-bold text-[#0A1F33] focus:outline-none disabled:opacity-50"
                          >
                            <option value="Cualquier versión / A definir">
                              Cualquier versión / A definir
                            </option>
                            {selectedModel0km?.versions.map((v) => (
                              <option key={v.id} value={v.name}>
                                {v.name} {v.price > 0 ? `— USD ${v.price.toLocaleString('es-PY')}` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Vista previa del modelo 0KM elegido */}
                      {selectedModel0km && (
                        <div className="bg-[#F8F9FA] border border-[#0A1F33]/10 rounded-2xl p-5 flex flex-col sm:flex-row items-center gap-5">
                          <div className="w-36 h-24 bg-[#FFFFFF] rounded-xl flex items-center justify-center p-2 border border-[#0A1F33]/10 shrink-0">
                            {isValidImageSrc(selectedModel0km.imgUrl) ? (
                              <Image
                                src={selectedModel0km.imgUrl}
                                alt={selectedModel0km.name}
                                width={140}
                                height={90}
                                className="max-h-full w-auto object-contain"
                                unoptimized={!isOptimizableImageSrc(selectedModel0km.imgUrl)}
                              />
                            ) : (
                              <span className="text-[10px] font-bold text-[#C0C0C0] uppercase">
                                {selectedModel0km.brandName}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 text-center sm:text-left">
                            <span className="text-[10px] font-black text-[#0080B0] uppercase tracking-widest block">
                              0KM Seleccionado • {selectedModel0km.concesionaria}
                            </span>
                            <p className="font-black text-lg text-[#0A1F33] uppercase">
                              {selectedModel0km.brandName} {selectedModel0km.name}
                            </p>
                            <p className="text-xs text-[#3A3A3C]">
                              Versión: <strong>{interesVersionName}</strong>
                              {precioReferencia0km > 0 && (
                                <> • Precio Contado Ref.: <strong>USD {precioReferencia0km.toLocaleString('es-PY')}</strong></>
                              )}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <label className="text-[11px] font-black text-[#0A1F33] uppercase tracking-widest block mb-2">
                        Escribí la Marca, Modelo y Versión de tu interés *
                      </label>
                      <input
                        type="text"
                        placeholder="Ej: GWM Haval H6 HEV / Geely Coolray / Toyota Corolla Cross..."
                        value={interesLibreTexto}
                        onChange={(e) => setInteresLibreTexto(e.target.value)}
                        className="w-full bg-[#F8F9FA] border-2 border-[#0A1F33]/15 focus:border-[#00BFFF] focus:bg-[#FFFFFF] rounded-xl px-4 py-3.5 text-sm font-bold text-[#0A1F33] focus:outline-none"
                      />
                    </div>
                  )}

                  {/* Simulación instantánea de diferencia */}
                  {diferenciaEstimada !== null && (
                    <div className="bg-[#0A1F33] text-[#FFFFFF] rounded-2xl p-5 border-l-4 border-[#00BFFF] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <span className="text-[10px] font-bold text-[#00BFFF] uppercase tracking-widest block">
                          Balance Estimado de Renovación
                        </span>
                        <p className="text-xs text-[#C0C0C0] mt-0.5">
                          Precio ref. 0KM (USD {precioReferencia0km.toLocaleString('es-PY')}) menos tu usado (USD{' '}
                          {valorSolicitadoNum.toLocaleString('es-PY')})
                        </p>
                      </div>
                      <div className="text-left sm:text-right shrink-0">
                        <span className="text-[10px] uppercase tracking-widest text-[#C0C0C0] block">
                          Diferencia aprox. a financiar/abonar
                        </span>
                        <span className="font-black text-2xl text-[#00BFFF]">
                          USD {diferenciaEstimada.toLocaleString('es-PY')}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="pt-4 border-t border-[#0A1F33]/10 flex justify-between items-center">
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="text-xs font-bold uppercase tracking-widest text-[#3A3A3C] hover:text-[#0A1F33] py-3 px-4"
                    >
                      ← Volver al Paso 2
                    </button>
                    <button
                      type="button"
                      onClick={handleNextStep}
                      className="bg-[#0A1F33] hover:bg-[#00BFFF] text-[#FFFFFF] hover:text-[#0A1F33] font-black text-xs uppercase tracking-widest py-4 px-8 rounded-2xl shadow-md transition-all"
                    >
                      Último Paso: Tus Datos →
                    </button>
                  </div>
                </div>
              )}

              {/* ==========================================
                  PASO 4: DATOS DE CONTACTO PARA ENVIAR LEAD
                  ========================================== */}
              {step === 4 && (
                <form onSubmit={handleSubmitLead} className="flex flex-col gap-6">
                  <div className="border-b border-[#0A1F33]/10 pb-5">
                    <span className="text-[10px] font-black text-[#00BFFF] uppercase tracking-widest block mb-1">
                      Paso 4 de 4 • Recibí tu Propuesta Oficial
                    </span>
                    <h2
                      className="font-black text-2xl sm:text-3xl text-[#0A1F33] uppercase"
                      style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}
                    >
                      ¿A dónde te enviamos la tasación y propuesta?
                    </h2>
                    <p className="text-xs sm:text-sm text-[#3A3A3C] mt-1">
                      Tu solicitud será derivada como un Lead prioritario de Parte de Pago sin ningún costo ni comisión.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-[#0A1F33] uppercase tracking-wider block mb-1.5">
                        Nombre y Apellido *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ej: Juan Pérez"
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value)}
                        className="w-full bg-[#F8F9FA] border-2 border-[#0A1F33]/15 focus:border-[#00BFFF] focus:bg-[#FFFFFF] rounded-xl px-4 py-3.5 text-sm font-bold text-[#0A1F33] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#0A1F33] uppercase tracking-wider block mb-1.5">
                        Teléfono / WhatsApp (Paraguay) *
                      </label>
                      <input
                        type="tel"
                        required
                        placeholder="Ej: 0981123456"
                        value={telefono}
                        onChange={handlePhoneChange}
                        className="w-full bg-[#F8F9FA] border-2 border-[#0A1F33]/15 focus:border-[#00BFFF] focus:bg-[#FFFFFF] rounded-xl px-4 py-3.5 text-sm font-bold text-[#0A1F33] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-wider block mb-1.5">
                        Correo Electrónico (Opcional)
                      </label>
                      <input
                        type="email"
                        placeholder="tu@correo.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-[#F8F9FA] border-2 border-[#0A1F33]/15 focus:border-[#00BFFF] focus:bg-[#FFFFFF] rounded-xl px-4 py-3.5 text-sm font-bold text-[#0A1F33] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-wider block mb-1.5">
                        Comentario adicional (Opcional)
                      </label>
                      <input
                        type="text"
                        placeholder="Ej: Único dueño, ficha en el representante..."
                        value={comentarios}
                        onChange={(e) => setComentarios(e.target.value)}
                        className="w-full bg-[#F8F9FA] border-2 border-[#0A1F33]/15 focus:border-[#00BFFF] focus:bg-[#FFFFFF] rounded-xl px-4 py-3.5 text-sm font-bold text-[#0A1F33] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-[#0A1F33]/10 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <button
                      type="button"
                      onClick={() => setStep(3)}
                      className="text-xs font-bold uppercase tracking-widest text-[#3A3A3C] hover:text-[#0A1F33] py-3 px-4"
                    >
                      ← Volver al Paso 3
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full sm:w-auto bg-[#00BFFF] hover:bg-[#0A1F33] text-[#0A1F33] hover:text-[#FFFFFF] font-black text-xs sm:text-sm uppercase tracking-widest py-4 px-10 rounded-2xl shadow-lg transition-all disabled:opacity-50"
                    >
                      {isSubmitting ? 'Enviando Ficha de Tasación...' : '✓ Solicitar Toma de Mi Usado'}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* COLUMNA DERECHA (4 COLS): FICHA EN VIVO DE TU OPERACIÓN */}
            <aside className="lg:col-span-4 lg:sticky lg:top-24 bg-[#0A1F33] text-[#FFFFFF] rounded-3xl p-6 sm:p-8 border-t-4 border-[#00BFFF] shadow-xl">
              <div className="flex items-center justify-between border-b border-[#FFFFFF]/10 pb-4 mb-5">
                <div>
                  <span className="text-[9px] font-black text-[#00BFFF] uppercase tracking-widest block">
                    Resumen en Vivo
                  </span>
                  <h3
                    className="font-black text-lg uppercase"
                    style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}
                  >
                    Tu Ficha Parte de Pago
                  </h3>
                </div>
                <span className="bg-[#00BFFF]/15 text-[#00BFFF] border border-[#00BFFF]/30 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase">
                  Paso {step}/4
                </span>
              </div>

              <div className="flex flex-col gap-4 text-xs">
                <div className="bg-[#FFFFFF]/5 border border-[#FFFFFF]/10 rounded-2xl p-4">
                  <span className="text-[9px] font-bold text-[#C0C0C0] uppercase tracking-widest block mb-1">
                    1. Auto a Entregar
                  </span>
                  <p className="font-black text-sm text-[#FFFFFF] uppercase">{autoUsadoResumen}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {usadoAnioFinal && (
                      <span className="bg-[#00BFFF]/20 text-[#00BFFF] px-2 py-0.5 rounded-md text-[10px] font-bold">
                        Año {usadoAnioFinal}
                      </span>
                    )}
                    {origenUnidad && (
                      <span className="bg-[#FFFFFF]/10 text-[#FFFFFF] px-2 py-0.5 rounded-md text-[10px] font-semibold">
                        {origenUnidad}
                      </span>
                    )}
                  </div>
                </div>

                <div className="bg-[#FFFFFF]/5 border border-[#FFFFFF]/10 rounded-2xl p-4">
                  <span className="text-[9px] font-bold text-[#C0C0C0] uppercase tracking-widest block mb-1">
                    2. Especificaciones & Estado
                  </span>
                  <div className="grid grid-cols-2 gap-2 mt-1 text-[11px]">
                    <div>
                      <span className="text-[#C0C0C0] block text-[9px] uppercase">Color:</span>
                      <span className="font-bold text-[#FFFFFF]">{colorFinal || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[#C0C0C0] block text-[9px] uppercase">Transmisión:</span>
                      <span className="font-bold text-[#FFFFFF]">{transmision || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[#C0C0C0] block text-[9px] uppercase">Kilometraje:</span>
                      <span className="font-bold text-[#FFFFFF]">{kilometrajeFinal || 'Pendiente'}</span>
                    </div>
                    <div>
                      <span className="text-[#C0C0C0] block text-[9px] uppercase">Estado:</span>
                      <span className="font-bold text-[#00BFFF]">{estadoGeneral || '—'}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-[#FFFFFF]/5 border border-[#FFFFFF]/10 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <span className="text-[9px] font-bold text-[#C0C0C0] uppercase tracking-widest block">
                      3. Valor Solicitado
                    </span>
                    <span className="font-black text-lg text-[#00BFFF]">
                      {valorSolicitadoNum > 0
                        ? `USD ${valorSolicitadoNum.toLocaleString('es-PY')}`
                        : 'Pendiente'}
                    </span>
                  </div>
                  <span className="text-xl">💵</span>
                </div>

                <div className="bg-[#00BFFF]/10 border border-[#00BFFF]/30 rounded-2xl p-4">
                  <span className="text-[9px] font-black text-[#00BFFF] uppercase tracking-widest block mb-1">
                    4. 0KM de Interés
                  </span>
                  <p className="font-black text-sm text-[#FFFFFF] uppercase">{auto0kmResumen}</p>
                  {selectedModel0km?.concesionaria && (
                    <p className="text-[10px] text-[#C0C0C0] mt-1">
                      Representante: <strong className="text-[#FFFFFF]">{selectedModel0km.concesionaria}</strong>
                    </p>
                  )}
                </div>
              </div>
            </aside>
          </div>
        )}
      </section>
    </main>
  );
}
