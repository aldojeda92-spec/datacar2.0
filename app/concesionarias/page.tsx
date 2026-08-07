// app/concesionarias/page.tsx
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { collection, getDocs, doc, getDoc, updateDoc, addDoc, setDoc, serverTimestamp, query, where, writeBatch } from 'firebase/firestore';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { db, auth } from '../../lib/firebase';
import { generarSlug } from '../../lib/slug';
import { parseCSVRow } from '../../lib/csv';
import { useToast } from '../context/ToastContext';

// ==========================================
// INTERFACES B2B
// ==========================================
interface UserData {
  role: string;
  dealershipName: string;
  marcasPermitidas: string[];
}

interface RequestForm { nombre: string; cargo: string; concesionaria: string; marcas: string; telefono: string; email: string; }

export default function PortalConcesionariasPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState({ type: '', message: '' });
  
  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [authView, setAuthView] = useState<'login' | 'request'>('login');

  // Formularios Login
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [reqForm, setReqForm] = useState<RequestForm>({ nombre: '', cargo: '', concesionaria: '', marcas: '', telefono: '', email: '' });

  // Dashboard State
  const [activeTab, setActiveTab] = useState<'leads' | 'inventario'>('leads');
  const [invSubTab, setInvSubTab] = useState<'catalogo' | 'manual' | 'csv'>('catalogo');
  
  // Datos relacionales
  const [leads, setLeads] = useState<any[]>([]);
  const [inventario, setInventario] = useState<any[]>([]);
  const [marcasList, setMarcasList] = useState<any[]>([]);
  const [modelosList, setModelosList] = useState<any[]>([]);
  
  // ==========================================
  // ESTADOS DE FILTRO PARA INVENTARIO
  // ==========================================
  const [inventarioSearch, setInventarioSearch] = useState('');
  const [invFilterMarca, setInvFilterMarca] = useState('Todas');
  const [invFilterModelo, setInvFilterModelo] = useState('Todos');

  // Estado para Edición de Precios
  const [editingVersion, setEditingVersion] = useState<string | null>(null);
  const [newPrice, setNewPrice] = useState<string>('');
  const [newPromo, setNewPromo] = useState<string>('');

  // Formularios Carga Manual
  const [modeloForm, setModeloForm] = useState({ id: '', brandId: '', name: '', tipo_carroceria: 'SUV', origen: '', startingPrice: '', imgUrl: '' });
  const [versionForm, setVersionForm] = useState({ 
    id: '', modelId: '', name: '', price: '', promocion: '', url_auto: '', motor: '', transmision: '', combustible: '', traccion: '', plazas: '', airbags: '', tamanho_pantalla: ''
  });

  // Estados CSV
  const [csvData, setCsvData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);

  // ==========================================
  // 1. CARGA DE DATOS B2B (NORMALIZADA Y BLINDADA)
  // ==========================================
  const fetchDashboardData = useCallback(async (uData: UserData) => {
    try {
      // Normalizamos el scope de marcas para comparaciones seguras
      const permitidasNormalizadas = uData.marcasPermitidas.map(m => m.toUpperCase().trim());
      const dealershipNameNorm = uData.dealershipName.toUpperCase().trim();

      // Obtenemos Catálogo Global (los leads se filtran server-side por concesionaria_destino_norm,
      // no se descarga la colección completa de leads de todas las concesionarias)
      const [bSnap, mSnap, vSnap, leadsSnap] = await Promise.all([
        getDocs(collection(db, 'brands')),
        getDocs(collection(db, 'models')),
        getDocs(collection(db, 'versions')),
        getDocs(query(collection(db, 'leads'), where('concesionaria_destino_norm', '==', dealershipNameNorm)))
      ]);

      const bList: any[] = bSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const mList: any[] = mSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      setMarcasList(bList);
      setModelosList(mList);

      const brandsMap: Record<string, string> = {};
      bList.forEach(b => brandsMap[b.id] = b.name);
      
      const modelsMap: Record<string, { name: string, brandId: string }> = {};
      mList.forEach(m => modelsMap[m.id] = { name: m.name, brandId: m.brandId });

      // ==============================================
      // RESOLUCIÓN: INVENTARIO POR MARCAS PERMITIDAS
      // ==============================================
      const allVersions: any[] = vSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const invEnriquecido = allVersions.map(vData => {
        const modelInfo = modelsMap[vData.modelId] || { name: 'Desconocido', brandId: '' };
        const brandName = brandsMap[modelInfo.brandId] || 'Desconocido';
        return {
          id: vData.id,
          ...vData,
          modelName: modelInfo.name,
          brandName: brandName
        };
      }).filter(v => {
        // El usuario B2B solo verá versiones cuya marca esté en su array de permisos
        return permitidasNormalizadas.includes(v.brandName.toUpperCase().trim());
      });

      setInventario(invEnriquecido);

      // ==============================================
      // RESOLUCIÓN: LEADS (ya filtrados server-side por la query)
      // ==============================================
      const myLeads = leadsSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => b.createdAt?.toDate() - a.createdAt?.toDate());

      setLeads(myLeads);

    } catch (error) {
      console.error("Error cargando dashboard B2B:", error);
      setFeedback({ type: 'error', message: 'No se pudieron cargar tus datos operativos.' });
    }
  }, []);

  // ==========================================
  // 2. OBSERVADOR DE SESIÓN Y CARGA DE SCOPE
  // ==========================================
  useEffect(() => {
    let isMounted = true;
    
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          if (userDoc.exists() && userDoc.data()?.role === 'concesionaria') {
            const rawData = userDoc.data() as any;
            
            // Auto-Sanación del Array de Marcas
            let parsedMarcas: string[] = [];
            if (typeof rawData.marcasPermitidas === 'string') {
              try { parsedMarcas = JSON.parse(rawData.marcasPermitidas); } 
              catch (e) { parsedMarcas = rawData.marcasPermitidas.split(',').map((m: string) => m.trim()); }
            } else if (Array.isArray(rawData.marcasPermitidas)) {
              parsedMarcas = rawData.marcasPermitidas;
            }

            const data: UserData = {
              role: rawData.role,
              dealershipName: rawData.dealershipName,
              marcasPermitidas: parsedMarcas
            };

            if (isMounted) {
              setUser(currentUser);
              setUserData(data);
              await fetchDashboardData(data);
            }
          } else {
            await signOut(auth);
            if (isMounted) setFeedback({ type: 'error', message: 'No tienes permisos de Concesionario Oficial.' });
          }
        } catch (error) {
          console.error("Error verificando permisos:", error);
          if (isMounted) setFeedback({ type: 'error', message: 'Error de conexión con el servidor.' });
        }
      } else {
        if (isMounted) {
          setUser(null);
          setUserData(null);
        }
      }
      if (isMounted) setLoading(false);
    });
    
    return () => { isMounted = false; unsubscribe(); };
  }, [fetchDashboardData]);

  // ==========================================
  // 3. AUDITORÍA Y TRAZABILIDAD (LOGS)
  // ==========================================
  const logAudit = async (action: string, entityId: string, details: string) => {
    try {
      await addDoc(collection(db, 'audit_logs'), {
        userId: user?.uid,
        userEmail: user?.email,
        dealership: userData?.dealershipName,
        action,
        entityId,
        details,
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error("Error registrando auditoría", e);
    }
  };

  // ==========================================
  // 4. ALTA Y LOGIN (Con Alerta Ejecutiva)
  // ==========================================
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setFeedback({ type: '', message: '' });
    try {
      await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
    } catch (error: any) {
      setFeedback({ type: 'error', message: 'Credenciales inválidas o cuenta no registrada.' });
      setLoading(false);
    }
  };

  const handleRequestAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setFeedback({ type: '', message: '' });
    try {
      await addDoc(collection(db, 'dealership_requests'), {
        ...reqForm,
        estado: 'Pendiente',
        createdAt: serverTimestamp()
      });

      const htmlAdmin = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #C0C0C0;">
          <h2 style="color: #0A1F33; border-bottom: 2px solid #00BFFF; padding-bottom: 10px;">NUEVA SOLICITUD DE ALTA B2B</h2>
          <p><strong>Concesionaria:</strong> ${reqForm.concesionaria}</p>
          <p><strong>Solicitante:</strong> ${reqForm.nombre} (${reqForm.cargo})</p>
          <p><strong>Marcas Representadas:</strong> ${reqForm.marcas}</p>
          <p><strong>Teléfono:</strong> ${reqForm.telefono}</p>
          <p><strong>Email:</strong> ${reqForm.email}</p>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #C0C0C0;" />
          <p style="font-size: 12px; color: #3A3A3C;">Ingresa a Firebase Auth y crea manualmente este usuario. Luego, asígnale sus permisos en el panel de administrador.</p>
        </div>
      `;

      await fetch('/api/mail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destinatarios: ['aldo.ojeda@datacarpy.com'],
          subject: `🚨 ALTA B2B: ${reqForm.concesionaria} quiere unirse a DATACAR`,
          html: htmlAdmin
        }),
      });

      setFeedback({ type: 'success', message: 'Solicitud enviada a la gerencia de DATACAR. Nos pondremos en contacto.' });
      setReqForm({ nombre: '', cargo: '', concesionaria: '', marcas: '', telefono: '', email: '' });
      setTimeout(() => setAuthView('login'), 5000);
    } catch (error: any) {
      setFeedback({ type: 'error', message: 'Error enviando solicitud. Intenta más tarde.' });
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // 5. FUNCIONES OPERATIVAS LEADS
  // ==========================================
  const handleUpdateLeadStatus = async (leadId: string, newStatus: string, leadName: string) => {
    try {
      await updateDoc(doc(db, 'leads', leadId), { estado: newStatus });
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, estado: newStatus } : l));
      await logAudit('UPDATE_LEAD_STATUS', leadId, `Cambió estado de ${leadName} a ${newStatus}`);
    } catch (error) {
      showToast("Error actualizando lead.");
    }
  };

  // ==========================================
  // 6. FUNCIONES INVENTARIO (Carga Manual y Edición)
  // ==========================================
  const handleSavePrice = async (versionId: string, versionName: string) => {
    try {
      await updateDoc(doc(db, 'versions', versionId), { price: Number(newPrice), promocion: newPromo });
      await logAudit('UPDATE_PRICE', versionId, `Versión ${versionName} actualizada a US$ ${newPrice} | Promo: ${newPromo}`);
      
      setInventario(prev => prev.map(v => v.id === versionId ? { ...v, price: Number(newPrice), promocion: newPromo } : v));
      setEditingVersion(null);
      setFeedback({ type: 'success', message: 'Precio actualizado en toda la plataforma.' });
      setTimeout(() => setFeedback({ type: '', message: '' }), 3000);
    } catch (error) {
      showToast("Error actualizando precio.");
    }
  };

  const handleSaveModelo = async (e: React.FormEvent) => {
    e.preventDefault(); if (!modeloForm.name || !modeloForm.brandId) return;
    try {
      const id = generarSlug(`${modeloForm.brandId}-${modeloForm.name}`);
      await setDoc(doc(db, 'models', id), { ...modeloForm, name: modeloForm.name.toUpperCase(), startingPrice: Number(modeloForm.startingPrice) || 0, updatedAt: serverTimestamp() }, { merge: true });
      await logAudit('CREATE_MODEL', id, `Modelo creado: ${modeloForm.name.toUpperCase()}`);
      setFeedback({ type: 'success', message: 'Modelo guardado correctamente. Ahora puedes agregarle versiones.' });
      setModeloForm({ id: '', brandId: '', name: '', tipo_carroceria: 'SUV', origen: '', startingPrice: '', imgUrl: '' }); 
      if (userData) fetchDashboardData(userData);
    } catch (err: any) { setFeedback({ type: 'error', message: err.message }); }
  };

  const handleSaveVersion = async (e: React.FormEvent) => {
    e.preventDefault(); if (!versionForm.name || !versionForm.modelId) return;
    try {
      const id = `${versionForm.modelId}_${generarSlug(versionForm.name)}`;
      await setDoc(doc(db, 'versions', id), {
        modelId: versionForm.modelId, name: versionForm.name, 
        concesionaria: userData?.dealershipName, // Force B2B ownership
        promocion: versionForm.promocion, url_auto: versionForm.url_auto, price: Number(versionForm.price) || 0,
        specs: { motor: versionForm.motor, transmision: versionForm.transmision, combustible: versionForm.combustible, traccion: versionForm.traccion, plazas: Number(versionForm.plazas) || 0, airbags: Number(versionForm.airbags) || 0, tamanho_pantalla: Number(versionForm.tamanho_pantalla) || 0 },
        updatedAt: serverTimestamp()
      }, { merge: true });
      
      await logAudit('CREATE_VERSION', id, `Versión agregada: ${versionForm.name}`);
      setFeedback({ type: 'success', message: 'Versión añadida a tu inventario correctamente.' });
      setVersionForm({ id: '', modelId: '', name: '', price: '', promocion: '', url_auto: '', motor: '', transmision: '', combustible: '', traccion: '', plazas: '', airbags: '', tamanho_pantalla: '' });
      if (userData) fetchDashboardData(userData);
    } catch (err: any) { setFeedback({ type: 'error', message: err.message }); }
  };

  // ==========================================
  // 7. CARGA MASIVA CSV (Con Validación RBAC)
  // ==========================================
  const procesarCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const filas = text.split('\n').filter(f => f.trim() !== '');
      if (filas.length < 2) return setFeedback({ type: 'error', message: 'CSV vacío o inválido.' });
      
      const rawHeaders = parseCSVRow(filas[0]).map(h => h.toLowerCase().replace(/['"]+/g, ''));
      setHeaders(rawHeaders);
      
      const parsedData = [];
      const allowedBrands = userData?.marcasPermitidas.map(m => m.toUpperCase().trim()) || [];
      let errores = 0;

      for (let i = 1; i < filas.length; i++) {
        const valores = parseCSVRow(filas[i]);
        const filaObjeto: any = {};
        rawHeaders.forEach((h, idx) => { filaObjeto[h] = valores[idx] || ''; });
        
        // RBAC VALIDATION
        if (filaObjeto.marca && !allowedBrands.includes(filaObjeto.marca.toUpperCase().trim())) {
          errores++;
          continue; 
        }
        
        filaObjeto.concesionaria = userData?.dealershipName; 
        parsedData.push(filaObjeto);
      }

      setCsvData(parsedData);
      if (errores > 0) {
        setFeedback({ type: 'error', message: `Se omitieron ${errores} filas por pertenecer a marcas no autorizadas.` });
      } else {
        setFeedback({ type: 'success', message: `CSV Cargado y Validado. ${parsedData.length} filas listas para subir.` });
      }
    };
    reader.readAsText(file);
  };

  const ejecutarInyeccionCSV = async () => {
    if (csvData.length === 0) return; setLoading(true);
    try {
      let batch = writeBatch(db); 
      let operationCount = 0;

      for (const fila of csvData) {
        if (!fila.marca || !fila.modelo || !fila.version) continue;
        
        const idMarca = generarSlug(fila.marca);
        const idModelo = generarSlug(fila.modelo);
        const idVersion = `${idModelo}_${generarSlug(fila.version)}`;
        const precioValue = fila.precio_usd || fila.precio || 0;

        batch.set(doc(db, 'models', idModelo), { 
          brandId: idMarca, name: fila.modelo.toUpperCase(), tipo_carroceria: (fila.tipo_carroceria || 'SUV').trim().toUpperCase(), startingPrice: Number(precioValue) || 0, updatedAt: serverTimestamp() 
        }, { merge: true }); 
        operationCount++;

        batch.set(doc(db, 'versions', idVersion), { 
          modelId: idModelo, name: fila.version, concesionaria: fila.concesionaria, price: Number(precioValue) || 0, 
          specs: { motor: fila.motor || '', transmision: fila.transmision || '', combustible: fila.combustible || '' },
          updatedAt: serverTimestamp() 
        }, { merge: true }); 
        operationCount++;

        if (operationCount >= 400) { await batch.commit(); batch = writeBatch(db); operationCount = 0; }
      }
      if (operationCount > 0) await batch.commit();
      
      await logAudit('BULK_CSV_UPLOAD', 'Lote CSV', `Subió ${csvData.length} registros exitosamente.`);
      setFeedback({ type: 'success', message: `Inyección masiva completada: ${csvData.length} vehículos actualizados.` });
      setCsvData([]); if (userData) fetchDashboardData(userData);
    } catch (err: any) { setFeedback({ type: 'error', message: err.message }); } finally { setLoading(false); }
  };

  // ==========================================
  // FILTRADO DINÁMICO DE INVENTARIO
  // ==========================================
  const inventarioFiltrado = useMemo(() => {
    return inventario.filter(v => {
      if (invFilterMarca !== 'Todas' && v.brandName?.toUpperCase() !== invFilterMarca.toUpperCase()) return false;
      if (invFilterModelo !== 'Todos' && v.modelName?.toUpperCase() !== invFilterModelo.toUpperCase()) return false;
      if (inventarioSearch) {
        const term = inventarioSearch.toLowerCase();
        if (!v.name?.toLowerCase().includes(term) && !v.brandName?.toLowerCase().includes(term) && !v.modelName?.toLowerCase().includes(term)) {
          return false;
        }
      }
      return true;
    });
  }, [inventario, inventarioSearch, invFilterMarca, invFilterModelo]);

  const modelosFiltradosSelect = useMemo(() => {
    if (invFilterMarca === 'Todas') return modelosList;
    const marcaSeleccionada = marcasList.find(m => m.name.toUpperCase() === invFilterMarca.toUpperCase());
    return modelosList.filter(m => m.brandId === marcaSeleccionada?.id);
  }, [modelosList, marcasList, invFilterMarca]);

  // ==========================================
  // RENDER: VISTAS NO AUTENTICADAS
  // ==========================================
  if (loading && !user) return <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center font-bold text-[#0A1F33] tracking-widest uppercase text-sm">Verificando credenciales comerciales...</div>;

  if (!user || !userData) {
    return (
      <main className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center font-sans py-12 px-4">
        <div className="w-full max-w-md bg-[#FFFFFF] border-t-4 border-[#0A1F33] border-l border-r border-b border-[#C0C0C0] p-8 shadow-none rounded-none">
          <div className="text-center mb-8">
            <h1 className="font-black text-3xl tracking-widest text-[#0A1F33] uppercase" style={{ fontFamily: 'Montserrat, sans-serif' }}>DATA<span className="font-light">CAR</span></h1>
            <p className="text-[10px] font-bold text-[#00BFFF] uppercase tracking-widest mt-1">Portal Oficial de Concesionarias</p>
          </div>

          {feedback.message && (
            <div className={`mb-6 p-4 text-[10px] font-bold uppercase tracking-widest text-center border ${feedback.type === 'error' ? 'bg-[#FFE6E6] text-[#D93025] border-[#D93025]' : 'bg-[#E6F4EA] text-[#1E8E3E] border-[#1E8E3E]'}`}>
              {feedback.message}
            </div>
          )}

          {authView === 'login' ? (
            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <div><label htmlFor="login-email" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Correo Corporativo</label><input id="login-email" type="email" required className="w-full border border-[#C0C0C0] p-3 text-xs focus:outline-none focus:border-[#0A1F33] bg-[#F8F9FA] rounded-none" value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} /></div>
              <div><label htmlFor="login-password" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Contraseña</label><input id="login-password" type="password" required className="w-full border border-[#C0C0C0] p-3 text-xs focus:outline-none focus:border-[#0A1F33] bg-[#F8F9FA] rounded-none" value={loginPassword} onChange={e=>setLoginPassword(e.target.value)} /></div>
              <button type="submit" className="w-full bg-[#0A1F33] text-[#FFFFFF] font-bold text-xs uppercase tracking-widest py-4 hover:bg-[#00BFFF] transition-colors mt-2 border border-transparent rounded-none">Acceder al Panel</button>
              <div className="text-center mt-4 border-t border-[#C0C0C0]/50 pt-4">
                <p className="text-[10px] text-[#3A3A3C] uppercase">¿Tu concesionaria no tiene cuenta?</p>
                <button type="button" onClick={() => { setAuthView('request'); setFeedback({type:'', message:''}); }} className="text-[10px] font-bold text-[#00BFFF] hover:text-[#0A1F33] uppercase tracking-widest mt-1 transition-colors border-none outline-none">Solicitar Alta Comercial</button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRequestAccess} className="flex flex-col gap-4">
              <p className="text-[11px] text-[#3A3A3C] font-medium leading-relaxed mb-2 text-center" style={{ fontFamily: 'Inter, sans-serif' }}>Completa tus datos. Nuestro equipo validará tu solicitud para darte acceso a la gestión de inventario B2B.</p>
              <div><label htmlFor="req-nombre" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Nombre Completo</label><input id="req-nombre" type="text" required className="w-full border border-[#C0C0C0] p-3 text-xs focus:outline-none focus:border-[#00BFFF] bg-[#FFFFFF] rounded-none" value={reqForm.nombre} onChange={e=>setReqForm({...reqForm, nombre: e.target.value})} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label htmlFor="req-cargo" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Cargo</label><input id="req-cargo" type="text" required placeholder="Ej: Gerente" className="w-full border border-[#C0C0C0] p-3 text-xs focus:outline-none focus:border-[#00BFFF] bg-[#FFFFFF] rounded-none" value={reqForm.cargo} onChange={e=>setReqForm({...reqForm, cargo: e.target.value})} /></div>
                <div><label htmlFor="req-concesionaria" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Concesionaria</label><input id="req-concesionaria" type="text" required placeholder="Ej: Garden" className="w-full border border-[#C0C0C0] p-3 text-xs focus:outline-none focus:border-[#00BFFF] bg-[#FFFFFF] rounded-none" value={reqForm.concesionaria} onChange={e=>setReqForm({...reqForm, concesionaria: e.target.value})} /></div>
              </div>
              <div><label htmlFor="req-marcas" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Marcas que representan</label><input id="req-marcas" type="text" required placeholder="Ej: Kia, Nissan" className="w-full border border-[#C0C0C0] p-3 text-xs focus:outline-none focus:border-[#00BFFF] bg-[#FFFFFF] rounded-none" value={reqForm.marcas} onChange={e=>setReqForm({...reqForm, marcas: e.target.value})} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label htmlFor="req-telefono" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Teléfono Directo</label><input id="req-telefono" type="tel" required className="w-full border border-[#C0C0C0] p-3 text-xs focus:outline-none focus:border-[#00BFFF] bg-[#FFFFFF] rounded-none" value={reqForm.telefono} onChange={e=>setReqForm({...reqForm, telefono: e.target.value})} /></div>
                <div><label htmlFor="req-email" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Email Corporativo</label><input id="req-email" type="email" required className="w-full border border-[#C0C0C0] p-3 text-xs focus:outline-none focus:border-[#00BFFF] bg-[#FFFFFF] rounded-none" value={reqForm.email} onChange={e=>setReqForm({...reqForm, email: e.target.value})} /></div>
              </div>
              <button type="submit" disabled={loading} className="w-full bg-[#00BFFF] hover:bg-[#0A1F33] text-[#FFFFFF] font-bold text-xs uppercase tracking-widest py-4 transition-colors mt-2 border border-transparent rounded-none">{loading ? 'Procesando...' : 'Enviar Solicitud'}</button>
              <button type="button" onClick={() => { setAuthView('login'); setFeedback({type:'', message:''}); }} className="text-[10px] font-bold text-[#C0C0C0] hover:text-[#0A1F33] uppercase tracking-widest mt-2 transition-colors border-none outline-none">← Volver al Login</button>
            </form>
          )}
        </div>
      </main>
    );
  }

  // ==========================================
  // RENDER: DASHBOARD DE CONCESIONARIA B2B
  // ==========================================
  const permittedBrandsObjects = marcasList.filter(m => userData.marcasPermitidas.map(p=>p.toUpperCase()).includes(m.name.toUpperCase()));

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col text-[#3A3A3C] font-sans">
      
      <header className="bg-[#0A1F33] text-[#FFFFFF] border-b-4 border-[#00BFFF] px-6 py-4 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-6">
          <div className="font-black text-2xl tracking-widest uppercase" style={{ fontFamily: 'Montserrat, sans-serif' }}>DATA<span className="font-light">CAR</span></div>
          <div className="hidden md:flex flex-col border-l border-[#FFFFFF]/20 pl-6">
            <span className="text-[9px] text-[#00BFFF] font-bold uppercase tracking-widest">Sucursal Activa</span>
            <span className="text-[13px] font-bold uppercase tracking-wide">{userData.dealershipName}</span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <span className="text-[10px] text-[#C0C0C0] font-medium hidden md:inline">{user.email}</span>
          <button onClick={() => signOut(auth)} className="bg-[#FFFFFF]/10 hover:bg-[#FFFFFF]/20 border border-[#FFFFFF]/30 text-[10px] font-bold uppercase tracking-widest px-4 py-2 transition-colors rounded-none">Cerrar Sesión</button>
        </div>
      </header>

      <div className="bg-[#FFFFFF] border-b border-[#C0C0C0] px-6 flex gap-8">
        <button onClick={() => setActiveTab('leads')} className={`py-4 text-xs font-bold uppercase tracking-widest border-b-4 transition-colors ${activeTab === 'leads' ? 'border-[#00BFFF] text-[#0A1F33]' : 'border-transparent text-[#C0C0C0] hover:text-[#3A3A3C]'}`}>Recepción de Leads</button>
        <button onClick={() => setActiveTab('inventario')} className={`py-4 text-xs font-bold uppercase tracking-widest border-b-4 transition-colors ${activeTab === 'inventario' ? 'border-[#00BFFF] text-[#0A1F33]' : 'border-transparent text-[#C0C0C0] hover:text-[#3A3A3C]'}`}>Gestión de Inventario</button>
      </div>

      <main className="flex-1 p-6 md:p-10 overflow-y-auto custom-scrollbar">
        
        {feedback.message && (
          <div className={`mb-6 p-4 text-[10px] font-bold uppercase tracking-widest text-center border ${feedback.type === 'error' ? 'bg-[#FFE6E6] text-[#D93025] border-[#D93025]' : 'bg-[#E6F4EA] text-[#1E8E3E] border-[#1E8E3E]'}`}>
            {feedback.message}
          </div>
        )}

        {/* ======================================= */}
        {/* VISTA: LEADS */}
        {/* ======================================= */}
        {activeTab === 'leads' && (
          <div className="bg-[#FFFFFF] border border-[#C0C0C0] flex flex-col h-full min-h-[500px] shadow-none rounded-none">
            <div className="p-6 bg-[#F5F5F5] border-b border-[#C0C0C0] flex justify-between items-center">
              <div>
                <h2 className="font-bold text-[#0A1F33] text-sm uppercase">Prospectos Asignados</h2>
                <p className="text-[10px] text-[#3A3A3C] uppercase tracking-widest mt-1">Total acumulado: {leads.length}</p>
              </div>
              <button onClick={() => fetchDashboardData(userData)} className="border border-[#0A1F33] text-[#0A1F33] text-[10px] font-bold uppercase px-4 py-2 hover:bg-[#0A1F33] hover:text-[#FFFFFF] transition-colors rounded-none">Actualizar Datos</button>
            </div>
            <div className="overflow-x-auto flex-grow custom-scrollbar">
              <table className="w-full text-left border-collapse whitespace-nowrap min-w-[900px]">
                <thead className="bg-[#FFFFFF] sticky top-0 border-b border-[#C0C0C0]">
                  <tr className="text-[9px] font-bold text-[#C0C0C0] uppercase tracking-widest">
                    <th className="p-4 border-r border-[#C0C0C0]/50">Fecha de Ingreso</th>
                    <th className="p-4 border-r border-[#C0C0C0]/50">Datos del Cliente</th>
                    <th className="p-4 border-r border-[#C0C0C0]/50">Vehículo de Interés</th>
                    <th className="p-4 text-center">Estado del Trámite</th>
                  </tr>
                </thead>
                <tbody className="text-[11px] text-[#3A3A3C]">
                  {leads.length === 0 ? (
                    <tr><td colSpan={4} className="p-10 text-center text-[#C0C0C0] font-bold uppercase tracking-widest">No hay leads asignados actualmente.</td></tr>
                  ) : leads.map(lead => (
                    <tr key={lead.id} className="border-b border-[#C0C0C0]/50 hover:bg-[#F8F9FA] transition-colors">
                      <td className="p-4 border-r border-[#C0C0C0]/50 align-top">
                        <span className="block font-bold text-[#0A1F33]">{lead.createdAt?.toDate().toLocaleDateString() || 'N/A'}</span>
                        <span className="text-[9px] text-[#C0C0C0]">{lead.createdAt?.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) || ''}</span>
                      </td>
                      <td className="p-4 border-r border-[#C0C0C0]/50 align-top">
                        <span className="block font-black text-[#0A1F33] uppercase mb-1">{lead.nombre}</span>
                        <a href={`https://wa.me/595${lead.telefono.substring(1)}`} target="_blank" rel="noopener noreferrer" className="text-[#1E8E3E] font-bold hover:underline block mb-1">WA: {lead.telefono}</a>
                        {lead.email !== 'No proporcionado' && lead.email !== '-' && <a href={`mailto:${lead.email}`} className="text-[#00BFFF] hover:underline block">Email: {lead.email}</a>}
                      </td>
                      <td className="p-4 border-r border-[#C0C0C0]/50 align-top whitespace-normal min-w-[250px]">
                        <span className="block font-bold text-[#0A1F33] uppercase leading-tight mb-2">{lead.vehiculo}</span>
                        <span className="inline-block bg-[#F5F5F5] border border-[#C0C0C0] px-2 py-0.5 text-[8px] font-bold text-[#3A3A3C] uppercase tracking-widest">Fuente: {lead.origen}</span>
                      </td>
                      <td className="p-4 align-top w-48 text-center">
                        <select 
                          className={`w-full border p-2 text-[10px] font-bold uppercase tracking-widest focus:outline-none appearance-none cursor-pointer text-center rounded-none ${lead.estado === 'Nuevo' ? 'border-[#00BFFF] bg-[#00BFFF]/10 text-[#0A1F33]' : lead.estado === 'Cerrado' ? 'border-[#1E8E3E] bg-[#E6F4EA] text-[#1E8E3E]' : lead.estado === 'Perdido' ? 'border-[#D93025] bg-[#FCE8E6] text-[#D93025]' : 'border-[#0A1F33] bg-[#0A1F33]/5 text-[#0A1F33]'}`}
                          value={lead.estado} onChange={(e) => handleUpdateLeadStatus(lead.id, e.target.value, lead.nombre)}>
                          <option value="Nuevo">Nuevo</option><option value="Contactado">Contactado</option><option value="En Negociación">En Negociación</option><option value="Cerrado">Cerrado ✓</option><option value="Perdido">Perdido ✕</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ======================================= */}
        {/* VISTA: INVENTARIO B2B */}
        {/* ======================================= */}
        {activeTab === 'inventario' && (
          <div className="flex flex-col gap-6">
            
            {/* SUB-TABS INVENTARIO */}
            <div className="flex gap-4">
              <button onClick={() => setInvSubTab('catalogo')} className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest border transition-colors ${invSubTab === 'catalogo' ? 'bg-[#0A1F33] text-[#FFFFFF] border-[#0A1F33]' : 'bg-[#FFFFFF] text-[#3A3A3C] border-[#C0C0C0] hover:border-[#0A1F33]'}`}>Mi Catálogo</button>
              <button onClick={() => setInvSubTab('manual')} className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest border transition-colors ${invSubTab === 'manual' ? 'bg-[#0A1F33] text-[#FFFFFF] border-[#0A1F33]' : 'bg-[#FFFFFF] text-[#3A3A3C] border-[#C0C0C0] hover:border-[#0A1F33]'}`}>+ Carga Manual</button>
              <button onClick={() => setInvSubTab('csv')} className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest border transition-colors ${invSubTab === 'csv' ? 'bg-[#0A1F33] text-[#FFFFFF] border-[#0A1F33]' : 'bg-[#FFFFFF] text-[#3A3A3C] border-[#C0C0C0] hover:border-[#0A1F33]'}`}>Importar CSV</button>
            </div>

            {/* SUB-VISTA: CATÁLOGO DE INVENTARIO */}
            {invSubTab === 'catalogo' && (
              <div className="bg-[#FFFFFF] border border-[#C0C0C0] flex flex-col min-h-[500px]">
                <div className="p-4 bg-[#F5F5F5] border-b border-[#C0C0C0] flex flex-col md:flex-row justify-between items-center gap-4">
                  <span className="font-bold text-xs uppercase tracking-widest text-[#0A1F33]">Control de Precios y Versiones</span>
                  
                  {/* Filtros de Búsqueda */}
                  <div className="flex flex-wrap gap-2 w-full md:w-auto">
                    <select className="border border-[#C0C0C0] p-2 text-[10px] font-bold uppercase tracking-widest focus:outline-none focus:border-[#0A1F33] bg-[#FFFFFF] rounded-none" value={invFilterMarca} onChange={e => {setInvFilterMarca(e.target.value); setInvFilterModelo('Todos');}}>
                      <option value="Todas">Todas las marcas</option>
                      {userData.marcasPermitidas.map((m: string) => <option key={m} value={m.toUpperCase()}>{m.toUpperCase()}</option>)}
                    </select>
                    <select className="border border-[#C0C0C0] p-2 text-[10px] font-bold uppercase tracking-widest focus:outline-none focus:border-[#0A1F33] bg-[#FFFFFF] rounded-none disabled:bg-[#F8F9FA]" value={invFilterModelo} onChange={e => setInvFilterModelo(e.target.value)} disabled={invFilterMarca === 'Todas'}>
                      <option value="Todos">Todos los modelos</option>
                      {modelosFiltradosSelect.map(m => <option key={m.id} value={m.name.toUpperCase()}>{m.name.toUpperCase()}</option>)}
                    </select>
                    <input type="text" aria-label="Buscar versión" placeholder="Buscar versión..." className="border border-[#C0C0C0] px-3 py-2 text-xs w-full md:w-48 focus:outline-none focus:border-[#0A1F33] bg-[#FFFFFF] rounded-none" value={inventarioSearch} onChange={e => setInventarioSearch(e.target.value)} />
                  </div>
                </div>
                
                <div className="overflow-x-auto flex-grow custom-scrollbar">
                  <table className="w-full text-left border-collapse whitespace-nowrap min-w-[800px]">
                    <thead className="bg-[#FFFFFF] sticky top-0 border-b border-[#C0C0C0]">
                      <tr className="text-[9px] font-bold text-[#C0C0C0] uppercase tracking-widest">
                        <th className="p-4 border-r border-[#C0C0C0]/50">Marca</th>
                        <th className="p-4 border-r border-[#C0C0C0]/50">Modelo</th>
                        <th className="p-4 border-r border-[#C0C0C0]/50">Versión</th>
                        <th className="p-4 border-r border-[#C0C0C0]/50">Precio (USD) & Promoción</th>
                        <th className="p-4 text-right">Acción B2B</th>
                      </tr>
                    </thead>
                    <tbody className="text-[11px] text-[#3A3A3C]">
                      {inventarioFiltrado.length === 0 ? (
                        <tr><td colSpan={5} className="p-10 text-center text-[#C0C0C0] font-bold uppercase tracking-widest">No hay vehículos que coincidan con la búsqueda.</td></tr>
                      ) : inventarioFiltrado.map(v => (
                        <tr key={v.id} className="border-b border-[#C0C0C0]/50 hover:bg-[#F8F9FA] transition-colors">
                          <td className="p-4 font-bold text-[#0A1F33] uppercase border-r border-[#C0C0C0]/50">{v.brandName}</td>
                          <td className="p-4 font-bold text-[#0A1F33] uppercase border-r border-[#C0C0C0]/50">{v.modelName}</td>
                          <td className="p-4 text-[#3A3A3C] uppercase border-r border-[#C0C0C0]/50">{v.name}</td>
                          
                          {/* LÓGICA DE EDICIÓN IN-LINE */}
                          {editingVersion === v.id ? (
                            <>
                              <td className="p-4 border-r border-[#C0C0C0]/50 flex gap-2 items-center">
                                <input type="number" className="border border-[#00BFFF] p-2 text-xs focus:outline-none bg-[#F5FBFF] w-32 rounded-none" value={newPrice} onChange={e => setNewPrice(e.target.value)} autoFocus />
                                <input type="text" className="border border-[#0A1F33] p-2 text-xs focus:outline-none bg-[#FFFFFF] w-48 rounded-none" value={newPromo} onChange={e => setNewPromo(e.target.value)} placeholder="Ej: Bono US$ 2000" />
                              </td>
                              <td className="p-4 text-right">
                                <div className="flex justify-end gap-2">
                                  <button onClick={() => setEditingVersion(null)} className="border border-[#D93025] text-[#D93025] px-3 py-2 text-[9px] font-bold uppercase hover:bg-[#FFE6E6] transition-colors rounded-none">Cancelar</button>
                                  <button onClick={() => handleSavePrice(v.id, v.name)} className="bg-[#00BFFF] hover:bg-[#0A1F33] text-[#FFFFFF] px-4 py-2 text-[9px] font-bold uppercase tracking-widest transition-colors rounded-none border border-transparent">Guardar</button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="p-4 border-r border-[#C0C0C0]/50">
                                <span className="font-black text-[#0A1F33] block" style={{ fontFamily: 'Montserrat, sans-serif' }}>US$ {Number(v.price).toLocaleString()}</span>
                                <span className="font-bold text-[#00BFFF] uppercase tracking-widest text-[9px]">{v.promocion || 'Sin Promo'}</span>
                              </td>
                              <td className="p-4 text-right">
                                <button onClick={() => { setEditingVersion(v.id); setNewPrice(v.price.toString()); setNewPromo(v.promocion || ''); }} className="border border-[#C0C0C0] text-[#0A1F33] px-4 py-2 text-[9px] font-bold uppercase tracking-widest hover:border-[#0A1F33] transition-colors rounded-none">
                                  Editar Precio
                                </button>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SUB-VISTA: CARGA MANUAL (ABM Restringido) */}
            {invSubTab === 'manual' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Formulario de Modelo */}
                <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-6 h-fit">
                  <h2 className="font-bold text-[#0A1F33] text-sm uppercase mb-2 border-b border-[#C0C0C0] pb-2">1. Crear Nuevo Modelo</h2>
                  <p className="text-[9px] text-[#C0C0C0] uppercase tracking-widest mb-6">Si el modelo ya existe en la plataforma, no necesitas crearlo de nuevo.</p>
                  
                  <form onSubmit={handleSaveModelo} className="flex flex-col gap-4">
                    <div>
                      <label htmlFor="conc-modeloForm-brandId" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Marca Permitida</label>
                      <select id="conc-modeloForm-brandId" className="w-full border p-3 text-xs focus:outline-none focus:border-[#0A1F33] rounded-none" value={modeloForm.brandId} onChange={e => setModeloForm({...modeloForm, brandId: e.target.value})} required>
                        <option value="">Seleccionar marca...</option>
                        {permittedBrandsObjects.map(m => <option key={m.id} value={m.id}>{m.name.toUpperCase()}</option>)}
                      </select>
                    </div>
                    <div><label htmlFor="conc-modeloForm-name" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Nombre del Modelo</label><input id="conc-modeloForm-name" type="text" className="w-full border p-3 text-xs focus:outline-none focus:border-[#0A1F33] rounded-none" value={modeloForm.name} onChange={e => setModeloForm({...modeloForm, name: e.target.value})} placeholder="Ej: Sportage" required /></div>
                    <div className="grid grid-cols-2 gap-4">
                      <div><label htmlFor="conc-modeloForm-tipo" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Categoría</label><input id="conc-modeloForm-tipo" type="text" className="w-full border p-3 text-xs focus:outline-none focus:border-[#0A1F33] rounded-none" value={modeloForm.tipo_carroceria} onChange={e => setModeloForm({...modeloForm, tipo_carroceria: e.target.value})} placeholder="Ej: SUV" /></div>
                      <div><label htmlFor="conc-modeloForm-origen" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Origen Fabrica</label><input id="conc-modeloForm-origen" type="text" className="w-full border p-3 text-xs focus:outline-none focus:border-[#0A1F33] rounded-none" value={modeloForm.origen} onChange={e => setModeloForm({...modeloForm, origen: e.target.value})} /></div>
                    </div>
                    <div><label htmlFor="conc-modeloForm-imgUrl" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">URL Imagen</label><input id="conc-modeloForm-imgUrl" type="url" className="w-full border p-3 text-xs focus:outline-none focus:border-[#0A1F33] rounded-none" value={modeloForm.imgUrl} onChange={e => setModeloForm({...modeloForm, imgUrl: e.target.value})} placeholder="https://..." /></div>
                    <button type="submit" className="w-full bg-[#0A1F33] text-[#FFFFFF] text-xs font-bold uppercase py-4 hover:bg-[#00BFFF] transition-colors rounded-none mt-2">Crear Modelo</button>
                  </form>
                </div>

                {/* Formulario de Versión */}
                <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-6 h-fit">
                  <h2 className="font-bold text-[#00BFFF] text-sm uppercase mb-2 border-b border-[#C0C0C0] pb-2">2. Añadir Versión al Inventario</h2>
                  <p className="text-[9px] text-[#C0C0C0] uppercase tracking-widest mb-6">Completa las especificaciones exactas para el cotizador.</p>
                  
                  <form onSubmit={handleSaveVersion} className="flex flex-col gap-4">
                    <div>
                      <label htmlFor="conc-versionForm-modelId" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Modelo Vinculado</label>
                      <select id="conc-versionForm-modelId" className="w-full border p-3 text-xs focus:outline-none focus:border-[#00BFFF] rounded-none" value={versionForm.modelId} onChange={e => setVersionForm({...versionForm, modelId: e.target.value})} required>
                        <option value="">Seleccionar modelo existente...</option>
                        {/* Filtramos los modelos para que solo pueda añadir versiones a sus marcas */}
                        {modelosList.filter(m => permittedBrandsObjects.map(b=>b.id).includes(m.brandId)).map(m => <option key={m.id} value={m.id}>{m.name.toUpperCase()}</option>)}
                      </select>
                    </div>
                    <div><label htmlFor="conc-versionForm-name" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Nombre de Versión</label><input id="conc-versionForm-name" type="text" className="w-full border p-3 text-xs focus:outline-none focus:border-[#00BFFF] rounded-none" value={versionForm.name} onChange={e => setVersionForm({...versionForm, name: e.target.value})} placeholder="Ej: 2.0 EX AT" required /></div>
                    <div className="grid grid-cols-2 gap-4">
                      <div><label htmlFor="conc-versionForm-price" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Precio (USD)</label><input id="conc-versionForm-price" type="number" className="w-full border p-3 text-xs focus:outline-none focus:border-[#00BFFF] rounded-none" value={versionForm.price} onChange={e => setVersionForm({...versionForm, price: e.target.value})} required /></div>
                      <div><label htmlFor="conc-versionForm-transmision" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Transmisión</label><input id="conc-versionForm-transmision" type="text" className="w-full border p-3 text-xs focus:outline-none focus:border-[#00BFFF] rounded-none" value={versionForm.transmision} onChange={e => setVersionForm({...versionForm, transmision: e.target.value})} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div><label htmlFor="conc-versionForm-combustible" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Combustible</label><input id="conc-versionForm-combustible" type="text" className="w-full border p-3 text-xs focus:outline-none focus:border-[#00BFFF] rounded-none" value={versionForm.combustible} onChange={e => setVersionForm({...versionForm, combustible: e.target.value})} /></div>
                      <div><label htmlFor="conc-versionForm-plazas" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Plazas</label><input id="conc-versionForm-plazas" type="number" className="w-full border p-3 text-xs focus:outline-none focus:border-[#00BFFF] rounded-none" value={versionForm.plazas} onChange={e => setVersionForm({...versionForm, plazas: e.target.value})} /></div>
                    </div>
                    <button type="submit" className="w-full bg-[#00BFFF] hover:bg-[#0A1F33] text-[#FFFFFF] text-xs font-bold uppercase py-4 transition-colors rounded-none mt-2">Publicar Versión</button>
                  </form>
                </div>
              </div>
            )}

            {/* SUB-VISTA: CARGA MASIVA CSV */}
            {invSubTab === 'csv' && (
              <div className="bg-[#FFFFFF] border border-[#C0C0C0] flex flex-col h-fit">
                <div className="p-6 border-b border-[#C0C0C0] bg-[#F5F5F5]">
                  <h2 className="font-bold text-[#0A1F33] text-sm uppercase mb-2">Importador Masivo CSV (Protegido)</h2>
                  <p className="text-[11px] text-[#3A3A3C] font-medium leading-relaxed mb-4">
                    Instrucciones de formato: Crea un archivo Excel o Google Sheets y expórtalo como <strong>CSV (delimitado por comas)</strong>. 
                    Asegúrate de incluir exactamente estos nombres en los encabezados (primera fila):<br/><br/>
                    <code className="bg-[#0A1F33] text-[#00BFFF] p-2 block text-[10px]">marca, modelo, version, precio, tipo_carroceria, motor, transmision, combustible</code>
                  </p>
                  <p className="text-[10px] font-bold text-[#D93025] uppercase tracking-widest border border-[#D93025] p-3 inline-block">
                    ⚠️ Seguridad B2B: El sistema verificará automáticamente la columna "marca". Si incluyes marcas para las cuales no tienes permisos asignados, esas filas serán descartadas. El sistema forzará a tu concesionaria como dueña del inventario.
                  </p>
                </div>
                
                <div className="p-6 flex flex-col gap-6">
                  <label className="bg-[#FFFFFF] border-2 border-dashed border-[#00BFFF] text-[#0A1F33] font-bold text-[12px] uppercase px-6 py-12 tracking-widest cursor-pointer hover:bg-[#F5FBFF] transition-colors text-center w-full">
                    📂 Clic aquí para subir tu archivo CSV
                    <input type="file" accept=".csv" className="hidden" onChange={procesarCSV} />
                  </label>

                  {csvData.length > 0 && (
                    <div className="border border-[#C0C0C0] overflow-x-auto custom-scrollbar">
                      <table className="w-full text-left border-collapse whitespace-nowrap text-[10px]">
                        <thead className="bg-[#0A1F33] text-[#FFFFFF]">
                          <tr className="uppercase tracking-widest"><th className="p-2">#</th>{headers.slice(0,6).map((h, i) => <th key={i} className="p-2 border-l border-[#FFFFFF]/20">{h}</th>)}</tr>
                        </thead>
                        <tbody className="font-mono text-[#3A3A3C]">
                          {csvData.slice(0, 10).map((fila, rowIndex) => (
                            <tr key={rowIndex} className="border-b border-[#C0C0C0]/50"><td className="p-2 text-[#00BFFF] font-bold">{rowIndex + 1}</td>{headers.slice(0,6).map((h, i) => <td key={i} className="p-2 border-l border-[#C0C0C0]/50">{fila[h]}</td>)}</tr>
                          ))}
                        </tbody>
                      </table>
                      {csvData.length > 10 && <p className="text-center text-[#C0C0C0] p-2 text-[9px] uppercase tracking-widest bg-[#F8F9FA]">Mostrando 10 de {csvData.length} filas...</p>}
                    </div>
                  )}

                  <div className="flex justify-end gap-4 mt-4">
                    <button onClick={() => setCsvData([])} disabled={csvData.length === 0} className="text-[10px] font-bold text-[#D93025] uppercase hover:underline">Descartar Lote</button>
                    <button onClick={ejecutarInyeccionCSV} disabled={csvData.length === 0 || loading} className="bg-[#0A1F33] hover:bg-[#00BFFF] text-[#FFFFFF] font-bold text-xs uppercase tracking-widest py-3 px-8 transition-colors disabled:opacity-50">
                      Ejecutar Inyección
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}
        
      </main>
    </div>
  );
}