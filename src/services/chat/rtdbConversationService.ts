import { ref, set, get, update, onValue, push, query, orderByChild, equalTo, serverTimestamp, remove } from 'firebase/database';
import { rtdb } from '../../firebase/config';
import { RtdbConversation, RtdbUserChat } from '../../../shared/types';

export const rtdbConversationService = {
    /**
     * Khởi tạo hội thoại direct giữa 2 người dùng
     */
    initializeDirectConversation: async (user1Id: string, user2Id: string, creatorId: string): Promise<string> => {
        try {
            const sortedIds = [user1Id, user2Id].sort();
            const convId = `direct_${sortedIds[0]}_${sortedIds[1]}`;
            const now = Date.now();

            const convRef = ref(rtdb, `conversations/${convId}`);
            const convSnap = await get(convRef);

            const updates: Record<string, any> = {};

            if (!convSnap.exists()) {
                updates[`conversations/${convId}`] = {
                    isGroup: false,
                    name: null,
                    avatar: null,
                    creatorId,
                    members: { [user1Id]: 'admin', [user2Id]: 'member' },
                    typing: {},
                    lastMessage: null,
                    createdAt: now,
                    updatedAt: now
                } as RtdbConversation;

                [user1Id, user2Id].forEach(uid => {
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
                    } as RtdbUserChat;
                });
            } else {
                updates[`user_chats/${user1Id}/${convId}/isArchived`] = false;
                updates[`user_chats/${user2Id}/${convId}/isArchived`] = false;
                updates[`user_chats/${user1Id}/${convId}/updatedAt`] = now;
                updates[`user_chats/${user2Id}/${convId}/updatedAt`] = now;
            }

            if (Object.keys(updates).length > 0) {
                await update(ref(rtdb), updates);
            }

            return convId;
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
            const sortedIds = [user1Id, user2Id].sort();
            const convId = `direct_${sortedIds[0]}_${sortedIds[1]}`;

            const convRef = ref(rtdb, `conversations/${convId}`);
            const convSnap = await get(convRef);

            if (convSnap.exists()) {
                const updates: Record<string, any> = {};
                updates[`user_chats/${user1Id}/${convId}/isArchived`] = false;
                updates[`user_chats/${user2Id}/${convId}/isArchived`] = false;
                updates[`user_chats/${user1Id}/${convId}/clearedAt`] = 0;
                updates[`user_chats/${user2Id}/${convId}/clearedAt`] = 0;
                updates[`user_chats/${user1Id}/${convId}/updatedAt`] = Date.now();
                updates[`user_chats/${user2Id}/${convId}/updatedAt`] = Date.now();
                await update(ref(rtdb), updates);
            }

            return convId;
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
        callback: (conversations: Array<{ id: string; data: RtdbConversation; userChat: RtdbUserChat }>) => void
    ) => {
        const userChatsRef = ref(rtdb, `user_chats/${userId}`);
        const conversationListeners: Array<() => void> = [];

        const mainUnsubscribe = onValue(userChatsRef, async (snapshot) => {
            conversationListeners.forEach(unsub => unsub());
            conversationListeners.length = 0;

            if (!snapshot.exists()) {
                callback([]);
                return;
            }

            const userChats = snapshot.val() as Record<string, RtdbUserChat>;
            const convIds = Object.keys(userChats);

            if (convIds.length === 0) {
                callback([]);
                return;
            }

            const conversationsMap = new Map<string, { id: string; data: RtdbConversation; userChat: RtdbUserChat }>();

            const updateCallback = () => {
                const conversations = Array.from(conversationsMap.values())
                    .filter(c => {
                        const lastTs = c.userChat.lastMsgTimestamp || 0;
                        const clearedTs = c.userChat.clearedAt || 0;
                        return lastTs > clearedTs;
                    });

                conversations.sort((a, b) => (b.userChat.lastMsgTimestamp || 0) - (a.userChat.lastMsgTimestamp || 0));
                callback(conversations);
            };

            for (const convId of convIds) {
                const convRef = ref(rtdb, `conversations/${convId}`);

                const unsubConv = onValue(convRef, (convSnap) => {
                    if (convSnap.exists()) {
                        const data = convSnap.val() as RtdbConversation;
                        const userChat = userChats[convId];
                        
                        conversationsMap.set(convId, {
                            id: convId,
                            data,
                            userChat
                        });
                        updateCallback();
                    } else {
                        conversationsMap.delete(convId);
                        updateCallback();
                    }
                }, (error) => {
                    console.error(`[rtdbConversationService] Lỗi subscribe conversation ${convId}:`, error);
                });

                conversationListeners.push(unsubConv);
            }
        }, (error) => {
            console.error('[rtdbConversationService] Lỗi subscribe user_chats:', error);
        });

        return () => {
            mainUnsubscribe();
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
                updatedAt: Date.now()
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
                updatedAt: Date.now()
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
                updatedAt: Date.now()
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
                updatedAt: Date.now()
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
            const userChatRef = ref(rtdb, `user_chats/${uid}/${convId}`);
            await update(userChatRef, {
                clearedAt: Date.now(),
                unreadCount: 0,
                updatedAt: Date.now()
            });
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

            updates.updatedAt = Date.now();
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
            const updates: Record<string, number> = {};

            for (const convId of Object.keys(userChats)) {
                if (userChats[convId].unreadCount > 0) {
                    const now = Date.now();
                    updates[`user_chats/${uid}/${convId}/unreadCount`] = 0;
                    updates[`user_chats/${uid}/${convId}/updatedAt`] = now;
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
                updatedAt: Date.now()
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
                const now = Date.now();
                const activeTypingUsers = Object.entries(typingData)
                    .filter(([_, timestamp]) => (now - (timestamp as number)) < 5000)
                    .map(([uid]) => uid);
                callback(activeTypingUsers);
            } else {
                callback([]);
            }
        });

        return unsubscribe;
    }
};
