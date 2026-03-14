import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
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
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

export const rtdb = getDatabase(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, 'us-central1');

export default app;
