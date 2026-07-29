'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, addDoc, updateDoc, writeBatch, query, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../../../lib/firebase'; 

// Interfaces B2B
interface Brand {
  id: string;
  name: string;
}

interface Dealership {
  id: string;
  name: string;
  location: string;
  rating: number;
  contactPhone: string;
  brandsHandled: string[]; // IDs de las marcas
  status: 'Activa' | 'Inactiva';
}

export default function DealershipsAdminPage() {
  const [activeTab, setActiveTab] = useState<'lista' | 'individual' | 'masiva'>('lista');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  
  const [brands, setBrands] = useState<Brand[]>([]);
  const [dealerships, setDealerships] = useState<Dealership[]>([]);
  
  // Estado para Formulario Individual (Alta / Edición)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ 
    name: '', 
    location: '', 
    rating: '5.0', 
    contactPhone: '',
    brandsHandled: [] as string[],
    status: 'Activa' 
  });

  // Estado para Inyección Masiva
  const [bulkJson, setBulkJson] = useState('');

  // 1. Cargar Datos Base (Marcas y Concesionarias)
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsFetching(true);
    try {
      const brandsQuery = query(collection(db, "brands"), orderBy("name", "asc"));
      const brandsSnap = await getDocs(brandsQuery);
      setBrands(brandsSnap.docs.map(doc => ({ id: doc.id, name: doc.data().name })));

      const dealQuery = query(collection(db, "dealerships"), orderBy("createdAt", "desc"));
      const dealSnap = await getDocs(dealQuery);
      setDealerships(dealSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Dealership)));
    } catch (error) {
      console.error("Error:", error);
      alert("Falla al conectar con Firestore.");
    } finally {
      setIsFetching(false);
    }
  };

  // 2. Manejo de Formulario Individual (Crear o Editar)
  const handleToggleBrand = (brandId: string) => {
    setFormData(prev => ({
      ...prev,
      brandsHandled: prev.brandsHandled.includes(brandId)
        ? prev.brandsHandled.filter(id => id !== brandId)
        : [...prev.brandsHandled, brandId]
    }));
  };

  const handleEdit = (deal: Dealership) => {
    setEditingId(deal.id);
    setFormData({
      name: deal.name,
      location: deal.location,
      rating: deal.rating.toString(),
      contactPhone: deal.contactPhone,
      brandsHandled: deal.brandsHandled || [],
      status: deal.status
    });
    setActiveTab('individual');
  };

  const handleSaveIndividual = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const payload = {
      name: formData.name.trim() || 'Vacío',
      location: formData.location.trim() || 'Vacío',
      rating: Number(formData.rating) || 0,
      contactPhone: formData.contactPhone.trim() || 'Vacío',
      brandsHandled: formData.brandsHandled,
      status: formData.status,
      updatedAt: Timestamp.now()
    };

    try {
      if (editingId) {
        const docRef = doc(db, "dealerships", editingId);
        await updateDoc(docRef, payload);
      } else {
        await addDoc(collection(db, "dealerships"), { ...payload, createdAt: Timestamp.now() });
      }
      
      // Limpiar y recargar
      setEditingId(null);
      setFormData({ name: '', location: '', rating: '5.0', contactPhone: '', brandsHandled: [], status: 'Activa' });
      setActiveTab('lista');
      await fetchData();
    } catch (error) {
      console.error("Error guardando:", error);
      alert("Error al guardar registro.");
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Inyección Masiva (Firebase Batch)
  const handleBulkInsert = async () => {
    if (!bulkJson.trim()) return;
    setIsLoading(true);

    try {
      const parsedData = JSON.parse(bulkJson);
      if (!Array.isArray(parsedData)) throw new Error("El JSON debe ser un array de objetos.");

      const batch = writeBatch(db);
      
      parsedData.forEach((item: any) => {
        const newDocRef = doc(collection(db, "dealerships"));
        batch.set(newDocRef, {
          // Si está vacío, se aplica la regla de negocio "Vacío"
          name: item.name || 'Vacío',
          location: item.location || 'Vacío',
          rating: Number(item.rating) || 0,
          contactPhone: item.contactPhone || 'Vacío',
          brandsHandled: Array.isArray(item.brandsHandled) ? item.brandsHandled : [],
          status: item.status || 'Activa',
          createdAt: Timestamp.now()
        });
      });

      await batch.commit();
      alert(`Éxito: Se inyectaron ${parsedData.length} concesionarias masivamente.`);
      setBulkJson('');
      setActiveTab('lista');
      await fetchData();
    } catch (error) {
      console.error("Error en Inyección Masiva:", error);
      alert("Falla en Inyección. Verifica que el formato JSON sea válido.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex font-inter text-dataCharcoal">
      
      {/* SIDEBAR CORPORATIVO */}
      <aside className="w-64 bg-authorityBlue text-white min-h-screen p-6 hidden md:block">
        <div className="font-montserrat font-black text-2xl tracking-widest uppercase mb-10">
          DATA<span className="font-light">CAR</span>
        </div>
        <nav className="flex flex-col gap-4 text-sm">
          <a href="/admin/marcas" className="text-silverLight hover:text-white transition-colors pl-2 border-l-2 border-transparent">Marcas</a>
          <a href="/admin/modelos" className="text-silverLight hover:text-white transition-colors pl-2 border-l-2 border-transparent">Modelos</a>
          <a href="/admin/versiones" className="text-silverLight hover:text-white transition-colors pl-2 border-l-2 border-transparent">Versiones</a>
          <a href="/admin/concesionarias" className="text-digitalCyan font-bold border-l-2 border-digitalCyan pl-2">Concesionarias</a>
        </nav>
      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 p-8">
        <header className="mb-8 border-b-2 border-silverLight pb-4">
          <h1 className="font-montserrat font-black text-3xl text-authorityBlue uppercase">
            ABM de Concesionarias
          </h1>
          <p className="text-sm text-dataCharcoal/70 mt-1">Gestión de red oficial y mapeo relacional de marcas.</p>
        </header>

        {/* NAVEGACIÓN DE TABS (Flat Design) */}
        <div className="flex border-b-2 border-silverLight mb-8">
          <button 
            onClick={() => { setActiveTab('lista'); setEditingId(null); }}
            className={`px-6 py-3 font-bold text-sm uppercase transition-colors border-b-2 -mb-[2px] ${activeTab === 'lista' ? 'border-authorityBlue text-authorityBlue' : 'border-transparent text-silverLight hover:text-dataCharcoal'}`}
          >
            Directorio Activo
          </button>
          <button 
            onClick={() => setActiveTab('individual')}
            className={`px-6 py-3 font-bold text-sm uppercase transition-colors border-b-2 -mb-[2px] ${activeTab === 'individual' ? 'border-authorityBlue text-authorityBlue' : 'border-transparent text-silverLight hover:text-dataCharcoal'}`}
          >
            {editingId ? 'Editar Registro' : 'Carga Manual'}
          </button>
          <button 
            onClick={() => { setActiveTab('masiva'); setEditingId(null); }}
            className={`px-6 py-3 font-bold text-sm uppercase transition-colors border-b-2 -mb-[2px] ${activeTab === 'masiva' ? 'border-digitalCyan text-digitalCyan' : 'border-transparent text-silverLight hover:text-dataCharcoal'}`}
          >
            Inyección Masiva (JSON)
          </button>
        </div>

        {/* VISTA 1: LISTADO Y EDICIÓN RÁPIDA */}
        {activeTab === 'lista' && (
          <section className="bg-white border-2 border-silverLight overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[#F5F5F5] border-b-2 border-silverLight">
                <tr>
                  <th className="p-4 text-xs font-bold uppercase text-dataCharcoal">Concesionaria</th>
                  <th className="p-4 text-xs font-bold uppercase text-dataCharcoal">Ubicación / Contacto</th>
                  <th className="p-4 text-xs font-bold uppercase text-dataCharcoal">Marcas (IDs)</th>
                  <th className="p-4 text-xs font-bold uppercase text-dataCharcoal text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {isFetching ? (
                  <tr><td colSpan={4} className="p-8 text-center font-bold">Cargando base de datos...</td></tr>
                ) : dealerships.length === 0 ? (
                  <tr><td colSpan={4} className="p-8 text-center text-silverLight">Sin registros. Usa Inyección Masiva o Carga Manual.</td></tr>
                ) : (
                  dealerships.map((deal) => (
                    <tr key={deal.id} className="border-b border-silverLight/50 hover:bg-[#F8F9FA] transition-colors">
                      <td className="p-4">
                        <p className="text-sm font-bold text-authorityBlue">{deal.name}</p>
                        <span className={`text-[10px] uppercase font-bold px-2 py-1 ${deal.status === 'Activa' ? 'bg-[#E6F4EA] text-[#1E8E3E]' : 'bg-[#FCE8E6] text-[#D93025]'}`}>
                          {deal.status}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-dataCharcoal">
                        <p>{deal.location}</p>
                        <p className="text-xs text-silverLight">{deal.contactPhone}</p>
                      </td>
                      <td className="p-4 text-xs font-mono text-silverLight max-w-[150px] truncate">
                        {deal.brandsHandled?.length > 0 ? deal.brandsHandled.join(', ') : 'Vacío'}
                      </td>
                      <td className="p-4 text-right">
                        <button onClick={() => handleEdit(deal)} className="text-xs font-bold text-digitalCyan hover:underline uppercase">Editar</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        )}

        {/* VISTA 2: FORMULARIO INDIVIDUAL */}
        {activeTab === 'individual' && (
          <section className="bg-white border-2 border-authorityBlue p-6 max-w-4xl">
            <h2 className="font-montserrat font-bold text-lg text-authorityBlue uppercase mb-6">
              {editingId ? `Editando: ${formData.name}` : 'Registrar Concesionaria Individual'}
            </h2>
            <form onSubmit={handleSaveIndividual} className="flex flex-col gap-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase mb-1">Nombre Comercial</label>
                  <input type="text" className="w-full border-2 border-silverLight p-2 focus:border-authorityBlue outline-none" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Ej: Garden Automotores" disabled={isLoading} />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase mb-1">Ubicación Física</label>
                  <input type="text" className="w-full border-2 border-silverLight p-2 focus:border-authorityBlue outline-none" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} placeholder="Ej: Asunción, Mcal Lopez" disabled={isLoading} />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase mb-1">Teléfono (Contacto Leads)</label>
                  <input type="text" className="w-full border-2 border-silverLight p-2 focus:border-authorityBlue outline-none" value={formData.contactPhone} onChange={e => setFormData({...formData, contactPhone: e.target.value})} placeholder="Ej: +595 981 123456" disabled={isLoading} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold uppercase mb-1">Rating (1-5)</label>
                    <input type="number" step="0.1" className="w-full border-2 border-silverLight p-2 focus:border-authorityBlue outline-none" value={formData.rating} onChange={e => setFormData({...formData, rating: e.target.value})} disabled={isLoading} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase mb-1">Estado</label>
                    <select className="w-full border-2 border-silverLight p-2 focus:border-authorityBlue outline-none bg-white" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as any})} disabled={isLoading}>
                      <option value="Activa">Activa</option>
                      <option value="Inactiva">Inactiva</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Selector Múltiple de Marcas */}
              <div className="border-t-2 border-silverLight pt-4">
                <label className="block text-xs font-bold uppercase mb-3">Marcas Representadas (Cruces Relacionales)</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {brands.length === 0 ? <p className="text-xs text-silverLight">No hay marcas registradas.</p> : brands.map(b => (
                    <label key={b.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-[#F5F5F5] p-2 border border-transparent hover:border-silverLight transition-colors">
                      <input 
                        type="checkbox" 
                        className="accent-digitalCyan"
                        checked={formData.brandsHandled.includes(b.id)}
                        onChange={() => handleToggleBrand(b.id)}
                        disabled={isLoading}
                      />
                      {b.name}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end border-t-2 border-silverLight pt-4 mt-2">
                <button type="submit" disabled={isLoading} className="bg-digitalCyan hover:bg-[#00A0D6] text-white font-bold py-3 px-8 uppercase transition-colors disabled:opacity-50">
                  {isLoading ? 'Procesando...' : (editingId ? 'Actualizar Registro' : 'Guardar Concesionaria')}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* VISTA 3: INYECCIÓN MASIVA */}
        {activeTab === 'masiva' && (
          <section className="bg-white border-2 border-authorityBlue p-6">
            <div className="mb-4">
              <h2 className="font-montserrat font-bold text-lg text-authorityBlue uppercase mb-2">Inyección Masiva de Datos</h2>
              <p className="text-sm">Pegue un arreglo JSON válido. Los campos vacíos serán reemplazados por el texto <b>"Vacío"</b> automáticamente según regla de negocio.</p>
              <pre className="text-[10px] bg-[#F5F5F5] text-silverLight p-3 mt-2 font-mono overflow-x-auto border border-silverLight">
{`// Formato esperado:
[
  {
    "name": "Datacar Oficial",
    "location": "Asunción",
    "contactPhone": "+595...",
    "rating": 5.0,
    "brandsHandled": ["id_marca_1", "id_marca_2"],
    "status": "Activa"
  }
]`}
              </pre>
            </div>
            
            <textarea 
              className="w-full h-64 border-2 border-silverLight p-4 font-mono text-sm focus:border-authorityBlue outline-none mb-4 whitespace-pre"
              placeholder="Pegue su JSON aquí..."
              value={bulkJson}
              onChange={e => setBulkJson(e.target.value)}
              disabled={isLoading}
            ></textarea>

            <button 
              onClick={handleBulkInsert}
              disabled={isLoading || !bulkJson.trim()} 
              className="bg-authorityBlue hover:bg-dataCharcoal text-white font-bold py-3 px-8 uppercase transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Inyectando Lote...' : 'Ejecutar Inyección Masiva'}
            </button>
          </section>
        )}

      </main>
    </div>
  );
}