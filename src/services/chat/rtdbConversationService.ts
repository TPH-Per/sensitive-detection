import { ref, set, get, update, onValue, push, query, orderByChild, equalTo, serverTimestamp, remove } from 'firebase/database';
import { rtdb } from '../../firebase/config';
import { RtdbConversation, RtdbUserChat } from '../../types';

export const rtdbConversationService = {
    /**
     * Tạo hoặc lấy conversation 1-1 giữa 2 user
     */
    getOrCreateDirect: async (user1Id: string, user2Id: string): Promise<string> => {
        try {
            // Tạo ID nhất quán cho hội thoại 1-1
            const sortedIds = [user1Id, user2Id].sort();
            const convId = `direct_${sortedIds[0]}_${sortedIds[1]}`;

            const convRef = ref(rtdb, `conversations/${convId}`);
            const convSnap = await get(convRef);

            const updates: Record<string, any> = {};

            if (convSnap.exists()) {
                // Khôi phục phòng chat.
                updates[`user_chats/${user1Id}/${convId}/isArchived`] = false;
                updates[`user_chats/${user2Id}/${convId}/isArchived`] = false;

                if (Object.keys(updates).length > 0) {
                    try {
                        await update(ref(rtdb), updates);
                    } catch (e) {
                        console.error('Không thể cập nhật trạng thái user_chat:', e);
                    }
                }

                return convId;
            }

            // Tạo hội thoại mới
            const conversationData: RtdbConversation = {
                isGroup: false,
                name: null,
                avatar: null,
                creatorId: user1Id,
                members: {
                    [user1Id]: 'member',
                    [user2Id]: 'member'
                },
                typing: {},
                lastMessage: null,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            updates[`conversations/${convId}`] = conversationData;
            updates[`user_chats/${user1Id}/${convId}`] = {
                isPinned: false,
                isMuted: false,
                isArchived: false,
                unreadCount: 0,
                lastReadMsgId: null,
                lastMsgTimestamp: Date.now(),
                clearedAt: 0
            };
            updates[`user_chats/${user2Id}/${convId}`] = {
                isPinned: false,
                isMuted: false,
                isArchived: false,
                unreadCount: 0,
                lastReadMsgId: null,
                lastMsgTimestamp: Date.now(),
                clearedAt: 0
            };

            await update(ref(rtdb), updates);

            return convId;
        } catch (error) {
            console.error('[rtdbConversationService] Lỗi getOrCreateDirect:', error);
            throw error;
        }
    },

    /**
     * Subscribe to user's conversations
     */
    subscribeToUserConversations: (
        userId: string,
        callback: (conversations: Array<{ id: string; data: RtdbConversation; userChat: RtdbUserChat }>) => void
    ) => {
        const userChatsRef = ref(rtdb, `user_chats/${userId}`);
        const conversationListeners: Array<() => void> = [];

        const mainUnsubscribe = onValue(userChatsRef, async (snapshot) => {
            // Unsubscribe from old conversation listeners
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

            // Store conversations data
            const conversationsMap = new Map<string, { id: string; data: RtdbConversation; userChat: RtdbUserChat }>();

            // Function to update callback with sorted and filtered conversations
            const updateCallback = () => {
                const conversations = Array.from(conversationsMap.values())
                    .filter(c => {
                        // Chỉ hiển thị hội thoại nếu có tin nhắn mới hơn thời điểm xóa (clearedAt)
                        // Hoặc hội thoại mới tinh chưa có tin nhắn nào (lastMsgTimestamp >= clearedAt)
                        const lastTs = c.userChat.lastMsgTimestamp || 0;
                        const clearedTs = c.userChat.clearedAt || 0;
                        return lastTs > clearedTs;
                    });

                conversations.sort((a, b) => (b.userChat.lastMsgTimestamp || 0) - (a.userChat.lastMsgTimestamp || 0));
                callback(conversations);
            };

            // Subscribe to each conversation
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

        // Return combined unsubscribe function
        return () => {
            mainUnsubscribe();
            conversationListeners.forEach(unsub => unsub());
        };
    },

    /**
     * Update conversation metadata (name, avatar)
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
     * Toggle pin conversation
     */
    togglePin: async (uid: string, convId: string, isPinned: boolean): Promise<void> => {
        try {
            const userChatRef = ref(rtdb, `user_chats/${uid}/${convId}`);
            await update(userChatRef, { isPinned });
        } catch (error) {
            console.error('[rtdbConversationService] Lỗi togglePin:', error);
            throw error;
        }
    },

    /**
     * Toggle mute conversation
     */
    toggleMute: async (uid: string, convId: string, isMuted: boolean): Promise<void> => {
        try {
            const userChatRef = ref(rtdb, `user_chats/${uid}/${convId}`);
            await update(userChatRef, { isMuted });
        } catch (error) {
            console.error('[rtdbConversationService] Lỗi toggleMute:', error);
            throw error;
        }
    },

    /**
     * Toggle archive conversation
     */
    toggleArchive: async (uid: string, convId: string, isArchived: boolean): Promise<void> => {
        try {
            const userChatRef = ref(rtdb, `user_chats/${uid}/${convId}`);
            await update(userChatRef, { isArchived });
        } catch (error) {
            console.error('[rtdbConversationService] Lỗi toggleArchive:', error);
            throw error;
        }
    },

    /**
     * Xóa cuộc hội thoại (Ẩn lịch sử trò chuyện phía người dùng)
     */
    deleteConversation: async (uid: string, convId: string): Promise<void> => {
        try {
            const userChatRef = ref(rtdb, `user_chats/${uid}/${convId}`);
            await update(userChatRef, {
                clearedAt: Date.now(),
                unreadCount: 0
            });
        } catch (error) {
            console.error('[rtdbConversationService] Lỗi deleteConversation:', error);
            throw error;
        }
    },

    /**
     * Reset unread count
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

            await update(userChatRef, updates);
        } catch (error) {
            console.error('[rtdbConversationService] Lỗi resetUnreadCount:', error);
            throw error;
        }
    },

    /**
     * Mark all conversations as read
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
                    updates[`user_chats/${uid}/${convId}/unreadCount`] = 0;
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
     * Mark conversation as unread (set unreadCount to 1)
     */
    markAsUnread: async (uid: string, convId: string): Promise<void> => {
        try {
            const userChatRef = ref(rtdb, `user_chats/${uid}/${convId}`);
            await update(userChatRef, {
                unreadCount: 1
            });
        } catch (error) {
            console.error('[rtdbConversationService] Lỗi markAsUnread:', error);
            throw error;
        }
    },

    /**
     * Set typing indicator for user in conversation
     */
    setTyping: async (convId: string, uid: string, isTyping: boolean): Promise<void> => {
        try {
            const typingRef = ref(rtdb, `conversations/${convId}/typing/${uid}`);
            if (isTyping) {
                await set(typingRef, Date.now());
            } else {
                await remove(typingRef);
            }
        } catch (error) {
            console.error('[rtdbConversationService] Lỗi setTyping:', error);
        }
    },

    /**
     * Subscribe to typing indicators in conversation
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
