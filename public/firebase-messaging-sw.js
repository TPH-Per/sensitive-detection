// Firebase Messaging Service Worker v3.2 (Enhanced Focus Check)
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());

firebase.initializeApp({
    apiKey: "AIzaSyCNmxniAL5vcKcVJN-PaywlD9uPRRj4DHo",
    authDomain: "smurf-social.firebaseapp.com",
    projectId: "smurf-social",
    storageBucket: "smurf-social.firebasestorage.app",
    messagingSenderId: "517846344524",
    appId: "1:517846344524:web:7ee2038e9ab9d24a41a5e9"
});

const messaging = firebase.messaging();
const notificationChannel = new BroadcastChannel('fcm_notifications');

messaging.onBackgroundMessage(async (payload) => {
    // Chỉ báo cho Frontend xử lý âm thanh hoặc UI, không hiện popup
    notificationChannel.postMessage(payload);
});
