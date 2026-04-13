import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// FORÇANDO O ID 'default' (sem parênteses) 
// pois o log do Google Cloud mostrou 100% de erro ao buscar o banco padrão
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, "default");

console.log("🚀 Firestore inicializado com banco ID: 'default'");


