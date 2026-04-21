import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAicy4ym0omYMS5te0BXsR15d7jTrcydak",
  authDomain: "velaro-c487e.firebaseapp.com",
  projectId: "velaro-c487e",
  storageBucket: "velaro-c487e.firebasestorage.app",
  messagingSenderId: "394100524704",
  appId: "1:394100524704:web:a44d395c404d6f6eb2abc5"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
