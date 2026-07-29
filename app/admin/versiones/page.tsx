'use client';

import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query, orderBy, where, Timestamp } from 'firebase/firestore';
import { db } from '../../../lib/firebase'; 

// Interfaces
interface Brand {
  id: string;
  name: string;
}

interface CarModel {
  id: string;
  brandId: string;
  name: string;
}

interface CarVersion {
  id: string;
  modelId: string;
  modelName: string;
  brandName: string;
  name: string;
  price: number;
  specs: {
    motor: string;
    caja: string;
    airbags: string;
  };
  status: 'Activa' | 'Inactiva';
}

export default function VersionsAdminPage() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  
  const [brands, setBrands] = useState<Brand[]>([]);
  const [allModels, setAllModels] = useState<CarModel[]>([]);
  const [filteredModels, setFilteredModels] = useState<CarModel[]>([]);
  const [versions, setVersions] = useState<CarVersion[]>([]);
  
  const [newVersion, setNewVersion] = useState({ 
    brandId: '',
    modelId: '', 
    name: '', 
    price: '',
    motor: '',
    caja: 'Manual',
    airbags: '2',
    status: 'Activa' 
  });

  // Carga inicial de Marcas, Modelos y Versiones
  useEffect(() => {
    const fetchData = async () => {
      setIsFetching(true);
      try {
        // 1. Traer Marcas
        const brandsQuery = query(collection(db, "brands"), orderBy("name", "asc"));
        const brandsSnap = await getDocs(brandsQuery);
        const brandsData = brandsSnap.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
        setBrands(brandsData);

        // 2. Traer Modelos para el filtrado rápido en memoria
        const modelsQuery = query(collection(db, "models"));
        const modelsSnap = await getDocs(modelsQuery);
        const modelsData = modelsSnap.docs.map(doc => ({ 
          id: doc.id, 
          brandId: doc.data().brandId, 
          name: doc.data().name 
        }));
        setAllModels(modelsData);

        // 3. Traer Versiones existentes
        const versionsQuery = query(collection(db, "versions"), orderBy("createdAt", "desc"));
        const versionsSnap = await getDocs(versionsQuery);
        const versionsData = versionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CarVersion));
        setVersions(versionsData);

      } catch (error) {
        console.error("Error cargando datos:", error);
        alert("Error de conexión con Firebase al cargar versiones.");
      } finally {
        setIsFetching(false);
      }
    };

    fetchData();
  }, []);

  // Lógica de filtrado en cascada: Cuando cambia la marca, filtramos los modelos
  useEffect(() => {
    if (newVersion.brandId) {
      const filtered = allModels.filter(m => m.brandId === newVersion.brandId);
      setFilteredModels(filtered);
      // Resetear el modelo seleccionado si la marca cambia
      setNewVersion(prev => ({ ...prev, modelId: '' }));
    } else {
      setFilteredModels([]);
    }
  }, [newVersion.brandId, allModels]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVersion.modelId || !newVersion.name.trim() || !newVersion.price) return;

    setIsLoading(true);
    try {
      const selectedBrand = brands.find(b => b.id === newVersion.brandId);
      const selectedModel = allModels.find(m => m.id === newVersion.modelId);

      const versionData = {
        modelId: newVersion.modelId,
        brandName: selectedBrand?.name || '',
        modelName: selectedModel?.name || '',
        name: newVersion.name.trim().toUpperCase(),
        price: Number(newVersion.price),
        specs: {
          motor: newVersion.motor.trim(),
          caja: newVersion.caja,
          airbags: newVersion.airbags,
        },
        status: newVersion.status,
        createdAt: Timestamp.now()
      };

      const docRef = await addDoc(collection(db, "versions"), versionData);

      setVersions([{ id: docRef.id, ...versionData } as CarVersion, ...versions]);
      setIsFormOpen(false);
      
      // Reseteamos el formulario manteniendo la marca y modelo para carga ágil
      setNewVersion(prev => ({ 
        ...prev, 
        name: '', 
        price: '', 
        motor: '', 
        status: 'Activa' 
      }));
    } catch (error) {
      console.error("Error guardando versión: ", error);
      alert("Error al guardar la versión.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex font-inter">
      
      {/* SIDEBAR CORPORATIVO */}
      <aside className="w-64 bg-authorityBlue text-white min-h-screen p-6 hidden md:block">
        <div className="font-montserrat font-black text-2xl tracking-widest uppercase mb-10">
          DATA<span className="font-light">CAR</span>
        </div>
        <nav className="flex flex-col gap-4 text-sm">
          <a href="/admin/marcas" className="text-silverLight hover:text-white transition-colors pl-2 border-l-2 border-transparent">Marcas</a>
          <a href="/admin/modelos" className="text-silverLight hover:text-white transition-colors pl-2 border-l-2 border-transparent">Modelos</a>
          <a href="/admin/versiones" className="text-digitalCyan font-bold border-l-2 border-digitalCyan pl-2">Versiones</a>
          <a href="/admin/concesionarias" className="text-silverLight hover:text-white transition-colors pl-2 border-l-2 border-transparent">Concesionarias</a>
        </nav>
      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 p-8 text-dataCharcoal">
        <header className="flex justify-between items-end mb-8 border-b-2 border-silverLight pb-4">
          <div>
            <h1 className="font-montserrat font-black text-3xl text-authorityBlue uppercase">
              ABM de Versiones
            </h1>
            <p className="text-sm text-dataCharcoal/70 mt-1">Especificaciones técnicas y precios al nivel más granular.</p>
          </div>
          
          <button 
            onClick={() => setIsFormOpen(!isFormOpen)}
            className="bg-digitalCyan hover:bg-[#00A0D6] text-white font-bold py-2 px-6 transition-colors shadow-none"
          >
            {isFormOpen ? 'Cerrar Formulario' : '+ Nueva Versión'}
          </button>
        </header>

        {/* FORMULARIO DE ALTA */}
        {isFormOpen && (
          <section className="bg-white border-2 border-authorityBlue p-6 mb-8">
            <h2 className="font-montserrat font-bold text-lg text-authorityBlue uppercase mb-4">
              Registrar Nueva Versión
            </h2>
            <form onSubmit={handleSave} className="flex flex-col gap-6">
              
              {/* Bloque 1: Relaciones */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-silverLight/50 pb-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-dataCharcoal mb-1">1. Marca</label>
                  <select 
                    required
                    disabled={isLoading || brands.length === 0}
                    className="w-full border-2 border-silverLight p-2 focus:outline-none focus:border-authorityBlue bg-white"
                    value={newVersion.brandId}
                    onChange={(e) => setNewVersion({...newVersion, brandId: e.target.value})}
                  >
                    <option value="" disabled>Seleccione marca</option>
                    {brands.map(brand => (
                      <option key={brand.id} value={brand.id}>{brand.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-dataCharcoal mb-1">2. Modelo</label>
                  <select 
                    required
                    disabled={isLoading || !newVersion.brandId}
                    className="w-full border-2 border-silverLight p-2 focus:outline-none focus:border-authorityBlue bg-white disabled:bg-gray-100"
                    value={newVersion.modelId}
                    onChange={(e) => setNewVersion({...newVersion, modelId: e.target.value})}
                  >
                    <option value="" disabled>Seleccione modelo</option>
                    {filteredModels.map(model => (
                      <option key={model.id} value={model.id}>{model.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-dataCharcoal mb-1">3. Nombre de Versión</label>
                  <input 
                    type="text" 
                    required
                    disabled={isLoading}
                    className="w-full border-2 border-silverLight p-2 focus:outline-none focus:border-authorityBlue uppercase"
                    placeholder="Ej: 1.0T PREMIER AT"
                    value={newVersion.name}
                    onChange={(e) => setNewVersion({...newVersion, name: e.target.value})}
                  />
                </div>
              </div>

              {/* Bloque 2: Specs y Precio */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-dataCharcoal mb-1">Precio (US$)</label>
                  <input 
                    type="number" 
                    required
                    disabled={isLoading}
                    className="w-full border-2 border-silverLight p-2 focus:outline-none focus:border-authorityBlue font-bold text-authorityBlue"
                    placeholder="Ej: 32000"
                    value={newVersion.price}
                    onChange={(e) => setNewVersion({...newVersion, price: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-dataCharcoal mb-1">Motorización</label>
                  <input 
                    type="text" 
                    required
                    disabled={isLoading}
                    className="w-full border-2 border-silverLight p-2 focus:outline-none focus:border-authorityBlue"
                    placeholder="Ej: 1.6 Turbo 186HP"
                    value={newVersion.motor}
                    onChange={(e) => setNewVersion({...newVersion, motor: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-dataCharcoal mb-1">Transmisión</label>
                  <select 
                    disabled={isLoading}
                    className="w-full border-2 border-silverLight p-2 focus:outline-none focus:border-authorityBlue bg-white"
                    value={newVersion.caja}
                    onChange={(e) => setNewVersion({...newVersion, caja: e.target.value})}
                  >
                    <option value="Manual">Manual</option>
                    <option value="Automática">Automática</option>
                    <option value="CVT">CVT</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-dataCharcoal mb-1">Airbags</label>
                  <select 
                    disabled={isLoading}
                    className="w-full border-2 border-silverLight p-2 focus:outline-none focus:border-authorityBlue bg-white"
                    value={newVersion.airbags}
                    onChange={(e) => setNewVersion({...newVersion, airbags: e.target.value})}
                  >
                    <option value="2">2 (Frontales)</option>
                    <option value="4">4 (Frontales + Laterales)</option>
                    <option value="6">6 (Completos)</option>
                    <option value="7+">7 o más</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end mt-2 pt-4 border-t border-silverLight/50">
                <button 
                  type="submit" 
                  disabled={isLoading}
                  className="bg-authorityBlue hover:bg-dataCharcoal text-white font-bold py-3 px-8 transition-colors border-2 border-transparent disabled:opacity-50"
                >
                  {isLoading ? 'Registrando en Firebase...' : 'Guardar Versión'}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* TABLA DE DATOS */}
        <section className="bg-white border-2 border-silverLight overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#F5F5F5] border-b-2 border-silverLight">
              <tr>
                <th className="p-4 text-xs font-bold uppercase text-dataCharcoal">Vehículo</th>
                <th className="p-4 text-xs font-bold uppercase text-dataCharcoal">Versión</th>
                <th className="p-4 text-xs font-bold uppercase text-dataCharcoal">Precio</th>
                <th className="p-4 text-xs font-bold uppercase text-dataCharcoal">Motor / Caja</th>
                <th className="p-4 text-xs font-bold uppercase text-dataCharcoal text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isFetching ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-dataCharcoal font-bold">Cargando catálogo maestro...</td>
                </tr>
              ) : versions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-silverLight">No hay versiones registradas.</td>
                </tr>
              ) : (
                versions.map((version) => (
                  <tr key={version.id} className="border-b border-silverLight/50 hover:bg-[#F8F9FA] transition-colors">
                    <td className="p-4 text-sm text-dataCharcoal">
                      <span className="font-bold text-authorityBlue">{version.brandName}</span> {version.modelName}
                    </td>
                    <td className="p-4 text-sm font-bold text-authorityBlue">{version.name}</td>
                    <td className="p-4 text-sm font-bold text-authorityBlue">US$ {version.price.toLocaleString()}</td>
                    <td className="p-4 text-xs text-dataCharcoal uppercase">{version.specs.motor} • {version.specs.caja}</td>
                    <td className="p-4 text-right">
                      <button className="text-xs font-bold text-digitalCyan hover:underline uppercase">Editar</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

      </main>
    </div>
  );
}