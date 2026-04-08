import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  memoryLocalCache,
} from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { connectAuthEmulator } from "firebase/auth";
import { connectFirestoreEmulator } from "firebase/firestore";
import { connectDatabaseEmulator } from "firebase/database";
import { getValidatedEnvConfig } from "../utils/validateEnv";

const envConfig = getValidatedEnvConfig();

const firebaseConfig = {
  apiKey: envConfig.firebase.apiKey,
  authDomain: envConfig.firebase.authDomain,
  projectId: envConfig.firebase.projectId,
  storageBucket: envConfig.firebase.storageBucket,
  messagingSenderId: envConfig.firebase.messagingSenderId,
  appId: envConfig.firebase.appId,
  measurementId: envConfig.firebase.measurementId,
  databaseURL: envConfig.firebase.databaseURL,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
});

export const rtdb = getDatabase(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, 'us-central1');

// Kết nối Emulator nếu chạy ở localhost hoặc IP nội bộ
const hostname = window.location.hostname;
const isLocal = hostname === 'localhost' || 
                hostname === '127.0.0.1' || 
                hostname.startsWith('192.168.') || 
                hostname.startsWith('10.') || 
                hostname.startsWith('172.');

if (isLocal) {
  console.log(`--- Đang kết nối với Firebase Emulator tại ${hostname} ---`);
  connectAuthEmulator(auth, `http://${hostname}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, hostname, 8080);
  connectDatabaseEmulator(rtdb, hostname, 9000);
  connectStorageEmulator(storage, hostname, 9199);
  connectFunctionsEmulator(functions, hostname, 5001);
}

export default app;
