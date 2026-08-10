// app/admin/page.tsx
'use client';

import React, { useState, useEffect, useMemo, useCallback, useId } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { collection, getDocs, doc, setDoc, getDoc, deleteDoc, writeBatch, serverTimestamp, query, orderBy, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from '../../lib/firebase';
import { generarSlug } from '../../lib/slug';
import { parseCSVRow } from '../../lib/csv';
import { normalizeCarroceria } from '../../lib/carroceria';
import { signOut, onAuthStateChanged, User } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { isOptimizableImageSrc, isValidImageSrc } from '../../lib/imageSrc';
import { useToast } from '../context/ToastContext';

// ==========================================
// UTILIDADES E INFRAESTRUCTURA
// ==========================================
const generarId = () => Math.random().toString(36).substring(2, 15);

// Interface para Leads
interface LeadData {
  id: string;
  nombre: string;
  telefono: string;
  email: string;
  vehiculo: string;
  origen: string;
  concesionaria_destino: string;
  estado: string;
  createdAt: Date;
}

// ==========================================
// CARGA DE IMÁGENES A FIREBASE STORAGE
// ==========================================
// Reemplaza los viejos inputs de "URL de imagen": sube el archivo elegido a
// Storage bajo `folder/` y devuelve la download URL para guardarla en Firestore,
// igual que antes se guardaba una URL externa pegada a mano.
function ImageUploadField({ label, folder, value, onChange, accentClass }: {
  label: string;
  folder: string;
  value: string;
  onChange: (url: string) => void;
  accentClass?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputId = useId();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const path = `${folder}/${Date.now()}_${file.name}`;
      const fileRef = ref(storage, path);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      onChange(url);
    } catch (err: any) {
      setError(err.message || 'Error al subir la imagen.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label htmlFor={inputId} className={`text-[10px] font-bold uppercase block mb-1 ${accentClass || 'text-[#3A3A3C]'}`}>{label}</label>
      {isValidImageSrc(value) && (
        <Image
          src={value}
          alt="Vista previa"
          width={96}
          height={48}
          className="h-12 w-auto object-contain mb-2 border border-[#C0C0C0]/50 p-1"
          unoptimized={!isOptimizableImageSrc(value)}
        />
      )}
      <input
        id={inputId}
        type="file"
        accept="image/*"
        onChange={handleFile}
        disabled={uploading}
        className={`w-full border p-3 text-xs focus:outline-none disabled:opacity-50 ${accentClass ? 'border-[#00BFFF]/30 focus:border-[#00BFFF]' : 'focus:border-[#0A1F33]'}`}
      />
      {uploading && <p className="text-[10px] text-[#00BFFF] mt-1">Subiendo imagen...</p>}
      {error && <p className="text-[10px] text-red-600 mt-1">{error}</p>}
    </div>
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const { showToast } = useToast();

  // ==========================================
  // ESTADOS DE AUTENTICACIÓN Y SEGURIDAD
  // ==========================================
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [adminUser, setAdminUser] = useState<User | null>(null);

  // Pestañas del Sistema
  const [activeTab, setActiveTab] = useState<'dashboard' | 'marcas' | 'modelos' | 'versiones' | 'concesionarias' | 'inyector' | 'ads' | 'financiero' | 'accesos'>('dashboard');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });
  const [searchTerm, setSearchTerm] = useState('');

  // Estados de Base de Datos
  const [marcasList, setMarcasList] = useState<any[]>([]);
  const [modelosList, setModelosList] = useState<any[]>([]);
  const [versionesList, setVersionesList] = useState<any[]>([]);
  const [concesionariasList, setConcesionariasList] = useState<any[]>([]);
  const [campaignsList, setCampaignsList] = useState<any[]>([]);
  const [leadsList, setLeadsList] = useState<LeadData[]>([]);
  
  // Estados para Accesos B2B y Admins
  const [usuariosSistemaList, setUsuariosSistemaList] = useState<any[]>([]);
  const [solicitudesList, setSolicitudesList] = useState<any[]>([]);

  // Formularios ABM
  const [marcaForm, setMarcaForm] = useState({ id: '', name: '', origen_marca: '', logoUrl: '' });
  const [modeloForm, setModeloForm] = useState({ id: '', brandId: '', name: '', tipo_carroceria: 'SUV', subsegmento: '', origen: '', startingPrice: '', imgUrl: '', isPopular: false });
  const [versionForm, setVersionForm] = useState({ 
    id: '', modelId: '', name: '', price: '', concesionaria: '', promocion: '', url_auto: '',
    motor: '', transmision: '', combustible: '', traccion: '', largo: '', ancho: '', alto: '', despeje_suelo: '', baulera_litros: '', plazas: '', 
    airbags: '', tamanho_pantalla: '', conectividad: '', camaras: '', garantia: '', adas: '', asiento_cuero: '', techo_panoramico: '',
    alimentacion: '', autonomi_electrica: '', medida_neumatico: '', tipo_llanta: '', detalle_suspension: '', detalles_freno: '',
    confort_conveniencia: '', seguridad_standard: ''
  });
  const [concesionariaForm, setConcesionariaForm] = useState({ id: '', name: '', email_gerencia: '', status: 'active' });

  // FORMULARIO DE ACCESOS B2B
  const [userB2BForm, setUserB2BForm] = useState<{ uid: string, email: string, dealershipName: string, marcasPermitidas: string[] }>({
    uid: '', email: '', dealershipName: '', marcasPermitidas: []
  });

  // FORMULARIO DE ACCESOS ADMIN (Staff Interno / Socios)
  const [adminAccessForm, setAdminAccessForm] = useState({ uid: '', email: '' });

  // FORMULARIO DE ADS
  const [adForm, setAdForm] = useState({ 
    sponsor: '', headline: '', highlight: '', price: '', link: '', img: '', 
    location: 'ambos', targetCategory: 'Todas', startDate: '', endDate: '' 
  });
  
  const [finForm, setFinForm] = useState({ tasa_anual: 0.09, gastos_admin: 0.022, seguro_vida: 0.005 });

  // Inyector CSV
  const [csvData, setCsvData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);

  // Filtros Dashboard
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterOrigin, setFilterOrigin] = useState('Todos');
  const [filterStatus, setFilterStatus] = useState('Todos');
  const [filterMarca, setFilterMarca] = useState('Todas');
  const [filterModelo, setFilterModelo] = useState('Todos');
  const [filterConcesionaria, setFilterConcesionaria] = useState('Todas');
  const [filterText, setFilterText] = useState('');

  // ==========================================
  // 1. CARGA AISLADA DE DATOS (Estabilizada)
  // ==========================================
  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
      const qLeads = query(collection(db, 'leads'), orderBy('createdAt', 'desc'));
      const qReqs = query(collection(db, 'dealership_requests'), orderBy('createdAt', 'desc'));

      const [bSnap, mSnap, vSnap, adSnap, leadsSnap, cSnap, usersSnap, reqsSnap] = await Promise.all([
        getDocs(collection(db, 'brands')),
        getDocs(collection(db, 'models')),
        getDocs(collection(db, 'versions')),
        getDocs(collection(db, 'campaigns')),
        getDocs(qLeads),
        getDocs(collection(db, 'concesionarias')),
        getDocs(collection(db, 'users')),
        getDocs(qReqs)
      ]);
      
      setMarcasList(bSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setModelosList(mSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setVersionesList(vSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setCampaignsList(adSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setConcesionariasList(cSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      
      // Accesos B2B y Admins
      setUsuariosSistemaList(usersSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setSolicitudesList(reqsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const loadedLeads = leadsSnap.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          nombre: data.nombre || 'Sin Nombre',
          telefono: data.telefono || '-',
          email: data.email || '-',
          vehiculo: data.vehiculo || data.vehiculo_interes || 'No especificado',
          origen: data.origen || 'Desconocido',
          concesionaria_destino: data.concesionaria_destino || 'A designar',
          estado: data.estado || 'Nuevo',
          createdAt: data.createdAt?.toDate() || new Date()
        };
      });
      setLeadsList(loadedLeads);
      
    } catch (error: any) {
      setFeedback({ type: 'error', message: `Error de sincronización: ${error.message}` });
    } finally {
      setLoading(false);
    }
  }, []);

  // ==========================================
  // 2. GUARDIÁN DE RUTAS (Auth Guard Optimizado)
  // ==========================================
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          // VALIDACIÓN DE ROL ADMIN (única vía: doc en Firestore, sin bypass por email)
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          if (userDoc.exists() && userDoc.data().role === 'admin') {
            setAdminUser(currentUser);
            setIsAuthLoading(false);
            fetchAllData();
          } else {
            await signOut(auth);
            router.replace('/admin/login');
          }
        } catch (error) {
          console.error("Fallo validando rol de administrador:", error);
          await signOut(auth);
          router.replace('/admin/login');
        }
      } else {
        router.replace('/admin/login');
      }
    });

    return () => unsubscribe();
  }, [router, fetchAllData]);

  const handleLogout = async () => { await signOut(auth); router.replace('/admin/login'); };

  // ==========================================
  // LÓGICA DEL DASHBOARD ANALÍTICO Y ADS
  // ==========================================
  const modelosFiltradosParaSelect = useMemo(() => {
    if (filterMarca === 'Todas') return modelosList;
    return modelosList.filter(m => m.brandId === filterMarca);
  }, [modelosList, filterMarca]);

  const origenesUnicos = useMemo(() => Array.from(new Set(leadsList.map(l => l.origen))).sort(), [leadsList]);
  const concesionariasUnicas = useMemo(() => Array.from(new Set(leadsList.map(l => l.concesionaria_destino))).sort(), [leadsList]);
  
  const categoriasUnicas = useMemo(() => {
    const cats = modelosList.map(m => m.tipo_carroceria).filter(Boolean);
    return Array.from(new Set(cats.map((c: string) => normalizeCarroceria(c)))).sort();
  }, [modelosList]);

  const filteredLeads = useMemo(() => {
    return leadsList.filter(lead => {
      if (filterText && !lead.vehiculo.toLowerCase().includes(filterText.toLowerCase()) && !lead.nombre.toLowerCase().includes(filterText.toLowerCase())) return false;
      if (filterStatus !== 'Todos' && lead.estado !== filterStatus) return false;
      if (filterOrigin !== 'Todos' && lead.origen !== filterOrigin) return false;
      if (filterConcesionaria !== 'Todas' && lead.concesionaria_destino !== filterConcesionaria) return false;

      if (filterMarca !== 'Todas') {
        const marcaObj = marcasList.find(m => m.id === filterMarca);
        if (marcaObj && !lead.vehiculo.toUpperCase().includes(marcaObj.name.toUpperCase())) return false;
      }
      if (filterModelo !== 'Todos') {
        const modeloObj = modelosList.find(m => m.id === filterModelo);
        if (modeloObj && !lead.vehiculo.toUpperCase().includes(modeloObj.name.toUpperCase())) return false;
      }

      const leadDate = lead.createdAt.getTime();
      if (filterDateFrom && leadDate < new Date(filterDateFrom).getTime()) return false;
      if (filterDateTo) {
        const toDate = new Date(filterDateTo);
        toDate.setHours(23, 59, 59, 999);
        if (leadDate > toDate.getTime()) return false;
      }

      return true;
    });
  }, [leadsList, filterText, filterStatus, filterOrigin, filterConcesionaria, filterMarca, filterModelo, filterDateFrom, filterDateTo, marcasList, modelosList]);

  const getTopItems = (data: LeadData[], keyFn: (l: LeadData) => string, limit = 5) => {
    const counts: Record<string, number> = {};
    data.forEach(l => {
      const key = keyFn(l);
      if (key && key !== 'No especificado') counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit);
  };

  const topVehiculos = useMemo(() => getTopItems(filteredLeads, l => l.vehiculo, 5), [filteredLeads]);
  const leadsPorOrigen = useMemo(() => getTopItems(filteredLeads, l => l.origen, 5), [filteredLeads]);
  const leadsPorConcesionaria = useMemo(() => getTopItems(filteredLeads, l => l.concesionaria_destino, 5), [filteredLeads]);

  const BarChart = ({ data, total }: { data: [string, number][], total: number }) => (
    <div className="flex flex-col gap-3">
      {data.length === 0 ? <p className="text-[10px] text-[#C0C0C0] uppercase">Sin datos suficientes</p> : data.map(([label, count], idx) => {
        const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <div key={idx} className="flex flex-col gap-1">
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-[#3A3A3C]">
              <span className="truncate pr-4" title={label}>{label}</span>
              <span>{count} ({percentage}%)</span>
            </div>
            <div className="w-full bg-[#F5F5F5] h-2 border border-[#C0C0C0]/50">
              <div className="bg-[#00BFFF] h-full transition-all duration-500" style={{ width: `${percentage}%` }}></div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const handleUpdateLeadStatus = async (id: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, 'leads', id), { estado: newStatus });
      setLeadsList(prev => prev.map(l => l.id === id ? { ...l, estado: newStatus } : l));
    } catch (err) {
      showToast("Error actualizando el estado del lead.");
    }
  };

  const handleSaveFinancial = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try {
      await setDoc(doc(db, 'config', 'financial'), {
        tasa_anual: Number(finForm.tasa_anual),
        gastos_admin: Number(finForm.gastos_admin),
        seguro_vida: Number(finForm.seguro_vida),
        updatedAt: serverTimestamp()
      });
      setFeedback({ type: 'success', message: 'Variables financieras actualizadas. Impacto inmediato en calculadora.' });
    } catch (err: any) { setFeedback({ type: 'error', message: err.message }); } finally { setLoading(false); }
  };

  // ==========================================
  // LÓGICA DE ACCESOS B2B Y ADMINS
  // ==========================================
  const handleMarcaToggle = (marcaName: string) => {
    setUserB2BForm(prev => {
      const isSelected = prev.marcasPermitidas.includes(marcaName);
      const nuevasMarcas = isSelected 
        ? prev.marcasPermitidas.filter(m => m !== marcaName)
        : [...prev.marcasPermitidas, marcaName];
      return { ...prev, marcasPermitidas: nuevasMarcas };
    });
  };

  const handleSaveUserB2B = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userB2BForm.uid || !userB2BForm.dealershipName || userB2BForm.marcasPermitidas.length === 0) {
      return setFeedback({ type: 'error', message: 'Debes ingresar el UID, seleccionar Concesionaria y al menos 1 Marca.' });
    }
    setLoading(true);
    try {
      await setDoc(doc(db, 'users', userB2BForm.uid), {
        email: userB2BForm.email,
        role: 'concesionaria',
        dealershipName: userB2BForm.dealershipName,
        marcasPermitidas: userB2BForm.marcasPermitidas,
        updatedAt: serverTimestamp()
      }, { merge: true });

      setFeedback({ type: 'success', message: 'Permisos de Concesionaria asignados. El usuario ya puede operar.' });
      setUserB2BForm({ uid: '', email: '', dealershipName: '', marcasPermitidas: [] });
      fetchAllData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAdminAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminAccessForm.uid || !adminAccessForm.email) {
      return setFeedback({ type: 'error', message: 'Debes ingresar el UID y el Correo del nuevo administrador/socio.' });
    }
    setLoading(true);
    try {
      await setDoc(doc(db, 'users', adminAccessForm.uid), {
        email: adminAccessForm.email,
        role: 'admin',
        dealershipName: 'DATACAR CENTRAL',
        marcasPermitidas: ['ALL'],
        updatedAt: serverTimestamp()
      }, { merge: true });

      setFeedback({ type: 'success', message: 'Permisos de Administrador Central asignados. Ya puede loguearse.' });
      setAdminAccessForm({ uid: '', email: '' });
      fetchAllData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateReqStatus = async (reqId: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, 'dealership_requests', reqId), { estado: newStatus });
      setSolicitudesList(prev => prev.map(r => r.id === reqId ? { ...r, estado: newStatus } : r));
    } catch (err) {
      showToast("Error actualizando solicitud.");
    }
  };

  const triggerEditUserB2B = (u: any) => {
    let parsedMarcas: string[] = [];
    if (typeof u.marcasPermitidas === 'string') {
      try { parsedMarcas = JSON.parse(u.marcasPermitidas); } 
      catch (e) { parsedMarcas = u.marcasPermitidas.split(',').map((m: string) => m.trim()); }
    } else if (Array.isArray(u.marcasPermitidas)) {
      parsedMarcas = u.marcasPermitidas;
    }

    setUserB2BForm({
      uid: u.id,
      email: u.email || '',
      dealershipName: u.dealershipName || '',
      marcasPermitidas: parsedMarcas
    });
    window.scrollTo(0, 0);
  };

  // INYECTOR CSV (Saneamiento Avanzado)
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
      for (let i = 1; i < filas.length; i++) {
        const valores = parseCSVRow(filas[i]);
        const filaObjeto: any = {};
        rawHeaders.forEach((h, idx) => { filaObjeto[h] = valores[idx] || ''; });
        parsedData.push(filaObjeto);
      }
      setCsvData(parsedData);
      setFeedback({ type: 'success', message: `CSV Cargado. ${parsedData.length} filas listas para revisión estructural.` });
    };
    reader.readAsText(file);
  };

  const ejecutarInyeccionCSV = async () => {
    if (csvData.length === 0) return; setLoading(true);
    try {
      const concesionariasCSV = [...new Set(csvData.map(f => f.concesionaria).filter(Boolean))];
      const concSnap = await getDocs(collection(db, 'concesionarias'));
      const concesionariasExistentes = concSnap.docs.map(d => d.id);
      
      const nuevasConcesionarias = concesionariasCSV.filter(c => !concesionariasExistentes.includes(generarSlug(c as string)));
      if (nuevasConcesionarias.length > 0) {
        const batchConc = writeBatch(db);
        nuevasConcesionarias.forEach(c => {
           batchConc.set(doc(db, 'concesionarias', generarSlug(c as string)), { name: (c as string).toUpperCase(), status: 'active', email_gerencia: '', createdAt: serverTimestamp() });
        });
        await batchConc.commit();
      }

      let batch = writeBatch(db); 
      let operationCount = 0;
      const nuevasMarcasSet = new Set<string>();
      const nuevosModelosSet = new Set<string>();
      const nuevasCategoriasSet = new Set<string>();

      for (const fila of csvData) {
        if (!fila.marca || !fila.modelo || !fila.version) continue;
        
        const idMarca = generarSlug(fila.marca);
        const idModelo = generarSlug(fila.modelo);
        const idVersion = `${idModelo}_${generarSlug(fila.version)}`;

        const precioValue = fila.precio_usd || fila.precio || 0;
        const camaraValue = fila.camaras || fila.camara || '';
        const origenMarcaValue = fila.origen_marca || fila['origen-marca'] || '';
        const cleanCategory = normalizeCarroceria(fila.tipo_carroceria);
        
        nuevasMarcasSet.add(fila.marca.toUpperCase());
        nuevosModelosSet.add(fila.modelo.toUpperCase());
        nuevasCategoriasSet.add(cleanCategory);

        batch.set(doc(db, 'brands', idMarca), { 
          name: fila.marca.toUpperCase(), origen_marca: origenMarcaValue, logoUrl: marcasList.find(m => m.id === idMarca)?.logoUrl || '', updatedAt: serverTimestamp() 
        }, { merge: true }); 
        operationCount++;

        batch.set(doc(db, 'models', idModelo), { 
          brandId: idMarca, name: fila.modelo.toUpperCase(), tipo_carroceria: cleanCategory, subsegmento: fila.subsegmento || '', origen: fila.origen || '', startingPrice: Number(precioValue) || 0, imgUrl: fila.url_imagen || '', updatedAt: serverTimestamp() 
        }, { merge: true }); 
        operationCount++;

        batch.set(doc(db, 'versions', idVersion), { 
          modelId: idModelo, name: fila.version, concesionaria: fila.concesionaria || '', url_auto: fila.url_auto || '', promocion: fila.promocion || '', price: Number(precioValue) || 0, 
          specs: { 
            motor: fila.motor || '', transmision: fila.transmision || '', combustible: fila.combustible || '', traccion: fila.traccion || '', 
            plazas: Number(fila.plazas) || 0, airbags: Number(fila.airbags) || 0, tamanho_pantalla: Number(fila.tamanho_pantalla) || 0, 
            conectividad: fila.conectividad || '', camaras: camaraValue, garantia: fila.garantia || '', alimentacion: fila.alimentacion || '', autonomi_electrica: fila.autonomi_electrica || fila.autonomia_electrica || ''
          },
          chasis: { medida_neumatico: fila.medida_neumatico || '', tipo_llanta: fila.tipo_llanta || '', detalle_suspension: fila.detalle_suspension || '', detalles_freno: fila.detalles_freno || '' },
          dimensiones: { largo: Number(fila.largo) || 0, ancho: Number(fila.ancho) || 0, alto: Number(fila.alto) || 0, despeje_suelo: Number(fila.despeje_suelo) || 0, baulera_litros: Number(fila.baulera_litros) || 0 },
          features: { 
            adas: fila.adas ? fila.adas.split('|').map((i: string) => i.trim()) : [], 
            asiento_cuero: fila.asiento_cuero || '', techo_panoramico: fila.techo_panoramico || '',
            confort_conveniencia: fila.confort_conveniencia ? fila.confort_conveniencia.split(';').map((i:string)=>i.trim()).filter(Boolean) : [],
            seguridad_standard: fila.seguridad_standard ? fila.seguridad_standard.split(';').map((i:string)=>i.trim()).filter(Boolean) : []
          },
          updatedAt: serverTimestamp() 
        }, { merge: true }); 
        operationCount++;

        if (operationCount >= 400) { await batch.commit(); batch = writeBatch(db); operationCount = 0; }
      }
      
      if (operationCount > 0) await batch.commit();
      
      setFeedback({ type: 'success', message: `Inyección completada. Sincronizadas: ${nuevasMarcasSet.size} marcas, ${nuevosModelosSet.size} modelos y ${nuevasCategoriasSet.size} tipos de carrocería. ${nuevasConcesionarias.length > 0 ? `Se auto-crearon ${nuevasConcesionarias.length} concesionarias.` : ''}` });
      setCsvData([]); fetchAllData();
    } catch (err: any) { setFeedback({ type: 'error', message: err.message }); } finally { setLoading(false); }
  };

  // ABMs Restantes
  const handleSaveMarca = async (e: React.FormEvent) => {
    e.preventDefault(); if (!marcaForm.name) return; setLoading(true);
    try {
      const id = marcaForm.id || generarSlug(marcaForm.name);
      await setDoc(doc(db, 'brands', id), { name: marcaForm.name.toUpperCase(), origen_marca: marcaForm.origen_marca, logoUrl: marcaForm.logoUrl, updatedAt: serverTimestamp() }, { merge: true });
      setFeedback({ type: 'success', message: 'Identidad de Marca guardada correctamente.' });
      setMarcaForm({ id: '', name: '', origen_marca: '', logoUrl: '' }); fetchAllData();
    } catch (err: any) { setFeedback({ type: 'error', message: err.message }); } finally { setLoading(false); }
  };

  const handleSaveModelo = async (e: React.FormEvent) => {
    e.preventDefault(); if (!modeloForm.name || !modeloForm.brandId) return; setLoading(true);
    try {
      const id = modeloForm.id || generarSlug(modeloForm.name);
      await setDoc(doc(db, 'models', id), { ...modeloForm, name: modeloForm.name.toUpperCase(), tipo_carroceria: normalizeCarroceria(modeloForm.tipo_carroceria), startingPrice: Number(modeloForm.startingPrice) || 0, isPopular: modeloForm.isPopular, updatedAt: serverTimestamp() }, { merge: true });
      setFeedback({ type: 'success', message: 'Modelo guardado correctamente.' });
      setModeloForm({ id: '', brandId: '', name: '', tipo_carroceria: 'SUV', subsegmento: '', origen: '', startingPrice: '', imgUrl: '', isPopular: false }); fetchAllData();
    } catch (err: any) { setFeedback({ type: 'error', message: err.message }); } finally { setLoading(false); }
  };

  const handleSaveVersion = async (e: React.FormEvent) => {
    e.preventDefault(); if (!versionForm.name || !versionForm.modelId) return; setLoading(true);
    try {
      const id = versionForm.id || `${versionForm.modelId}_${generarSlug(versionForm.name)}`;
      await setDoc(doc(db, 'versions', id), {
        modelId: versionForm.modelId, name: versionForm.name, concesionaria: versionForm.concesionaria, promocion: versionForm.promocion, url_auto: versionForm.url_auto, price: Number(versionForm.price) || 0,
        specs: { motor: versionForm.motor, transmision: versionForm.transmision, combustible: versionForm.combustible, traccion: versionForm.traccion, plazas: Number(versionForm.plazas) || 0, airbags: Number(versionForm.airbags) || 0, tamanho_pantalla: Number(versionForm.tamanho_pantalla) || 0, conectividad: versionForm.conectividad, camaras: versionForm.camaras, garantia: versionForm.garantia, alimentacion: versionForm.alimentacion, autonomi_electrica: versionForm.autonomi_electrica },
        chasis: { medida_neumatico: versionForm.medida_neumatico, tipo_llanta: versionForm.tipo_llanta, detalle_suspension: versionForm.detalle_suspension, detalles_freno: versionForm.detalles_freno },
        dimensiones: { largo: Number(versionForm.largo) || 0, ancho: Number(versionForm.ancho) || 0, alto: Number(versionForm.alto) || 0, despeje_suelo: Number(versionForm.despeje_suelo) || 0, baulera_litros: Number(versionForm.baulera_litros) || 0 },
        features: { adas: versionForm.adas ? versionForm.adas.split('|').map(i=>i.trim()).filter(Boolean) : [], asiento_cuero: versionForm.asiento_cuero, techo_panoramico: versionForm.techo_panoramico, confort_conveniencia: versionForm.confort_conveniencia ? versionForm.confort_conveniencia.split(';').map(i=>i.trim()).filter(Boolean) : [], seguridad_standard: versionForm.seguridad_standard ? versionForm.seguridad_standard.split(';').map(i=>i.trim()).filter(Boolean) : [] },
        updatedAt: serverTimestamp()
      }, { merge: true });
      
      setFeedback({ type: 'success', message: 'Versión técnica guardada de forma integral.' });
      setVersionForm({ id: '', modelId: '', name: '', price: '', concesionaria: '', promocion: '', url_auto: '', motor: '', transmision: '', combustible: '', traccion: '', largo: '', ancho: '', alto: '', despeje_suelo: '', baulera_litros: '', plazas: '', airbags: '', tamanho_pantalla: '', conectividad: '', camaras: '', garantia: '', adas: '', asiento_cuero: '', techo_panoramico: '', alimentacion: '', autonomi_electrica: '', medida_neumatico: '', tipo_llanta: '', detalle_suspension: '', detalles_freno: '', confort_conveniencia: '', seguridad_standard: '' });
      fetchAllData();
    } catch (err: any) { setFeedback({ type: 'error', message: err.message }); } finally { setLoading(false); }
  };

  const handleSaveConcesionaria = async (e: React.FormEvent) => {
    e.preventDefault(); if (!concesionariaForm.name) return; setLoading(true);
    try {
      const id = concesionariaForm.id || generarSlug(concesionariaForm.name);
      await setDoc(doc(db, 'concesionarias', id), { name: concesionariaForm.name.toUpperCase(), email_gerencia: concesionariaForm.email_gerencia, status: concesionariaForm.status, updatedAt: serverTimestamp() }, { merge: true });
      setFeedback({ type: 'success', message: 'Concesionaria guardada y actualizada correctamente.' });
      setConcesionariaForm({ id: '', name: '', status: 'active', email_gerencia: '' }); fetchAllData();
    } catch (err: any) { setFeedback({ type: 'error', message: err.message }); } finally { setLoading(false); }
  };

  const handleDelete = async (col: string, id: string) => {
    if (!confirm('¿Confirmas la eliminación permanente de este registro individual?')) return;
    setLoading(true);
    try { await deleteDoc(doc(db, col, id)); setFeedback({ type: 'success', message: 'Registro eliminado.' }); fetchAllData(); } catch (err: any) { setFeedback({ type: 'error', message: err.message }); } finally { setLoading(false); }
  };

  const triggerEditMarca = (m: any) => { setMarcaForm({ id: m.id, name: m.name || '', origen_marca: m.origen_marca || '', logoUrl: m.logoUrl || '' }); window.scrollTo(0,0); };
  const triggerEditModelo = (m: any) => { setModeloForm({ id: m.id, brandId: m.brandId || '', name: m.name || '', tipo_carroceria: normalizeCarroceria(m.tipo_carroceria), subsegmento: m.subsegmento || '', origen: m.origen || '', startingPrice: m.startingPrice?.toString() || '', imgUrl: m.imgUrl || '', isPopular: m.isPopular || false }); window.scrollTo(0,0); };
  
  const triggerEditVersion = (v: any) => { 
    setVersionForm({ 
      id: v.id, modelId: v.modelId || '', name: v.name || '', price: v.price?.toString() || '', concesionaria: v.concesionaria || '', promocion: v.promocion || '', url_auto: v.url_auto || '',
      motor: v.specs?.motor || '', transmision: v.specs?.transmision || '', combustible: v.specs?.combustible || '', traccion: v.specs?.traccion || '', plazas: v.specs?.plazas?.toString() || '', airbags: v.specs?.airbags?.toString() || '', tamanho_pantalla: v.specs?.tamanho_pantalla?.toString() || '', conectividad: v.specs?.conectividad || '', camaras: v.specs?.camaras || '', garantia: v.specs?.garantia || '', 
      alimentacion: v.specs?.alimentacion || '', autonomi_electrica: v.specs?.autonomi_electrica || '',
      largo: v.dimensiones?.largo?.toString() || '', ancho: v.dimensiones?.ancho?.toString() || '', alto: v.dimensiones?.alto?.toString() || '', despeje_suelo: v.dimensiones?.despeje_suelo?.toString() || '', baulera_litros: v.dimensiones?.baulera_litros?.toString() || '', 
      medida_neumatico: v.chasis?.medida_neumatico || '', tipo_llanta: v.chasis?.tipo_llanta || '', detalle_suspension: v.chasis?.detalle_suspension || '', detalles_freno: v.chasis?.detalles_freno || '',
      adas: Array.isArray(v.features?.adas) ? v.features.adas.join(' | ') : (v.features?.adas || ''), asiento_cuero: v.features?.asiento_cuero || '', techo_panoramico: v.features?.techo_panoramico || '',
      confort_conveniencia: Array.isArray(v.features?.confort_conveniencia) ? v.features.confort_conveniencia.join('; ') : (v.features?.confort_conveniencia || ''),
      seguridad_standard: Array.isArray(v.features?.seguridad_standard) ? v.features.seguridad_standard.join('; ') : (v.features?.seguridad_standard || '')
    }); window.scrollTo(0,0); 
  };

  const handleCreateAd = async (e: React.FormEvent) => {
    e.preventDefault(); if (!adForm.sponsor || !adForm.headline || !adForm.img || !adForm.startDate || !adForm.endDate) return; setLoading(true);
    try {
      const newId = `ad_${generarId()}`;
      await setDoc(doc(db, 'campaigns', newId), { ...adForm, isActive: false, createdAt: serverTimestamp() });
      setFeedback({ type: 'success', message: 'Anuncio inyectado en la bóveda publicitaria.' });
      setAdForm({ sponsor: '', headline: '', highlight: '', price: '', link: '', img: '', location: 'ambos', targetCategory: 'Todas', startDate: '', endDate: '' }); fetchAllData();
    } catch (err: any) { setFeedback({ type: 'error', message: err.message }); } finally { setLoading(false); }
  };

  const handleToggleAd = async (id: string, currentStatus: boolean) => {
    setLoading(true);
    try { 
      await setDoc(doc(db, 'campaigns', id), { isActive: !currentStatus }, { merge: true }); 
      setFeedback({ type: 'success', message: `Campaña ${!currentStatus ? 'Activada' : 'Pausada'} correctamente.` }); fetchAllData(); 
    } catch (err: any) { setFeedback({ type: 'error', message: err.message }); } finally { setLoading(false); }
  };

  const filteredMarcas = useMemo(() => marcasList.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()) || m.id.includes(searchTerm)), [marcasList, searchTerm]);
  const filteredModelos = useMemo(() => modelosList.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()) || m.id.includes(searchTerm)), [modelosList, searchTerm]);
  const filteredVersiones = useMemo(() => versionesList.filter(v => v.name.toLowerCase().includes(searchTerm.toLowerCase()) || v.id.includes(searchTerm)), [versionesList, searchTerm]);
  const filteredConcesionarias = useMemo(() => concesionariasList.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.id.includes(searchTerm)), [concesionariasList, searchTerm]);
  const filteredSolicitudes = useMemo(() => solicitudesList.filter(r => r.concesionaria.toLowerCase().includes(searchTerm.toLowerCase())), [solicitudesList, searchTerm]);

  // Pantalla de Carga de Autenticación
  if (isAuthLoading) return <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center font-bold text-[#0A1F33] tracking-widest uppercase text-sm">Validando credenciales ejecutivas...</div>;

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex text-[#3A3A3C] font-sans">
      
      {/* SIDEBAR CORPORATIVO */}
      <aside className="w-64 bg-[#0A1F33] text-[#FFFFFF] min-h-screen flex flex-col border-r border-[#0A1F33] shrink-0 sticky top-0">
        <div className="p-6 border-b border-[#FFFFFF]/10">
          <div className="font-black text-2xl tracking-widest uppercase mb-1" style={{ fontFamily: 'Montserrat, sans-serif' }}>DATA<span className="font-light">CAR</span></div>
          <span className="text-[8px] text-[#00BFFF] border border-[#00BFFF] px-2 py-0.5 uppercase tracking-widest font-bold">Terminal Admin</span>
        </div>
        
        <nav className="flex flex-col flex-grow py-6 text-[10px] font-bold uppercase tracking-widest overflow-y-auto custom-scrollbar" style={{ fontFamily: 'Inter, sans-serif' }}>
          <span className="text-[#C0C0C0] px-6 mb-3">CRM & Operaciones</span>
          <button onClick={() => { setActiveTab('dashboard'); setSearchTerm(''); }} className={`text-left px-6 py-3 transition-colors border-l-2 ${activeTab === 'dashboard' ? 'border-[#00BFFF] bg-[#FFFFFF]/10 text-[#00BFFF]' : 'border-transparent text-[#FFFFFF] hover:bg-[#FFFFFF]/5'}`}>Dashboard Leads</button>
          
          <button onClick={() => { setActiveTab('accesos'); setSearchTerm(''); }} className={`text-left px-6 py-3 transition-colors border-l-2 ${activeTab === 'accesos' ? 'border-[#00BFFF] bg-[#FFFFFF]/10 text-[#00BFFF]' : 'border-transparent text-[#FFFFFF] hover:bg-[#FFFFFF]/5'}`}>Accesos y Permisos</button>

          <span className="text-[#C0C0C0] px-6 mt-6 mb-3">Core & Finanzas</span>
          <button onClick={() => { setActiveTab('financiero'); setSearchTerm(''); }} className={`text-left px-6 py-3 transition-colors border-l-2 ${activeTab === 'financiero' ? 'border-[#00BFFF] bg-[#FFFFFF]/10 text-[#00BFFF]' : 'border-transparent text-[#FFFFFF] hover:bg-[#FFFFFF]/5'}`}>Variables Financieras</button>

          <span className="text-[#C0C0C0] px-6 mt-6 mb-3">Bases de Datos</span>
          {(['marcas', 'modelos', 'versiones', 'concesionarias'] as const).map(tab => (
            <button key={tab} onClick={() => { setActiveTab(tab); setSearchTerm(''); }} className={`text-left px-6 py-3 transition-colors border-l-2 ${activeTab === tab ? 'border-[#00BFFF] bg-[#FFFFFF]/10 text-[#00BFFF]' : 'border-transparent text-[#FFFFFF] hover:bg-[#FFFFFF]/5'}`}>ABM {tab}</button>
          ))}
          
          <span className="text-[#C0C0C0] px-6 mt-6 mb-3">Herramientas</span>
          <button onClick={() => { setActiveTab('inyector'); setSearchTerm(''); }} className={`text-left px-6 py-3 transition-colors border-l-2 ${activeTab === 'inyector' ? 'border-[#00BFFF] bg-[#FFFFFF]/10 text-[#00BFFF]' : 'border-transparent text-[#FFFFFF] hover:bg-[#FFFFFF]/5'}`}>Inyector CSV</button>
          <button onClick={() => { setActiveTab('ads'); setSearchTerm(''); }} className={`text-left px-6 py-3 transition-colors border-l-2 ${activeTab === 'ads' ? 'border-[#00BFFF] bg-[#FFFFFF]/10 text-[#00BFFF]' : 'border-transparent text-[#FFFFFF] hover:bg-[#FFFFFF]/5'}`}>Ads Manager</button>
        </nav>

        <div className="p-6 border-t border-[#FFFFFF]/10">
          <button onClick={handleLogout} className="text-[10px] text-[#C0C0C0] hover:text-[#FFFFFF] font-bold uppercase tracking-widest transition-colors">Cerrar Sesión ⏏</button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="bg-[#FFFFFF] border-b border-[#C0C0C0] p-6 flex justify-between items-center shrink-0">
          <h1 className="font-black text-2xl text-[#0A1F33] uppercase" style={{ fontFamily: 'Montserrat, sans-serif' }}>Módulo Activo: <span className="text-[#00BFFF]">{activeTab}</span></h1>
          <button onClick={fetchAllData} className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest border border-[#C0C0C0] px-4 py-2 hover:border-[#0A1F33] transition-colors rounded-none outline-none">{loading ? 'Sincronizando...' : 'Sincronizar DB'}</button>
        </header>

        {feedback.message && <div className={`m-6 mb-0 p-4 text-xs font-bold uppercase tracking-widest border shrink-0 ${feedback.type === 'error' ? 'bg-[#FFE6E6] text-[#D93025] border-[#D93025]' : 'bg-[#E6F4EA] text-[#1E8E3E] border-[#1E8E3E]'}`}>{feedback.message}</div>}

        <div className="p-6 flex-grow overflow-y-auto custom-scrollbar" style={{ fontFamily: 'Inter, sans-serif' }}>
          
          {/* ======================================= */}
          {/* VISTA: GESTIÓN DE ACCESOS Y ROLES */}
          {/* ======================================= */}
          {activeTab === 'accesos' && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 h-full">
              
              {/* COLUMNA IZQUIERDA: FORMULARIOS DE ALTA */}
              <div className="xl:col-span-1 flex flex-col gap-6 max-h-full overflow-y-auto custom-scrollbar pr-2">
                
                {/* Formulario: Concesionarias (B2B) */}
                <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-6 shadow-none">
                  <h2 className="font-bold text-[#0A1F33] text-sm uppercase mb-2 border-b border-[#C0C0C0] pb-2">Otorgar Acceso B2B (Concesionarias)</h2>
                  <p className="text-[9px] text-[#C0C0C0] uppercase tracking-widest mb-4">Asigna el UID de Firebase Auth y define las marcas permitidas.</p>
                  
                  <form onSubmit={handleSaveUserB2B} className="flex flex-col gap-3">
                    <div>
                      <label htmlFor="userB2BForm-uid" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">UID de Firebase Auth</label>
                      <input id="userB2BForm-uid" type="text" className="w-full border p-2 text-xs focus:outline-none focus:border-[#00BFFF] rounded-none" value={userB2BForm.uid} onChange={e => setUserB2BForm({...userB2BForm, uid: e.target.value})} placeholder="Ej: g8YxZ1a2..." required disabled={!!userB2BForm.uid && userB2BForm.email !== ''} />
                    </div>
                    <div>
                      <label htmlFor="userB2BForm-email" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Email del Gerente</label>
                      <input id="userB2BForm-email" type="email" className="w-full border p-2 text-xs focus:outline-none focus:border-[#00BFFF] rounded-none" value={userB2BForm.email} onChange={e => setUserB2BForm({...userB2BForm, email: e.target.value})} placeholder="gerente@concesionaria.com" required />
                    </div>
                    <div>
                      <label htmlFor="userB2BForm-dealership" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Concesionaria Asignada</label>
                      <select id="userB2BForm-dealership" className="w-full border p-2 text-xs focus:outline-none focus:border-[#00BFFF] rounded-none" value={userB2BForm.dealershipName} onChange={e => setUserB2BForm({...userB2BForm, dealershipName: e.target.value})} required>
                        <option value="">Seleccionar concesionaria...</option>
                        {concesionariasList.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>

                    <div className="border border-[#C0C0C0] p-3 bg-[#F8F9FA] mt-1">
                      <span className="text-[10px] font-bold text-[#0A1F33] uppercase block mb-2 border-b border-[#C0C0C0]/50 pb-2">Marcas Permitidas (Scope)</span>
                      <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto custom-scrollbar pr-2">
                        {marcasList.map(m => (
                          <label key={m.id} className="flex items-center gap-2 cursor-pointer group">
                            <div className={`w-3 h-3 border flex items-center justify-center shrink-0 transition-colors ${userB2BForm.marcasPermitidas.includes(m.name) ? 'bg-[#00BFFF] border-[#00BFFF]' : 'bg-[#FFFFFF] border-[#C0C0C0] group-hover:border-[#0A1F33]'}`}>
                              {userB2BForm.marcasPermitidas.includes(m.name) && <svg className="w-2 h-2 text-[#FFFFFF]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>}
                            </div>
                            <input type="checkbox" className="hidden" checked={userB2BForm.marcasPermitidas.includes(m.name)} onChange={() => handleMarcaToggle(m.name)} />
                            <span className={`text-[9px] uppercase tracking-widest ${userB2BForm.marcasPermitidas.includes(m.name) ? 'font-bold text-[#0A1F33]' : 'text-[#3A3A3C]'}`}>{m.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2 mt-2">
                      {userB2BForm.email && <button type="button" onClick={() => setUserB2BForm({uid: '', email: '', dealershipName: '', marcasPermitidas: []})} className="flex-1 border border-[#0A1F33] text-[#0A1F33] text-[10px] font-bold uppercase transition-colors hover:bg-[#F5F5F5] rounded-none">Cancelar</button>}
                      <button type="submit" disabled={loading} className="flex-1 bg-[#0A1F33] text-[#FFFFFF] text-xs font-bold uppercase py-3 hover:bg-[#00BFFF] transition-colors border border-transparent rounded-none">Guardar Permisos B2B</button>
                    </div>
                  </form>
                </div>

                {/* Formulario: Administradores Internos */}
                <div className="bg-[#0A1F33] border-t-4 border-[#00BFFF] p-6 shadow-none">
                  <h2 className="font-bold text-[#FFFFFF] text-sm uppercase mb-2 border-b border-[#FFFFFF]/20 pb-2">Añadir Administrador Interno</h2>
                  <p className="text-[9px] text-[#C0C0C0] uppercase tracking-widest mb-4">Otorga control total sobre la plataforma a tu equipo central.</p>
                  
                  <form onSubmit={handleSaveAdminAccess} className="flex flex-col gap-3">
                    <div>
                      <label htmlFor="adminAccessForm-uid" className="text-[10px] font-bold text-[#00BFFF] uppercase block mb-1">UID de Firebase Auth</label>
                      <input id="adminAccessForm-uid" type="text" className="w-full border-none p-2 text-xs focus:outline-none bg-[#FFFFFF] rounded-none text-[#0A1F33]" value={adminAccessForm.uid} onChange={e => setAdminAccessForm({...adminAccessForm, uid: e.target.value})} placeholder="Copiar desde Auth..." required />
                    </div>
                    <div>
                      <label htmlFor="adminAccessForm-email" className="text-[10px] font-bold text-[#00BFFF] uppercase block mb-1">Email del Administrador</label>
                      <input id="adminAccessForm-email" type="email" className="w-full border-none p-2 text-xs focus:outline-none bg-[#FFFFFF] rounded-none text-[#0A1F33]" value={adminAccessForm.email} onChange={e => setAdminAccessForm({...adminAccessForm, email: e.target.value})} placeholder="equipo@datacarpy.com" required />
                    </div>
                    
                    <button type="submit" disabled={loading} className="w-full bg-[#00BFFF] text-[#0A1F33] text-xs font-bold uppercase py-3 hover:bg-[#FFFFFF] transition-colors border border-transparent rounded-none mt-2">Dar Acceso Total</button>
                  </form>
                </div>

              </div>

              {/* COLUMNA DERECHA: TABLAS DE VISUALIZACIÓN */}
              <div className="xl:col-span-2 flex flex-col gap-8 h-full min-h-[600px]">
                
                {/* SOLICITUDES ENTRANTES */}
                <div className="bg-[#FFFFFF] border border-[#C0C0C0] flex flex-col shadow-none rounded-none h-1/2">
                  <div className="p-4 bg-[#F5F5F5] border-b border-[#C0C0C0] flex justify-between items-center shrink-0">
                    <span className="font-bold text-xs uppercase tracking-widest text-[#0A1F33]">Solicitudes de Alta (Portal)</span>
                    <input type="text" aria-label="Buscar solicitud" placeholder="Buscar solicitud..." className="border border-[#C0C0C0] px-3 py-2 text-xs w-full md:w-48 focus:outline-none focus:border-[#0A1F33] bg-[#FFFFFF] rounded-none" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                  </div>
                  <div className="overflow-auto flex-grow custom-scrollbar">
                    <table className="w-full text-left border-collapse whitespace-nowrap min-w-[700px]">
                      <thead className="bg-[#FFFFFF] sticky top-0 z-10 border-b border-[#C0C0C0]">
                        <tr className="text-[9px] font-bold text-[#C0C0C0] uppercase tracking-widest">
                          <th className="p-4 border-r border-[#C0C0C0]/50">Solicitante</th>
                          <th className="p-4 border-r border-[#C0C0C0]/50">Concesionaria / Marcas</th>
                          <th className="p-4 text-center">Estado de Solicitud</th>
                        </tr>
                      </thead>
                      <tbody className="text-[11px] text-[#3A3A3C]">
                        {filteredSolicitudes.length === 0 ? (
                          <tr><td colSpan={3} className="p-10 text-center text-[#C0C0C0] font-bold uppercase tracking-widest">No hay solicitudes pendientes.</td></tr>
                        ) : filteredSolicitudes.map((req: any) => (
                          <tr key={req.id} className="border-b border-[#C0C0C0]/50 hover:bg-[#F8F9FA] transition-colors">
                            <td className="p-4 border-r border-[#C0C0C0]/50 align-top">
                              <span className="block font-bold text-[#0A1F33] uppercase">{req.nombre}</span>
                              <span className="block text-[9px] text-[#C0C0C0] uppercase mb-1">{req.cargo}</span>
                              <a href={`mailto:${req.email}`} className="text-[#00BFFF] hover:underline block">{req.email}</a>
                              <span className="text-[#3A3A3C]">Tel: {req.telefono}</span>
                            </td>
                            <td className="p-4 border-r border-[#C0C0C0]/50 align-top">
                              <span className="block font-black text-[#0A1F33] uppercase">{req.concesionaria}</span>
                              <span className="block text-[9px] font-bold text-[#3A3A3C] uppercase tracking-widest mt-1">Marcas solicitadas:</span>
                              <span className="text-[10px] text-[#C0C0C0] whitespace-normal">{req.marcas}</span>
                            </td>
                            <td className="p-4 align-top w-40 text-center">
                              <select 
                                className={`w-full border p-2 text-[10px] font-bold uppercase tracking-widest focus:outline-none appearance-none cursor-pointer text-center rounded-none ${req.estado === 'Pendiente' ? 'border-[#00BFFF] bg-[#00BFFF]/10 text-[#0A1F33]' : 'border-[#1E8E3E] bg-[#E6F4EA] text-[#1E8E3E]'}`}
                                value={req.estado} onChange={(e) => handleUpdateReqStatus(req.id, e.target.value)}>
                                <option value="Pendiente">Pendiente</option><option value="Procesado">Procesado ✓</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* USUARIOS ACTIVOS (CONCESIONARIAS Y ADMINS) */}
                <div className="bg-[#FFFFFF] border border-[#C0C0C0] flex flex-col shadow-none rounded-none h-1/2">
                  <div className="p-4 bg-[#FFFFFF] border-b border-[#C0C0C0] flex justify-between items-center shrink-0">
                    <span className="font-bold text-xs uppercase tracking-widest text-[#0A1F33]">Todos los Usuarios Activos</span>
                  </div>
                  <div className="overflow-auto flex-grow custom-scrollbar">
                    <table className="w-full text-left border-collapse whitespace-nowrap min-w-[700px]">
                      <thead className="bg-[#F8F9FA] sticky top-0 z-10 border-b border-[#C0C0C0]">
                        <tr className="text-[9px] font-bold text-[#C0C0C0] uppercase tracking-widest">
                          <th className="p-4 border-r border-[#C0C0C0]/50">Email / UID</th>
                          <th className="p-4 border-r border-[#C0C0C0]/50">Rol de Acceso</th>
                          <th className="p-4 border-r border-[#C0C0C0]/50">Permisos (Marcas)</th>
                          <th className="p-4 text-right">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="text-[11px] text-[#3A3A3C]">
                        {usuariosSistemaList.length === 0 ? (
                          <tr><td colSpan={4} className="p-10 text-center text-[#C0C0C0] font-bold uppercase tracking-widest">No hay usuarios dados de alta.</td></tr>
                        ) : usuariosSistemaList.map((u: any) => {
                          // Self-healing display for arrays
                          let displayMarcas: string[] = [];
                          if (typeof u.marcasPermitidas === 'string') {
                            try { displayMarcas = JSON.parse(u.marcasPermitidas); } 
                            catch(e) { displayMarcas = u.marcasPermitidas.split(','); }
                          } else if (Array.isArray(u.marcasPermitidas)) {
                            displayMarcas = u.marcasPermitidas;
                          }

                          const isAdmin = u.role === 'admin';

                          return (
                            <tr key={u.id} className="border-b border-[#C0C0C0]/50 hover:bg-[#F5FBFF] transition-colors">
                              <td className="p-4 border-r border-[#C0C0C0]/50 align-top">
                                <span className="block font-bold text-[#0A1F33]">{u.email}</span>
                                <span className="font-mono text-[9px] text-[#C0C0C0] block mt-1">UID: {u.id}</span>
                              </td>
                              <td className="p-4 border-r border-[#C0C0C0]/50 align-top">
                                {isAdmin ? (
                                  <span className="bg-[#00BFFF] text-[#0A1F33] text-[9px] font-black uppercase px-2 py-1 tracking-widest inline-block shadow-sm">Administrador / Socio</span>
                                ) : (
                                  <>
                                    <span className="bg-[#E6F4EA] text-[#1E8E3E] border border-[#1E8E3E]/30 text-[9px] font-bold uppercase px-2 py-1 tracking-widest mb-1 inline-block">Concesionaria</span>
                                    <span className="block font-black text-[#0A1F33] uppercase text-[10px] mt-1">{u.dealershipName}</span>
                                  </>
                                )}
                              </td>
                              <td className="p-4 border-r border-[#C0C0C0]/50 align-top whitespace-normal">
                                {isAdmin ? (
                                  <span className="text-[10px] font-bold text-[#3A3A3C] uppercase">Acceso Total</span>
                                ) : (
                                  <div className="flex flex-wrap gap-1">
                                    {displayMarcas.map((m: string) => (
                                      <span key={m} className="bg-[#F5F5F5] border border-[#C0C0C0] text-[#3A3A3C] text-[8px] font-bold uppercase px-2 py-0.5 tracking-widest">{m.trim()}</span>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="p-4 text-right align-top">
                                {!isAdmin && (
                                  <button onClick={() => triggerEditUserB2B(u)} className="text-[#00BFFF] font-bold uppercase hover:underline text-[9px] tracking-widest outline-none">Editar B2B</button>
                                )}
                                {isAdmin && u.email !== 'aldojeda92@gmail.com' && (
                                  <button onClick={() => handleDelete('users', u.id)} className="text-[#D93025] font-bold uppercase hover:underline text-[9px] tracking-widest outline-none">Revocar Admin</button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* VISTAS DASHBOARD & FINANCIERO */}
          {activeTab === 'dashboard' && (
            <div className="flex flex-col gap-8">
              {/* KPIs Principales */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-6 border-l-4 border-l-[#0A1F33]"><p className="text-[10px] font-bold text-[#C0C0C0] uppercase tracking-widest mb-1">Leads Totales</p><p className="font-black text-3xl text-[#0A1F33]">{filteredLeads.length}</p></div>
                <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-6 border-l-4 border-l-[#00BFFF]"><p className="text-[10px] font-bold text-[#C0C0C0] uppercase tracking-widest mb-1">Nuevos</p><p className="font-black text-3xl text-[#00BFFF]">{filteredLeads.filter(l => l.estado === 'Nuevo').length}</p></div>
                <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-6 border-l-4 border-l-[#3A3A3C]"><p className="text-[10px] font-bold text-[#C0C0C0] uppercase tracking-widest mb-1">En Gestión</p><p className="font-black text-3xl text-[#3A3A3C]">{filteredLeads.filter(l => ['Contactado', 'En Negociación'].includes(l.estado)).length}</p></div>
                <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-6 border-l-4 border-l-[#1E8E3E]"><p className="text-[10px] font-bold text-[#C0C0C0] uppercase tracking-widest mb-1">Cerrados ✓</p><p className="font-black text-3xl text-[#1E8E3E]">{filteredLeads.filter(l => l.estado === 'Cerrado').length}</p></div>
              </div>
              {filteredLeads.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-6 flex flex-col"><h3 className="text-xs font-bold text-[#0A1F33] uppercase tracking-widest mb-4 border-b border-[#C0C0C0] pb-2">Autos más Cotizados</h3><div className="flex-grow"><BarChart data={topVehiculos} total={filteredLeads.length} /></div></div>
                  <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-6 flex flex-col"><h3 className="text-xs font-bold text-[#0A1F33] uppercase tracking-widest mb-4 border-b border-[#C0C0C0] pb-2">Rendimiento por Origen</h3><div className="flex-grow"><BarChart data={leadsPorOrigen} total={filteredLeads.length} /></div></div>
                  <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-6 flex flex-col"><h3 className="text-xs font-bold text-[#0A1F33] uppercase tracking-widest mb-4 border-b border-[#C0C0C0] pb-2">Tracción de Concesionarias</h3><div className="flex-grow"><BarChart data={leadsPorConcesionaria} total={filteredLeads.length} /></div></div>
                </div>
              )}
              <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-6 flex flex-col gap-4">
                <h3 className="text-[10px] font-bold text-[#0A1F33] uppercase tracking-widest border-b border-[#C0C0C0] pb-2">Panel de Filtros</h3>
                <div className="flex flex-col xl:flex-row gap-4 justify-between items-end">
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 w-full">
                    <div className="flex flex-col gap-1"><label htmlFor="filter-date-from" className="text-[9px] font-bold text-[#C0C0C0] uppercase tracking-widest">Desde</label><input id="filter-date-from" type="date" className="border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#0A1F33]" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} /></div>
                    <div className="flex flex-col gap-1"><label htmlFor="filter-date-to" className="text-[9px] font-bold text-[#C0C0C0] uppercase tracking-widest">Hasta</label><input id="filter-date-to" type="date" className="border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#0A1F33]" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} /></div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor="filter-status" className="text-[9px] font-bold text-[#C0C0C0] uppercase tracking-widest">Estado</label>
                      <select id="filter-status" className="border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#0A1F33] bg-[#FFFFFF]" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                        <option value="Todos">Todos</option><option value="Nuevo">Nuevo</option><option value="Contactado">Contactado</option><option value="En Negociación">En Negociación</option><option value="Cerrado">Cerrado</option><option value="Perdido">Perdido</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor="filter-origin" className="text-[9px] font-bold text-[#C0C0C0] uppercase tracking-widest">Origen</label>
                      <select id="filter-origin" className="border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#0A1F33] bg-[#FFFFFF]" value={filterOrigin} onChange={(e) => setFilterOrigin(e.target.value)}>
                        <option value="Todos">Todos</option>{origenesUnicos.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor="filter-marca" className="text-[9px] font-bold text-[#00BFFF] uppercase tracking-widest">Marca</label>
                      <select id="filter-marca" className="border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#00BFFF] bg-[#FFFFFF]" value={filterMarca} onChange={(e) => { setFilterMarca(e.target.value); setFilterModelo('Todos'); }}>
                        <option value="Todas">Todas</option>{marcasList.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor="filter-modelo" className="text-[9px] font-bold text-[#00BFFF] uppercase tracking-widest">Modelo</label>
                      <select id="filter-modelo" className="border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#00BFFF] bg-[#FFFFFF] disabled:bg-[#F8F9FA]" value={filterModelo} onChange={(e) => setFilterModelo(e.target.value)} disabled={filterMarca === 'Todas'}>
                        <option value="Todos">Todos</option>{modelosFiltradosParaSelect.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor="filter-concesionaria" className="text-[9px] font-bold text-[#00BFFF] uppercase tracking-widest">Concesionaria</label>
                      <select id="filter-concesionaria" className="border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#00BFFF] bg-[#FFFFFF]" value={filterConcesionaria} onChange={(e) => setFilterConcesionaria(e.target.value)}>
                        <option value="Todas">Todas</option>{concesionariasUnicas.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="w-full xl:w-64 shrink-0"><input type="text" aria-label="Búsqueda rápida" placeholder="Búsqueda rápida..." className="w-full border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#0A1F33]" value={filterText} onChange={e => setFilterText(e.target.value)} /></div>
                </div>
              </div>
              <div className="bg-[#FFFFFF] border border-[#C0C0C0] overflow-x-auto flex-grow">
                {filteredLeads.length === 0 ? (
                  <div className="p-16 text-center text-[#C0C0C0] font-bold text-xs uppercase tracking-widest">No hay leads que coincidan con los filtros.</div>
                ) : (
                  <table className="w-full text-left border-collapse whitespace-nowrap min-w-[1000px]">
                    <thead className="bg-[#F8F9FA] sticky top-0 z-10 border-b border-[#C0C0C0]">
                      <tr className="text-[9px] font-bold text-[#0A1F33] uppercase tracking-widest">
                        <th className="p-4 border-r border-[#C0C0C0]/50">Fecha</th><th className="p-4 border-r border-[#C0C0C0]/50">Prospecto & Origen</th><th className="p-4 border-r border-[#C0C0C0]/50">Interés Principal</th><th className="p-4 border-r border-[#C0C0C0]/50 text-center">Estado / Pipeline</th>
                      </tr>
                    </thead>
                    <tbody className="text-[11px] text-[#3A3A3C]">
                      {filteredLeads.map(lead => (
                        <tr key={lead.id} className="border-b border-[#C0C0C0]/50 hover:bg-[#F5FBFF] transition-colors">
                          <td className="p-4 border-r border-[#C0C0C0]/50 align-top w-32"><span className="block font-bold text-[#0A1F33]">{lead.createdAt.toLocaleDateString()}</span><span className="text-[9px] text-[#C0C0C0]">{lead.createdAt.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span></td>
                          <td className="p-4 border-r border-[#C0C0C0]/50 align-top">
                            <span className="block font-black text-[#0A1F33] uppercase text-[12px]">{lead.nombre}</span>
                            <div className="flex gap-3 mt-1 mb-2">
                              <a href={`https://wa.me/595${lead.telefono.substring(1)}`} target="_blank" rel="noopener noreferrer" className="text-[#1E8E3E] font-bold hover:underline">WA: {lead.telefono}</a>
                              {lead.email !== 'No proporcionado' && lead.email !== '-' && <a href={`mailto:${lead.email}`} className="text-[#00BFFF] hover:underline">Email</a>}
                            </div>
                            <span className="inline-block bg-[#F5F5F5] border border-[#C0C0C0] px-2 py-0.5 text-[8px] font-bold text-[#3A3A3C] uppercase tracking-widest">{lead.origen}</span>
                          </td>
                          <td className="p-4 border-r border-[#C0C0C0]/50 align-top max-w-[300px] whitespace-normal">
                            <span className="block font-bold text-[#0A1F33] uppercase leading-tight mb-1">{lead.vehiculo}</span><span className="text-[9px] text-[#C0C0C0] font-bold uppercase tracking-widest block">Ruteo: {lead.concesionaria_destino}</span>
                          </td>
                          <td className="p-4 align-top w-40">
                            <select 
                              className={`w-full border p-2 text-[10px] font-bold uppercase tracking-widest focus:outline-none appearance-none cursor-pointer text-center ${lead.estado === 'Nuevo' ? 'border-[#00BFFF] bg-[#00BFFF]/10 text-[#0A1F33]' : lead.estado === 'Cerrado' ? 'border-[#1E8E3E] bg-[#E6F4EA] text-[#1E8E3E]' : lead.estado === 'Perdido' ? 'border-[#D93025] bg-[#FCE8E6] text-[#D93025]' : 'border-[#0A1F33] bg-[#0A1F33]/5 text-[#0A1F33]'}`}
                              value={lead.estado} onChange={(e) => handleUpdateLeadStatus(lead.id, e.target.value)}>
                              <option value="Nuevo">Nuevo</option><option value="Contactado">Contactado</option><option value="En Negociación">En Negociación</option><option value="Cerrado">Cerrado ✓</option><option value="Perdido">Perdido ✕</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {activeTab === 'financiero' && (
            <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-8 max-w-3xl">
              <h2 className="font-bold text-[#0A1F33] text-lg uppercase border-b border-[#C0C0C0] pb-4 mb-6">Configuración de Motor Matemático</h2>
              <form onSubmit={handleSaveFinancial} className="flex flex-col gap-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div><label htmlFor="fin-tasa-anual" className="text-[10px] font-bold text-[#00BFFF] uppercase tracking-widest block mb-2">Tasa de Interés Anual Nominal</label><input id="fin-tasa-anual" type="number" step="0.001" className="w-full border border-[#C0C0C0] p-4 text-sm focus:outline-none focus:border-[#0A1F33] bg-[#F8F9FA]" value={finForm.tasa_anual} onChange={e => setFinForm({...finForm, tasa_anual: parseFloat(e.target.value)})} required /></div>
                  <div><label htmlFor="fin-gastos-admin" className="text-[10px] font-bold text-[#00BFFF] uppercase tracking-widest block mb-2">Gastos Administrativos</label><input id="fin-gastos-admin" type="number" step="0.001" className="w-full border border-[#C0C0C0] p-4 text-sm focus:outline-none focus:border-[#0A1F33] bg-[#F8F9FA]" value={finForm.gastos_admin} onChange={e => setFinForm({...finForm, gastos_admin: parseFloat(e.target.value)})} required /></div>
                  <div><label htmlFor="fin-seguro-vida" className="text-[10px] font-bold text-[#00BFFF] uppercase tracking-widest block mb-2">Seguro de Vida</label><input id="fin-seguro-vida" type="number" step="0.001" className="w-full border border-[#C0C0C0] p-4 text-sm focus:outline-none focus:border-[#0A1F33] bg-[#F8F9FA]" value={finForm.seguro_vida} onChange={e => setFinForm({...finForm, seguro_vida: parseFloat(e.target.value)})} required /></div>
                  <div className="bg-[#E6F4EA] p-4 border border-[#1E8E3E]/20 flex flex-col justify-center"><span className="text-[10px] font-bold text-[#1E8E3E] uppercase tracking-widest block mb-1">Retención Total del Banco</span><span className="font-black text-2xl text-[#1E8E3E]">{((finForm.gastos_admin + finForm.seguro_vida) * 100).toFixed(1)}%</span></div>
                </div>
                <div className="border-t border-[#C0C0C0] pt-6 flex justify-end">
                  <button type="submit" disabled={loading} className="bg-[#0A1F33] text-[#FFFFFF] font-bold text-xs uppercase tracking-widest py-4 px-10 hover:bg-[#00BFFF] transition-colors">Actualizar Servidor</button>
                </div>
              </form>
            </div>
          )}

          {/* ======================================= */}
          {/* VISTAS ABM (MARCAS, MODELOS, VERSIONES, CONCESIONARIAS) */}
          {/* ======================================= */}
          {['marcas', 'modelos', 'versiones', 'concesionarias'].includes(activeTab) && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 h-full">
              
              <div className="xl:col-span-1 bg-[#FFFFFF] border border-[#C0C0C0] p-6 h-fit max-h-full overflow-y-auto custom-scrollbar">
                <h2 className="font-bold text-[#0A1F33] text-sm uppercase mb-6 border-b border-[#C0C0C0] pb-2">
                  {((activeTab === 'marcas' && marcaForm.id) || (activeTab === 'modelos' && modeloForm.id) || (activeTab === 'versiones' && versionForm.id) || (activeTab === 'concesionarias' && concesionariaForm.id)) ? 'Modificar Registro' : 'Crear Nuevo'}
                </h2>

                {activeTab === 'concesionarias' && (
                  <form onSubmit={handleSaveConcesionaria} className="flex flex-col gap-4">
                    <div><label htmlFor="concesionariaForm-name" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Nombre Comercial</label><input id="concesionariaForm-name" type="text" className="w-full border p-3 text-xs focus:outline-none focus:border-[#0A1F33]" value={concesionariaForm.name} onChange={e => setConcesionariaForm({...concesionariaForm, name: e.target.value})} required /></div>
                    <div><label htmlFor="concesionariaForm-email" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Email Gerencia (Recepción Leads)</label><input id="concesionariaForm-email" type="email" className="w-full border p-3 text-xs focus:outline-none focus:border-[#0A1F33]" value={concesionariaForm.email_gerencia} onChange={e => setConcesionariaForm({...concesionariaForm, email_gerencia: e.target.value})} placeholder="gerente@concesionaria.com" /></div>
                    <div><label htmlFor="concesionariaForm-status" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Estado</label>
                      <select id="concesionariaForm-status" className="w-full border p-3 text-xs focus:outline-none focus:border-[#0A1F33]" value={concesionariaForm.status} onChange={e => setConcesionariaForm({...concesionariaForm, status: e.target.value})}>
                        <option value="active">Activa</option>
                        <option value="inactive">Inactiva</option>
                      </select>
                    </div>
                    <div className="flex gap-2 mt-4">
                      {concesionariaForm.id && <button type="button" onClick={() => setConcesionariaForm({id:'', name:'', status:'active', email_gerencia:''})} className="flex-1 border border-[#0A1F33] text-[#0A1F33] text-[10px] font-bold uppercase transition-colors hover:bg-[#F5F5F5]">Cancelar</button>}
                      <button type="submit" disabled={loading} className="flex-1 bg-[#0A1F33] text-[#FFFFFF] text-xs font-bold uppercase py-3 hover:bg-[#00BFFF] transition-colors">Guardar</button>
                    </div>
                  </form>
                )}

                {activeTab === 'marcas' && (
                  <form onSubmit={handleSaveMarca} className="flex flex-col gap-4">
                    <div><label htmlFor="marcaForm-name" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Nombre Marca</label><input id="marcaForm-name" type="text" className="w-full border p-3 text-xs focus:outline-none focus:border-[#0A1F33]" value={marcaForm.name} onChange={e => setMarcaForm({...marcaForm, name: e.target.value})} required /></div>
                    <div><label htmlFor="marcaForm-origen" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Origen de la Marca</label><input id="marcaForm-origen" type="text" className="w-full border p-3 text-xs focus:outline-none focus:border-[#0A1F33]" value={marcaForm.origen_marca} onChange={e => setMarcaForm({...marcaForm, origen_marca: e.target.value})} /></div>
                    <ImageUploadField label="Logotipo" folder="brands" value={marcaForm.logoUrl} onChange={url => setMarcaForm({...marcaForm, logoUrl: url})} accentClass="text-[#00BFFF]" />
                    <div className="flex gap-2 mt-4">
                       {marcaForm.id && <button type="button" onClick={() => setMarcaForm({id:'', name:'', origen_marca:'', logoUrl:''})} className="flex-1 border border-[#0A1F33] text-[#0A1F33] text-[10px] font-bold uppercase transition-colors hover:bg-[#F5F5F5]">Cancelar</button>}
                       <button type="submit" disabled={loading} className="flex-1 bg-[#0A1F33] text-[#FFFFFF] text-xs font-bold uppercase py-3 hover:bg-[#00BFFF] transition-colors">Guardar</button>
                    </div>
                  </form>
                )}

                {activeTab === 'modelos' && (
                  <form onSubmit={handleSaveModelo} className="flex flex-col gap-4">
                    <div><label htmlFor="modeloForm-brandId" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Marca</label>
                      <select id="modeloForm-brandId" className="w-full border p-3 text-xs focus:outline-none focus:border-[#0A1F33]" value={modeloForm.brandId} onChange={e => setModeloForm({...modeloForm, brandId: e.target.value})} required>
                        <option value="">Seleccionar...</option>
                        {marcasList.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </div>
                    <div><label htmlFor="modeloForm-name" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Nombre Modelo</label><input id="modeloForm-name" type="text" className="w-full border p-3 text-xs focus:outline-none focus:border-[#0A1F33]" value={modeloForm.name} onChange={e => setModeloForm({...modeloForm, name: e.target.value})} required /></div>

                    {/* Checkbox para Lo más Buscado */}
                    <div className="flex items-center gap-2 mt-2 bg-[#F8F9FA] p-3 border border-[#C0C0C0]/50">
                      <input type="checkbox" id="isPopular" checked={modeloForm.isPopular} onChange={e => setModeloForm({...modeloForm, isPopular: e.target.checked})} className="w-4 h-4 accent-[#00BFFF]" />
                      <label htmlFor="isPopular" className="text-[10px] font-bold text-[#0A1F33] uppercase tracking-widest cursor-pointer">Destacar en "Lo más buscado" (Home)</label>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div><label htmlFor="modeloForm-tipo" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Categoría</label><input id="modeloForm-tipo" type="text" className="w-full border p-3 text-xs focus:outline-none focus:border-[#0A1F33]" value={modeloForm.tipo_carroceria} onChange={e => setModeloForm({...modeloForm, tipo_carroceria: e.target.value})} /></div>
                      <div><label htmlFor="modeloForm-subsegmento" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Subsegmento</label><input id="modeloForm-subsegmento" type="text" className="w-full border p-3 text-xs focus:outline-none focus:border-[#0A1F33]" value={modeloForm.subsegmento} onChange={e => setModeloForm({...modeloForm, subsegmento: e.target.value})} /></div>
                      <div><label htmlFor="modeloForm-origen" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Origen (Fábrica)</label><input id="modeloForm-origen" type="text" className="w-full border p-3 text-xs focus:outline-none focus:border-[#0A1F33]" value={modeloForm.origen} onChange={e => setModeloForm({...modeloForm, origen: e.target.value})} /></div>
                      <div><label htmlFor="modeloForm-precio" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Precio Inicial</label><input id="modeloForm-precio" type="number" className="w-full border p-3 text-xs focus:outline-none focus:border-[#0A1F33]" value={modeloForm.startingPrice} onChange={e => setModeloForm({...modeloForm, startingPrice: e.target.value})} required /></div>
                    </div>
                    <ImageUploadField label="Imagen Catálogo" folder="models" value={modeloForm.imgUrl} onChange={url => setModeloForm({...modeloForm, imgUrl: url})} />
                    <div className="flex gap-2 mt-4">
                       {modeloForm.id && <button type="button" onClick={() => setModeloForm({id:'', brandId:'', name:'', tipo_carroceria:'SUV', subsegmento:'', origen:'', startingPrice:'', imgUrl:'', isPopular: false})} className="flex-1 border border-[#0A1F33] text-[#0A1F33] text-[10px] font-bold uppercase transition-colors hover:bg-[#F5F5F5]">Cancelar</button>}
                       <button type="submit" disabled={loading} className="flex-1 bg-[#0A1F33] text-[#FFFFFF] text-xs font-bold uppercase py-3 hover:bg-[#00BFFF] transition-colors">Guardar</button>
                    </div>
                  </form>
                )}

                {activeTab === 'versiones' && (
                  <form onSubmit={handleSaveVersion} className="flex flex-col gap-6">
                    <fieldset className="border border-[#C0C0C0] p-4 bg-[#F8F9FA]">
                      <legend className="text-[10px] font-bold text-[#0A1F33] bg-[#E6E6E6] border border-[#C0C0C0] uppercase tracking-widest px-3 py-1">Datos Principales</legend>
                      <div className="flex flex-col gap-3">
                        <div>
                          <label htmlFor="versionForm-modelId" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Modelo Vinculado</label>
                          <select id="versionForm-modelId" className="w-full border p-2 text-xs bg-[#FFFFFF] focus:outline-none focus:border-[#0A1F33]" value={versionForm.modelId} onChange={e => setVersionForm({...versionForm, modelId: e.target.value})} required>
                            <option value="">Seleccionar...</option>
                            {modelosList.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                        </div>
                        <div><label htmlFor="versionForm-name" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Nombre de Versión</label><input id="versionForm-name" type="text" className="w-full border p-2 text-xs focus:outline-none focus:border-[#0A1F33]" value={versionForm.name} onChange={e => setVersionForm({...versionForm, name: e.target.value})} required /></div>
                        <div className="grid grid-cols-2 gap-3">
                          <div><label htmlFor="versionForm-price" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Precio (USD)</label><input id="versionForm-price" type="number" className="w-full border p-2 text-xs focus:outline-none focus:border-[#0A1F33]" value={versionForm.price} onChange={e => setVersionForm({...versionForm, price: e.target.value})} required /></div>
                          <div><label htmlFor="versionForm-promocion" className="text-[10px] font-bold text-[#00BFFF] uppercase block mb-1">Promoción</label><input id="versionForm-promocion" type="text" className="w-full border border-[#00BFFF]/30 p-2 text-xs focus:outline-none focus:border-[#00BFFF]" value={versionForm.promocion} onChange={e => setVersionForm({...versionForm, promocion: e.target.value})} /></div>
                        </div>
                        <div><label htmlFor="versionForm-url_auto" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">URL Oficial (Ficha Técnica)</label><input id="versionForm-url_auto" type="text" className="w-full border p-2 text-xs focus:outline-none focus:border-[#0A1F33]" value={versionForm.url_auto} onChange={e => setVersionForm({...versionForm, url_auto: e.target.value})} /></div>
                      </div>
                    </fieldset>

                    <fieldset className="border border-[#C0C0C0] p-4 bg-[#F8F9FA]">
                      <legend className="text-[10px] font-bold text-[#0A1F33] bg-[#E6E6E6] border border-[#C0C0C0] uppercase tracking-widest px-3 py-1">Motor y Transmisión</legend>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div><label htmlFor="versionForm-combustible" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Combustible Base</label><input id="versionForm-combustible" type="text" className="w-full border p-2 text-xs focus:outline-none focus:border-[#0A1F33]" value={versionForm.combustible} onChange={e => setVersionForm({...versionForm, combustible: e.target.value})} /></div>
                        <div><label htmlFor="versionForm-motor" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Motor</label><input id="versionForm-motor" type="text" className="w-full border p-2 text-xs focus:outline-none focus:border-[#0A1F33]" value={versionForm.motor} onChange={e => setVersionForm({...versionForm, motor: e.target.value})} /></div>
                        <div className="col-span-2"><label htmlFor="versionForm-alimentacion" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Alimentación Detallada</label><input id="versionForm-alimentacion" type="text" className="w-full border p-2 text-xs focus:outline-none focus:border-[#0A1F33]" value={versionForm.alimentacion} onChange={e => setVersionForm({...versionForm, alimentacion: e.target.value})} placeholder="Ej: Inyección Directa Turbo" /></div>
                        <div><label htmlFor="versionForm-autonomia" className="text-[10px] font-bold text-[#00BFFF] uppercase block mb-1">Autonomía EV (km)</label><input id="versionForm-autonomia" type="text" className="w-full border border-[#00BFFF]/30 p-2 text-xs focus:outline-none focus:border-[#00BFFF]" value={versionForm.autonomi_electrica} onChange={e => setVersionForm({...versionForm, autonomi_electrica: e.target.value})} /></div>
                        <div><label htmlFor="versionForm-transmision" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Caja / Transmisión</label><input id="versionForm-transmision" type="text" className="w-full border p-2 text-xs focus:outline-none focus:border-[#0A1F33]" value={versionForm.transmision} onChange={e => setVersionForm({...versionForm, transmision: e.target.value})} /></div>
                        <div className="col-span-2"><label htmlFor="versionForm-traccion" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Tracción</label><input id="versionForm-traccion" type="text" className="w-full border p-2 text-xs focus:outline-none focus:border-[#0A1F33]" value={versionForm.traccion} onChange={e => setVersionForm({...versionForm, traccion: e.target.value})} /></div>
                      </div>
                    </fieldset>

                    <fieldset className="border border-[#C0C0C0] p-4 bg-[#F8F9FA]">
                      <legend className="text-[10px] font-bold text-[#0A1F33] bg-[#E6E6E6] border border-[#C0C0C0] uppercase tracking-widest px-3 py-1">Chasis y Dinámica</legend>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label htmlFor="versionForm-suspension" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Suspensión Detalle</label><input id="versionForm-suspension" type="text" className="w-full border p-2 text-xs focus:outline-none focus:border-[#0A1F33]" value={versionForm.detalle_suspension} onChange={e => setVersionForm({...versionForm, detalle_suspension: e.target.value})} placeholder="Ej: MacPherson / Multi-link" /></div>
                        <div><label htmlFor="versionForm-frenos" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Frenos Detalle</label><input id="versionForm-frenos" type="text" className="w-full border p-2 text-xs focus:outline-none focus:border-[#0A1F33]" value={versionForm.detalles_freno} onChange={e => setVersionForm({...versionForm, detalles_freno: e.target.value})} placeholder="Ej: Discos ventilados" /></div>
                        <div><label htmlFor="versionForm-neumaticos" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Neumáticos</label><input id="versionForm-neumaticos" type="text" className="w-full border p-2 text-xs focus:outline-none focus:border-[#0A1F33]" value={versionForm.medida_neumatico} onChange={e => setVersionForm({...versionForm, medida_neumatico: e.target.value})} placeholder="Ej: 225/60 R18" /></div>
                        <div><label htmlFor="versionForm-llanta" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Tipo de Llanta</label><input id="versionForm-llanta" type="text" className="w-full border p-2 text-xs focus:outline-none focus:border-[#0A1F33]" value={versionForm.tipo_llanta} onChange={e => setVersionForm({...versionForm, tipo_llanta: e.target.value})} placeholder="Ej: Aleación 18''" /></div>
                      </div>
                    </fieldset>

                    <fieldset className="border border-[#C0C0C0] p-4 bg-[#F8F9FA]">
                      <legend className="text-[10px] font-bold text-[#0A1F33] bg-[#E6E6E6] border border-[#C0C0C0] uppercase tracking-widest px-3 py-1">Arquitectura (mm)</legend>
                      <div className="grid grid-cols-3 gap-3">
                        <div><label htmlFor="versionForm-largo" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Largo</label><input id="versionForm-largo" type="number" className="w-full border p-2 text-xs focus:outline-none focus:border-[#0A1F33]" value={versionForm.largo} onChange={e => setVersionForm({...versionForm, largo: e.target.value})} /></div>
                        <div><label htmlFor="versionForm-ancho" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Ancho</label><input id="versionForm-ancho" type="number" className="w-full border p-2 text-xs focus:outline-none focus:border-[#0A1F33]" value={versionForm.ancho} onChange={e => setVersionForm({...versionForm, ancho: e.target.value})} /></div>
                        <div><label htmlFor="versionForm-alto" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Alto</label><input id="versionForm-alto" type="number" className="w-full border p-2 text-xs focus:outline-none focus:border-[#0A1F33]" value={versionForm.alto} onChange={e => setVersionForm({...versionForm, alto: e.target.value})} /></div>
                        <div><label htmlFor="versionForm-despeje" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Despeje</label><input id="versionForm-despeje" type="number" className="w-full border p-2 text-xs focus:outline-none focus:border-[#0A1F33]" value={versionForm.despeje_suelo} onChange={e => setVersionForm({...versionForm, despeje_suelo: e.target.value})} /></div>
                        <div><label htmlFor="versionForm-baulera" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Baulera (L)</label><input id="versionForm-baulera" type="number" className="w-full border p-2 text-xs focus:outline-none focus:border-[#0A1F33]" value={versionForm.baulera_litros} onChange={e => setVersionForm({...versionForm, baulera_litros: e.target.value})} /></div>
                        <div><label htmlFor="versionForm-plazas" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Nº Plazas</label><input id="versionForm-plazas" type="number" className="w-full border p-2 text-xs focus:outline-none focus:border-[#0A1F33]" value={versionForm.plazas} onChange={e => setVersionForm({...versionForm, plazas: e.target.value})} /></div>
                      </div>
                    </fieldset>

                    <fieldset className="border border-[#C0C0C0] p-4 bg-[#F8F9FA]">
                      <legend className="text-[10px] font-bold text-[#0A1F33] bg-[#E6E6E6] border border-[#C0C0C0] uppercase tracking-widest px-3 py-1">Equipamiento y Seguridad</legend>
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div><label htmlFor="versionForm-airbags" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Airbags Totales</label><input id="versionForm-airbags" type="number" className="w-full border p-2 text-xs focus:outline-none focus:border-[#0A1F33]" value={versionForm.airbags} onChange={e => setVersionForm({...versionForm, airbags: e.target.value})} /></div>
                        <div><label htmlFor="versionForm-camaras" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Cámaras</label><input id="versionForm-camaras" type="text" className="w-full border p-2 text-xs focus:outline-none focus:border-[#0A1F33]" value={versionForm.camaras} onChange={e => setVersionForm({...versionForm, camaras: e.target.value})} /></div>
                        <div><label htmlFor="versionForm-pantalla" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Pantalla (")</label><input id="versionForm-pantalla" type="number" step="0.1" className="w-full border p-2 text-xs focus:outline-none focus:border-[#0A1F33]" value={versionForm.tamanho_pantalla} onChange={e => setVersionForm({...versionForm, tamanho_pantalla: e.target.value})} /></div>
                        <div><label htmlFor="versionForm-conectividad" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Conectividad</label><input id="versionForm-conectividad" type="text" className="w-full border p-2 text-xs focus:outline-none focus:border-[#0A1F33]" value={versionForm.conectividad} onChange={e => setVersionForm({...versionForm, conectividad: e.target.value})} /></div>
                      </div>

                      <div className="flex flex-col gap-4">
                        <div>
                          <label htmlFor="versionForm-seguridad" className="text-[10px] font-bold text-[#0A1F33] uppercase block mb-1">Seguridad Standard (Separa con ; )</label>
                          <textarea id="versionForm-seguridad" rows={3} className="w-full border p-2 text-xs focus:outline-none focus:border-[#0A1F33] bg-[#FFFFFF] resize-none" value={versionForm.seguridad_standard} onChange={e => setVersionForm({...versionForm, seguridad_standard: e.target.value})} placeholder="6 Airbags; Frenos ABS + EBD; Control de estabilidad..."></textarea>
                        </div>
                        <div>
                          <label htmlFor="versionForm-confort" className="text-[10px] font-bold text-[#0A1F33] uppercase block mb-1">Confort y Conveniencia (Separa con ; )</label>
                          <textarea id="versionForm-confort" rows={3} className="w-full border p-2 text-xs focus:outline-none focus:border-[#0A1F33] bg-[#FFFFFF] resize-none" value={versionForm.confort_conveniencia} onChange={e => setVersionForm({...versionForm, confort_conveniencia: e.target.value})} placeholder="Climatizador automático; Asiento de cuero; Cargador inalámbrico..."></textarea>
                        </div>
                        <div>
                          <label htmlFor="versionForm-adas" className="text-[10px] font-bold text-[#00BFFF] uppercase block mb-1">Sistemas Avanzados ADAS (Separa con | )</label>
                          <input id="versionForm-adas" type="text" className="w-full border border-[#00BFFF]/30 p-2 text-xs focus:outline-none focus:border-[#00BFFF]" value={versionForm.adas} onChange={e => setVersionForm({...versionForm, adas: e.target.value})} placeholder="Alerta colisión | Mantenimiento carril" />
                        </div>
                      </div>
                    </fieldset>
                    
                    <div className="flex gap-2 mt-4">
                       {versionForm.id && <button type="button" onClick={() => setVersionForm({id: '', modelId: '', name: '', price: '', concesionaria: '', promocion: '', url_auto: '', motor: '', transmision: '', combustible: '', traccion: '', largo: '', ancho: '', alto: '', despeje_suelo: '', baulera_litros: '', plazas: '', airbags: '', tamanho_pantalla: '', conectividad: '', camaras: '', garantia: '', adas: '', asiento_cuero: '', techo_panoramico: '', alimentacion: '', autonomi_electrica: '', medida_neumatico: '', tipo_llanta: '', detalle_suspension: '', detalles_freno: '', confort_conveniencia: '', seguridad_standard: ''})} className="flex-1 border border-[#0A1F33] text-[#0A1F33] text-[10px] font-bold uppercase transition-colors hover:bg-[#F5F5F5]">Cancelar</button>}
                       <button type="submit" disabled={loading} className="flex-1 bg-[#0A1F33] text-[#FFFFFF] text-xs font-bold uppercase py-3 hover:bg-[#00BFFF] transition-colors">Guardar Versión Matriz 5</button>
                    </div>
                  </form>
                )}
              </div>

              {/* Visor de Registros */}
              <div className="xl:col-span-2 bg-[#FFFFFF] border border-[#C0C0C0] flex flex-col h-full min-h-[600px]">
                <div className="p-4 bg-[#F5F5F5] border-b border-[#C0C0C0] flex flex-col md:flex-row gap-4 justify-between items-center shrink-0">
                  <span className="font-bold text-xs uppercase tracking-widest text-[#0A1F33]">Tabla de Registros: {activeTab}</span>
                  <input type="text" placeholder="Búsqueda rápida en RAM..." className="border border-[#C0C0C0] px-3 py-2 text-xs w-full md:w-64 focus:outline-none focus:border-[#0A1F33] bg-[#FFFFFF]" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <div className="overflow-auto flex-grow custom-scrollbar">
                  <table className="w-full text-left border-collapse whitespace-nowrap min-w-[600px]">
                    <thead className="bg-[#FFFFFF] sticky top-0 z-10 border-b border-[#C0C0C0]">
                      <tr className="text-[9px] font-bold text-[#C0C0C0] uppercase tracking-widest">
                        <th className="p-4">Identidad Visual</th>
                        <th className="p-4">ID / Nombre</th>
                        <th className="p-4 text-right">Manejo B2B</th>
                      </tr>
                    </thead>
                    <tbody className="text-[11px] text-[#3A3A3C]">
                      {activeTab === 'concesionarias' && filteredConcesionarias.map(c => (
                        <tr key={c.id} className="border-b border-[#C0C0C0]/50 hover:bg-[#F8F9FA]">
                          <td className="p-4"><div className="h-8 w-8 bg-[#00BFFF] flex items-center justify-center text-[10px] font-bold text-[#0A1F33] uppercase rounded-full">{c.name.substring(0,2)}</div></td>
                          <td className="p-4 font-bold">{c.name} <span className="text-[#C0C0C0] block font-normal text-[9px] mt-1">Email: {c.email_gerencia || 'No asignado'} • Estado: {c.status}</span></td>
                          <td className="p-4 text-right flex gap-3 justify-end items-center mt-2">
                              <button onClick={() => { setConcesionariaForm({ id: c.id, name: c.name || '', email_gerencia: c.email_gerencia || '', status: c.status || 'active' }); window.scrollTo(0,0); }} className="text-[#00BFFF] font-bold uppercase hover:underline">Editar</button>
                              <button onClick={() => handleDelete('concesionarias', c.id)} className="text-[#D93025] font-bold uppercase hover:underline">Eliminar</button>
                          </td>
                        </tr>
                      ))}
                      {activeTab === 'marcas' && filteredMarcas.map(m => (
                        <tr key={m.id} className="border-b border-[#C0C0C0]/50 hover:bg-[#F8F9FA]">
                          <td className="p-4">{isValidImageSrc(m.logoUrl) ? <Image src={m.logoUrl} alt={m.name} width={64} height={32} className="h-8 w-auto object-contain" unoptimized={!isOptimizableImageSrc(m.logoUrl)} /> : <div className="h-8 w-8 bg-[#F5F5F5] flex items-center justify-center text-[10px] font-bold text-[#C0C0C0] uppercase rounded-full">{m.name.substring(0,2)}</div>}</td>
                          <td className="p-4 font-bold">{m.name} <span className="text-[#C0C0C0] block font-normal text-[9px] mt-1">Origen: {m.origen_marca || 'N/A'}</span></td>
                          <td className="p-4 text-right flex gap-3 justify-end items-center mt-2"><button onClick={() => triggerEditMarca(m)} className="text-[#00BFFF] font-bold uppercase hover:underline">Editar</button><button onClick={() => handleDelete('brands', m.id)} className="text-[#D93025] font-bold uppercase hover:underline">Eliminar</button></td>
                        </tr>
                      ))}
                      {activeTab === 'modelos' && filteredModelos.map(m => (
                        <tr key={m.id} className="border-b border-[#C0C0C0]/50 hover:bg-[#F8F9FA]">
                          <td className="p-4">{isValidImageSrc(m.imgUrl) ? <Image src={m.imgUrl} alt={m.name} width={64} height={32} className="h-8 w-auto object-contain" unoptimized={!isOptimizableImageSrc(m.imgUrl)} /> : <span className="text-[#C0C0C0] text-[9px] uppercase">Sin Foto</span>}</td>
                          <td className="p-4 font-bold">
                            {m.name} {m.isPopular && <span className="ml-2 text-[8px] bg-[#00BFFF] text-[#0A1F33] px-2 py-0.5 uppercase tracking-widest">Destacado</span>}
                            <span className="text-[#C0C0C0] block font-normal text-[9px] mt-1">Marca ID: {m.brandId} • {normalizeCarroceria(m.tipo_carroceria)}</span>
                          </td>
                          <td className="p-4 text-right flex gap-3 justify-end items-center mt-2"><button onClick={() => triggerEditModelo(m)} className="text-[#00BFFF] font-bold uppercase hover:underline">Editar</button><button onClick={() => handleDelete('models', m.id)} className="text-[#D93025] font-bold uppercase hover:underline">Eliminar</button></td>
                        </tr>
                      ))}
                      {activeTab === 'versiones' && filteredVersiones.map(v => (
                        <tr key={v.id} className="border-b border-[#C0C0C0]/50 hover:bg-[#F8F9FA]">
                          <td className="p-4 font-mono text-[10px] text-[#C0C0C0]">{v.id}</td>
                          <td className="p-4 font-bold">{v.name} <span className="text-[#C0C0C0] block font-normal text-[9px] mt-1">Modelo ID: {v.modelId} • US$ {v.price}</span></td>
                          <td className="p-4 text-right flex gap-3 justify-end items-center mt-1"><button onClick={() => triggerEditVersion(v)} className="text-[#00BFFF] font-bold uppercase hover:underline">Editar</button><button onClick={() => handleDelete('versions', v.id)} className="text-[#D93025] font-bold uppercase hover:underline">Eliminar</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* VISTAS INYECTOR & ADS */}
          {activeTab === 'inyector' && (
            <div className="bg-[#FFFFFF] border border-[#C0C0C0] flex flex-col h-full overflow-hidden">
              <div className="p-6 border-b border-[#C0C0C0] bg-[#F5F5F5] flex flex-col md:flex-row justify-between items-center shrink-0 gap-4">
                <div><h2 className="font-bold text-[#0A1F33] text-sm uppercase">Motor de Inyección Masiva</h2><p className="text-[10px] text-[#00BFFF] font-bold uppercase tracking-widest mt-1">Soporte nativo para Matriz 5 con Auto-Creación B2B.</p></div>
                <label className="bg-[#FFFFFF] border border-[#0A1F33] text-[#0A1F33] font-bold text-[10px] uppercase px-6 py-3 tracking-widest cursor-pointer hover:bg-[#0A1F33] hover:text-[#FFFFFF] transition-colors whitespace-nowrap">
                  Cargar Archivo CSV <input type="file" accept=".csv" className="hidden" onChange={procesarCSV} />
                </label>
              </div>
              <div className="flex-1 w-full overflow-x-auto overflow-y-auto bg-[#FFFFFF] custom-scrollbar p-0 m-0">
                {csvData.length > 0 ? (
                  <table className="w-max min-w-full text-left border-collapse whitespace-nowrap">
                    <thead className="sticky top-0 bg-[#0A1F33] text-[#FFFFFF] z-20"><tr className="text-[9px] font-bold uppercase tracking-widest"><th className="p-3 sticky left-0 bg-[#0A1F33] z-30">#</th>{headers.map((h, i) => <th key={i} className="p-3 border-l border-[#FFFFFF]/20">{h}</th>)}</tr></thead>
                    <tbody className="text-[11px] font-mono">
                      {csvData.slice(0, 50).map((fila, rowIndex) => (
                        <tr key={rowIndex} className="border-b border-[#C0C0C0]/50 hover:bg-[#F8F9FA]"><td className="p-3 font-bold text-[#00BFFF] sticky left-0 bg-[#FFFFFF] group-hover:bg-[#F8F9FA] z-10 border-r border-[#C0C0C0]/50">{rowIndex + 1}</td>{headers.map((h, i) => <td key={i} className="p-3 border-r border-[#C0C0C0]/50 text-[#3A3A3C] truncate max-w-[200px]" title={fila[h]}>{fila[h]}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                ) : (<div className="h-full w-full flex flex-col items-center justify-center p-12 text-[#C0C0C0]"><p className="font-bold uppercase tracking-widest text-xs">Esperando matriz de datos CSV...</p></div>)}
              </div>
              <div className="p-5 border-t border-[#C0C0C0] bg-[#FFFFFF] flex justify-end gap-4 shrink-0">
                 <button onClick={() => setCsvData([])} disabled={loading || csvData.length === 0} className="text-[10px] font-bold text-[#D93025] uppercase hover:underline">Descartar Lote</button>
                 <button onClick={ejecutarInyeccionCSV} disabled={loading || csvData.length === 0} className="bg-[#0A1F33] hover:bg-[#00BFFF] text-[#FFFFFF] font-bold text-xs uppercase tracking-widest py-3 px-8 transition-colors disabled:opacity-50">
                  {loading ? 'Procesando BBDD...' : 'Ejecutar Inyección Estructural'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'ads' && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 h-full">
              <div className="xl:col-span-1 bg-[#FFFFFF] border border-[#C0C0C0] p-6 h-fit overflow-y-auto custom-scrollbar">
                <h2 className="font-bold text-[#0A1F33] text-sm uppercase mb-6 border-b border-[#C0C0C0] pb-2">Crear Anuncio B2B</h2>
                <form onSubmit={handleCreateAd} className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-2">
                    <div><label htmlFor="adForm-startDate" className="text-[9px] font-bold uppercase block mb-1">Inicio Vigencia</label><input id="adForm-startDate" type="date" className="w-full border p-2 text-xs focus:outline-none focus:border-[#0A1F33]" value={adForm.startDate} onChange={e => setAdForm({...adForm, startDate: e.target.value})} required /></div>
                    <div><label htmlFor="adForm-endDate" className="text-[9px] font-bold uppercase block mb-1">Fin Vigencia</label><input id="adForm-endDate" type="date" className="w-full border p-2 text-xs focus:outline-none focus:border-[#0A1F33]" value={adForm.endDate} onChange={e => setAdForm({...adForm, endDate: e.target.value})} required /></div>
                  </div>
                  <div>
                    <label htmlFor="adForm-location" className="text-[10px] font-bold uppercase block mb-1">Ubicación</label>
                    <select id="adForm-location" className="w-full border p-2 text-xs focus:outline-none focus:border-[#0A1F33]" value={adForm.location} onChange={e => setAdForm({...adForm, location: e.target.value})}>
                      <option value="ambos">Impactar en toda la plataforma</option><option value="home">Exclusivo en Home</option><option value="catalogo">Exclusivo en Catálogo</option><option value="recomendador">Exclusivo en Recomendador</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="adForm-targetCategory" className="text-[10px] font-bold text-[#00BFFF] uppercase block mb-1">Categoría Objetivo (Contextual)</label>
                    <select id="adForm-targetCategory" className="w-full border p-2 text-xs focus:outline-none focus:border-[#00BFFF]" value={adForm.targetCategory} onChange={e => setAdForm({...adForm, targetCategory: e.target.value})}>
                      <option value="Todas">Todas (Impacto Global)</option>
                      {categoriasUnicas.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  <div><label htmlFor="adForm-sponsor" className="text-[10px] font-bold uppercase block mb-1">Patrocinador (Marca/Empresa)</label><input id="adForm-sponsor" type="text" className="w-full border p-3 text-xs focus:outline-none focus:border-[#0A1F33]" value={adForm.sponsor} onChange={e => setAdForm({...adForm, sponsor: e.target.value})} required /></div>
                  <div className="grid grid-cols-2 gap-2">
                     <div><label htmlFor="adForm-headline" className="text-[10px] font-bold uppercase block mb-1">Titular Corto</label><input id="adForm-headline" type="text" className="w-full border p-3 text-xs focus:outline-none focus:border-[#0A1F33]" value={adForm.headline} onChange={e => setAdForm({...adForm, headline: e.target.value})} required /></div>
                     <div><label htmlFor="adForm-highlight" className="text-[10px] font-bold uppercase block mb-1">Resalte Cyan</label><input id="adForm-highlight" type="text" className="w-full border p-3 text-xs focus:outline-none focus:border-[#0A1F33]" value={adForm.highlight} onChange={e => setAdForm({...adForm, highlight: e.target.value})} /></div>
                  </div>
                  <div><label htmlFor="adForm-price" className="text-[10px] font-bold uppercase block mb-1">Precio Promo</label><input id="adForm-price" type="text" className="w-full border p-3 text-xs focus:outline-none focus:border-[#0A1F33]" value={adForm.price} onChange={e => setAdForm({...adForm, price: e.target.value})} /></div>
                  <div><label htmlFor="adForm-link" className="text-[10px] font-bold uppercase block mb-1">URL Enlace</label><input id="adForm-link" type="text" className="w-full border p-3 text-xs focus:outline-none focus:border-[#0A1F33]" value={adForm.link} onChange={e => setAdForm({...adForm, link: e.target.value})} /></div>
                  <ImageUploadField label="Imagen del Banner" folder="campaigns" value={adForm.img} onChange={url => setAdForm({...adForm, img: url})} />
                  <button type="submit" disabled={loading} className="mt-2 bg-[#0A1F33] text-[#FFFFFF] text-xs font-bold uppercase py-3 hover:bg-[#00BFFF] transition-colors">Inyectar Campaña</button>
                </form>
              </div>

              <div className="xl:col-span-2 bg-[#FFFFFF] border border-[#C0C0C0] flex flex-col h-full min-h-[500px]">
                <div className="p-4 bg-[#F5F5F5] border-b border-[#C0C0C0] flex flex-col md:flex-row justify-between items-center shrink-0 gap-4">
                  <span className="font-bold text-xs uppercase tracking-widest text-[#0A1F33]">Bóveda Publicitaria Activa</span>
                </div>
                <div className="overflow-auto flex-grow custom-scrollbar p-6 flex flex-col gap-4">
                  {campaignsList.length === 0 ? <p className="text-[10px] text-center text-[#C0C0C0] font-bold uppercase">Sin campañas.</p> : campaignsList.map((camp: any) => (
                    <div key={camp.id} className={`border p-4 flex justify-between items-center transition-colors ${camp.isActive ? 'border-[#00BFFF] bg-[#F5FBFF]' : 'border-[#C0C0C0] bg-[#F8F9FA]'}`}>
                       <div>
                         <p className="text-[9px] font-bold text-[#3A3A3C] uppercase">{camp.sponsor} • Categoría: {camp.targetCategory || 'Todas'}</p>
                         <p className="font-black text-sm text-[#0A1F33] uppercase" style={{ fontFamily: 'Montserrat, sans-serif' }}>{camp.headline}</p>
                         <p className="text-[8px] text-[#C0C0C0] uppercase mt-1">Ubicación: {camp.location} | Vence: {camp.endDate}</p>
                       </div>
                       <div className="flex gap-2">
                         <button onClick={() => handleToggleAd(camp.id, camp.isActive)} className={`border ${camp.isActive ? 'border-[#D93025] text-[#D93025]' : 'border-[#0A1F33] text-[#0A1F33]'} px-4 py-2 text-[9px] font-bold uppercase`}>{camp.isActive ? 'Pausar' : 'Activar'}</button>
                         <button onClick={() => handleDelete('campaigns', camp.id)} className="border border-[#C0C0C0] text-[#C0C0C0] px-3 py-2 text-[9px] font-bold uppercase">X</button>
                       </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}