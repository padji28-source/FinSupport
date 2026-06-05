import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId); // CRITICAL
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const isIframe = () => {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true; // if cross-origin access blocks, it's an iframe
  }
};

export const signInWithGoogle = async () => {
  try {
    if (isIframe()) {
      await signInWithPopup(auth, googleProvider);
    } else {
      await signInWithRedirect(auth, googleProvider);
    }
  } catch (error: any) {
    if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
      console.log("Sign-in popup closed by user.");
      return;
    }
    console.error("Error signing in with Google", error);
    if (error.code === 'auth/unauthorized-domain') {
      alert("Error: Domain Vercel Anda belum ditambahkan ke daftar 'Authorized domains' di Firebase Console. Silakan buka Firebase Console -> Authentication -> Settings -> Authorized domains, lalu tambahkan domain Vercel Anda.");
    } else {
      alert(`Gagal login: ${error.message}`);
    }
  }
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out", error);
  }
};
