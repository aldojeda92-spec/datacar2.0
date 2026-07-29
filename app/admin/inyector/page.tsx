'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../lib/firebase'; // Asegúrate de la ruta correcta

const generarSlug = (texto: string) => texto?.toString().toLowerCase().replace(/[\s_]+/g, '-').replace(/[^\w-]+/g, '') || '';

export default function InyectorCSVPage() {
  const [csvData, setCsvData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState({ type: 'idle', message: '' });

  // ==========================================
  // PARSER NATIVO DE CSV (Alta Densidad)
  // ==========================================
  const procesarCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus({ type: 'idle', message: '' });
    const reader = new FileReader();

    reader.onload = (event) => {
      const text = event.target?.result as string;
      
      const filas = text.split('\n').filter(fila => fila.trim() !== '');
      if (filas.length < 2) {
        setStatus({ type: 'error', message: 'El archivo está vacío o no tiene encabezados.' });
        return;
      }

      // Normalizar encabezados eliminando espacios y caracteres raros
      const rawHeaders = filas[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]+/g, ''));
      setHeaders(rawHeaders);

      const parsedData = [];
      for (let i = 1; i < filas.length; i++) {
        // Regex para parsear CSV respetando comas dentro de comillas
        const valores = filas[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || filas[i].split(',');
        
        const filaObjeto: any = {};
        rawHeaders.forEach((header, index) => {
          let valor = valores[index] ? valores[index].trim().replace(/^"|"$/g, '') : '';
          filaObjeto[header] = valor;
        });
        parsedData.push(filaObjeto);
      }

      setCsvData(parsedData);
      setStatus({ type: 'success', message: `CSV cargado en RAM. ${parsedData.length} SKUs listos para inyección.` });
    };

    reader.readAsText(file);
  };

  // ==========================================
  // MOTOR DE INYECCIÓN (FIREBASE BATCH)
  // ==========================================
  const ejecutarInyeccion = async () => {
    if (csvData.length === 0) return;
    setIsLoading(true);
    setStatus({ type: 'idle', message: 'Iniciando inyección masiva...' });

    try {
      let batch = writeBatch(db);
      let operationCount = 0;
      let totalInyectados = 0;

      for (const fila of csvData) {
        // Validaciones críticas
        if (!fila.marca || !fila.modelo || !fila.version) continue;

        const idConcesionaria = generarSlug(fila.concesionaria || 'generico');
        const idMarca = generarSlug(fila.marca);
        const idModelo = generarSlug(fila.modelo);
        const idVersion = `${idModelo}_${generarSlug(fila.version)}`;

        // 1. Inyectar Concesionaria
        if (fila.concesionaria) {
          const refConcesionaria = doc(db, 'concesionarias', idConcesionaria);
          batch.set(refConcesionaria, { 
            name: fila.concesionaria, 
            updatedAt: serverTimestamp() 
          }, { merge: true });
          operationCount++;
        }

        // 2. Inyectar Marca
        const refMarca = doc(db, 'brands', idMarca);
        batch.set(refMarca, { 
          name: fila.marca.toUpperCase(), 
          origin: fila.origen_marca || '',
          updatedAt: serverTimestamp() 
        }, { merge: true });
        operationCount++;

        // 3. Inyectar Modelo (Estructura Base y Dimensiones)
        const refModelo = doc(db, 'models', idModelo);
        batch.set(refModelo, {
          brandId: idMarca,
          name: fila.modelo.toUpperCase(),
          category: fila.tipo_carroceria || 'SUV',
          subsegmento: fila.subsegmento || '',
          origin: fila.origen || '',
          startingPrice: Number(fila.precio_usd) || 0, // Se actualizará al último precio leído
          imgUrl: fila.url_imagen || `https://via.placeholder.com/800x400?text=${fila.marca}+${fila.modelo}`,
          taxNote: '+ gastos de patentamiento',
          dimensions: {
            largo: fila.largo || '',
            ancho: fila.ancho || '',
            alto: fila.alto || '',
            despejeSuelo: fila.despeje_suelo || '',
            bauleraLitros: fila.baulera_litros || ''
          },
          updatedAt: serverTimestamp()
        }, { merge: true });
        operationCount++;

        // 4. Inyectar Versión Detallada (Mecánica y Equipamiento)
        const refVersion = doc(db, 'versions', idVersion);
        batch.set(refVersion, {
          modelId: idModelo,
          name: fila.version,
          price: Number(fila.precio_usd) || 0,
          url_auto: fila.url_auto || '',
          specs: {
            motor: fila.motor || '-',
            transmision: fila.transmision || '-',
            combustible: fila.combustible || '-',
            traccion: fila.traccion || '-',
            plazas: fila.plazas || '-',
            airbags: fila.airbags || '-',
            pantalla: fila.tamanho_pantalla || '-',
            garantia: fila.garantia || '-'
          },
          features: {
            adas: fila.adas ? fila.adas.split('|').map((i: string) => i.trim()) : [], // Asume separación por |
            asiento_cuero: fila.asiento_cuero || '-',
            techo_panoramico: fila.techo_panoramico || '-',
            conectividad: fila.conectividad || '-',
            camaras: fila.camaras || '-'
          },
          updatedAt: serverTimestamp()
        }, { merge: true });
        operationCount++;

        totalInyectados++;

        // Control de Límite de Firebase (500 operaciones por Batch)
        if (operationCount >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          operationCount = 0;
        }
      }

      if (operationCount > 0) {
        await batch.commit();
      }

      setStatus({ type: 'success', message: `¡Ejecución perfecta! Se inyectaron/actualizaron ${totalInyectados} versiones completas en Firebase.` });
      setCsvData([]); 

    } catch (error: any) {
      console.error("Fallo masivo:", error);
      setStatus({ type: 'error', message: `Error crítico en escritura: ${error.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex text-[#3A3A3C]" style={{ fontFamily: 'Inter, sans-serif' }}>
      
      {/* SIDEBAR B2B */}
      <aside className="w-64 bg-[#0A1F33] text-[#FFFFFF] min-h-screen p-6 hidden md:flex flex-col border-r border-[#0A1F33]">
        <div className="font-black text-2xl tracking-widest uppercase mb-10" style={{ fontFamily: 'Montserrat, sans-serif' }}>
          DATA<span className="font-light">CAR</span>
        </div>
        <span className="text-[9px] text-[#C0C0C0] uppercase font-bold tracking-widest mb-4">Módulos ABM</span>
        <nav className="flex flex-col gap-4 text-sm font-bold uppercase tracking-wider text-[11px]">
          <Link href="/admin" className="text-[#C0C0C0] hover:text-[#FFFFFF] transition-colors pl-3 border-l-2 border-transparent">Panel Principal</Link>
          <Link href="/admin/inyector" className="text-[#00BFFF] border-l-2 border-[#00BFFF] pl-3">Inyector Masivo CSV</Link>
        </nav>
      </aside>

      {/* ÁREA DE TRABAJO */}
      <main className="flex-1 p-6 md:p-10 flex flex-col h-screen overflow-hidden">
        <header className="mb-6 border-b border-[#C0C0C0] pb-4 flex justify-between items-end shrink-0">
          <div>
            <h1 className="font-black text-3xl text-[#0A1F33] uppercase" style={{ fontFamily: 'Montserrat, sans-serif' }}>
              Inyector Maestro CSV
            </h1>
            <p className="text-xs text-[#3A3A3C] mt-2 font-bold uppercase tracking-widest">
              Actualización Masiva de Inventario Automotriz
            </p>
          </div>
        </header>

        {status.message && (
          <div className={`p-4 mb-4 text-xs font-bold uppercase tracking-widest border shrink-0 ${status.type === 'error' ? 'bg-[#FFE6E6] text-[#D93025] border-[#D93025]' : 'bg-[#E6F4EA] text-[#1E8E3E] border-[#1E8E3E]'}`}>
            {status.message}
          </div>
        )}

        <section className="bg-[#FFFFFF] border border-[#C0C0C0] flex flex-col flex-grow min-h-0">
          
          <div className="p-5 border-b border-[#C0C0C0] bg-[#F5F5F5] flex justify-between items-center shrink-0">
            <div>
              <h2 className="font-bold text-[#0A1F33] text-sm uppercase">Carga de Datos</h2>
              <p className="text-[10px] text-[#3A3A3C] uppercase tracking-widest mt-1">El archivo debe contener las 29 columnas mapeadas separadas por coma.</p>
            </div>
            
            <label className="bg-[#FFFFFF] border border-[#0A1F33] text-[#0A1F33] font-bold text-xs uppercase px-6 py-3 tracking-widest cursor-pointer hover:bg-[#0A1F33] hover:text-[#FFFFFF] transition-colors">
              Explorar Archivo CSV
              <input type="file" accept=".csv" className="hidden" onChange={procesarCSV} />
            </label>
          </div>

          {/* TABLA DE PREVISUALIZACIÓN HORIZONTAL SCROLL */}
          <div className="flex-grow overflow-auto p-0 bg-[#FFFFFF] custom-scrollbar relative">
            {csvData.length > 0 ? (
              <table className="w-max min-w-full text-left border-collapse whitespace-nowrap">
                <thead className="sticky top-0 bg-[#0A1F33] text-[#FFFFFF] shadow-md z-20">
                  <tr className="text-[9px] font-bold uppercase tracking-widest">
                    <th className="p-3 border-r border-[#FFFFFF]/20 sticky left-0 bg-[#0A1F33] z-30"># Fila</th>
                    {headers.map((h, i) => (
                      <th key={i} className="p-3 border-r border-[#FFFFFF]/20">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-[11px] font-mono">
                  {csvData.slice(0, 100).map((fila, rowIndex) => (
                    <tr key={rowIndex} className="border-b border-[#C0C0C0]/50 hover:bg-[#F8F9FA]">
                      <td className="p-3 font-bold text-[#00BFFF] border-r border-[#C0C0C0]/50 sticky left-0 bg-[#FFFFFF] group-hover:bg-[#F8F9FA] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] z-10">
                        {rowIndex + 1}
                      </td>
                      {headers.map((h, i) => (
                        <td key={i} className="p-3 border-r border-[#C0C0C0]/50 text-[#3A3A3C] truncate max-w-[200px]" title={fila[h]}>
                          {fila[h]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-12 text-[#C0C0C0]">
                <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeWidth="1.5" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                <p className="font-bold uppercase tracking-widest text-xs">Esperando matriz de datos...</p>
              </div>
            )}
          </div>
          
          {csvData.length > 100 && (
            <div className="text-center p-2 text-[10px] bg-[#F5F5F5] font-bold text-[#3A3A3C] border-t border-[#C0C0C0] shrink-0">
              Previsualizando las primeras 100 filas. ({csvData.length} SKUs listos para procesar)
            </div>
          )}

          <div className="p-5 border-t border-[#C0C0C0] bg-[#FFFFFF] flex justify-end items-center gap-4 shrink-0">
             <button 
                onClick={() => setCsvData([])} 
                className="text-[10px] font-bold text-[#D93025] uppercase tracking-widest hover:underline"
                disabled={isLoading || csvData.length === 0}
             >
                Descartar Lote
             </button>
             <button 
              onClick={ejecutarInyeccion}
              disabled={isLoading || csvData.length === 0}
              className="bg-[#00BFFF] hover:bg-[#0A1F33] text-[#FFFFFF] font-bold text-xs uppercase tracking-widest py-4 px-10 transition-colors disabled:opacity-50 shadow-none border-none"
            >
              {isLoading ? 'Inyectando SKUs...' : 'Ejecutar Inyección en Firebase'}
            </button>
          </div>

        </section>
      </main>
    </div>
  );
}