// este es app/admin/page.tsx
'use client';

import React, { useState, useEffect, useMemo, useCallback, useId } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { collection, getDocs, doc, setDoc, getDoc, deleteDoc, writeBatch, serverTimestamp, query, orderBy, updateDoc, limit, QuerySnapshot, DocumentData } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from '../../lib/firebase';
import { generarSlug } from '../../lib/slug';
import { parseCSVRow } from '../../lib/csv';
import { normalizeCarroceria } from '../../lib/carroceria';
import { normalizeCombustible, combustibleLabel } from '../../lib/combustible';
import { signOut, onAuthStateChanged, User } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { isOptimizableImageSrc, isValidImageSrc } from '../../lib/imageSrc';
import { buildCheckedDealershipSet, isDatacarCheck } from '../../lib/datacarCheck';
import { invalidateCatalogCache } from '../../lib/catalogCache';
import { useToast } from '../context/ToastContext';
import { DEFAULT_REELS } from '../components/InstagramReelsSection';
import { sendNewsletterBroadcast } from '../../lib/mailer';

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
  preferencias_wizard?: any;
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

export default function AdminDashboardPage() {
  const router = useRouter();
  const { showToast } = useToast();

  // ==========================================
  // ESTADOS DE AUTENTICACIÓN Y SEGURIDAD
  // ==========================================
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [adminUser, setAdminUser] = useState<User | null>(null);

  // Pestañas del Sistema
  const [activeTab, setActiveTab] = useState<'dashboard' | 'marcas' | 'modelos' | 'versiones' | 'concesionarias' | 'inyector' | 'ads' | 'slider_home' | 'financiero' | 'accesos' | 'analitica' | 'blog' | 'newsletter'>('dashboard');
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
  const [comparisonStatsList, setComparisonStatsList] = useState<any[]>([]);
  const [blogPostsList, setBlogPostsList] = useState<any[]>([]);
  const [videoReviewsList, setVideoReviewsList] = useState<any[]>([]);
  const [blogSubTab, setBlogSubTab] = useState<'posts' | 'videos'>('posts');

  // Estados Newsletter & Telemetría Recomendador
  const [newsletterSubscribers, setNewsletterSubscribers] = useState<Array<{ id: string; email: string; origen: string; estado: string; colName: string; createdAt?: any }>>([]);
  const [wizardStatsList, setWizardStatsList] = useState<any[]>([]);
  const [broadcastForm, setBroadcastForm] = useState({
    subject: '',
    headline: '',
    contentHtml: '',
    buttonText: '',
    buttonUrl: '',
    sendTestEmail: 'aldo.ojeda@datacarpy.com',
  });
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastStatus, setBroadcastStatus] = useState<{ type: 'idle' | 'success' | 'error'; message: string; previewUrl?: string; destinatariosCount?: number } | null>(null);
  const [subscriberSearch, setSubscriberSearch] = useState('');
  const [subscriberFilterStatus, setSubscriberFilterStatus] = useState<'Todos' | 'Activo' | 'Inactivo'>('Todos');
  const [showAddSubModal, setShowAddSubModal] = useState(false);
  const [newSubEmail, setNewSubEmail] = useState('');
  const [newSubOrigen, setNewSubOrigen] = useState('Admin Manual');

  // Formularios de Blog y Videos
  const [blogPostForm, setBlogPostForm] = useState({
    id: '',
    title: '',
    slug: '',
    category: 'Guías de Compra',
    excerpt: '',
    content: '',
    coverImage: '',
    author: 'Redacción DATACAR',
    published: true,
    readTimeMinutes: 4,
  });

  const [videoReviewForm, setVideoReviewForm] = useState({
    id: '',
    title: '',
    url: 'https://www.instagram.com/datacarpy/',
    thumbnail: '',
    tag: 'Reel IG',
    order: 1,
  });
  
  // Filtros Analítica de Comparaciones y Telemetría de Preferencias (por defecto 'Todas'/'Todos' para ver el 100%)
  const [filterCompBrand, setFilterCompBrand] = useState('Todas');
  const [filterCompModel, setFilterCompModel] = useState('Todos');
  const [filterCompCarroceria, setFilterCompCarroceria] = useState('Todas');
  const [filterCompCombustible, setFilterCompCombustible] = useState('Todos');
  const [filterCompOrigen, setFilterCompOrigen] = useState('Todos');
  const [filterCompDateFrom, setFilterCompDateFrom] = useState('');
  const [filterCompDateTo, setFilterCompDateTo] = useState('');
  // Filtros adicionales específicos dentro de Telemetría de Preferencias (sincronizados o refinables)
  const [filterPrefCarroceria, setFilterPrefCarroceria] = useState('Todas');
  const [filterPrefCombustible, setFilterPrefCombustible] = useState('Todos');
  const [filterPrefOrigen, setFilterPrefOrigen] = useState('Todos');

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
  const [concesionariaForm, setConcesionariaForm] = useState({ id: '', name: '', email_gerencia: '', status: 'active', datacarCheck: false });

  // Estados de Filtros para Cuadros ABM
  const [abmVerFilterMarca, setAbmVerFilterMarca] = useState('Todas');
  const [abmVerFilterModelo, setAbmVerFilterModelo] = useState('Todos');
  const [abmVerFilterDealer, setAbmVerFilterDealer] = useState('Todas');
  const [abmModelFilterMarca, setAbmModelFilterMarca] = useState('Todas');
  const [abmModelFilterCarroceria, setAbmModelFilterCarroceria] = useState('Todas');
  const [abmMarcaFilterOrigen, setAbmMarcaFilterOrigen] = useState('Todos');
  const [abmConcFilterStatus, setAbmConcFilterStatus] = useState('Todos');
  const [abmConcFilterCheck, setAbmConcFilterCheck] = useState('Todos');

  // Modal ABM (Crear / Editar Completo)
  const [abmModalType, setAbmModalType] = useState<'marcas' | 'modelos' | 'versiones' | 'concesionarias' | null>(null);

  // Edición Inline por Columna con Lápiz (✏️)
  const [adminInlineEdit, setAdminInlineEdit] = useState<{
    type: 'version' | 'modelo' | 'marca' | 'concesionaria';
    id: string;
    field: string;
    value: string;
  } | null>(null);

  // FORMULARIO DE ACCESOS B2B
  const [userB2BForm, setUserB2BForm] = useState<{ uid: string, email: string, dealershipName: string, marcasPermitidas: string[] }>({
    uid: '', email: '', dealershipName: '', marcasPermitidas: []
  });

  // FORMULARIO DE ACCESOS ADMIN (Staff Interno / Socios)
  const [adminAccessForm, setAdminAccessForm] = useState({ uid: '', email: '' });

  // FORMULARIO DE ADS (5 Espacios Publicitarios)
  const [adForm, setAdForm] = useState({ 
    id: '',
    sponsor: '', headline: '', highlight: '', price: '', link: '', img: '', 
    location: 'home', targetCategory: 'Todas', targetCombustible: 'Todas', modelId: '', startDate: '', endDate: '',
    ctaEnabled: false, ctaText: '', ctaUrl: '', ctaColor: '#00BFFF'
  });
  const [adModelFilterConcesionaria, setAdModelFilterConcesionaria] = useState('Todas');
  const [adModelFilterMarca, setAdModelFilterMarca] = useState('Todas');
  const [adVaultFilterLocation, setAdVaultFilterLocation] = useState('todos');

  // CONFIGURACIÓN DE SLIDER HOME (Hasta 3 modelos destacados + 2 sugerencias de ubicación)
  const [homeSliderConfig, setHomeSliderConfig] = useState<{
    enabled: boolean;
    activeVariant: 'sugerencia_1' | 'sugerencia_2' | 'ambas';
    slides: Array<{
      id: string;
      modelId: string;
      badgeText: string;
      customText: string;
      ctaText: string;
      ctaAction: 'cotizar' | 'ficha' | 'url';
      ctaUrl: string;
      isActive: boolean;
      order: number;
    }>;
  }>({
    enabled: true,
    activeVariant: 'ambas',
    slides: [],
  });
  const [sliderSlideForm, setSliderSlideForm] = useState<{
    id: string;
    modelId: string;
    badgeText: string;
    customText: string;
    ctaText: string;
    ctaAction: 'cotizar' | 'ficha' | 'url';
    ctaUrl: string;
    isActive: boolean;
  }>({
    id: '',
    modelId: '',
    badgeText: 'Destacado del Mes',
    customText: '',
    ctaText: 'Solicitar Cotización Directa',
    ctaAction: 'cotizar',
    ctaUrl: '',
    isActive: true,
  });
  const [sliderFilterConcesionaria, setSliderFilterConcesionaria] = useState('Todas');
  const [sliderFilterMarca, setSliderFilterMarca] = useState('Todas');
  
  const [finForm, setFinForm] = useState({ tasa_anual: 0.09, gastos_admin: 0.022, seguro_vida: 0.005 });

  // Inyector CSV
  const [csvData, setCsvData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);

  // Filtros Dashboard: Por defecto, los últimos 30 días según requerimiento
  const [filterDateFrom, setFilterDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });
  const [filterDateTo, setFilterDateTo] = useState(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });
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
      // Sin limitación artificial en leads ni en comparaciones para disponer del 100% de datos
      const qLeads = query(collection(db, 'leads'), orderBy('createdAt', 'desc'));
      const qReqs = query(collection(db, 'dealership_requests'), orderBy('createdAt', 'desc'), limit(50));
      const qBlog = query(collection(db, 'blog_posts'), limit(50));
      const qVideos = query(collection(db, 'video_reviews'), limit(20));

      // Carga resiliente por colección: un fallo puntual en una sub-colección nunca bloquea el panel central
      const safeFetch = async (queryOrCol: any, name: string): Promise<QuerySnapshot<DocumentData, DocumentData>> => {
        try {
          return await getDocs(queryOrCol);
        } catch (err: any) {
          console.warn(`Aviso de lectura en ${name}:`, err);
          return { docs: [] } as unknown as QuerySnapshot<DocumentData, DocumentData>;
        }
      };

      const [bSnap, mSnap, vSnap, adSnap, leadsSnap, cSnap, usersSnap, reqsSnap, compSnap, blogSnap, videosSnap, newsSnap, newsSubSnap, wizSnap, sliderSnap] = await Promise.all([
        safeFetch(collection(db, 'brands'), 'brands'),
        safeFetch(collection(db, 'models'), 'models'),
        safeFetch(collection(db, 'versions'), 'versions'),
        safeFetch(collection(db, 'campaigns'), 'campaigns'),
        safeFetch(qLeads, 'leads'),
        safeFetch(collection(db, 'concesionarias'), 'concesionarias'),
        safeFetch(collection(db, 'users'), 'users'),
        safeFetch(qReqs, 'dealership_requests'),
        safeFetch(collection(db, 'comparison_stats'), 'comparison_stats'),
        safeFetch(qBlog, 'blog_posts'),
        safeFetch(qVideos, 'video_reviews'),
        safeFetch(collection(db, 'newsletter'), 'newsletter'),
        safeFetch(collection(db, 'newsletter_subscribers'), 'newsletter_subscribers'),
        safeFetch(collection(db, 'wizard_stats'), 'wizard_stats'),
        getDoc(doc(db, 'config', 'home_slider')).catch(() => null),
      ]);
      
      setMarcasList(bSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setModelosList(mSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setVersionesList(vSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setCampaignsList(adSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setConcesionariasList(cSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setComparisonStatsList(compSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setBlogPostsList(blogSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setVideoReviewsList(videosSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      if (sliderSnap && sliderSnap.exists()) {
        const sData = sliderSnap.data();
        setHomeSliderConfig({
          enabled: sData.enabled !== false,
          activeVariant: sData.activeVariant || 'ambas',
          slides: Array.isArray(sData.slides) ? sData.slides.slice(0, 3) : [],
        });
      }
      
      // Accesos B2B y Admins
      setUsuariosSistemaList(usersSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setSolicitudesList(reqsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      // Procesar suscriptores de newsletter deduplicados por email (consultando ambas colecciones)
      const subsMap = new Map<string, any>();
      newsSubSnap.docs.forEach(docSnap => {
        const d = docSnap.data();
        const em = (d.email || '').toLowerCase().trim();
        if (em) {
          subsMap.set(em, {
            id: docSnap.id,
            colName: 'newsletter_subscribers',
            email: em,
            origen: d.origen || 'Footer Web',
            estado: d.estado || 'Activo',
            createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : (d.createdAt ? new Date(d.createdAt) : new Date())
          });
        }
      });
      newsSnap.docs.forEach(docSnap => {
        const d = docSnap.data();
        const em = (d.email || '').toLowerCase().trim();
        if (em && !subsMap.has(em)) {
          subsMap.set(em, {
            id: docSnap.id,
            colName: 'newsletter',
            email: em,
            origen: d.origen || 'Portal DATACAR',
            estado: d.estado || 'Activo',
            createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : (d.createdAt ? new Date(d.createdAt) : new Date())
          });
        }
      });
      setNewsletterSubscribers(Array.from(subsMap.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));

      // Telemetría del Recomendador
      setWizardStatsList(wizSnap.docs.map(d => ({ id: d.id, ...d.data() })));

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
          preferencias_wizard: data.preferencias_wizard || null,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt ? new Date(data.createdAt) : new Date())
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
          const userEm = currentUser.email?.toLowerCase().trim() || '';
          const isCoreAdminEmail = [
            'aldojeda92@gmail.com',
            'adairojeda.adm@gmail.com',
            'antoninovazquezjara@gmail.com',
            'aldo.ojeda@datacarpy.com'
          ].includes(userEm) || userEm.endsWith('@datacarpy.com');
          
          let isAuthorized = false;
          try {
            const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
            if (userDoc.exists() && userDoc.data().role === 'admin') {
              isAuthorized = true;
            } else if (isCoreAdminEmail) {
              // Si el doc con este UID no existía, se crea/sincroniza en Firestore
              await setDoc(doc(db, 'users', currentUser.uid), {
                email: currentUser.email,
                role: 'admin',
                dealershipName: 'DATACAR CENTRAL',
                marcasPermitidas: ['ALL'],
                updatedAt: serverTimestamp()
              }, { merge: true });
              isAuthorized = true;
            }
          } catch (docErr) {
            console.warn("Validación por doc users tuvo excepción, evaluando email:", docErr);
            if (isCoreAdminEmail) {
              isAuthorized = true;
            }
          }

          if (isAuthorized) {
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

  // Tipos de movilidad (combustible) para el espacio 3: Catálogo Filtros
  const combustiblesUnicos = useMemo(() => {
    const base = ['EV', 'PHEV', 'HEV', 'MHEV', 'NAFTA', 'DIESEL', 'FLEX', 'REEV'];
    const fromVersions = versionesList
      .map(v => normalizeCombustible(v.specs?.combustible))
      .filter(Boolean);
    return Array.from(new Set([...base, ...fromVersions]));
  }, [versionesList]);

  // Filtros en cascada para el espacio 5: Comparador (Concesionaria -> Marca -> Modelo)
  const concesionariasParaAds = useMemo(() => {
    const fromCol = concesionariasList.map(c => (c.name || '').trim().toUpperCase()).filter(Boolean);
    const fromVers = versionesList.map(v => (v.concesionaria || '').trim().toUpperCase()).filter(Boolean);
    return Array.from(new Set([...fromCol, ...fromVers])).sort();
  }, [concesionariasList, versionesList]);

  const marcasParaAds = useMemo(() => {
    const sortedMarcas = [...marcasList].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    if (adModelFilterConcesionaria === 'Todas') return sortedMarcas;
    const modelIdsOfDealer = new Set(
      versionesList
        .filter(v => (v.concesionaria || '').trim().toUpperCase() === adModelFilterConcesionaria.toUpperCase())
        .map(v => v.modelId)
    );
    const brandIdsOfDealer = new Set(
      modelosList.filter(m => modelIdsOfDealer.has(m.id)).map(m => m.brandId)
    );
    return sortedMarcas.filter(b => brandIdsOfDealer.has(b.id));
  }, [marcasList, modelosList, versionesList, adModelFilterConcesionaria]);

  const modelosParaAds = useMemo(() => {
    let list = [...modelosList];
    if (adModelFilterConcesionaria !== 'Todas') {
      const modelIdsOfDealer = new Set(
        versionesList
          .filter(v => (v.concesionaria || '').trim().toUpperCase() === adModelFilterConcesionaria.toUpperCase())
          .map(v => v.modelId)
      );
      list = list.filter(m => modelIdsOfDealer.has(m.id));
    }
    if (adModelFilterMarca !== 'Todas') {
      list = list.filter(m => m.brandId === adModelFilterMarca);
    }
    return list.sort((a, b) => {
      const brandA = marcasList.find(br => br.id === a.brandId)?.name || '';
      const brandB = marcasList.find(br => br.id === b.brandId)?.name || '';
      return `${brandA} ${a.name}`.localeCompare(`${brandB} ${b.name}`);
    });
  }, [modelosList, versionesList, marcasList, adModelFilterConcesionaria, adModelFilterMarca]);

  // Marcas correspondientes a la concesionaria seleccionada en Accesos B2B (Regla E)
  const marcasParaConcesionariaB2B = useMemo(() => {
    if (!userB2BForm.dealershipName) return [];
    const dealerNorm = userB2BForm.dealershipName.trim().toUpperCase();
    
    // 1. Marcas vinculadas por versiones en inventario
    const modelIdsOfDealer = new Set(
      versionesList
        .filter(v => (v.concesionaria || '').trim().toUpperCase() === dealerNorm)
        .map(v => v.modelId)
    );
    const brandIdsOfDealer = new Set(
      modelosList.filter(m => modelIdsOfDealer.has(m.id)).map(m => m.brandId)
    );

    // 2. Marcas en usuarios existentes de esta concesionaria
    const brandsFromUsers = new Set<string>();
    usuariosSistemaList.filter((u: any) => (u.dealershipName || '').trim().toUpperCase() === dealerNorm).forEach((u: any) => {
      let mList = u.marcasPermitidas;
      if (typeof mList === 'string') {
        try { mList = JSON.parse(mList); } catch { mList = mList.split(','); }
      }
      if (Array.isArray(mList)) mList.forEach((m: string) => brandsFromUsers.add(m.trim().toUpperCase()));
    });

    const filtered = marcasList.filter(b => {
      const bNameUpper = (b.name || '').trim().toUpperCase();
      return brandIdsOfDealer.has(b.id) || brandsFromUsers.has(bNameUpper);
    });

    if (filtered.length === 0) return marcasList;
    return filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [userB2BForm.dealershipName, versionesList, modelosList, marcasList, usuariosSistemaList]);

  // Modelos en cascada para filtro de versiones en ABM
  const modelosParaFiltroVersiones = useMemo(() => {
    if (abmVerFilterMarca === 'Todas') return modelosList;
    return modelosList.filter(m => m.brandId === abmVerFilterMarca);
  }, [modelosList, abmVerFilterMarca]);

  // Filtros en cascada para el Slider Home (Concesionaria -> Marca -> Modelo)
  const marcasParaSlider = useMemo(() => {
    const sortedMarcas = [...marcasList].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    if (sliderFilterConcesionaria === 'Todas') return sortedMarcas;
    const modelIdsOfDealer = new Set(
      versionesList
        .filter(v => (v.concesionaria || '').trim().toUpperCase() === sliderFilterConcesionaria.toUpperCase())
        .map(v => v.modelId)
    );
    const brandIdsOfDealer = new Set(
      modelosList.filter(m => modelIdsOfDealer.has(m.id)).map(m => m.brandId)
    );
    return sortedMarcas.filter(b => brandIdsOfDealer.has(b.id));
  }, [marcasList, modelosList, versionesList, sliderFilterConcesionaria]);

  const modelosParaSlider = useMemo(() => {
    let list = [...modelosList];
    if (sliderFilterConcesionaria !== 'Todas') {
      const modelIdsOfDealer = new Set(
        versionesList
          .filter(v => (v.concesionaria || '').trim().toUpperCase() === sliderFilterConcesionaria.toUpperCase())
          .map(v => v.modelId)
      );
      list = list.filter(m => modelIdsOfDealer.has(m.id));
    }
    if (sliderFilterMarca !== 'Todas') {
      list = list.filter(m => m.brandId === sliderFilterMarca);
    }
    return list.sort((a, b) => {
      const brandA = marcasList.find(br => br.id === a.brandId)?.name || '';
      const brandB = marcasList.find(br => br.id === b.brandId)?.name || '';
      return `${brandA} ${a.name}`.localeCompare(`${brandB} ${b.name}`);
    });
  }, [modelosList, versionesList, marcasList, sliderFilterConcesionaria, sliderFilterMarca]);

  // Orígenes únicos de marcas para filtro ABM Marcas
  const origenesMarcasUnicos = useMemo(() => {
    const s = new Set<string>();
    marcasList.forEach(m => {
      if (m.origen_marca && m.origen_marca.trim()) s.add(m.origen_marca.trim());
    });
    return Array.from(s).sort();
  }, [marcasList]);

  // Concesionarias únicas para filtro ABM Versiones
  const concesionariasUnicasVersiones = useMemo(() => {
    const s = new Set<string>();
    versionesList.forEach(v => {
      if (v.concesionaria && v.concesionaria.trim()) s.add(v.concesionaria.trim().toUpperCase());
    });
    concesionariasList.forEach(c => {
      if (c.name && c.name.trim()) s.add(c.name.trim().toUpperCase());
    });
    return Array.from(s).sort();
  }, [versionesList, concesionariasList]);

  // Mapa de marcas asociadas a cada concesionaria por inventario
  const concBrandsMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    versionesList.forEach(v => {
      const conc = (v.concesionaria || '').trim().toUpperCase();
      if (!conc) return;
      const m = modelosList.find(mod => mod.id === v.modelId);
      const b = m ? marcasList.find(br => br.id === m.brandId) : null;
      if (b) {
        if (!map.has(conc)) map.set(conc, new Set());
        map.get(conc)!.add(b.name);
      }
    });
    return map;
  }, [versionesList, modelosList, marcasList]);

  const setDatePreset = (preset: '7d' | '30d' | '90d' | 'year' | 'all') => {
    const today = new Date();
    const formatYMD = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    if (preset === 'all') {
      setFilterDateFrom('');
      setFilterDateTo('');
      return;
    }

    setFilterDateTo(formatYMD(today));

    if (preset === '7d') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      setFilterDateFrom(formatYMD(d));
    } else if (preset === '30d') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      setFilterDateFrom(formatYMD(d));
    } else if (preset === '90d') {
      const d = new Date();
      d.setDate(d.getDate() - 90);
      setFilterDateFrom(formatYMD(d));
    } else if (preset === 'year') {
      const d = new Date(today.getFullYear(), 0, 1);
      setFilterDateFrom(formatYMD(d));
    }
  };

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
      if (filterDateFrom) {
        const [y, m, d] = filterDateFrom.split('-').map(Number);
        const fromDate = new Date(y, m - 1, d, 0, 0, 0, 0);
        if (leadDate < fromDate.getTime()) return false;
      }
      if (filterDateTo) {
        const [y, m, d] = filterDateTo.split('-').map(Number);
        const toDate = new Date(y, m - 1, d, 23, 59, 59, 999);
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

  // Normalizador de Origen (país/región de marca o modelo)
  const normalizeOrigen = useCallback((raw: string | undefined | null): string => {
    const clean = (raw || '').trim().toUpperCase();
    if (!clean || clean === 'N/A' || clean === 'NO DEFINIDO') return 'NO ESPECIFICADO';
    if (clean.includes('CHIN')) return 'CHINA';
    if (clean.includes('JAP')) return 'JAPÓN';
    if (clean.includes('CORE') || clean.includes('KORE')) return 'COREA';
    if (clean.includes('BRAS') || clean.includes('BRAZ')) return 'BRASIL';
    if (clean.includes('ARGEN')) return 'ARGENTINA';
    if (clean.includes('EE.UU') || clean.includes('EEUU') || clean.includes('USA') || clean.includes('ESTADOS UNIDOS') || clean.includes('AMERIC')) return 'EE.UU.';
    if (clean.includes('ALEMAN') || clean.includes('GERMAN')) return 'ALEMANIA';
    if (clean.includes('MEX') || clean.includes('MÉX')) return 'MÉXICO';
    if (clean.includes('FRANC')) return 'FRANCIA';
    if (clean.includes('INDI')) return 'INDIA';
    if (clean.includes('REINO UNIDO') || clean.includes('INGL') || clean.includes('UK') || clean.includes('BRIT')) return 'REINO UNIDO';
    if (clean.includes('ITAL')) return 'ITALIA';
    if (clean.includes('SUEC')) return 'SUECIA';
    if (clean.includes('ESPAN') || clean.includes('ESPAÑ')) return 'ESPAÑA';
    if (clean.includes('TAILAND') || clean.includes('THAI')) return 'TAILANDIA';
    return clean;
  }, []);

  // Lista única de orígenes presentes en el catálogo
  const origenesAutosUnicos = useMemo(() => {
    const set = new Set<string>();
    modelosList.forEach(m => {
      if (m.origen) set.add(normalizeOrigen(m.origen));
    });
    marcasList.forEach(b => {
      if (b.origen_marca) set.add(normalizeOrigen(b.origen_marca));
    });
    set.delete('NO ESPECIFICADO');
    return Array.from(set).sort();
  }, [modelosList, marcasList, normalizeOrigen]);

  // Analítica Comparaciones: Modelos según marca seleccionada
  const compModelosParaSelect = useMemo(() => {
    if (filterCompBrand === 'Todas') return modelosList;
    return modelosList.filter(m => m.brandId === filterCompBrand);
  }, [modelosList, filterCompBrand]);

  // Enriquecimiento de cada registro de comparison_stats con metadatos completos y orden exacto de slots (Slot #1 = 1ra Elección)
  const enrichedComparisons = useMemo(() => {
    const brandsById = new Map<string, any>();
    marcasList.forEach(b => brandsById.set(b.id, b));

    const modelsById = new Map<string, any>();
    modelosList.forEach(m => modelsById.set(m.id, m));

    const versionsById = new Map<string, any>();
    const versionsByModelId = new Map<string, any[]>();
    versionesList.forEach(v => {
      versionsById.set(v.id, v);
      const arr = versionsByModelId.get(v.modelId) || [];
      arr.push(v);
      versionsByModelId.set(v.modelId, arr);
    });

    // Índice de modelos con nombre completo "MARCA MODELO" ordenado de más largo a más corto para matching exacto
    const modelCatalogEntries = modelosList.map(m => {
      const b = brandsById.get(m.brandId);
      const brandName = (b?.name || '').trim();
      const modelName = (m.name || '').trim();
      const fullName = `${brandName} ${modelName}`.trim();
      return {
        model: m,
        brand: b,
        brandName,
        modelName,
        fullUpper: fullName.toUpperCase(),
        modelUpper: modelName.toUpperCase(),
      };
    }).sort((a, b) => b.fullUpper.length - a.fullUpper.length);

    const buildVehicleMeta = (mod: any, brand: any, ver: any, slotIndex: number, fallbackLabel = '') => {
      const modelVersions = mod ? (versionsByModelId.get(mod.id) || []) : [];
      const primaryVer = ver || modelVersions.find(v => v.concesionaria || v.specs?.combustible) || modelVersions[0] || null;
      const brandName = (brand?.name || '').trim().toUpperCase();
      const modelName = (mod?.name || fallbackLabel || '').trim().toUpperCase();
      const carroceria = mod?.tipo_carroceria ? normalizeCarroceria(mod.tipo_carroceria) : 'SIN CLASIFICAR';
      const origen = normalizeOrigen(mod?.origen || brand?.origen_marca);
      const combustible = normalizeCombustible(primaryVer?.specs?.combustible) || 'NAFTA';
      const isNewEnergy = ['EV', 'PHEV', 'HEV', 'MHEV', 'REEV'].includes(combustible);
      const concesionaria = (primaryVer?.concesionaria || mod?.concesionaria || '').trim().toUpperCase() || 'SIN ASIGNAR';

      return {
        slotIndex, // 0 = Primer lugar (1ra elección en el comparador)
        versionId: primaryVer?.id || '',
        modelId: mod?.id || fallbackLabel,
        modelName: modelName || fallbackLabel,
        brandId: brand?.id || '',
        brandName: brandName || 'MARCA',
        fullName: brandName && modelName ? `${brandName} ${modelName}` : (fallbackLabel || modelName),
        carroceria,
        origen,
        combustible,
        isNewEnergy,
        concesionaria,
      };
    };

    return comparisonStatsList.map(comp => {
      const comboParts = (comp.combo || '')
        .split(/\s+vs\s+/i)
        .map((s: string) => s.trim())
        .filter(Boolean);

      const rawIds: string[] = Array.isArray(comp.slotIds)
        ? comp.slotIds
        : Array.isArray(comp.ids)
          ? comp.ids
          : typeof comp.ids === 'string'
            ? comp.ids.split(',').map((s: string) => s.trim()).filter(Boolean)
            : [];

      // Resolver los vehículos desde IDs
      const resolvedFromIds = rawIds.map(id => {
        const ver = versionsById.get(id);
        const mod = ver ? modelsById.get(ver.modelId) : modelsById.get(id);
        const brand = mod ? brandsById.get(mod.brandId) : null;
        return { id, ver, mod, brand };
      }).filter(item => item.mod);

      const usedIdIndices = new Set<number>();
      const orderedVehicles: ReturnType<typeof buildVehicleMeta>[] = [];

      if (comboParts.length > 0) {
        // comboParts SIEMPRE conserva el orden original de los slots ([Slot #1, Slot #2, Slot #3])
        comboParts.forEach((part: string, slotIdx: number) => {
          const partUpper = part.toUpperCase();

          // 1. Buscar primero entre los IDs de esta misma comparativa
          let matchedFromId: { ver: any; mod: any; brand: any } | null = null;
          for (let i = 0; i < resolvedFromIds.length; i++) {
            if (usedIdIndices.has(i)) continue;
            const candidate = resolvedFromIds[i];
            const candFull = `${candidate.brand?.name || ''} ${candidate.mod?.name || ''}`.trim().toUpperCase();
            const candMod = (candidate.mod?.name || '').trim().toUpperCase();
            if (candFull === partUpper || partUpper.includes(candFull) || candFull.includes(partUpper) || (candMod && partUpper.includes(candMod))) {
              matchedFromId = candidate;
              usedIdIndices.add(i);
              break;
            }
          }

          if (matchedFromId) {
            orderedVehicles.push(buildVehicleMeta(matchedFromId.mod, matchedFromId.brand, matchedFromId.ver, slotIdx, part));
            return;
          }

          // 2. Si no hubo match por ID, buscar en el catálogo de modelos por nombre
          const catalogMatch = modelCatalogEntries.find(
            entry =>
              entry.fullUpper === partUpper ||
              partUpper.includes(entry.fullUpper) ||
              entry.fullUpper.includes(partUpper) ||
              (entry.modelUpper.length >= 3 && partUpper.endsWith(entry.modelUpper))
          );

          if (catalogMatch) {
            orderedVehicles.push(buildVehicleMeta(catalogMatch.model, catalogMatch.brand, null, slotIdx, part));
          } else {
            orderedVehicles.push(buildVehicleMeta(null, null, null, slotIdx, part));
          }
        });
      } else if (resolvedFromIds.length > 0) {
        resolvedFromIds.forEach((item, slotIdx) => {
          orderedVehicles.push(buildVehicleMeta(item.mod, item.brand, item.ver, slotIdx));
        });
      }

      return {
        ...comp,
        vehicles: orderedVehicles,
      };
    });
  }, [comparisonStatsList, marcasList, modelosList, versionesList, normalizeOrigen]);

  // Filtrado reactivo de comparaciones (por Marca, Modelo, Carrocería, Motor, Origen y Fecha)
  const filteredComparisons = useMemo(() => {
    return enrichedComparisons.filter(comp => {
      const comboText = (comp.combo || '').toLowerCase();
      const vehs: any[] = comp.vehicles || [];

      // Filtro por marca
      if (filterCompBrand !== 'Todas') {
        const marcaObj = marcasList.find(m => m.id === filterCompBrand);
        const brandName = marcaObj?.name?.trim().toLowerCase() || '';
        const matchByVeh = vehs.some(v => v.brandId === filterCompBrand);
        const matchByText = brandName ? comboText.includes(brandName) : false;
        if (!matchByVeh && !matchByText) return false;
      }

      // Filtro por modelo
      if (filterCompModel !== 'Todos') {
        const modeloObj = modelosList.find(m => m.id === filterCompModel);
        const modelName = modeloObj?.name?.trim().toLowerCase() || '';
        const matchByVeh = vehs.some(v => v.modelId === filterCompModel);
        const matchByText = modelName ? comboText.includes(modelName) : false;
        if (!matchByVeh && !matchByText) return false;
      }

      // Filtro por carrocería
      if (filterCompCarroceria !== 'Todas') {
        if (!vehs.some(v => v.carroceria === filterCompCarroceria)) return false;
      }

      // Filtro por tipo de motor / energía
      if (filterCompCombustible !== 'Todos') {
        if (filterCompCombustible === 'NUEVAS_ENERGIAS') {
          if (!vehs.some(v => v.isNewEnergy)) return false;
        } else if (filterCompCombustible === 'COMBUSTION') {
          if (!vehs.some(v => !v.isNewEnergy)) return false;
        } else {
          if (!vehs.some(v => v.combustible === filterCompCombustible)) return false;
        }
      }

      // Filtro por origen
      if (filterCompOrigen !== 'Todos') {
        if (!vehs.some(v => v.origen === filterCompOrigen)) return false;
      }

      // Filtro por fecha (en horario local)
      if (filterCompDateFrom || filterCompDateTo) {
        let compTime: number | null = null;
        if (comp.timestamp?.toDate) {
          compTime = comp.timestamp.toDate().getTime();
        } else if (comp.timestamp) {
          compTime = new Date(comp.timestamp).getTime();
        } else if (comp.createdAt?.toDate) {
          compTime = comp.createdAt.toDate().getTime();
        } else if (comp.createdAt) {
          compTime = new Date(comp.createdAt).getTime();
        }

        if (compTime) {
          if (filterCompDateFrom) {
            const fromTime = new Date(`${filterCompDateFrom}T00:00:00`).getTime();
            if (compTime < fromTime) return false;
          }
          if (filterCompDateTo) {
            const toTime = new Date(`${filterCompDateTo}T23:59:59.999`).getTime();
            if (compTime > toTime) return false;
          }
        }
      }

      return true;
    });
  }, [
    enrichedComparisons,
    filterCompBrand,
    filterCompModel,
    filterCompCarroceria,
    filterCompCombustible,
    filterCompOrigen,
    filterCompDateFrom,
    filterCompDateTo,
    marcasList,
    modelosList,
  ]);

  const topComparisons = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredComparisons.forEach(c => {
      if (c.combo) {
        counts[c.combo] = (counts[c.combo] || 0) + 1;
      }
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [filteredComparisons]);

  const isCompFiltered =
    filterCompBrand !== 'Todas' ||
    filterCompModel !== 'Todos' ||
    filterCompCarroceria !== 'Todas' ||
    filterCompCombustible !== 'Todos' ||
    filterCompOrigen !== 'Todos' ||
    filterCompDateFrom !== '' ||
    filterCompDateTo !== '';

  // ==========================================
  // MÉTRICA DE "CONSIDERACIÓN" (SLOT #1 = PRIMERA ELECCIÓN)
  // ==========================================
  const considerationStats = useMemo(() => {
    const totalComps = filteredComparisons.length;
    const selectedModelObj = filterCompModel !== 'Todos' ? modelosList.find(m => m.id === filterCompModel) : null;
    const selectedBrandObj = filterCompBrand !== 'Todas' ? marcasList.find(b => b.id === filterCompBrand) : null;

    // Contabilizar por modelo cuántas veces aparece en total y cuántas veces fue elegido en el Slot #1 (índice 0)
    const modelStatsMap = new Map<string, { modelId: string; fullName: string; brandId: string; firstSlot: number; total: number }>();

    let focalFirstSlotCount = 0;
    let focalTotalCount = 0;

    filteredComparisons.forEach(comp => {
      const vehs: any[] = comp.vehicles || [];
      if (vehs.length === 0) return;

      // Evaluar si el modelo o marca focal ocupó el Slot #1 en esta comparativa
      if (selectedModelObj) {
        const modelNameUpper = (selectedModelObj.name || '').trim().toUpperCase();
        const isPresent = vehs.some(v => v.modelId === selectedModelObj.id || v.fullName.includes(modelNameUpper));
        if (isPresent) {
          focalTotalCount++;
          const firstV = vehs[0];
          if (firstV && (firstV.modelId === selectedModelObj.id || firstV.fullName.includes(modelNameUpper))) {
            focalFirstSlotCount++;
          }
        }
      } else if (selectedBrandObj) {
        const brandNameUpper = (selectedBrandObj.name || '').trim().toUpperCase();
        const isPresent = vehs.some(v => v.brandId === selectedBrandObj.id || v.brandName === brandNameUpper);
        if (isPresent) {
          focalTotalCount++;
          const firstV = vehs[0];
          if (firstV && (firstV.brandId === selectedBrandObj.id || firstV.brandName === brandNameUpper)) {
            focalFirstSlotCount++;
          }
        }
      }

      // Acumular ranking por modelo (filtrando por marca si hay una seleccionada)
      const seenInThisComp = new Set<string>();
      vehs.forEach((v, idx) => {
        if (!v.fullName) return;
        if (selectedBrandObj && v.brandId !== selectedBrandObj.id && v.brandName !== (selectedBrandObj.name || '').trim().toUpperCase()) {
          return;
        }
        const key = v.modelId || v.fullName;
        const curr = modelStatsMap.get(key) || {
          modelId: v.modelId,
          fullName: v.fullName,
          brandId: v.brandId,
          firstSlot: 0,
          total: 0,
        };
        if (!seenInThisComp.has(key)) {
          curr.total += 1;
          seenInThisComp.add(key);
        }
        if (idx === 0) {
          curr.firstSlot += 1;
        }
        modelStatsMap.set(key, curr);
      });
    });

    const ranking = Array.from(modelStatsMap.values())
      .sort((a, b) => b.firstSlot - a.firstSlot || b.total - a.total)
      .slice(0, 8)
      .map(item => ({
        ...item,
        pct: item.total > 0 ? Math.round((item.firstSlot / item.total) * 100) : 0,
      }));

    const focalPct = focalTotalCount > 0 ? Math.round((focalFirstSlotCount / focalTotalCount) * 100) : 0;
    const focalChallengerCount = Math.max(0, focalTotalCount - focalFirstSlotCount);

    return {
      hasFocalModel: Boolean(selectedModelObj),
      hasFocalBrand: Boolean(selectedBrandObj),
      focalLabel: selectedModelObj
        ? `${selectedBrandObj?.name || marcasList.find(b => b.id === selectedModelObj.brandId)?.name || ''} ${selectedModelObj.name}`.trim()
        : selectedBrandObj
          ? selectedBrandObj.name
          : 'Global (Todos los Modelos)',
      focalFirstSlotCount,
      focalChallengerCount,
      focalTotalCount: focalTotalCount || totalComps,
      focalPct,
      ranking,
    };
  }, [filteredComparisons, filterCompModel, filterCompBrand, modelosList, marcasList]);

  // ==========================================
  // ANALÍTICA GLOBAL Y COMPETITIVA (4 GRÁFICOS CIRCULARES)
  // 1. % vs Otros Orígenes
  // 2. % vs Otras Carrocerías
  // 3. % vs Otros Tipos de Motor / Nuevas Energías
  // 4. % vs Marcas de Otra Concesionaria
  // ==========================================
  const globalCircularAnalytics = useMemo(() => {
    const hasFocal = filterCompBrand !== 'Todas' || filterCompModel !== 'Todos';
    const selectedModelObj = filterCompModel !== 'Todos' ? modelosList.find(m => m.id === filterCompModel) : null;
    const selectedBrandObj = filterCompBrand !== 'Todas'
      ? marcasList.find(b => b.id === filterCompBrand)
      : selectedModelObj
        ? marcasList.find(b => b.id === selectedModelObj.brandId)
        : null;

    // Determinar concesionaria(s) oficial(es) donde pertenece la marca/modelo seleccionado
    const focalConcesionarias = new Set<string>();
    if (selectedModelObj) {
      versionesList
        .filter(v => v.modelId === selectedModelObj.id && v.concesionaria)
        .forEach(v => focalConcesionarias.add(v.concesionaria.trim().toUpperCase()));
    } else if (selectedBrandObj) {
      const brandModelIds = new Set(modelosList.filter(m => m.brandId === selectedBrandObj.id).map(m => m.id));
      versionesList
        .filter(v => brandModelIds.has(v.modelId) && v.concesionaria)
        .forEach(v => focalConcesionarias.add(v.concesionaria.trim().toUpperCase()));
    }

    const origenCounts: Record<string, number> = {};
    const carroceriaCounts: Record<string, number> = {};
    const motorCounts: Record<string, number> = {};
    const dealerRivalCounts: Record<string, number> = {};

    let totalDuels = 0;
    let vsOtherOrigenCount = 0;
    let vsOtherCarroceriaCount = 0;
    let vsOtherMotorCount = 0;
    let vsNewEnergyCount = 0;
    let vsOtherDealerCount = 0;
    let sameDealerCount = 0;

    filteredComparisons.forEach(comp => {
      const vehs: any[] = comp.vehicles || [];
      if (vehs.length < 2) return;

      if (hasFocal) {
        // Identificar el/los vehículo(s) focal(es) y los rivales dentro de la comparativa
        const isFocalVeh = (v: any) => {
          if (selectedModelObj) {
            return v.modelId === selectedModelObj.id || v.fullName.includes((selectedModelObj.name || '').trim().toUpperCase());
          }
          if (selectedBrandObj) {
            return v.brandId === selectedBrandObj.id || v.brandName === (selectedBrandObj.name || '').trim().toUpperCase();
          }
          return false;
        };

        const focals = vehs.filter(isFocalVeh);
        const rivals = vehs.filter(v => !isFocalVeh(v));

        // Si el usuario comparó 2 versiones/modelos de la misma marca seleccionada, tomamos el primero como base y el resto como contrincantes
        const effectiveFocals = focals.length > 0 ? [focals[0]] : [vehs[0]];
        const effectiveRivals = rivals.length > 0 ? rivals : vehs.slice(1);

        effectiveFocals.forEach(focal => {
          if (focal.concesionaria && focal.concesionaria !== 'SIN ASIGNAR') {
            focalConcesionarias.add(focal.concesionaria);
          }

          effectiveRivals.forEach(rival => {
            totalDuels++;

            // 1. Origen
            const rOrigen = rival.origen || 'NO ESPECIFICADO';
            const isDiffOrigen = rOrigen !== focal.origen;
            if (isDiffOrigen) vsOtherOrigenCount++;
            const origenKey = isDiffOrigen ? `vs. ${rOrigen}` : `Mismo (${rOrigen})`;
            origenCounts[origenKey] = (origenCounts[origenKey] || 0) + 1;

            // 2. Carrocería
            const rCarr = rival.carroceria || 'OTRA';
            const isDiffCarr = rCarr !== focal.carroceria;
            if (isDiffCarr) vsOtherCarroceriaCount++;
            const carrKey = isDiffCarr ? `vs. ${rCarr}` : `Misma (${rCarr})`;
            carroceriaCounts[carrKey] = (carroceriaCounts[carrKey] || 0) + 1;

            // 3. Motor / Nuevas Energías
            const rComb = rival.combustible || 'NAFTA';
            const isDiffMotor = rComb !== focal.combustible;
            if (isDiffMotor) vsOtherMotorCount++;
            if (rival.isNewEnergy) vsNewEnergyCount++;
            const motorKey = isDiffMotor ? `vs. ${rComb}` : `Mismo (${rComb})`;
            motorCounts[motorKey] = (motorCounts[motorKey] || 0) + 1;

            // 4. Concesionaria (Otra concesionaria vs Misma concesionaria)
            const rDealer = rival.concesionaria || 'SIN ASIGNAR';
            const isSameDealer =
              (focalConcesionarias.size > 0 && focalConcesionarias.has(rDealer)) ||
              (rDealer !== 'SIN ASIGNAR' && rDealer === focal.concesionaria) ||
              (rival.brandId && rival.brandId === focal.brandId);

            if (isSameDealer) {
              sameDealerCount++;
              const dKey = `Misma Concesionaria (${rDealer !== 'SIN ASIGNAR' ? rDealer : focal.brandName})`;
              dealerRivalCounts[dKey] = (dealerRivalCounts[dKey] || 0) + 1;
            } else {
              vsOtherDealerCount++;
              const dKey = rDealer !== 'SIN ASIGNAR' ? `Otra: ${rDealer}` : `Otra: ${rival.brandName}`;
              dealerRivalCounts[dKey] = (dealerRivalCounts[dKey] || 0) + 1;
            }
          });
        });
      } else {
        // MODO GLOBAL (Todas las Marcas): Analizar cruces entre los vehículos de cada comparativa
        totalDuels++;
        const uniqueOrigenes = new Set(vehs.map(v => v.origen));
        const uniqueCarrocerias = new Set(vehs.map(v => v.carroceria));
        const uniqueMotores = new Set(vehs.map(v => v.combustible));
        const uniqueDealers = new Set(vehs.map(v => v.concesionaria !== 'SIN ASIGNAR' ? v.concesionaria : v.brandName));

        if (uniqueOrigenes.size > 1) vsOtherOrigenCount++;
        if (uniqueCarrocerias.size > 1) vsOtherCarroceriaCount++;
        if (uniqueMotores.size > 1) vsOtherMotorCount++;
        if (vehs.some(v => v.isNewEnergy)) vsNewEnergyCount++;

        if (uniqueDealers.size > 1) {
          vsOtherDealerCount++;
        } else {
          sameDealerCount++;
        }

        vehs.forEach(v => {
          origenCounts[v.origen] = (origenCounts[v.origen] || 0) + 1;
          carroceriaCounts[v.carroceria] = (carroceriaCounts[v.carroceria] || 0) + 1;
          motorCounts[v.combustible] = (motorCounts[v.combustible] || 0) + 1;
        });

        // Para el gráfico de concesionarias en modo global, mostramos la proporción Entre Distintas Concesionarias vs Misma Concesionaria
        dealerRivalCounts['Marcas de Otra Concesionaria'] = vsOtherDealerCount;
        dealerRivalCounts['Misma Concesionaria'] = sameDealerCount;
      }
    });

    const buildSlices = (countsObj: Record<string, number>, maxSlices = 6) => {
      const entries = Object.entries(countsObj).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]);
      const sum = entries.reduce((acc, [, c]) => acc + c, 0);
      if (sum === 0) return [];
      const top = entries.slice(0, maxSlices);
      const rest = entries.slice(maxSlices);
      if (rest.length > 0) {
        const restCount = rest.reduce((acc, [, c]) => acc + c, 0);
        top.push(['Otros', restCount]);
      }
      const palette = ['#00BFFF', '#0A1F33', '#1E8E3E', '#F59E0B', '#DC2626', '#6366F1', '#8B5CF6'];
      return top.map(([label, count], idx) => ({
        label,
        count,
        pct: Math.round((count / sum) * 100),
        color: palette[idx % palette.length],
      }));
    };

    const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : 0);

    return {
      hasFocal,
      totalDuels,
      focalConcesionariasLabel: focalConcesionarias.size > 0 ? Array.from(focalConcesionarias).join(' / ') : 'Todas las Concesionarias',
      origen: {
        vsOtherPct: pct(vsOtherOrigenCount, totalDuels),
        samePct: 100 - pct(vsOtherOrigenCount, totalDuels),
        vsOtherCount: vsOtherOrigenCount,
        slices: buildSlices(origenCounts),
      },
      carroceria: {
        vsOtherPct: pct(vsOtherCarroceriaCount, totalDuels),
        samePct: 100 - pct(vsOtherCarroceriaCount, totalDuels),
        vsOtherCount: vsOtherCarroceriaCount,
        slices: buildSlices(carroceriaCounts),
      },
      motor: {
        vsOtherPct: pct(vsOtherMotorCount, totalDuels),
        newEnergyPct: pct(vsNewEnergyCount, totalDuels),
        vsOtherCount: vsOtherMotorCount,
        slices: buildSlices(motorCounts),
      },
      concesionaria: {
        vsOtherPct: pct(vsOtherDealerCount, totalDuels),
        samePct: pct(sameDealerCount, totalDuels),
        vsOtherCount: vsOtherDealerCount,
        sameCount: sameDealerCount,
        slices: buildSlices(dealerRivalCounts),
      },
    };
  }, [filteredComparisons, filterCompBrand, filterCompModel, modelosList, marcasList, versionesList]);

  // ==========================================
  // SUBMÓDULO: TELEMETRÍA DE PREFERENCIAS (CON FILTROS POR MODELO, MOTOR, CARROCERÍA, ORIGEN)
  // ==========================================
  const preferenceStats = useMemo(() => {
    const docsWithWeights = filteredComparisons.filter(c => {
      if (!c.weights || typeof c.weights.motor !== 'number') return false;
      const vehs: any[] = c.vehicles || [];

      if (filterPrefCarroceria !== 'Todas') {
        if (!vehs.some(v => v.carroceria === filterPrefCarroceria)) return false;
      }
      if (filterPrefCombustible !== 'Todos') {
        if (filterPrefCombustible === 'NUEVAS_ENERGIAS') {
          if (!vehs.some(v => v.isNewEnergy)) return false;
        } else if (filterPrefCombustible === 'COMBUSTION') {
          if (!vehs.some(v => !v.isNewEnergy)) return false;
        } else {
          if (!vehs.some(v => v.combustible === filterPrefCombustible)) return false;
        }
      }
      if (filterPrefOrigen !== 'Todos') {
        if (!vehs.some(v => v.origen === filterPrefOrigen)) return false;
      }
      return true;
    });

    const count = docsWithWeights.length;
    if (count === 0) {
      return {
        hasData: false,
        count: 0,
        avgMotor: 0,
        avgSeguridad: 0,
        avgConfort: 0,
        avgEconomia: 0,
        topAttribute: 'Aún sin muestras suficientes',
        ranked: [] as { id: string; name: string; avg: number; sharePct: number; icon: string; color: string }[],
      };
    }

    const sumMotor = docsWithWeights.reduce((acc, c) => acc + (Number(c.weights.motor) || 0), 0);
    const sumSeguridad = docsWithWeights.reduce((acc, c) => acc + (Number(c.weights.seguridad) || 0), 0);
    const sumConfort = docsWithWeights.reduce((acc, c) => acc + (Number(c.weights.confort) || 0), 0);
    const sumEconomia = docsWithWeights.reduce((acc, c) => acc + (Number(c.weights.economia) || 0), 0);

    const avgMotor = Math.round(sumMotor / count);
    const avgSeguridad = Math.round(sumSeguridad / count);
    const avgConfort = Math.round(sumConfort / count);
    const avgEconomia = Math.round(sumEconomia / count);
    const totalAvgSum = avgMotor + avgSeguridad + avgConfort + avgEconomia || 1;

    const ranked = [
      { id: 'seguridad', name: 'Seguridad y ADAS', avg: avgSeguridad, sharePct: Math.round((avgSeguridad / totalAvgSum) * 100), icon: '🛡️', color: '#1E8E3E' },
      { id: 'economia', name: 'Economía y Eficiencia', avg: avgEconomia, sharePct: Math.round((avgEconomia / totalAvgSum) * 100), icon: '💰', color: '#00BFFF' },
      { id: 'confort', name: 'Tecnología y Confort', avg: avgConfort, sharePct: Math.round((avgConfort / totalAvgSum) * 100), icon: '📱', color: '#0A1F33' },
      { id: 'motor', name: 'Motor y Potencia', avg: avgMotor, sharePct: Math.round((avgMotor / totalAvgSum) * 100), icon: '⚡', color: '#dc2743' },
    ].sort((a, b) => b.avg - a.avg);

    return {
      hasData: true,
      count,
      avgMotor,
      avgSeguridad,
      avgConfort,
      avgEconomia,
      topAttribute: `${ranked[0].icon} ${ranked[0].name} (${ranked[0].avg}% prioridad)`,
      ranked,
    };
  }, [filteredComparisons, filterPrefCarroceria, filterPrefCombustible, filterPrefOrigen]);

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

  // Componente Gráfico Circular (Donut SVG) para Analítica Global Competitiva
  const DonutChartCard = ({
    title,
    subtitle,
    centerValue,
    centerLabel,
    badgeText,
    slices,
  }: {
    title: string;
    subtitle: string;
    centerValue: string;
    centerLabel: string;
    badgeText: string;
    slices: { label: string; count: number; pct: number; color: string }[];
  }) => {
    const radius = 44;
    const circumference = 2 * Math.PI * radius;
    const totalCount = slices.reduce((acc, s) => acc + s.count, 0);
    let accumulatedFraction = 0;

    return (
      <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-4 flex flex-col justify-between h-full">
        <div>
          <div className="flex items-start justify-between gap-2 mb-1">
            <h4 className="text-[11px] font-black text-[#0A1F33] uppercase tracking-wider leading-tight">
              {title}
            </h4>
            <span className="bg-[#0A1F33] text-[#00BFFF] text-[8px] font-black uppercase px-2 py-0.5 tracking-widest shrink-0">
              {badgeText}
            </span>
          </div>
          <p className="text-[9px] text-[#3A3A3C] mb-3 leading-snug">{subtitle}</p>
        </div>

        {slices.length === 0 || totalCount === 0 ? (
          <div className="py-10 text-center text-[10px] text-[#C0C0C0] font-bold uppercase tracking-widest">
            Sin muestras en este filtro
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row xl:flex-col 2xl:flex-row items-center gap-4 my-auto">
            {/* SVG Donut */}
            <div className="relative w-32 h-32 shrink-0 flex items-center justify-center">
              <svg className="w-32 h-32 -rotate-90" viewBox="0 0 112 112">
                <circle
                  cx="56"
                  cy="56"
                  r={radius}
                  fill="transparent"
                  stroke="#F1F5F9"
                  strokeWidth="14"
                />
                {slices.map((slice, i) => {
                  const fraction = totalCount > 0 ? slice.count / totalCount : 0;
                  const strokeDasharray = `${fraction * circumference} ${circumference}`;
                  const strokeDashoffset = -accumulatedFraction * circumference;
                  accumulatedFraction += fraction;
                  return (
                    <circle
                      key={i}
                      cx="56"
                      cy="56"
                      r={radius}
                      fill="transparent"
                      stroke={slice.color}
                      strokeWidth="14"
                      strokeDasharray={strokeDasharray}
                      strokeDashoffset={strokeDashoffset}
                    />
                  );
                })}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
                <span className="text-lg font-black text-[#0A1F33] leading-none" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
                  {centerValue}
                </span>
                <span className="text-[7px] font-bold text-[#3A3A3C] uppercase tracking-wider mt-0.5 leading-tight">
                  {centerLabel}
                </span>
              </div>
            </div>

            {/* Leyenda detallada */}
            <div className="w-full flex-1 flex flex-col gap-1.5 min-w-0">
              {slices.map((s, idx) => (
                <div key={idx} className="flex items-center justify-between gap-2 text-[9px] border-b border-[#F1F5F9] pb-1 last:border-none">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2.5 h-2.5 shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="font-bold text-[#0A1F33] uppercase truncate" title={s.label}>
                      {s.label}
                    </span>
                  </div>
                  <span className="font-black text-[#3A3A3C] shrink-0">
                    {s.pct}% <span className="font-normal text-[#C0C0C0]">({s.count})</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

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
    const uidVal = userB2BForm.uid.trim();
    if (!uidVal || !userB2BForm.dealershipName || userB2BForm.marcasPermitidas.length === 0) {
      return setFeedback({ type: 'error', message: 'Debes ingresar el UID, seleccionar Concesionaria y al menos 1 Marca.' });
    }
    setLoading(true);
    try {
      await setDoc(doc(db, 'users', uidVal), {
        email: userB2BForm.email.trim(),
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

  // ABMs Restantes con soporte para Modales y Toggles en Cuadros
  const handleSaveMarca = async (e: React.FormEvent) => {
    e.preventDefault(); if (!marcaForm.name) return; setLoading(true);
    try {
      const id = marcaForm.id || generarSlug(marcaForm.name);
      await setDoc(doc(db, 'brands', id), { name: marcaForm.name.toUpperCase(), origen_marca: marcaForm.origen_marca, logoUrl: marcaForm.logoUrl, updatedAt: serverTimestamp() }, { merge: true });
      invalidateCatalogCache('brands');
      setFeedback({ type: 'success', message: 'Identidad de Marca guardada correctamente.' });
      setMarcaForm({ id: '', name: '', origen_marca: '', logoUrl: '' });
      setAbmModalType(null);
      fetchAllData();
    } catch (err: any) { setFeedback({ type: 'error', message: err.message }); } finally { setLoading(false); }
  };

  const handleSaveModelo = async (e: React.FormEvent) => {
    e.preventDefault(); if (!modeloForm.name || !modeloForm.brandId) return; setLoading(true);
    try {
      const id = modeloForm.id || generarSlug(modeloForm.name);
      await setDoc(doc(db, 'models', id), { ...modeloForm, name: modeloForm.name.toUpperCase(), tipo_carroceria: normalizeCarroceria(modeloForm.tipo_carroceria), startingPrice: Number(modeloForm.startingPrice) || 0, isPopular: modeloForm.isPopular, updatedAt: serverTimestamp() }, { merge: true });
      invalidateCatalogCache('models');
      setFeedback({ type: 'success', message: 'Modelo guardado correctamente.' });
      setModeloForm({ id: '', brandId: '', name: '', tipo_carroceria: 'SUV', subsegmento: '', origen: '', startingPrice: '', imgUrl: '', isPopular: false });
      setAbmModalType(null);
      fetchAllData();
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
      
      invalidateCatalogCache('versions');
      setFeedback({ type: 'success', message: 'Versión técnica guardada de forma integral.' });
      setVersionForm({ id: '', modelId: '', name: '', price: '', concesionaria: '', promocion: '', url_auto: '', motor: '', transmision: '', combustible: '', traccion: '', largo: '', ancho: '', alto: '', despeje_suelo: '', baulera_litros: '', plazas: '', airbags: '', tamanho_pantalla: '', conectividad: '', camaras: '', garantia: '', adas: '', asiento_cuero: '', techo_panoramico: '', alimentacion: '', autonomi_electrica: '', medida_neumatico: '', tipo_llanta: '', detalle_suspension: '', detalles_freno: '', confort_conveniencia: '', seguridad_standard: '' });
      setAbmModalType(null);
      fetchAllData();
    } catch (err: any) { setFeedback({ type: 'error', message: err.message }); } finally { setLoading(false); }
  };

  const handleSaveConcesionaria = async (e: React.FormEvent) => {
    e.preventDefault(); if (!concesionariaForm.name) return; setLoading(true);
    try {
      const id = concesionariaForm.id || generarSlug(concesionariaForm.name);
      await setDoc(doc(db, 'concesionarias', id), { name: concesionariaForm.name.toUpperCase(), email_gerencia: concesionariaForm.email_gerencia, status: concesionariaForm.status, datacarCheck: concesionariaForm.datacarCheck, updatedAt: serverTimestamp() }, { merge: true });
      invalidateCatalogCache('concesionarias');
      setFeedback({ type: 'success', message: 'Concesionaria guardada y actualizada correctamente.' });
      setConcesionariaForm({ id: '', name: '', status: 'active', email_gerencia: '', datacarCheck: false });
      setAbmModalType(null);
      fetchAllData();
    } catch (err: any) { setFeedback({ type: 'error', message: err.message }); } finally { setLoading(false); }
  };

  const handleDelete = async (col: string, id: string) => {
    if (!confirm('¿Confirmas la eliminación permanente de este registro individual? Esta acción no se puede deshacer.')) return;
    setLoading(true);
    try { 
      await deleteDoc(doc(db, col, id)); 
      invalidateCatalogCache(col);
      setFeedback({ type: 'success', message: 'Registro eliminado permanentemente de la base de datos.' }); 
      fetchAllData(); 
    } catch (err: any) { setFeedback({ type: 'error', message: err.message }); } finally { setLoading(false); }
  };

  // Triggers de Edición (Abren Modal)
  const triggerEditMarca = (m: any) => { 
    setMarcaForm({ id: m.id, name: m.name || '', origen_marca: m.origen_marca || '', logoUrl: m.logoUrl || '' }); 
    setAbmModalType('marcas'); 
  };
  const triggerEditModelo = (m: any) => { 
    setModeloForm({ id: m.id, brandId: m.brandId || '', name: m.name || '', tipo_carroceria: normalizeCarroceria(m.tipo_carroceria), subsegmento: m.subsegmento || '', origen: m.origen || '', startingPrice: m.startingPrice?.toString() || '', imgUrl: m.imgUrl || '', isPopular: m.isPopular || false }); 
    setAbmModalType('modelos'); 
  };
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
    }); 
    setAbmModalType('versiones'); 
  };
  const triggerEditConcesionaria = (c: any) => {
    setConcesionariaForm({
      id: c.id,
      name: c.name || '',
      email_gerencia: c.email_gerencia || '',
      status: c.status || 'active',
      datacarCheck: c.datacarCheck || false
    });
    setAbmModalType('concesionarias');
  };

  // Triggers de Alta Nueva (Abren Modal Vacío)
  const openNewMarcaModal = () => {
    setMarcaForm({ id: '', name: '', origen_marca: '', logoUrl: '' });
    setAbmModalType('marcas');
  };
  const openNewModeloModal = () => {
    setModeloForm({ id: '', brandId: '', name: '', tipo_carroceria: 'SUV', subsegmento: '', origen: '', startingPrice: '', imgUrl: '', isPopular: false });
    setAbmModalType('modelos');
  };
  const openNewVersionModal = () => {
    setVersionForm({
      id: '', modelId: '', name: '', price: '', concesionaria: '', promocion: '', url_auto: '',
      motor: '', transmision: '', combustible: '', traccion: '', largo: '', ancho: '', alto: '', despeje_suelo: '', baulera_litros: '', plazas: '5',
      airbags: '6', tamanho_pantalla: '10', conectividad: 'Apple CarPlay / Android Auto', camaras: 'Reversa', garantia: '5 años', adas: '', asiento_cuero: '', techo_panoramico: '',
      alimentacion: '', autonomi_electrica: '', medida_neumatico: '', tipo_llanta: '', detalle_suspension: '', detalles_freno: '',
      confort_conveniencia: '', seguridad_standard: ''
    });
    setAbmModalType('versiones');
  };
  const openNewConcesionariaModal = () => {
    setConcesionariaForm({ id: '', name: '', email_gerencia: '', status: 'active', datacarCheck: false });
    setAbmModalType('concesionarias');
  };

  // Toggle Directo en Cuadro: Modelos Destacados (K)
  const handleTogglePopularModel = async (modelId: string, currentVal: boolean) => {
    const newVal = !currentVal;
    try {
      await updateDoc(doc(db, 'models', modelId), {
        isPopular: newVal,
        updatedAt: serverTimestamp()
      });
      setModelosList(prev => prev.map(m => m.id === modelId ? { ...m, isPopular: newVal, updatedAt: new Date() } : m));
      invalidateCatalogCache('models');
      showToast(newVal ? 'Modelo destacado en Home' : 'Modelo quitado de destacados');
    } catch (error: any) {
      showToast('Error al actualizar: ' + error.message);
    }
  };

  // Toggle Directo en Cuadro: DATACAR CHECK en Concesionarias (L)
  const handleToggleDatacarCheck = async (concesionariaId: string, currentVal: boolean) => {
    const newVal = !currentVal;
    try {
      await updateDoc(doc(db, 'concesionarias', concesionariaId), {
        datacarCheck: newVal,
        updatedAt: serverTimestamp()
      });
      setConcesionariasList(prev => prev.map(c => c.id === concesionariaId ? { ...c, datacarCheck: newVal, updatedAt: new Date() } : c));
      invalidateCatalogCache('concesionarias');
      showToast(newVal ? 'Sello DATACAR CHECK activado' : 'Sello DATACAR CHECK desactivado');
    } catch (error: any) {
      showToast('Error al actualizar: ' + error.message);
    }
  };

  // Edición Inline por Columna con Lápiz (✏️) en el Cuadro ABM (H)
  const handleAdminInlineSave = async () => {
    if (!adminInlineEdit) return;
    const { type, id, field, value } = adminInlineEdit;
    try {
      const now = new Date();
      const updatePayload: any = { updatedAt: serverTimestamp() };

      if (type === 'version') {
        if (field === 'price') updatePayload.price = Number(value) || 0;
        else if (field === 'promocion') updatePayload.promocion = value;
        else if (field === 'name') updatePayload.name = value;
        else if (field === 'concesionaria') updatePayload.concesionaria = value.toUpperCase();
        else if (field === 'url_auto') updatePayload.url_auto = value;
        else if (['motor', 'transmision', 'combustible'].includes(field)) {
          updatePayload[`specs.${field}`] = value;
        }
        await updateDoc(doc(db, 'versions', id), updatePayload);
        setVersionesList(prev => prev.map(v => {
          if (v.id !== id) return v;
          if (field === 'price') return { ...v, price: Number(value) || 0, updatedAt: now };
          if (field === 'promocion') return { ...v, promocion: value, updatedAt: now };
          if (field === 'name') return { ...v, name: value, updatedAt: now };
          if (field === 'concesionaria') return { ...v, concesionaria: value.toUpperCase(), updatedAt: now };
          if (field === 'url_auto') return { ...v, url_auto: value, updatedAt: now };
          if (['motor', 'transmision', 'combustible'].includes(field)) {
            return { ...v, specs: { ...(v.specs || {}), [field]: value }, updatedAt: now };
          }
          return v;
        }));
        invalidateCatalogCache('versions');
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
        invalidateCatalogCache('models');
      } else if (type === 'marca') {
        if (field === 'name') updatePayload.name = value.toUpperCase();
        else if (field === 'origen_marca') updatePayload.origen_marca = value;
        await updateDoc(doc(db, 'brands', id), updatePayload);
        setMarcasList(prev => prev.map(b => {
          if (b.id !== id) return b;
          if (field === 'name') return { ...b, name: value.toUpperCase(), updatedAt: now };
          if (field === 'origen_marca') return { ...b, origen_marca: value, updatedAt: now };
          return b;
        }));
        invalidateCatalogCache('brands');
      } else if (type === 'concesionaria') {
        if (field === 'name') updatePayload.name = value.toUpperCase();
        else if (field === 'email_gerencia') updatePayload.email_gerencia = value;
        else if (field === 'status') updatePayload.status = value;
        await updateDoc(doc(db, 'concesionarias', id), updatePayload);
        setConcesionariasList(prev => prev.map(c => {
          if (c.id !== id) return c;
          if (field === 'name') return { ...c, name: value.toUpperCase(), updatedAt: now };
          if (field === 'email_gerencia') return { ...c, email_gerencia: value, updatedAt: now };
          if (field === 'status') return { ...c, status: value, updatedAt: now };
          return c;
        }));
        invalidateCatalogCache('concesionarias');
      }

      setAdminInlineEdit(null);
      showToast('Actualizado correctamente');
    } catch (error: any) {
      showToast('Error al actualizar: ' + error.message);
    }
  };

  const handleCreateAd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adForm.sponsor.trim() || !adForm.startDate || !adForm.endDate) {
      setFeedback({ type: 'error', message: 'Completá Anunciante, Fecha de Inicio y Fecha de Fin de la campaña.' });
      return;
    }

    const isComparador = adForm.location === 'comparador';
    const isRecomendadorSlot = adForm.location === 'recomendador';
    const isModelSponsor = isComparador || isRecomendadorSlot;
    const isCatalogoFiltros = adForm.location === 'catalogo_filtros';

    if (isModelSponsor) {
      if (!adForm.modelId) {
        setFeedback({ type: 'error', message: `Para el espacio ${isRecomendadorSlot ? 'Recomendador (Slot Modelo)' : 'Comparador'}, debés elegir un modelo del listado.` });
        return;
      }
    } else {
      if (!adForm.img.trim()) {
        setFeedback({ type: 'error', message: 'Subí una imagen 1200x400 o ingresá un enlace de imagen para el banner.' });
        return;
      }
      if (!adForm.link.trim()) {
        setFeedback({ type: 'error', message: 'Ingresá un enlace web para redireccionar el banner.' });
        return;
      }
      if (isCatalogoFiltros && adForm.targetCategory === 'Todas' && adForm.targetCombustible === 'Todas') {
        setFeedback({ type: 'error', message: 'Para Catálogo Filtros, elegí al menos un filtro de Carrocería y/o de Movilidad.' });
        return;
      }
    }

    setLoading(true);
    try {
      let finalHeadline = adForm.headline.trim();
      let finalImg = adForm.img.trim();
      let finalLink = isModelSponsor ? '' : adForm.link.trim();
      let finalModelId = isModelSponsor ? adForm.modelId : '';
      let finalTargetCategory = isCatalogoFiltros ? adForm.targetCategory : 'Todas';
      let finalTargetCombustible = isCatalogoFiltros ? adForm.targetCombustible : 'Todas';
      let modelName = '';
      let brandName = '';

      if (isModelSponsor && finalModelId) {
        const selectedModel = modelosList.find(m => m.id === finalModelId);
        if (selectedModel) {
          const brand = marcasList.find(b => b.id === selectedModel.brandId);
          brandName = brand?.name || '';
          modelName = selectedModel.name || '';
          finalHeadline = `Opción Patrocinada: ${brandName} ${modelName}`.trim();
          finalImg = selectedModel.imgUrl || '';
        }
      } else if (!finalHeadline) {
        finalHeadline = adForm.sponsor.trim();
      }

      const targetId = adForm.id || `ad_${generarId()}`;
      const isExisting = !!adForm.id;
      const existingAd = isExisting ? campaignsList.find(c => c.id === adForm.id) : null;

      await setDoc(doc(db, 'campaigns', targetId), { 
        ...adForm, 
        id: targetId,
        sponsor: adForm.sponsor.trim(),
        headline: finalHeadline,
        img: finalImg,
        link: finalLink,
        modelId: finalModelId,
        targetCategory: finalTargetCategory,
        targetCombustible: finalTargetCombustible,
        modelName,
        brandName,
        isActive: existingAd ? (existingAd.isActive ?? true) : true,
        updatedAt: serverTimestamp(),
        createdAt: existingAd?.createdAt || serverTimestamp() 
      }, { merge: true });

      invalidateCatalogCache('campaigns');
      setFeedback({ type: 'success', message: isExisting ? 'Pauta publicitaria actualizada con éxito.' : 'Pauta inyectada en la bóveda publicitaria.' });
      setAdForm({ 
        id: '',
        sponsor: '', headline: '', highlight: '', price: '', link: '', img: '', 
        location: adForm.location, targetCategory: 'Todas', targetCombustible: 'Todas', modelId: '', startDate: '', endDate: '', 
        ctaEnabled: false, ctaText: '', ctaUrl: '', ctaColor: '#00BFFF' 
      });
      setAdModelFilterConcesionaria('Todas');
      setAdModelFilterMarca('Todas');
      fetchAllData();
    } catch (err: any) { 
      setFeedback({ type: 'error', message: err.message }); 
    } finally { 
      setLoading(false); 
    }
  };

  const handleEditAd = (camp: any) => {
    // Inferir ubicación exacta si viene de un registro anterior
    let loc = camp.location || 'home';
    if (loc === 'catalogo' && ((camp.targetCategory && camp.targetCategory !== 'Todas') || (camp.targetCombustible && camp.targetCombustible !== 'Todas'))) {
      loc = 'catalogo_filtros';
    } else if (camp.modelId && (loc === 'ambos' || loc === 'comparador')) {
      loc = 'comparador';
    } else if (camp.modelId && loc === 'recomendador') {
      loc = 'recomendador';
    } else if (!camp.modelId && (loc === 'recomendador' || loc === 'recomendador_banner')) {
      loc = 'recomendador_banner';
    }
    setAdForm({
      id: camp.id || '',
      sponsor: camp.sponsor || '',
      headline: camp.headline || '',
      highlight: camp.highlight || '',
      price: camp.price || '',
      link: camp.link || '',
      img: camp.img || '',
      location: loc,
      targetCategory: camp.targetCategory || 'Todas',
      targetCombustible: camp.targetCombustible || 'Todas',
      modelId: camp.modelId || '',
      startDate: camp.startDate || '',
      endDate: camp.endDate || '',
      ctaEnabled: camp.ctaEnabled || false,
      ctaText: camp.ctaText || '',
      ctaUrl: camp.ctaUrl || '',
      ctaColor: camp.ctaColor || '#00BFFF'
    });
    setAdModelFilterConcesionaria('Todas');
    setAdModelFilterMarca('Todas');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleResetAdForm = () => {
    setAdForm({
      id: '',
      sponsor: '', headline: '', highlight: '', price: '', link: '', img: '',
      location: 'home', targetCategory: 'Todas', targetCombustible: 'Todas', modelId: '', startDate: '', endDate: '',
      ctaEnabled: false, ctaText: '', ctaUrl: '', ctaColor: '#00BFFF'
    });
    setAdModelFilterConcesionaria('Todas');
    setAdModelFilterMarca('Todas');
  };

  // ==========================================
  // OPERACIONES DE SLIDER HOME (MÁX. 3 MODELOS)
  // ==========================================
  const persistHomeSliderConfig = async (
    nextConfig: typeof homeSliderConfig,
    successMsg = 'Configuración del Slider Home guardada con éxito.'
  ) => {
    setLoading(true);
    try {
      const sanitizedSlides = nextConfig.slides.slice(0, 3).map((s, idx) => ({
        ...s,
        order: idx + 1,
      }));
      const payload = {
        enabled: nextConfig.enabled,
        activeVariant: nextConfig.activeVariant,
        slides: sanitizedSlides,
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'config', 'home_slider'), payload, { merge: true });
      setHomeSliderConfig({
        enabled: nextConfig.enabled,
        activeVariant: nextConfig.activeVariant,
        slides: sanitizedSlides,
      });
      setFeedback({ type: 'success', message: successMsg });
      showToast(successMsg);
    } catch (err: any) {
      setFeedback({ type: 'error', message: `Error al guardar Slider Home: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSliderSlide = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sliderSlideForm.modelId) {
      setFeedback({ type: 'error', message: 'Seleccioná un modelo del catálogo para destacar en el banner.' });
      return;
    }
    if (!sliderSlideForm.customText.trim()) {
      setFeedback({ type: 'error', message: 'Ingresá el texto descriptivo o promocional para el banner.' });
      return;
    }
    if (!sliderSlideForm.ctaText.trim()) {
      setFeedback({ type: 'error', message: 'Ingresá el texto del botón CTA.' });
      return;
    }
    if (sliderSlideForm.ctaAction === 'url' && !sliderSlideForm.ctaUrl.trim()) {
      setFeedback({ type: 'error', message: 'Ingresá la URL de destino para el botón CTA.' });
      return;
    }

    const isEditing = Boolean(sliderSlideForm.id);
    if (!isEditing && homeSliderConfig.slides.length >= 3) {
      setFeedback({
        type: 'error',
        message: 'Límite alcanzado: El Slider Home permite hasta un máximo de 3 banners. Editá o eliminá uno existente.',
      });
      showToast('Máximo 3 banners permitidos en el Slider Home.');
      return;
    }

    const slideItem = {
      id: sliderSlideForm.id || `slide_${generarId()}`,
      modelId: sliderSlideForm.modelId,
      badgeText: sliderSlideForm.badgeText.trim() || 'Modelo Destacado',
      customText: sliderSlideForm.customText.trim(),
      ctaText: sliderSlideForm.ctaText.trim(),
      ctaAction: sliderSlideForm.ctaAction,
      ctaUrl: sliderSlideForm.ctaAction === 'url' ? sliderSlideForm.ctaUrl.trim() : '',
      isActive: sliderSlideForm.isActive,
      order: isEditing
        ? (homeSliderConfig.slides.find(s => s.id === sliderSlideForm.id)?.order || 1)
        : homeSliderConfig.slides.length + 1,
    };

    const nextSlides = isEditing
      ? homeSliderConfig.slides.map(s => (s.id === sliderSlideForm.id ? slideItem : s))
      : [...homeSliderConfig.slides, slideItem].slice(0, 3);

    await persistHomeSliderConfig(
      { ...homeSliderConfig, slides: nextSlides },
      isEditing ? 'Banner del Slider Home actualizado.' : 'Banner agregado al Slider Home.'
    );

    setSliderSlideForm({
      id: '',
      modelId: '',
      badgeText: 'Destacado del Mes',
      customText: '',
      ctaText: 'Solicitar Cotización Directa',
      ctaAction: 'cotizar',
      ctaUrl: '',
      isActive: true,
    });
    setSliderFilterConcesionaria('Todas');
    setSliderFilterMarca('Todas');
  };

  const handleEditSliderSlide = (slide: any) => {
    setSliderSlideForm({
      id: slide.id,
      modelId: slide.modelId || '',
      badgeText: slide.badgeText || 'Destacado del Mes',
      customText: slide.customText || '',
      ctaText: slide.ctaText || 'Solicitar Cotización Directa',
      ctaAction: slide.ctaAction || 'cotizar',
      ctaUrl: slide.ctaUrl || '',
      isActive: slide.isActive !== false,
    });
    setSliderFilterConcesionaria('Todas');
    setSliderFilterMarca('Todas');
  };

  const handleResetSliderSlideForm = () => {
    setSliderSlideForm({
      id: '',
      modelId: '',
      badgeText: 'Destacado del Mes',
      customText: '',
      ctaText: 'Solicitar Cotización Directa',
      ctaAction: 'cotizar',
      ctaUrl: '',
      isActive: true,
    });
    setSliderFilterConcesionaria('Todas');
    setSliderFilterMarca('Todas');
  };

  const handleDeleteSliderSlide = async (slideId: string) => {
    const nextSlides = homeSliderConfig.slides.filter(s => s.id !== slideId);
    await persistHomeSliderConfig(
      { ...homeSliderConfig, slides: nextSlides },
      'Banner eliminado del Slider Home.'
    );
    if (sliderSlideForm.id === slideId) {
      handleResetSliderSlideForm();
    }
  };

  const handleToggleSliderSlide = async (slideId: string) => {
    const nextSlides = homeSliderConfig.slides.map(s =>
      s.id === slideId ? { ...s, isActive: !s.isActive } : s
    );
    await persistHomeSliderConfig(
      { ...homeSliderConfig, slides: nextSlides },
      'Estado del banner actualizado.'
    );
  };

  const handleMoveSliderSlide = async (idx: number, direction: -1 | 1) => {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= homeSliderConfig.slides.length) return;
    const copy = [...homeSliderConfig.slides];
    const temp = copy[idx];
    copy[idx] = copy[targetIdx];
    copy[targetIdx] = temp;
    await persistHomeSliderConfig(
      { ...homeSliderConfig, slides: copy },
      'Orden de banners actualizado.'
    );
  };

  const handleLoadDemoSliderSlides = async () => {
    const candidates = modelosList.filter(m => m.imgUrl && m.isPopular).slice(0, 3);
    const pool = candidates.length >= 3 ? candidates : modelosList.filter(m => m.imgUrl).slice(0, 3);
    if (pool.length === 0) {
      showToast('Aún no hay modelos con imagen en el catálogo.');
      return;
    }
    const presets = [
      {
        badgeText: 'Destacado del Mes',
        customText: 'Bonificación especial por tiempo limitado y entrega inmediata en representantes oficiales con respaldo DATACAR CHECK.',
        ctaText: 'Solicitar Cotización Directa',
        ctaAction: 'cotizar' as const,
      },
      {
        badgeText: 'Oportunidad 0km',
        customText: 'Financiación preferencial disponible y equipamiento de seguridad de última generación para ciudad y ruta.',
        ctaText: 'Cotizar con Beneficio',
        ctaAction: 'cotizar' as const,
      },
      {
        badgeText: 'Lanzamiento Oficial',
        customText: 'Conocé todas las versiones disponibles en Paraguay, compará su ficha técnica oficial y agendá tu Test Drive hoy.',
        ctaText: 'Recibir Oferta Oficial',
        ctaAction: 'cotizar' as const,
      },
    ];

    const demoSlides = pool.slice(0, 3).map((m, idx) => ({
      id: `slide_demo_${idx + 1}`,
      modelId: m.id,
      badgeText: presets[idx]?.badgeText || 'Modelo Destacado',
      customText: presets[idx]?.customText || 'Consultá disponibilidad y financiación oficial.',
      ctaText: presets[idx]?.ctaText || 'Solicitar Cotización',
      ctaAction: presets[idx]?.ctaAction || ('cotizar' as const),
      ctaUrl: '',
      isActive: true,
      order: idx + 1,
    }));

    await persistHomeSliderConfig(
      {
        ...homeSliderConfig,
        enabled: true,
        slides: demoSlides,
      },
      'Se cargaron 3 modelos destacados de prueba en el Slider Home.'
    );
  };

  // ==========================================
  // OPERACIONES DE NEWSLETTER & BROADCASTING
  // ==========================================
  const handleSendTestEmail = async () => {
    if (!broadcastForm.sendTestEmail.trim()) {
      showToast('Ingresá una dirección de correo para el test.');
      return;
    }
    if (!broadcastForm.subject.trim()) {
      showToast('Ingresá el asunto del correo.');
      return;
    }
    setBroadcastSending(true);
    setBroadcastStatus({ type: 'idle', message: 'Enviando correo de prueba...' });
    try {
      const res = await sendNewsletterBroadcast({
        subject: `[TEST] ${broadcastForm.subject}`,
        headline: broadcastForm.headline,
        contentHtml: broadcastForm.contentHtml,
        buttonText: broadcastForm.buttonText,
        buttonUrl: broadcastForm.buttonUrl,
        destinatarios: [broadcastForm.sendTestEmail.trim()],
      });
      if (res.success) {
        setBroadcastStatus({
          type: 'success',
          message: res.simulated
            ? `Prueba simulada con éxito. Previsualizá en: ${res.previewUrl}`
            : `Correo de prueba enviado con éxito a ${broadcastForm.sendTestEmail}.`,
          previewUrl: res.previewUrl
        });
        showToast('Correo de prueba despachado.');
      } else {
        setBroadcastStatus({ type: 'error', message: res.error || 'Error al enviar correo de prueba.' });
      }
    } catch (err: any) {
      setBroadcastStatus({ type: 'error', message: err.message || 'Error de conexión.' });
    } finally {
      setBroadcastSending(false);
    }
  };

  const handleBroadcastNewsletter = async () => {
    const activeEmails = newsletterSubscribers
      .filter(s => s.estado !== 'Inactivo')
      .map(s => s.email.trim());

    if (activeEmails.length === 0) {
      showToast('No hay suscriptores activos para enviar la campaña.');
      return;
    }
    if (!broadcastForm.subject.trim()) {
      showToast('El asunto del correo es obligatorio.');
      return;
    }
    if (!broadcastForm.contentHtml.trim()) {
      showToast('El contenido HTML del correo no puede estar vacío.');
      return;
    }

    const confirmSend = window.confirm(`¿Confirmás el envío masivo a ${activeEmails.length} suscriptores activos?`);
    if (!confirmSend) return;

    setBroadcastSending(true);
    setBroadcastStatus({ type: 'idle', message: `Transmitiendo difusión masiva a ${activeEmails.length} suscriptores...` });

    try {
      const res = await sendNewsletterBroadcast({
        subject: broadcastForm.subject.trim(),
        headline: broadcastForm.headline.trim(),
        contentHtml: broadcastForm.contentHtml,
        buttonText: broadcastForm.buttonText.trim(),
        buttonUrl: broadcastForm.buttonUrl.trim(),
        destinatarios: activeEmails,
      });

      if (res.success) {
        setBroadcastStatus({
          type: 'success',
          message: res.simulated
            ? `Campaña procesada en modo simulación para ${res.destinatariosCount || activeEmails.length} suscriptores. Previsualizá en: ${res.previewUrl}`
            : `¡Campaña transmitida con éxito a ${res.destinatariosCount || activeEmails.length} suscriptores!`,
          previewUrl: res.previewUrl,
          destinatariosCount: res.destinatariosCount || activeEmails.length
        });
        showToast('Difusión de newsletter ejecutada con éxito.');
      } else {
        setBroadcastStatus({ type: 'error', message: res.error || 'Fallo en la pasarela de envío.' });
      }
    } catch (err: any) {
      setBroadcastStatus({ type: 'error', message: err.message || 'Error enviando newsletter.' });
    } finally {
      setBroadcastSending(false);
    }
  };

  const handleToggleSubscriberStatus = async (sub: any) => {
    const newStatus = sub.estado === 'Activo' ? 'Inactivo' : 'Activo';
    try {
      await updateDoc(doc(db, sub.colName, sub.id), { estado: newStatus, updatedAt: serverTimestamp() });
      setNewsletterSubscribers(prev => prev.map(s => s.id === sub.id ? { ...s, estado: newStatus } : s));
      showToast(`Suscriptor marcado como ${newStatus}`);
    } catch (err: any) {
      showToast('Error al actualizar suscriptor: ' + err.message);
    }
  };

  const handleDeleteSubscriber = async (sub: any) => {
    if (!window.confirm(`¿Eliminar definitivamente a ${sub.email} del newsletter?`)) return;
    try {
      await deleteDoc(doc(db, sub.colName, sub.id));
      setNewsletterSubscribers(prev => prev.filter(s => s.id !== sub.id));
      showToast('Suscriptor eliminado.');
    } catch (err: any) {
      showToast('Error al eliminar suscriptor: ' + err.message);
    }
  };

  const handleAddSubscriber = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = newSubEmail.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      showToast('Ingresá un correo electrónico válido.');
      return;
    }
    const alreadyExists = newsletterSubscribers.some(s => s.email === cleanEmail);
    if (alreadyExists) {
      showToast('Este correo ya está registrado en la base de datos.');
      return;
    }
    setLoading(true);
    try {
      const docRef = doc(collection(db, 'newsletter'));
      await setDoc(docRef, {
        email: cleanEmail,
        origen: newSubOrigen.trim() || 'Admin Manual',
        estado: 'Activo',
        createdAt: serverTimestamp()
      });
      setNewsletterSubscribers(prev => [
        {
          id: docRef.id,
          colName: 'newsletter',
          email: cleanEmail,
          origen: newSubOrigen.trim() || 'Admin Manual',
          estado: 'Activo',
          createdAt: new Date()
        },
        ...prev
      ]);
      setNewSubEmail('');
      setShowAddSubModal(false);
      showToast('Suscriptor agregado a la colección newsletter.');
    } catch (err: any) {
      showToast('Error al agregar suscriptor: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // TELEMETRÍA DE DEMANDA DEL RECOMENDADOR
  // ==========================================
  const recomendadorDemandStats = useMemo(() => {
    const allEntries: any[] = [];
    const seenSignatures = new Set<string>();

    wizardStatsList.forEach(ws => {
      const sig = JSON.stringify(ws.answers || ws);
      if (!seenSignatures.has(sig)) {
        seenSignatures.add(sig);
        allEntries.push({
          answers: ws.answers || {},
          effectiveAnswers: ws.effectiveAnswers || ws.answers || {},
          perfil: ws.perfil || 'general',
          createdAt: ws.createdAt?.toDate ? ws.createdAt.toDate() : (ws.createdAt ? new Date(ws.createdAt) : null)
        });
      }
    });

    leadsList.forEach(l => {
      if (l.preferencias_wizard) {
        const sig = JSON.stringify(l.preferencias_wizard);
        if (!seenSignatures.has(sig)) {
          seenSignatures.add(sig);
          allEntries.push({
            answers: l.preferencias_wizard,
            effectiveAnswers: l.preferencias_wizard,
            perfil: l.preferencias_wizard?.conocimiento || 'general',
            createdAt: l.createdAt
          });
        }
      }
    });

    const total = allEntries.length;

    // Presupuestos
    const budgetMap: Record<string, { label: string; count: number; color: string }> = {
      '18000': { label: 'Hasta US$ 18.000', count: 0, color: '#1E8E3E' },
      '25000': { label: 'US$ 18k a 25k', count: 0, color: '#00BFFF' },
      '40000': { label: 'US$ 25k a 40k', count: 0, color: '#0A1F33' },
      '999999': { label: 'Más de US$ 40.000', count: 0, color: '#F2994A' }
    };

    // Carrocerías
    const carroceriaMap: Record<string, number> = {};

    // Combustibles
    let countNuevasEnergias = 0;
    let countCombustion = 0;
    const combustibleMap: Record<string, number> = {};

    // Plazas
    const plazasMap: Record<string, number> = { '1-2 Plazas': 0, '4-5 Plazas': 0, '7+ Plazas': 0 };

    // Prioridades
    const prioridadMap: Record<string, number> = {
      'Economía / Consumo': 0,
      'Seguridad / ADAS': 0,
      'Tecnología / Confort': 0,
      'Precio más bajo': 0,
    };

    // Transmisión
    let transAuto = 0;
    let transManual = 0;

    allEntries.forEach(item => {
      const a = item.answers || {};
      const eff = item.effectiveAnswers || a;

      // Presupuesto
      const bKey = eff.presupuesto || a.presupuesto;
      if (bKey && budgetMap[bKey]) {
        budgetMap[bKey].count++;
      }

      // Carrocería
      let cVal = eff.carroceria || a.carroceria;
      if (!cVal && a.uso) {
        if (a.uso === 'ciudad') cVal = ['HATCHBACK', 'SUV'];
        else if (a.uso === 'familia') cVal = ['SUV', 'MINIVAN'];
        else if (a.uso === 'carga') cVal = ['PICKUP'];
        else if (a.uso === 'ruta') cVal = ['SEDÁN', 'SUV'];
        else if (a.uso === 'aventura') cVal = ['SUV', 'PICKUP'];
      }
      const addCarroceria = (c: string) => {
        if (!c || c === 'any') return;
        const norm = c.toUpperCase().trim();
        carroceriaMap[norm] = (carroceriaMap[norm] || 0) + 1;
      };
      if (Array.isArray(cVal)) cVal.forEach(addCarroceria);
      else if (typeof cVal === 'string') addCarroceria(cVal);

      // Combustible
      let combVal = eff.combustible || a.combustible;
      const addComb = (c: string) => {
        if (!c || c === 'any') return;
        const norm = c.toUpperCase().trim();
        if (['HEV', 'MHEV', 'EV', 'PHEV', 'REEV', 'ELECTRICO', 'HIBRIDO'].includes(norm)) {
          countNuevasEnergias++;
        } else if (['NAFTA', 'DIESEL', 'FLEX'].includes(norm)) {
          countCombustion++;
        }
        combustibleMap[norm] = (combustibleMap[norm] || 0) + 1;
      };
      if (Array.isArray(combVal)) combVal.forEach(addComb);
      else if (typeof combVal === 'string') addComb(combVal);

      // Plazas
      const pVal = eff.plazas || a.plazas || a.personas;
      if (pVal && pVal !== 'any') {
        const num = Number(pVal);
        if (num <= 2) plazasMap['1-2 Plazas']++;
        else if (num >= 6) plazasMap['7+ Plazas']++;
        else plazasMap['4-5 Plazas']++;
      }

      // Prioridad
      const prio = a.prioridad || '';
      if (prio === 'consumo') prioridadMap['Economía / Consumo']++;
      else if (prio === 'seguridad' || a.uso === 'familia') prioridadMap['Seguridad / ADAS']++;
      else if (prio === 'tecnologia') prioridadMap['Tecnología / Confort']++;
      else if (prio === 'precio') prioridadMap['Precio más bajo']++;

      // Transmisión
      const tr = (eff.transmision || a.transmision || '').toLowerCase();
      if (tr.includes('auto') || tr.includes('at')) transAuto++;
      else if (tr.includes('man') || tr.includes('mt')) transManual++;
    });

    const totalEnergy = countNuevasEnergias + countCombustion;
    const newEnergyPct = totalEnergy > 0 ? Math.round((countNuevasEnergias / totalEnergy) * 100) : 0;

    const sortedCarrocerias = Object.entries(carroceriaMap)
      .sort((a, b) => b[1] - a[1]);
    const topCarroceria = sortedCarrocerias[0]?.[0] || 'SUV';

    const totalPlazas = (plazasMap['1-2 Plazas'] + plazasMap['4-5 Plazas'] + plazasMap['7+ Plazas']) || 1;
    const sevenSeatsPct = Math.round((plazasMap['7+ Plazas'] / totalPlazas) * 100);

    return {
      total,
      budgetMap,
      sortedCarrocerias,
      topCarroceria,
      countNuevasEnergias,
      countCombustion,
      newEnergyPct,
      combustibleMap,
      plazasMap,
      sevenSeatsPct,
      prioridadMap,
      transAuto,
      transManual,
    };
  }, [wizardStatsList, leadsList]);

  const handleToggleAd = async (id: string, currentStatus: boolean) => {
    setLoading(true);
    try { 
      await setDoc(doc(db, 'campaigns', id), { isActive: !currentStatus }, { merge: true }); 
      invalidateCatalogCache('campaigns');
      setFeedback({ type: 'success', message: `Campaña ${!currentStatus ? 'Activada' : 'Pausada'} correctamente.` }); fetchAllData(); 
    } catch (err: any) { setFeedback({ type: 'error', message: err.message }); } finally { setLoading(false); }
  };

  const handleSaveBlogPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blogPostForm.title || !blogPostForm.content) return;
    setLoading(true);
    try {
      const slug = (blogPostForm.slug.trim() || generarSlug(blogPostForm.title)).toLowerCase();
      const id = blogPostForm.id || `post_${generarId()}`;
      await setDoc(doc(db, 'blog_posts', id), {
        ...blogPostForm,
        slug,
        updatedAt: serverTimestamp(),
        publishedAt: blogPostForm.published ? new Date().toISOString().split('T')[0] : '',
      }, { merge: true });
      setFeedback({ type: 'success', message: 'Artículo de blog guardado exitosamente.' });
      setBlogPostForm({
        id: '',
        title: '',
        slug: '',
        category: 'Guías de Compra',
        excerpt: '',
        content: '',
        coverImage: '',
        author: 'Redacción DATACAR',
        published: true,
        readTimeMinutes: 4,
      });
      fetchAllData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePostPublish = async (id: string, currentStatus: boolean) => {
    setLoading(true);
    try {
      await setDoc(doc(db, 'blog_posts', id), {
        published: !currentStatus,
        updatedAt: serverTimestamp(),
        publishedAt: !currentStatus ? new Date().toISOString().split('T')[0] : '',
      }, { merge: true });
      setFeedback({ type: 'success', message: `Artículo ${!currentStatus ? 'Publicado' : 'Guardado como borrador'}.` });
      fetchAllData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const triggerEditBlogPost = (post: any) => {
    setBlogPostForm({
      id: post.id,
      title: post.title || '',
      slug: post.slug || '',
      category: post.category || 'Guías de Compra',
      excerpt: post.excerpt || '',
      content: post.content || '',
      coverImage: post.coverImage || '',
      author: post.author || 'Redacción DATACAR',
      published: post.published !== false,
      readTimeMinutes: Number(post.readTimeMinutes) || 4,
    });
    setBlogSubTab('posts');
  };

  const handleSaveVideoReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoReviewForm.title || !videoReviewForm.url) return;
    setLoading(true);
    try {
      const id = videoReviewForm.id || `vid_${generarId()}`;
      await setDoc(doc(db, 'video_reviews', id), {
        ...videoReviewForm,
        id,
        order: Number(videoReviewForm.order) || 1,
        createdAt: serverTimestamp(),
      }, { merge: true });
      setFeedback({ type: 'success', message: 'Miniatura y datos del Reel guardados exitosamente.' });
      setVideoReviewForm({
        id: '',
        title: '',
        url: 'https://www.instagram.com/datacarpy/',
        thumbnail: '',
        tag: 'Reel IG',
        order: (videoReviewsList.length || 0) + 1,
      });
      fetchAllData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const triggerEditVideoReview = (video: any) => {
    setVideoReviewForm({
      id: video.id,
      title: video.title || '',
      url: video.url || '',
      thumbnail: video.thumbnail || '',
      tag: video.tag || 'Reel IG',
      order: Number(video.order) || 1,
    });
    setBlogSubTab('videos');
    const el = document.getElementById('video-review-form-container');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const handleCancelVideoReviewEdit = () => {
    setVideoReviewForm({
      id: '',
      title: '',
      url: 'https://www.instagram.com/datacarpy/',
      thumbnail: '',
      tag: 'Reel IG',
      order: (videoReviewsList.length || 0) + 1,
    });
  };

  const filteredMarcas = useMemo(() => {
    return marcasList.filter(m => {
      if (abmMarcaFilterOrigen !== 'Todos' && (m.origen_marca || '').trim().toUpperCase() !== abmMarcaFilterOrigen.toUpperCase()) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        if (!m.name.toLowerCase().includes(term) && !m.id.toLowerCase().includes(term) && !(m.origen_marca || '').toLowerCase().includes(term)) return false;
      }
      return true;
    });
  }, [marcasList, abmMarcaFilterOrigen, searchTerm]);

  const filteredModelos = useMemo(() => {
    return modelosList.filter(m => {
      if (abmModelFilterMarca !== 'Todas' && m.brandId !== abmModelFilterMarca) return false;
      if (abmModelFilterCarroceria !== 'Todas' && normalizeCarroceria(m.tipo_carroceria) !== abmModelFilterCarroceria) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const brandObj = marcasList.find(b => b.id === m.brandId);
        const matchName = m.name.toLowerCase().includes(term);
        const matchBrand = brandObj?.name?.toLowerCase().includes(term);
        const matchId = m.id.toLowerCase().includes(term);
        if (!matchName && !matchBrand && !matchId) return false;
      }
      return true;
    });
  }, [modelosList, abmModelFilterMarca, abmModelFilterCarroceria, searchTerm, marcasList]);

  const filteredVersiones = useMemo(() => {
    return versionesList.filter(v => {
      const modelObj = modelosList.find(m => m.id === v.modelId);
      if (abmVerFilterMarca !== 'Todas' && modelObj?.brandId !== abmVerFilterMarca) return false;
      if (abmVerFilterModelo !== 'Todos' && v.modelId !== abmVerFilterModelo) return false;
      if (abmVerFilterDealer !== 'Todas' && (v.concesionaria || '').trim().toUpperCase() !== abmVerFilterDealer.toUpperCase()) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const brandObj = modelObj ? marcasList.find(b => b.id === modelObj.brandId) : null;
        const matchName = v.name?.toLowerCase().includes(term);
        const matchModel = modelObj?.name?.toLowerCase().includes(term);
        const matchBrand = brandObj?.name?.toLowerCase().includes(term);
        const matchDealer = (v.concesionaria || '').toLowerCase().includes(term);
        const matchMotor = (v.specs?.motor || '').toLowerCase().includes(term);
        if (!matchName && !matchModel && !matchBrand && !matchDealer && !matchMotor) return false;
      }
      return true;
    });
  }, [versionesList, modelosList, marcasList, abmVerFilterMarca, abmVerFilterModelo, abmVerFilterDealer, searchTerm]);

  const filteredConcesionarias = useMemo(() => {
    return concesionariasList.filter(c => {
      if (abmConcFilterStatus !== 'Todos' && (c.status || 'active') !== abmConcFilterStatus) return false;
      if (abmConcFilterCheck === 'con_check' && !c.datacarCheck) return false;
      if (abmConcFilterCheck === 'sin_check' && c.datacarCheck) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        if (!c.name.toLowerCase().includes(term) && !c.id.toLowerCase().includes(term) && !(c.email_gerencia || '').toLowerCase().includes(term)) return false;
      }
      return true;
    });
  }, [concesionariasList, abmConcFilterStatus, abmConcFilterCheck, searchTerm]);
  const checkedDealershipSet = useMemo(() => buildCheckedDealershipSet(concesionariasList), [concesionariasList]);
  const filteredSolicitudes = useMemo(() => solicitudesList.filter(r => r.concesionaria.toLowerCase().includes(searchTerm.toLowerCase())), [solicitudesList, searchTerm]);

  // Combina los 5 reels oficiales predeterminados con los que hayan sido editados o creados en Firestore
  const combinedReelsList = useMemo(() => {
    const merged = DEFAULT_REELS.map(def => {
      const found = videoReviewsList.find((r: any) => r.id === def.id);
      return found ? { ...def, ...found, isCustomSaved: true } : { ...def, isCustomSaved: false };
    });
    const extras = videoReviewsList
      .filter((r: any) => !DEFAULT_REELS.some(def => def.id === r.id))
      .map((r: any) => ({ ...r, isCustomSaved: true }));
    return [...merged, ...extras].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  }, [videoReviewsList]);

  // Pantalla de Carga de Autenticación
  if (isAuthLoading) return <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center font-bold text-[#0A1F33] tracking-widest uppercase text-sm">Validando credenciales ejecutivas...</div>;

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex text-[#3A3A3C] font-sans">
      
      {/* SIDEBAR CORPORATIVO */}
      <aside className="w-64 bg-[#0A1F33] text-[#FFFFFF] min-h-screen flex flex-col border-r border-[#0A1F33] shrink-0 sticky top-0">
        <div className="p-6 border-b border-[#FFFFFF]/10">
          <div className="font-black text-2xl tracking-widest uppercase mb-1" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>DATA<span className="font-light">CAR</span></div>
          <span className="text-[8px] text-[#00BFFF] border border-[#00BFFF] px-2 py-0.5 uppercase tracking-widest font-bold">Terminal Admin</span>
        </div>
        
        <nav className="flex flex-col flex-grow py-6 text-[10px] font-bold uppercase tracking-widest overflow-y-auto custom-scrollbar" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
          <span className="text-[#C0C0C0] px-6 mb-3">CRM & Operaciones</span>
          <button onClick={() => { setActiveTab('dashboard'); setSearchTerm(''); }} className={`text-left px-6 py-3 transition-colors border-l-2 ${activeTab === 'dashboard' ? 'border-[#00BFFF] bg-[#FFFFFF]/10 text-[#00BFFF]' : 'border-transparent text-[#FFFFFF] hover:bg-[#FFFFFF]/5'}`}>Dashboard Leads</button>
          <button onClick={() => { setActiveTab('newsletter'); setSearchTerm(''); }} className={`text-left px-6 py-3 transition-colors border-l-2 flex items-center justify-between ${activeTab === 'newsletter' ? 'border-[#00BFFF] bg-[#FFFFFF]/10 text-[#00BFFF]' : 'border-transparent text-[#FFFFFF] hover:bg-[#FFFFFF]/5'}`}>
            <span>Newsletter & Emailing</span>
            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-none ${activeTab === 'newsletter' ? 'bg-[#00BFFF] text-[#0A1F33]' : 'bg-[#FFFFFF]/15 text-white'}`}>
              {newsletterSubscribers.length}
            </span>
          </button>
          <button onClick={() => { setActiveTab('analitica'); setSearchTerm(''); }} className={`text-left px-6 py-3 transition-colors border-l-2 ${activeTab === 'analitica' ? 'border-[#00BFFF] bg-[#FFFFFF]/10 text-[#00BFFF]' : 'border-transparent text-[#FFFFFF] hover:bg-[#FFFFFF]/5'}`}>Analítica & Demanda</button>
          
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
          <button onClick={() => { setActiveTab('slider_home'); setSearchTerm(''); }} className={`text-left px-6 py-3 transition-colors border-l-2 flex items-center justify-between ${activeTab === 'slider_home' ? 'border-[#00BFFF] bg-[#FFFFFF]/10 text-[#00BFFF]' : 'border-transparent text-[#FFFFFF] hover:bg-[#FFFFFF]/5'}`}>
            <span>🎠 Slider Home</span>
            <span className={`text-[8px] font-black px-1.5 py-0.5 ${activeTab === 'slider_home' ? 'bg-[#00BFFF] text-[#0A1F33]' : 'bg-[#FFFFFF]/15 text-white'}`}>
              {homeSliderConfig.slides.length}/3
            </span>
          </button>
          <button onClick={() => { setActiveTab('blog'); setSearchTerm(''); }} className={`text-left px-6 py-3 transition-colors border-l-2 ${activeTab === 'blog' ? 'border-[#00BFFF] bg-[#FFFFFF]/10 text-[#00BFFF]' : 'border-transparent text-[#FFFFFF] hover:bg-[#FFFFFF]/5'}`}>Blog & Reseñas IG</button>
        </nav>

        <div className="p-6 border-t border-[#FFFFFF]/10">
          <button onClick={handleLogout} className="text-[10px] text-[#C0C0C0] hover:text-[#FFFFFF] font-bold uppercase tracking-widest transition-colors">Cerrar Sesión ⏏</button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="bg-[#FFFFFF] border-b border-[#C0C0C0] p-6 flex justify-between items-center shrink-0">
          <h1 className="font-black text-2xl text-[#0A1F33] uppercase" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>Módulo Activo: <span className="text-[#00BFFF]">{activeTab}</span></h1>
          <button onClick={fetchAllData} className="text-[10px] font-bold text-[#3A3A3C] uppercase tracking-widest border border-[#C0C0C0] px-4 py-2 hover:border-[#0A1F33] transition-colors rounded-none outline-none">{loading ? 'Sincronizando...' : 'Sincronizar DB'}</button>
        </header>

        {feedback.message && <div className={`m-6 mb-0 p-4 text-xs font-bold uppercase tracking-widest border shrink-0 ${feedback.type === 'error' ? 'bg-[#FFE6E6] text-[#D93025] border-[#D93025]' : 'bg-[#E6F4EA] text-[#1E8E3E] border-[#1E8E3E]'}`}>{feedback.message}</div>}

        <div className="p-6 flex-grow overflow-y-auto custom-scrollbar" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
          
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
                      <select 
                        id="userB2BForm-dealership" 
                        className="w-full border p-2 text-xs focus:outline-none focus:border-[#00BFFF] rounded-none font-bold" 
                        value={userB2BForm.dealershipName} 
                        onChange={e => {
                          const newDealer = e.target.value;
                          setUserB2BForm(prev => {
                            const dealerNorm = newDealer.trim().toUpperCase();
                            const modelIdsOfNewDealer = new Set(
                              versionesList.filter(v => (v.concesionaria || '').trim().toUpperCase() === dealerNorm).map(v => v.modelId)
                            );
                            const brandIdsOfNewDealer = new Set(
                              modelosList.filter(m => modelIdsOfNewDealer.has(m.id)).map(m => m.brandId)
                            );
                            const allowedNames = new Set(
                              marcasList.filter(b => brandIdsOfNewDealer.has(b.id)).map(b => b.name.toUpperCase().trim())
                            );
                            const safeMarcas = allowedNames.size > 0 
                              ? prev.marcasPermitidas.filter(m => allowedNames.has(m.toUpperCase().trim()))
                              : [];
                            return { ...prev, dealershipName: newDealer, marcasPermitidas: safeMarcas };
                          });
                        }} 
                        required
                      >
                        <option value="">Seleccionar concesionaria...</option>
                        {concesionariasList.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>

                    <div className="border border-[#C0C0C0] p-3 bg-[#F8F9FA] mt-1">
                      <div className="flex justify-between items-center mb-2 border-b border-[#C0C0C0]/50 pb-2">
                        <span className="text-[10px] font-bold text-[#0A1F33] uppercase">
                          Marcas Permitidas (Scope B2B)
                        </span>
                        {userB2BForm.dealershipName && (
                          <span className="text-[8px] font-bold text-[#00BFFF] uppercase tracking-wider">
                            {marcasParaConcesionariaB2B.length} de {userB2BForm.dealershipName}
                          </span>
                        )}
                      </div>
                      
                      {!userB2BForm.dealershipName ? (
                        <p className="text-[9px] text-[#C0C0C0] uppercase tracking-wider py-4 text-center">
                          ⚠️ Primero seleccioná una concesionaria para habilitar sus marcas.
                        </p>
                      ) : marcasParaConcesionariaB2B.length === 0 ? (
                        <p className="text-[9px] text-[#C0C0C0] uppercase tracking-wider py-4 text-center">
                          Esta concesionaria aún no tiene marcas con inventario cargado.
                        </p>
                      ) : (
                        <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto custom-scrollbar pr-2">
                          {marcasParaConcesionariaB2B.map(m => (
                            <label key={m.id} className="flex items-center gap-2 cursor-pointer group p-1 hover:bg-white transition-colors">
                              <div className={`w-3.5 h-3.5 border flex items-center justify-center shrink-0 transition-colors ${userB2BForm.marcasPermitidas.includes(m.name) ? 'bg-[#00BFFF] border-[#00BFFF]' : 'bg-[#FFFFFF] border-[#C0C0C0] group-hover:border-[#0A1F33]'}`}>
                                {userB2BForm.marcasPermitidas.includes(m.name) && <svg className="w-2.5 h-2.5 text-[#FFFFFF]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="square" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>}
                              </div>
                              <input type="checkbox" className="hidden" checked={userB2BForm.marcasPermitidas.includes(m.name)} onChange={() => handleMarcaToggle(m.name)} />
                              <span className={`text-[9px] uppercase tracking-wider truncate ${userB2BForm.marcasPermitidas.includes(m.name) ? 'font-black text-[#0A1F33]' : 'text-[#3A3A3C]'}`}>{m.name}</span>
                            </label>
                          ))}
                        </div>
                      )}
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
                <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-6 border-l-4 border-l-[#0A1F33]">
                  <p className="text-[10px] font-bold text-[#C0C0C0] uppercase tracking-widest mb-1">Leads en Período</p>
                  <p className="font-black text-3xl text-[#0A1F33]">{filteredLeads.length}</p>
                  <p className="text-[9px] text-[#3A3A3C] font-semibold mt-1">
                    {filterDateFrom || filterDateTo ? `de ${leadsList.length} en historial total` : 'Todo el historial'}
                  </p>
                </div>
                <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-6 border-l-4 border-l-[#00BFFF]">
                  <p className="text-[10px] font-bold text-[#C0C0C0] uppercase tracking-widest mb-1">Nuevos</p>
                  <p className="font-black text-3xl text-[#00BFFF]">{filteredLeads.filter(l => l.estado === 'Nuevo').length}</p>
                  <p className="text-[9px] text-[#3A3A3C] font-semibold mt-1">
                    {filteredLeads.length > 0 ? `${Math.round((filteredLeads.filter(l => l.estado === 'Nuevo').length / filteredLeads.length) * 100)}% del período` : 'Sin registros'}
                  </p>
                </div>
                <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-6 border-l-4 border-l-[#3A3A3C]">
                  <p className="text-[10px] font-bold text-[#C0C0C0] uppercase tracking-widest mb-1">En Gestión</p>
                  <p className="font-black text-3xl text-[#3A3A3C]">{filteredLeads.filter(l => ['Contactado', 'En Negociación'].includes(l.estado)).length}</p>
                  <p className="text-[9px] text-[#3A3A3C] font-semibold mt-1">Contactado / Negociando</p>
                </div>
                <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-6 border-l-4 border-l-[#1E8E3E]">
                  <p className="text-[10px] font-bold text-[#C0C0C0] uppercase tracking-widest mb-1">Cerrados ✓</p>
                  <p className="font-black text-3xl text-[#1E8E3E]">{filteredLeads.filter(l => l.estado === 'Cerrado').length}</p>
                  <p className="text-[9px] text-[#1E8E3E] font-semibold mt-1">Ventas concretadas</p>
                </div>
              </div>
              {filteredLeads.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-6 flex flex-col"><h3 className="text-xs font-bold text-[#0A1F33] uppercase tracking-widest mb-4 border-b border-[#C0C0C0] pb-2">Autos más Cotizados</h3><div className="flex-grow"><BarChart data={topVehiculos} total={filteredLeads.length} /></div></div>
                  <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-6 flex flex-col"><h3 className="text-xs font-bold text-[#0A1F33] uppercase tracking-widest mb-4 border-b border-[#C0C0C0] pb-2">Rendimiento por Origen</h3><div className="flex-grow"><BarChart data={leadsPorOrigen} total={filteredLeads.length} /></div></div>
                  <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-6 flex flex-col"><h3 className="text-xs font-bold text-[#0A1F33] uppercase tracking-widest mb-4 border-b border-[#C0C0C0] pb-2">Tracción de Concesionarias</h3><div className="flex-grow"><BarChart data={leadsPorConcesionaria} total={filteredLeads.length} /></div></div>
                </div>
              )}
              <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-6 flex flex-col gap-4">
                <div className="flex flex-col md:flex-row justify-between md:items-center gap-3 border-b border-[#C0C0C0] pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#00BFFF]" />
                    <h3 className="text-[10px] font-bold text-[#0A1F33] uppercase tracking-widest">
                      Panel de Filtros • Mostrando {filteredLeads.length} de {leadsList.length} leads
                    </h3>
                  </div>

                  {/* Acceso Rápido de Rango de Fechas */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[9px] font-bold text-[#3A3A3C] uppercase mr-1">Rango rápido:</span>
                    <button
                      type="button"
                      onClick={() => setDatePreset('7d')}
                      className="text-[9px] font-bold uppercase px-2.5 py-1 border border-[#C0C0C0] hover:border-[#0A1F33] bg-[#F8F9FA] hover:bg-[#FFFFFF] transition-colors rounded-none"
                    >
                      7 días
                    </button>
                    <button
                      type="button"
                      onClick={() => setDatePreset('30d')}
                      className="text-[9px] font-bold uppercase px-2.5 py-1 border border-[#00BFFF] bg-[#00BFFF]/10 text-[#0080B0] hover:bg-[#00BFFF]/20 transition-colors rounded-none"
                    >
                      30 días (Default)
                    </button>
                    <button
                      type="button"
                      onClick={() => setDatePreset('90d')}
                      className="text-[9px] font-bold uppercase px-2.5 py-1 border border-[#C0C0C0] hover:border-[#0A1F33] bg-[#F8F9FA] hover:bg-[#FFFFFF] transition-colors rounded-none"
                    >
                      90 días
                    </button>
                    <button
                      type="button"
                      onClick={() => setDatePreset('year')}
                      className="text-[9px] font-bold uppercase px-2.5 py-1 border border-[#C0C0C0] hover:border-[#0A1F33] bg-[#F8F9FA] hover:bg-[#FFFFFF] transition-colors rounded-none"
                    >
                      Este Año
                    </button>
                    <button
                      type="button"
                      onClick={() => setDatePreset('all')}
                      className="text-[9px] font-bold uppercase px-2.5 py-1 border border-[#0A1F33] bg-[#0A1F33] text-white hover:bg-[#00BFFF] hover:border-[#00BFFF] transition-colors rounded-none shadow-sm"
                    >
                      Todo el Historial ({leadsList.length})
                    </button>
                  </div>
                </div>

                <div className="flex flex-col xl:flex-row gap-4 justify-between items-end">
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 w-full">
                    <div className="flex flex-col gap-1">
                      <label htmlFor="filter-date-from" className="text-[9px] font-bold text-[#0A1F33] uppercase tracking-widest flex items-center justify-between">
                        <span>Desde</span>
                        {filterDateFrom && <button type="button" onClick={() => setFilterDateFrom('')} className="text-[#D93025] hover:underline text-[8px] font-bold">✕ Limpiar</button>}
                      </label>
                      <input id="filter-date-from" type="date" className="border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#0A1F33] rounded-none" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor="filter-date-to" className="text-[9px] font-bold text-[#0A1F33] uppercase tracking-widest flex items-center justify-between">
                        <span>Hasta</span>
                        {filterDateTo && <button type="button" onClick={() => setFilterDateTo('')} className="text-[#D93025] hover:underline text-[8px] font-bold">✕ Limpiar</button>}
                      </label>
                      <input id="filter-date-to" type="date" className="border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#0A1F33] rounded-none" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor="filter-status" className="text-[9px] font-bold text-[#C0C0C0] uppercase tracking-widest">Estado</label>
                      <select id="filter-status" className="border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#0A1F33] bg-[#FFFFFF] rounded-none" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                        <option value="Todos">Todos</option><option value="Nuevo">Nuevo</option><option value="Contactado">Contactado</option><option value="En Negociación">En Negociación</option><option value="Cerrado">Cerrado</option><option value="Perdido">Perdido</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor="filter-origin" className="text-[9px] font-bold text-[#C0C0C0] uppercase tracking-widest">Origen</label>
                      <select id="filter-origin" className="border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#0A1F33] bg-[#FFFFFF] rounded-none" value={filterOrigin} onChange={(e) => setFilterOrigin(e.target.value)}>
                        <option value="Todos">Todos</option>{origenesUnicos.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor="filter-marca" className="text-[9px] font-bold text-[#00BFFF] uppercase tracking-widest">Marca</label>
                      <select id="filter-marca" className="border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#00BFFF] bg-[#FFFFFF] rounded-none" value={filterMarca} onChange={(e) => { setFilterMarca(e.target.value); setFilterModelo('Todos'); }}>
                        <option value="Todas">Todas</option>{marcasList.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor="filter-modelo" className="text-[9px] font-bold text-[#00BFFF] uppercase tracking-widest">Modelo</label>
                      <select id="filter-modelo" className="border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#00BFFF] bg-[#FFFFFF] disabled:bg-[#F8F9FA] rounded-none" value={filterModelo} onChange={(e) => setFilterModelo(e.target.value)} disabled={filterMarca === 'Todas'}>
                        <option value="Todos">Todos</option>{modelosFiltradosParaSelect.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor="filter-concesionaria" className="text-[9px] font-bold text-[#00BFFF] uppercase tracking-widest">Concesionaria</label>
                      <select id="filter-concesionaria" className="border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#00BFFF] bg-[#FFFFFF] rounded-none" value={filterConcesionaria} onChange={(e) => setFilterConcesionaria(e.target.value)}>
                        <option value="Todas">Todas</option>{concesionariasUnicas.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="w-full xl:w-64 shrink-0"><input type="text" aria-label="Búsqueda rápida" placeholder="Búsqueda rápida..." className="w-full border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#0A1F33] rounded-none" value={filterText} onChange={e => setFilterText(e.target.value)} /></div>
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

          {activeTab === 'analitica' && (
            <div className="flex flex-col gap-6 pb-8">
              {/* 1. BARRA PRINCIPAL DE FILTROS (MARCA, MODELO, RANGO DE FECHA + SEGMENTACIÓN GLOBAL) */}
              <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-4 flex flex-col gap-4 shrink-0 shadow-none">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#C0C0C0]/50 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 bg-[#00BFFF] inline-block" />
                    <span className="text-[10px] font-black text-[#0A1F33] uppercase tracking-widest">
                      Filtros de Inteligencia Competitiva & Comparaciones
                    </span>
                  </div>
                  {(isCompFiltered || filterPrefCarroceria !== 'Todas' || filterPrefCombustible !== 'Todos' || filterPrefOrigen !== 'Todos') && (
                    <button
                      type="button"
                      onClick={() => {
                        setFilterCompBrand('Todas');
                        setFilterCompModel('Todos');
                        setFilterCompCarroceria('Todas');
                        setFilterCompCombustible('Todos');
                        setFilterCompOrigen('Todos');
                        setFilterCompDateFrom('');
                        setFilterCompDateTo('');
                        setFilterPrefCarroceria('Todas');
                        setFilterPrefCombustible('Todos');
                        setFilterPrefOrigen('Todos');
                      }}
                      className="border border-[#D93025] text-[#D93025] px-3 py-1 text-[9px] font-bold uppercase hover:bg-[#D93025] hover:text-white transition-colors"
                    >
                      ✕ Restablecer Todos los Filtros
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3 items-end">
                  <div>
                    <label htmlFor="filterCompBrand" className="text-[9px] font-bold text-[#0A1F33] uppercase block mb-1">
                      Marca
                    </label>
                    <select
                      id="filterCompBrand"
                      className="w-full border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#00BFFF] rounded-none bg-[#F8F9FA] text-[#0A1F33] font-semibold"
                      value={filterCompBrand}
                      onChange={e => {
                        setFilterCompBrand(e.target.value);
                        setFilterCompModel('Todos');
                      }}
                    >
                      <option value="Todas">Todas las Marcas</option>
                      {[...marcasList].sort((a, b) => a.name.localeCompare(b.name)).map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="filterCompModel" className="text-[9px] font-bold text-[#0A1F33] uppercase block mb-1">
                      Modelo
                    </label>
                    <select
                      id="filterCompModel"
                      className="w-full border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#00BFFF] rounded-none bg-[#F8F9FA] text-[#0A1F33] font-semibold"
                      value={filterCompModel}
                      onChange={e => setFilterCompModel(e.target.value)}
                    >
                      <option value="Todos">Todos los Modelos</option>
                      {[...compModelosParaSelect].sort((a, b) => a.name.localeCompare(b.name)).map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="filterCompCarroceria" className="text-[9px] font-bold text-[#00BFFF] uppercase block mb-1">
                      Tipo de Carrocería
                    </label>
                    <select
                      id="filterCompCarroceria"
                      className="w-full border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#00BFFF] rounded-none bg-[#F8F9FA] text-[#0A1F33] font-medium"
                      value={filterCompCarroceria}
                      onChange={e => setFilterCompCarroceria(e.target.value)}
                    >
                      <option value="Todas">Todas las Carrocerías</option>
                      {categoriasUnicas.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="filterCompCombustible" className="text-[9px] font-bold text-[#00BFFF] uppercase block mb-1">
                      Motor / Energía
                    </label>
                    <select
                      id="filterCompCombustible"
                      className="w-full border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#00BFFF] rounded-none bg-[#F8F9FA] text-[#0A1F33] font-medium"
                      value={filterCompCombustible}
                      onChange={e => setFilterCompCombustible(e.target.value)}
                    >
                      <option value="Todos">Todos los Motores</option>
                      <option value="NUEVAS_ENERGIAS">⚡ Nuevas Energías (EV / PHEV / HEV / MHEV)</option>
                      <option value="COMBUSTION">⛽ Combustión (Nafta / Diésel / Flex)</option>
                      {combustiblesUnicos.map(comb => (
                        <option key={comb} value={comb}>{comb} — {combustibleLabel(comb)}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="filterCompOrigen" className="text-[9px] font-bold text-[#00BFFF] uppercase block mb-1">
                      Origen
                    </label>
                    <select
                      id="filterCompOrigen"
                      className="w-full border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#00BFFF] rounded-none bg-[#F8F9FA] text-[#0A1F33] font-medium"
                      value={filterCompOrigen}
                      onChange={e => setFilterCompOrigen(e.target.value)}
                    >
                      <option value="Todos">Todos los Orígenes</option>
                      {origenesAutosUnicos.map(orig => (
                        <option key={orig} value={orig}>{orig}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="filterCompDateFrom" className="text-[9px] font-bold text-[#0A1F33] uppercase block mb-1">
                      Desde
                    </label>
                    <input
                      id="filterCompDateFrom"
                      type="date"
                      className="w-full border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#00BFFF] rounded-none bg-[#F8F9FA] text-[#0A1F33]"
                      value={filterCompDateFrom}
                      onChange={e => setFilterCompDateFrom(e.target.value)}
                    />
                  </div>

                  <div>
                    <label htmlFor="filterCompDateTo" className="text-[9px] font-bold text-[#0A1F33] uppercase block mb-1">
                      Hasta
                    </label>
                    <input
                      id="filterCompDateTo"
                      type="date"
                      className="w-full border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#00BFFF] rounded-none bg-[#F8F9FA] text-[#0A1F33]"
                      value={filterCompDateTo}
                      onChange={e => setFilterCompDateTo(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* 2. ENCABEZADO Y RESUMEN DE MUESTRA */}
              <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-4 flex flex-wrap justify-between items-center gap-4 shrink-0">
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-widest text-[#0A1F33] block">
                    Inteligencia Competitiva y Analítica de Comparaciones DATACAR
                  </h2>
                  <p className="text-[10px] text-[#3A3A3C] mt-0.5">
                    {isCompFiltered
                      ? `Segmento activo (${considerationStats.focalLabel}): analizando ${filteredComparisons.length} de ${comparisonStatsList.length} comparaciones registradas.`
                      : `Vista global: analizando el 100% del historial de comparativas (${comparisonStatsList.length} registros).`
                    }
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {globalCircularAnalytics.hasFocal && (
                    <span className="bg-[#F5FBFF] text-[#0A1F33] border border-[#00BFFF] px-3 py-2 text-[9px] font-bold uppercase tracking-wider">
                      Concesionaria Base: {globalCircularAnalytics.focalConcesionariasLabel}
                    </span>
                  )}
                  <div className="bg-[#0A1F33] text-[#00BFFF] px-4 py-2 text-[10px] font-bold uppercase tracking-widest border border-[#00BFFF]/30">
                    Comparativas: {filteredComparisons.length} {isCompFiltered && `/ ${comparisonStatsList.length}`}
                  </div>
                </div>
              </div>

              {/* 3. BLOQUE SUPERIOR: TOTAL + MEDICIÓN DE "CONSIDERACIÓN" (SLOT #1) + TOP 10 DE COMPARATIVAS */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 shrink-0">
                {/* Tarjeta A: Total de Comparaciones & Índice de Primera Elección (Slot #1) */}
                <div className="lg:col-span-5 bg-[#FFFFFF] border border-[#C0C0C0] p-5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between border-b border-[#C0C0C0]/60 pb-2.5 mb-4">
                      <div>
                        <span className="bg-[#00BFFF] text-[#0A1F33] text-[8px] font-black uppercase px-2 py-0.5 tracking-widest">
                          Slot #1 del Comparador
                        </span>
                        <h3 className="text-xs font-black text-[#0A1F33] uppercase tracking-wider mt-1">
                          Medición de Consideración (1ra Elección)
                        </h3>
                      </div>
                      <div className="text-right">
                        <span className="text-[8px] font-bold text-[#C0C0C0] uppercase block">Total Muestra</span>
                        <span className="text-2xl font-black text-[#0A1F33]" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
                          {filteredComparisons.length}
                        </span>
                      </div>
                    </div>

                    {/* Destaque de Q de veces elegido primero cuando hay Modelo o Marca seleccionada */}
                    {(considerationStats.hasFocalModel || considerationStats.hasFocalBrand) ? (
                      <div className="bg-[#F5FBFF] border border-[#00BFFF] p-3.5 mb-4">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="text-[10px] font-black text-[#0A1F33] uppercase truncate">
                            🎯 {considerationStats.focalLabel}
                          </span>
                          <span className="bg-[#0A1F33] text-[#00BFFF] text-[9px] font-black px-2 py-0.5 uppercase shrink-0">
                            {considerationStats.focalPct}% Consideración 1ra Opción
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 my-2.5 text-center">
                          <div className="bg-white border border-[#C0C0C0]/60 p-2">
                            <span className="text-lg font-black text-[#00BFFF] block leading-none">
                              {considerationStats.focalFirstSlotCount}
                            </span>
                            <span className="text-[8px] font-bold text-[#0A1F33] uppercase block mt-1">
                              Q Elegido 1º (Slot 1)
                            </span>
                          </div>
                          <div className="bg-white border border-[#C0C0C0]/60 p-2">
                            <span className="text-lg font-black text-[#3A3A3C] block leading-none">
                              {considerationStats.focalChallengerCount}
                            </span>
                            <span className="text-[8px] font-bold text-[#3A3A3C] uppercase block mt-1">
                              Q en Slot 2º / 3º
                            </span>
                          </div>
                          <div className="bg-white border border-[#C0C0C0]/60 p-2">
                            <span className="text-lg font-black text-[#0A1F33] block leading-none">
                              {considerationStats.focalTotalCount}
                            </span>
                            <span className="text-[8px] font-bold text-[#0A1F33] uppercase block mt-1">
                              Total Apariciones
                            </span>
                          </div>
                        </div>

                        <div className="w-full bg-[#E2E8F0] h-2 overflow-hidden">
                          <div
                            className="bg-[#00BFFF] h-full transition-all duration-500"
                            style={{ width: `${considerationStats.focalPct}%` }}
                          />
                        </div>
                        <p className="text-[9px] text-[#3A3A3C] mt-1.5 leading-snug">
                          Fue elegido como <strong>primera opción (Slot #1)</strong> en <strong>{considerationStats.focalFirstSlotCount}</strong> de las <strong>{considerationStats.focalTotalCount}</strong> comparativas donde participó ({considerationStats.focalPct}%).
                        </p>
                      </div>
                    ) : (
                      <p className="text-[10px] text-[#3A3A3C] mb-3 leading-snug bg-[#F8F9FA] border border-[#C0C0C0]/60 p-2.5">
                        El <strong>Slot #1</strong> representa el primer vehículo que el usuario elige como referencia principal. Seleccioná una <strong>Marca</strong> o <strong>Modelo</strong> arriba para auditar su índice exacto, o revisá el ranking general abajo:
                      </p>
                    )}

                    {/* Tabla compacta de Ranking de Consideración (Q de veces en Slot #1) */}
                    <div>
                      <span className="text-[9px] font-bold text-[#0A1F33] uppercase tracking-widest block mb-2">
                        {considerationStats.hasFocalBrand && !considerationStats.hasFocalModel
                          ? 'Modelos de la Marca por Q de 1ra Elección (Slot #1)'
                          : 'Top Modelos Elegidos en 1er Lugar (Slot #1)'}
                      </span>
                      <div className="max-h-44 overflow-y-auto custom-scrollbar border border-[#C0C0C0]/50">
                        {considerationStats.ranking.length === 0 ? (
                          <p className="p-4 text-[10px] text-[#C0C0C0] uppercase text-center">Sin datos para este filtro</p>
                        ) : (
                          <table className="w-full text-left border-collapse text-[10px]">
                            <thead className="bg-[#F8F9FA] sticky top-0 border-b border-[#C0C0C0]/50 text-[8px] font-bold uppercase text-[#3A3A3C]">
                              <tr>
                                <th className="p-2">Modelo</th>
                                <th className="p-2 text-center">Q 1º (Slot 1)</th>
                                <th className="p-2 text-center">Total Comp.</th>
                                <th className="p-2 text-right">% Consid.</th>
                              </tr>
                            </thead>
                            <tbody>
                              {considerationStats.ranking.map((r, i) => (
                                <tr key={i} className="border-b border-[#F1F5F9] hover:bg-[#F5FBFF]">
                                  <td className="p-2 font-bold text-[#0A1F33] uppercase truncate max-w-[160px]" title={r.fullName}>
                                    {r.fullName}
                                  </td>
                                  <td className="p-2 text-center font-black text-[#00BFFF]">
                                    {r.firstSlot}
                                  </td>
                                  <td className="p-2 text-center text-[#3A3A3C] font-semibold">
                                    {r.total}
                                  </td>
                                  <td className="p-2 text-right font-black text-[#0A1F33]">
                                    {r.pct}%
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tarjeta B: Top 10 Combos Más Comparados */}
                <div className="lg:col-span-7 bg-[#FFFFFF] border border-[#C0C0C0] p-5 flex flex-col h-full">
                  <div className="flex items-center justify-between border-b border-[#C0C0C0]/60 pb-2.5 mb-4">
                    <div>
                      <span className="bg-[#0A1F33] text-[#00BFFF] text-[8px] font-black uppercase px-2 py-0.5 tracking-widest">
                        Ranking de Enfrentamientos
                      </span>
                      <h3 className="text-xs font-black text-[#0A1F33] uppercase tracking-wider mt-1">
                        Top 10 de Comparativas {isCompFiltered ? '(Segmento Filtrado)' : '(100% de la Muestra)'}
                      </h3>
                    </div>
                    <span className="text-[9px] font-bold text-[#3A3A3C] uppercase">
                      Top {topComparisons.length} combos
                    </span>
                  </div>
                  <div className="overflow-y-auto custom-scrollbar flex-grow pr-1 max-h-[310px]">
                    <BarChart data={topComparisons} total={filteredComparisons.length} />
                  </div>
                </div>
              </div>

              {/* 4. ANALÍTICA GLOBAL Y COMPETITIVA: 4 GRÁFICOS CIRCULARES */}
              <div className="flex flex-col gap-3 shrink-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-black text-[#0A1F33] uppercase tracking-widest">
                      Analítica Competitiva Global (Cruces por Origen, Carrocería, Motorización y Concesionaria)
                    </h3>
                    <p className="text-[10px] text-[#3A3A3C]">
                      {globalCircularAnalytics.hasFocal
                        ? `Mostrando contra qué orígenes, carrocerías, motorizaciones y concesionarias compite ${considerationStats.focalLabel}.`
                        : 'Distribución global de cruces competitivos en el comparador. Filtrá por Marca o Modelo arriba para ver sus enfrentamientos directos.'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  {/* Gráfico Circular 1: Vs Otros Orígenes */}
                  <DonutChartCard
                    title="1. Vs. Otros Orígenes"
                    subtitle={
                      globalCircularAnalytics.hasFocal
                        ? `% de duelos contra vehículos de otro origen vs. mismo origen.`
                        : `% de comparativas que enfrentan vehículos de distinto país de origen.`
                    }
                    centerValue={`${globalCircularAnalytics.origen.vsOtherPct}%`}
                    centerLabel="Vs. Otro Origen"
                    badgeText={`${globalCircularAnalytics.origen.vsOtherPct}% Otro Origen`}
                    slices={globalCircularAnalytics.origen.slices}
                  />

                  {/* Gráfico Circular 2: Vs Otras Carrocerías */}
                  <DonutChartCard
                    title="2. Vs. Otras Carrocerías"
                    subtitle={
                      globalCircularAnalytics.hasFocal
                        ? `% de comparaciones frente a otras siluetas/carrocerías.`
                        : `% de comparativas cruzadas entre distintos tipos de carrocería.`
                    }
                    centerValue={`${globalCircularAnalytics.carroceria.vsOtherPct}%`}
                    centerLabel="Vs. Otra Carrocería"
                    badgeText={`${globalCircularAnalytics.carroceria.vsOtherPct}% Otra Silueta`}
                    slices={globalCircularAnalytics.carroceria.slices}
                  />

                  {/* Gráfico Circular 3: Vs Otros Tipos de Motor y/o Nuevas Energías */}
                  <DonutChartCard
                    title="3. Vs. Motores / Nuevas Energías"
                    subtitle={
                      globalCircularAnalytics.hasFocal
                        ? `Cruce contra otros motores • Presencia Nuevas Energías: ${globalCircularAnalytics.motor.newEnergyPct}%.`
                        : `Distribución de motorizaciones • Cruce con Nuevas Energías: ${globalCircularAnalytics.motor.newEnergyPct}%.`
                    }
                    centerValue={`${globalCircularAnalytics.motor.vsOtherPct}%`}
                    centerLabel="Vs. Otro Motor"
                    badgeText={`${globalCircularAnalytics.motor.newEnergyPct}% Nuevas Energías`}
                    slices={globalCircularAnalytics.motor.slices}
                  />

                  {/* Gráfico Circular 4: Vs Marcas de Otra Concesionaria */}
                  <DonutChartCard
                    title="4. Vs. Otra Concesionaria"
                    subtitle={
                      globalCircularAnalytics.hasFocal
                        ? `Comparaciones contra marcas fuera de ${globalCircularAnalytics.focalConcesionariasLabel}.`
                        : `% de comparativas entre marcas de distintas concesionarias.`
                    }
                    centerValue={`${globalCircularAnalytics.concesionaria.vsOtherPct}%`}
                    centerLabel="Otra Concesionaria"
                    badgeText={`${globalCircularAnalytics.concesionaria.vsOtherPct}% Externa`}
                    slices={globalCircularAnalytics.concesionaria.slices}
                  />
                </div>
              </div>

              {/* 5. SUBMÓDULO: TELEMETRÍA DE PREFERENCIAS (CON FILTROS POR MODELO, MOTOR, CARROCERÍA, ORIGEN) */}
              <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-4 sm:p-5 shrink-0 shadow-none">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4 pb-3 border-b border-[#C0C0C0]/60">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="bg-[#00BFFF] text-[#0A1F33] text-[9px] font-black uppercase px-2 py-0.5 tracking-wider">
                        Telemetría de Preferencias
                      </span>
                      <span className="text-[10px] font-bold text-[#0A1F33] uppercase tracking-widest">
                        ¿Qué valora el público comprador?
                      </span>
                    </div>
                    <h3
                      className="text-sm font-black text-[#0A1F33] uppercase tracking-wider"
                      style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}
                    >
                      Distribución de Intereses de los Usuarios (Motor, Seguridad, Confort y Economía)
                    </h3>
                    <p className="text-[10px] text-[#3A3A3C] mt-0.5">
                      Combiná los filtros de abajo (o los de Marca y Modelo arriba) para descubrir qué atributo prioriza cada perfil de comprador.
                    </p>
                  </div>

                  <div className="flex items-center gap-4 text-right self-start lg:self-center">
                    <div>
                      <span className="text-[9px] font-bold text-[#C0C0C0] uppercase tracking-widest block">
                        Prioridad #1 del Segmento
                      </span>
                      <span className="text-xs font-black text-[#0A1F33] uppercase">
                        {preferenceStats.topAttribute}
                      </span>
                    </div>
                    <div className="bg-[#0A1F33] text-[#00BFFF] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border border-[#00BFFF]/30 shrink-0">
                      Muestras: {preferenceStats.count}
                    </div>
                  </div>
                </div>

                {/* FILTROS ESPECÍFICOS DE TELEMETRÍA DE PREFERENCIAS (MOTOR, CARROCERÍA, ORIGEN) */}
                <div className="bg-[#F8F9FA] border border-[#C0C0C0]/70 p-3 mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div>
                    <label htmlFor="filterPrefCombustible" className="text-[9px] font-bold text-[#0A1F33] uppercase block mb-1">
                      Filtrar Preferencias por Tipo de Motor / Energía
                    </label>
                    <select
                      id="filterPrefCombustible"
                      className="w-full border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#00BFFF] bg-white text-[#0A1F33] font-semibold"
                      value={filterPrefCombustible}
                      onChange={e => setFilterPrefCombustible(e.target.value)}
                    >
                      <option value="Todos">Todos los Tipos de Motor</option>
                      <option value="NUEVAS_ENERGIAS">⚡ Solo Nuevas Energías (EV / PHEV / HEV / MHEV)</option>
                      <option value="COMBUSTION">⛽ Solo Combustión (Nafta / Diésel / Flex)</option>
                      {combustiblesUnicos.map(comb => (
                        <option key={comb} value={comb}>{comb} — {combustibleLabel(comb)}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="filterPrefCarroceria" className="text-[9px] font-bold text-[#0A1F33] uppercase block mb-1">
                      Filtrar Preferencias por Tipo de Carrocería
                    </label>
                    <select
                      id="filterPrefCarroceria"
                      className="w-full border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#00BFFF] bg-white text-[#0A1F33] font-semibold"
                      value={filterPrefCarroceria}
                      onChange={e => setFilterPrefCarroceria(e.target.value)}
                    >
                      <option value="Todas">Todas las Carrocerías</option>
                      {categoriasUnicas.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="filterPrefOrigen" className="text-[9px] font-bold text-[#0A1F33] uppercase block mb-1">
                      Filtrar Preferencias por Origen
                    </label>
                    <select
                      id="filterPrefOrigen"
                      className="w-full border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#00BFFF] bg-white text-[#0A1F33] font-semibold"
                      value={filterPrefOrigen}
                      onChange={e => setFilterPrefOrigen(e.target.value)}
                    >
                      <option value="Todos">Todos los Orígenes</option>
                      {origenesAutosUnicos.map(orig => (
                        <option key={orig} value={orig}>{orig}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {preferenceStats.hasData ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {preferenceStats.ranked.map(item => (
                      <div
                        key={item.id}
                        className="bg-[#F8F9FA] border border-[#C0C0C0]/60 p-4 flex flex-col justify-between"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold uppercase text-[#0A1F33] flex items-center gap-1.5">
                            <span>{item.icon}</span> <span>{item.name}</span>
                          </span>
                          <span className="text-base font-black text-[#0A1F33]" style={{ fontFamily: 'var(--font-montserrat)' }}>
                            {item.avg}%
                          </span>
                        </div>

                        <div className="w-full bg-[#E0E0E0] h-2 mb-2 overflow-hidden">
                          <div
                            className="h-full transition-all duration-500 bg-[#00BFFF]"
                            style={{ width: `${item.avg}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-[9px] text-[#3A3A3C] font-semibold uppercase tracking-wider">
                          <span>Intensidad de slider</span>
                          <span className="text-[#0A1F33] font-bold">Peso relativo: {item.sharePct}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-[#F8F9FA] border border-dashed border-[#C0C0C0] p-6 text-center">
                    <p className="text-xs font-bold text-[#0A1F33] uppercase tracking-wider mb-1">
                      Aún no hay muestras de ponderación para esta combinación de filtros
                    </p>
                    <p className="text-[10px] text-[#3A3A3C] max-w-md mx-auto">
                      A medida que los compradores interactúen con los sliders del comparador dinámico, este módulo promediará qué valora el público según modelo, motorización, carrocería y origen.
                    </p>
                  </div>
                )}
              </div>

              {/* ================================================================ */}
              {/* 6. TELEMETRÍA DE DEMANDA: PREFERENCIAS DEL RECOMENDADOR B2B       */}
              {/* ================================================================ */}
              <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-6 flex flex-col gap-6 shadow-none">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#C0C0C0]/50 pb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2.5 h-2.5 bg-[#00BFFF] inline-block" />
                      <h3 className="text-xs font-black uppercase tracking-widest text-[#0A1F33]">
                        Inteligencia de Demanda: Preferencias del Recomendador DATACAR
                      </h3>
                      <span className="bg-[#00BFFF]/15 text-[#0A1F33] border border-[#00BFFF] px-2 py-0.5 text-[8px] font-black uppercase">
                        Demanda Real de Mercado
                      </span>
                    </div>
                    <p className="text-[10px] text-[#3A3A3C]">
                      Análisis agregado de los atributos, presupuestos y prioridades elegidos por compradores al perfilar su 0km ideal en Paraguay.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-[#F8F9FA] border border-[#C0C0C0] text-[#0A1F33] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider">
                      Muestra Total: <strong className="text-[#00BFFF] font-black">{recomendadorDemandStats.total}</strong> sesiones analizadas
                    </span>
                  </div>
                </div>

                {/* KPI HIGHLIGHT CARDS */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-[#F8F9FA] border border-[#C0C0C0]/60 p-4">
                    <span className="text-[9px] font-bold text-[#C0C0C0] uppercase tracking-wider block mb-1">Muestra de Compradores</span>
                    <span className="font-black text-2xl text-[#0A1F33]" style={{ fontFamily: 'var(--font-montserrat)' }}>
                      {recomendadorDemandStats.total}
                    </span>
                    <span className="text-[8px] text-[#1E8E3E] font-bold uppercase block mt-1">✓ Leads & Sesiones Wizard</span>
                  </div>

                  <div className="bg-[#F8F9FA] border border-[#C0C0C0]/60 p-4">
                    <span className="text-[9px] font-bold text-[#C0C0C0] uppercase tracking-wider block mb-1">Preferencia Nuevas Energías</span>
                    <span className="font-black text-2xl text-[#00BFFF]" style={{ fontFamily: 'var(--font-montserrat)' }}>
                      {recomendadorDemandStats.newEnergyPct}%
                    </span>
                    <span className="text-[8px] text-[#3A3A3C] font-semibold uppercase block mt-1">HEV / PHEV / EV / MHEV</span>
                  </div>

                  <div className="bg-[#F8F9FA] border border-[#C0C0C0]/60 p-4">
                    <span className="text-[9px] font-bold text-[#C0C0C0] uppercase tracking-wider block mb-1">Carrocería #1 Más Buscada</span>
                    <span className="font-black text-2xl text-[#0A1F33] truncate block" style={{ fontFamily: 'var(--font-montserrat)' }}>
                      {recomendadorDemandStats.topCarroceria}
                    </span>
                    <span className="text-[8px] text-[#00BFFF] font-bold uppercase block mt-1">Líder en Intención de Compra</span>
                  </div>

                  <div className="bg-[#F8F9FA] border border-[#C0C0C0]/60 p-4">
                    <span className="text-[9px] font-bold text-[#C0C0C0] uppercase tracking-wider block mb-1">Demanda 7 Plazas (Familiar)</span>
                    <span className="font-black text-2xl text-[#0A1F33]" style={{ fontFamily: 'var(--font-montserrat)' }}>
                      {recomendadorDemandStats.sevenSeatsPct}%
                    </span>
                    <span className="text-[8px] text-[#3A3A3C] font-semibold uppercase block mt-1">Vehículos con 3 Filas</span>
                  </div>
                </div>

                {/* MATRIZ DE 6 TARJETAS GRÁFICAS DE DEMANDA */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* 1. PRESUPUESTO DECLARADO */}
                  <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between border-b border-[#C0C0C0]/40 pb-2 mb-3">
                        <span className="text-[10px] font-black text-[#0A1F33] uppercase tracking-wider">
                          1. Rango de Presupuesto
                        </span>
                        <span className="text-[9px] text-[#C0C0C0] font-bold uppercase">USD</span>
                      </div>
                      <div className="flex flex-col gap-3">
                        {Object.entries(recomendadorDemandStats.budgetMap).map(([key, item]) => {
                          const totalPres = Object.values(recomendadorDemandStats.budgetMap).reduce((acc, curr) => acc + curr.count, 0) || 1;
                          const pct = Math.round((item.count / totalPres) * 100);
                          return (
                            <div key={key}>
                              <div className="flex justify-between items-center text-[10px] font-bold text-[#0A1F33] mb-1">
                                <span>{item.label}</span>
                                <span className="font-mono text-[11px]">{pct}% ({item.count})</span>
                              </div>
                              <div className="w-full bg-[#E0E0E0] h-2 rounded-none overflow-hidden">
                                <div className="h-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: item.color }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <span className="text-[8px] text-[#C0C0C0] uppercase mt-4 block">Distribución de capacidad de pago declarada</span>
                  </div>

                  {/* 2. CARROCERÍAS / SILUETAS MÁS DEMANDADAS */}
                  <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between border-b border-[#C0C0C0]/40 pb-2 mb-3">
                        <span className="text-[10px] font-black text-[#0A1F33] uppercase tracking-wider">
                          2. Carrocerías Más Buscadas
                        </span>
                        <span className="text-[9px] text-[#C0C0C0] font-bold uppercase">Ranking</span>
                      </div>
                      <div className="flex flex-col gap-2.5">
                        {recomendadorDemandStats.sortedCarrocerias.slice(0, 5).map(([carroc, count], idx) => {
                          const totalCarroc = recomendadorDemandStats.sortedCarrocerias.reduce((acc, curr) => acc + curr[1], 0) || 1;
                          const pct = Math.round((count / totalCarroc) * 100);
                          return (
                            <div key={carroc}>
                              <div className="flex justify-between items-center text-[10px] font-bold text-[#0A1F33] mb-1">
                                <span className="flex items-center gap-1.5 truncate">
                                  <span className="text-[8px] bg-[#0A1F33] text-white px-1 font-mono">#{idx + 1}</span>
                                  {carroc}
                                </span>
                                <span className="font-mono text-[11px] text-[#0A1F33]">{pct}% ({count})</span>
                              </div>
                              <div className="w-full bg-[#E0E0E0] h-2 rounded-none overflow-hidden">
                                <div className="h-full bg-[#0A1F33] transition-all duration-500" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <span className="text-[8px] text-[#C0C0C0] uppercase mt-4 block">Top siluetas seleccionadas en el recomendador</span>
                  </div>

                  {/* 3. MOTORIZACIÓN Y EFICIENCIA ENERGÉTICA */}
                  <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between border-b border-[#C0C0C0]/40 pb-2 mb-3">
                        <span className="text-[10px] font-black text-[#0A1F33] uppercase tracking-wider">
                          3. Transición Energética
                        </span>
                        <span className="text-[9px] text-[#00BFFF] font-bold uppercase">⚡ Mix</span>
                      </div>

                      {/* Barra Bipolar */}
                      <div className="mb-4">
                        <div className="flex justify-between text-[10px] font-black uppercase mb-1">
                          <span className="text-[#00BFFF]">⚡ Nuevas Energías {recomendadorDemandStats.newEnergyPct}%</span>
                          <span className="text-[#3A3A3C]">⛽ Combustión {100 - recomendadorDemandStats.newEnergyPct}%</span>
                        </div>
                        <div className="w-full h-3 bg-[#3A3A3C] flex overflow-hidden">
                          <div className="bg-[#00BFFF] h-full transition-all duration-500" style={{ width: `${recomendadorDemandStats.newEnergyPct}%` }} />
                        </div>
                      </div>

                      {/* Desglose de tipos */}
                      <div className="flex flex-col gap-1.5 mt-2">
                        {Object.entries(recomendadorDemandStats.combustibleMap).slice(0, 4).map(([comb, cnt]) => (
                          <div key={comb} className="flex justify-between items-center text-[9px] font-semibold text-[#3A3A3C]">
                            <span>{comb}</span>
                            <span className="font-mono text-[#0A1F33] font-bold">{cnt} elecciones</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <span className="text-[8px] text-[#C0C0C0] uppercase mt-4 block">HEV, PHEV, EV vs Nafta y Diésel</span>
                  </div>

                  {/* 4. PLAZAS Y PASAJEROS */}
                  <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between border-b border-[#C0C0C0]/40 pb-2 mb-3">
                        <span className="text-[10px] font-black text-[#0A1F33] uppercase tracking-wider">
                          4. Cantidad de Plazas
                        </span>
                        <span className="text-[9px] text-[#C0C0C0] font-bold uppercase">Asientos</span>
                      </div>
                      <div className="flex flex-col gap-3">
                        {Object.entries(recomendadorDemandStats.plazasMap).map(([label, count]) => {
                          const tot = (recomendadorDemandStats.plazasMap['1-2 Plazas'] + recomendadorDemandStats.plazasMap['4-5 Plazas'] + recomendadorDemandStats.plazasMap['7+ Plazas']) || 1;
                          const pct = Math.round((count / tot) * 100);
                          return (
                            <div key={label}>
                              <div className="flex justify-between items-center text-[10px] font-bold text-[#0A1F33] mb-1">
                                <span>{label}</span>
                                <span className="font-mono text-[11px]">{pct}% ({count})</span>
                              </div>
                              <div className="w-full bg-[#E0E0E0] h-2 rounded-none overflow-hidden">
                                <div className="h-full bg-[#00BFFF] transition-all duration-500" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <span className="text-[8px] text-[#C0C0C0] uppercase mt-4 block">Requerimientos de espacio interior</span>
                  </div>

                  {/* 5. FACTOR DECISIVO DE COMPRA */}
                  <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between border-b border-[#C0C0C0]/40 pb-2 mb-3">
                        <span className="text-[10px] font-black text-[#0A1F33] uppercase tracking-wider">
                          5. Prioridad Principal
                        </span>
                        <span className="text-[9px] text-[#1E8E3E] font-bold uppercase">Driver</span>
                      </div>
                      <div className="flex flex-col gap-3">
                        {Object.entries(recomendadorDemandStats.prioridadMap).map(([prioName, cnt]) => {
                          const tot = Object.values(recomendadorDemandStats.prioridadMap).reduce((a, b) => a + b, 0) || 1;
                          const pct = Math.round((cnt / tot) * 100);
                          return (
                            <div key={prioName}>
                              <div className="flex justify-between items-center text-[10px] font-bold text-[#0A1F33] mb-1">
                                <span>{prioName}</span>
                                <span className="font-mono text-[11px]">{pct}% ({cnt})</span>
                              </div>
                              <div className="w-full bg-[#E0E0E0] h-2 rounded-none overflow-hidden">
                                <div className="h-full bg-[#1E8E3E] transition-all duration-500" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <span className="text-[8px] text-[#C0C0C0] uppercase mt-4 block">Motivador clave para desempatar el modelo</span>
                  </div>

                  {/* 6. PREFERENCIA DE TRANSMISIÓN */}
                  <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between border-b border-[#C0C0C0]/40 pb-2 mb-3">
                        <span className="text-[10px] font-black text-[#0A1F33] uppercase tracking-wider">
                          6. Tipo de Transmisión
                        </span>
                        <span className="text-[9px] text-[#C0C0C0] font-bold uppercase">Caja</span>
                      </div>
                      {(() => {
                        const totalTrans = recomendadorDemandStats.transAuto + recomendadorDemandStats.transManual || 1;
                        const autoPct = Math.round((recomendadorDemandStats.transAuto / totalTrans) * 100);
                        const manualPct = 100 - autoPct;
                        return (
                          <div className="flex flex-col gap-4 mt-2">
                            <div>
                              <div className="flex justify-between items-center text-[10px] font-bold text-[#0A1F33] mb-1">
                                <span>Automática (AT / CVT / DCT)</span>
                                <span className="font-mono text-[11px]">{autoPct}% ({recomendadorDemandStats.transAuto})</span>
                              </div>
                              <div className="w-full bg-[#E0E0E0] h-2 rounded-none overflow-hidden">
                                <div className="h-full bg-[#0A1F33] transition-all duration-500" style={{ width: `${autoPct}%` }} />
                              </div>
                            </div>
                            <div>
                              <div className="flex justify-between items-center text-[10px] font-bold text-[#0A1F33] mb-1">
                                <span>Manual (MT)</span>
                                <span className="font-mono text-[11px]">{manualPct}% ({recomendadorDemandStats.transManual})</span>
                              </div>
                              <div className="w-full bg-[#E0E0E0] h-2 rounded-none overflow-hidden">
                                <div className="h-full bg-[#C0C0C0] transition-all duration-500" style={{ width: `${manualPct}%` }} />
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    <span className="text-[8px] text-[#C0C0C0] uppercase mt-4 block">Preferencia de caja del conductor</span>
                  </div>
                </div>
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
          {/* VISTAS ABM EN FORMATO CUADRO (MARCAS, MODELOS, VERSIONES, CONCESIONARIAS) */}
          {/* ======================================= */}
          {['marcas', 'modelos', 'versiones', 'concesionarias'].includes(activeTab) && (
            <div className="flex flex-col gap-6 h-full">

              {/* ------------------------------------------------------------------ */}
              {/* CUADRO: ABM VERSIONES (H, I, J) */}
              {/* ------------------------------------------------------------------ */}
              {activeTab === 'versiones' && (
                <div className="bg-[#FFFFFF] border border-[#C0C0C0] flex flex-col min-h-[550px] shadow-none">
                  {/* BARRA SUPERIOR DE CONTROL Y FILTROS */}
                  <div className="p-4 bg-[#F5F5F5] border-b border-[#C0C0C0] flex flex-col lg:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs uppercase tracking-widest text-[#0A1F33]">Cuadro Maestro de Versiones</span>
                      <span className="text-[10px] bg-[#0A1F33] text-[#00BFFF] px-2.5 py-0.5 font-bold uppercase tracking-wider">{filteredVersiones.length} de {versionesList.length}</span>
                    </div>

                    <div className="flex flex-wrap gap-2 w-full lg:w-auto items-center">
                      {/* Filtro Marca */}
                      <div className="flex items-center gap-1 bg-[#FFFFFF] border border-[#C0C0C0] px-2 py-1">
                        <span className="text-[9px] font-bold text-[#C0C0C0] uppercase">Marca:</span>
                        <select 
                          className="text-[10px] font-bold uppercase tracking-widest focus:outline-none bg-transparent cursor-pointer"
                          value={abmVerFilterMarca} 
                          onChange={e => { setAbmVerFilterMarca(e.target.value); setAbmVerFilterModelo('Todos'); }}
                        >
                          <option value="Todas">Todas las marcas ({marcasList.length})</option>
                          {marcasList.map(b => <option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>)}
                        </select>
                      </div>

                      {/* Filtro Modelo en Cascada */}
                      <div className="flex items-center gap-1 bg-[#FFFFFF] border border-[#C0C0C0] px-2 py-1">
                        <span className="text-[9px] font-bold text-[#C0C0C0] uppercase">Modelo:</span>
                        <select 
                          className="text-[10px] font-bold uppercase tracking-widest focus:outline-none bg-transparent cursor-pointer disabled:opacity-50"
                          value={abmVerFilterModelo} 
                          onChange={e => setAbmVerFilterModelo(e.target.value)}
                        >
                          <option value="Todos">Todos los modelos ({modelosParaFiltroVersiones.length})</option>
                          {modelosParaFiltroVersiones.map(m => <option key={m.id} value={m.id}>{m.name.toUpperCase()}</option>)}
                        </select>
                      </div>

                      {/* Filtro Concesionaria */}
                      <div className="flex items-center gap-1 bg-[#FFFFFF] border border-[#C0C0C0] px-2 py-1">
                        <span className="text-[9px] font-bold text-[#C0C0C0] uppercase">Concesionaria:</span>
                        <select 
                          className="text-[10px] font-bold uppercase tracking-widest focus:outline-none bg-transparent cursor-pointer"
                          value={abmVerFilterDealer} 
                          onChange={e => setAbmVerFilterDealer(e.target.value)}
                        >
                          <option value="Todas">Todas ({concesionariasUnicasVersiones.length})</option>
                          {concesionariasUnicasVersiones.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>

                      {/* Buscador */}
                      <input 
                        type="text" 
                        placeholder="Buscar versión, motor..." 
                        className="border border-[#C0C0C0] px-3 py-1 text-xs w-full lg:w-44 focus:outline-none focus:border-[#0A1F33] bg-[#FFFFFF]" 
                        value={searchTerm} 
                        onChange={e => setSearchTerm(e.target.value)} 
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
                          <th className="p-3.5 border-r border-[#C0C0C0]/50">Concesionaria ✏️</th>
                          <th className="p-3.5 border-r border-[#C0C0C0]/50">Motor / Combustible ✏️</th>
                          <th className="p-3.5 border-r border-[#C0C0C0]/50">Ficha URL ✏️</th>
                          <th className="p-3.5 border-r border-[#C0C0C0]/50 bg-[#F8F9FA]">Última Modificación (J)</th>
                          <th className="p-3.5 text-right bg-[#F8F9FA] sticky right-0">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="text-[11px] text-[#3A3A3C]">
                        {filteredVersiones.length === 0 ? (
                          <tr><td colSpan={9} className="p-12 text-center text-[#C0C0C0] font-bold uppercase tracking-widest">No se encontraron versiones con los filtros aplicados.</td></tr>
                        ) : filteredVersiones.map(v => {
                          const modObj = modelosList.find(m => m.id === v.modelId);
                          const brandObj = modObj ? marcasList.find(b => b.id === modObj.brandId) : null;
                          const brandName = brandObj?.name || 'N/A';
                          const modelName = modObj?.name || 'N/A';
                          const hasCheck = isDatacarCheck(v.concesionaria, checkedDealershipSet);

                          return (
                            <tr key={v.id} className="border-b border-[#C0C0C0]/50 hover:bg-[#F5FBFF] transition-colors group">
                              <td className="p-3.5 font-bold uppercase border-r border-[#C0C0C0]/50 bg-[#F8F9FA]/40">
                                <span className="bg-[#0A1F33] text-[#FFFFFF] text-[9px] px-2 py-0.5 font-black uppercase tracking-wider block w-fit mb-1">{brandName}</span>
                                <span className="text-[#0A1F33] text-[11px] font-black">{modelName}</span>
                              </td>

                              {/* Versión inline */}
                              <td className="p-3.5 border-r border-[#C0C0C0]/50 font-semibold text-[#0A1F33]">
                                {adminInlineEdit?.id === v.id && adminInlineEdit?.field === 'name' ? (
                                  <div className="flex items-center gap-1">
                                    <input type="text" className="border border-[#00BFFF] p-1 text-xs bg-white w-36 uppercase focus:outline-none" value={adminInlineEdit.value} onChange={e => setAdminInlineEdit({ ...adminInlineEdit, value: e.target.value })} autoFocus onKeyDown={e => { if (e.key === 'Enter') handleAdminInlineSave(); if (e.key === 'Escape') setAdminInlineEdit(null); }} />
                                    <button onClick={handleAdminInlineSave} className="bg-[#1E8E3E] text-white px-2 py-1 text-[10px] font-bold">✓</button>
                                    <button onClick={() => setAdminInlineEdit(null)} className="bg-[#D93025] text-white px-2 py-1 text-[10px] font-bold">✕</button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-between gap-2">
                                    <span>{v.name}</span>
                                    <button onClick={() => setAdminInlineEdit({ type: 'version', id: v.id, field: 'name', value: v.name || '' })} className="text-[#00BFFF] opacity-50 group-hover:opacity-100 text-[11px]" title="Editar nombre">✏️</button>
                                  </div>
                                )}
                              </td>

                              {/* Precio inline */}
                              <td className="p-3.5 border-r border-[#C0C0C0]/50 font-black text-[#0A1F33]">
                                {adminInlineEdit?.id === v.id && adminInlineEdit?.field === 'price' ? (
                                  <div className="flex items-center gap-1">
                                    <input type="number" className="border border-[#00BFFF] p-1 text-xs bg-white w-28 focus:outline-none font-bold" value={adminInlineEdit.value} onChange={e => setAdminInlineEdit({ ...adminInlineEdit, value: e.target.value })} autoFocus onKeyDown={e => { if (e.key === 'Enter') handleAdminInlineSave(); if (e.key === 'Escape') setAdminInlineEdit(null); }} />
                                    <button onClick={handleAdminInlineSave} className="bg-[#1E8E3E] text-white px-2 py-1 text-[10px] font-bold">✓</button>
                                    <button onClick={() => setAdminInlineEdit(null)} className="bg-[#D93025] text-white px-2 py-1 text-[10px] font-bold">✕</button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-between gap-2">
                                    <span>US$ {Number(v.price).toLocaleString()}</span>
                                    <button onClick={() => setAdminInlineEdit({ type: 'version', id: v.id, field: 'price', value: String(v.price || '') })} className="text-[#00BFFF] opacity-50 group-hover:opacity-100 text-[11px]" title="Editar precio">✏️</button>
                                  </div>
                                )}
                              </td>

                              {/* Promoción inline */}
                              <td className="p-3.5 border-r border-[#C0C0C0]/50">
                                {adminInlineEdit?.id === v.id && adminInlineEdit?.field === 'promocion' ? (
                                  <div className="flex items-center gap-1">
                                    <input type="text" className="border border-[#00BFFF] p-1 text-xs bg-white w-36 focus:outline-none" value={adminInlineEdit.value} onChange={e => setAdminInlineEdit({ ...adminInlineEdit, value: e.target.value })} autoFocus onKeyDown={e => { if (e.key === 'Enter') handleAdminInlineSave(); if (e.key === 'Escape') setAdminInlineEdit(null); }} />
                                    <button onClick={handleAdminInlineSave} className="bg-[#1E8E3E] text-white px-2 py-1 text-[10px] font-bold">✓</button>
                                    <button onClick={() => setAdminInlineEdit(null)} className="bg-[#D93025] text-white px-2 py-1 text-[10px] font-bold">✕</button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-between gap-2">
                                    <span className={`text-[10px] font-bold uppercase ${v.promocion ? 'text-[#00BFFF]' : 'text-[#C0C0C0]'}`}>{v.promocion || 'Sin Promo'}</span>
                                    <button onClick={() => setAdminInlineEdit({ type: 'version', id: v.id, field: 'promocion', value: v.promocion || '' })} className="text-[#00BFFF] opacity-50 group-hover:opacity-100 text-[11px]" title="Editar promo">✏️</button>
                                  </div>
                                )}
                              </td>

                              {/* Concesionaria inline */}
                              <td className="p-3.5 border-r border-[#C0C0C0]/50">
                                {adminInlineEdit?.id === v.id && adminInlineEdit?.field === 'concesionaria' ? (
                                  <div className="flex items-center gap-1">
                                    <input type="text" className="border border-[#00BFFF] p-1 text-xs bg-white w-32 uppercase focus:outline-none" value={adminInlineEdit.value} onChange={e => setAdminInlineEdit({ ...adminInlineEdit, value: e.target.value })} autoFocus onKeyDown={e => { if (e.key === 'Enter') handleAdminInlineSave(); if (e.key === 'Escape') setAdminInlineEdit(null); }} />
                                    <button onClick={handleAdminInlineSave} className="bg-[#1E8E3E] text-white px-2 py-1 text-[10px] font-bold">✓</button>
                                    <button onClick={() => setAdminInlineEdit(null)} className="bg-[#D93025] text-white px-2 py-1 text-[10px] font-bold">✕</button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-between gap-2">
                                    <div>
                                      <span className="font-bold text-[#0A1F33] block text-[10px] uppercase">{v.concesionaria || 'Sin Asignar'}</span>
                                      {hasCheck && <span className="inline-block bg-[#E6F4EA] border border-[#1E8E3E] text-[#1E8E3E] text-[7.5px] font-black uppercase px-1 py-0.2 tracking-wider mt-0.5">✓ CHECK</span>}
                                    </div>
                                    <button onClick={() => setAdminInlineEdit({ type: 'version', id: v.id, field: 'concesionaria', value: v.concesionaria || '' })} className="text-[#00BFFF] opacity-50 group-hover:opacity-100 text-[11px]" title="Editar concesionaria">✏️</button>
                                  </div>
                                )}
                              </td>

                              {/* Motor specs inline */}
                              <td className="p-3.5 border-r border-[#C0C0C0]/50">
                                {adminInlineEdit?.id === v.id && adminInlineEdit?.field === 'motor' ? (
                                  <div className="flex items-center gap-1">
                                    <input type="text" className="border border-[#00BFFF] p-1 text-xs bg-white w-32 focus:outline-none" value={adminInlineEdit.value} onChange={e => setAdminInlineEdit({ ...adminInlineEdit, value: e.target.value })} autoFocus onKeyDown={e => { if (e.key === 'Enter') handleAdminInlineSave(); if (e.key === 'Escape') setAdminInlineEdit(null); }} />
                                    <button onClick={handleAdminInlineSave} className="bg-[#1E8E3E] text-white px-2 py-1 text-[10px] font-bold">✓</button>
                                    <button onClick={() => setAdminInlineEdit(null)} className="bg-[#D93025] text-white px-2 py-1 text-[10px] font-bold">✕</button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-between gap-2">
                                    <div>
                                      <span className="font-bold text-[#0A1F33] block text-[10px]">{v.specs?.motor || 'Sin motor'}</span>
                                      <span className="text-[9px] text-[#C0C0C0] uppercase">{v.specs?.combustible || ''} {v.specs?.transmision ? `• ${v.specs.transmision}` : ''}</span>
                                    </div>
                                    <button onClick={() => setAdminInlineEdit({ type: 'version', id: v.id, field: 'motor', value: v.specs?.motor || '' })} className="text-[#00BFFF] opacity-50 group-hover:opacity-100 text-[11px]" title="Editar motor">✏️</button>
                                  </div>
                                )}
                              </td>

                              {/* URL Ficha Técnica inline */}
                              <td className="p-3.5 border-r border-[#C0C0C0]/50 max-w-[120px] truncate">
                                {adminInlineEdit?.id === v.id && adminInlineEdit?.field === 'url_auto' ? (
                                  <div className="flex items-center gap-1">
                                    <input type="text" className="border border-[#00BFFF] p-1 text-xs bg-white w-32 focus:outline-none" value={adminInlineEdit.value} onChange={e => setAdminInlineEdit({ ...adminInlineEdit, value: e.target.value })} autoFocus onKeyDown={e => { if (e.key === 'Enter') handleAdminInlineSave(); if (e.key === 'Escape') setAdminInlineEdit(null); }} />
                                    <button onClick={handleAdminInlineSave} className="bg-[#1E8E3E] text-white px-2 py-1 text-[10px] font-bold">✓</button>
                                    <button onClick={() => setAdminInlineEdit(null)} className="bg-[#D93025] text-white px-2 py-1 text-[10px] font-bold">✕</button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-between gap-2">
                                    {v.url_auto ? <a href={v.url_auto} target="_blank" rel="noopener noreferrer" className="text-[#00BFFF] hover:underline text-[10px] truncate max-w-[90px] inline-block">Ver Ficha ↗</a> : <span className="text-[#C0C0C0] text-[10px]">Sin URL</span>}
                                    <button onClick={() => setAdminInlineEdit({ type: 'version', id: v.id, field: 'url_auto', value: v.url_auto || '' })} className="text-[#00BFFF] opacity-50 group-hover:opacity-100 text-[11px]" title="Editar URL">✏️</button>
                                  </div>
                                )}
                              </td>

                              {/* Última Modificación (J) */}
                              <td className="p-3.5 border-r border-[#C0C0C0]/50 bg-[#F8F9FA]/40 text-[10px] text-[#C0C0C0]">
                                <div className="flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#00BFFF] shrink-0"></span>
                                  <span>{formatLastModified(v.updatedAt)}</span>
                                </div>
                              </td>

                              {/* Acciones (H) */}
                              <td className="p-3.5 text-right bg-[#F8F9FA]/40 sticky right-0">
                                <div className="flex items-center justify-end gap-2">
                                  <button onClick={() => triggerEditVersion(v)} className="border border-[#00BFFF] text-[#00BFFF] hover:bg-[#00BFFF] hover:text-[#FFFFFF] text-[9px] font-bold uppercase px-2.5 py-1 transition-colors" title="Editar todas las matrices">
                                    Ficha Completa ✏️
                                  </button>
                                  <button onClick={() => handleDelete('versions', v.id)} className="border border-[#D93025] text-[#D93025] hover:bg-[#D93025] hover:text-[#FFFFFF] text-[9px] font-bold uppercase px-2.5 py-1 transition-colors" title="Borrar registro completo">
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
              {/* CUADRO: ABM MODELOS (H, I, J, K) */}
              {/* ------------------------------------------------------------------ */}
              {activeTab === 'modelos' && (
                <div className="bg-[#FFFFFF] border border-[#C0C0C0] flex flex-col min-h-[550px] shadow-none">
                  <div className="p-4 bg-[#F5F5F5] border-b border-[#C0C0C0] flex flex-col lg:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs uppercase tracking-widest text-[#0A1F33]">Cuadro Maestro de Modelos</span>
                      <span className="text-[10px] bg-[#0A1F33] text-[#00BFFF] px-2.5 py-0.5 font-bold uppercase tracking-wider">{filteredModelos.length} de {modelosList.length}</span>
                    </div>

                    <div className="flex flex-wrap gap-2 w-full lg:w-auto items-center">
                      {/* Filtro Marca */}
                      <div className="flex items-center gap-1 bg-[#FFFFFF] border border-[#C0C0C0] px-2 py-1">
                        <span className="text-[9px] font-bold text-[#C0C0C0] uppercase">Marca:</span>
                        <select 
                          className="text-[10px] font-bold uppercase tracking-widest focus:outline-none bg-transparent cursor-pointer"
                          value={abmModelFilterMarca} 
                          onChange={e => setAbmModelFilterMarca(e.target.value)}
                        >
                          <option value="Todas">Todas ({marcasList.length})</option>
                          {marcasList.map(b => <option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>)}
                        </select>
                      </div>

                      {/* Filtro Carrocería */}
                      <div className="flex items-center gap-1 bg-[#FFFFFF] border border-[#C0C0C0] px-2 py-1">
                        <span className="text-[9px] font-bold text-[#C0C0C0] uppercase">Carrocería:</span>
                        <select 
                          className="text-[10px] font-bold uppercase tracking-widest focus:outline-none bg-transparent cursor-pointer"
                          value={abmModelFilterCarroceria} 
                          onChange={e => setAbmModelFilterCarroceria(e.target.value)}
                        >
                          <option value="Todas">Todas ({categoriasUnicas.length})</option>
                          {categoriasUnicas.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>

                      {/* Buscador */}
                      <input 
                        type="text" 
                        placeholder="Buscar modelo..." 
                        className="border border-[#C0C0C0] px-3 py-1 text-xs w-full lg:w-44 focus:outline-none focus:border-[#0A1F33] bg-[#FFFFFF]" 
                        value={searchTerm} 
                        onChange={e => setSearchTerm(e.target.value)} 
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
                    <table className="w-full text-left border-collapse whitespace-nowrap min-w-[1050px]">
                      <thead className="bg-[#FFFFFF] sticky top-0 z-10 border-b-2 border-[#0A1F33]">
                        <tr className="text-[9px] font-black text-[#0A1F33] uppercase tracking-widest">
                          <th className="p-3.5 border-r border-[#C0C0C0]/50 bg-[#F8F9FA]">Foto</th>
                          <th className="p-3.5 border-r border-[#C0C0C0]/50 bg-[#F8F9FA]">Marca</th>
                          <th className="p-3.5 border-r border-[#C0C0C0]/50">Nombre Modelo ✏️</th>
                          <th className="p-3.5 border-r border-[#C0C0C0]/50">Categoría ✏️</th>
                          <th className="p-3.5 border-r border-[#C0C0C0]/50">Origen Fábrica ✏️</th>
                          <th className="p-3.5 border-r border-[#C0C0C0]/50">Precio Inicial USD ✏️</th>
                          <th className="p-3.5 border-r border-[#C0C0C0]/50 text-center">Destacado (Home) (K)</th>
                          <th className="p-3.5 border-r border-[#C0C0C0]/50 bg-[#F8F9FA]">Última Modificación (J)</th>
                          <th className="p-3.5 text-right bg-[#F8F9FA] sticky right-0">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="text-[11px] text-[#3A3A3C]">
                        {filteredModelos.length === 0 ? (
                          <tr><td colSpan={9} className="p-12 text-center text-[#C0C0C0] font-bold uppercase tracking-widest">No se encontraron modelos.</td></tr>
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
                              <td className="p-3.5 border-r border-[#C0C0C0]/50 font-black text-[#0A1F33] text-xs">
                                {adminInlineEdit?.id === m.id && adminInlineEdit?.field === 'name' ? (
                                  <div className="flex items-center gap-1">
                                    <input type="text" className="border border-[#00BFFF] p-1 text-xs bg-white w-36 uppercase focus:outline-none" value={adminInlineEdit.value} onChange={e => setAdminInlineEdit({ ...adminInlineEdit, value: e.target.value })} autoFocus onKeyDown={e => { if (e.key === 'Enter') handleAdminInlineSave(); if (e.key === 'Escape') setAdminInlineEdit(null); }} />
                                    <button onClick={handleAdminInlineSave} className="bg-[#1E8E3E] text-white px-2 py-1 text-[10px] font-bold">✓</button>
                                    <button onClick={() => setAdminInlineEdit(null)} className="bg-[#D93025] text-white px-2 py-1 text-[10px] font-bold">✕</button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-between gap-2">
                                    <span>{m.name}</span>
                                    <button onClick={() => setAdminInlineEdit({ type: 'modelo', id: m.id, field: 'name', value: m.name || '' })} className="text-[#00BFFF] opacity-50 group-hover:opacity-100 text-[11px]" title="Editar modelo">✏️</button>
                                  </div>
                                )}
                              </td>

                              {/* Categoría inline */}
                              <td className="p-3.5 border-r border-[#C0C0C0]/50">
                                {adminInlineEdit?.id === m.id && adminInlineEdit?.field === 'tipo_carroceria' ? (
                                  <div className="flex items-center gap-1">
                                    <input type="text" className="border border-[#00BFFF] p-1 text-xs bg-white w-28 uppercase focus:outline-none" value={adminInlineEdit.value} onChange={e => setAdminInlineEdit({ ...adminInlineEdit, value: e.target.value })} autoFocus onKeyDown={e => { if (e.key === 'Enter') handleAdminInlineSave(); if (e.key === 'Escape') setAdminInlineEdit(null); }} />
                                    <button onClick={handleAdminInlineSave} className="bg-[#1E8E3E] text-white px-2 py-1 text-[10px] font-bold">✓</button>
                                    <button onClick={() => setAdminInlineEdit(null)} className="bg-[#D93025] text-white px-2 py-1 text-[10px] font-bold">✕</button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-bold uppercase text-[10px] text-[#0A1F33]">{normalizeCarroceria(m.tipo_carroceria)}</span>
                                    <button onClick={() => setAdminInlineEdit({ type: 'modelo', id: m.id, field: 'tipo_carroceria', value: m.tipo_carroceria || '' })} className="text-[#00BFFF] opacity-50 group-hover:opacity-100 text-[11px]" title="Editar categoría">✏️</button>
                                  </div>
                                )}
                              </td>

                              {/* Origen inline */}
                              <td className="p-3.5 border-r border-[#C0C0C0]/50">
                                {adminInlineEdit?.id === m.id && adminInlineEdit?.field === 'origen' ? (
                                  <div className="flex items-center gap-1">
                                    <input type="text" className="border border-[#00BFFF] p-1 text-xs bg-white w-28 focus:outline-none" value={adminInlineEdit.value} onChange={e => setAdminInlineEdit({ ...adminInlineEdit, value: e.target.value })} autoFocus onKeyDown={e => { if (e.key === 'Enter') handleAdminInlineSave(); if (e.key === 'Escape') setAdminInlineEdit(null); }} />
                                    <button onClick={handleAdminInlineSave} className="bg-[#1E8E3E] text-white px-2 py-1 text-[10px] font-bold">✓</button>
                                    <button onClick={() => setAdminInlineEdit(null)} className="bg-[#D93025] text-white px-2 py-1 text-[10px] font-bold">✕</button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] font-medium">{m.origen || 'No definido'}</span>
                                    <button onClick={() => setAdminInlineEdit({ type: 'modelo', id: m.id, field: 'origen', value: m.origen || '' })} className="text-[#00BFFF] opacity-50 group-hover:opacity-100 text-[11px]" title="Editar origen">✏️</button>
                                  </div>
                                )}
                              </td>

                              {/* Starting Price inline */}
                              <td className="p-3.5 border-r border-[#C0C0C0]/50 font-black text-[#0A1F33]">
                                {adminInlineEdit?.id === m.id && adminInlineEdit?.field === 'startingPrice' ? (
                                  <div className="flex items-center gap-1">
                                    <input type="number" className="border border-[#00BFFF] p-1 text-xs bg-white w-28 focus:outline-none font-bold" value={adminInlineEdit.value} onChange={e => setAdminInlineEdit({ ...adminInlineEdit, value: e.target.value })} autoFocus onKeyDown={e => { if (e.key === 'Enter') handleAdminInlineSave(); if (e.key === 'Escape') setAdminInlineEdit(null); }} />
                                    <button onClick={handleAdminInlineSave} className="bg-[#1E8E3E] text-white px-2 py-1 text-[10px] font-bold">✓</button>
                                    <button onClick={() => setAdminInlineEdit(null)} className="bg-[#D93025] text-white px-2 py-1 text-[10px] font-bold">✕</button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-between gap-2">
                                    <span>US$ {Number(m.startingPrice || 0).toLocaleString()}</span>
                                    <button onClick={() => setAdminInlineEdit({ type: 'modelo', id: m.id, field: 'startingPrice', value: String(m.startingPrice || '') })} className="text-[#00BFFF] opacity-50 group-hover:opacity-100 text-[11px]" title="Editar precio base">✏️</button>
                                  </div>
                                )}
                              </td>

                              {/* Toggle Destacado ("Lo más buscado") (K) */}
                              <td className="p-3.5 border-r border-[#C0C0C0]/50 text-center">
                                <button 
                                  onClick={() => handleTogglePopularModel(m.id, !!m.isPopular)}
                                  className={`px-3 py-1 text-[9px] font-black uppercase tracking-wider border transition-all ${
                                    m.isPopular 
                                      ? 'bg-[#00BFFF] text-[#0A1F33] border-[#00BFFF] shadow-sm' 
                                      : 'bg-[#F8F9FA] text-[#C0C0C0] border-[#C0C0C0] hover:border-[#0A1F33] hover:text-[#0A1F33]'
                                  }`}
                                  title={m.isPopular ? 'Quitar de Lo Más Buscado en Home' : 'Marcar como Destacado en Home'}
                                >
                                  {m.isPopular ? '★ DESTACADO' : '☆ Normal'}
                                </button>
                              </td>

                              {/* Última Modificación (J) */}
                              <td className="p-3.5 border-r border-[#C0C0C0]/50 bg-[#F8F9FA]/40 text-[10px] text-[#C0C0C0]">
                                <div className="flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#00BFFF] shrink-0"></span>
                                  <span>{formatLastModified(m.updatedAt)}</span>
                                </div>
                              </td>

                              {/* Acciones */}
                              <td className="p-3.5 text-right bg-[#F8F9FA]/40 sticky right-0">
                                <div className="flex items-center justify-end gap-2">
                                  <button onClick={() => triggerEditModelo(m)} className="border border-[#00BFFF] text-[#00BFFF] hover:bg-[#00BFFF] hover:text-[#FFFFFF] text-[9px] font-bold uppercase px-2.5 py-1 transition-colors">
                                    Editar ✏️
                                  </button>
                                  <button onClick={() => handleDelete('models', m.id)} className="border border-[#D93025] text-[#D93025] hover:bg-[#D93025] hover:text-[#FFFFFF] text-[9px] font-bold uppercase px-2.5 py-1 transition-colors">
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
              {/* CUADRO: ABM MARCAS (H, I, J) */}
              {/* ------------------------------------------------------------------ */}
              {activeTab === 'marcas' && (
                <div className="bg-[#FFFFFF] border border-[#C0C0C0] flex flex-col min-h-[550px] shadow-none">
                  <div className="p-4 bg-[#F5F5F5] border-b border-[#C0C0C0] flex flex-col lg:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs uppercase tracking-widest text-[#0A1F33]">Cuadro Maestro de Marcas</span>
                      <span className="text-[10px] bg-[#0A1F33] text-[#00BFFF] px-2.5 py-0.5 font-bold uppercase tracking-wider">{filteredMarcas.length} de {marcasList.length}</span>
                    </div>

                    <div className="flex flex-wrap gap-2 w-full lg:w-auto items-center">
                      {/* Filtro Origen */}
                      <div className="flex items-center gap-1 bg-[#FFFFFF] border border-[#C0C0C0] px-2 py-1">
                        <span className="text-[9px] font-bold text-[#C0C0C0] uppercase">Origen:</span>
                        <select 
                          className="text-[10px] font-bold uppercase tracking-widest focus:outline-none bg-transparent cursor-pointer"
                          value={abmMarcaFilterOrigen} 
                          onChange={e => setAbmMarcaFilterOrigen(e.target.value)}
                        >
                          <option value="Todos">Todos ({origenesMarcasUnicos.length})</option>
                          {origenesMarcasUnicos.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>

                      {/* Buscador */}
                      <input 
                        type="text" 
                        placeholder="Buscar marca..." 
                        className="border border-[#C0C0C0] px-3 py-1 text-xs w-full lg:w-44 focus:outline-none focus:border-[#0A1F33] bg-[#FFFFFF]" 
                        value={searchTerm} 
                        onChange={e => setSearchTerm(e.target.value)} 
                      />

                      <button 
                        onClick={openNewMarcaModal}
                        className="bg-[#00BFFF] hover:bg-[#0A1F33] text-[#FFFFFF] text-[10px] font-bold uppercase tracking-widest px-4 py-2 transition-colors shrink-0 shadow-sm"
                      >
                        + Agregar Marca
                      </button>
                    </div>
                  </div>

                  {/* TABLA / CUADRO MARCAS */}
                  <div className="overflow-x-auto flex-grow custom-scrollbar">
                    <table className="w-full text-left border-collapse whitespace-nowrap min-w-[850px]">
                      <thead className="bg-[#FFFFFF] sticky top-0 z-10 border-b-2 border-[#0A1F33]">
                        <tr className="text-[9px] font-black text-[#0A1F33] uppercase tracking-widest">
                          <th className="p-3.5 border-r border-[#C0C0C0]/50 bg-[#F8F9FA]">Logotipo</th>
                          <th className="p-3.5 border-r border-[#C0C0C0]/50">Nombre Marca ✏️</th>
                          <th className="p-3.5 border-r border-[#C0C0C0]/50">Origen de la Marca ✏️</th>
                          <th className="p-3.5 border-r border-[#C0C0C0]/50 text-center">Modelos en Catálogo</th>
                          <th className="p-3.5 border-r border-[#C0C0C0]/50 bg-[#F8F9FA]">Última Modificación (J)</th>
                          <th className="p-3.5 text-right bg-[#F8F9FA] sticky right-0">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="text-[11px] text-[#3A3A3C]">
                        {filteredMarcas.length === 0 ? (
                          <tr><td colSpan={6} className="p-12 text-center text-[#C0C0C0] font-bold uppercase tracking-widest">No se encontraron marcas.</td></tr>
                        ) : filteredMarcas.map(m => {
                          const modelsCount = modelosList.filter(mod => mod.brandId === m.id).length;

                          return (
                            <tr key={m.id} className="border-b border-[#C0C0C0]/50 hover:bg-[#F5FBFF] transition-colors group">
                              <td className="p-3 border-r border-[#C0C0C0]/50 bg-[#F8F9FA]/40 w-16">
                                {isValidImageSrc(m.logoUrl) ? (
                                  <Image src={m.logoUrl} alt={m.name} width={48} height={28} className="h-7 w-12 object-contain" unoptimized={!isOptimizableImageSrc(m.logoUrl)} />
                                ) : (
                                  <div className="h-7 w-12 bg-[#F5F5F5] flex items-center justify-center text-[9px] font-black text-[#C0C0C0] uppercase">{m.name.substring(0, 2)}</div>
                                )}
                              </td>

                              {/* Nombre Marca inline */}
                              <td className="p-3.5 border-r border-[#C0C0C0]/50 font-black text-[#0A1F33] text-sm">
                                {adminInlineEdit?.id === m.id && adminInlineEdit?.field === 'name' ? (
                                  <div className="flex items-center gap-1">
                                    <input type="text" className="border border-[#00BFFF] p-1 text-xs bg-white w-36 uppercase focus:outline-none" value={adminInlineEdit.value} onChange={e => setAdminInlineEdit({ ...adminInlineEdit, value: e.target.value })} autoFocus onKeyDown={e => { if (e.key === 'Enter') handleAdminInlineSave(); if (e.key === 'Escape') setAdminInlineEdit(null); }} />
                                    <button onClick={handleAdminInlineSave} className="bg-[#1E8E3E] text-white px-2 py-1 text-[10px] font-bold">✓</button>
                                    <button onClick={() => setAdminInlineEdit(null)} className="bg-[#D93025] text-white px-2 py-1 text-[10px] font-bold">✕</button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-between gap-2">
                                    <span>{m.name}</span>
                                    <button onClick={() => setAdminInlineEdit({ type: 'marca', id: m.id, field: 'name', value: m.name || '' })} className="text-[#00BFFF] opacity-50 group-hover:opacity-100 text-[11px]" title="Editar marca">✏️</button>
                                  </div>
                                )}
                              </td>

                              {/* Origen Marca inline */}
                              <td className="p-3.5 border-r border-[#C0C0C0]/50">
                                {adminInlineEdit?.id === m.id && adminInlineEdit?.field === 'origen_marca' ? (
                                  <div className="flex items-center gap-1">
                                    <input type="text" className="border border-[#00BFFF] p-1 text-xs bg-white w-32 focus:outline-none" value={adminInlineEdit.value} onChange={e => setAdminInlineEdit({ ...adminInlineEdit, value: e.target.value })} autoFocus onKeyDown={e => { if (e.key === 'Enter') handleAdminInlineSave(); if (e.key === 'Escape') setAdminInlineEdit(null); }} />
                                    <button onClick={handleAdminInlineSave} className="bg-[#1E8E3E] text-white px-2 py-1 text-[10px] font-bold">✓</button>
                                    <button onClick={() => setAdminInlineEdit(null)} className="bg-[#D93025] text-white px-2 py-1 text-[10px] font-bold">✕</button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-bold text-[11px] text-[#0A1F33]">{m.origen_marca || 'No definido'}</span>
                                    <button onClick={() => setAdminInlineEdit({ type: 'marca', id: m.id, field: 'origen_marca', value: m.origen_marca || '' })} className="text-[#00BFFF] opacity-50 group-hover:opacity-100 text-[11px]" title="Editar origen">✏️</button>
                                  </div>
                                )}
                              </td>

                              {/* Q Modelos */}
                              <td className="p-3.5 border-r border-[#C0C0C0]/50 text-center">
                                <span className="bg-[#F8F9FA] border border-[#C0C0C0] text-[#0A1F33] text-[10px] font-black px-2.5 py-0.5">{modelsCount} modelos</span>
                              </td>

                              {/* Última Modificación (J) */}
                              <td className="p-3.5 border-r border-[#C0C0C0]/50 bg-[#F8F9FA]/40 text-[10px] text-[#C0C0C0]">
                                <div className="flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#00BFFF] shrink-0"></span>
                                  <span>{formatLastModified(m.updatedAt)}</span>
                                </div>
                              </td>

                              {/* Acciones */}
                              <td className="p-3.5 text-right bg-[#F8F9FA]/40 sticky right-0">
                                <div className="flex items-center justify-end gap-2">
                                  <button onClick={() => triggerEditMarca(m)} className="border border-[#00BFFF] text-[#00BFFF] hover:bg-[#00BFFF] hover:text-[#FFFFFF] text-[9px] font-bold uppercase px-2.5 py-1 transition-colors">
                                    Editar ✏️
                                  </button>
                                  <button onClick={() => handleDelete('brands', m.id)} className="border border-[#D93025] text-[#D93025] hover:bg-[#D93025] hover:text-[#FFFFFF] text-[9px] font-bold uppercase px-2.5 py-1 transition-colors">
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
              {/* CUADRO: ABM CONCESIONARIAS (H, J, L) */}
              {/* ------------------------------------------------------------------ */}
              {activeTab === 'concesionarias' && (
                <div className="bg-[#FFFFFF] border border-[#C0C0C0] flex flex-col min-h-[550px] shadow-none">
                  <div className="p-4 bg-[#F5F5F5] border-b border-[#C0C0C0] flex flex-col lg:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs uppercase tracking-widest text-[#0A1F33]">Cuadro Maestro de Concesionarias</span>
                      <span className="text-[10px] bg-[#0A1F33] text-[#00BFFF] px-2.5 py-0.5 font-bold uppercase tracking-wider">{filteredConcesionarias.length} de {concesionariasList.length}</span>
                    </div>

                    <div className="flex flex-wrap gap-2 w-full lg:w-auto items-center">
                      {/* Filtro Estado */}
                      <div className="flex items-center gap-1 bg-[#FFFFFF] border border-[#C0C0C0] px-2 py-1">
                        <span className="text-[9px] font-bold text-[#C0C0C0] uppercase">Estado:</span>
                        <select 
                          className="text-[10px] font-bold uppercase tracking-widest focus:outline-none bg-transparent cursor-pointer"
                          value={abmConcFilterStatus} 
                          onChange={e => setAbmConcFilterStatus(e.target.value)}
                        >
                          <option value="Todos">Todos</option>
                          <option value="active">Activas</option>
                          <option value="inactive">Inactivas</option>
                        </select>
                      </div>

                      {/* Filtro DATACAR CHECK */}
                      <div className="flex items-center gap-1 bg-[#FFFFFF] border border-[#C0C0C0] px-2 py-1">
                        <span className="text-[9px] font-bold text-[#C0C0C0] uppercase">Check:</span>
                        <select 
                          className="text-[10px] font-bold uppercase tracking-widest focus:outline-none bg-transparent cursor-pointer"
                          value={abmConcFilterCheck} 
                          onChange={e => setAbmConcFilterCheck(e.target.value)}
                        >
                          <option value="Todos">Todos</option>
                          <option value="con_check">Con Datacar Check</option>
                          <option value="sin_check">Sin Check</option>
                        </select>
                      </div>

                      {/* Buscador */}
                      <input 
                        type="text" 
                        placeholder="Buscar concesionaria..." 
                        className="border border-[#C0C0C0] px-3 py-1 text-xs w-full lg:w-44 focus:outline-none focus:border-[#0A1F33] bg-[#FFFFFF]" 
                        value={searchTerm} 
                        onChange={e => setSearchTerm(e.target.value)} 
                      />

                      <button 
                        onClick={openNewConcesionariaModal}
                        className="bg-[#00BFFF] hover:bg-[#0A1F33] text-[#FFFFFF] text-[10px] font-bold uppercase tracking-widest px-4 py-2 transition-colors shrink-0 shadow-sm"
                      >
                        + Agregar Concesionaria
                      </button>
                    </div>
                  </div>

                  {/* TABLA / CUADRO CONCESIONARIAS */}
                  <div className="overflow-x-auto flex-grow custom-scrollbar">
                    <table className="w-full text-left border-collapse whitespace-nowrap min-w-[1000px]">
                      <thead className="bg-[#FFFFFF] sticky top-0 z-10 border-b-2 border-[#0A1F33]">
                        <tr className="text-[9px] font-black text-[#0A1F33] uppercase tracking-widest">
                          <th className="p-3.5 border-r border-[#C0C0C0]/50 bg-[#F8F9FA]">Nombre Comercial ✏️</th>
                          <th className="p-3.5 border-r border-[#C0C0C0]/50">Email Gerencia (Leads) ✏️</th>
                          <th className="p-3.5 border-r border-[#C0C0C0]/50 text-center">Estado ✏️</th>
                          <th className="p-3.5 border-r border-[#C0C0C0]/50 text-center">Sello DATACAR CHECK (L)</th>
                          <th className="p-3.5 border-r border-[#C0C0C0]/50">Marcas Gestionadas</th>
                          <th className="p-3.5 border-r border-[#C0C0C0]/50 bg-[#F8F9FA]">Última Modificación (J)</th>
                          <th className="p-3.5 text-right bg-[#F8F9FA] sticky right-0">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="text-[11px] text-[#3A3A3C]">
                        {filteredConcesionarias.length === 0 ? (
                          <tr><td colSpan={7} className="p-12 text-center text-[#C0C0C0] font-bold uppercase tracking-widest">No se encontraron concesionarias.</td></tr>
                        ) : filteredConcesionarias.map(c => {
                          const dealerNorm = (c.name || '').trim().toUpperCase();
                          const associatedBrandsSet = concBrandsMap.get(dealerNorm);
                          const associatedBrands = associatedBrandsSet ? Array.from(associatedBrandsSet) : [];

                          return (
                            <tr key={c.id} className="border-b border-[#C0C0C0]/50 hover:bg-[#F5FBFF] transition-colors group">
                              {/* Nombre Comercial inline */}
                              <td className="p-3.5 border-r border-[#C0C0C0]/50 font-black text-[#0A1F33] text-xs">
                                {adminInlineEdit?.id === c.id && adminInlineEdit?.field === 'name' ? (
                                  <div className="flex items-center gap-1">
                                    <input type="text" className="border border-[#00BFFF] p-1 text-xs bg-white w-40 uppercase focus:outline-none" value={adminInlineEdit.value} onChange={e => setAdminInlineEdit({ ...adminInlineEdit, value: e.target.value })} autoFocus onKeyDown={e => { if (e.key === 'Enter') handleAdminInlineSave(); if (e.key === 'Escape') setAdminInlineEdit(null); }} />
                                    <button onClick={handleAdminInlineSave} className="bg-[#1E8E3E] text-white px-2 py-1 text-[10px] font-bold">✓</button>
                                    <button onClick={() => setAdminInlineEdit(null)} className="bg-[#D93025] text-white px-2 py-1 text-[10px] font-bold">✕</button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-between gap-2">
                                    <span>{c.name}</span>
                                    <button onClick={() => setAdminInlineEdit({ type: 'concesionaria', id: c.id, field: 'name', value: c.name || '' })} className="text-[#00BFFF] opacity-50 group-hover:opacity-100 text-[11px]" title="Editar nombre">✏️</button>
                                  </div>
                                )}
                              </td>

                              {/* Email Gerencia inline */}
                              <td className="p-3.5 border-r border-[#C0C0C0]/50">
                                {adminInlineEdit?.id === c.id && adminInlineEdit?.field === 'email_gerencia' ? (
                                  <div className="flex items-center gap-1">
                                    <input type="email" className="border border-[#00BFFF] p-1 text-xs bg-white w-48 focus:outline-none" value={adminInlineEdit.value} onChange={e => setAdminInlineEdit({ ...adminInlineEdit, value: e.target.value })} autoFocus onKeyDown={e => { if (e.key === 'Enter') handleAdminInlineSave(); if (e.key === 'Escape') setAdminInlineEdit(null); }} />
                                    <button onClick={handleAdminInlineSave} className="bg-[#1E8E3E] text-white px-2 py-1 text-[10px] font-bold">✓</button>
                                    <button onClick={() => setAdminInlineEdit(null)} className="bg-[#D93025] text-white px-2 py-1 text-[10px] font-bold">✕</button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] text-[#0A1F33] font-medium">{c.email_gerencia || 'No asignado'}</span>
                                    <button onClick={() => setAdminInlineEdit({ type: 'concesionaria', id: c.id, field: 'email_gerencia', value: c.email_gerencia || '' })} className="text-[#00BFFF] opacity-50 group-hover:opacity-100 text-[11px]" title="Editar email">✏️</button>
                                  </div>
                                )}
                              </td>

                              {/* Estado inline */}
                              <td className="p-3.5 border-r border-[#C0C0C0]/50 text-center">
                                <span className={`text-[8.5px] font-black uppercase px-2 py-0.5 ${c.status === 'active' ? 'bg-[#E6F4EA] text-[#1E8E3E] border border-[#1E8E3E]/30' : 'bg-[#FFE6E6] text-[#D93025] border border-[#D93025]/30'}`}>
                                  {c.status === 'active' ? 'Activa' : 'Inactiva'}
                                </span>
                              </td>

                              {/* Toggle Directo DATACAR CHECK (L) */}
                              <td className="p-3.5 border-r border-[#C0C0C0]/50 text-center">
                                <button 
                                  onClick={() => handleToggleDatacarCheck(c.id, !!c.datacarCheck)}
                                  className={`px-3 py-1 text-[9px] font-black uppercase tracking-wider border transition-all ${
                                    c.datacarCheck 
                                      ? 'bg-[#E6F4EA] text-[#1E8E3E] border-[#1E8E3E] shadow-sm' 
                                      : 'bg-[#F8F9FA] text-[#C0C0C0] border-[#C0C0C0] hover:border-[#1E8E3E] hover:text-[#1E8E3E]'
                                  }`}
                                  title={c.datacarCheck ? 'Desactivar Sello Oficial DATACAR CHECK' : 'Activar Sello Oficial DATACAR CHECK'}
                                >
                                  {c.datacarCheck ? '✓ CHECK ACTIVO' : '○ Sin Check'}
                                </button>
                              </td>

                              {/* Marcas Gestionadas */}
                              <td className="p-3.5 border-r border-[#C0C0C0]/50 whitespace-normal max-w-xs">
                                {associatedBrands.length === 0 ? (
                                  <span className="text-[9px] text-[#C0C0C0] uppercase">Sin vehículos en catálogo</span>
                                ) : (
                                  <div className="flex flex-wrap gap-1">
                                    {associatedBrands.map(bName => (
                                      <span key={bName} className="bg-[#F8F9FA] border border-[#C0C0C0] text-[#0A1F33] text-[8px] font-bold uppercase px-1.5 py-0.5">
                                        {bName}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>

                              {/* Última Modificación (J) */}
                              <td className="p-3.5 border-r border-[#C0C0C0]/50 bg-[#F8F9FA]/40 text-[10px] text-[#C0C0C0]">
                                <div className="flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#00BFFF] shrink-0"></span>
                                  <span>{formatLastModified(c.updatedAt)}</span>
                                </div>
                              </td>

                              {/* Acciones */}
                              <td className="p-3.5 text-right bg-[#F8F9FA]/40 sticky right-0">
                                <div className="flex items-center justify-end gap-2">
                                  <button onClick={() => triggerEditConcesionaria(c)} className="border border-[#00BFFF] text-[#00BFFF] hover:bg-[#00BFFF] hover:text-[#FFFFFF] text-[9px] font-bold uppercase px-2.5 py-1 transition-colors">
                                    Editar ✏️
                                  </button>
                                  <button onClick={() => handleDelete('concesionarias', c.id)} className="border border-[#D93025] text-[#D93025] hover:bg-[#D93025] hover:text-[#FFFFFF] text-[9px] font-bold uppercase px-2.5 py-1 transition-colors">
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

            </div>
          )}

          {/* ======================================= */}
          {/* MODALES COMPLETOS PARA ABM (CREAR / EDITAR) */}
          {/* ======================================= */}

          {/* Modal ABM Marcas */}
          {abmModalType === 'marcas' && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
              <div className="bg-[#FFFFFF] border-t-4 border-[#0A1F33] border-l border-r border-b border-[#C0C0C0] w-full max-w-lg p-6 shadow-2xl">
                <div className="flex justify-between items-center mb-4 border-b border-[#C0C0C0] pb-3">
                  <h3 className="font-black text-[#0A1F33] text-sm uppercase">{marcaForm.id ? 'Modificar Identidad de Marca' : 'Crear Nueva Marca'}</h3>
                  <button onClick={() => setAbmModalType(null)} className="text-[#C0C0C0] hover:text-[#0A1F33] text-lg font-bold">✕</button>
                </div>
                <form onSubmit={handleSaveMarca} className="flex flex-col gap-4">
                  <div><label htmlFor="marcaForm-name" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Nombre Marca</label><input id="marcaForm-name" type="text" className="w-full border p-3 text-xs focus:outline-none focus:border-[#0A1F33] uppercase font-bold" value={marcaForm.name} onChange={e => setMarcaForm({...marcaForm, name: e.target.value})} required /></div>
                  <div><label htmlFor="marcaForm-origen" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Origen de la Marca</label><input id="marcaForm-origen" type="text" className="w-full border p-3 text-xs focus:outline-none focus:border-[#0A1F33]" value={marcaForm.origen_marca} onChange={e => setMarcaForm({...marcaForm, origen_marca: e.target.value})} placeholder="Ej: Alemania, Japón, China..." /></div>
                  <ImageUploadField label="Logotipo" folder="brands" value={marcaForm.logoUrl} onChange={url => setMarcaForm({...marcaForm, logoUrl: url})} accentClass="text-[#00BFFF]" />
                  <div className="flex gap-3 mt-4">
                    <button type="button" onClick={() => setAbmModalType(null)} className="flex-1 border border-[#0A1F33] text-[#0A1F33] text-xs font-bold uppercase py-3 hover:bg-[#F5F5F5]">Cancelar</button>
                    <button type="submit" disabled={loading} className="flex-1 bg-[#0A1F33] text-[#FFFFFF] text-xs font-bold uppercase py-3 hover:bg-[#00BFFF] transition-colors">{marcaForm.id ? 'Guardar Cambios' : 'Crear Marca'}</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal ABM Modelos */}
          {abmModalType === 'modelos' && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
              <div className="bg-[#FFFFFF] border-t-4 border-[#0A1F33] border-l border-r border-b border-[#C0C0C0] w-full max-w-lg p-6 shadow-2xl">
                <div className="flex justify-between items-center mb-4 border-b border-[#C0C0C0] pb-3">
                  <h3 className="font-black text-[#0A1F33] text-sm uppercase">{modeloForm.id ? 'Modificar Ficha de Modelo' : 'Crear Nuevo Modelo'}</h3>
                  <button onClick={() => setAbmModalType(null)} className="text-[#C0C0C0] hover:text-[#0A1F33] text-lg font-bold">✕</button>
                </div>
                <form onSubmit={handleSaveModelo} className="flex flex-col gap-4">
                  <div>
                    <label htmlFor="modeloForm-brandId" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Marca</label>
                    <select id="modeloForm-brandId" className="w-full border p-2.5 text-xs focus:outline-none focus:border-[#0A1F33] font-bold bg-white" value={modeloForm.brandId} onChange={e => setModeloForm({...modeloForm, brandId: e.target.value})} required>
                      <option value="">Seleccionar marca...</option>
                      {marcasList.map(m => <option key={m.id} value={m.id}>{m.name.toUpperCase()}</option>)}
                    </select>
                  </div>
                  <div><label htmlFor="modeloForm-name" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Nombre Modelo</label><input id="modeloForm-name" type="text" className="w-full border p-2.5 text-xs focus:outline-none focus:border-[#0A1F33] uppercase font-bold" value={modeloForm.name} onChange={e => setModeloForm({...modeloForm, name: e.target.value})} required /></div>

                  <div className="flex items-center gap-2 bg-[#F8F9FA] p-3 border border-[#C0C0C0]/50">
                    <input type="checkbox" id="isPopular" checked={modeloForm.isPopular} onChange={e => setModeloForm({...modeloForm, isPopular: e.target.checked})} className="w-4 h-4 accent-[#00BFFF]" />
                    <label htmlFor="isPopular" className="text-[10px] font-bold text-[#0A1F33] uppercase tracking-widest cursor-pointer">Destacar en "Lo más buscado" (Home)</label>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div><label htmlFor="modeloForm-tipo" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Categoría</label><input id="modeloForm-tipo" type="text" className="w-full border p-2.5 text-xs focus:outline-none focus:border-[#0A1F33] uppercase" value={modeloForm.tipo_carroceria} onChange={e => setModeloForm({...modeloForm, tipo_carroceria: e.target.value})} placeholder="Ej: SUV" /></div>
                    <div><label htmlFor="modeloForm-subsegmento" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Subsegmento</label><input id="modeloForm-subsegmento" type="text" className="w-full border p-2.5 text-xs focus:outline-none focus:border-[#0A1F33]" value={modeloForm.subsegmento} onChange={e => setModeloForm({...modeloForm, subsegmento: e.target.value})} placeholder="Ej: C-SUV" /></div>
                    <div><label htmlFor="modeloForm-origen" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Origen (Fábrica)</label><input id="modeloForm-origen" type="text" className="w-full border p-2.5 text-xs focus:outline-none focus:border-[#0A1F33]" value={modeloForm.origen} onChange={e => setModeloForm({...modeloForm, origen: e.target.value})} placeholder="Ej: Brasil" /></div>
                    <div><label htmlFor="modeloForm-precio" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Precio Inicial (USD)</label><input id="modeloForm-precio" type="number" className="w-full border p-2.5 text-xs focus:outline-none focus:border-[#0A1F33] font-bold" value={modeloForm.startingPrice} onChange={e => setModeloForm({...modeloForm, startingPrice: e.target.value})} required /></div>
                  </div>
                  <ImageUploadField label="Imagen Catálogo" folder="models" value={modeloForm.imgUrl} onChange={url => setModeloForm({...modeloForm, imgUrl: url})} />
                  <div className="flex gap-3 mt-4">
                    <button type="button" onClick={() => setAbmModalType(null)} className="flex-1 border border-[#0A1F33] text-[#0A1F33] text-xs font-bold uppercase py-3 hover:bg-[#F5F5F5]">Cancelar</button>
                    <button type="submit" disabled={loading} className="flex-1 bg-[#0A1F33] text-[#FFFFFF] text-xs font-bold uppercase py-3 hover:bg-[#00BFFF] transition-colors">{modeloForm.id ? 'Guardar Cambios' : 'Crear Modelo'}</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal ABM Versiones (Matriz Completa de 5 Bloques) */}
          {abmModalType === 'versiones' && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
              <div className="bg-[#FFFFFF] border-t-4 border-[#00BFFF] border-l border-r border-b border-[#C0C0C0] w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl custom-scrollbar">
                <div className="flex justify-between items-center mb-4 border-b border-[#C0C0C0] pb-3">
                  <div>
                    <h3 className="font-black text-[#0A1F33] text-sm uppercase">{versionForm.id ? 'Modificar Ficha Técnica de Versión' : 'Añadir Nueva Versión Técnica'}</h3>
                    <span className="text-[10px] text-[#00BFFF] font-bold uppercase tracking-wider">Matriz Integral de 5 Dimensiones</span>
                  </div>
                  <button onClick={() => setAbmModalType(null)} className="text-[#C0C0C0] hover:text-[#0A1F33] text-lg font-bold">✕</button>
                </div>

                <form onSubmit={handleSaveVersion} className="flex flex-col gap-6">
                  {/* Bloque 1: Datos Principales */}
                  <fieldset className="border border-[#C0C0C0] p-4 bg-[#F8F9FA]">
                    <legend className="text-[10px] font-black text-[#0A1F33] bg-[#E6E6E6] border border-[#C0C0C0] uppercase tracking-widest px-3 py-1">1. Datos Comerciales</legend>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                      <div>
                        <label htmlFor="versionForm-modelId" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Modelo Vinculado</label>
                        <select id="versionForm-modelId" className="w-full border p-2 text-xs bg-[#FFFFFF] focus:outline-none focus:border-[#0A1F33] font-bold" value={versionForm.modelId} onChange={e => setVersionForm({...versionForm, modelId: e.target.value})} required>
                          <option value="">Seleccionar modelo...</option>
                          {modelosList.map(m => {
                            const b = marcasList.find(br => br.id === m.brandId);
                            return <option key={m.id} value={m.id}>{b ? `${b.name} - ` : ''}{m.name}</option>;
                          })}
                        </select>
                      </div>
                      <div><label htmlFor="versionForm-name" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Nombre de Versión</label><input id="versionForm-name" type="text" className="w-full border p-2 text-xs focus:outline-none focus:border-[#0A1F33] font-bold" value={versionForm.name} onChange={e => setVersionForm({...versionForm, name: e.target.value})} placeholder="Ej: 2.0 EX AT 4X4" required /></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div><label htmlFor="versionForm-price" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Precio (USD)</label><input id="versionForm-price" type="number" className="w-full border p-2 text-xs focus:outline-none focus:border-[#0A1F33] font-bold" value={versionForm.price} onChange={e => setVersionForm({...versionForm, price: e.target.value})} required /></div>
                      <div><label htmlFor="versionForm-promocion" className="text-[10px] font-bold text-[#00BFFF] uppercase block mb-1">Promoción</label><input id="versionForm-promocion" type="text" className="w-full border border-[#00BFFF]/30 p-2 text-xs focus:outline-none focus:border-[#00BFFF]" value={versionForm.promocion} onChange={e => setVersionForm({...versionForm, promocion: e.target.value})} placeholder="Ej: Bono US$ 1.500" /></div>
                      <div><label htmlFor="versionForm-concesionaria" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Concesionaria</label><input id="versionForm-concesionaria" type="text" className="w-full border p-2 text-xs focus:outline-none focus:border-[#0A1F33] uppercase" value={versionForm.concesionaria} onChange={e => setVersionForm({...versionForm, concesionaria: e.target.value})} placeholder="Ej: GARDEN" /></div>
                    </div>
                    <div className="mt-3"><label htmlFor="versionForm-url_auto" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">URL Oficial (Ficha Técnica)</label><input id="versionForm-url_auto" type="text" className="w-full border p-2 text-xs focus:outline-none focus:border-[#0A1F33]" value={versionForm.url_auto} onChange={e => setVersionForm({...versionForm, url_auto: e.target.value})} placeholder="https://..." /></div>
                  </fieldset>

                  {/* Bloque 2: Motor y Transmisión */}
                  <fieldset className="border border-[#C0C0C0] p-4 bg-[#F8F9FA]">
                    <legend className="text-[10px] font-black text-[#0A1F33] bg-[#E6E6E6] border border-[#C0C0C0] uppercase tracking-widest px-3 py-1">2. Motor y Transmisión</legend>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                      <div><label htmlFor="versionForm-combustible" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Combustible Base</label><input id="versionForm-combustible" type="text" className="w-full border p-2 text-xs bg-white" value={versionForm.combustible} onChange={e => setVersionForm({...versionForm, combustible: e.target.value})} placeholder="Nafta / HEV / EV" /></div>
                      <div><label htmlFor="versionForm-motor" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Motor</label><input id="versionForm-motor" type="text" className="w-full border p-2 text-xs bg-white" value={versionForm.motor} onChange={e => setVersionForm({...versionForm, motor: e.target.value})} placeholder="Ej: 2.0L Turbo 240 CV" /></div>
                      <div><label htmlFor="versionForm-transmision" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Caja / Transmisión</label><input id="versionForm-transmision" type="text" className="w-full border p-2 text-xs bg-white" value={versionForm.transmision} onChange={e => setVersionForm({...versionForm, transmision: e.target.value})} placeholder="Ej: AT 8 Vel" /></div>
                      <div><label htmlFor="versionForm-traccion" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Tracción</label><input id="versionForm-traccion" type="text" className="w-full border p-2 text-xs bg-white" value={versionForm.traccion} onChange={e => setVersionForm({...versionForm, traccion: e.target.value})} placeholder="Ej: FWD / 4WD" /></div>
                    </div>
                  </fieldset>

                  {/* Bloque 3: Arquitectura y Dimensiones */}
                  <fieldset className="border border-[#C0C0C0] p-4 bg-[#F8F9FA]">
                    <legend className="text-[10px] font-black text-[#0A1F33] bg-[#E6E6E6] border border-[#C0C0C0] uppercase tracking-widest px-3 py-1">3. Arquitectura y Dimensiones (mm)</legend>
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                      <div><label className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Largo</label><input type="number" className="w-full border p-2 text-xs bg-white" value={versionForm.largo} onChange={e => setVersionForm({...versionForm, largo: e.target.value})} /></div>
                      <div><label className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Ancho</label><input type="number" className="w-full border p-2 text-xs bg-white" value={versionForm.ancho} onChange={e => setVersionForm({...versionForm, ancho: e.target.value})} /></div>
                      <div><label className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Alto</label><input type="number" className="w-full border p-2 text-xs bg-white" value={versionForm.alto} onChange={e => setVersionForm({...versionForm, alto: e.target.value})} /></div>
                      <div><label className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Despeje</label><input type="number" className="w-full border p-2 text-xs bg-white" value={versionForm.despeje_suelo} onChange={e => setVersionForm({...versionForm, despeje_suelo: e.target.value})} /></div>
                      <div><label className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Baulera (L)</label><input type="number" className="w-full border p-2 text-xs bg-white" value={versionForm.baulera_litros} onChange={e => setVersionForm({...versionForm, baulera_litros: e.target.value})} /></div>
                      <div><label className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Plazas</label><input type="number" className="w-full border p-2 text-xs bg-white" value={versionForm.plazas} onChange={e => setVersionForm({...versionForm, plazas: e.target.value})} /></div>
                    </div>
                  </fieldset>

                  {/* Bloque 4: Seguridad y Equipamiento */}
                  <fieldset className="border border-[#C0C0C0] p-4 bg-[#F8F9FA]">
                    <legend className="text-[10px] font-black text-[#0A1F33] bg-[#E6E6E6] border border-[#C0C0C0] uppercase tracking-widest px-3 py-1">4. Seguridad, Confort y ADAS</legend>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                      <div><label className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Airbags</label><input type="number" className="w-full border p-2 text-xs bg-white" value={versionForm.airbags} onChange={e => setVersionForm({...versionForm, airbags: e.target.value})} /></div>
                      <div><label className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Pantalla (")</label><input type="number" step="0.1" className="w-full border p-2 text-xs bg-white" value={versionForm.tamanho_pantalla} onChange={e => setVersionForm({...versionForm, tamanho_pantalla: e.target.value})} /></div>
                      <div><label className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Cámaras</label><input type="text" className="w-full border p-2 text-xs bg-white" value={versionForm.camaras} onChange={e => setVersionForm({...versionForm, camaras: e.target.value})} placeholder="360 / Reversa" /></div>
                      <div><label className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Garantía</label><input type="text" className="w-full border p-2 text-xs bg-white" value={versionForm.garantia} onChange={e => setVersionForm({...versionForm, garantia: e.target.value})} placeholder="5 años" /></div>
                    </div>
                    <div className="flex flex-col gap-3">
                      <div><label className="text-[10px] font-bold text-[#00BFFF] uppercase block mb-1">Sistemas ADAS (Separar con | )</label><input type="text" className="w-full border border-[#00BFFF]/40 p-2 text-xs bg-white" value={versionForm.adas} onChange={e => setVersionForm({...versionForm, adas: e.target.value})} placeholder="Frenado autónomo | Alerta punto ciego | Mantenimiento carril" /></div>
                      <div><label className="text-[10px] font-bold text-[#0A1F33] uppercase block mb-1">Seguridad Standard (Separar con ; )</label><textarea rows={2} className="w-full border p-2 text-xs bg-white resize-none" value={versionForm.seguridad_standard} onChange={e => setVersionForm({...versionForm, seguridad_standard: e.target.value})} placeholder="6 Airbags; Frenos ABS + EBD; Control de estabilidad"></textarea></div>
                      <div><label className="text-[10px] font-bold text-[#0A1F33] uppercase block mb-1">Confort y Conveniencia (Separar con ; )</label><textarea rows={2} className="w-full border p-2 text-xs bg-white resize-none" value={versionForm.confort_conveniencia} onChange={e => setVersionForm({...versionForm, confort_conveniencia: e.target.value})} placeholder="Asientos de cuero; Climatizador bizona; Techo panorámico"></textarea></div>
                    </div>
                  </fieldset>

                  <div className="flex gap-3">
                    <button type="button" onClick={() => setAbmModalType(null)} className="flex-1 border border-[#0A1F33] text-[#0A1F33] text-xs font-bold uppercase py-3 hover:bg-[#F5F5F5]">Cancelar</button>
                    <button type="submit" disabled={loading} className="flex-1 bg-[#00BFFF] hover:bg-[#0A1F33] text-[#FFFFFF] text-xs font-bold uppercase py-3 transition-colors">{versionForm.id ? 'Guardar Cambios' : 'Crear Versión Técnica'}</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal ABM Concesionarias */}
          {abmModalType === 'concesionarias' && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
              <div className="bg-[#FFFFFF] border-t-4 border-[#0A1F33] border-l border-r border-b border-[#C0C0C0] w-full max-w-lg p-6 shadow-2xl">
                <div className="flex justify-between items-center mb-4 border-b border-[#C0C0C0] pb-3">
                  <h3 className="font-black text-[#0A1F33] text-sm uppercase">{concesionariaForm.id ? 'Modificar Concesionaria' : 'Crear Nueva Concesionaria'}</h3>
                  <button onClick={() => setAbmModalType(null)} className="text-[#C0C0C0] hover:text-[#0A1F33] text-lg font-bold">✕</button>
                </div>
                <form onSubmit={handleSaveConcesionaria} className="flex flex-col gap-4">
                  <div><label htmlFor="concesionariaForm-name" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Nombre Comercial</label><input id="concesionariaForm-name" type="text" className="w-full border p-3 text-xs focus:outline-none focus:border-[#0A1F33] uppercase font-bold" value={concesionariaForm.name} onChange={e => setConcesionariaForm({...concesionariaForm, name: e.target.value})} required /></div>
                  <div><label htmlFor="concesionariaForm-email" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Email Gerencia (Recepción Leads)</label><input id="concesionariaForm-email" type="email" className="w-full border p-3 text-xs focus:outline-none focus:border-[#0A1F33]" value={concesionariaForm.email_gerencia} onChange={e => setConcesionariaForm({...concesionariaForm, email_gerencia: e.target.value})} placeholder="gerente@concesionaria.com" /></div>
                  <div>
                    <label htmlFor="concesionariaForm-status" className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Estado</label>
                    <select id="concesionariaForm-status" className="w-full border p-3 text-xs focus:outline-none focus:border-[#0A1F33] bg-white font-bold" value={concesionariaForm.status} onChange={e => setConcesionariaForm({...concesionariaForm, status: e.target.value})}>
                      <option value="active">Activa</option>
                      <option value="inactive">Inactiva</option>
                    </select>
                  </div>

                  {/* DATACAR CHECK (L) */}
                  <div className="flex items-start gap-2 bg-[#E6F4EA] p-3 border border-[#1E8E3E]/30">
                    <input type="checkbox" id="concesionariaForm-datacarCheck" checked={concesionariaForm.datacarCheck} onChange={e => setConcesionariaForm({...concesionariaForm, datacarCheck: e.target.checked})} className="w-4 h-4 mt-0.5 accent-[#1E8E3E]" />
                    <label htmlFor="concesionariaForm-datacarCheck" className="cursor-pointer">
                      <span className="text-[10px] font-black text-[#1E8E3E] uppercase tracking-widest block">Sello Oficial DATACAR CHECK (L)</span>
                      <span className="text-[9px] text-[#3A3A3C] block mt-1 leading-relaxed">Marca a esta concesionaria como socia oficial responsable de sus propios precios y datos. El sello se propaga automáticamente a todos sus productos.</span>
                    </label>
                  </div>

                  <div className="flex gap-3 mt-4">
                    <button type="button" onClick={() => setAbmModalType(null)} className="flex-1 border border-[#0A1F33] text-[#0A1F33] text-xs font-bold uppercase py-3 hover:bg-[#F5F5F5]">Cancelar</button>
                    <button type="submit" disabled={loading} className="flex-1 bg-[#0A1F33] text-[#FFFFFF] text-xs font-bold uppercase py-3 hover:bg-[#00BFFF] transition-colors">{concesionariaForm.id ? 'Guardar Cambios' : 'Crear Concesionaria'}</button>
                  </div>
                </form>
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
            <div className="flex flex-col gap-6 h-full">
              {/* ACCESO RÁPIDO AL SLIDER HOME DE MODELOS DESTACADOS (MÁX. 3 BANNERS) */}
              <div className="bg-[#0A1F33] text-white border border-[#00BFFF]/50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="bg-[#00BFFF] text-[#0A1F33] text-[9px] font-black uppercase tracking-widest px-2 py-0.5">
                      NUEVO EXPERIMENTO HOME
                    </span>
                    <span className="text-xs font-black uppercase tracking-wider">
                      🎠 Banner Slider de Modelos Destacados en HOME (Máx. 3 Banners)
                    </span>
                  </div>
                  <p className="text-[10px] text-[#C0C0C0] mt-1">
                    Elegí hasta 3 modelos del catálogo, personalizá el texto promocional, el botón CTA y alterná entre las 2 sugerencias de ubicación en el Home.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('slider_home')}
                  className="bg-[#00BFFF] hover:bg-white text-[#0A1F33] font-black text-[10px] uppercase tracking-widest px-5 py-3 transition-colors shrink-0 cursor-pointer"
                >
                  Configurar Slider Home ({homeSliderConfig.slides.length}/3) →
                </button>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 flex-1">
              {/* COLUMNA IZQUIERDA: INYECTOR DE ADS POR ESPACIO PUBLICITARIO */}
              <div className="xl:col-span-1 bg-[#FFFFFF] border border-[#C0C0C0] p-6 h-fit overflow-y-auto custom-scrollbar">
                <div className="flex items-center justify-between mb-4 border-b border-[#C0C0C0] pb-3">
                  <div>
                    <h2 className="font-bold text-[#0A1F33] text-sm uppercase">
                      {adForm.id ? 'Editar Pauta Publicitaria' : 'Inyector de Pautas Publicitarias'}
                    </h2>
                    <p className="text-[10px] text-[#3A3A3C] mt-0.5">
                      Seleccioná uno de los 5 espacios publicitarios para configurar la campaña.
                    </p>
                  </div>
                  {adForm.id && (
                    <button
                      type="button"
                      onClick={handleResetAdForm}
                      className="text-[9px] font-bold uppercase text-[#D93025] border border-[#D93025] px-2.5 py-1 hover:bg-[#D93025] hover:text-white transition-colors shrink-0"
                    >
                      Cancelar Edición ✕
                    </button>
                  )}
                </div>

                <form onSubmit={handleCreateAd} className="flex flex-col gap-4">
                  {/* PASO 1: SELECCIÓN DEL ESPACIO PUBLICITARIO (1 a 5) */}
                  <div>
                    <label htmlFor="adForm-location" className="text-[10px] font-black text-[#0A1F33] uppercase tracking-wider block mb-2">
                      1. Espacio Publicitario (Ubicación)
                    </label>
                    <div className="grid grid-cols-1 gap-1.5 mb-2">
                      {[
                        { id: 'home', num: '1', title: 'Home', badge: '1200x400 px', desc: 'Banner principal en la portada de DATACAR.' },
                        { id: 'catalogo', num: '2', title: 'Catálogo General', badge: '1200x400 px', desc: 'Banner general en el listado del catálogo.' },
                        { id: 'catalogo_filtros', num: '3', title: 'Catálogo Filtros', badge: '1200x400 px', desc: 'Banner según filtro de Carrocería y/o Movilidad.' },
                        { id: 'recomendador', num: '4', title: 'Recomendador (Slot Modelo)', badge: 'Sin dimensiones', desc: 'Inyecta el modelo como 4ta opción "⭐ Opción Patrocinada" con su CTA nativo.' },
                        { id: 'comparador', num: '5', title: 'Comparador (Slot Modelo)', badge: 'Sin dimensiones', desc: 'Resalta el modelo como "⭐ Opción Patrocinada" con su CTA nativo.' },
                        { id: 'recomendador_banner', num: '6', title: 'Banner Recomendador', badge: '1200x400 px', desc: 'Banner inferior debajo de los resultados (apaga auto-pauta DATACAR).' },
                      ].map(space => {
                        const isSelected = adForm.location === space.id;
                        return (
                          <button
                            key={space.id}
                            type="button"
                            onClick={() => setAdForm({
                              ...adForm,
                              location: space.id,
                              targetCategory: space.id === 'catalogo_filtros' ? adForm.targetCategory : 'Todas',
                              targetCombustible: space.id === 'catalogo_filtros' ? adForm.targetCombustible : 'Todas',
                            })}
                            className={`w-full text-left p-2.5 border transition-colors flex items-center justify-between gap-2 ${
                              isSelected
                                ? 'bg-[#0A1F33] text-[#FFFFFF] border-[#0A1F33]'
                                : 'bg-[#F8F9FA] text-[#0A1F33] border-[#C0C0C0] hover:border-[#00BFFF]'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className={`text-[9px] font-black px-1.5 py-0.5 uppercase ${isSelected ? 'bg-[#00BFFF] text-[#0A1F33]' : 'bg-[#E6E6E6] text-[#0A1F33]'}`}>
                                  #{space.num}
                                </span>
                                <span className="text-xs font-black uppercase tracking-wide truncate">
                                  {space.title}
                                </span>
                              </div>
                              <p className={`text-[9px] mt-0.5 truncate ${isSelected ? 'text-[#C0C0C0]' : 'text-[#3A3A3C]'}`}>
                                {space.desc}
                              </p>
                            </div>
                            <span className={`text-[8px] font-bold uppercase tracking-widest px-2 py-1 border shrink-0 ${
                              isSelected
                                ? 'border-[#00BFFF] text-[#00BFFF] bg-[#00BFFF]/10'
                                : 'border-[#C0C0C0] text-[#3A3A3C] bg-white'
                            }`}>
                              {space.badge}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* FICHA INFORMATIVA DEL ESPACIO SELECCIONADO */}
                    <div className="bg-[#F5FBFF] border border-[#00BFFF]/50 p-3 text-[10px] text-[#0A1F33]">
                      {adForm.location === 'home' && (
                        <p><strong>1. Home (1200x400):</strong> Se muestra en la página principal. Requiere imagen (subida o URL), anunciante, enlace web de redirección y fechas de inicio/fin.</p>
                      )}
                      {adForm.location === 'catalogo' && (
                        <p><strong>2. Catálogo General (1200x400):</strong> Se muestra en el catálogo general cuando no hay una pauta específica de filtro. Requiere imagen (subida o URL), anunciante, enlace web y fechas de inicio/fin.</p>
                      )}
                      {adForm.location === 'catalogo_filtros' && (
                        <p><strong>3. Catálogo Filtros (1200x400):</strong> Se activa cuando el usuario filtra por <strong>Tipo de Carrocería</strong> y/o <strong>Tipo de Movilidad</strong> (HEV, PHEV, EV, MHEV, Nafta, Diésel, etc.).</p>
                      )}
                      {adForm.location === 'recomendador' && (
                        <p><strong>4. Recomendador (Slot Modelo Patrocinado):</strong> Inyecta el modelo elegido con filtros de Marca y Concesionaria como <strong>4ta opción &ldquo;⭐ Opción Patrocinada&rdquo;</strong> en el recomendador, con su botón CTA de cotización. Si no hay pauta activa, salen 3 opciones orgánicas sin dejar espacio vacío.</p>
                      )}
                      {adForm.location === 'comparador' && (
                        <p><strong>5. Comparador (Slot Modelo Patrocinado):</strong> Resalta el modelo elegido como <strong>&ldquo;⭐ Opción Patrocinada&rdquo;</strong> en el comparador de versiones. No requiere imagen de banner ni enlace externo (usa el botón CTA propio del comparador).</p>
                      )}
                      {adForm.location === 'recomendador_banner' && (
                        <p><strong>6. Banner Recomendador (1200x400):</strong> Se ubica debajo de las opciones recomendadas. Mientras esté activa, apaga el banner institucional de DATACAR.</p>
                      )}
                    </div>
                  </div>

                  {/* CONFIGURACIÓN ESPECÍFICA PARA #3 CATÁLOGO FILTROS */}
                  {adForm.location === 'catalogo_filtros' && (
                    <div className="bg-[#F8F9FA] border border-[#00BFFF] p-3.5 flex flex-col gap-3">
                      <span className="text-[10px] font-black text-[#0A1F33] uppercase tracking-wider block border-b border-[#C0C0C0]/60 pb-1.5">
                        Segmentación del Filtro (Carrocería y/o Movilidad)
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="adForm-targetCategory" className="text-[9px] font-bold text-[#0A1F33] uppercase block mb-1">
                            Tipo de Carrocería
                          </label>
                          <select
                            id="adForm-targetCategory"
                            className="w-full border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#00BFFF] bg-white font-semibold text-[#0A1F33]"
                            value={adForm.targetCategory}
                            onChange={e => setAdForm({ ...adForm, targetCategory: e.target.value })}
                          >
                            <option value="Todas">Cualquiera (Sin filtro de carrocería)</option>
                            {categoriasUnicas.map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label htmlFor="adForm-targetCombustible" className="text-[9px] font-bold text-[#0A1F33] uppercase block mb-1">
                            Tipo de Movilidad
                          </label>
                          <select
                            id="adForm-targetCombustible"
                            className="w-full border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#00BFFF] bg-white font-semibold text-[#0A1F33]"
                            value={adForm.targetCombustible}
                            onChange={e => setAdForm({ ...adForm, targetCombustible: e.target.value })}
                          >
                            <option value="Todas">Cualquiera (Sin filtro de movilidad)</option>
                            {combustiblesUnicos.map(comb => (
                              <option key={comb} value={comb}>
                                {comb} — {combustibleLabel(comb)}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <span className="text-[9px] text-[#3A3A3C] leading-snug">
                        Podés elegir solo Carrocería (ej: SUV), solo Movilidad (ej: HEV), o combinar ambos filtros a la vez.
                      </span>
                    </div>
                  )}

                  {/* CONFIGURACIÓN ESPECÍFICA PARA #4 RECOMENDADOR Y #5 COMPARADOR (FILTROS CONCESIONARIA / MARCA -> MODELO) */}
                  {(adForm.location === 'comparador' || adForm.location === 'recomendador') && (
                    <div className="bg-[#F8F9FA] border border-[#00BFFF] p-3.5 flex flex-col gap-3">
                      <span className="text-[10px] font-black text-[#0A1F33] uppercase tracking-wider block border-b border-[#C0C0C0]/60 pb-1.5">
                        ⭐ Selección del Modelo en Pauta ({adForm.location === 'recomendador' ? 'Recomendador' : 'Comparador'})
                      </span>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label htmlFor="adFilter-concesionaria" className="text-[9px] font-bold text-[#3A3A3C] uppercase block mb-1">
                            Filtrar por Concesionaria
                          </label>
                          <select
                            id="adFilter-concesionaria"
                            className="w-full border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#00BFFF] bg-white text-[#0A1F33]"
                            value={adModelFilterConcesionaria}
                            onChange={e => {
                              const deal = e.target.value;
                              setAdModelFilterConcesionaria(deal);
                              setAdModelFilterMarca('Todas');
                            }}
                          >
                            <option value="Todas">Todas las Concesionarias</option>
                            {concesionariasParaAds.map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label htmlFor="adFilter-marca" className="text-[9px] font-bold text-[#3A3A3C] uppercase block mb-1">
                            Filtrar por Marca
                          </label>
                          <select
                            id="adFilter-marca"
                            className="w-full border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#00BFFF] bg-white text-[#0A1F33]"
                            value={adModelFilterMarca}
                            onChange={e => setAdModelFilterMarca(e.target.value)}
                          >
                            <option value="Todas">Todas las Marcas ({marcasParaAds.length})</option>
                            {marcasParaAds.map(b => (
                              <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label htmlFor="adForm-modelId" className="text-[10px] font-black text-[#0A1F33] uppercase block mb-1">
                          Modelo a Destacar en Pauta *
                        </label>
                        <select
                          id="adForm-modelId"
                          className="w-full border border-[#0A1F33] p-2.5 text-xs focus:outline-none focus:border-[#00BFFF] bg-white font-bold text-[#0A1F33]"
                          value={adForm.modelId || ''}
                          onChange={e => {
                            const mId = e.target.value;
                            const sel = modelosList.find(m => m.id === mId);
                            const brand = sel ? marcasList.find(b => b.id === sel.brandId) : null;
                            const dealerVer = versionesList.find(v => v.modelId === mId && v.concesionaria);
                            const suggestedSponsor = adModelFilterConcesionaria !== 'Todas'
                              ? adModelFilterConcesionaria
                              : (brand?.name || dealerVer?.concesionaria || '');
                            setAdForm({
                              ...adForm,
                              modelId: mId,
                              sponsor: adForm.sponsor || suggestedSponsor
                            });
                          }}
                          required={adForm.location === 'comparador' || adForm.location === 'recomendador'}
                        >
                          <option value="">-- Seleccioná un modelo ({modelosParaAds.length} disponibles) --</option>
                          {modelosParaAds.map(m => {
                            const b = marcasList.find(brand => brand.id === m.brandId);
                            const dealerVer = versionesList.find(v => v.modelId === m.id && v.concesionaria);
                            const dealerTag = dealerVer?.concesionaria ? ` (${dealerVer.concesionaria})` : '';
                            const label = b ? `${b.name} - ${m.name}${dealerTag}` : `${m.name}${dealerTag}`;
                            return (
                              <option key={m.id} value={m.id}>{label}</option>
                            );
                          })}
                        </select>
                        <span className="text-[9px] text-[#3A3A3C] block mt-1 leading-tight">
                          No requiere subir imagen ni enlace externo: {adForm.location === 'recomendador' ? 'el recomendador inyectará la tarjeta del modelo como 4ta "⭐ Opción Patrocinada"' : 'el comparador resaltará automáticamente la tarjeta del modelo como "Opción Patrocinada"'} con su botón CTA de cotización.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* PASO 2: ANUNCIANTE (OBLIGATORIO EN LOS 5 ESPACIOS) */}
                  <div>
                    <label htmlFor="adForm-sponsor" className="text-[10px] font-black text-[#0A1F33] uppercase block mb-1">
                      2. Anunciante (Marca / Concesionaria) *
                    </label>
                    <input
                      id="adForm-sponsor"
                      type="text"
                      placeholder="Ej: Toyotoshi S.A. / Toyota Paraguay"
                      className="w-full border border-[#C0C0C0] p-2.5 text-xs focus:outline-none focus:border-[#0A1F33]"
                      value={adForm.sponsor}
                      onChange={e => setAdForm({ ...adForm, sponsor: e.target.value })}
                      required
                    />
                  </div>

                  {/* PASO 3: IMAGEN 1200x400 Y ENLACE DE REDIRECCIÓN (SOLO BANNERS 1, 2, 3 Y 6) */}
                  {adForm.location !== 'comparador' && adForm.location !== 'recomendador' && (
                    <div className="border border-[#C0C0C0] p-3.5 bg-[#F8F9FA] flex flex-col gap-3">
                      <div className="flex items-center justify-between border-b border-[#C0C0C0]/60 pb-1.5">
                        <span className="text-[10px] font-black text-[#0A1F33] uppercase tracking-wider">
                          3. Creatividad del Aviso y Enlace
                        </span>
                        <span className="text-[9px] font-black text-[#00BFFF] bg-[#0A1F33] px-2 py-0.5 uppercase tracking-widest">
                          1200 x 400 px
                        </span>
                      </div>

                      <ImageUploadField
                        label="Imagen del Banner (Subir archivo o pegar enlace de imagen) *"
                        folder="campaigns"
                        value={adForm.img}
                        onChange={url => setAdForm({ ...adForm, img: url })}
                      />

                      <div>
                        <label htmlFor="adForm-link" className="text-[10px] font-bold text-[#0A1F33] uppercase block mb-1">
                          Enlace Web de Redirección *
                        </label>
                        <input
                          id="adForm-link"
                          type="text"
                          placeholder="https://www.anunciante.com.py o /catalogo?marca=..."
                          className="w-full border border-[#C0C0C0] p-2.5 text-xs focus:outline-none focus:border-[#0A1F33] bg-white"
                          value={adForm.link}
                          onChange={e => setAdForm({ ...adForm, link: e.target.value })}
                          required={adForm.location !== 'comparador' && adForm.location !== 'recomendador'}
                        />
                        <span className="text-[9px] text-[#3A3A3C] block mt-1">
                          Web a la que será dirigido el usuario al hacer clic en el banner.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* PASO 4: VIGENCIA DE LA CAMPAÑA (INICIO / FIN) */}
                  <div className="border border-[#C0C0C0] p-3.5 bg-[#FFFFFF]">
                    <span className="text-[10px] font-black text-[#0A1F33] uppercase tracking-wider block mb-2">
                      {(adForm.location === 'comparador' || adForm.location === 'recomendador') ? '3. Inicio y Fin de la Campaña *' : '4. Inicio y Fin de la Campaña *'}
                    </span>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="adForm-startDate" className="text-[9px] font-bold text-[#3A3A3C] uppercase block mb-1">
                          Fecha de Inicio
                        </label>
                        <input
                          id="adForm-startDate"
                          type="date"
                          className="w-full border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#0A1F33]"
                          value={adForm.startDate}
                          onChange={e => setAdForm({ ...adForm, startDate: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <label htmlFor="adForm-endDate" className="text-[9px] font-bold text-[#3A3A3C] uppercase block mb-1">
                          Fecha de Fin
                        </label>
                        <input
                          id="adForm-endDate"
                          type="date"
                          className="w-full border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#0A1F33]"
                          value={adForm.endDate}
                          onChange={e => setAdForm({ ...adForm, endDate: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="mt-1 bg-[#0A1F33] text-[#FFFFFF] text-xs font-bold uppercase py-3.5 hover:bg-[#00BFFF] hover:text-[#0A1F33] transition-colors tracking-widest"
                  >
                    {adForm.id ? 'Guardar Cambios de Pauta' : 'Activar e Inyectar Pauta'}
                  </button>
                </form>
              </div>

              {/* COLUMNA DERECHA: BÓVEDA PUBLICITARIA ACTIVA CON FILTRO POR ESPACIO */}
              <div className="xl:col-span-2 bg-[#FFFFFF] border border-[#C0C0C0] flex flex-col h-full min-h-[500px]">
                <div className="p-4 bg-[#F5F5F5] border-b border-[#C0C0C0] flex flex-col gap-3 shrink-0">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                    <div>
                      <span className="font-bold text-xs uppercase tracking-widest text-[#0A1F33] block">
                        Bóveda de Pautas Publicitarias
                      </span>
                      <span className="text-[10px] text-[#3A3A3C]">
                        Administrá las campañas activas, programadas y pausadas en los 5 espacios de DATACAR.
                      </span>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest bg-[#0A1F33] text-[#00BFFF] px-3 py-1.5 self-start sm:self-auto">
                      Total: {campaignsList.length} pautas
                    </span>
                  </div>

                  {/* FILTROS RÁPIDOS DE LA BÓVEDA POR ESPACIO */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[
                      { id: 'todos', label: 'Todos los espacios' },
                      { id: 'home', label: '1. Home' },
                      { id: 'catalogo', label: '2. Catálogo General' },
                      { id: 'catalogo_filtros', label: '3. Catálogo Filtros' },
                      { id: 'recomendador', label: '4. Recomendador (Slot Modelo)' },
                      { id: 'comparador', label: '5. Comparador (Slot Modelo)' },
                      { id: 'recomendador_banner', label: '6. Banner Recomendador' },
                    ].map(tab => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setAdVaultFilterLocation(tab.id)}
                        className={`px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider border transition-colors ${
                          adVaultFilterLocation === tab.id
                            ? 'bg-[#0A1F33] text-[#FFFFFF] border-[#0A1F33]'
                            : 'bg-[#FFFFFF] text-[#3A3A3C] border-[#C0C0C0] hover:border-[#0A1F33]'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="overflow-auto flex-grow custom-scrollbar p-6 flex flex-col gap-4">
                  {(() => {
                    const now = new Date();
                    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

                    // Verificar si hay alguna campaña de banner vigente en el Recomendador para mostrar el estado del banner DATACAR
                    const recomendadorHasActiveSponsor = campaignsList.some((c: any) => {
                      if (c.isActive === false) return false;
                      const loc = (c.location || '').toLowerCase();
                      if (loc !== 'recomendador_banner' && (loc !== 'recomendador' || c.modelId)) return false;
                      if (c.startDate && c.startDate > today) return false;
                      if (c.endDate && c.endDate < today) return false;
                      return true;
                    });

                    const filteredVault = campaignsList.filter((camp: any) => {
                      if (adVaultFilterLocation === 'todos') return true;
                      const isFilterAd = camp.location === 'catalogo_filtros' || (camp.location === 'catalogo' && ((camp.targetCategory && camp.targetCategory !== 'Todas') || (camp.targetCombustible && camp.targetCombustible !== 'Todas')));
                      if (adVaultFilterLocation === 'catalogo_filtros') return isFilterAd;
                      if (adVaultFilterLocation === 'catalogo') return (camp.location === 'catalogo' && !isFilterAd) || camp.location === 'ambos';
                      const isRecomendadorModel = (camp.location === 'recomendador' || camp.location === 'recomendador_slot') && Boolean(camp.modelId);
                      const isRecomendadorBanner = camp.location === 'recomendador_banner' || (camp.location === 'recomendador' && !camp.modelId);
                      if (adVaultFilterLocation === 'recomendador') return isRecomendadorModel;
                      if (adVaultFilterLocation === 'recomendador_banner') return isRecomendadorBanner;
                      if (adVaultFilterLocation === 'comparador') return camp.location === 'comparador' || (Boolean(camp.modelId) && !isRecomendadorModel);
                      return camp.location === adVaultFilterLocation || camp.location === 'ambos';
                    });

                    return (
                      <>
                        {/* INDICADOR DE ESTADO AUTOMÁTICO DEL BANNER RECOMENDADOR (DATACAR VS ANUNCIANTE) */}
                        {(adVaultFilterLocation === 'todos' || adVaultFilterLocation === 'recomendador_banner') && (
                          <div className={`p-3 border flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                            recomendadorHasActiveSponsor
                              ? 'bg-[#ECFDF5] border-[#6EE7B7] text-[#065F46]'
                              : 'bg-[#F8F9FA] border-[#C0C0C0] text-[#0A1F33]'
                          }`}>
                            <div className="text-[10px]">
                              <span className="font-black uppercase tracking-wider block">
                                Estado Espacio #6 (Banner Recomendador):
                              </span>
                              <span>
                                {recomendadorHasActiveSponsor
                                  ? 'Ocupado por anunciante activo → La pauta propia de DATACAR se encuentra apagada automáticamente.'
                                  : 'Sin anunciante vigente → Se muestra automáticamente la pauta institucional de "DATACAR (Negociamos por vos)".'}
                              </span>
                            </div>
                            <span className={`text-[8px] font-black uppercase px-2.5 py-1 border shrink-0 self-start sm:self-center ${
                              recomendadorHasActiveSponsor
                                ? 'bg-white border-[#059669] text-[#059669]'
                                : 'bg-[#0A1F33] border-[#0A1F33] text-[#00BFFF]'
                            }`}>
                              {recomendadorHasActiveSponsor ? 'Anunciante Activo (Datacar OFF)' : 'Pauta DATACAR Activa (Auto)'}
                            </span>
                          </div>
                        )}

                        {filteredVault.length === 0 ? (
                          <p className="text-[10px] text-center text-[#C0C0C0] font-bold uppercase py-12">
                            No hay campañas registradas para este espacio publicitario.
                          </p>
                        ) : (
                          filteredVault.map((camp: any) => {
                            const isVigente = camp.isActive !== false && (!camp.startDate || camp.startDate <= today) && (!camp.endDate || camp.endDate >= today);
                            const isProgramada = camp.isActive !== false && camp.startDate && camp.startDate > today;
                            const isVencida = camp.isActive !== false && camp.endDate && camp.endDate < today;
                            const isPausada = camp.isActive === false;

                            const isFilterAd = camp.location === 'catalogo_filtros' || (camp.location === 'catalogo' && ((camp.targetCategory && camp.targetCategory !== 'Todas') || (camp.targetCombustible && camp.targetCombustible !== 'Todas')));
                            const isRecomendadorModel = (camp.location === 'recomendador' || camp.location === 'recomendador_slot') && Boolean(camp.modelId);
                            const isCompAd = camp.location === 'comparador' || (Boolean(camp.modelId) && !isRecomendadorModel && camp.location !== 'home' && camp.location !== 'catalogo');

                            const locationLabel = (() => {
                              if (isRecomendadorModel) return '4. Recomendador (Slot Modelo Patrocinado)';
                              if (isCompAd) return '5. Comparador (Modelo Patrocinado • Sin dimensiones)';
                              if (isFilterAd) return '3. Catálogo Filtros (1200x400)';
                              if (camp.location === 'home') return '1. Home (1200x400)';
                              if (camp.location === 'catalogo') return '2. Catálogo General (1200x400)';
                              if (camp.location === 'recomendador_banner' || (camp.location === 'recomendador' && !camp.modelId)) return '6. Banner Recomendador (1200x400)';
                              return `Multiespacio (${camp.location})`;
                            })();

                            return (
                              <div key={camp.id} className={`border p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-colors ${camp.isActive !== false ? 'border-[#00BFFF] bg-[#F5FBFF]' : 'border-[#C0C0C0] bg-[#F8F9FA]'}`}>
                                <div className="flex items-center gap-4 min-w-0 w-full">
                                  {isValidImageSrc(camp.img) && (
                                    <div className="w-28 h-14 relative bg-white border border-[#C0C0C0]/60 shrink-0">
                                      <Image
                                        src={camp.img}
                                        alt={camp.sponsor || 'Banner'}
                                        fill
                                        className="object-contain p-0.5"
                                        unoptimized={!isOptimizableImageSrc(camp.img)}
                                      />
                                    </div>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                      <span className="bg-[#0A1F33] text-[#FFFFFF] px-2 py-0.5 text-[8px] font-black uppercase tracking-wider">
                                        {locationLabel}
                                      </span>
                                      {isVigente && <span className="bg-[#ECFDF5] text-[#059669] border border-[#6EE7B7] px-2 py-0.5 text-[8px] font-bold uppercase">Vigente</span>}
                                      {isProgramada && <span className="bg-[#FFFBEB] text-[#B45309] border border-[#FCD34D] px-2 py-0.5 text-[8px] font-bold uppercase">Programada</span>}
                                      {isVencida && <span className="bg-[#FEF2F2] text-[#DC2626] border border-[#FCA5A5] px-2 py-0.5 text-[8px] font-bold uppercase">Vencida</span>}
                                      {isPausada && <span className="bg-[#F8F9FA] text-[#3A3A3C] border border-[#C0C0C0] px-2 py-0.5 text-[8px] font-bold uppercase">Pausada</span>}
                                    </div>

                                    <p className="font-black text-sm text-[#0A1F33] uppercase truncate" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
                                      Anunciante: {camp.sponsor}
                                    </p>

                                    {/* DETALLES SEGÚN EL ESPACIO */}
                                    {isFilterAd && (
                                      <div className="flex flex-wrap gap-1.5 mt-1">
                                        {camp.targetCategory && camp.targetCategory !== 'Todas' && (
                                          <span className="bg-white border border-[#0A1F33] text-[#0A1F33] text-[8px] font-bold uppercase px-2 py-0.5">
                                            Carrocería: {camp.targetCategory}
                                          </span>
                                        )}
                                        {camp.targetCombustible && camp.targetCombustible !== 'Todas' && (
                                          <span className="bg-white border border-[#00BFFF] text-[#0A1F33] text-[8px] font-bold uppercase px-2 py-0.5">
                                            Movilidad: {camp.targetCombustible} ({combustibleLabel(camp.targetCombustible)})
                                          </span>
                                        )}
                                      </div>
                                    )}

                                    {isCompAd && camp.modelId && (
                                      <p className="mt-1">
                                        <span className="inline-block bg-[#00BFFF]/15 border border-[#00BFFF] text-[#0A1F33] text-[9px] font-black uppercase px-2 py-0.5">
                                          ⭐ Modelo en Pauta: {camp.brandName ? `${camp.brandName} ` : ''}{camp.modelName || camp.modelId} (CTA Nativo Comparador)
                                        </span>
                                      </p>
                                    )}

                                    {!isCompAd && camp.link && (
                                      <p className="text-[9px] text-[#3A3A3C] truncate mt-1">
                                        <span className="font-bold uppercase text-[#0A1F33]">Redirección:</span>{' '}
                                        <span className="font-mono text-[#00BFFF]">{camp.link}</span>
                                      </p>
                                    )}

                                    <p className="text-[9px] text-[#3A3A3C] font-semibold uppercase mt-1">
                                      Vigencia: <span className="text-[#0A1F33] font-bold">{camp.startDate || 'Sin inicio'}</span> al <span className="text-[#0A1F33] font-bold">{camp.endDate || 'Sin fin'}</span>
                                    </p>
                                  </div>
                                </div>
                                <div className="flex gap-2 shrink-0 self-end md:self-center">
                                  <button onClick={() => handleEditAd(camp)} className="border border-[#00BFFF] text-[#00BFFF] hover:bg-[#00BFFF] hover:text-white px-3 py-2 text-[9px] font-bold uppercase transition-colors">Editar</button>
                                  <button onClick={() => handleToggleAd(camp.id, camp.isActive !== false)} className={`border ${camp.isActive !== false ? 'border-[#D93025] text-[#D93025]' : 'border-[#0A1F33] text-[#0A1F33]'} px-3 py-2 text-[9px] font-bold uppercase`}>{camp.isActive !== false ? 'Pausar' : 'Activar'}</button>
                                  <button onClick={() => handleDelete('campaigns', camp.id)} className="border border-[#C0C0C0] text-[#C0C0C0] hover:border-[#D93025] hover:text-[#D93025] px-2.5 py-2 text-[9px] font-bold uppercase" title="Eliminar pauta">✕</button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
              </div>
            </div>
          )}

          {/* ======================================= */}
          {/* VISTA: SLIDER HOME (MÁX. 3 MODELOS)    */}
          {/* ======================================= */}
          {activeTab === 'slider_home' && (
            <div className="flex flex-col gap-6 h-full">
              {/* CABECERA GLOBAL DEL SLIDER HOME */}
              <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-6 shrink-0">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="bg-[#0A1F33] text-[#00BFFF] text-[9px] font-black uppercase tracking-widest px-2.5 py-1">
                        SLIDER DE MODELOS DESTACADOS • HOME
                      </span>
                      <span className={`text-[9px] font-black uppercase px-2.5 py-1 border ${
                        homeSliderConfig.enabled
                          ? 'bg-[#ECFDF5] border-[#6EE7B7] text-[#059669]'
                          : 'bg-[#FEF2F2] border-[#FCA5A5] text-[#DC2626]'
                      }`}>
                        {homeSliderConfig.enabled ? 'Slider Activo en Home' : 'Slider Desactivado'}
                      </span>
                    </div>
                    <h2 className="font-black text-lg text-[#0A1F33] uppercase mt-2" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
                      Configurador de Banner Slider en Home (Límite: Hasta 3 Banners)
                    </h2>
                    <p className="text-[11px] text-[#3A3A3C] mt-0.5">
                      Ubicación fija: <strong>Entre &ldquo;Lo más buscado&rdquo; y la &ldquo;Calculadora de Cuotas&rdquo;</strong>. Elegí hasta 3 modelos del catálogo, personalizá el texto promocional y el botón CTA.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        persistHomeSliderConfig(
                          { ...homeSliderConfig, enabled: !homeSliderConfig.enabled },
                          homeSliderConfig.enabled ? 'Slider Home pausado.' : 'Slider Home activado.'
                        )
                      }
                      className={`text-[10px] font-bold uppercase tracking-widest px-4 py-2.5 border transition-colors cursor-pointer ${
                        homeSliderConfig.enabled
                          ? 'border-[#D93025] text-[#D93025] hover:bg-[#D93025] hover:text-white'
                          : 'bg-[#1E8E3E] border-[#1E8E3E] text-white hover:bg-[#15652C]'
                      }`}
                    >
                      {homeSliderConfig.enabled ? 'Pausar Slider' : 'Activar Slider'}
                    </button>

                    <Link
                      href="/"
                      target="_blank"
                      className="bg-[#0A1F33] hover:bg-[#00BFFF] hover:text-[#0A1F33] text-white font-bold text-[10px] uppercase tracking-widest px-4 py-2.5 transition-colors"
                    >
                      Ver en Home ↗
                    </Link>
                  </div>
                </div>
              </div>

              {/* CUERPO: FORMULARIO DE BANNER (IZQUIERDA) + LISTADO DE HASTA 3 BANNERS (DERECHA) */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 flex-1">
                {/* COLUMNA IZQUIERDA: FORMULARIO CREAR / EDITAR BANNER */}
                <div className="xl:col-span-1 bg-[#FFFFFF] border border-[#C0C0C0] p-6 h-fit">
                  <div className="flex items-center justify-between border-b border-[#C0C0C0] pb-3 mb-4">
                    <div>
                      <h3 className="font-black text-sm text-[#0A1F33] uppercase">
                        {sliderSlideForm.id ? 'Editar Banner del Slider' : 'Agregar Modelo al Slider'}
                      </h3>
                      <p className="text-[10px] text-[#3A3A3C]">
                        Capacidad ocupada: <strong>{homeSliderConfig.slides.length} de 3 banners</strong> permitidos.
                      </p>
                    </div>
                    {sliderSlideForm.id && (
                      <button
                        type="button"
                        onClick={handleResetSliderSlideForm}
                        className="text-[9px] font-bold uppercase text-[#D93025] border border-[#D93025] px-2.5 py-1 hover:bg-[#D93025] hover:text-white transition-colors cursor-pointer"
                      >
                        Cancelar ✕
                      </button>
                    )}
                  </div>

                  {!sliderSlideForm.id && homeSliderConfig.slides.length >= 3 && (
                    <div className="bg-[#FFFBEB] border border-[#FCD34D] text-[#B45309] p-3 mb-4 text-[10px] font-bold leading-relaxed">
                      ⚠️ Ya tenés configurados los <strong>3 banners máximos</strong>. Para agregar otro modelo, hacé clic en <strong>Editar</strong> o <strong>Eliminar</strong> sobre alguno de los 3 banners a la derecha.
                    </div>
                  )}

                  <form onSubmit={handleSaveSliderSlide} className="flex flex-col gap-4">
                    {/* PASO 1: ELEGIR MODELO A DESTACAR (CON FILTRO DE CONCESIONARIA Y MARCA) */}
                    <div className="bg-[#F8F9FA] border border-[#C0C0C0] p-3.5 flex flex-col gap-3">
                      <span className="text-[10px] font-black text-[#0A1F33] uppercase tracking-wider border-b border-[#C0C0C0]/60 pb-1.5">
                        1. Modelo a Destacar *
                      </span>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label htmlFor="sliderFilter-dealer" className="text-[9px] font-bold text-[#3A3A3C] uppercase block mb-1">
                            Filtrar Concesionaria
                          </label>
                          <select
                            id="sliderFilter-dealer"
                            className="w-full border border-[#C0C0C0] p-2 text-xs bg-white text-[#0A1F33]"
                            value={sliderFilterConcesionaria}
                            onChange={e => {
                              setSliderFilterConcesionaria(e.target.value);
                              setSliderFilterMarca('Todas');
                            }}
                          >
                            <option value="Todas">Todas las Concesionarias</option>
                            {concesionariasParaAds.map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label htmlFor="sliderFilter-brand" className="text-[9px] font-bold text-[#3A3A3C] uppercase block mb-1">
                            Filtrar Marca
                          </label>
                          <select
                            id="sliderFilter-brand"
                            className="w-full border border-[#C0C0C0] p-2 text-xs bg-white text-[#0A1F33]"
                            value={sliderFilterMarca}
                            onChange={e => setSliderFilterMarca(e.target.value)}
                          >
                            <option value="Todas">Todas las Marcas ({marcasParaSlider.length})</option>
                            {marcasParaSlider.map(b => (
                              <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label htmlFor="sliderForm-modelId" className="text-[10px] font-black text-[#0A1F33] uppercase block mb-1">
                          Seleccionar Modelo del Catálogo *
                        </label>
                        <select
                          id="sliderForm-modelId"
                          className="w-full border border-[#0A1F33] p-2.5 text-xs bg-white font-bold text-[#0A1F33]"
                          value={sliderSlideForm.modelId}
                          onChange={e => setSliderSlideForm({ ...sliderSlideForm, modelId: e.target.value })}
                          required
                        >
                          <option value="">-- Elegí un modelo ({modelosParaSlider.length} disponibles) --</option>
                          {modelosParaSlider.map(m => {
                            const b = marcasList.find(br => br.id === m.brandId);
                            const dealerVer = versionesList.find(v => v.modelId === m.id && v.concesionaria);
                            const dealerTag = dealerVer?.concesionaria ? ` (${dealerVer.concesionaria})` : '';
                            return (
                              <option key={m.id} value={m.id}>
                                {b ? `${b.name} - ` : ''}{m.name}{dealerTag}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </div>

                    {/* PASO 2: ETIQUETA / BADGE Y TEXTO PERSONALIZADO */}
                    <div>
                      <label htmlFor="sliderForm-badge" className="text-[10px] font-black text-[#0A1F33] uppercase block mb-1">
                        2. Etiqueta Superior (Badge)
                      </label>
                      <input
                        id="sliderForm-badge"
                        type="text"
                        placeholder="Ej: Destacado del Mes / Bono Especial / Lanzamiento"
                        className="w-full border border-[#C0C0C0] p-2.5 text-xs focus:outline-none focus:border-[#0A1F33]"
                        value={sliderSlideForm.badgeText}
                        onChange={e => setSliderSlideForm({ ...sliderSlideForm, badgeText: e.target.value })}
                      />
                    </div>

                    <div>
                      <label htmlFor="sliderForm-customText" className="text-[10px] font-black text-[#0A1F33] uppercase block mb-1">
                        3. Texto del Banner *
                      </label>
                      <textarea
                        id="sliderForm-customText"
                        rows={3}
                        placeholder="Ej: Entrega inmediata y financiación especial disponible en representantes oficiales con respaldo DATACAR CHECK."
                        className="w-full border border-[#C0C0C0] p-2.5 text-xs focus:outline-none focus:border-[#0A1F33] resize-none"
                        value={sliderSlideForm.customText}
                        onChange={e => setSliderSlideForm({ ...sliderSlideForm, customText: e.target.value })}
                        required
                      />
                    </div>

                    {/* PASO 3: CONFIGURACIÓN DEL BOTÓN CTA */}
                    <div className="bg-[#F8F9FA] border border-[#C0C0C0] p-3.5 flex flex-col gap-3">
                      <span className="text-[10px] font-black text-[#0A1F33] uppercase tracking-wider border-b border-[#C0C0C0]/60 pb-1.5">
                        4. Configuración del Botón CTA *
                      </span>

                      <div>
                        <label htmlFor="sliderForm-ctaText" className="text-[9px] font-bold text-[#0A1F33] uppercase block mb-1">
                          Texto del Botón CTA *
                        </label>
                        <input
                          id="sliderForm-ctaText"
                          type="text"
                          placeholder="Ej: Solicitar Cotización Directa / Agendar Test Drive"
                          className="w-full border border-[#C0C0C0] p-2.5 text-xs bg-white font-bold text-[#0A1F33]"
                          value={sliderSlideForm.ctaText}
                          onChange={e => setSliderSlideForm({ ...sliderSlideForm, ctaText: e.target.value })}
                          required
                        />
                      </div>

                      <div>
                        <label htmlFor="sliderForm-ctaAction" className="text-[9px] font-bold text-[#0A1F33] uppercase block mb-1">
                          Acción al hacer clic en el CTA
                        </label>
                        <select
                          id="sliderForm-ctaAction"
                          className="w-full border border-[#C0C0C0] p-2 text-xs bg-white font-semibold text-[#0A1F33]"
                          value={sliderSlideForm.ctaAction}
                          onChange={e =>
                            setSliderSlideForm({
                              ...sliderSlideForm,
                              ctaAction: e.target.value as 'cotizar' | 'ficha' | 'url',
                            })
                          }
                        >
                          <option value="cotizar">Abrir Modal de Cotización Directa (Lead directo a la Concesionaria)</option>
                          <option value="ficha">Ir a la Ficha Técnica del Modelo en DATACAR</option>
                          <option value="url">Redirigir a un Enlace / URL Personalizada</option>
                        </select>
                      </div>

                      {sliderSlideForm.ctaAction === 'url' && (
                        <div>
                          <label htmlFor="sliderForm-ctaUrl" className="text-[9px] font-bold text-[#0A1F33] uppercase block mb-1">
                            URL de Destino *
                          </label>
                          <input
                            id="sliderForm-ctaUrl"
                            type="text"
                            placeholder="https://... o /catalogo?marca=..."
                            className="w-full border border-[#C0C0C0] p-2 text-xs bg-white"
                            value={sliderSlideForm.ctaUrl}
                            onChange={e => setSliderSlideForm({ ...sliderSlideForm, ctaUrl: e.target.value })}
                            required={sliderSlideForm.ctaAction === 'url'}
                          />
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={loading || (!sliderSlideForm.id && homeSliderConfig.slides.length >= 3)}
                      className="bg-[#0A1F33] hover:bg-[#00BFFF] hover:text-[#0A1F33] text-white font-black text-xs uppercase tracking-widest py-3.5 transition-colors disabled:opacity-40 cursor-pointer"
                    >
                      {sliderSlideForm.id
                        ? 'Guardar Cambios del Banner'
                        : homeSliderConfig.slides.length >= 3
                        ? 'Límite de 3 Banners Alcanzado'
                        : 'Agregar Banner al Slider (${homeSliderConfig.slides.length + 1}/3)'.replace('${homeSliderConfig.slides.length + 1}', String(homeSliderConfig.slides.length + 1))}
                    </button>
                  </form>
                </div>

                {/* COLUMNA DERECHA: LISTA DE HASTA 3 BANNERS CONFIGURADOS */}
                <div className="xl:col-span-2 bg-[#FFFFFF] border border-[#C0C0C0] flex flex-col h-full min-h-[420px]">
                  <div className="p-4 bg-[#F5F5F5] border-b border-[#C0C0C0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <span className="font-black text-xs uppercase tracking-widest text-[#0A1F33] block">
                        Banners Configurados en el Slider ({homeSliderConfig.slides.length} / 3 Máximo)
                      </span>
                      <span className="text-[10px] text-[#3A3A3C]">
                        Podés editar el modelo, el texto, el CTA, pausar o cambiar el orden de aparición.
                      </span>
                    </div>
                    {homeSliderConfig.slides.length === 0 && (
                      <button
                        type="button"
                        onClick={handleLoadDemoSliderSlides}
                        className="bg-[#00BFFF] hover:bg-[#0A1F33] text-[#0A1F33] hover:text-white font-black text-[10px] uppercase tracking-widest px-4 py-2 transition-colors cursor-pointer"
                      >
                        ⚡ Cargar 3 Modelos de Prueba del Catálogo
                      </button>
                    )}
                  </div>

                  <div className="p-6 flex flex-col gap-4 flex-1 overflow-y-auto custom-scrollbar">
                    {homeSliderConfig.slides.length === 0 ? (
                      <div className="border border-dashed border-[#C0C0C0] p-10 text-center flex flex-col items-center justify-center gap-3">
                        <p className="text-xs font-black text-[#0A1F33] uppercase tracking-widest">
                          Aún no guardaste banners personalizados en la base de datos
                        </p>
                        <p className="text-[11px] text-[#3A3A3C] max-w-md leading-relaxed">
                          Mientras esta lista esté vacía, el Home muestra automáticamente <strong>3 modelos de demostración</strong> de tu catálogo para que puedas visualizar las 2 sugerencias en localhost. Usá el formulario de la izquierda o hacé clic en el botón de abajo para cargar 3 modelos editables ahora mismo.
                        </p>
                        <button
                          type="button"
                          onClick={handleLoadDemoSliderSlides}
                          className="mt-2 bg-[#0A1F33] hover:bg-[#00BFFF] hover:text-[#0A1F33] text-white font-black text-[10px] uppercase tracking-widest px-6 py-3 transition-colors cursor-pointer"
                        >
                          ⚡ Cargar 3 Modelos del Catálogo para Editar
                        </button>
                      </div>
                    ) : (
                      homeSliderConfig.slides.map((slide, idx) => {
                        const modelObj = modelosList.find(m => m.id === slide.modelId);
                        const brandObj = modelObj ? marcasList.find(b => b.id === modelObj.brandId) : null;
                        const dealerVer = versionesList.find(v => v.modelId === slide.modelId && v.concesionaria);
                        const fullName = modelObj
                          ? `${brandObj?.name || ''} ${modelObj.name}`.trim()
                          : `Modelo ID: ${slide.modelId}`;

                        return (
                          <div
                            key={slide.id}
                            className={`border p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-colors ${
                              slide.isActive !== false
                                ? 'border-[#00BFFF] bg-[#F5FBFF]'
                                : 'border-[#C0C0C0] bg-[#F8F9FA] opacity-75'
                            }`}
                          >
                            <div className="flex items-center gap-4 min-w-0 w-full">
                              <div className="w-8 h-8 rounded-full bg-[#0A1F33] text-[#00BFFF] font-black text-xs flex items-center justify-center shrink-0">
                                #{idx + 1}
                              </div>

                              {modelObj && isValidImageSrc(modelObj.imgUrl) && (
                                <div className="w-28 h-16 relative bg-white border border-[#C0C0C0]/60 shrink-0">
                                  <Image
                                    src={modelObj.imgUrl}
                                    alt={fullName}
                                    fill
                                    className="object-contain p-1"
                                    unoptimized={!isOptimizableImageSrc(modelObj.imgUrl)}
                                  />
                                </div>
                              )}

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                  <span className="bg-[#0A1F33] text-[#00BFFF] px-2 py-0.5 text-[8px] font-black uppercase tracking-wider">
                                    {slide.badgeText || 'Destacado'}
                                  </span>
                                  {dealerVer?.concesionaria && (
                                    <span className="bg-white border border-[#C0C0C0] text-[#0A1F33] px-2 py-0.5 text-[8px] font-bold uppercase">
                                      {dealerVer.concesionaria}
                                    </span>
                                  )}
                                  <span className={`px-2 py-0.5 text-[8px] font-bold uppercase border ${
                                    slide.isActive !== false
                                      ? 'bg-[#ECFDF5] text-[#059669] border-[#6EE7B7]'
                                      : 'bg-[#F8F9FA] text-[#3A3A3C] border-[#C0C0C0]'
                                  }`}>
                                    {slide.isActive !== false ? 'Activo' : 'Pausado'}
                                  </span>
                                </div>

                                <p className="font-black text-sm text-[#0A1F33] uppercase truncate" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
                                  {fullName}
                                </p>

                                <p className="text-[11px] text-[#3A3A3C] line-clamp-2 mt-1 leading-snug">
                                  “{slide.customText}”
                                </p>

                                <div className="flex flex-wrap items-center gap-2 mt-2">
                                  <span className="bg-[#00BFFF]/15 border border-[#00BFFF] text-[#0A1F33] text-[9px] font-black uppercase px-2.5 py-0.5">
                                    CTA: {slide.ctaText} →
                                  </span>
                                  <span className="text-[9px] text-[#3A3A3C] font-semibold uppercase">
                                    Acción:{' '}
                                    {slide.ctaAction === 'cotizar'
                                      ? 'Modal Cotización'
                                      : slide.ctaAction === 'ficha'
                                      ? 'Ficha Técnica'
                                      : `URL (${slide.ctaUrl})`}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0 self-end md:self-center">
                              <button
                                type="button"
                                onClick={() => handleMoveSliderSlide(idx, -1)}
                                disabled={idx === 0}
                                className="border border-[#C0C0C0] text-[#0A1F33] px-2 py-2 text-[9px] font-bold disabled:opacity-30 hover:border-[#0A1F33] cursor-pointer"
                                title="Subir orden"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveSliderSlide(idx, 1)}
                                disabled={idx === homeSliderConfig.slides.length - 1}
                                className="border border-[#C0C0C0] text-[#0A1F33] px-2 py-2 text-[9px] font-bold disabled:opacity-30 hover:border-[#0A1F33] cursor-pointer"
                                title="Bajar orden"
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEditSliderSlide(slide)}
                                className="border border-[#00BFFF] text-[#00BFFF] hover:bg-[#00BFFF] hover:text-white px-3 py-2 text-[9px] font-bold uppercase transition-colors cursor-pointer"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleSliderSlide(slide.id)}
                                className={`border px-3 py-2 text-[9px] font-bold uppercase cursor-pointer ${
                                  slide.isActive !== false
                                    ? 'border-[#D93025] text-[#D93025]'
                                    : 'border-[#0A1F33] text-[#0A1F33]'
                                }`}
                              >
                                {slide.isActive !== false ? 'Pausar' : 'Activar'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSliderSlide(slide.id)}
                                className="border border-[#C0C0C0] text-[#C0C0C0] hover:border-[#D93025] hover:text-[#D93025] px-2.5 py-2 text-[9px] font-bold uppercase cursor-pointer"
                                title="Eliminar banner"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ======================================= */}
          {/* VISTA: BLOG & RESEÑAS EN VIDEO (IG)    */}
          {/* ======================================= */}
          {activeTab === 'blog' && (
            <div className="flex flex-col gap-6 h-full">
              {/* SUBTABS DEL MÓDULO */}
              <div className="flex items-center justify-between border-b border-[#C0C0C0] bg-[#FFFFFF] p-4 shrink-0">
                <div className="flex gap-2">
                  <button
                    onClick={() => setBlogSubTab('posts')}
                    className={`text-xs font-bold uppercase tracking-wider px-5 py-2.5 transition-colors rounded-none border ${
                      blogSubTab === 'posts'
                        ? 'bg-[#0A1F33] text-[#FFFFFF] border-[#0A1F33]'
                        : 'bg-[#F8F9FA] text-[#3A3A3C] border-[#C0C0C0]/60 hover:border-[#0A1F33]'
                    }`}
                  >
                    📝 Artículos del Blog ({blogPostsList.length})
                  </button>
                  <button
                    onClick={() => setBlogSubTab('videos')}
                    className={`text-xs font-bold uppercase tracking-wider px-5 py-2.5 transition-colors rounded-none border ${
                      blogSubTab === 'videos'
                        ? 'bg-[#E1306C] text-[#FFFFFF] border-[#E1306C]'
                        : 'bg-[#F8F9FA] text-[#3A3A3C] border-[#C0C0C0]/60 hover:border-[#E1306C]'
                    }`}
                  >
                    🎬 Reseñas en Video / Reels IG ({combinedReelsList.length})
                  </button>
                </div>

                <a
                  href="/blog"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#00BFFF] uppercase tracking-wider hover:underline"
                >
                  <span>Ver Blog en Vivo ↗</span>
                </a>
              </div>

              {/* SUB-MÓDULO: ARTÍCULOS DE BLOG */}
              {blogSubTab === 'posts' && (
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 flex-grow overflow-hidden">
                  {/* FORMULARIO DE ENTRADA DE BLOG */}
                  <div className="xl:col-span-1 bg-[#FFFFFF] border border-[#C0C0C0] p-6 shadow-none flex flex-col h-full overflow-y-auto custom-scrollbar">
                    <h2 className="font-bold text-[#0A1F33] text-sm uppercase mb-2 border-b border-[#C0C0C0] pb-2">
                      {blogPostForm.id ? 'Editar Artículo' : 'Nuevo Artículo de Blog'}
                    </h2>
                    <p className="text-[9px] text-[#C0C0C0] uppercase tracking-widest mb-4">
                      Escribí guías de compra, comparativas o análisis para posicionar DATACAR en Google.
                    </p>

                    <form onSubmit={handleSaveBlogPost} className="flex flex-col gap-4">
                      <div>
                        <label className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Título del Artículo *</label>
                        <input
                          type="text"
                          required
                          value={blogPostForm.title}
                          onChange={e => {
                            const val = e.target.value;
                            setBlogPostForm(prev => ({
                              ...prev,
                              title: val,
                              slug: prev.id ? prev.slug : generarSlug(val),
                            }));
                          }}
                          placeholder="Ej: Los 5 SUVs más económicos de Paraguay"
                          className="w-full border p-2.5 text-xs focus:outline-none focus:border-[#00BFFF] rounded-none"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Slug URL *</label>
                          <input
                            type="text"
                            required
                            value={blogPostForm.slug}
                            onChange={e => setBlogPostForm({...blogPostForm, slug: e.target.value})}
                            placeholder="los-5-suvs-mas-economicos"
                            className="w-full border p-2 text-xs focus:outline-none focus:border-[#00BFFF] rounded-none font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Categoría</label>
                          <select
                            value={blogPostForm.category}
                            onChange={e => setBlogPostForm({...blogPostForm, category: e.target.value})}
                            className="w-full border p-2 text-xs focus:outline-none focus:border-[#00BFFF] rounded-none"
                          >
                            <option value="Guías de Compra">Guías de Compra</option>
                            <option value="Comparativas">Comparativas</option>
                            <option value="Financiación">Financiación</option>
                            <option value="Lanzamientos 0KM">Lanzamientos 0KM</option>
                            <option value="Mercado">Mercado</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Extracto / Meta Description *</label>
                        <textarea
                          rows={2}
                          required
                          value={blogPostForm.excerpt}
                          onChange={e => setBlogPostForm({...blogPostForm, excerpt: e.target.value})}
                          placeholder="Resumen corto de 1 o 2 frases que aparecerá en los resultados de Google..."
                          className="w-full border p-2 text-xs focus:outline-none focus:border-[#00BFFF] rounded-none"
                        />
                      </div>

                      {/* Imagen de portada */}
                      <ImageUploadField
                        label="Imagen Principal de Portada"
                        folder="blog"
                        value={blogPostForm.coverImage}
                        onChange={(url) => setBlogPostForm({...blogPostForm, coverImage: url})}
                      />

                      <div>
                        <label className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">
                          Cuerpo del Artículo (Formato Texto / Markdown) *
                        </label>
                        <p className="text-[9px] text-[#C0C0C0] mb-1">
                          Tip: Usá <code>## Subtítulo</code> para títulos, <code>- viñeta</code> para listas y <code>**negrita**</code>.
                        </p>
                        <textarea
                          rows={12}
                          required
                          value={blogPostForm.content}
                          onChange={e => setBlogPostForm({...blogPostForm, content: e.target.value})}
                          placeholder="Escribí aquí el contenido del artículo..."
                          className="w-full border p-2.5 text-xs font-mono focus:outline-none focus:border-[#00BFFF] rounded-none leading-relaxed"
                        />
                      </div>

                      <div className="flex items-center gap-2 border border-[#C0C0C0] p-3 bg-[#F8F9FA]">
                        <input
                          type="checkbox"
                          id="post-published"
                          checked={blogPostForm.published}
                          onChange={e => setBlogPostForm({...blogPostForm, published: e.target.checked})}
                          className="w-4 h-4 text-[#00BFFF] accent-[#00BFFF]"
                        />
                        <label htmlFor="post-published" className="text-xs font-bold text-[#0A1F33] uppercase cursor-pointer">
                          Publicar inmediatamente en la web
                        </label>
                      </div>

                      <div className="flex gap-2 mt-2">
                        {blogPostForm.id && (
                          <button
                            type="button"
                            onClick={() => setBlogPostForm({
                              id: '', title: '', slug: '', category: 'Guías de Compra', excerpt: '',
                              content: '', coverImage: '', author: 'Redacción DATACAR', published: true, readTimeMinutes: 4
                            })}
                            className="flex-1 border border-[#0A1F33] text-[#0A1F33] text-xs font-bold uppercase py-3 hover:bg-[#F5F5F5] transition-colors rounded-none"
                          >
                            Cancelar
                          </button>
                        )}
                        <button
                          type="submit"
                          disabled={loading}
                          className="flex-1 bg-[#0A1F33] text-[#FFFFFF] text-xs font-bold uppercase py-3 hover:bg-[#00BFFF] transition-colors rounded-none"
                        >
                          {blogPostForm.id ? 'Actualizar Artículo' : 'Guardar Artículo'}
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* LISTADO DE ARTÍCULOS */}
                  <div className="xl:col-span-2 bg-[#FFFFFF] border border-[#C0C0C0] flex flex-col h-full overflow-hidden">
                    <div className="p-4 bg-[#F5F5F5] border-b border-[#C0C0C0] flex justify-between items-center shrink-0">
                      <span className="font-bold text-xs uppercase tracking-widest text-[#0A1F33]">
                        Artículos Registrados ({blogPostsList.length})
                      </span>
                    </div>

                    <div className="overflow-auto flex-grow custom-scrollbar p-6 flex flex-col gap-4">
                      {blogPostsList.length === 0 ? (
                        <div className="text-center py-12 text-[#C0C0C0]">
                          <p className="font-bold uppercase tracking-widest text-xs">Sin artículos creados en base de datos.</p>
                          <p className="text-[10px] mt-1 text-[#3A3A3C]">Creá tu primer post en el panel izquierdo.</p>
                        </div>
                      ) : (
                        blogPostsList.map((post: any) => (
                          <div
                            key={post.id}
                            className={`border p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-colors ${
                              post.published !== false ? 'border-[#00BFFF]/40 bg-[#FFFFFF]' : 'border-[#C0C0C0] bg-[#F8F9FA]'
                            }`}
                          >
                            <div className="flex items-center gap-4 min-w-0">
                              {isValidImageSrc(post.coverImage) && (
                                <div className="w-20 h-14 relative bg-white border border-[#C0C0C0]/50 shrink-0">
                                  <Image
                                    src={post.coverImage}
                                    alt={post.title}
                                    fill
                                    className="object-cover"
                                    unoptimized={!isOptimizableImageSrc(post.coverImage)}
                                  />
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-[9px] font-bold text-[#00BFFF] uppercase tracking-wider">{post.category}</span>
                                  <span className={`text-[8px] font-bold uppercase px-2 py-0.5 ${post.published !== false ? 'bg-[#E6F4EA] text-[#1E8E3E]' : 'bg-[#F1F3F4] text-[#5F6368]'}`}>
                                    {post.published !== false ? 'Publicado' : 'Borrador'}
                                  </span>
                                </div>
                                <h3 className="font-bold text-xs sm:text-sm text-[#0A1F33] uppercase truncate" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
                                  {post.title}
                                </h3>
                                <p className="text-[9px] text-[#C0C0C0] font-mono mt-0.5">/blog/{post.slug}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <a
                                href={`/blog/${post.slug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="border border-[#00BFFF] text-[#00BFFF] px-3 py-1.5 text-[9px] font-bold uppercase hover:bg-[#00BFFF] hover:text-white transition-colors"
                              >
                                Ver ↗
                              </a>
                              <button
                                onClick={() => triggerEditBlogPost(post)}
                                className="border border-[#0A1F33] text-[#0A1F33] px-3 py-1.5 text-[9px] font-bold uppercase hover:bg-[#0A1F33] hover:text-white transition-colors"
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => handleTogglePostPublish(post.id, post.published !== false)}
                                className="border border-[#C0C0C0] text-[#3A3A3C] px-3 py-1.5 text-[9px] font-bold uppercase hover:border-[#0A1F33] transition-colors"
                              >
                                {post.published !== false ? 'Ocultar' : 'Publicar'}
                              </button>
                              <button
                                onClick={() => handleDelete('blog_posts', post.id)}
                                className="border border-[#D93025] text-[#D93025] px-2.5 py-1.5 text-[9px] font-bold uppercase hover:bg-[#D93025] hover:text-white transition-colors"
                              >
                                X
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* SUB-MÓDULO: RESEÑAS EN VIDEO / REELS (REFERENCIA DEL USUARIO) */}
              {blogSubTab === 'videos' && (
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 flex-grow overflow-hidden">
                  {/* FORMULARIO REELS */}
                  <div id="video-review-form-container" className="xl:col-span-1 bg-[#FFFFFF] border border-[#C0C0C0] p-6 shadow-none flex flex-col h-full overflow-y-auto custom-scrollbar">
                    <div className="flex items-center justify-between border-b border-[#C0C0C0] pb-2 mb-2">
                      <h2 className="font-bold text-[#0A1F33] text-sm uppercase flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888]" />
                        <span>{videoReviewForm.id ? 'Editar Miniatura / Reel' : 'Añadir Reseña en Video (Reel IG)'}</span>
                      </h2>
                      {videoReviewForm.id && (
                        <button
                          type="button"
                          onClick={handleCancelVideoReviewEdit}
                          className="text-[10px] font-bold uppercase text-[#E1306C] hover:underline"
                        >
                          + Nuevo Reel
                        </button>
                      )}
                    </div>

                    <p className="text-[9px] text-[#3A3A3C] uppercase tracking-widest mb-4">
                      {videoReviewForm.id 
                        ? `Modificando reel ID: ${videoReviewForm.id}. Cambiá la miniatura subiendo una foto o un enlace.` 
                        : 'Incrustá los reels y videos de @datacarpy para mostrarlos en el Home y en el Blog.'}
                    </p>

                    {videoReviewForm.id && (
                      <div className="mb-4 p-3 bg-gradient-to-r from-pink-50 via-orange-50 to-white border border-pink-200 text-xs text-[#0A1F33] flex items-center justify-between">
                        <div>
                          <span className="font-bold text-[#E1306C] uppercase">Modo Edición:</span>
                          <span className="ml-1 text-[#3A3A3C] text-[11px] block sm:inline">Cambiá la miniatura abajo y hacé clic en Guardar.</span>
                        </div>
                        <button
                          type="button"
                          onClick={handleCancelVideoReviewEdit}
                          className="text-[9px] bg-white border border-pink-300 px-2 py-0.5 font-bold uppercase text-pink-700 hover:bg-pink-100"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}

                    <form onSubmit={handleSaveVideoReview} className="flex flex-col gap-4">
                      <div>
                        <label className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Título del Video / Reel *</label>
                        <input
                          type="text"
                          required
                          value={videoReviewForm.title}
                          onChange={e => setVideoReviewForm({...videoReviewForm, title: e.target.value})}
                          placeholder="Ej: Comparativa SUVs Económicos en Paraguay"
                          className="w-full border p-2.5 text-xs focus:outline-none focus:border-[#E1306C] rounded-none"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Enlace del Reel de Instagram *</label>
                        <input
                          type="url"
                          required
                          value={videoReviewForm.url}
                          onChange={e => setVideoReviewForm({...videoReviewForm, url: e.target.value})}
                          placeholder="https://www.instagram.com/reel/..."
                          className="w-full border p-2.5 text-xs focus:outline-none focus:border-[#E1306C] rounded-none font-mono"
                        />
                      </div>

                      {/* Miniatura del video (permite subir archivo a Storage o ingresar URL) */}
                      <ImageUploadField
                        label="Miniatura / Cover del Reel (Subir imagen o pegar URL)"
                        folder="reels"
                        value={videoReviewForm.thumbnail}
                        onChange={(url) => setVideoReviewForm({...videoReviewForm, thumbnail: url})}
                        accentClass="text-[#E1306C]"
                      />

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Etiqueta / Badge</label>
                          <input
                            type="text"
                            value={videoReviewForm.tag}
                            onChange={e => setVideoReviewForm({...videoReviewForm, tag: e.target.value})}
                            placeholder="Ej: Motores, Comparativa, SUV"
                            className="w-full border p-2 text-xs focus:outline-none focus:border-[#E1306C] rounded-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">Orden de Aparición</label>
                          <input
                            type="number"
                            min="1"
                            value={videoReviewForm.order}
                            onChange={e => setVideoReviewForm({...videoReviewForm, order: Number(e.target.value) || 1})}
                            className="w-full border p-2 text-xs focus:outline-none focus:border-[#E1306C] rounded-none"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="mt-2 bg-gradient-to-r from-[#f09433] via-[#dc2743] to-[#bc1888] text-[#FFFFFF] text-xs font-bold uppercase py-3 hover:opacity-95 transition-opacity rounded-none shadow-sm flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                          <path d="M18.8 2H5.2C3.4 2 2 3.4 2 5.2v13.6C2 20.6 3.4 22 5.2 22h13.6c1.8 0 3.2-1.4 3.2-3.2V5.2C22 3.4 20.6 2 18.8 2zm1.2 16.8c0 .7-.5 1.2-1.2 1.2H5.2c-.7 0-1.2-.5-1.2-1.2V9.8h16v9zm0-11H4V5.2c0-.7.5-1.2 1.2-1.2h1.6l2 2.2h2.4l-2-2.2h2.4l2 2.2h2.4l-2-2.2h1.6c.7 0 1.2.5 1.2 1.2v2.6zM9.5 12.2l6 3.3-6 3.3v-6.6z"/>
                        </svg>
                        <span>{videoReviewForm.id ? '💾 Guardar Cambios en Miniatura / Reel' : '+ Publicar Reel en la Web'}</span>
                      </button>
                    </form>
                  </div>

                  {/* LISTADO DE VIDEOS / REELS CARGADOS */}
                  <div className="xl:col-span-2 bg-[#FFFFFF] border border-[#C0C0C0] flex flex-col h-full overflow-hidden">
                    <div className="p-4 bg-[#F5F5F5] border-b border-[#C0C0C0] flex justify-between items-center shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs uppercase tracking-widest text-[#0A1F33]">
                          Reels Oficiales en Pantalla ({combinedReelsList.length})
                        </span>
                        <span className="text-[10px] text-[#3A3A3C]">• Hacé clic en "Editar Miniatura" para cambiar la imagen</span>
                      </div>
                    </div>

                    <div className="overflow-auto flex-grow custom-scrollbar p-6">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {combinedReelsList.map((video: any) => {
                          const isSelected = videoReviewForm.id === video.id;
                          return (
                            <div
                              key={video.id}
                              className={`border bg-[#FFFFFF] flex flex-col justify-between overflow-hidden transition-all ${
                                isSelected ? 'border-[#E1306C] ring-2 ring-[#E1306C]/40 shadow-md' : 'border-[#C0C0C0]'
                              }`}
                            >
                              <div className="relative aspect-[16/10] bg-[#0A1F33] overflow-hidden">
                                {isValidImageSrc(video.thumbnail) ? (
                                  <Image
                                    src={video.thumbnail}
                                    alt={video.title}
                                    fill
                                    className="object-cover"
                                    unoptimized={!isOptimizableImageSrc(video.thumbnail)}
                                  />
                                ) : (
                                  <div className="w-full h-full bg-[#0A1F33] flex items-center justify-center text-white/40 text-xs">
                                    DATACAR Reel
                                  </div>
                                )}

                                {/* BOTÓN PLAY ESTILO INSTAGRAM REELS (GRADIENTE + CLAQUETA) */}
                                <div className="absolute inset-0 bg-black/25 flex items-center justify-center pointer-events-none">
                                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] flex items-center justify-center text-white shadow-lg ring-2 ring-white/80">
                                    <svg className="w-4 h-4 fill-white drop-shadow" viewBox="0 0 24 24">
                                      <path d="M18.8 2H5.2C3.4 2 2 3.4 2 5.2v13.6C2 20.6 3.4 22 5.2 22h13.6c1.8 0 3.2-1.4 3.2-3.2V5.2C22 3.4 20.6 2 18.8 2zm1.2 16.8c0 .7-.5 1.2-1.2 1.2H5.2c-.7 0-1.2-.5-1.2-1.2V9.8h16v9zm0-11H4V5.2c0-.7.5-1.2 1.2-1.2h1.6l2 2.2h2.4l-2-2.2h2.4l2 2.2h2.4l-2-2.2h1.6c.7 0 1.2.5 1.2 1.2v2.6zM9.5 12.2l6 3.3-6 3.3v-6.6z"/>
                                    </svg>
                                  </div>
                                </div>

                                {/* Tag de categoría */}
                                {video.tag && (
                                  <span className="absolute top-2 left-2 bg-[#0A1F33]/85 text-[#00BFFF] border border-white/20 text-[9px] font-bold uppercase px-2 py-0.5">
                                    {video.tag}
                                  </span>
                                )}

                                {/* Badge de estado: Oficial o Editado en Base de Datos */}
                                <span className={`absolute top-2 right-2 text-[8px] font-bold uppercase px-1.5 py-0.5 ${
                                  video.isCustomSaved ? 'bg-emerald-600 text-white' : 'bg-black/60 text-white/80'
                                }`}>
                                  {video.isCustomSaved ? 'Modificado en BD' : 'Oficial'}
                                </span>
                              </div>

                              <div className="p-3">
                                <h4 className="font-bold text-xs text-[#0A1F33] line-clamp-2 uppercase" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
                                  {video.title}
                                </h4>
                                
                                <div className="mt-3 flex items-center justify-between border-t border-[#C0C0C0]/40 pt-2.5 gap-2">
                                  <button
                                    type="button"
                                    onClick={() => triggerEditVideoReview(video)}
                                    className="flex-1 bg-gradient-to-r from-[#f09433] via-[#dc2743] to-[#bc1888] text-white px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider hover:opacity-90 flex items-center justify-center gap-1 transition-opacity"
                                  >
                                    <span>✏️</span>
                                    <span>Editar Miniatura</span>
                                  </button>

                                  <a
                                    href={video.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="border border-[#C0C0C0] text-[#E1306C] px-2 py-1 text-[9px] font-bold uppercase hover:border-[#E1306C]"
                                    title="Ver en Instagram"
                                  >
                                    Ver ↗
                                  </a>

                                  {video.isCustomSaved && (
                                    <button
                                      type="button"
                                      onClick={() => handleDelete('video_reviews', video.id)}
                                      className="border border-[#D93025] text-[#D93025] px-2 py-1 text-[8px] font-bold uppercase hover:bg-[#D93025] hover:text-white"
                                      title="Restablecer miniatura a predeterminada"
                                    >
                                      Reset
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* MÓDULO NEWSLETTER & DIFUSIÓN CORPORATIVA CON ESTILO DATACAR */}
          {/* ========================================================= */}
          {activeTab === 'newsletter' && (
            <div className="flex flex-col gap-6">
              {(() => {
                const totalCount = newsletterSubscribers.length;
                const activeCount = newsletterSubscribers.filter(s => s.estado !== 'Inactivo').length;
                const inactiveCount = totalCount - activeCount;

                const filteredSubscribers = newsletterSubscribers.filter(sub => {
                  if (subscriberFilterStatus === 'Activo' && sub.estado === 'Inactivo') return false;
                  if (subscriberFilterStatus === 'Inactivo' && sub.estado !== 'Inactivo') return false;
                  if (subscriberSearch.trim()) {
                    const q = subscriberSearch.toLowerCase();
                    const matchesEmail = sub.email.toLowerCase().includes(q);
                    const matchesOrigen = (sub.origen || '').toLowerCase().includes(q);
                    if (!matchesEmail && !matchesOrigen) return false;
                  }
                  return true;
                });

                const formatSubDate = (dateVal: any) => {
                  if (!dateVal) return '—';
                  if (typeof dateVal?.toDate === 'function') {
                    return dateVal.toDate().toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' });
                  }
                  if (dateVal instanceof Date) {
                    return dateVal.toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' });
                  }
                  if (typeof dateVal === 'string' || typeof dateVal === 'number') {
                    const d = new Date(dateVal);
                    if (!isNaN(d.getTime())) {
                      return d.toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' });
                    }
                  }
                  return '—';
                };

                const loadPresetTemplate = () => {
                  setBroadcastForm(prev => ({
                    ...prev,
                    subject: 'Boletín DATACAR: Novedades del Mercado Automotor y Nuevas Energías en Paraguay',
                    headline: 'Lo Último en SUVs Híbridos y Eléctricos 2026',
                    contentHtml: `<p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">Estimado lector de <strong>DATACAR</strong>,</p>
<p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">Esta semana analizamos la aceleración del mercado de vehículos híbridos y eléctricos en Paraguay, las nuevas opciones de financiamiento y los modelos más destacados de las principales concesionarias oficiales del país.</p>
<div style="background-color: #F0F9FF; border-left: 4px solid #00BFFF; padding: 14px 18px; margin: 18px 0; font-size: 14px; color: #0A1F33;">
  <strong>Dato Destacado del Mes:</strong> Más del 38% de las búsquedas en nuestro Recomendador Inteligente se concentran en tecnologías HEV y PHEV.
</div>
<h2 style="margin: 24px 0 12px 0; font-size: 18px; font-weight: 800; color: #0A1F33; text-transform: uppercase;">Puntos Clave para tu Próxima Compra:</h2>
<ul style="margin: 0 0 16px 20px; padding: 0; color: #334155; font-size: 14px; line-height: 1.6;">
  <li><strong>Autonomía Real:</strong> Los nuevos PHEV superan los 80 km de rango 100% eléctrico urbano.</li>
  <li><strong>Equipamiento de Seguridad:</strong> Paquetes ADAS nivel 2 ya disponibles en segmentos masivos.</li>
  <li><strong>Precios al Contado vs Financiado:</strong> Compará versiones y cuotas actualizadas en nuestra web.</li>
</ul>
<p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">Explorá las fichas técnicas completas y solicitá asesoría oficial directamente desde nuestra plataforma.</p>`,
                    buttonText: 'Explorar Catálogo y Recomendador',
                    buttonUrl: 'https://datacarpy.com/catalogo',
                  }));
                };

                const insertSnippet = (snippet: string) => {
                  setBroadcastForm(prev => ({
                    ...prev,
                    contentHtml: prev.contentHtml ? `${prev.contentHtml}\n${snippet}` : snippet
                  }));
                };

                return (
                  <>
                    {/* TARJETA DE AUDIENCIA & ESTADO GENERAL */}
                    <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-6 shadow-none">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#C0C0C0]">
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-sm font-black text-[#0A1F33] uppercase tracking-wider">
                              Difusión de Newsletter & Comunicaciones DATACAR
                            </h2>
                            <span className="bg-[#0A1F33] text-[#00BFFF] text-[9px] font-black px-2 py-0.5 uppercase tracking-widest">
                              Colección Firebase
                            </span>
                          </div>
                          <p className="text-xs text-[#3A3A3C] mt-1">
                            Emití correos electrónicos con formato HTML y diseño corporativo DATACAR a toda tu base de suscriptores vía copia oculta (BCC).
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setShowAddSubModal(true)}
                            className="bg-[#00BFFF] hover:bg-[#0A1F33] text-[#0A1F33] hover:text-[#FFFFFF] text-xs font-bold uppercase px-4 py-2.5 transition-colors border border-[#00BFFF]"
                          >
                            + Agregar Suscriptor
                          </button>
                          <button
                            type="button"
                            onClick={fetchAllData}
                            className="bg-[#F8F9FA] hover:bg-[#E2E8F0] text-[#0A1F33] text-xs font-bold uppercase px-3 py-2.5 transition-colors border border-[#C0C0C0]"
                            title="Recargar datos de Firebase"
                          >
                            🔄 Actualizar
                          </button>
                        </div>
                      </div>

                      {/* 4 KPIs DE AUDIENCIA */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                        <div className="bg-[#F8F9FA] border border-[#C0C0C0] p-3.5">
                          <span className="text-[9px] font-bold text-[#3A3A3C] uppercase tracking-widest block">
                            Audiencia Total Única
                          </span>
                          <span className="text-2xl font-black text-[#0A1F33] block mt-1" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
                            {totalCount}
                          </span>
                          <span className="text-[9px] text-[#3A3A3C] block mt-0.5">
                            Deduplicados en Firestore
                          </span>
                        </div>

                        <div className="bg-[#F8F9FA] border border-[#00BFFF] p-3.5">
                          <span className="text-[9px] font-bold text-[#0A1F33] uppercase tracking-widest block flex items-center justify-between">
                            <span>Suscriptores Activos</span>
                            <span className="w-2 h-2 rounded-full bg-[#059669]"></span>
                          </span>
                          <span className="text-2xl font-black text-[#0A1F33] block mt-1" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
                            {activeCount}
                          </span>
                          <span className="text-[9px] text-[#059669] font-bold block mt-0.5">
                            Destinatarios de cada envío
                          </span>
                        </div>

                        <div className="bg-[#F8F9FA] border border-[#C0C0C0] p-3.5">
                          <span className="text-[9px] font-bold text-[#3A3A3C] uppercase tracking-widest block">
                            Inactivos / Pausados
                          </span>
                          <span className="text-2xl font-black text-[#64748B] block mt-1" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
                            {inactiveCount}
                          </span>
                          <span className="text-[9px] text-[#64748B] block mt-0.5">
                            Excluidos de la difusión
                          </span>
                        </div>

                        <div className="bg-[#F8F9FA] border border-[#C0C0C0] p-3.5">
                          <span className="text-[9px] font-bold text-[#3A3A3C] uppercase tracking-widest block">
                            Gateway de Salida
                          </span>
                          <span className="text-xs font-black text-[#0A1F33] block mt-2 uppercase">
                            /api/mail (SMTP DATACAR)
                          </span>
                          <span className="text-[9px] text-[#059669] font-bold block mt-1 flex items-center gap-1">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#059669]"></span>
                            Listo para transmisión masiva
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* ALERTA DE ESTADO DE ENVÍO */}
                    {broadcastStatus && (
                      <div className={`p-4 border text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                        broadcastStatus.type === 'success'
                          ? 'bg-[#ECFDF5] border-[#6EE7B7] text-[#065F46]'
                          : broadcastStatus.type === 'error'
                          ? 'bg-[#FEF2F2] border-[#FCA5A5] text-[#991B1B]'
                          : 'bg-[#EFF6FF] border-[#93C5FD] text-[#1E40AF]'
                      }`}>
                        <div className="flex items-center gap-2">
                          <span className="text-base font-bold">
                            {broadcastStatus.type === 'success' ? '✅' : broadcastStatus.type === 'error' ? '❌' : '⏳'}
                          </span>
                          <span className="font-semibold">{broadcastStatus.message}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {broadcastStatus.previewUrl && (
                            <a
                              href={broadcastStatus.previewUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="bg-white border border-current px-3 py-1 font-bold uppercase text-[9px] hover:bg-black/5"
                            >
                              Ver Preview de Email ↗
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => setBroadcastStatus(null)}
                            className="text-[10px] font-bold uppercase opacity-70 hover:opacity-100"
                          >
                            Cerrar
                          </button>
                        </div>
                      </div>
                    )}

                    {/* SECCIÓN PRINCIPAL: REDACTOR HTML + PREVISUALIZACIÓN EN VIVO */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
                      {/* COLUMNA IZQUIERDA: FORMULARIO REDACTOR */}
                      <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-6 shadow-none flex flex-col gap-5">
                        <div className="flex items-center justify-between border-b border-[#C0C0C0] pb-3">
                          <div>
                            <h3 className="font-bold text-xs uppercase tracking-widest text-[#0A1F33]">
                              1. Redactor de Campaña HTML
                            </h3>
                            <span className="text-[10px] text-[#3A3A3C]">
                              Configurá los encabezados y el contenido enriquecido del boletín.
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={loadPresetTemplate}
                            className="text-[9px] font-black uppercase text-[#0A1F33] bg-[#E2E8F0] hover:bg-[#00BFFF] px-2.5 py-1.5 transition-colors border border-[#C0C0C0]"
                            title="Cargar texto de ejemplo listo para usar"
                          >
                            ⚡ Cargar Plantilla Ejemplo
                          </button>
                        </div>

                        {/* ASUNTO DEL CORREO */}
                        <div>
                          <label className="text-[10px] font-bold text-[#0A1F33] uppercase block mb-1">
                            Asunto del Correo (Subject) *
                          </label>
                          <input
                            type="text"
                            required
                            value={broadcastForm.subject}
                            onChange={e => setBroadcastForm({ ...broadcastForm, subject: e.target.value })}
                            placeholder="Ej: Novedades del Mercado Automotor | Especial Híbridos 2026"
                            className="w-full border border-[#C0C0C0] p-2.5 text-xs font-semibold focus:outline-none focus:border-[#00BFFF]"
                          />
                        </div>

                        {/* TITULAR INTERNO */}
                        <div>
                          <label className="text-[10px] font-bold text-[#0A1F33] uppercase block mb-1">
                            Titular Destacado (Encabezado dentro del correo)
                          </label>
                          <input
                            type="text"
                            value={broadcastForm.headline}
                            onChange={e => setBroadcastForm({ ...broadcastForm, headline: e.target.value })}
                            placeholder="Ej: Los 5 SUVs Híbridos más eficientes para este año"
                            className="w-full border border-[#C0C0C0] p-2.5 text-xs focus:outline-none focus:border-[#00BFFF]"
                          />
                        </div>

                        {/* BARRA DE HERRAMIENTAS RÁPIDAS DE HTML */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="text-[10px] font-bold text-[#0A1F33] uppercase">
                              Cuerpo del Mensaje (HTML enriquecido) *
                            </label>
                            <span className="text-[9px] text-[#64748B]">
                              Soporta párrafos, listas, enlaces y estilos inline
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-1 mb-2 p-1.5 bg-[#F8F9FA] border border-[#C0C0C0]">
                            <button
                              type="button"
                              onClick={() => insertSnippet('<p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">Escribí aquí tu párrafo...</p>')}
                              className="text-[9px] font-bold uppercase bg-white border border-[#CBD5E1] px-2 py-1 hover:border-[#0A1F33]"
                            >
                              + Párrafo
                            </button>
                            <button
                              type="button"
                              onClick={() => insertSnippet('<h2 style="margin: 24px 0 12px 0; font-size: 18px; font-weight: 800; color: #0A1F33; text-transform: uppercase;">Subtítulo</h2>')}
                              className="text-[9px] font-bold uppercase bg-white border border-[#CBD5E1] px-2 py-1 hover:border-[#0A1F33]"
                            >
                              + Subtítulo H2
                            </button>
                            <button
                              type="button"
                              onClick={() => insertSnippet('<div style="background-color: #F0F9FF; border-left: 4px solid #00BFFF; padding: 14px 18px; margin: 18px 0; font-size: 14px; color: #0A1F33;"><strong>Dato Clave:</strong> Información relevante...</div>')}
                              className="text-[9px] font-bold uppercase bg-[#F0F9FF] border border-[#00BFFF]/40 text-[#0A1F33] px-2 py-1 hover:border-[#00BFFF]"
                            >
                              + Alerta DATACAR
                            </button>
                            <button
                              type="button"
                              onClick={() => insertSnippet('<ul style="margin: 0 0 16px 20px; padding: 0; color: #334155; font-size: 14px; line-height: 1.6;">\n  <li>Punto destacado 1</li>\n  <li>Punto destacado 2</li>\n</ul>')}
                              className="text-[9px] font-bold uppercase bg-white border border-[#CBD5E1] px-2 py-1 hover:border-[#0A1F33]"
                            >
                              + Lista
                            </button>
                            <button
                              type="button"
                              onClick={() => insertSnippet('<a href="https://datacarpy.com" style="color: #00BFFF; font-weight: bold; text-decoration: underline;">Enlace de ejemplo</a>')}
                              className="text-[9px] font-bold uppercase bg-white border border-[#CBD5E1] px-2 py-1 hover:border-[#0A1F33]"
                            >
                              + Enlace Web
                            </button>
                            <button
                              type="button"
                              onClick={() => insertSnippet('<hr style="border: 0; border-top: 1px solid #E2E8F0; margin: 24px 0;" />')}
                              className="text-[9px] font-bold uppercase bg-white border border-[#CBD5E1] px-2 py-1 hover:border-[#0A1F33]"
                            >
                              + Separador
                            </button>
                          </div>

                          <textarea
                            rows={12}
                            required
                            value={broadcastForm.contentHtml}
                            onChange={e => setBroadcastForm({ ...broadcastForm, contentHtml: e.target.value })}
                            placeholder="Escribí aquí el cuerpo del correo en HTML..."
                            className="w-full border border-[#C0C0C0] p-3 text-xs font-mono focus:outline-none focus:border-[#00BFFF] leading-relaxed custom-scrollbar bg-white"
                          />
                        </div>

                        {/* BOTÓN CTA PRINCIPAL (OPCIONAL) */}
                        <div className="p-3.5 bg-[#F8F9FA] border border-[#C0C0C0]">
                          <span className="text-[10px] font-black text-[#0A1F33] uppercase tracking-wider block mb-2">
                            Botón de Acción Principal (Opcional)
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="text-[9px] font-bold text-[#3A3A3C] uppercase block mb-1">
                                Texto del Botón
                              </label>
                              <input
                                type="text"
                                value={broadcastForm.buttonText}
                                onChange={e => setBroadcastForm({ ...broadcastForm, buttonText: e.target.value })}
                                placeholder="Ej: Explorar Catálogo 2026"
                                className="w-full border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#00BFFF] bg-white"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] font-bold text-[#3A3A3C] uppercase block mb-1">
                                URL de Destino (Enlace)
                              </label>
                              <input
                                type="url"
                                value={broadcastForm.buttonUrl}
                                onChange={e => setBroadcastForm({ ...broadcastForm, buttonUrl: e.target.value })}
                                placeholder="https://datacarpy.com/catalogo"
                                className="w-full border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#00BFFF] bg-white font-mono"
                              />
                            </div>
                          </div>
                        </div>

                        {/* ACCIONES DE ENVÍO: TEST DISPATCH Y BROADCAST */}
                        <div className="border-t border-[#C0C0C0] pt-4 flex flex-col gap-4">
                          {/* ENVÍO DE TEST INDIVIDUAL */}
                          <div className="bg-[#F8F9FA] border border-[#C0C0C0] p-3.5 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                            <div className="flex-1">
                              <label className="text-[9px] font-bold text-[#3A3A3C] uppercase block mb-1">
                                Correo para Envío de Prueba (Test)
                              </label>
                              <input
                                type="email"
                                value={broadcastForm.sendTestEmail}
                                onChange={e => setBroadcastForm({ ...broadcastForm, sendTestEmail: e.target.value })}
                                placeholder="aldo.ojeda@datacarpy.com"
                                className="w-full border border-[#C0C0C0] p-2 text-xs focus:outline-none focus:border-[#0A1F33] bg-white"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={handleSendTestEmail}
                              disabled={broadcastSending}
                              className="bg-white hover:bg-[#0A1F33] text-[#0A1F33] hover:text-[#FFFFFF] border border-[#0A1F33] text-xs font-bold uppercase px-4 py-2.5 transition-colors self-end sm:self-auto shrink-0"
                            >
                              {broadcastSending ? 'Enviando...' : 'Enviar Prueba (Test)'}
                            </button>
                          </div>

                          {/* BOTÓN BROADCAST MASIVO */}
                          <button
                            type="button"
                            onClick={handleBroadcastNewsletter}
                            disabled={broadcastSending || activeCount === 0 || !broadcastForm.subject.trim() || !broadcastForm.contentHtml.trim()}
                            className="bg-[#0A1F33] hover:bg-[#00BFFF] text-[#FFFFFF] hover:text-[#0A1F33] text-xs font-black uppercase py-4 transition-colors tracking-widest disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                          >
                            {broadcastSending
                              ? 'Transmitiendo Campaña Masiva...'
                              : `🚀 Transmitir Campaña a ${activeCount} Suscriptores Activos`}
                          </button>
                        </div>
                      </div>

                      {/* COLUMNA DERECHA: PREVISUALIZACIÓN EN VIVO (MOCKUP CLIENTE DE CORREO) */}
                      <div className="bg-[#FFFFFF] border border-[#C0C0C0] flex flex-col h-full shadow-none overflow-hidden">
                        <div className="p-4 bg-[#F5F5F5] border-b border-[#C0C0C0] flex items-center justify-between shrink-0">
                          <div>
                            <span className="font-bold text-xs uppercase tracking-widest text-[#0A1F33] block">
                              2. Previsualización del Email en Tiempo Real
                            </span>
                            <span className="text-[10px] text-[#3A3A3C]">
                              Visualización exacta del formato corporativo DATACAR.
                            </span>
                          </div>
                          <span className="text-[9px] font-black uppercase px-2.5 py-1 bg-[#0A1F33] text-[#00BFFF] tracking-wider">
                            Formato DATACAR
                          </span>
                        </div>

                        <div className="p-4 sm:p-6 bg-[#E2E8F0]/50 flex-1 overflow-y-auto custom-scrollbar">
                          {/* SHELL CLIENTE DE CORREO */}
                          <div className="max-w-[560px] mx-auto bg-white border border-[#CBD5E1] shadow-md overflow-hidden">
                            {/* CABECERA METADATOS DE CLIENTE */}
                            <div className="bg-[#F8F9FA] border-b border-[#E2E8F0] px-4 py-2.5 text-[10px] text-[#475569] space-y-1">
                              <div><strong className="text-[#0A1F33]">De:</strong> DATACAR &lt;notificaciones@datacarpy.com&gt;</div>
                              <div><strong className="text-[#0A1F33]">Para:</strong> suscriptores@datacarpy.com <span className="text-[9px] text-[#94A3B8]">(Copia Oculta CCO)</span></div>
                              <div className="truncate"><strong className="text-[#0A1F33]">Asunto:</strong> <span className="font-semibold text-[#0A1F33]">{broadcastForm.subject || '(Sin asunto definido)'}</span></div>
                            </div>

                            {/* CABECERA CORPORATIVA DATACAR */}
                            <div className="bg-[#0A1F33] px-6 py-6 text-center border-b-4 border-[#00BFFF]">
                              <h1 className="text-2xl font-black tracking-widest text-white m-0" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
                                DATA<span className="text-[#00BFFF]">CAR</span>
                              </h1>
                              <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-[#94A3B8] mt-1 m-0">
                                Plataforma Automotriz de Paraguay
                              </p>
                            </div>

                            {/* CUERPO DEL CORREO */}
                            <div className="p-6 sm:p-8 bg-white">
                              {broadcastForm.headline ? (
                                <h2 className="text-lg font-black text-[#0A1F33] uppercase tracking-wide border-b-2 border-[#00BFFF] pb-3 mb-5" style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}>
                                  {broadcastForm.headline}
                                </h2>
                              ) : null}

                              {broadcastForm.contentHtml ? (
                                <div
                                  className="text-sm text-[#334155] leading-relaxed break-words space-y-3"
                                  dangerouslySetInnerHTML={{ __html: broadcastForm.contentHtml }}
                                />
                              ) : (
                                <div className="py-12 text-center text-xs text-[#94A3B8] italic">
                                  El contenido formateado en HTML se previsualizará aquí en tiempo real...
                                </div>
                              )}

                              {/* BOTÓN CTA */}
                              {broadcastForm.buttonText ? (
                                <div className="mt-8 text-center pt-2">
                                  <span className="inline-block bg-[#00BFFF] text-[#0A1F33] text-xs font-black uppercase tracking-widest py-3 px-8 shadow-sm">
                                    {broadcastForm.buttonText}
                                  </span>
                                  {broadcastForm.buttonUrl && (
                                    <p className="text-[9px] text-[#94A3B8] mt-2 truncate">
                                      Enlace: {broadcastForm.buttonUrl}
                                    </p>
                                  )}
                                </div>
                              ) : null}
                            </div>

                            {/* FOOTER CORPORATIVO DATACAR */}
                            <div className="bg-[#0A1F33] px-6 py-6 text-center text-[10px] text-[#94A3B8] border-t border-[#1E293B]">
                              <p className="m-0 font-bold text-white/90">
                                DATACAR Paraguay • El Comparador Inteligente de Autos 0km
                              </p>
                              <p className="m-0 text-[9px] text-[#64748B] mt-1">
                                Asunción, Paraguay • <span className="text-[#00BFFF]">datacarpy.com</span>
                              </p>
                              <div className="mt-3 pt-3 border-t border-[#1E293B] text-[8px] text-[#64748B] leading-relaxed">
                                Recibís este correo porque te suscribiste al newsletter de DATACAR. Para darte de baja, podés hacerlo en cualquier momento desde el pie del correo.
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* DIRECTORIO Y GESTIÓN DE SUSCRIPTORES */}
                    <div className="bg-[#FFFFFF] border border-[#C0C0C0] p-6 shadow-none flex flex-col gap-4 mt-2">
                      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-[#C0C0C0] pb-3">
                        <div>
                          <h3 className="font-bold text-xs uppercase tracking-widest text-[#0A1F33]">
                            3. Directorio de Suscriptores Registrados
                          </h3>
                          <span className="text-[10px] text-[#3A3A3C]">
                            Mostrando {filteredSubscribers.length} de {totalCount} suscriptores únicos en las colecciones <code className="bg-[#F1F5F9] px-1 text-[9px]">newsletter</code> y <code className="bg-[#F1F5F9] px-1 text-[9px]">newsletter_subscribers</code>.
                          </span>
                        </div>

                        {/* CONTROLES DE FILTRO Y BÚSQUEDA */}
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            placeholder="Buscar por email u origen..."
                            value={subscriberSearch}
                            onChange={e => setSubscriberSearch(e.target.value)}
                            className="border border-[#C0C0C0] px-3 py-1.5 text-xs focus:outline-none focus:border-[#0A1F33] w-48 sm:w-64"
                          />

                          <div className="flex border border-[#C0C0C0]">
                            {(['Todos', 'Activo', 'Inactivo'] as const).map(st => (
                              <button
                                key={st}
                                type="button"
                                onClick={() => setSubscriberFilterStatus(st)}
                                className={`px-2.5 py-1 text-[10px] font-bold uppercase transition-colors ${
                                  subscriberFilterStatus === st
                                    ? 'bg-[#0A1F33] text-[#FFFFFF]'
                                    : 'bg-white text-[#3A3A3C] hover:bg-[#F5F5F5]'
                                }`}
                              >
                                {st}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* TABLA DE SUSCRIPTORES */}
                      <div className="overflow-x-auto border border-[#C0C0C0]">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-[#0A1F33] text-white text-[9px] uppercase tracking-wider">
                              <th className="p-3">Correo Electrónico</th>
                              <th className="p-3">Canal / Origen</th>
                              <th className="p-3">Colección Firebase</th>
                              <th className="p-3">Estado</th>
                              <th className="p-3">Fecha Registro</th>
                              <th className="p-3 text-right">Acciones</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#C0C0C0]">
                            {filteredSubscribers.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="p-8 text-center text-[#94A3B8] text-xs font-bold uppercase tracking-wider">
                                  No se encontraron suscriptores con los filtros seleccionados.
                                </td>
                              </tr>
                            ) : (
                              filteredSubscribers.map((sub) => {
                                const isActivo = sub.estado !== 'Inactivo';
                                return (
                                  <tr key={`${sub.colName}_${sub.id}`} className="hover:bg-[#F8F9FA] transition-colors">
                                    <td className="p-3 font-semibold text-[#0A1F33]">
                                      {sub.email}
                                    </td>
                                    <td className="p-3 text-[#3A3A3C]">
                                      <span className="bg-[#F1F5F9] border border-[#CBD5E1] px-2 py-0.5 text-[9px] font-bold uppercase">
                                        {sub.origen || 'General'}
                                      </span>
                                    </td>
                                    <td className="p-3 text-[#64748B] font-mono text-[10px]">
                                      {sub.colName}
                                    </td>
                                    <td className="p-3">
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold uppercase border ${
                                        isActivo
                                          ? 'bg-[#ECFDF5] border-[#6EE7B7] text-[#065F46]'
                                          : 'bg-[#F1F5F9] border-[#CBD5E1] text-[#64748B]'
                                      }`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${isActivo ? 'bg-[#059669]' : 'bg-[#94A3B8]'}`} />
                                        {isActivo ? 'Activo' : 'Inactivo'}
                                      </span>
                                    </td>
                                    <td className="p-3 text-[#64748B] text-[10px]">
                                      {formatSubDate(sub.createdAt)}
                                    </td>
                                    <td className="p-3 text-right">
                                      <div className="flex items-center justify-end gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => handleToggleSubscriberStatus(sub)}
                                          className={`border px-2 py-1 text-[9px] font-bold uppercase transition-colors ${
                                            isActivo
                                              ? 'border-[#C0C0C0] text-[#3A3A3C] hover:bg-[#F1F5F9]'
                                              : 'border-[#059669] text-[#059669] hover:bg-[#ECFDF5]'
                                          }`}
                                          title={isActivo ? 'Pausar recepción de correos' : 'Activar recepción de correos'}
                                        >
                                          {isActivo ? 'Pausar' : 'Activar'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteSubscriber(sub)}
                                          className="border border-[#DC2626] text-[#DC2626] hover:bg-[#DC2626] hover:text-white px-2 py-1 text-[9px] font-bold uppercase transition-colors"
                                          title="Eliminar suscriptor definitivamente"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* MODAL PARA AGREGAR SUSCRIPTOR MANUAL */}
          {showAddSubModal && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
              <div className="bg-[#FFFFFF] border-t-4 border-[#0A1F33] border-l border-r border-b border-[#C0C0C0] w-full max-w-md p-6 shadow-2xl">
                <div className="flex justify-between items-center mb-4 border-b border-[#C0C0C0] pb-3">
                  <h3 className="font-black text-[#0A1F33] text-sm uppercase">
                    + Agregar Suscriptor al Newsletter
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowAddSubModal(false)}
                    className="text-[#C0C0C0] hover:text-[#0A1F33] text-lg font-bold"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleAddSubscriber} className="flex flex-col gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">
                      Correo Electrónico *
                    </label>
                    <input
                      type="email"
                      required
                      value={newSubEmail}
                      onChange={e => setNewSubEmail(e.target.value)}
                      placeholder="usuario@ejemplo.com"
                      className="w-full border border-[#C0C0C0] p-2.5 text-xs focus:outline-none focus:border-[#00BFFF]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-[#3A3A3C] uppercase block mb-1">
                      Canal u Origen
                    </label>
                    <select
                      value={newSubOrigen}
                      onChange={e => setNewSubOrigen(e.target.value)}
                      className="w-full border border-[#C0C0C0] p-2.5 text-xs focus:outline-none focus:border-[#00BFFF] bg-white text-[#0A1F33]"
                    >
                      <option value="Admin Manual">Admin Manual</option>
                      <option value="Lead B2B">Lead B2B / Concesionaria</option>
                      <option value="Evento / Expo">Evento / Expo Automotriz</option>
                      <option value="Campaña Externa">Campaña Externa</option>
                    </select>
                  </div>

                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setShowAddSubModal(false)}
                      className="flex-1 border border-[#0A1F33] text-[#0A1F33] text-xs font-bold uppercase py-2.5 hover:bg-[#F5F5F5]"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 bg-[#0A1F33] text-[#FFFFFF] text-xs font-bold uppercase py-2.5 hover:bg-[#00BFFF] hover:text-[#0A1F33] transition-colors"
                    >
                      {loading ? 'Guardando...' : 'Guardar Suscriptor'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
