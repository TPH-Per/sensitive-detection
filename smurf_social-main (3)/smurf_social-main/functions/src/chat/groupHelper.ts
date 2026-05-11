import { rtdb, db } from '../app';
import { ServerValue } from 'firebase-admin/database';
import { MediaObject } from '../types';

/** Lấy tên hiển thị từ Firestore */
export async function getUserName(uid: string): Promise<string> {
    try {
        const userDoc = await db.collection('users').doc(uid).get();
        return userDoc.exists ? (userDoc.data()?.fullName || 'Người dùng') : 'Người dùng';
    } catch (error) {
        console.error(`[groupHelper] Lỗi lấy tên người dùng ${uid}:`, error);
        return 'Người dùng';
    }
}

/** Lấy thông tin cơ bản người dùng từ Firestore */
export async function getUserProfile(uid: string): Promise<{ id: string; fullName: string; avatar: MediaObject | null }> {
    try {
        const userDoc = await db.collection('users').doc(uid).get();
        if (userDoc.exists) {
            const data = userDoc.data();
            return {
                id: uid,
                fullName: data?.fullName || 'Người dùng',
                avatar: data?.avatar || null
            };
        }
        return { id: uid, fullName: 'Người dùng', avatar: null };
    } catch (error) {
        console.error(`[groupHelper] Lỗi lấy profile người dùng ${uid}:`, error);
        return { id: uid, fullName: 'Người dùng', avatar: null };
    }
}

/** Gửi tin nhắn hệ thống và cập nhật trạng thái hội thoại */
export async function sendSystemMessage(
    convId: string,
    content: string,
    memberIds: string[],
    actorId?: string
): Promise<void> {
    const messagesRef = rtdb.ref(`messages/${convId}`);
    const newMsgRef = messagesRef.push();
    const messageId = newMsgRef.key;

    const updates: Record<string, any> = {};

    updates[`messages/${convId}/${messageId}`] = {
        senderId: 'system',
        type: 'system',
        content,
        createdAt: ServerValue.TIMESTAMP,
        updatedAt: ServerValue.TIMESTAMP,
    };

    updates[`conversations/${convId}/lastMessage`] = {
        senderId: 'system',
        content,
        type: 'system',
        timestamp: ServerValue.TIMESTAMP,
        messageId,
    };
    updates[`conversations/${convId}/updatedAt`] = ServerValue.TIMESTAMP;

    memberIds.forEach(uid => {
        updates[`user_chats/${uid}/${convId}/lastMsgTimestamp`] = ServerValue.TIMESTAMP;
        updates[`user_chats/${uid}/${convId}/updatedAt`] = ServerValue.TIMESTAMP;
        
        if (actorId && uid === actorId) {
            updates[`user_chats/${uid}/${convId}/lastReadMsgId`] = messageId;
            updates[`user_chats/${uid}/${convId}/unreadCount`] = 0;
        }
    });

    await rtdb.ref().update(updates);
}

export const groupSystemMessages = {
    CREATE_GROUP: (actor: string) => `${actor} đã tạo nhóm`,
    ADD_MEMBERS: (actor: string, target: string) => `${actor} đã thêm ${target} vào nhóm`,
    REMOVE_MEMBER: (actor: string, target: string) => `${actor} đã xóa ${target} khỏi nhóm`,
    LEAVE_GROUP: (actor: string) => `${actor} đã rời nhóm`,
    DISBAND_GROUP: () => `Nhóm đã giải tán`,
    CHANGE_ADMIN_ROLE: (actor: string, target: string) => `${actor} đã chuyển quyền quản trị cho ${target}`,
    PROMOTE_TO_ADMIN: (actor: string, target: string) => `${actor} đã thăng ${target} làm quản trị viên`,
    DEMOTE_FROM_ADMIN: (actor: string, target: string) => `${actor} đã hạ quyền quản trị viên của ${target}`,
    UPDATE_GROUP_NAME: (actor: string, name: string) => `${actor} đã đổi tên nhóm thành "${name}"`,
    UPDATE_GROUP_AVATAR: (actor: string) => `${actor} đã cập nhật ảnh nhóm`,
    UPDATE_GROUP_BOTH: (actor: string, name: string) => `${actor} đã cập nhật ảnh nhóm và đổi tên nhóm thành "${name}"`,
    INVITE_PENDING: (actor: string, target: string) => `${actor} đã mời ${target} vào nhóm (chờ duyệt)`,
    APPROVE_MEMBER: (actor: string, target: string) => `${actor} đã chấp nhận ${target} vào nhóm`,
    REJECT_MEMBER: (actor: string, target: string) => `${actor} đã từ chối ${target}`,
    TOGGLE_APPROVAL_ON: (actor: string) => `${actor} đã bật chế độ phê duyệt thành viên`,
    TOGGLE_APPROVAL_OFF: (actor: string) => `${actor} đã tắt chế độ phê duyệt. Tất cả thành viên chờ đã được chấp nhận`,
    TRANSFER_CREATOR: (actor: string, target: string) => `${actor} đã chuyển quyền trưởng nhóm cho ${target}`,
    JOIN_BY_LINK: (actor: string) => `${actor} đã tham gia nhóm qua link`,
    REQUEST_JOIN_BY_LINK: (actor: string) => `${actor} đã gửi yêu cầu tham gia nhóm qua link`,
};
