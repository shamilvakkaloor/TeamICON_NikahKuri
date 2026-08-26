import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { GoogleAuthProvider, getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

/**
 * These values are public by design — they identify the project, they do not
 * grant access to it. All access control lives in firestore.rules.
 */
const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

const app = initializeApp(
  isConfigured
    ? firebaseConfig
    : // Keeps the module importable (and the app renderable with a setup
      // notice) before anyone has filled in .env.local.
      { apiKey: 'unconfigured', projectId: 'unconfigured', appId: 'unconfigured' },
);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
