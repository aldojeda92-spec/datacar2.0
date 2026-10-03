'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { 
  getCachedBrands, 
  getCachedModels, 
  getCachedVersions, 
  getCachedConcesionarias 
} from '../../lib/catalogCache';
import { buildCheckedDealershipSet, isDatacarCheck } from '../../lib/datacarCheck';
import { normalizeCarroceria } from '../../lib/carroceria';
import { isOptimizableImageSrc, isValidImageSrc } from '../../lib/imageSrc';
import Navbar, { NavItem } from '../components/Navbar';
import SimpleFooter from '../components/SimpleFooter';
import BotonCotizar from '../components/BotonCotizar';
import DatacarCheckBadge from '../components/DatacarCheckBadge';

export default function PromocionesClient() {
  const [brands, setBrands] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [concesionarias, setConcesionarias] = useState<any[]>([]);
  const [datacarCheckSet, setDatacarCheckSet] = useState<Set<string>>(new Set());
  
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [selectedCarroceria, setSelectedCarroceria] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<string>('asc');

  useEffect(() => {
    async function loadData() {
      try {
        const [brandsData, modelsData, versionsData, concesionariasData] = await Promise.all([
          getCachedBrands(),
          getCachedModels(),
          getCachedVersions(),
          getCachedConcesionarias()
        ]);
        
        setBrands(brandsData);
        setModels(modelsData);
        setVersions(versionsData);
        setConcesionarias(concesionariasData);
        
        const checkSet = buildCheckedDealershipSet(concesionariasData);
        setDatacarCheckSet(checkSet);
      } catch (err) {
        console.error('Error loading data for promociones:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const navItems: NavItem[] = [
    { type: 'link', label: 'CATÁLOGO', href: '/catalogo' },
    { type: 'link', label: 'PROMOCIONES', href: '/promociones', current: true },
    { type: 'link', label: 'COMPARADOR', href: '/comparador' },
    { type: 'link', label: 'RECOMENDADOR', href: '/recomendador' },
    { type: 'link', label: 'CALCULADORA', href: '/calculadora' },
  ];

  // 1. Filtrar versiones con promoción: excluir vacíos, "no aplica", "sin promo", "sin datos", "ninguna", "n/d", etc.
  const isPromoValid = (p?: string | null) => {
    if (!p) return false;
    const clean = p.trim().toLowerCase().replace(/[.,;]/g, '');
    if (!clean) return false;
    const invalidList = [
      '-', '--', 'n/d', 'n/a', 'nd', 'na', 's/d', 'sd', 'ninguna', 'ninguno',
      'sin datos', 'sin dato', 'sin promo', 'sin promocion', 'sin promoción',
      'sin info', 'sin informacion', 'sin información',
      'no aplica', 'no-aplica', 'no posee', 'no tiene', 'no', 'no disponible'
    ];
    if (invalidList.includes(clean)) return false;
    if (
      clean.startsWith('no aplica') || 
      clean.startsWith('sin promo') || 
      clean.startsWith('sin dato') || 
      clean.startsWith('sin info') || 
      clean.startsWith('ningun') ||
      clean.startsWith('no posee') ||
      clean.startsWith('no tiene') ||
      clean.startsWith('no disp')
    ) {
      return false;
    }
    return true;
  };

  const promoVersions = useMemo(() => {
    return versions.filter(v => isPromoValid(v.promocion));
  }, [versions]);

  // 2. Unir con modelo y marca, y aplicar filtros de UI
  const filteredPromos = useMemo(() => {
    const joined = promoVersions.map(v => {
      const model = models.find(m => m.id === v.modelId);
      const brand = model ? brands.find(b => b.id === model.brandId) : null;
      return { version: v, model, brand };
    }).filter(({ model, brand }) => {
      if (!model || !brand) return false;
      if (selectedBrand && brand.id !== selectedBrand) return false;
      if (selectedCarroceria && normalizeCarroceria(model.tipo_carroceria) !== selectedCarroceria) return false;
      return true;
    });

    // 3. Ordenar por precio
    joined.sort((a, b) => {
      const priceA = a.version.price || 0;
      const priceB = b.version.price || 0;
      return sortOrder === 'asc' ? priceA - priceB : priceB - priceA;
    });

    return joined;
  }, [promoVersions, models, brands, selectedBrand, selectedCarroceria, sortOrder]);

  // Extraer carrocerías únicas para el filtro
  const availableCarrocerias = Array.from(
    new Set(models.map(m => normalizeCarroceria(m.tipo_carroceria)).filter(Boolean))
  ).sort() as string[];

  const formatPrice = (price?: number) => {
    if (!price) return 'Consultar';
    return `US$ ${price.toLocaleString('es-PY')}`;
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col font-sans">
      <Navbar items={navItems} />

      {/* Hero Section */}
      <section className="bg-[#0A1F33] py-12 px-4 border-b border-[#00BFFF]">
        <div className="max-w-[1400px] mx-auto lg:px-8">
          <h1 className="text-3xl md:text-4xl font-black text-[#FFFFFF] uppercase tracking-tight mb-2" style={{ fontFamily: 'var(--font-montserrat)' }}>
            Promociones y Ofertas
          </h1>
          <p className="text-[#C0C0C0] text-sm md:text-base max-w-2xl" style={{ fontFamily: 'var(--font-inter)' }}>
            Descubrí las mejores oportunidades en vehículos 0km. Bonos, descuentos y condiciones especiales por tiempo limitado.
          </p>
        </div>
      </section>

      <main className="flex-grow w-full max-w-[1400px] mx-auto px-4 lg:px-8 py-8">
        {/* Filters and Count */}
        <div className="flex flex-col md:flex-row gap-4 mb-8 bg-[#FFFFFF] p-4 border border-[#C0C0C0] items-end">
          <div className="flex-1 w-full">
            <label className="block text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest mb-2" style={{ fontFamily: 'var(--font-inter)' }}>
              Marca
            </label>
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="w-full border border-[#C0C0C0] p-2 text-sm text-[#0A1F33] rounded-none focus:outline-none focus:border-[#00BFFF] bg-white cursor-pointer"
            >
              <option value="">Todas las marcas</option>
              {brands.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          
          <div className="flex-1 w-full">
            <label className="block text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest mb-2" style={{ fontFamily: 'var(--font-inter)' }}>
              Carrocería
            </label>
            <select
              value={selectedCarroceria}
              onChange={(e) => setSelectedCarroceria(e.target.value)}
              className="w-full border border-[#C0C0C0] p-2 text-sm text-[#0A1F33] rounded-none focus:outline-none focus:border-[#00BFFF] bg-white cursor-pointer"
            >
              <option value="">Todas las carrocerías</option>
              {availableCarrocerias.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="flex-1 w-full">
            <label className="block text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest mb-2" style={{ fontFamily: 'var(--font-inter)' }}>
              Ordenar por Precio
            </label>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="w-full border border-[#C0C0C0] p-2 text-sm text-[#0A1F33] rounded-none focus:outline-none focus:border-[#00BFFF] bg-white cursor-pointer"
            >
              <option value="asc">Menor a Mayor</option>
              <option value="desc">Mayor a Menor</option>
            </select>
          </div>
        </div>

        <div className="mb-4">
          <p className="text-[#3A3A3C] text-sm font-bold uppercase tracking-widest">
            {filteredPromos.length} promociones activas
          </p>
        </div>

        {/* Promo Grid */}
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <p className="text-[#3A3A3C] font-bold uppercase tracking-widest">Cargando promociones...</p>
          </div>
        ) : filteredPromos.length === 0 ? (
          <div className="text-center py-20 bg-[#FFFFFF] border border-[#C0C0C0]">
            <p className="text-[#3A3A3C] uppercase font-bold text-sm tracking-widest">No se encontraron promociones con los filtros seleccionados.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {filteredPromos.map(({ version, model, brand }) => {
              const concesionariaName = version.concesionaria || 'Consultar Concesionaria';
              const concesionariaObj = concesionarias.find(c => c.name?.toUpperCase() === concesionariaName.toUpperCase());
              const hasDatacarCheck = isDatacarCheck(concesionariaName, datacarCheckSet);
              
              const imageSrc = model?.imgUrl;
              const hasValidImage = isValidImageSrc(imageSrc);
              const isOptimizable = isOptimizableImageSrc(imageSrc);

              return (
                <article key={version.id} className="bg-[#FFFFFF] border border-[#C0C0C0] hover:border-[#0A1F33] transition-colors flex flex-col relative group">
                  {/* Promo Badge */}
                  <div className="absolute top-4 left-0 bg-[#00BFFF] text-[#0A1F33] text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 z-10 shadow-sm border border-[#00BFFF]">
                    {version.promocion}
                  </div>

                  {/* Imagen */}
                  <div className="relative aspect-[4/3] w-full bg-[#F8F9FA] border-b border-[#C0C0C0] overflow-hidden">
                    {hasValidImage ? (
                      <Image
                        src={imageSrc}
                        alt={`${brand?.name} ${model?.name}`}
                        fill
                        unoptimized={!isOptimizable}
                        className="object-contain p-4 group-hover:scale-105 transition-transform duration-300"
                        sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-[#C0C0C0] text-[10px] font-bold uppercase tracking-widest">
                        Sin imagen
                      </div>
                    )}
                  </div>

                  <div className="p-4 flex flex-col flex-grow">
                    <div className="mb-2">
                      <span className="text-[10px] font-bold text-[#00BFFF] uppercase tracking-widest">
                        {brand?.name}
                      </span>
                      <h2 className="text-base md:text-lg font-black text-[#0A1F33] uppercase leading-tight mt-1" style={{ fontFamily: 'var(--font-montserrat)' }}>
                        {model?.name}
                      </h2>
                      <p className="text-[10px] md:text-xs text-[#3A3A3C] mt-1 line-clamp-1 uppercase tracking-wider">{version.name}</p>
                    </div>

                    <div className="mt-2 mb-4">
                      <p className="text-lg md:text-xl font-black text-[#0A1F33]" style={{ fontFamily: 'var(--font-montserrat)' }}>
                        {formatPrice(version.price)}
                      </p>
                    </div>
                    
                    <div className="mt-auto pt-4 border-t border-[#F8F9FA]">
                      <div className="flex flex-col gap-2 mb-4">
                        <span className="text-[10px] text-[#3A3A3C] font-bold uppercase tracking-widest truncate" title={concesionariaName}>
                          {concesionariaName}
                        </span>
                        {hasDatacarCheck && (
                          <div>
                            <DatacarCheckBadge size="sm" concesionariaNombre={concesionariaName} />
                          </div>
                        )}
                      </div>
                      
                      <BotonCotizar
                        vehiculoInteres={`${brand?.name} ${model?.name} ${version.name}`}
                        marcaVehiculo={brand?.name || ''}
                        origenLead="Promociones"
                        concesionariaDestino={concesionariaObj?.id || concesionariaName}
                      />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      <SimpleFooter disclaimer="DATACAR. Todos los derechos reservados." />
    </div>
  );
}
