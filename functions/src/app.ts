import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getDatabase } from 'firebase-admin/database';

const app = initializeApp();

// Use the 'per0' named database that the Flutter client writes to.
// All Cloud Functions must use this db instance to read/write
// from the same Firestore database that the mobile app uses.
export const db = getFirestore(app, 'per0');

// Realtime Database instance for chat features.
export const rtdb = getDatabase(app);
