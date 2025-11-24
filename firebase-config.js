// Configuration Firebase
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, updateProfile, sendEmailVerification, deleteUser } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore, doc, setDoc, getDoc, updateDoc, serverTimestamp, deleteDoc, collection, query, orderBy, limit, getDocs, addDoc, onSnapshot, where } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyDg2OHBoMXTCF5eMSFwMlJBXWRiMAYUhKs",
  authDomain: "pixel-collector-online.firebaseapp.com",
  projectId: "pixel-collector-online",
  storageBucket: "pixel-collector-online.firebasestorage.app",
  messagingSenderId: "930112532984",
  appId: "1:930112532984:web:433c099242afe91757a60d"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, updateProfile, sendEmailVerification, deleteUser, doc, setDoc, getDoc, updateDoc, serverTimestamp, deleteDoc, collection, query, orderBy, limit, getDocs, addDoc, onSnapshot, where };
