import { ref, set, get, update, onValue, onChildRemoved, push, query, orderByChild, equalTo, serverTimestamp, remove } from 'firebase/database';
import { httpsCallable } from 'firebase/functions';
import { rtdb, functions } from '../../firebase/config';
import { RtdbConversation, RtdbUserChat } from '../../../shared/types';
import { TIME_LIMITS } from '../../constants';
import { getRtdbServerTimestamp, getServerSyncedNow } from './chatTime';

export const rtdbConversationService = {
    /**
     * Khởi tạo hội thoại direct giữa 2 người dùng
     */
    initializeDirectConversation: async (user1Id: string, user2Id: string, creatorId: string): Promise<string> => {
        try {
            const otherUserId = creatorId === user1Id ? user2Id : user1Id;
            const startConv = httpsCallable<{ targetUserId: string }, { convId: string }>(functions, 'startDirectConversation');
            const result = await startConv({ targetUserId: otherUserId });
            return result.data.convId;
        } catch (error) {
            console.error('[rtdbConversationService] Lỗi initializeDirectConversation:', error);
            throw error;
        }
    },

    /**
     * Tạo hoặc lấy conversation 1-1 giữa 2 user
     */
    getOrCreateDirect: async (user1Id: string, user2Id: string): Promise<string> => {
        try {
            const startConv = httpsCallable<{ targetUserId: string }, { convId: string }>(functions, 'startDirectConversation');
            const result = await startConv({ targetUserId: user2Id });
            return result.data.convId;
        } catch (error) {
            console.error('[rtdbConversationService] Lỗi getOrCreateDirect:', error);
            throw error;
        }
    },

    /**
     * Lắng nghe danh sách hội thoại
     */
    subscribeToUserConversations: (
        userId: string,
        callback: (
            conversations: Array<{ id: string; data: RtdbConversation; userChat: RtdbUserChat }>,
            allUserChats: Record<string, RtdbUserChat>
        ) => void
    ) => {
        const userChatsRef = ref(rtdb, `user_chats/${userId}`);
        const conversationListeners = new Map<string, () => void>();
        const conversationsMap = new Map<string, { id: string; data: RtdbConversation; userChat: RtdbUserChat }>();
        const userChatCreatedAt = new Map<string, number>();
        let latestUserChats: Record<string, RtdbUserChat> = {};

        const updateCallback = () => {
            const conversations = Array.from(conversationsMap.values())
                .filter(c => {
                    const lastTs = c.userChat.lastMsgTimestamp || 0;
                    const clearedTs = c.userChat.clearedAt || 0;
                    return lastTs > clearedTs;
                });

            conversations.sort((a, b) => (b.userChat.lastMsgTimestamp || 0) - (a.userChat.lastMsgTimestamp || 0));
            callback(conversations, latestUserChats);
        };

        const subscribeToConversation = (convId: string) => {
            if (conversationListeners.has(convId)) {
                conversationListeners.get(convId)?.();
                conversationListeners.delete(convId);
                conversationsMap.delete(convId);
            }

            const convRef = ref(rtdb, `conversations/${convId}`);
            const unsubConv = onValue(convRef, (convSnap) => {
                if (convSnap.exists()) {
                    const data = convSnap.val() as RtdbConversation;
                    const userChat = latestUserChats[convId];
                    if (userChat) {
                        conversationsMap.set(convId, { id: convId, data, userChat });
                    }
                } else {
                    conversationsMap.delete(convId);
                }
                updateCallback();
            });
            conversationListeners.set(convId, unsubConv);
        };

        const mainUnsubscribe = onValue(userChatsRef, (snapshot) => {
            if (!snapshot.exists()) {
                latestUserChats = {};
                userChatCreatedAt.clear();
                conversationsMap.clear();
                conversationListeners.forEach(unsub => unsub());
                conversationListeners.clear();
                callback([], latestUserChats);
                return;
            }

            latestUserChats = snapshot.val() as Record<string, RtdbUserChat>;
            const currentConvIds = new Set(Object.keys(latestUserChats));

            for (const convId of conversationListeners.keys()) {
                if (!currentConvIds.has(convId)) {
                    conversationListeners.get(convId)?.();
                    conversationListeners.delete(convId);
                    conversationsMap.delete(convId);
                    userChatCreatedAt.delete(convId);
                }
            }

            for (const convId of currentConvIds) {
                const userChat = latestUserChats[convId];
                const prevCreatedAt = userChatCreatedAt.get(convId);
                const currCreatedAt = userChat.createdAt || 0;

                if (!conversationListeners.has(convId)) {
                    // New conversation entry - subscribe fresh
                    userChatCreatedAt.set(convId, currCreatedAt);
                    subscribeToConversation(convId);
                } else if (prevCreatedAt !== undefined && prevCreatedAt !== currCreatedAt) {
                    userChatCreatedAt.set(convId, currCreatedAt);
                    subscribeToConversation(convId);
                } else {
                    const existing = conversationsMap.get(convId);
                    if (existing && existing.userChat.updatedAt !== userChat.updatedAt) {
                        conversationsMap.set(convId, { ...existing, userChat });
                        updateCallback();
                    }
                }
            }
        });

        const removedUnsubscribe = onChildRemoved(userChatsRef, (snapshot) => {
            const convId = snapshot.key;
            if (!convId) return;
            conversationListeners.get(convId)?.();
            conversationListeners.delete(convId);
            conversationsMap.delete(convId);
            userChatCreatedAt.delete(convId);
            delete latestUserChats[convId];
            updateCallback();
        });

        return () => {
            mainUnsubscribe();
            removedUnsubscribe();
            conversationListeners.forEach(unsub => unsub());
        };
    },

    /**
     * Cập nhật thông tin hội thoại
     */
    updateConversationMeta: async (convId: string, updates: Partial<Pick<RtdbConversation, 'name' | 'avatar'>>): Promise<void> => {
        try {
            const convRef = ref(rtdb, `conversations/${convId}`);
            await update(convRef, {
                ...updates,
                updatedAt: getRtdbServerTimestamp()
            });
        } catch (error) {
            console.error('[rtdbConversationService] Lỗi updateConversationMeta:', error);
            throw error;
        }
    },

    /**
     * Ghim hội thoại
     */
    togglePin: async (uid: string, convId: string, isPinned: boolean): Promise<void> => {
        try {
            const userChatRef = ref(rtdb, `user_chats/${uid}/${convId}`);
            await update(userChatRef, {
                isPinned,
                updatedAt: getRtdbServerTimestamp()
            });
        } catch (error) {
            console.error('[rtdbConversationService] Lỗi togglePin:', error);
            throw error;
        }
    },

    /**
     * Tắt thông báo hội thoại
     */
    toggleMute: async (uid: string, convId: string, isMuted: boolean): Promise<void> => {
        try {
            const userChatRef = ref(rtdb, `user_chats/${uid}/${convId}`);
            await update(userChatRef, {
                isMuted,
                updatedAt: getRtdbServerTimestamp()
            });
        } catch (error) {
            console.error('[rtdbConversationService] Lỗi toggleMute:', error);
            throw error;
        }
    },

    /**
     * Lưu trữ hội thoại
     */
    toggleArchive: async (uid: string, convId: string, isArchived: boolean): Promise<void> => {
        try {
            const userChatRef = ref(rtdb, `user_chats/${uid}/${convId}`);
            await update(userChatRef, {
                isArchived,
                updatedAt: getRtdbServerTimestamp()
            });
        } catch (error) {
            console.error('[rtdbConversationService] Lỗi toggleArchive:', error);
            throw error;
        }
    },

    /**
     * Xóa cuộc hội thoại
     */
    deleteConversation: async (uid: string, convId: string): Promise<void> => {
        try {
            const isDisbandedSnap = await get(ref(rtdb, `conversations/${convId}/isDisbanded`));
            const isDisbanded = isDisbandedSnap.exists() && isDisbandedSnap.val() === true;
            
            const userChatRef = ref(rtdb, `user_chats/${uid}/${convId}`);
            
            if (isDisbanded) {
                await remove(userChatRef);
            } else {
                await update(userChatRef, {
                    clearedAt: getServerSyncedNow(),
                    unreadCount: 0,
                    updatedAt: getRtdbServerTimestamp()
                });
            }
        } catch (error) {
            console.error('[rtdbConversationService] Lỗi deleteConversation:', error);
            throw error;
        }
    },

    /**
     * Reset số tin nhắn chưa đọc
     */
    resetUnreadCount: async (uid: string, convId: string, lastReadMsgId?: string): Promise<void> => {
        try {
            const userChatRef = ref(rtdb, `user_chats/${uid}/${convId}`);
            const updates: Partial<RtdbUserChat> = {
                unreadCount: 0
            };

            if (lastReadMsgId) {
                updates.lastReadMsgId = lastReadMsgId;
            }

            updates.updatedAt = getServerSyncedNow();
            await update(userChatRef, updates);
        } catch (error) {
            console.error('[rtdbConversationService] Lỗi resetUnreadCount:', error);
            throw error;
        }
    },

    /**
     * Đánh dấu tất cả hội thoại đã đọc
     */
    markAllAsRead: async (uid: string): Promise<void> => {
        try {
            const userChatsRef = ref(rtdb, `user_chats/${uid}`);
            const snapshot = await get(userChatsRef);

            if (!snapshot.exists()) return;

            const userChats = snapshot.val() as Record<string, RtdbUserChat>;
            const updates: Record<string, any> = {};

            for (const convId of Object.keys(userChats)) {
                if (userChats[convId].unreadCount > 0) {
                    updates[`user_chats/${uid}/${convId}/unreadCount`] = 0;
                    updates[`user_chats/${uid}/${convId}/updatedAt`] = getRtdbServerTimestamp();
                }
            }

            if (Object.keys(updates).length > 0) {
                await update(ref(rtdb), updates);
            }
        } catch (error) {
            console.error('[rtdbConversationService] Lỗi markAllAsRead:', error);
            throw error;
        }
    },

    /**
     * Đánh dấu hội thoại chưa đọc
     */
    markAsUnread: async (uid: string, convId: string): Promise<void> => {
        try {
            const userChatRef = ref(rtdb, `user_chats/${uid}/${convId}`);
            await update(userChatRef, {
                unreadCount: 1,
                updatedAt: getRtdbServerTimestamp()
            });
        } catch (error) {
            console.error('[rtdbConversationService] Lỗi markAsUnread:', error);
            throw error;
        }
    },

    /**
     * Đặt trạng thái đang gõ
     */
    setTyping: async (convId: string, uid: string, isTyping: boolean): Promise<void> => {
        try {
            const typingRef = ref(rtdb, `conversations/${convId}/typing/${uid}`);
            if (isTyping) {
                await set(typingRef, serverTimestamp());
            } else {
                await remove(typingRef);
            }
        } catch (error) {
            if (!(error as any).message?.includes('PERMISSION_DENIED')) {
                console.error('[rtdbConversationService] Lỗi setTyping:', error);
            }
        }
    },

    /**
     * Lắng nghe trạng thái đang gõ
     */
    subscribeToTyping: (convId: string, callback: (typingUserIds: string[]) => void): (() => void) => {
        const typingRef = ref(rtdb, `conversations/${convId}/typing`);

        const unsubscribe = onValue(typingRef, (snapshot) => {
            if (snapshot.exists()) {
                const typingData = snapshot.val();
                const now = getServerSyncedNow();
                const activeTypingUsers = Object.entries(typingData)
                    .filter(([_, timestamp]) => (now - (timestamp as number)) < TIME_LIMITS.TYPING_TIMEOUT)
                    .map(([uid]) => uid);
                callback(activeTypingUsers);
            } else {
                callback([]);
            }
        });

        return unsubscribe;
    }
};
