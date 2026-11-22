import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCvqRUAMqivdei1u4MHyl1C4Nj6SEFjhGw",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "saramonipos.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "saramonipos",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "saramonipos.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "24641902422",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:24641902422:web:69603f67af03871a9b68f7",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-0DP5L9M7H2",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// ব্রাউজার সাপোর্ট করলে Analytics চালু হবে (SSR বা সাপোর্ট না থাকলে এরর দেবে না)
export const analyticsPromise = isSupported().then((supported) =>
  supported ? getAnalytics(app) : null
);
