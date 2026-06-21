// Firebase configuration for SJVPS Record Book
import { initializeApp } from 'firebase/app';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyBLYtTJtHGfIaIkdi5Qw41wm6sD-tEpGZQ",
  authDomain: "sjvps-5a7f0.firebaseapp.com",
  projectId: "sjvps-5a7f0",
  storageBucket: "sjvps-5a7f0.firebasestorage.app",
  messagingSenderId: "195226208341",
  appId: "1:195226208341:web:d8c0e179e136b4369e2cdc",
  measurementId: "G-6NQGNFC8PQ"
};

const app = initializeApp(firebaseConfig);

// Initialize Firestore with multi-tab offline persistence for robust data retention
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

export const storage = getStorage(app);
export default app;
