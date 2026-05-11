import { FieldValue } from 'firebase-admin/firestore';
import { db, auth, rtdb } from '../app';
import { UserStatus, FriendRequestStatus } from '../types';
import { ServerValue } from 'firebase-admin/database';

/** Khóa tài khoản người dùng và thu hồi quyền truy cập */
export async function banUserById(userId: string): Promise<void> {
    await db.collection('users').doc(userId).update({
        status: UserStatus.BANNED,
        updatedAt: FieldValue.serverTimestamp(),
    });

    await auth.revokeRefreshTokens(userId);

    const fcmRef = db.collection('users').doc(userId).collection('private').doc('fcm');

    const [sentSnap, receivedSnap] = await Promise.all([
        db.collection('friendRequests').where('senderId', '==', userId).where('status', '==', FriendRequestStatus.PENDING).get(),
        db.collection('friendRequests').where('receiverId', '==', userId).where('status', '==', FriendRequestStatus.PENDING).get(),
    ]);

    const batch = db.batch();
    sentSnap.docs.forEach(d => batch.delete(d.ref));
    receivedSnap.docs.forEach(d => batch.delete(d.ref));
    batch.delete(fcmRef);

    await Promise.all([
        batch.commit(),
        rtdb.ref(`presence/${userId}`).update({
            isOnline: false,
            lastSeen: ServerValue.TIMESTAMP,
            updatedAt: ServerValue.TIMESTAMP,
        }),
    ]);
}
