import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

// ✅ Firebase 콘솔에서 복사한 값으로 교체하세요
const firebaseConfig = {
  apiKey: "AIzaSyCOWQwpgcyf6y0XNKYTVg2AUjtJ4zPGB0I",
  authDomain: "baekan-app.firebaseapp.com",
  projectId: "baekan-app",
  storageBucket: "baekan-app.firebasestorage.app",
  messagingSenderId: "344361226284",
  appId: "1:344361226284:web:10943b762a99d424858189"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const storage = getStorage(app);
