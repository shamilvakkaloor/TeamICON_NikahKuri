// Firebase, loaded directly from Google's CDN as native ES modules.
// Nothing here needs `npm install` — the browser fetches these URLs itself.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged as _onAuthStateChanged,
  signInWithPopup,
  signOut as _signOut,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { firebaseConfig } from "../../config.js";

export function isFirebaseConfigured() {
  return Boolean(firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("PASTE_"));
}

let app;
let db;
let auth;

export function getFirebaseApp() {
  if (!app) app = initializeApp(firebaseConfig);
  return app;
}

export function getDb() {
  if (!db) {
    // Offline persistence matters here: money gets recorded standing next to
    // somebody at a masjid, often on poor mobile data. Writes queue locally and
    // sync when the connection returns.
    db = initializeFirestore(getFirebaseApp(), {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  }
  return db;
}

export function getFirebaseAuth() {
  if (!auth) auth = getAuth(getFirebaseApp());
  return auth;
}

export const googleProvider = new GoogleAuthProvider();
export const onAuthStateChanged = _onAuthStateChanged;
export const signOut = _signOut;
export { signInWithPopup };
