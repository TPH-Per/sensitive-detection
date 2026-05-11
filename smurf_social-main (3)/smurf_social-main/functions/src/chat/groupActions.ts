import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { rtdb } from '../app';
import { RtdbConversation, MemberRole, MediaObject } from '../types';
import { getUserName, getUserProfile, sendSystemMessage, groupSystemMessages } from './groupHelper';
import { ServerValue } from 'firebase-admin/database';
import { randomBytes } from 'crypto';

const REGION = 'asia-southeast1';
const MAX_GROUP_MEMBERS = 100;

function generateInviteToken(): string {
    return randomBytes(18).toString('base64url');
}

function normalizeBaseUrl(baseUrl?: string): string {
    if (!baseUrl || typeof baseUrl !== 'string') return '';
    if (!/^https?:\/\//i.test(baseUrl)) return '';
    return baseUrl.replace(/\/+$/, '');
}

function buildInviteLink(token: string, baseUrl?: string): string {
    const path = `/join/${encodeURIComponent(token)}`;
    const normalizedBase = normalizeBaseUrl(baseUrl);
    return normalizedBase ? `${normalizedBase}${path}` : path;
}

/** Tạo nhóm chat mới */
export const createGroup = onCall({ region: REGION, cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Bạn cần đăng nhập.');
    const { name, memberIds, avatar } = request.data as { name: string; memberIds: string[]; avatar?: MediaObject };
    const creatorId = request.auth.uid;

    if (!name || !memberIds || memberIds.length === 0) {
        throw new HttpsError('invalid-argument', 'Dữ liệu không hợp lệ.');
    }

    try {
        const actorName = await getUserName(creatorId);
        const newConvRef = rtdb.ref('conversations').push();
        const convId = newConvRef.key!;

        const allMemberIds = [creatorId, ...memberIds.filter(id => id !== creatorId)];
        const members: Record<string, MemberRole> = { [creatorId]: 'admin' };
        memberIds.forEach(id => { if (id !== creatorId) members[id] = 'member'; });

        const now = Date.now();
        const inviteToken = generateInviteToken();
        const conversationData: any = {
            isGroup: true,
            name,
            avatar: avatar || null,
            creatorId,
            inviteLink: inviteToken,
            members,
            joinApprovalMode: false,
            createdAt: now,
            updatedAt: now,
            lastMessage: null
        };

        const updates: Record<string, any> = {
            [`conversations/${convId}`]: conversationData,
            [`invite_links/${inviteToken}`]: convId
        };

        allMemberIds.forEach(uid => {
            updates[`user_chats/${uid}/${convId}`] = {
                isPinned: false,
                isMuted: false,
                isArchived: false,
                unreadCount: 0,
                lastReadMsgId: null,
                lastMsgTimestamp: now,
                clearedAt: 0,
                createdAt: now,
                updatedAt: now
            };
        });

        await rtdb.ref().update(updates);
        await sendSystemMessage(convId, groupSystemMessages.CREATE_GROUP(actorName), allMemberIds, creatorId);

        return { convId };
    } catch (error) {
        console.error('[createGroup] Lỗi:', error);
        throw new HttpsError('internal', 'Không thể tạo nhóm.');
    }
});

/** Thêm thành viên trực tiếp vào nhóm */
export const addGroupMembers = onCall({ region: REGION, cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Bạn cần đăng nhập.');
    const { convId, memberIds } = request.data as { convId: string; memberIds: string[] };
    const actorId = request.auth.uid;

    try {
        const convSnap = await rtdb.ref(`conversations/${convId}`).get();
        if (!convSnap.exists()) throw new HttpsError('not-found', 'Nhóm không tồn tại.');

        const conversation = convSnap.val() as RtdbConversation;
        const currentMemberIds = Object.keys(conversation.members || {});
        const actorName = await getUserName(actorId);

        const updates: Record<string, any> = {};
        const now = Date.now();

        for (const uid of memberIds) {
            if (!currentMemberIds.includes(uid)) {
                const targetName = await getUserName(uid);
                updates[`conversations/${convId}/members/${uid}`] = 'member';
                updates[`user_chats/${uid}/${convId}`] = {
                    isPinned: false,
                    isMuted: false,
                    isArchived: false,
                    unreadCount: 0,
                    lastReadMsgId: null,
                    lastMsgTimestamp: now,
                    clearedAt: now,
                    createdAt: now,
                    updatedAt: now
                };
                await sendSystemMessage(convId, groupSystemMessages.ADD_MEMBERS(actorName, targetName), [...currentMemberIds, ...memberIds], actorId);
            }
        }

        updates[`conversations/${convId}/updatedAt`] = ServerValue.TIMESTAMP;
        await rtdb.ref().update(updates);

        return { success: true };
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        console.error('[addGroupMembers] Lỗi:', error);
        throw new HttpsError('internal', 'Không thể thêm thành viên.');
    }
});

/** Rời khỏi nhóm chat */
export const leaveGroup = onCall({ region: REGION, cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Bạn cần đăng nhập.');
    const { convId } = request.data as { convId: string };
    const uid = request.auth.uid;

    try {
        const convSnap = await rtdb.ref(`conversations/${convId}`).get();
        if (!convSnap.exists()) throw new HttpsError('not-found', 'Nhóm không tồn tại.');

        const conversation = convSnap.val() as RtdbConversation;
        const actorName = await getUserName(uid);
        const memberIds = Object.keys(conversation.members || {});

        const updates: Record<string, any> = {};

        if (memberIds.length <= 1) {
            updates[`conversations/${convId}`] = null;
            updates[`messages/${convId}`] = null;
            updates[`user_chats/${uid}/${convId}`] = null;
        } else {
            if (conversation.creatorId === uid) {
                const admins = memberIds.filter(id => id !== uid && conversation.members[id] === 'admin');
                const newCreatorId = admins.length > 0 ? admins[0] : memberIds.find(id => id !== uid)!;
                updates[`conversations/${convId}/creatorId`] = newCreatorId;
                updates[`conversations/${convId}/members/${newCreatorId}`] = 'admin';
            }
            updates[`conversations/${convId}/members/${uid}`] = null;
            updates[`user_chats/${uid}/${convId}`] = null;
            updates[`conversations/${convId}/updatedAt`] = ServerValue.TIMESTAMP;

            await sendSystemMessage(convId, groupSystemMessages.LEAVE_GROUP(actorName), memberIds.filter(id => id !== uid), uid);
        }

        await rtdb.ref().update(updates);
        return { success: true };
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        console.error('[leaveGroup] Lỗi:', error);
        throw new HttpsError('internal', 'Không thể rời nhóm.');
    }
});

/** Xóa thành viên khỏi nhóm */
export const removeGroupMember = onCall({ region: REGION, cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Bạn cần đăng nhập.');
    const { convId, targetUid } = request.data as { convId: string; targetUid: string };
    const actorId = request.auth.uid;

    try {
        const convSnap = await rtdb.ref(`conversations/${convId}`).get();
        if (!convSnap.exists()) throw new HttpsError('not-found', 'Nhóm không tồn tại.');

        const conversation = convSnap.val() as RtdbConversation;
        const actorRole = conversation.members[actorId];
        const targetRole = conversation.members[targetUid];
        const isCreator = conversation.creatorId === actorId;

        if (!isCreator && actorRole !== 'admin') {
            throw new HttpsError('permission-denied', 'Bạn không có quyền xóa thành viên.');
        }
        if (!isCreator && targetRole === 'admin') {
            throw new HttpsError('permission-denied', 'Chỉ Trưởng nhóm mới có quyền xóa Admin.');
        }

        const actorName = await getUserName(actorId);
        const targetName = await getUserName(targetUid);
        const memberIds = Object.keys(conversation.members || {});

        const updates: Record<string, any> = {};
        updates[`conversations/${convId}/members/${targetUid}`] = null;
        updates[`conversations/${convId}/updatedAt`] = ServerValue.TIMESTAMP;
        updates[`user_chats/${targetUid}/${convId}`] = null;

        await rtdb.ref().update(updates);
        await sendSystemMessage(convId, groupSystemMessages.REMOVE_MEMBER(actorName, targetName), memberIds.filter(id => id !== targetUid), actorId);

        return { success: true };
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        console.error('[removeGroupMember] Lỗi:', error);
        throw new HttpsError('internal', 'Không thể xóa thành viên.');
    }
});

/** Giải tán nhóm chat */
export const disbandGroup = onCall({ region: REGION, cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Bạn cần đăng nhập.');
    const { convId } = request.data as { convId: string };
    const actorId = request.auth.uid;

    try {
        const convSnap = await rtdb.ref(`conversations/${convId}`).get();
        if (!convSnap.exists()) throw new HttpsError('not-found', 'Nhóm không tồn tại.');

        const conversation = convSnap.val() as RtdbConversation;
        if (conversation.creatorId !== actorId) {
            throw new HttpsError('permission-denied', 'Chỉ Trưởng nhóm mới được giải tán nhóm.');
        }

        const memberIds = Object.keys(conversation.members || {});
        const updates: Record<string, any> = {};

        updates[`conversations/${convId}/isDisbanded`] = true;
        updates[`conversations/${convId}/updatedAt`] = ServerValue.TIMESTAMP;
        updates[`messages/${convId}`] = null;
        updates[`conversations/${convId}/lastMessage`] = {
            senderId: 'system',
            content: groupSystemMessages.DISBAND_GROUP(),
            type: 'system',
            timestamp: ServerValue.TIMESTAMP
        };

        memberIds.forEach(uid => {
            if (uid === actorId) {
                updates[`user_chats/${uid}/${convId}`] = null;
            } else {
                updates[`user_chats/${uid}/${convId}/lastMsgTimestamp`] = ServerValue.TIMESTAMP;
                updates[`user_chats/${uid}/${convId}/isArchived`] = false;
                updates[`user_chats/${uid}/${convId}/updatedAt`] = ServerValue.TIMESTAMP;
            }
        });

        await rtdb.ref().update(updates);
        return { success: true };
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        console.error('[disbandGroup] Lỗi:', error);
        throw new HttpsError('internal', 'Không thể giải tán nhóm.');
    }
});

/** Cập nhật tên và ảnh đại diện nhóm */
export const updateGroupInfo = onCall({ region: REGION, cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Bạn cần đăng nhập.');
    const { convId, name, avatar } = request.data as { convId: string; name?: string; avatar?: MediaObject };
    const actorId = request.auth.uid;

    try {
        const convSnap = await rtdb.ref(`conversations/${convId}`).get();
        if (!convSnap.exists()) throw new HttpsError('not-found', 'Nhóm không tồn tại.');

        const conversation = convSnap.val() as RtdbConversation;
        const actorName = await getUserName(actorId);
        const memberIds = Object.keys(conversation.members || {});

        const nameChanged = name && name !== conversation.name;
        const avatarChanged = !!avatar;

        const updateData: any = { updatedAt: ServerValue.TIMESTAMP };
        if (name) updateData.name = name;
        if (avatar) updateData.avatar = avatar;

        await rtdb.ref(`conversations/${convId}`).update(updateData);

        let content = '';
        if (nameChanged && avatarChanged) content = groupSystemMessages.UPDATE_GROUP_BOTH(actorName, name!);
        else if (nameChanged) content = groupSystemMessages.UPDATE_GROUP_NAME(actorName, name!);
        else if (avatarChanged) content = groupSystemMessages.UPDATE_GROUP_AVATAR(actorName);

        if (content) {
            await sendSystemMessage(convId, content, memberIds, actorId);
        }

        return { success: true };
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        console.error('[updateGroupInfo] Lỗi:', error);
        throw new HttpsError('internal', 'Không thể cập nhật thông tin nhóm.');
    }
});

/** Thay đổi quyền hạn thành viên */
export const updateMemberRole = onCall({ region: REGION, cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Bạn cần đăng nhập.');
    const { convId, targetUid, role } = request.data as { convId: string; targetUid: string; role: MemberRole };
    const actorId = request.auth.uid;

    try {
        const convSnap = await rtdb.ref(`conversations/${convId}`).get();
        if (!convSnap.exists()) throw new HttpsError('not-found', 'Nhóm không tồn tại.');

        const conversation = convSnap.val() as RtdbConversation;
        if (conversation.creatorId !== actorId) {
            throw new HttpsError('permission-denied', 'Chỉ Trưởng nhóm mới có quyền này.');
        }

        const actorName = await getUserName(actorId);
        const targetName = await getUserName(targetUid);
        const memberIds = Object.keys(conversation.members || {});

        await rtdb.ref(`conversations/${convId}/members/${targetUid}`).set(role);
        await rtdb.ref(`conversations/${convId}/updatedAt`).set(ServerValue.TIMESTAMP);

        let content = '';
        if (role === 'admin') content = groupSystemMessages.PROMOTE_TO_ADMIN(actorName, targetName);
        else content = groupSystemMessages.DEMOTE_FROM_ADMIN(actorName, targetName);

        await sendSystemMessage(convId, content, memberIds, actorId);
        return { success: true };
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        console.error('[updateMemberRole] Lỗi:', error);
        throw new HttpsError('internal', 'Không thể cập nhật vai trò.');
    }
});

/** Chuyển nhượng quyền trưởng nhóm */
export const transferCreator = onCall({ region: REGION, cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Bạn cần đăng nhập.');
    const { convId, newCreatorId } = request.data as { convId: string; newCreatorId: string };
    const actorId = request.auth.uid;

    try {
        const convSnap = await rtdb.ref(`conversations/${convId}`).get();
        if (!convSnap.exists()) throw new HttpsError('not-found', 'Nhóm không tồn tại.');

        const conversation = convSnap.val() as RtdbConversation;
        if (conversation.creatorId !== actorId) {
            throw new HttpsError('permission-denied', 'Chỉ Trưởng nhóm mới có quyền này.');
        }

        const actorName = await getUserName(actorId);
        const targetName = await getUserName(newCreatorId);
        const memberIds = Object.keys(conversation.members || {});

        const updates: Record<string, any> = {};
        updates[`conversations/${convId}/creatorId`] = newCreatorId;
        updates[`conversations/${convId}/members/${newCreatorId}`] = 'admin';
        updates[`conversations/${convId}/updatedAt`] = ServerValue.TIMESTAMP;

        await rtdb.ref().update(updates);
        await sendSystemMessage(convId, groupSystemMessages.TRANSFER_CREATOR(actorName, targetName), memberIds, actorId);

        return { success: true };
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        console.error('[transferCreator] Lỗi:', error);
        throw new HttpsError('internal', 'Không thể chuyển quyền.');
    }
});

/** Bật/tắt chế độ phê duyệt thành viên mới */
export const toggleApprovalMode = onCall({ region: REGION, cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Bạn cần đăng nhập.');
    const { convId, enabled } = request.data as { convId: string; enabled: boolean };
    const actorId = request.auth.uid;

    try {
        const convSnap = await rtdb.ref(`conversations/${convId}`).get();
        if (!convSnap.exists()) throw new HttpsError('not-found', 'Nhóm không tồn tại.');

        const conversation = convSnap.val() as RtdbConversation;
        const actorName = await getUserName(actorId);
        const memberIds = Object.keys(conversation.members || {});

        const updates: Record<string, any> = {};
        updates[`conversations/${convId}/joinApprovalMode`] = enabled;
        updates[`conversations/${convId}/updatedAt`] = ServerValue.TIMESTAMP;

        if (!enabled) {
            const pendingMembers = conversation.pendingMembers || {};
            const pendingUids = Object.keys(pendingMembers);
            const now = Date.now();
            
            pendingUids.forEach(uid => {
                updates[`conversations/${convId}/members/${uid}`] = 'member';
                updates[`conversations/${convId}/pendingMembers/${uid}`] = null;
                updates[`user_chats/${uid}/${convId}`] = {
                    isPinned: false, isMuted: false, isArchived: false, unreadCount: 0,
                    lastReadMsgId: null, lastMsgTimestamp: now, clearedAt: now, createdAt: now, updatedAt: now
                };
            });
        }

        await rtdb.ref().update(updates);
        const content = enabled ? groupSystemMessages.TOGGLE_APPROVAL_ON(actorName) : groupSystemMessages.TOGGLE_APPROVAL_OFF(actorName);
        await sendSystemMessage(convId, content, memberIds, actorId);

        return { success: true };
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        console.error('[toggleApprovalMode] Lỗi:', error);
        throw new HttpsError('internal', 'Không thể thay đổi chế độ duyệt.');
    }
});

/** Mời người dùng vào nhóm chat */
export const inviteMember = onCall({ region: REGION, cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Bạn cần đăng nhập.');
    const { convId, targetUid } = request.data as { convId: string; targetUid: string };
    const actorId = request.auth.uid;

    try {
        const convSnap = await rtdb.ref(`conversations/${convId}`).get();
        if (!convSnap.exists()) throw new HttpsError('not-found', 'Nhóm không tồn tại.');

        const conversation = convSnap.val() as RtdbConversation;
        const currentMemberIds = Object.keys(conversation.members || {});
        if (currentMemberIds.includes(targetUid)) return { result: 'direct' };

        const actorName = await getUserName(actorId);
        const targetName = await getUserName(targetUid);
        const isAdminOrCreator = conversation.members[actorId] === 'admin' || conversation.creatorId === actorId;
        const useApproval = conversation.joinApprovalMode && !isAdminOrCreator;

        if (useApproval) {
            const updates: Record<string, any> = {};
            updates[`conversations/${convId}/pendingMembers/${targetUid}`] = {
                addedBy: actorId,
                timestamp: Date.now()
            };
            updates[`conversations/${convId}/updatedAt`] = ServerValue.TIMESTAMP;
            await rtdb.ref().update(updates);
            await sendSystemMessage(convId, groupSystemMessages.INVITE_PENDING(actorName, targetName), currentMemberIds, actorId);
            return { result: 'pending' };
        } else {
            const updates: Record<string, any> = {};
            const now = Date.now();
            updates[`conversations/${convId}/members/${targetUid}`] = 'member';
            updates[`user_chats/${targetUid}/${convId}`] = {
                isPinned: false, isMuted: false, isArchived: false, unreadCount: 0,
                lastReadMsgId: null, lastMsgTimestamp: now, clearedAt: now, createdAt: now, updatedAt: now
            };
            updates[`conversations/${convId}/updatedAt`] = ServerValue.TIMESTAMP;
            await rtdb.ref().update(updates);
            await sendSystemMessage(convId, groupSystemMessages.ADD_MEMBERS(actorName, targetName), [...currentMemberIds, targetUid], actorId);
            return { result: 'direct' };
        }
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        console.error('[inviteMember] Lỗi:', error);
        throw new HttpsError('internal', 'Không thể mời thành viên.');
    }
});

/** Chấp nhận thành viên từ danh sách chờ */
export const approveMembers = onCall({ region: REGION, cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Bạn cần đăng nhập.');
    const { convId, targetUids } = request.data as { convId: string; targetUids: string[] };
    const actorId = request.auth.uid;

    try {
        const convSnap = await rtdb.ref(`conversations/${convId}`).get();
        if (!convSnap.exists()) throw new HttpsError('not-found', 'Nhóm không tồn tại.');

        const conversation = convSnap.val() as RtdbConversation;
        const actorName = await getUserName(actorId);
        const currentMemberIds = Object.keys(conversation.members || {});
        
        const updates: Record<string, any> = {};
        const now = Date.now();

        for (const uid of targetUids) {
            const targetName = await getUserName(uid);
            updates[`conversations/${convId}/members/${uid}`] = 'member';
            updates[`conversations/${convId}/pendingMembers/${uid}`] = null;
            updates[`user_chats/${uid}/${convId}`] = {
                isPinned: false, isMuted: false, isArchived: false, unreadCount: 0,
                lastReadMsgId: null, lastMsgTimestamp: now, clearedAt: now, createdAt: now, updatedAt: now
            };
            await sendSystemMessage(convId, groupSystemMessages.APPROVE_MEMBER(actorName, targetName), [...currentMemberIds, ...targetUids], actorId);
        }

        updates[`conversations/${convId}/updatedAt`] = ServerValue.TIMESTAMP;
        await rtdb.ref().update(updates);
        return { success: true };
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        console.error('[approveMembers] Lỗi:', error);
        throw new HttpsError('internal', 'Không thể duyệt thành viên.');
    }
});

/** Từ chối yêu cầu gia nhập nhóm */
export const rejectMembers = onCall({ region: REGION, cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Bạn cần đăng nhập.');
    const { convId, targetUids } = request.data as { convId: string; targetUids: string[] };
    const actorId = request.auth.uid;

    try {
        const convSnap = await rtdb.ref(`conversations/${convId}`).get();
        if (!convSnap.exists()) throw new HttpsError('not-found', 'Nhóm không tồn tại.');

        const conversation = convSnap.val() as RtdbConversation;
        const actorName = await getUserName(actorId);
        const currentMemberIds = Object.keys(conversation.members || {});
        
        const updates: Record<string, any> = {};

        for (const uid of targetUids) {
            const targetName = await getUserName(uid);
            updates[`conversations/${convId}/pendingMembers/${uid}`] = null;
            await sendSystemMessage(convId, groupSystemMessages.REJECT_MEMBER(actorName, targetName), currentMemberIds, actorId);
        }

        updates[`conversations/${convId}/updatedAt`] = ServerValue.TIMESTAMP;
        await rtdb.ref().update(updates);
        return { success: true };
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        console.error('[rejectMembers] Lỗi:', error);
        throw new HttpsError('internal', 'Không thể từ chối thành viên.');
    }
});

/** Lấy link mời tham gia nhóm */
export const getGroupInviteLink = onCall({ region: REGION, cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Bạn cần đăng nhập.');
    const { convId, baseUrl } = request.data as { convId: string; baseUrl?: string };
    const actorId = request.auth.uid;

    if (!convId) {
        throw new HttpsError('invalid-argument', 'Thiếu convId.');
    }

    try {
        const convRef = rtdb.ref(`conversations/${convId}`);
        const convSnap = await convRef.get();
        if (!convSnap.exists()) throw new HttpsError('not-found', 'Nhóm không tồn tại.');

        const conversation = convSnap.val() as RtdbConversation;
        const memberIds = Object.keys(conversation.members || {});
        if (!memberIds.includes(actorId)) {
            throw new HttpsError('permission-denied', 'Bạn không phải thành viên nhóm.');
        }

        let inviteLink = conversation.inviteLink || '';
        if (!conversation.inviteLink) {
            inviteLink = generateInviteToken();
            await convRef.update({
                inviteLink,
                updatedAt: ServerValue.TIMESTAMP
            });
            await rtdb.ref(`invite_links/${inviteLink}`).set(convId);
        }

        return { inviteLink: buildInviteLink(inviteLink, baseUrl) };
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        console.error('[getGroupInviteLink] Lỗi:', error);
        throw new HttpsError('internal', 'Không thể lấy link mời.');
    }
});

/** Đặt lại link mời nhóm */
export const regenerateGroupInviteLink = onCall({ region: REGION, cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Bạn cần đăng nhập.');
    const { convId, baseUrl } = request.data as { convId: string; baseUrl?: string };
    const actorId = request.auth.uid;

    if (!convId) {
        throw new HttpsError('invalid-argument', 'Thiếu convId.');
    }

    try {
        const convRef = rtdb.ref(`conversations/${convId}`);
        const convSnap = await convRef.get();
        if (!convSnap.exists()) throw new HttpsError('not-found', 'Nhóm không tồn tại.');

        const conversation = convSnap.val() as RtdbConversation;
        const memberIds = Object.keys(conversation.members || {});
        if (!memberIds.includes(actorId)) {
            throw new HttpsError('permission-denied', 'Bạn không phải thành viên nhóm.');
        }

        const oldInviteLink = conversation.inviteLink || null;
        const inviteLink = generateInviteToken();
        const updates: Record<string, any> = {
            [`conversations/${convId}/inviteLink`]: inviteLink,
            [`conversations/${convId}/updatedAt`]: ServerValue.TIMESTAMP,
            [`invite_links/${inviteLink}`]: convId,
        };
        if (oldInviteLink) {
            updates[`invite_links/${oldInviteLink}`] = null;
        }
        await rtdb.ref().update(updates);

        return { inviteLink: buildInviteLink(inviteLink, baseUrl) };
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        console.error('[regenerateGroupInviteLink] Lỗi:', error);
        throw new HttpsError('internal', 'Không thể đặt lại link mời.');
    }
});

/** Tham gia nhóm qua link */
export const joinGroupByLink = onCall({ region: REGION, cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Bạn cần đăng nhập.');
    const { token } = request.data as { token: string };
    const actorId = request.auth.uid;

    if (!token || typeof token !== 'string') {
        throw new HttpsError('invalid-argument', 'Dữ liệu không hợp lệ.');
    }

    try {
        const linkSnap = await rtdb.ref(`invite_links/${token}`).get();
        if (!linkSnap.exists()) return { status: 'invalid' as const };
        const convId = String(linkSnap.val() || '');
        if (!convId) return { status: 'invalid' as const };

        const convRef = rtdb.ref(`conversations/${convId}`);
        const convSnap = await convRef.get();
        if (!convSnap.exists()) return { status: 'invalid' as const };

        const conversation = convSnap.val() as RtdbConversation;
        const memberIds = Object.keys(conversation.members || {});
        const pendingMembers = conversation.pendingMembers || {};

        if (conversation.isDisbanded) return { status: 'disbanded' as const, convId };
        if (memberIds.includes(actorId)) return { status: 'already_member' as const, convId };
        if (memberIds.length >= MAX_GROUP_MEMBERS) return { status: 'full' as const, convId };
        if (!conversation.inviteLink) return { status: 'invalid' as const };
        if (token !== conversation.inviteLink) return { status: 'invalid' as const };

        const actorName = await getUserName(actorId);
        const updates: Record<string, any> = {};
        const now = Date.now();

        if (conversation.joinApprovalMode) {
            if (!pendingMembers[actorId]) {
                updates[`conversations/${convId}/pendingMembers/${actorId}`] = {
                    addedBy: actorId,
                    timestamp: now
                };
                updates[`conversations/${convId}/updatedAt`] = ServerValue.TIMESTAMP;
                await rtdb.ref().update(updates);
                await sendSystemMessage(convId, groupSystemMessages.REQUEST_JOIN_BY_LINK(actorName), memberIds, actorId);
            }
            return { status: 'pending' as const, convId };
        }

        updates[`conversations/${convId}/members/${actorId}`] = 'member';
        updates[`user_chats/${actorId}/${convId}`] = {
            isPinned: false,
            isMuted: false,
            isArchived: false,
            unreadCount: 0,
            lastReadMsgId: null,
            lastMsgTimestamp: now,
            clearedAt: now,
            createdAt: now,
            updatedAt: now
        };
        updates[`conversations/${convId}/updatedAt`] = ServerValue.TIMESTAMP;

        await rtdb.ref().update(updates);
        await sendSystemMessage(convId, groupSystemMessages.JOIN_BY_LINK(actorName), [...memberIds, actorId], actorId);
        return { status: 'joined' as const, convId };
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        console.error('[joinGroupByLink] Lỗi:', error);
        throw new HttpsError('internal', 'Không thể tham gia nhóm.');
    }
});

/** Lấy thông tin nhóm từ link mời */
export const getGroupInviteInfo = onCall({ region: REGION, cors: true }, async (request) => {
    const { token } = request.data as { token: string };
    const actorId = request.auth?.uid;

    if (!token || typeof token !== 'string') {
        throw new HttpsError('invalid-argument', 'Dữ liệu không hợp lệ.');
    }

    try {
        const linkSnap = await rtdb.ref(`invite_links/${token}`).get();
        if (!linkSnap.exists()) return { status: 'invalid' as const };
        const convId = String(linkSnap.val() || '');

        const convSnap = await rtdb.ref(`conversations/${convId}`).get();
        if (!convSnap.exists()) return { status: 'invalid' as const };

        const conversation = convSnap.val() as RtdbConversation;
        const memberIds = Object.keys(conversation.members || {});
        const pendingMembers = conversation.pendingMembers || {};

        if (conversation.isDisbanded) return { status: 'disbanded' as const };
        if (token !== conversation.inviteLink) return { status: 'invalid' as const };

        const sampleMemberIds = memberIds.slice(0, 4);
        const membersInfo = await Promise.all(sampleMemberIds.map(uid => getUserProfile(uid)));

        return {
            status: 'success' as const,
            convId,
            name: conversation.name,
            avatar: conversation.avatar || null,
            memberCount: memberIds.length,
            members: membersInfo,
            isMember: actorId ? memberIds.includes(actorId) : false,
            isPending: actorId ? !!pendingMembers[actorId] : false,
            joinApprovalMode: !!conversation.joinApprovalMode
        };
    } catch (error) {
        console.error('[getGroupInviteInfo] Lỗi:', error);
        throw new HttpsError('internal', 'Không thể lấy thông tin nhóm.');
    }
});

