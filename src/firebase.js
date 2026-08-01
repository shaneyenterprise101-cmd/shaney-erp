import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
    apiKey: "AIzaSyB-LEiq42iqqeDagyglRIRBosl2aqo1YtM",
    authDomain: "shaney-enterprise-certificate.firebaseapp.com",
    projectId: "shaney-enterprise-certificate",
    storageBucket: "shaney-enterprise-certificate.firebasestorage.app",
    messagingSenderId: "69155520426",
    appId: "1:69155520426:web:7f73dd36b628d9293fb5d3"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);