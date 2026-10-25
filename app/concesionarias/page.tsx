// app/concesionarias/page.tsx
'use client';

import React, { useState, useEffect, useMemo, useCallback, useId } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { 
  collection, getDocs, doc, getDoc, updateDoc, addDoc, setDoc, deleteDoc, 
  serverTimestamp, query, where, writeBatch 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { db, auth, storage } from '../../lib/firebase';
import { generarSlug } from '../../lib/slug';
import { parseCSVRow } from '../../lib/csv';
import { normalizeCarroceria } from '../../lib/carroceria';
import { useToast } from '../context/ToastContext';
import { sendDealershipRequestEmail, sendReportsAccessRequestEmail } from '../../lib/mailer';
import DealershipReportsView from './DealershipReportsView';
import { invalidateCatalogCache } from '../../lib/catalogCache';
import Modal from '../components/a11y/Modal';

// ==========================================
// INTERFACES B2B
// ==========================================
interface UserData {
  role: string;
  dealershipName: string;
  marcasPermitidas: string[];
  canAccessReports?: boolean;
  reportsRequested?: boolean;
}

interface RequestForm {
  nombre: string;
  cargo: string;
  concesionaria: string;
  marcas: string;
  telefono: string;
  email: string;
  password?: string;
  confirmPassword?: string;
}

// ==========================================
// HELPERS Y SUBIDA DE IMÁGENES
// ==========================================
const isValidImageSrc = (url?: string): boolean => {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  return trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/');
};

const isOptimizableImageSrc = (url?: string): boolean => {
  if (!isValidImageSrc(url)) return false;
  const trimmed = url!.trim();
  return trimmed.startsWith('/') || trimmed.startsWith('https://images.unsplash.com');
};

const formatLastModified = (val: any) => {
  if (!val) return 'Sin fecha';
  try {
    const d = val?.toDate ? val.toDate() : new Date(val);
    if (isNaN(d.getTime())) return 'Sin fecha';
    return d.toLocaleString('es-PY', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return 'Sin fecha';
  }
};

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
      // 1. Intentar subida mediante el endpoint interno del servidor (evita bloqueos de CORS)
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', folder);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          onChange(data.url);
          return;
        }
      }

      // 2. Fallback a Firebase Storage si el endpoint local no está disponible
      const path = `${folder}/${Date.now()}_${file.name}`;
      const fileRef = ref(storage, path);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      onChange(url);
    } catch (err: any) {
      console.error('Error al subir imagen:', err);
      setError(err.message || 'Error al subir la imagen. También podés pegar una URL directa abajo.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className={`text-[10px] font-bold uppercase block ${accentClass || 'text-[#3A3A3C]'}`}>{label}</label>
      
      {isValidImageSrc(value) && (
        <div className="flex items-center gap-3 p-2 bg-[#F8F9FA] border border-[#C0C0C0]/50 w-full mb-1">
          <Image
            src={value}
            alt="Vista previa"
            width={96}
            height={48}
            className="h-12 w-auto object-contain border border-[#C0C0C0]/50 p-1 bg-[#FFFFFF]"
            unoptimized={!isOptimizableImageSrc(value)}
          />
          <div className="flex flex-col flex-grow min-w-0">
            <span className="text-[9px] font-bold text-[#0A1F33] uppercase truncate">URL Actual:</span>
            <span className="text-[9px] text-[#3A3A3C] font-mono truncate">{value}</span>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <input
          id={inputId}
          type="file"
          accept="image/*"
          onChange={handleFile}
          disabled={uploading}
          className={`w-full border p-2.5 text-xs focus:outline-none disabled:opacity-50 ${accentClass ? 'border-[#00BFFF]/30 focus:border-[#00BFFF]' : 'focus:border-[#0A1F33]'}`}
        />

        <div className="flex items-center gap-2">
          <span className="text-[9px] text-[#C0C0C0] uppercase font-bold tracking-widest shrink-0">O pegar URL:</span>
          <input
            type="text"
            placeholder="https://... o /uploads/..."
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 border p-1.5 text-xs focus:outline-none focus:border-[#00BFFF] rounded-none bg-[#FFFFFF]"
          />
        </div>
      </div>

      {uploading && <p className="text-[10px] text-[#00BFFF] font-bold uppercase tracking-wider mt-0.5">Subiendo imagen al servidor...</p>}
      {error && <p className="text-[10px] text-red-600 mt-0.5">{error}</p>}
    </div>
  );
}

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
  const [reqForm, setReqForm] = useState<RequestForm>({ nombre: '', cargo: '', concesionaria: '', marcas: '', telefono: '', email: '', password: '', confirmPassword: '' });

  // Dashboard State
  const [activeTab, setActiveTab] = useState<'leads' | 'inventario' | 'reportes'>('leads');
  const [invSubTab, setInvSubTab] = useState<'versiones' | 'modelos' | 'csv'>('versiones');
  
  // Datos relacionales
  const [leads, setLeads] = useState<any[]>([]);
  const [inventario, setInventario] = useState<any[]>([]);
  const [marcasList, setMarcasList] = useState<any[]>([]);
  const [modelosList, setModelosList] = useState<any[]>([]);
  const [allVersiones, setAllVersiones] = useState<any[]>([]);
  const [comparisonStats, setComparisonStats] = useState<any[]>([]);
  const [wizardStats, setWizardStats] = useState<any[]>([]);
  const [isRequestingReportsAccess, setIsRequestingReportsAccess] = useState(false);
  
  // ==========================================
  // ESTADOS DE FILTRO PARA INVENTARIO
  // ==========================================
  const [invVerFilterMarca, setInvVerFilterMarca] = useState('Todas');
  const [invVerFilterModelo, setInvVerFilterModelo] = useState('Todos');
  const [searchTermVersiones, setSearchTermVersiones] = useState('');

  const [invModFilterMarca, setInvModFilterMarca] = useState('Todas');
  const [searchTermModelos, setSearchTermModelos] = useState('');

  // Edición Inline por Columna con Lápiz (✏️)
  const [inlineEdit, setInlineEdit] = useState<{
    type: 'version' | 'modelo';
    id: string;
    field: string;
    value: string;
  } | null>(null);

  // Modales de Edición / Creación Completa
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [versionFormData, setVersionFormData] = useState({
    id: '',
    modelId: '',
    name: '',
    price: '',
    promocion: '',
    url_auto: '',
    motor: '',
    transmision: '',
    combustible: '',
    traccion: '',
    plazas: '',
    airbags: '',
    tamanho_pantalla: '',
    garantia: '',
    adas: '',
    techo_panoramico: '',
    asiento_cuero: ''
  });

  const [modeloModalOpen, setModeloModalOpen] = useState(false);
  const [modeloFormData, setModeloFormData] = useState({
    id: '',
    brandId: '',
    name: '',
    tipo_carroceria: 'SUV',
    origen: '',
    startingPrice: '',
    imgUrl: ''
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

      // Obtenemos Catálogo Global y Métricas BI
      const [bSnap, mSnap, vSnap, leadsSnap, compSnap, wizSnap] = await Promise.all([
        getDocs(collection(db, 'brands')),
        getDocs(collection(db, 'models')),
        getDocs(collection(db, 'versions')),
        getDocs(query(collection(db, 'leads'), where('concesionaria_destino_norm', '==', dealershipNameNorm))),
        getDocs(collection(db, 'comparison_stats')),
        getDocs(collection(db, 'wizard_stats'))
      ]);

      const bList: any[] = bSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const mList: any[] = mSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const rawVersions: any[] = vSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      setMarcasList(bList);
      setModelosList(mList);
      setAllVersiones(rawVersions);
      setComparisonStats(compSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setWizardStats(wizSnap.docs.map(d => ({ id: d.id, ...d.data() })));

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
      // RESOLUCIÓN: LEADS (filtrados server-side por concesionaria)
      // ==============================================
      const myLeads = leadsSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((lead: any) => !lead.marca || permitidasNormalizadas.includes(String(lead.marca).toUpperCase().trim()))
        .sort((a: any, b: any) => (b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0) - (a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0));

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
              marcasPermitidas: parsedMarcas,
              canAccessReports: Boolean(rawData.canAccessReports),
              reportsRequested: Boolean(rawData.reportsRequested)
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
  // SOLICITUD DE ACCESO A REPORTES BI
  // ==========================================
  const handleRequestReportsAccess = async () => {
    if (!user) return;
    setIsRequestingReportsAccess(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        reportsRequested: true,
        reportsRequestedAt: serverTimestamp(),
      });
      await sendReportsAccessRequestEmail({
        dealershipName: userData?.dealershipName || '',
        userName: user.displayName || user.email || '',
        userEmail: user.email || '',
        marcas: userData?.marcasPermitidas || [],
      });
      setUserData(prev => prev ? { ...prev, reportsRequested: true } : null);
      showToast("✅ Solicitud enviada a la gerencia de DATACAR. Te notificaremos al habilitar tu acceso.");
    } catch (e: any) {
      console.error("Error al solicitar acceso a reportes:", e);
      showToast(e.message || "Error al solicitar acceso.");
    } finally {
      setIsRequestingReportsAccess(false);
    }
  };

  // ==========================================
  // 4. ALTA Y LOGIN
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
      if (!reqForm.password || reqForm.password.length < 6) {
        setFeedback({ type: 'error', message: 'La contraseña debe tener al menos 6 caracteres.' });
        setLoading(false);
        return;
      }
      if (reqForm.password !== reqForm.confirmPassword) {
        setFeedback({ type: 'error', message: 'Las contraseñas no coinciden. Por favor revisá ambos campos.' });
        setLoading(false);
        return;
      }

      // 1. Registro automático en Firebase Authentication mediante API del servidor
      const regRes = await fetch('/api/auth/register-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: reqForm.nombre,
          cargo: reqForm.cargo,
          concesionaria: reqForm.concesionaria,
          marcas: reqForm.marcas,
          telefono: reqForm.telefono,
          email: reqForm.email,
          password: reqForm.password,
        }),
      });

      const regData = await regRes.json();
      if (!regRes.ok) {
        setFeedback({ type: 'error', message: regData.message || regData.error || 'Error al procesar el registro.' });
        setLoading(false);
        return;
      }

      const authUid = regData.uid;

      // 2. Guardar en Firestore con el UID ya vinculado (sin guardar la contraseña en texto plano)
      await addDoc(collection(db, 'dealership_requests'), {
        uid: authUid,
        nombre: reqForm.nombre.trim(),
        cargo: reqForm.cargo.trim(),
        concesionaria: reqForm.concesionaria.trim(),
        marcas: reqForm.marcas.trim(),
        telefono: reqForm.telefono.trim(),
        email: reqForm.email.trim(),
        estado: 'Pendiente',
        createdAt: serverTimestamp()
      });

      // 3. Notificación a gerencia por correo como siempre
      const emailSent = await sendDealershipRequestEmail({
        nombre: reqForm.nombre,
        cargo: reqForm.cargo,
        concesionaria: reqForm.concesionaria,
        marcas: reqForm.marcas,
        telefono: reqForm.telefono,
        email: reqForm.email,
      });

      if (!emailSent) {
        console.error('La solicitud de alta B2B se guardó, pero hubo una advertencia al enviar el correo.');
      }

      setFeedback({
        type: 'success',
        message: '¡Solicitud enviada con éxito! Tu cuenta está registrada y pendiente de activación por la administración de DATACAR. Te notificaremos a tu correo corporativo cuando tus permisos sean asignados.'
      });
      setReqForm({ nombre: '', cargo: '', concesionaria: '', marcas: '', telefono: '', email: '', password: '', confirmPassword: '' });
      setTimeout(() => setAuthView('login'), 6000);
    } catch (error: any) {
      console.error('Error enviando solicitud:', error);
      setFeedback({ type: 'error', message: error?.message || 'Error enviando solicitud. Intenta más tarde.' });
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
  // 6. SCOPE DE PERMISOS B2B
  // ==========================================
  const permittedBrandsObjects = useMemo(() => {
    if (!userData?.marcasPermitidas) return [];
    const norm = userData.marcasPermitidas.map(m => m.toUpperCase().trim());
    return marcasList.filter(b => norm.includes(b.name.toUpperCase().trim()));
  }, [marcasList, userData?.marcasPermitidas]);

  const permittedBrandIds = useMemo(() => {
    return new Set(permittedBrandsObjects.map(b => b.id));
  }, [permittedBrandsObjects]);

  const permittedModels = useMemo(() => {
    return modelosList.filter(m => permittedBrandIds.has(m.brandId));
  }, [modelosList, permittedBrandIds]);

  // ==========================================
  // 7. EDICIÓN INLINE CON LÁPIZ (✏️)
  // ==========================================
  const handleInlineSave = async () => {
    if (!inlineEdit) return;
    const { type, id, field, value } = inlineEdit;
    try {
      const now = new Date();
      const updatePayload: any = { updatedAt: serverTimestamp() };

      if (type === 'version') {
        if (field === 'price') updatePayload.price = Number(value) || 0;
        else if (field === 'promocion') updatePayload.promocion = value;
        else if (field === 'name') updatePayload.name = value;
        else if (field === 'url_auto') updatePayload.url_auto = value;
        else if (['motor', 'transmision', 'combustible'].includes(field)) {
          updatePayload[`specs.${field}`] = value;
        }

        await updateDoc(doc(db, 'versions', id), updatePayload);
        setInventario(prev => prev.map(v => {
          if (v.id !== id) return v;
          if (field === 'price') return { ...v, price: Number(value) || 0, updatedAt: now };
          if (field === 'promocion') return { ...v, promocion: value, updatedAt: now };
          if (field === 'name') return { ...v, name: value, updatedAt: now };
          if (field === 'url_auto') return { ...v, url_auto: value, updatedAt: now };
          if (['motor', 'transmision', 'combustible'].includes(field)) {
            return { ...v, specs: { ...(v.specs || {}), [field]: value }, updatedAt: now };
          }
          return v;
        }));

        await logAudit('INLINE_EDIT_VERSION', id, `Modificó campo ${field} a: ${value}`);
        invalidateCatalogCache('versions');
        showToast("Campo actualizado correctamente.");
      } else if (type === 'modelo') {
        if (field === 'name') updatePayload.name = value.toUpperCase();
        else if (field === 'tipo_carroceria') updatePayload.tipo_carroceria = normalizeCarroceria(value);
        else if (field === 'origen') updatePayload.origen = value;
        else if (field === 'startingPrice') updatePayload.startingPrice = Number(value) || 0;

        await updateDoc(doc(db, 'models', id), updatePayload);
        setModelosList(prev => prev.map(m => {
          if (m.id !== id) return m;
          if (field === 'name') return { ...m, name: value.toUpperCase(), updatedAt: now };
          if (field === 'tipo_carroceria') return { ...m, tipo_carroceria: normalizeCarroceria(value), updatedAt: now };
          if (field === 'origen') return { ...m, origen: value, updatedAt: now };
          if (field === 'startingPrice') return { ...m, startingPrice: Number(value) || 0, updatedAt: now };
          return m;
        }));

        await logAudit('INLINE_EDIT_MODEL', id, `Modificó campo ${field} a: ${value}`);
        invalidateCatalogCache('models');
        showToast("Modelo actualizado correctamente.");
      }
      setInlineEdit(null);
    } catch (err: any) {
      console.error("Error en edición inline:", err);
      showToast("Error al guardar cambios.");
    }
  };

  // ==========================================
  // 8. BORRADO DE REGISTROS (🗑️)
  // ==========================================
  const handleDeleteVersion = async (id: string, name: string) => {
    if (!confirm(`¿Confirmas la eliminación permanente de la versión "${name}"? Esta acción no se puede deshacer.`)) return;
    try {
      await deleteDoc(doc(db, 'versions', id));
      setInventario(prev => prev.filter(v => v.id !== id));
      await logAudit('DELETE_VERSION', id, `Versión eliminada: ${name}`);
      invalidateCatalogCache('versions');
      showToast("Versión eliminada permanentemente.");
    } catch (err: any) {
      console.error("Error eliminando versión:", err);
      showToast("Error al eliminar versión.");
    }
  };

  const handleDeleteModelo = async (id: string, name: string) => {
    // Verificamos si hay versiones creadas bajo este modelo
    const versionesAsociadas = inventario.filter(v => v.modelId === id);
    if (versionesAsociadas.length > 0) {
      alert(`No se puede eliminar el modelo "${name}" porque contiene ${versionesAsociadas.length} versión(es) asociada(s). Primero elimina o traslada sus versiones.`);
      return;
    }

    if (!confirm(`¿Confirmas la eliminación permanente del modelo "${name}"? Esta acción no se puede deshacer.`)) return;
    try {
      await deleteDoc(doc(db, 'models', id));
      setModelosList(prev => prev.filter(m => m.id !== id));
      await logAudit('DELETE_MODEL', id, `Modelo eliminado: ${name}`);
      invalidateCatalogCache('models');
      showToast("Modelo eliminado permanentemente.");
      if (userData) fetchDashboardData(userData);
    } catch (err: any) {
      console.error("Error eliminando modelo:", err);
      showToast("Error al eliminar modelo.");
    }
  };

  // ==========================================
  // 9. MODALES ABM (CREAR / EDITAR COMPLETO)
  // ==========================================
  const openNewVersionModal = () => {
    setVersionFormData({
      id: '',
      modelId: permittedModels[0]?.id || '',
      name: '',
      price: '',
      promocion: '',
      url_auto: '',
      motor: '',
      transmision: '',
      combustible: 'Nafta',
      traccion: 'Delantera',
      plazas: '5',
      airbags: '6',
      tamanho_pantalla: '10',
      garantia: '5 Años o 100.000 Km',
      adas: '',
      techo_panoramico: '',
      asiento_cuero: ''
    });
    setVersionModalOpen(true);
  };

  const triggerEditVersion = (v: any) => {
    setVersionFormData({
      id: v.id,
      modelId: v.modelId || '',
      name: v.name || '',
      price: String(v.price || ''),
      promocion: v.promocion || '',
      url_auto: v.url_auto || '',
      motor: v.specs?.motor || '',
      transmision: v.specs?.transmision || '',
      combustible: v.specs?.combustible || '',
      traccion: v.specs?.traccion || '',
      plazas: String(v.specs?.plazas || ''),
      airbags: String(v.specs?.airbags || ''),
      tamanho_pantalla: String(v.specs?.tamanho_pantalla || ''),
      garantia: v.specs?.garantia || '',
      adas: Array.isArray(v.features?.adas) ? v.features.adas.join(', ') : '',
      techo_panoramico: v.features?.techo_panoramico || '',
      asiento_cuero: v.features?.asiento_cuero || ''
    });
    setVersionModalOpen(true);
  };

  const handleSaveVersionModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!versionFormData.name || !versionFormData.modelId) {
      showToast("Nombre y Modelo son requeridos.");
      return;
    }

    try {
      const isEditing = Boolean(versionFormData.id);
      const id = isEditing ? versionFormData.id : `${versionFormData.modelId}_${generarSlug(versionFormData.name)}`;

      const adasArray = versionFormData.adas
        ? versionFormData.adas.split(',').map(s => s.trim()).filter(Boolean)
        : [];

      const docPayload: any = {
        modelId: versionFormData.modelId,
        name: versionFormData.name,
        concesionaria: userData?.dealershipName, // Force B2B ownership
        price: Number(versionFormData.price) || 0,
        promocion: versionFormData.promocion || '',
        url_auto: versionFormData.url_auto || '',
        specs: {
          motor: versionFormData.motor || '',
          transmision: versionFormData.transmision || '',
          combustible: versionFormData.combustible || '',
          traccion: versionFormData.traccion || '',
          plazas: Number(versionFormData.plazas) || 0,
          airbags: Number(versionFormData.airbags) || 0,
          tamanho_pantalla: Number(versionFormData.tamanho_pantalla) || 0,
          garantia: versionFormData.garantia || ''
        },
        features: {
          adas: adasArray,
          techo_panoramico: versionFormData.techo_panoramico || 'No',
          asiento_cuero: versionFormData.asiento_cuero || 'No'
        },
        updatedAt: serverTimestamp()
      };

      await setDoc(doc(db, 'versions', id), docPayload, { merge: true });
      await logAudit(
        isEditing ? 'UPDATE_VERSION' : 'CREATE_VERSION',
        id,
        `Versión ${isEditing ? 'actualizada' : 'creada'}: ${versionFormData.name}`
      );

      invalidateCatalogCache('versions');
      showToast(`Versión ${isEditing ? 'actualizada' : 'creada'} exitosamente.`);
      setVersionModalOpen(false);
      if (userData) fetchDashboardData(userData);
    } catch (err: any) {
      console.error("Error guardando versión:", err);
      showToast("Error al guardar la versión.");
    }
  };

  const openNewModeloModal = () => {
    setModeloFormData({
      id: '',
      brandId: permittedBrandsObjects[0]?.id || '',
      name: '',
      tipo_carroceria: 'SUV',
      origen: '',
      startingPrice: '',
      imgUrl: ''
    });
    setModeloModalOpen(true);
  };

  const triggerEditModelo = (m: any) => {
    setModeloFormData({
      id: m.id,
      brandId: m.brandId || '',
      name: m.name || '',
      tipo_carroceria: m.tipo_carroceria || 'SUV',
      origen: m.origen || '',
      startingPrice: String(m.startingPrice || ''),
      imgUrl: m.imgUrl || ''
    });
    setModeloModalOpen(true);
  };

  const handleSaveModeloModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modeloFormData.name || !modeloFormData.brandId) {
      showToast("Nombre y Marca son requeridos.");
      return;
    }

    try {
      const isEditing = Boolean(modeloFormData.id);
      const id = isEditing ? modeloFormData.id : generarSlug(`${modeloFormData.brandId}-${modeloFormData.name}`);

      const docPayload: any = {
        brandId: modeloFormData.brandId,
        name: modeloFormData.name.toUpperCase(),
        tipo_carroceria: normalizeCarroceria(modeloFormData.tipo_carroceria),
        origen: modeloFormData.origen || '',
        startingPrice: Number(modeloFormData.startingPrice) || 0,
        imgUrl: modeloFormData.imgUrl || '',
        updatedAt: serverTimestamp()
      };

      await setDoc(doc(db, 'models', id), docPayload, { merge: true });
      await logAudit(
        isEditing ? 'UPDATE_MODEL' : 'CREATE_MODEL',
        id,
        `Modelo ${isEditing ? 'actualizado' : 'creado'}: ${modeloFormData.name.toUpperCase()}`
      );

      invalidateCatalogCache('models');
      showToast(`Modelo ${isEditing ? 'actualizado' : 'creado'} exitosamente.`);
      setModeloModalOpen(false);
      if (userData) fetchDashboardData(userData);
    } catch (err: any) {
      console.error("Error guardando modelo:", err);
      showToast("Error al guardar el modelo.");
    }
  };

  // ==========================================
  // 10. CARGA MASIVA CSV (Con Validación RBAC)
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
          brandId: idMarca, name: fila.modelo.toUpperCase(), tipo_carroceria: normalizeCarroceria(fila.tipo_carroceria), startingPrice: Number(precioValue) || 0, updatedAt: serverTimestamp()
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
      invalidateCatalogCache('models');
      invalidateCatalogCache('versions');
      setFeedback({ type: 'success', message: `Inyección masiva completada: ${csvData.length} vehículos actualizados.` });
      setCsvData([]); if (userData) fetchDashboardData(userData);
    } catch (err: any) { setFeedback({ type: 'error', message: err.message }); } finally { setLoading(false); }
  };

  // ==========================================
  // FILTRADO DINÁMICO DE VERSIONES
  // ==========================================
  const modelosParaFiltro = useMemo(() => {
    if (invVerFilterMarca === 'Todas') return permittedModels;
    return permittedModels.filter(m => m.brandId === invVerFilterMarca);
  }, [permittedModels, invVerFilterMarca]);

  const filteredVersiones = useMemo(() => {
    return inventario.filter(v => {
      const mod = modelosList.find(m => m.id === v.modelId);
      if (invVerFilterMarca !== 'Todas' && mod?.brandId !== invVerFilterMarca) return false;
      if (invVerFilterModelo !== 'Todos' && v.modelId !== invVerFilterModelo) return false;
      if (searchTermVersiones) {
        const term = searchTermVersiones.toLowerCase();
        const matchName = v.name?.toLowerCase().includes(term);
        const matchBrand = v.brandName?.toLowerCase().includes(term);
        const matchModel = v.modelName?.toLowerCase().includes(term);
        const matchMotor = v.specs?.motor?.toLowerCase().includes(term);
        if (!matchName && !matchBrand && !matchModel && !matchMotor) return false;
      }
      return true;
    });
  }, [inventario, modelosList, invVerFilterMarca, invVerFilterModelo, searchTermVersiones]);

  // ==========================================
  // FILTRADO DINÁMICO DE MODELOS
  // ==========================================
  const filteredModelos = useMemo(() => {
    return permittedModels.filter(m => {
      if (invModFilterMarca !== 'Todas' && m.brandId !== invModFilterMarca) return false;
      if (searchTermModelos) {
        const term = searchTermModelos.toLowerCase();
        const brandName = marcasList.find(b => b.id === m.brandId)?.name || '';
        if (!m.name?.toLowerCase().includes(term) && !brandName.toLowerCase().includes(term) && !m.tipo_carroceria?.toLowerCase().includes(term)) {
          return false;
        }
      }
      return true;
    });
  }, [permittedModels, invModFilterMarca, searchTermModelos, marcasList]);

  // ==========================================
  // RENDER: VISTAS NO AUTENTICADAS
  // ==========================================
  if (loading && !user) return <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center font-bold text-[#0A1F33] tracking-widest uppercase text-sm">Verificando credenciales comerciales...</div>;

  if (!user || !userData) {
    return (
      <main className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center font-sans py-12 px-4">
        <div className="w-full max-w-md bg-[#FFFFFF] border-t-4 border-[#0A1F33] border-l border-r border-b border-[#C0C0C0] p-8 shadow-none rounded-none">
          <div className="text-center mb-8">
            <h1 className="font-black text-3xl tracking-widest text-[#0A1F33] uppercase" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>DATA<span className="font-light">CAR</span></h1>
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
              <p className="text-[11px] text-[#3A3A3C] font-medium leading-relaxed mb-2 text-center" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>Completa tus datos. Nuestro equipo validará tu solicitud para darte acceso a la gestión de inventario B2B.</p>
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="req-password" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Crear Contraseña</label>
                  <input id="req-password" type="password" required minLength={6} placeholder="Mínimo 6 caracteres" className="w-full border border-[#C0C0C0] p-3 text-xs focus:outline-none focus:border-[#00BFFF] bg-[#FFFFFF] rounded-none" value={reqForm.password || ''} onChange={e=>setReqForm({...reqForm, password: e.target.value})} />
                </div>
                <div>
                  <label htmlFor="req-confirm-password" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Confirmar Contraseña</label>
                  <input id="req-confirm-password" type="password" required minLength={6} placeholder="Repetir contraseña" className="w-full border border-[#C0C0C0] p-3 text-xs focus:outline-none focus:border-[#00BFFF] bg-[#FFFFFF] rounded-none" value={reqForm.confirmPassword || ''} onChange={e=>setReqForm({...reqForm, confirmPassword: e.target.value})} />
                </div>
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
  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col text-[#3A3A3C] font-sans">
      
      <header className="bg-[#0A1F33] text-[#FFFFFF] border-b-4 border-[#00BFFF] px-6 py-4 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-6">
          <div className="font-black text-2xl tracking-widest uppercase" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>DATA<span className="font-light">CAR</span></div>
          <div className="hidden md:flex flex-col border-l border-[#FFFFFF]/20 pl-6">
            <span className="text-[9px] text-[#00BFFF] font-bold uppercase tracking-widest">Concesionaria Oficial</span>
            <span className="text-[13px] font-bold uppercase tracking-wide">{userData.dealershipName}</span>
          </div>
          <div className="hidden lg:flex items-center gap-1.5 border-l border-[#FFFFFF]/20 pl-6">
            <span className="text-[9px] text-[#C0C0C0] font-bold uppercase tracking-widest">Marcas asignadas:</span>
            {userData.marcasPermitidas.map(m => (
              <span key={m} className="bg-[#00BFFF]/20 border border-[#00BFFF]/40 text-[#00BFFF] text-[8px] font-bold uppercase px-2 py-0.5 tracking-wider">
                {m}
              </span>
            ))}
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
        <button onClick={() => setActiveTab('reportes')} className={`py-4 text-xs font-bold uppercase tracking-widest border-b-4 transition-colors flex items-center gap-2 ${activeTab === 'reportes' ? 'border-[#00BFFF] text-[#0A1F33]' : 'border-transparent text-[#C0C0C0] hover:text-[#3A3A3C]'}`}>
          <span>Reportes &amp; BI de Mercado</span>
          {userData?.canAccessReports ? (
            <span className="bg-[#E6F4EA] text-[#1E8E3E] text-[8.5px] font-black px-1.5 py-0.5 border border-[#1E8E3E]/30">PRO</span>
          ) : (
            <span className="bg-[#F5F5F5] text-[#3A3A3C] text-[8.5px] font-black px-1.5 py-0.5 border border-[#C0C0C0]">🔒</span>
          )}
        </button>
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
                        <span className="block font-bold text-[#0A1F33]">{lead.createdAt?.toDate ? lead.createdAt.toDate().toLocaleDateString() : 'N/A'}</span>
                        <span className="text-[9px] text-[#C0C0C0]">{lead.createdAt?.toDate ? lead.createdAt.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}</span>
                      </td>
                      <td className="p-4 border-r border-[#C0C0C0]/50 align-top">
                        <span className="block font-black text-[#0A1F33] uppercase mb-1">{lead.nombre}</span>
                        {lead.telefono && lead.telefono !== 'No proporcionado' && (
                          <a href={`https://wa.me/595${lead.telefono.startsWith('0') ? lead.telefono.substring(1) : lead.telefono}`} target="_blank" rel="noopener noreferrer" className="text-[#1E8E3E] font-bold hover:underline block mb-1">WA: {lead.telefono}</a>
                        )}
                        {lead.email && lead.email !== 'No proporcionado' && lead.email !== '-' && <a href={`mailto:${lead.email}`} className="text-[#00BFFF] hover:underline block">Email: {lead.email}</a>}
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
        {/* VISTA: INVENTARIO B2B (CUADROS TIPO ADMIN) */}
        {/* ======================================= */}
        {activeTab === 'inventario' && (
          <div className="flex flex-col gap-6">
            
            {/* SUB-TABS INVENTARIO */}
            <div className="flex gap-4">
              <button 
                onClick={() => setInvSubTab('versiones')} 
                className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest border transition-colors flex items-center gap-2 ${invSubTab === 'versiones' ? 'bg-[#0A1F33] text-[#FFFFFF] border-[#0A1F33]' : 'bg-[#FFFFFF] text-[#3A3A3C] border-[#C0C0C0] hover:border-[#0A1F33]'}`}
              >
                <span>Cuadro de Versiones</span>
                <span className={`text-[8.5px] px-1.5 py-0.2 font-black ${invSubTab === 'versiones' ? 'bg-[#00BFFF] text-[#0A1F33]' : 'bg-[#F0F0F0] text-[#0A1F33]'}`}>
                  {inventario.length}
                </span>
              </button>
              
              <button 
                onClick={() => setInvSubTab('modelos')} 
                className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest border transition-colors flex items-center gap-2 ${invSubTab === 'modelos' ? 'bg-[#0A1F33] text-[#FFFFFF] border-[#0A1F33]' : 'bg-[#FFFFFF] text-[#3A3A3C] border-[#C0C0C0] hover:border-[#0A1F33]'}`}
              >
                <span>Cuadro de Modelos</span>
                <span className={`text-[8.5px] px-1.5 py-0.2 font-black ${invSubTab === 'modelos' ? 'bg-[#00BFFF] text-[#0A1F33]' : 'bg-[#F0F0F0] text-[#0A1F33]'}`}>
                  {permittedModels.length}
                </span>
              </button>

              <button 
                onClick={() => setInvSubTab('csv')} 
                className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest border transition-colors ${invSubTab === 'csv' ? 'bg-[#0A1F33] text-[#FFFFFF] border-[#0A1F33]' : 'bg-[#FFFFFF] text-[#3A3A3C] border-[#C0C0C0] hover:border-[#0A1F33]'}`}
              >
                Importar CSV Masivo
              </button>
            </div>

            {/* ------------------------------------------------------------------ */}
            {/* SUB-VISTA: CUADRO DE VERSIONES */}
            {/* ------------------------------------------------------------------ */}
            {invSubTab === 'versiones' && (
              <div className="bg-[#FFFFFF] border border-[#C0C0C0] flex flex-col min-h-[550px] shadow-none">
                {/* BARRA SUPERIOR DE CONTROL Y FILTROS */}
                <div className="p-4 bg-[#F5F5F5] border-b border-[#C0C0C0] flex flex-col lg:flex-row justify-between items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs uppercase tracking-widest text-[#0A1F33]">Inventario de Versiones</span>
                    <span className="text-[10px] bg-[#0A1F33] text-[#00BFFF] px-2.5 py-0.5 font-bold uppercase tracking-wider">{filteredVersiones.length} de {inventario.length}</span>
                  </div>

                  <div className="flex flex-wrap gap-2 w-full lg:w-auto items-center">
                    {/* Filtro Marca */}
                    <div className="flex items-center gap-1 bg-[#FFFFFF] border border-[#C0C0C0] px-2 py-1">
                      <span className="text-[9px] font-bold text-[#C0C0C0] uppercase">Marca:</span>
                      <select 
                        className="text-[10px] font-bold uppercase tracking-widest focus:outline-none bg-transparent cursor-pointer"
                        value={invVerFilterMarca} 
                        onChange={e => { setInvVerFilterMarca(e.target.value); setInvVerFilterModelo('Todos'); }}
                      >
                        <option value="Todas">Todas mis marcas ({permittedBrandsObjects.length})</option>
                        {permittedBrandsObjects.map(b => <option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>)}
                      </select>
                    </div>

                    {/* Filtro Modelo en Cascada */}
                    <div className="flex items-center gap-1 bg-[#FFFFFF] border border-[#C0C0C0] px-2 py-1">
                      <span className="text-[9px] font-bold text-[#C0C0C0] uppercase">Modelo:</span>
                      <select 
                        className="text-[10px] font-bold uppercase tracking-widest focus:outline-none bg-transparent cursor-pointer disabled:opacity-50"
                        value={invVerFilterModelo} 
                        onChange={e => setInvVerFilterModelo(e.target.value)}
                      >
                        <option value="Todos">Todos los modelos ({modelosParaFiltro.length})</option>
                        {modelosParaFiltro.map(m => <option key={m.id} value={m.id}>{m.name.toUpperCase()}</option>)}
                      </select>
                    </div>

                    {/* Buscador */}
                    <input 
                      type="text" 
                      placeholder="Buscar versión o motor..." 
                      className="border border-[#C0C0C0] px-3 py-1 text-xs w-full lg:w-44 focus:outline-none focus:border-[#0A1F33] bg-[#FFFFFF]" 
                      value={searchTermVersiones} 
                      onChange={e => setSearchTermVersiones(e.target.value)} 
                    />

                    <button 
                      onClick={openNewVersionModal}
                      className="bg-[#00BFFF] hover:bg-[#0A1F33] text-[#FFFFFF] text-[10px] font-bold uppercase tracking-widest px-4 py-2 transition-colors shrink-0 shadow-sm"
                    >
                      + Agregar Versión
                    </button>
                  </div>
                </div>

                {/* TABLA / CUADRO VERSIONES */}
                <div className="overflow-x-auto flex-grow custom-scrollbar">
                  <table className="w-full text-left border-collapse whitespace-nowrap min-w-[1100px]">
                    <thead className="bg-[#FFFFFF] sticky top-0 z-10 border-b-2 border-[#0A1F33]">
                      <tr className="text-[9px] font-black text-[#0A1F33] uppercase tracking-widest">
                        <th className="p-3.5 border-r border-[#C0C0C0]/50 bg-[#F8F9FA]">Marca / Modelo</th>
                        <th className="p-3.5 border-r border-[#C0C0C0]/50">Versión ✏️</th>
                        <th className="p-3.5 border-r border-[#C0C0C0]/50">Precio USD ✏️</th>
                        <th className="p-3.5 border-r border-[#C0C0C0]/50">Promoción ✏️</th>
                        <th className="p-3.5 border-r border-[#C0C0C0]/50">Motor / Combustible ✏️</th>
                        <th className="p-3.5 border-r border-[#C0C0C0]/50">Ficha URL ✏️</th>
                        <th className="p-3.5 border-r border-[#C0C0C0]/50 bg-[#F8F9FA]">Última Modificación</th>
                        <th className="p-3.5 text-right bg-[#F8F9FA] sticky right-0">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="text-[11px] text-[#3A3A3C]">
                      {filteredVersiones.length === 0 ? (
                        <tr><td colSpan={8} className="p-12 text-center text-[#C0C0C0] font-bold uppercase tracking-widest">No se encontraron versiones en tu inventario.</td></tr>
                      ) : filteredVersiones.map(v => (
                        <tr key={v.id} className="border-b border-[#C0C0C0]/50 hover:bg-[#F5FBFF] transition-colors group">
                          <td className="p-3.5 font-bold uppercase border-r border-[#C0C0C0]/50 bg-[#F8F9FA]/40">
                            <span className="bg-[#0A1F33] text-[#FFFFFF] text-[9px] px-2 py-0.5 font-black uppercase tracking-wider block w-fit mb-1">{v.brandName}</span>
                            <span className="text-[#0A1F33] text-[11px] font-black">{v.modelName}</span>
                          </td>

                          {/* Versión inline */}
                          <td className="p-3.5 border-r border-[#C0C0C0]/50 font-semibold text-[#0A1F33]">
                            {inlineEdit?.type === 'version' && inlineEdit?.id === v.id && inlineEdit?.field === 'name' ? (
                              <div className="flex items-center gap-1">
                                <input type="text" className="border border-[#00BFFF] p-1 text-xs bg-white w-36 uppercase focus:outline-none" value={inlineEdit.value} onChange={e => setInlineEdit({ ...inlineEdit, value: e.target.value })} autoFocus onKeyDown={e => { if (e.key === 'Enter') handleInlineSave(); if (e.key === 'Escape') setInlineEdit(null); }} />
                                <button onClick={handleInlineSave} className="bg-[#1E8E3E] text-white px-2 py-1 text-[10px] font-bold">✓</button>
                                <button onClick={() => setInlineEdit(null)} className="bg-[#D93025] text-white px-2 py-1 text-[10px] font-bold">✕</button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-2">
                                <span>{v.name}</span>
                                <button onClick={() => setInlineEdit({ type: 'version', id: v.id, field: 'name', value: v.name || '' })} className="text-[#00BFFF] opacity-50 group-hover:opacity-100 text-[11px]" title="Editar nombre">✏️</button>
                              </div>
                            )}
                          </td>

                          {/* Precio inline */}
                          <td className="p-3.5 border-r border-[#C0C0C0]/50 font-black text-[#0A1F33]">
                            {inlineEdit?.type === 'version' && inlineEdit?.id === v.id && inlineEdit?.field === 'price' ? (
                              <div className="flex items-center gap-1">
                                <input type="number" className="border border-[#00BFFF] p-1 text-xs bg-white w-28 focus:outline-none font-bold" value={inlineEdit.value} onChange={e => setInlineEdit({ ...inlineEdit, value: e.target.value })} autoFocus onKeyDown={e => { if (e.key === 'Enter') handleInlineSave(); if (e.key === 'Escape') setInlineEdit(null); }} />
                                <button onClick={handleInlineSave} className="bg-[#1E8E3E] text-white px-2 py-1 text-[10px] font-bold">✓</button>
                                <button onClick={() => setInlineEdit(null)} className="bg-[#D93025] text-white px-2 py-1 text-[10px] font-bold">✕</button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-2">
                                <span>US$ {Number(v.price).toLocaleString()}</span>
                                <button onClick={() => setInlineEdit({ type: 'version', id: v.id, field: 'price', value: String(v.price || '') })} className="text-[#00BFFF] opacity-50 group-hover:opacity-100 text-[11px]" title="Editar precio">✏️</button>
                              </div>
                            )}
                          </td>

                          {/* Promoción inline */}
                          <td className="p-3.5 border-r border-[#C0C0C0]/50">
                            {inlineEdit?.type === 'version' && inlineEdit?.id === v.id && inlineEdit?.field === 'promocion' ? (
                              <div className="flex items-center gap-1">
                                <input type="text" className="border border-[#00BFFF] p-1 text-xs bg-white w-36 focus:outline-none" value={inlineEdit.value} onChange={e => setInlineEdit({ ...inlineEdit, value: e.target.value })} autoFocus onKeyDown={e => { if (e.key === 'Enter') handleInlineSave(); if (e.key === 'Escape') setInlineEdit(null); }} />
                                <button onClick={handleInlineSave} className="bg-[#1E8E3E] text-white px-2 py-1 text-[10px] font-bold">✓</button>
                                <button onClick={() => setInlineEdit(null)} className="bg-[#D93025] text-white px-2 py-1 text-[10px] font-bold">✕</button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-2">
                                <span className={`text-[10px] font-bold uppercase ${v.promocion ? 'text-[#00BFFF]' : 'text-[#C0C0C0]'}`}>{v.promocion || 'Sin Promo'}</span>
                                <button onClick={() => setInlineEdit({ type: 'version', id: v.id, field: 'promocion', value: v.promocion || '' })} className="text-[#00BFFF] opacity-50 group-hover:opacity-100 text-[11px]" title="Editar promo">✏️</button>
                              </div>
                            )}
                          </td>

                          {/* Motor specs inline */}
                          <td className="p-3.5 border-r border-[#C0C0C0]/50">
                            {inlineEdit?.type === 'version' && inlineEdit?.id === v.id && inlineEdit?.field === 'motor' ? (
                              <div className="flex items-center gap-1">
                                <input type="text" className="border border-[#00BFFF] p-1 text-xs bg-white w-32 focus:outline-none" value={inlineEdit.value} onChange={e => setInlineEdit({ ...inlineEdit, value: e.target.value })} autoFocus onKeyDown={e => { if (e.key === 'Enter') handleInlineSave(); if (e.key === 'Escape') setInlineEdit(null); }} />
                                <button onClick={handleInlineSave} className="bg-[#1E8E3E] text-white px-2 py-1 text-[10px] font-bold">✓</button>
                                <button onClick={() => setInlineEdit(null)} className="bg-[#D93025] text-white px-2 py-1 text-[10px] font-bold">✕</button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <span className="font-bold text-[#0A1F33] block text-[10px]">{v.specs?.motor || 'Sin motor'}</span>
                                  <span className="text-[9px] text-[#C0C0C0] uppercase">{v.specs?.combustible || ''} {v.specs?.transmision ? `• ${v.specs.transmision}` : ''}</span>
                                </div>
                                <button onClick={() => setInlineEdit({ type: 'version', id: v.id, field: 'motor', value: v.specs?.motor || '' })} className="text-[#00BFFF] opacity-50 group-hover:opacity-100 text-[11px]" title="Editar motor">✏️</button>
                              </div>
                            )}
                          </td>

                          {/* URL Ficha Técnica inline */}
                          <td className="p-3.5 border-r border-[#C0C0C0]/50 max-w-[120px] truncate">
                            {inlineEdit?.type === 'version' && inlineEdit?.id === v.id && inlineEdit?.field === 'url_auto' ? (
                              <div className="flex items-center gap-1">
                                <input type="text" className="border border-[#00BFFF] p-1 text-xs bg-white w-32 focus:outline-none" value={inlineEdit.value} onChange={e => setInlineEdit({ ...inlineEdit, value: e.target.value })} autoFocus onKeyDown={e => { if (e.key === 'Enter') handleInlineSave(); if (e.key === 'Escape') setInlineEdit(null); }} />
                                <button onClick={handleInlineSave} className="bg-[#1E8E3E] text-white px-2 py-1 text-[10px] font-bold">✓</button>
                                <button onClick={() => setInlineEdit(null)} className="bg-[#D93025] text-white px-2 py-1 text-[10px] font-bold">✕</button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-2">
                                {v.url_auto ? <a href={v.url_auto} target="_blank" rel="noopener noreferrer" className="text-[#00BFFF] hover:underline text-[10px] truncate max-w-[90px] inline-block">Ver Ficha ↗</a> : <span className="text-[#C0C0C0] text-[10px]">Sin URL</span>}
                                <button onClick={() => setInlineEdit({ type: 'version', id: v.id, field: 'url_auto', value: v.url_auto || '' })} className="text-[#00BFFF] opacity-50 group-hover:opacity-100 text-[11px]" title="Editar URL">✏️</button>
                              </div>
                            )}
                          </td>

                          {/* Última Modificación */}
                          <td className="p-3.5 border-r border-[#C0C0C0]/50 bg-[#F8F9FA]/40 text-[10px] text-[#C0C0C0]">
                            <div className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#00BFFF] shrink-0"></span>
                              <span>{formatLastModified(v.updatedAt)}</span>
                            </div>
                          </td>

                          {/* Acciones */}
                          <td className="p-3.5 text-right bg-[#F8F9FA]/40 sticky right-0">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => triggerEditVersion(v)} className="border border-[#00BFFF] text-[#00BFFF] hover:bg-[#00BFFF] hover:text-[#FFFFFF] text-[9px] font-bold uppercase px-2.5 py-1 transition-colors" title="Editar ficha completa">
                                Ficha Completa ✏️
                              </button>
                              <button onClick={() => handleDeleteVersion(v.id, v.name)} className="border border-[#D93025] text-[#D93025] hover:bg-[#D93025] hover:text-[#FFFFFF] text-[9px] font-bold uppercase px-2.5 py-1 transition-colors" title="Borrar versión">
                                🗑️ Borrar
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------------ */}
            {/* SUB-VISTA: CUADRO DE MODELOS */}
            {/* ------------------------------------------------------------------ */}
            {invSubTab === 'modelos' && (
              <div className="bg-[#FFFFFF] border border-[#C0C0C0] flex flex-col min-h-[550px] shadow-none">
                <div className="p-4 bg-[#F5F5F5] border-b border-[#C0C0C0] flex flex-col lg:flex-row justify-between items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs uppercase tracking-widest text-[#0A1F33]">Modelos de tus Marcas</span>
                    <span className="text-[10px] bg-[#0A1F33] text-[#00BFFF] px-2.5 py-0.5 font-bold uppercase tracking-wider">{filteredModelos.length} de {permittedModels.length}</span>
                  </div>

                  <div className="flex flex-wrap gap-2 w-full lg:w-auto items-center">
                    {/* Filtro Marca */}
                    <div className="flex items-center gap-1 bg-[#FFFFFF] border border-[#C0C0C0] px-2 py-1">
                      <span className="text-[9px] font-bold text-[#C0C0C0] uppercase">Marca:</span>
                      <select 
                        className="text-[10px] font-bold uppercase tracking-widest focus:outline-none bg-transparent cursor-pointer"
                        value={invModFilterMarca} 
                        onChange={e => setInvModFilterMarca(e.target.value)}
                      >
                        <option value="Todas">Todas mis marcas ({permittedBrandsObjects.length})</option>
                        {permittedBrandsObjects.map(b => <option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>)}
                      </select>
                    </div>

                    {/* Buscador */}
                    <input 
                      type="text" 
                      placeholder="Buscar modelo..." 
                      className="border border-[#C0C0C0] px-3 py-1 text-xs w-full lg:w-44 focus:outline-none focus:border-[#0A1F33] bg-[#FFFFFF]" 
                      value={searchTermModelos} 
                      onChange={e => setSearchTermModelos(e.target.value)} 
                    />

                    <button 
                      onClick={openNewModeloModal}
                      className="bg-[#00BFFF] hover:bg-[#0A1F33] text-[#FFFFFF] text-[10px] font-bold uppercase tracking-widest px-4 py-2 transition-colors shrink-0 shadow-sm"
                    >
                      + Agregar Modelo
                    </button>
                  </div>
                </div>

                {/* TABLA / CUADRO MODELOS */}
                <div className="overflow-x-auto flex-grow custom-scrollbar">
                  <table className="w-full text-left border-collapse whitespace-nowrap min-w-[950px]">
                    <thead className="bg-[#FFFFFF] sticky top-0 z-10 border-b-2 border-[#0A1F33]">
                      <tr className="text-[9px] font-black text-[#0A1F33] uppercase tracking-widest">
                        <th className="p-3.5 border-r border-[#C0C0C0]/50 bg-[#F8F9FA]">Foto</th>
                        <th className="p-3.5 border-r border-[#C0C0C0]/50 bg-[#F8F9FA]">Marca</th>
                        <th className="p-3.5 border-r border-[#C0C0C0]/50">Nombre Modelo ✏️</th>
                        <th className="p-3.5 border-r border-[#C0C0C0]/50">Categoría ✏️</th>
                        <th className="p-3.5 border-r border-[#C0C0C0]/50">Origen Fábrica ✏️</th>
                        <th className="p-3.5 border-r border-[#C0C0C0]/50">Precio Inicial USD ✏️</th>
                        <th className="p-3.5 border-r border-[#C0C0C0]/50 bg-[#F8F9FA]">Última Modificación</th>
                        <th className="p-3.5 text-right bg-[#F8F9FA] sticky right-0">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="text-[11px] text-[#3A3A3C]">
                      {filteredModelos.length === 0 ? (
                        <tr><td colSpan={8} className="p-12 text-center text-[#C0C0C0] font-bold uppercase tracking-widest">No se encontraron modelos asignados a tus marcas.</td></tr>
                      ) : filteredModelos.map(m => {
                        const brandObj = marcasList.find(b => b.id === m.brandId);
                        const brandName = brandObj?.name || 'N/A';

                        return (
                          <tr key={m.id} className="border-b border-[#C0C0C0]/50 hover:bg-[#F5FBFF] transition-colors group">
                            <td className="p-3 border-r border-[#C0C0C0]/50 bg-[#F8F9FA]/40 w-16">
                              {isValidImageSrc(m.imgUrl) ? (
                                <Image src={m.imgUrl} alt={m.name} width={56} height={32} className="h-8 w-14 object-cover border border-[#C0C0C0]/50" unoptimized={!isOptimizableImageSrc(m.imgUrl)} />
                              ) : (
                                <div className="h-8 w-14 bg-[#F5F5F5] border border-[#C0C0C0]/50 flex items-center justify-center text-[8px] text-[#C0C0C0] uppercase font-bold">Sin Foto</div>
                              )}
                            </td>

                            <td className="p-3.5 font-bold uppercase border-r border-[#C0C0C0]/50 bg-[#F8F9FA]/40">
                              <span className="bg-[#0A1F33] text-[#FFFFFF] text-[9px] px-2 py-0.5 font-black uppercase tracking-wider">{brandName}</span>
                            </td>

                            {/* Nombre Modelo inline */}
                            <td className="p-3.5 border-r border-[#C0C0C0]/50 font-black text-[#0A1F33]">
                              {inlineEdit?.type === 'modelo' && inlineEdit?.id === m.id && inlineEdit?.field === 'name' ? (
                                <div className="flex items-center gap-1">
                                  <input type="text" className="border border-[#00BFFF] p-1 text-xs bg-white w-36 uppercase focus:outline-none font-bold" value={inlineEdit.value} onChange={e => setInlineEdit({ ...inlineEdit, value: e.target.value })} autoFocus onKeyDown={e => { if (e.key === 'Enter') handleInlineSave(); if (e.key === 'Escape') setInlineEdit(null); }} />
                                  <button onClick={handleInlineSave} className="bg-[#1E8E3E] text-white px-2 py-1 text-[10px] font-bold">✓</button>
                                  <button onClick={() => setInlineEdit(null)} className="bg-[#D93025] text-white px-2 py-1 text-[10px] font-bold">✕</button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between gap-2">
                                  <span>{m.name}</span>
                                  <button onClick={() => setInlineEdit({ type: 'modelo', id: m.id, field: 'name', value: m.name || '' })} className="text-[#00BFFF] opacity-50 group-hover:opacity-100 text-[11px]" title="Editar nombre">✏️</button>
                                </div>
                              )}
                            </td>

                            {/* Categoría inline */}
                            <td className="p-3.5 border-r border-[#C0C0C0]/50 font-bold uppercase text-[10px]">
                              {inlineEdit?.type === 'modelo' && inlineEdit?.id === m.id && inlineEdit?.field === 'tipo_carroceria' ? (
                                <div className="flex items-center gap-1">
                                  <input type="text" className="border border-[#00BFFF] p-1 text-xs bg-white w-28 uppercase focus:outline-none" value={inlineEdit.value} onChange={e => setInlineEdit({ ...inlineEdit, value: e.target.value })} autoFocus onKeyDown={e => { if (e.key === 'Enter') handleInlineSave(); if (e.key === 'Escape') setInlineEdit(null); }} />
                                  <button onClick={handleInlineSave} className="bg-[#1E8E3E] text-white px-2 py-1 text-[10px] font-bold">✓</button>
                                  <button onClick={() => setInlineEdit(null)} className="bg-[#D93025] text-white px-2 py-1 text-[10px] font-bold">✕</button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between gap-2">
                                  <span className="bg-[#F0F0F0] px-2 py-0.5 border border-[#C0C0C0]/50">{m.tipo_carroceria || 'SUV'}</span>
                                  <button onClick={() => setInlineEdit({ type: 'modelo', id: m.id, field: 'tipo_carroceria', value: m.tipo_carroceria || 'SUV' })} className="text-[#00BFFF] opacity-50 group-hover:opacity-100 text-[11px]" title="Editar categoría">✏️</button>
                                </div>
                              )}
                            </td>

                            {/* Origen inline */}
                            <td className="p-3.5 border-r border-[#C0C0C0]/50 text-[10px] uppercase">
                              {inlineEdit?.type === 'modelo' && inlineEdit?.id === m.id && inlineEdit?.field === 'origen' ? (
                                <div className="flex items-center gap-1">
                                  <input type="text" className="border border-[#00BFFF] p-1 text-xs bg-white w-28 uppercase focus:outline-none" value={inlineEdit.value} onChange={e => setInlineEdit({ ...inlineEdit, value: e.target.value })} autoFocus onKeyDown={e => { if (e.key === 'Enter') handleInlineSave(); if (e.key === 'Escape') setInlineEdit(null); }} />
                                  <button onClick={handleInlineSave} className="bg-[#1E8E3E] text-white px-2 py-1 text-[10px] font-bold">✓</button>
                                  <button onClick={() => setInlineEdit(null)} className="bg-[#D93025] text-white px-2 py-1 text-[10px] font-bold">✕</button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between gap-2">
                                  <span>{m.origen || '-'}</span>
                                  <button onClick={() => setInlineEdit({ type: 'modelo', id: m.id, field: 'origen', value: m.origen || '' })} className="text-[#00BFFF] opacity-50 group-hover:opacity-100 text-[11px]" title="Editar origen">✏️</button>
                                </div>
                              )}
                            </td>

                            {/* Precio Inicial inline */}
                            <td className="p-3.5 border-r border-[#C0C0C0]/50 font-black text-[#0A1F33]">
                              {inlineEdit?.type === 'modelo' && inlineEdit?.id === m.id && inlineEdit?.field === 'startingPrice' ? (
                                <div className="flex items-center gap-1">
                                  <input type="number" className="border border-[#00BFFF] p-1 text-xs bg-white w-28 focus:outline-none font-bold" value={inlineEdit.value} onChange={e => setInlineEdit({ ...inlineEdit, value: e.target.value })} autoFocus onKeyDown={e => { if (e.key === 'Enter') handleInlineSave(); if (e.key === 'Escape') setInlineEdit(null); }} />
                                  <button onClick={handleInlineSave} className="bg-[#1E8E3E] text-white px-2 py-1 text-[10px] font-bold">✓</button>
                                  <button onClick={() => setInlineEdit(null)} className="bg-[#D93025] text-white px-2 py-1 text-[10px] font-bold">✕</button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between gap-2">
                                  <span>US$ {Number(m.startingPrice || 0).toLocaleString()}</span>
                                  <button onClick={() => setInlineEdit({ type: 'modelo', id: m.id, field: 'startingPrice', value: String(m.startingPrice || 0) })} className="text-[#00BFFF] opacity-50 group-hover:opacity-100 text-[11px]" title="Editar precio base">✏️</button>
                                </div>
                              )}
                            </td>

                            {/* Última Modificación */}
                            <td className="p-3.5 border-r border-[#C0C0C0]/50 bg-[#F8F9FA]/40 text-[10px] text-[#C0C0C0]">
                              <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#00BFFF] shrink-0"></span>
                                <span>{formatLastModified(m.updatedAt)}</span>
                              </div>
                            </td>

                            {/* Acciones */}
                            <td className="p-3.5 text-right bg-[#F8F9FA]/40 sticky right-0">
                              <div className="flex items-center justify-end gap-2">
                                <button onClick={() => triggerEditModelo(m)} className="border border-[#00BFFF] text-[#00BFFF] hover:bg-[#00BFFF] hover:text-[#FFFFFF] text-[9px] font-bold uppercase px-2.5 py-1 transition-colors" title="Editar modelo y foto">
                                  Ficha Completa ✏️
                                </button>
                                <button onClick={() => handleDeleteModelo(m.id, m.name)} className="border border-[#D93025] text-[#D93025] hover:bg-[#D93025] hover:text-[#FFFFFF] text-[9px] font-bold uppercase px-2.5 py-1 transition-colors" title="Borrar modelo">
                                  🗑️ Borrar
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------------ */}
            {/* SUB-VISTA: CARGA MASIVA CSV */}
            {/* ------------------------------------------------------------------ */}
            {invSubTab === 'csv' && (
              <div className="bg-[#FFFFFF] border border-[#C0C0C0] flex flex-col h-fit">
                <div className="p-6 border-b border-[#C0C0C0] bg-[#F5F5F5]">
                  <h2 className="font-bold text-[#0A1F33] text-sm uppercase mb-2">Importador Masivo CSV (Protegido por Permisos)</h2>
                  <p className="text-[11px] text-[#3A3A3C] font-medium leading-relaxed mb-4">
                    Instrucciones de formato: Crea un archivo Excel o Google Sheets y expórtalo como <strong>CSV (delimitado por comas)</strong>. 
                    Asegúrate de incluir exactamente estos nombres en los encabezados (primera fila):<br/><br/>
                    <code className="bg-[#0A1F33] text-[#00BFFF] p-2 block text-[10px] font-mono">marca, modelo, version, precio, tipo_carroceria, motor, transmision, combustible</code>
                  </p>
                  <p className="text-[10px] font-bold text-[#D93025] uppercase tracking-widest border border-[#D93025] p-3 inline-block">
                    ⚠️ Seguridad B2B: El sistema verificará automáticamente la columna &quot;marca&quot;. Si incluyes marcas para las cuales no tienes permisos asignados, esas filas serán descartadas automáticamente. Tu inventario quedará vinculado a <strong>{userData.dealershipName}</strong>.
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

        {/* ======================================= */}
        {/* VISTA: REPORTES Y BUSINESS INTELLIGENCE */}
        {/* ======================================= */}
        {activeTab === 'reportes' && userData && (
          <DealershipReportsView
            userData={userData}
            userEmail={user?.email || ''}
            comparisonStatsList={comparisonStats}
            wizardStatsList={wizardStats}
            leadsList={leads}
            marcasList={marcasList}
            modelosList={modelosList}
            versionesList={allVersiones}
            onRequestAccess={handleRequestReportsAccess}
            isRequestingAccess={isRequestingReportsAccess}
          />
        )}
        
      </main>

      {/* ======================================================== */}
      {/* MODAL: EDICIÓN / CREACIÓN COMPLETA DE VERSIÓN */}
      {/* ======================================================== */}
      <Modal
        isOpen={versionModalOpen}
        onClose={() => setVersionModalOpen(false)}
        overlayClassName="fixed inset-0 bg-[#0A1F33]/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
        panelClassName="bg-[#FFFFFF] p-8 max-w-2xl w-full border-t-4 border-[#00BFFF] relative shadow-none max-h-[90vh] overflow-y-auto custom-scrollbar"
      >
        <button onClick={() => setVersionModalOpen(false)} className="absolute top-4 right-4 text-[#C0C0C0] hover:text-[#D93025] font-black text-lg border-none outline-none">✕</button>
        <h3 className="font-black text-xl text-[#0A1F33] uppercase mb-1" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
          {versionFormData.id ? 'Editar Ficha Completa de Versión' : 'Agregar Nueva Versión'}
        </h3>
        <p className="text-[10px] font-bold text-[#C0C0C0] uppercase tracking-widest mb-6">
          Concesionaria: <span className="text-[#0A1F33]">{userData.dealershipName}</span>
        </p>

        <form onSubmit={handleSaveVersionModal} className="flex flex-col gap-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="modal-version-modelId" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Modelo Vinculado <span className="text-[#D93025]">*</span></label>
              <select
                id="modal-version-modelId"
                className="w-full border border-[#C0C0C0] p-2.5 text-xs focus:outline-none focus:border-[#00BFFF] rounded-none bg-[#FFFFFF]"
                value={versionFormData.modelId}
                onChange={e => setVersionFormData({ ...versionFormData, modelId: e.target.value })}
                required
                disabled={Boolean(versionFormData.id)}
              >
                <option value="">Seleccionar modelo...</option>
                {permittedModels.map(m => (
                  <option key={m.id} value={m.id}>
                    {marcasList.find(b => b.id === m.brandId)?.name || ''} {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="modal-version-name" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Nombre de la Versión <span className="text-[#D93025]">*</span></label>
              <input
                id="modal-version-name"
                type="text"
                placeholder="Ej: 2.0 EX AT 4x4"
                className="w-full border border-[#C0C0C0] p-2.5 text-xs focus:outline-none focus:border-[#00BFFF] rounded-none bg-[#FFFFFF]"
                value={versionFormData.name}
                onChange={e => setVersionFormData({ ...versionFormData, name: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="modal-version-price" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Precio de Lista USD <span className="text-[#D93025]">*</span></label>
              <input
                id="modal-version-price"
                type="number"
                placeholder="Ej: 32500"
                className="w-full border border-[#C0C0C0] p-2.5 text-xs focus:outline-none focus:border-[#00BFFF] rounded-none bg-[#FFFFFF] font-bold"
                value={versionFormData.price}
                onChange={e => setVersionFormData({ ...versionFormData, price: e.target.value })}
                required
              />
            </div>

            <div>
              <label htmlFor="modal-version-promocion" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Promoción Especial / Bono</label>
              <input
                id="modal-version-promocion"
                type="text"
                placeholder="Ej: Bono USD 2.000 + Transferencia gratis"
                className="w-full border border-[#C0C0C0] p-2.5 text-xs focus:outline-none focus:border-[#00BFFF] rounded-none bg-[#FFFFFF]"
                value={versionFormData.promocion}
                onChange={e => setVersionFormData({ ...versionFormData, promocion: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 border-t border-[#C0C0C0]/50 pt-4">
            <div>
              <label htmlFor="modal-version-motor" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Motorización</label>
              <input
                id="modal-version-motor"
                type="text"
                placeholder="Ej: 2.0L Turbo 240 HP"
                className="w-full border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#00BFFF] rounded-none bg-[#FFFFFF]"
                value={versionFormData.motor}
                onChange={e => setVersionFormData({ ...versionFormData, motor: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="modal-version-transmision" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Transmisión</label>
              <input
                id="modal-version-transmision"
                type="text"
                placeholder="Ej: Automática 8 Velocidades"
                className="w-full border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#00BFFF] rounded-none bg-[#FFFFFF]"
                value={versionFormData.transmision}
                onChange={e => setVersionFormData({ ...versionFormData, transmision: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="modal-version-combustible" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Combustible</label>
              <select
                id="modal-version-combustible"
                className="w-full border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#00BFFF] rounded-none bg-[#FFFFFF]"
                value={versionFormData.combustible}
                onChange={e => setVersionFormData({ ...versionFormData, combustible: e.target.value })}
              >
                <option value="Nafta">Nafta</option>
                <option value="Diesel">Diesel</option>
                <option value="HEV">Híbrido Convencional (HEV)</option>
                <option value="PHEV">Híbrido Enchufable (PHEV)</option>
                <option value="MHEV">Microhíbrido (MHEV)</option>
                <option value="EV">100% Eléctrico (EV)</option>
                <option value="Flex">Flex / Etanol</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label htmlFor="modal-version-traccion" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Tracción</label>
              <input
                id="modal-version-traccion"
                type="text"
                placeholder="Ej: 4x4 / AWD"
                className="w-full border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#00BFFF] rounded-none bg-[#FFFFFF]"
                value={versionFormData.traccion}
                onChange={e => setVersionFormData({ ...versionFormData, traccion: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="modal-version-plazas" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Plazas</label>
              <input
                id="modal-version-plazas"
                type="number"
                placeholder="Ej: 5"
                className="w-full border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#00BFFF] rounded-none bg-[#FFFFFF]"
                value={versionFormData.plazas}
                onChange={e => setVersionFormData({ ...versionFormData, plazas: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="modal-version-airbags" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Airbags</label>
              <input
                id="modal-version-airbags"
                type="number"
                placeholder="Ej: 6"
                className="w-full border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#00BFFF] rounded-none bg-[#FFFFFF]"
                value={versionFormData.airbags}
                onChange={e => setVersionFormData({ ...versionFormData, airbags: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="modal-version-pantalla" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Pantalla (pulg.)</label>
              <input
                id="modal-version-pantalla"
                type="number"
                placeholder="Ej: 10.25"
                className="w-full border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#00BFFF] rounded-none bg-[#FFFFFF]"
                value={versionFormData.tamanho_pantalla}
                onChange={e => setVersionFormData({ ...versionFormData, tamanho_pantalla: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="modal-version-adas" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Asistencias ADAS (separadas por coma)</label>
              <input
                id="modal-version-adas"
                type="text"
                placeholder="Frenado Autónomo, Alerta Carril, Punto Ciego"
                className="w-full border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#00BFFF] rounded-none bg-[#FFFFFF]"
                value={versionFormData.adas}
                onChange={e => setVersionFormData({ ...versionFormData, adas: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="modal-version-garantia" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Garantía Oficial</label>
              <input
                id="modal-version-garantia"
                type="text"
                placeholder="Ej: 5 Años o 100.000 Km"
                className="w-full border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#00BFFF] rounded-none bg-[#FFFFFF]"
                value={versionFormData.garantia}
                onChange={e => setVersionFormData({ ...versionFormData, garantia: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label htmlFor="modal-version-url" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">URL Ficha Técnica Oficial (PDF o web)</label>
            <input
              id="modal-version-url"
              type="url"
              placeholder="https://..."
              className="w-full border border-[#C0C0C0] p-2.5 text-xs focus:outline-none focus:border-[#00BFFF] rounded-none bg-[#FFFFFF]"
              value={versionFormData.url_auto}
              onChange={e => setVersionFormData({ ...versionFormData, url_auto: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-3 mt-4 border-t border-[#C0C0C0]/50 pt-4">
            <button
              type="button"
              onClick={() => setVersionModalOpen(false)}
              className="border border-[#C0C0C0] text-[#3A3A3C] hover:border-[#0A1F33] text-xs font-bold uppercase tracking-wider py-3 px-6 transition-colors rounded-none"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="bg-[#00BFFF] hover:bg-[#0A1F33] text-[#FFFFFF] text-xs font-bold uppercase tracking-widest py-3 px-8 transition-colors rounded-none shadow-sm"
            >
              Guardar Versión
            </button>
          </div>
        </form>
      </Modal>

      {/* ======================================================== */}
      {/* MODAL: EDICIÓN / CREACIÓN COMPLETA DE MODELO */}
      {/* ======================================================== */}
      <Modal
        isOpen={modeloModalOpen}
        onClose={() => setModeloModalOpen(false)}
        overlayClassName="fixed inset-0 bg-[#0A1F33]/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
        panelClassName="bg-[#FFFFFF] p-8 max-w-xl w-full border-t-4 border-[#0A1F33] relative shadow-none max-h-[90vh] overflow-y-auto custom-scrollbar"
      >
        <button onClick={() => setModeloModalOpen(false)} className="absolute top-4 right-4 text-[#C0C0C0] hover:text-[#D93025] font-black text-lg border-none outline-none">✕</button>
        <h3 className="font-black text-xl text-[#0A1F33] uppercase mb-1" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
          {modeloFormData.id ? 'Editar Ficha de Modelo' : 'Crear Nuevo Modelo'}
        </h3>
        <p className="text-[10px] font-bold text-[#C0C0C0] uppercase tracking-widest mb-6">
          Gestión de catálogo de marcas autorizadas
        </p>

        <form onSubmit={handleSaveModeloModal} className="flex flex-col gap-4 text-xs">
          <div>
            <label htmlFor="modal-modelo-brandId" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Marca Autorizada <span className="text-[#D93025]">*</span></label>
            <select
              id="modal-modelo-brandId"
              className="w-full border border-[#C0C0C0] p-2.5 text-xs focus:outline-none focus:border-[#0A1F33] rounded-none bg-[#FFFFFF]"
              value={modeloFormData.brandId}
              onChange={e => setModeloFormData({ ...modeloFormData, brandId: e.target.value })}
              required
              disabled={Boolean(modeloFormData.id)}
            >
              <option value="">Seleccionar marca autorizada...</option>
              {permittedBrandsObjects.map(b => (
                <option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="modal-modelo-name" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Nombre del Modelo <span className="text-[#D93025]">*</span></label>
            <input
              id="modal-modelo-name"
              type="text"
              placeholder="Ej: SPORTAGE"
              className="w-full border border-[#C0C0C0] p-2.5 text-xs focus:outline-none focus:border-[#0A1F33] rounded-none bg-[#FFFFFF] uppercase font-bold"
              value={modeloFormData.name}
              onChange={e => setModeloFormData({ ...modeloFormData, name: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="modal-modelo-carroceria" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Categoría / Carrocería</label>
              <select
                id="modal-modelo-carroceria"
                className="w-full border border-[#C0C0C0] p-2.5 text-xs focus:outline-none focus:border-[#0A1F33] rounded-none bg-[#FFFFFF]"
                value={modeloFormData.tipo_carroceria}
                onChange={e => setModeloFormData({ ...modeloFormData, tipo_carroceria: e.target.value })}
              >
                <option value="SUV">SUV</option>
                <option value="SEDAN">SEDAN</option>
                <option value="HATCHBACK">HATCHBACK</option>
                <option value="PICKUP">PICKUP</option>
                <option value="UTILITARIO">UTILITARIO</option>
                <option value="COUPE">COUPE</option>
                <option value="MINIVAN">MINIVAN</option>
              </select>
            </div>

            <div>
              <label htmlFor="modal-modelo-origen" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Origen de Fabricación</label>
              <input
                id="modal-modelo-origen"
                type="text"
                placeholder="Ej: Corea del Sur, Brasil, México"
                className="w-full border border-[#C0C0C0] p-2.5 text-xs focus:outline-none focus:border-[#0A1F33] rounded-none bg-[#FFFFFF]"
                value={modeloFormData.origen}
                onChange={e => setModeloFormData({ ...modeloFormData, origen: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label htmlFor="modal-modelo-startingPrice" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Precio Desde (USD)</label>
            <input
              id="modal-modelo-startingPrice"
              type="number"
              placeholder="Ej: 28500"
              className="w-full border border-[#C0C0C0] p-2.5 text-xs focus:outline-none focus:border-[#0A1F33] rounded-none bg-[#FFFFFF] font-bold"
              value={modeloFormData.startingPrice}
              onChange={e => setModeloFormData({ ...modeloFormData, startingPrice: e.target.value })}
            />
          </div>

          {/* Subida o Cambio de Imagen */}
          <div className="border-t border-[#C0C0C0]/50 pt-4">
            <ImageUploadField
              label="Foto del Modelo"
              folder="models"
              value={modeloFormData.imgUrl}
              onChange={url => setModeloFormData({ ...modeloFormData, imgUrl: url })}
            />
          </div>

          <div className="flex justify-end gap-3 mt-4 border-t border-[#C0C0C0]/50 pt-4">
            <button
              type="button"
              onClick={() => setModeloModalOpen(false)}
              className="border border-[#C0C0C0] text-[#3A3A3C] hover:border-[#0A1F33] text-xs font-bold uppercase tracking-wider py-3 px-6 transition-colors rounded-none"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="bg-[#0A1F33] hover:bg-[#00BFFF] text-[#FFFFFF] text-xs font-bold uppercase tracking-widest py-3 px-8 transition-colors rounded-none shadow-sm"
            >
              Guardar Modelo
            </button>
          </div>
        </form>
      </Modal>

    </div>
  );
}