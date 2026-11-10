// lib/firebase.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

// GUARDIÁN DE ENTORNO LOCAL:
// En desarrollo / localhost SIEMPRE forzamos la base de datos de PRUEBA (`gestion-taller-e578f`)
// para que JAMÁS se conecte ni modifique la base de producción (`datacar2-0`), incluso si alguien
// pisa accidentalmente `.env.local`.
const TEST_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyC7a12QTRpxh9lDI-AqNl8fkg-f5Kv6xT4',
  authDomain: 'gestion-taller-e578f.firebaseapp.com',
  projectId: 'gestion-taller-e578f',
  storageBucket: 'gestion-taller-e578f.firebasestorage.app',
  messagingSenderId: '894067285971',
  appId: '1:894067285971:web:2f66e3c0af033632ed5926',
};

const isLocalDev =
  process.env.NODE_ENV === 'development' ||
  (typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'));

const envConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Si estamos en localhost/development, forzamos SIEMPRE `gestion-taller-e578f`
const activeConfig = isLocalDev ? TEST_FIREBASE_CONFIG : envConfig;

for (const [key, value] of Object.entries(activeConfig)) {
  if (!value) throw new Error(`Falta la variable de entorno para Firebase: ${key} (revisá .env.local)`);
}

const firebaseConfig = activeConfig as Record<keyof typeof TEST_FIREBASE_CONFIG, string>;

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

export { app, db, auth, storage };
