'use client';

import React, { useState } from 'react';

// Interfaces para tipado estricto
interface Brand {
  id: string;
  name: string;
  origin: string;
  status: 'Activa' | 'Inactiva';
}

export default function BrandsAdminPage() {
  // Estado para manejar el formulario y la lista
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [newBrand, setNewBrand] = useState({ name: '', origin: '', status: 'Activa' });
  
  // Mock Data: Simula lo que leeremos de Firebase Firestore
  const [brands, setBrands] = useState<Brand[]>([
    { id: 'b1', name: 'Chevrolet', origin: 'USA', status: 'Activa' },
    { id: 'b2', name: 'Kia', origin: 'Corea del Sur', status: 'Activa' },
    { id: 'b3', name: 'Chery', origin: 'China', status: 'Activa' },
  ]);

  // Simulación de guardado en Firebase
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBrand.name) return; // Validación básica

    const brandToAdd: Brand = {
      id: `b${Date.now()}`, // ID temporal, Firebase usará addDoc()
      name: newBrand.name,
      origin: newBrand.origin,
      status: newBrand.status as 'Activa' | 'Inactiva',
    };

    setBrands([...brands, brandToAdd]);
    setIsFormOpen(false);
    setNewBrand({ name: '', origin: '', status: 'Activa' });
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex font-inter">
      
      {/* SIDEBAR BÁSICO (Placeholder para futura navegación del Admin) */}
      <aside className="w-64 bg-authorityBlue text-white min-h-screen p-6 hidden md:block">
        <div className="font-montserrat font-black text-2xl tracking-widest uppercase mb-10">
          DATA<span className="font-light">CAR</span>
        </div>
        <nav className="flex flex-col gap-4 text-sm">
          <a href="/admin/marcas" className="text-digitalCyan font-bold border-l-2 border-digitalCyan pl-2">Marcas</a>
          <a href="#" className="text-silverLight hover:text-white transition-colors pl-2 border-l-2 border-transparent">Modelos</a>
          <a href="#" className="text-silverLight hover:text-white transition-colors pl-2 border-l-2 border-transparent">Versiones</a>
          <a href="#" className="text-silverLight hover:text-white transition-colors pl-2 border-l-2 border-transparent">Concesionarias</a>
        </nav>
      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 p-8 text-dataCharcoal">
        
        {/* Header de la sección */}
        <header className="flex justify-between items-end mb-8 border-b-2 border-silverLight pb-4">
          <div>
            <h1 className="font-montserrat font-black text-3xl text-authorityBlue uppercase">
              ABM de Marcas
            </h1>
            <p className="text-sm text-dataCharcoal/70 mt-1">Gestión del catálogo maestro de fabricantes.</p>
          </div>
          
          <button 
            onClick={() => setIsFormOpen(!isFormOpen)}
            className="bg-digitalCyan hover:bg-[#00A0D6] text-white font-bold py-2 px-6 transition-colors shadow-none"
          >
            {isFormOpen ? 'Cancelar' : '+ Nueva Marca'}
          </button>
        </header>

        {/* FORMULARIO DE ALTA (Visible solo al hacer clic) */}
        {isFormOpen && (
          <section className="bg-white border-2 border-authorityBlue p-6 mb-8">
            <h2 className="font-montserrat font-bold text-lg text-authorityBlue uppercase mb-4">
              Registrar Nueva Marca
            </h2>
            <form onSubmit={handleSave} className="flex flex-col md:flex-row gap-4 items-end">
              <div className="w-full md:w-1/3">
                <label className="block text-xs font-bold uppercase text-dataCharcoal mb-1">Nombre de la Marca</label>
                <input 
                  type="text" 
                  required
                  className="w-full border-2 border-silverLight p-2 focus:outline-none focus:border-authorityBlue"
                  placeholder="Ej: Toyota"
                  value={newBrand.name}
                  onChange={(e) => setNewBrand({...newBrand, name: e.target.value})}
                />
              </div>
              <div className="w-full md:w-1/3">
                <label className="block text-xs font-bold uppercase text-dataCharcoal mb-1">País de Origen</label>
                <input 
                  type="text" 
                  className="w-full border-2 border-silverLight p-2 focus:outline-none focus:border-authorityBlue"
                  placeholder="Ej: Japón"
                  value={newBrand.origin}
                  onChange={(e) => setNewBrand({...newBrand, origin: e.target.value})}
                />
              </div>
              <div className="w-full md:w-1/4">
                <label className="block text-xs font-bold uppercase text-dataCharcoal mb-1">Estado</label>
                <select 
                  className="w-full border-2 border-silverLight p-2 focus:outline-none focus:border-authorityBlue"
                  value={newBrand.status}
                  onChange={(e) => setNewBrand({...newBrand, status: e.target.value})}
                >
                  <option value="Activa">Activa</option>
                  <option value="Inactiva">Inactiva</option>
                </select>
              </div>
              <div className="w-full md:w-auto">
                <button type="submit" className="w-full bg-authorityBlue hover:bg-dataCharcoal text-white font-bold py-2 px-6 transition-colors border-2 border-transparent">
                  Guardar
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
                <th className="p-4 text-xs font-bold uppercase text-dataCharcoal w-16">ID</th>
                <th className="p-4 text-xs font-bold uppercase text-dataCharcoal">Marca</th>
                <th className="p-4 text-xs font-bold uppercase text-dataCharcoal">Origen</th>
                <th className="p-4 text-xs font-bold uppercase text-dataCharcoal text-center">Estado</th>
                <th className="p-4 text-xs font-bold uppercase text-dataCharcoal text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {brands.map((brand) => (
                <tr key={brand.id} className="border-b border-silverLight/50 hover:bg-[#F8F9FA] transition-colors">
                  <td className="p-4 text-sm text-silverLight font-mono">{brand.id}</td>
                  <td className="p-4 text-sm font-bold text-authorityBlue">{brand.name}</td>
                  <td className="p-4 text-sm text-dataCharcoal">{brand.origin}</td>
                  <td className="p-4 text-center">
                    <span className={`text-[10px] uppercase font-bold px-2 py-1 ${brand.status === 'Activa' ? 'bg-[#E6F4EA] text-[#1E8E3E]' : 'bg-[#FCE8E6] text-[#D93025]'}`}>
                      {brand.status}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <button className="text-xs font-bold text-digitalCyan hover:underline uppercase">Editar</button>
                  </td>
                </tr>
              ))}
              {brands.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-silverLight">No hay marcas registradas.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

      </main>
    </div>
  );
}