// Firebase Messaging Service Worker v3.2 (Enhanced Focus Check)
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());

const params = new URLSearchParams(location.search);
const firebaseConfig = {
    apiKey: params.get('apiKey'),
    authDomain: params.get('authDomain'),
    projectId: params.get('projectId'),
    storageBucket: params.get('storageBucket'),
    messagingSenderId: params.get('messagingSenderId'),
    appId: params.get('appId')
};

if (firebaseConfig.apiKey) {
    firebase.initializeApp(firebaseConfig);
}

const messaging = firebase.messaging();
const notificationChannel = new BroadcastChannel('fcm_notifications');

messaging.onBackgroundMessage((payload) => {
    notificationChannel.postMessage(payload);

    return Promise.resolve();
});
