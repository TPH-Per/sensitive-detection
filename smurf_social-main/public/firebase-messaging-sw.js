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

    if (payload.data && payload.data.title) {
        const notificationTitle = payload.data.title;
        const notificationOptions = {
            body: payload.data.body || 'Bạn có thông báo mới',
            icon: '/favicon.ico',
            data: payload.data
        };

        return self.registration.showNotification(notificationTitle, notificationOptions);
    }

    return Promise.resolve();
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            if (clientList.length > 0) {
                let client = clientList[0];
                for (let i = 0; i < clientList.length; i++) {
                    if (clientList[i].focused) {
                        client = clientList[i];
                    }
                }
                return client.focus();
            }
            return clients.openWindow('/');
        })
    );
});
