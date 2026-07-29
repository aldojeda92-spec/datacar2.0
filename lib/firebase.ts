
// lib/firebase.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  // Asegúrate de que aquí estén tus credenciales reales de Firebase
apiKey: "AIzaSyCwLxbZ3sXtwwTtpDvLYtkdMI3HLI7_vFM",
authDomain: "datacar2-0.firebaseapp.com",
projectId: "datacar2-0",
storageBucket: "datacar2-0.firebasestorage.app",
messagingSenderId: "642794625733",
appId: "1:642794625733:web:5702e681e726e3709f2eac"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);

export { app, db, auth };