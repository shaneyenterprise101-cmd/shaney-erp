// src/services/firebaseService.js
// Firebase initialization and granular read/write helpers to bypass 1MB limit

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, getDocs, deleteDoc, query, limit } from 'firebase/firestore';

// Apna Firebase config yahan dalein (jo aapke project mein use ho raha hai)
const firebaseConfig = {
  // Config keys from your environment or firebase setup
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 1. GRANULAR WRITE: Save individual customer/lead instead of 5MB monolithic blob
export const saveDocumentToCollection = async (collectionName, docId, data) => {
  try {
    const docRef = doc(db, collectionName, String(docId));
    await setDoc(docRef, data, { merge: true });
    console.log(`✅ [Firebase Write] Success on ${collectionName}/${docId}`);
  } catch (error) {
    console.error(`❌ [Firebase Write Error]`, error);
  }
};

// 2. PAGINATED READ: Read only chunks of data (e.g., 20 items) to save reads & bandwidth
export const getPaginatedCollection = async (collectionName, pageSize = 20) => {
  try {
    const q = query(collection(db, collectionName), limit(pageSize));
    const querySnapshot = await getDocs(q);
    const results = [];
    querySnapshot.forEach((doc) => {
      results.push({ id: doc.id, ...doc.data() });
    });
    return results;
  } catch (error) {
    console.error(`❌ [Firebase Read Error]`, error);
    return [];
  }
};