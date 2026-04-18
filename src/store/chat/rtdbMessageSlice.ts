import { StateCreator } from 'zustand';
import { RtdbMessage, SharedPostMessagePayload } from '../../../shared/types';
import { rtdbMessageService } from '../../services/chat/messages';
import { useAuthStore } from '../authStore';
import { useContactStore } from '../contactStore';
import { assertCanSendDirectMessage, assertCanSendDirectMessageServer } from '../../services/chat/strangerMessagePolicy';
import type { RtdbChatState } from '../rtdbChatStore';
import { PAGINATION } from '../../constants';

export interface RtdbMessageSlice {
    messages: Record<string, Array<{ id: string; data: RtdbMessage }>>;
    hasMoreMessages: Record<string, boolean>;
    isLoadingMore: Record<string, boolean>;
    uploadProgress: Record<string, { progress: number; error?: boolean; localUrl?: string }>;

    subscribeToMessages: (conversationId: string) => () => void;
    loadMoreMessages: (conversationId: string) => Promise<void>;
    sendTextMessage: (conversationId: string, senderId: string, content: string, mentions?: string[], replyToId?: string) => Promise<void>;
    sendSharedPostMessage: (conversationId: string, senderId: string, payload: SharedPostMessagePayload, replyToId?: string) => Promise<void>;
    sendImageMessage: (conversationId: string, senderId: string, files: File[], replyToId?: string) => Promise<void>;
    sendFileMessage: (conversationId: string, senderId: string, file: File, replyToId?: string) => Promise<void>;
    sendVideoMessage: (conversationId: string, senderId: string, file: File, replyToId?: string) => Promise<void>;
    sendVoiceMessage: (conversationId: string, senderId: string, file: File, replyToId?: string, duration?: number) => Promise<void>;
    sendGifMessage: (conversationId: string, senderId: string, gifUrl: string, replyToId?: string) => Promise<void>;
    sendCallMessage: (conversationId: string, senderId: string, payload: { callType: 'voice' | 'video'; status: 'ended' | 'missed' | 'rejected' | 'started'; duration?: number }) => Promise<string>;
    updateCallMessage: (conversationId: string, messageId: string, payload: { callType: 'voice' | 'video'; status: 'ended' | 'missed' | 'rejected' | 'started'; duration?: number }) => Promise<void>;
    markAsRead: (conversationId: string, userId: string) => Promise<void>;
    markAsDelivered: (conversationId: string, userId: string) => Promise<void>;
    recallMessage: (conversationId: string, messageId: string) => Promise<void>;
    deleteMessageForMe: (conversationId: string, messageId: string, userId: string) => Promise<void>;
    forwardMessage: (targetConversationId: string, senderId: string, srcMessage: RtdbMessage) => Promise<void>;
    editMessage: (conversationId: string, messageId: string, content: string) => Promise<void>;
    toggleReaction: (conversationId: string, messageId: string, userId: string, emoji: string) => Promise<void>;
    clearMessages: (conversationId: string) => void;
    setUploadProgress: (messageId: string, progress: number) => void;
    setUploadError: (messageId: string, isError: boolean) => void;
}

const LIMIT_PER_PAGE = PAGINATION.CHAT_MESSAGES;

const ensureMessagePolicy = async (
    get: () => RtdbChatState,
    conversationId: string,
    senderId: string,
): Promise<void> => {
    const state = get();
    const conversation = state.conversations.find((c) => c.id === conversationId)?.data;
    const friendIds = useContactStore.getState().friends.map((friend) => friend.id);
    const allowMessagesFromStrangers = useAuthStore.getState().settings.allowMessagesFromStrangers;

    assertCanSendDirectMessage({
        conversationId,
        senderId,
        conversation,
        friendIds,
        allowMessagesFromStrangers,
    });

    await assertCanSendDirectMessageServer({
        conversationId,
        senderId,
        conversation,
    });
};

export const createRtdbMessageSlice: StateCreator<RtdbChatState, [], [], RtdbMessageSlice> = (set, get) => ({
    messages: {},
    hasMoreMessages: {},
    isLoadingMore: {},
    uploadProgress: {},

    subscribeToMessages: (conversationId: string) => {
        set((state) => ({
            hasMoreMessages: {
                ...state.hasMoreMessages,
                [conversationId]: true
            }
        }));

        const userChat = get().userChats[conversationId];
        const clearedAt = userChat?.clearedAt || 0;

        const unsubscribe = rtdbMessageService.subscribeToMessages(conversationId, LIMIT_PER_PAGE, (newIncomingMessages) => {
            set((state) => {
                const currentMessages = state.messages[conversationId] || [];

                const incomingMessages = newIncomingMessages
                    .filter(m => m.data.createdAt > clearedAt)
                    .sort((a, b) => a.data.createdAt - b.data.createdAt);

                const incomingIds = new Set(incomingMessages.map(m => m.id));
                const earliestIncomingTs = incomingMessages.length > 0
                    ? incomingMessages[0].data.createdAt
                    : Number.POSITIVE_INFINITY;
                const shouldPreserveOlderMessages = incomingMessages.length === LIMIT_PER_PAGE;

                const preservedOlderMessages = shouldPreserveOlderMessages
                    ? currentMessages.filter((m) =>
                        m.data.createdAt > clearedAt
                        && m.data.createdAt < earliestIncomingTs
                        && !incomingIds.has(m.id)
                    )
                    : [];

                const mergedMessages = [...preservedOlderMessages, ...incomingMessages]
                    .sort((a, b) => a.data.createdAt - b.data.createdAt);

                return {
                    messages: {
                        ...state.messages,
                        [conversationId]: mergedMessages
                    }
                };
            });
        }, clearedAt);

        return unsubscribe;
    },

    loadMoreMessages: async (conversationId: string) => {
        const currentMessages = get().messages[conversationId] || [];
        if (currentMessages.length === 0) return;

        set((state) => ({
            isLoadingMore: { ...state.isLoadingMore, [conversationId]: true }
        }));

        try {
            const oldestMessage = currentMessages[0];
            const beforeTimestamp = oldestMessage.data.createdAt;

            const userChat = get().userChats[conversationId];
            const clearedAt = userChat?.clearedAt || 0;

            const olderMessages = await rtdbMessageService.loadMoreMessages(
                conversationId,
                beforeTimestamp,
                LIMIT_PER_PAGE,
                clearedAt
            );

            set((state) => ({
                messages: {
                    ...state.messages,
                    [conversationId]: [...olderMessages, ...currentMessages]
                },
                hasMoreMessages: {
                    ...state.hasMoreMessages,
                    [conversationId]: olderMessages.length === LIMIT_PER_PAGE
                },
                isLoadingMore: { ...state.isLoadingMore, [conversationId]: false }
            }));
        } catch (error) {
            console.error('[rtdbMessageSlice] Lỗi loadMoreMessages:', error);
            set((state) => ({
                isLoadingMore: { ...state.isLoadingMore, [conversationId]: false }
            }));
        }
    },

    sendTextMessage: async (conversationId: string, senderId: string, content: string, mentions?: string[], replyToId?: string) => {
        if (useAuthStore.getState().isBanned) throw new Error('Account is banned');
        await ensureMessagePolicy(get, conversationId, senderId);
        try {
            await rtdbMessageService.sendTextMessage(conversationId, senderId, content, {
                mentions,
                replyToId
            });
        } catch (error) {
            console.error('[rtdbMessageSlice] Lỗi sendTextMessage:', error);
            throw error;
        }
    },

    sendSharedPostMessage: async (conversationId: string, senderId: string, payload: SharedPostMessagePayload, replyToId?: string) => {
        if (useAuthStore.getState().isBanned) throw new Error('Account is banned');
        await ensureMessagePolicy(get, conversationId, senderId);
        try {
            await rtdbMessageService.sendSharedPostMessage(conversationId, senderId, payload, {
                replyToId
            });
        } catch (error) {
            console.error('[rtdbMessageSlice] Lỗi sendSharedPostMessage:', error);
            throw error;
        }
    },

    sendImageMessage: async (conversationId: string, senderId: string, files: File[], replyToId?: string) => {
        if (useAuthStore.getState().isBanned) throw new Error('Account is banned');
        await ensureMessagePolicy(get, conversationId, senderId);
        let uploadedMsgId: string | undefined;
        try {
            await rtdbMessageService.sendImageMessage(conversationId, senderId, files, {
                replyToId,
                onProgressWithId: (messageId, progress) => {
                    uploadedMsgId = messageId;
                    get().setUploadProgress(messageId, progress.progress);
                }
            });
        } catch (error) {
            console.error('[rtdbMessageSlice] Lỗi sendImageMessage:', error);
            if (uploadedMsgId) {
                set((state) => {
                    const msgs = state.messages[conversationId] || [];
                    return { messages: { ...state.messages, [conversationId]: msgs.filter(m => m.id !== uploadedMsgId) } };
                });
                set((state) => { const next = { ...state.uploadProgress }; delete next[uploadedMsgId!]; return { uploadProgress: next }; });
            }
            throw error;
        }
    },

    sendFileMessage: async (conversationId: string, senderId: string, file: File, replyToId?: string) => {
        if (useAuthStore.getState().isBanned) throw new Error('Account is banned');
        await ensureMessagePolicy(get, conversationId, senderId);
        let uploadedMsgId: string | undefined;
        try {
            await rtdbMessageService.sendFileMessage(conversationId, senderId, file, {
                replyToId,
                onProgressWithId: (messageId, progress) => {
                    uploadedMsgId = messageId;
                    get().setUploadProgress(messageId, progress.progress);
                }
            });
        } catch (error) {
            console.error('[rtdbMessageSlice] Lỗi sendFileMessage:', error);
            if (uploadedMsgId) {
                set((state) => {
                    const msgs = state.messages[conversationId] || [];
                    return { messages: { ...state.messages, [conversationId]: msgs.filter(m => m.id !== uploadedMsgId) } };
                });
                set((state) => { const next = { ...state.uploadProgress }; delete next[uploadedMsgId!]; return { uploadProgress: next }; });
            }
            throw error;
        }
    },

    sendVideoMessage: async (conversationId: string, senderId: string, file: File, replyToId?: string) => {
        if (useAuthStore.getState().isBanned) throw new Error('Account is banned');
        await ensureMessagePolicy(get, conversationId, senderId);
        let uploadedMsgId: string | undefined;
        try {
            await rtdbMessageService.sendVideoMessage(conversationId, senderId, file, {
                replyToId,
                onProgressWithId: (messageId, progress) => {
                    uploadedMsgId = messageId;
                    get().setUploadProgress(messageId, progress.progress);
                }
            });
        } catch (error) {
            console.error('[rtdbMessageSlice] Lỗi sendVideoMessage:', error);
            if (uploadedMsgId) {
                set((state) => {
                    const msgs = state.messages[conversationId] || [];
                    return { messages: { ...state.messages, [conversationId]: msgs.filter(m => m.id !== uploadedMsgId) } };
                });
                set((state) => { const next = { ...state.uploadProgress }; delete next[uploadedMsgId!]; return { uploadProgress: next }; });
            }
            throw error;
        }
    },

    sendVoiceMessage: async (conversationId: string, senderId: string, file: File, replyToId?: string, duration?: number) => {
        if (useAuthStore.getState().isBanned) throw new Error('Account is banned');
        await ensureMessagePolicy(get, conversationId, senderId);
        let uploadedMsgId: string | undefined;
        try {
            await rtdbMessageService.sendVoiceMessage(conversationId, senderId, file, {
                replyToId,
                duration,
                onProgressWithId: (messageId, progress) => {
                    uploadedMsgId = messageId;
                    get().setUploadProgress(messageId, progress.progress);
                }
            });
        } catch (error) {
            console.error('[rtdbMessageSlice] Lỗi sendVoiceMessage:', error);
            if (uploadedMsgId) {
                set((state) => {
                    const msgs = state.messages[conversationId] || [];
                    return { messages: { ...state.messages, [conversationId]: msgs.filter(m => m.id !== uploadedMsgId) } };
                });
                set((state) => { const next = { ...state.uploadProgress }; delete next[uploadedMsgId!]; return { uploadProgress: next }; });
            }
            throw error;
        }
    },

    sendGifMessage: async (conversationId: string, senderId: string, gifUrl: string, replyToId?: string) => {
        if (useAuthStore.getState().isBanned) throw new Error('Account is banned');
        await ensureMessagePolicy(get, conversationId, senderId);
        try {
            await rtdbMessageService.sendGifMessage(conversationId, senderId, gifUrl, { replyToId });
        } catch (error) {
            console.error('[rtdbMessageSlice] Lỗi sendGifMessage:', error);
            throw error;
        }
    },

    sendCallMessage: async (conversationId, senderId, payload) => {
        if (useAuthStore.getState().isBanned) throw new Error('Account is banned');
        await ensureMessagePolicy(get, conversationId, senderId);
        try {
            const msgId = await rtdbMessageService.sendCallMessage(conversationId, senderId, payload);

            return msgId;
        } catch (error) {
            console.error('[rtdbMessageSlice] Lỗi sendCallMessage:', error);
            throw error;
        }
    },

    updateCallMessage: async (conversationId, messageId, payload) => {
        try {
            const content = JSON.stringify(payload);
            await rtdbMessageService.updateMessageContent(conversationId, messageId, content, payload);
            
            set((state) => {
                const conversationMessages = state.messages[conversationId];
                if (!conversationMessages) return state;

                const messageIndex = conversationMessages.findIndex(m => m.id === messageId);
                if (messageIndex === -1) return state;

                const newMessages = [...conversationMessages];
                newMessages[messageIndex] = {
                    ...newMessages[messageIndex],
                    data: {
                        ...newMessages[messageIndex].data,
                        content,
                        updatedAt: Date.now()
                    }
                };

                return {
                    messages: {
                        ...state.messages,
                        [conversationId]: newMessages
                    }
                };
            });
        } catch (error) {
            console.error('[rtdbMessageSlice] Lỗi updateCallMessage:', error);
            throw error;
        }
    },

    markAsRead: async (conversationId: string, userId: string) => {
        if (get().conversations.some(c => c.id === conversationId)) {
            try {
                await rtdbMessageService.markAsRead(conversationId, userId);
            } catch (error) {
                console.error('[rtdbMessageSlice] Lỗi markAsRead:', error);
            }
        }
    },

    markAsDelivered: async (conversationId: string, userId: string) => {
        if (get().conversations.some(c => c.id === conversationId)) {
            try {
                await rtdbMessageService.markAsDelivered(conversationId, userId);
            } catch (error) {
                console.error('[rtdbMessageSlice] Lỗi markAsDelivered:', error);
            }
        }
    },

    recallMessage: async (conversationId: string, messageId: string) => {
        const userId = useAuthStore.getState().user?.id;
        if (!userId) return;

        const snapshot = get().messages[conversationId]?.find(m => m.id === messageId);

        set(state => {
            const msgs = state.messages[conversationId];
            if (!msgs) return state;
            return {
                messages: {
                    ...state.messages,
                    [conversationId]: msgs.map(m =>
                        m.id === messageId
                            ? { ...m, data: { ...m.data, isRecalled: true } }
                            : m
                    )
                }
            };
        });

        try {
            await rtdbMessageService.recallMessage(conversationId, messageId, userId);
        } catch (error) {
            if (snapshot) {
                set(state => ({
                    messages: {
                        ...state.messages,
                        [conversationId]: state.messages[conversationId]?.map(m =>
                            m.id === messageId ? snapshot : m
                        ) || []
                    }
                }));
            }
            console.error('[rtdbMessageSlice] Lỗi recallMessage:', error);
            throw error;
        }
    },

    deleteMessageForMe: async (conversationId: string, messageId: string, userId: string) => {
        const snapshot = get().messages[conversationId]?.find(m => m.id === messageId);
        set(state => {
            const msgs = state.messages[conversationId] || [];
            return {
                messages: {
                    ...state.messages,
                    [conversationId]: msgs.filter(m => m.id !== messageId)
                }
            };
        });

        try {
            await rtdbMessageService.deleteForMe(conversationId, messageId, userId);
        } catch (error) {
            if (snapshot) {
                set(state => {
                    const msgs = state.messages[conversationId] || [];
                    return {
                        messages: {
                            ...state.messages,
                            [conversationId]: [...msgs, snapshot].sort((a, b) => a.data.createdAt - b.data.createdAt)
                        }
                    };
                });
            }
            console.error('[rtdbMessageSlice] Lỗi deleteMessageForMe:', error);
            throw error;
        }
    },

    forwardMessage: async (targetConversationId: string, senderId: string, srcMessage: RtdbMessage) => {
        await ensureMessagePolicy(get, targetConversationId, senderId);
        try {
            await rtdbMessageService.forwardMessage(targetConversationId, senderId, srcMessage);
        } catch (error) {
            console.error('[rtdbMessageSlice] Lỗi forwardMessage:', error);
            throw error;
        }
    },

    editMessage: async (conversationId: string, messageId: string, content: string) => {
        const userId = useAuthStore.getState().user?.id;
        if (!userId) return;

        const snapshot = get().messages[conversationId]?.find(m => m.id === messageId);

        set(state => {
            const msgs = state.messages[conversationId];
            if (!msgs) return state;
            return {
                messages: {
                    ...state.messages,
                    [conversationId]: msgs.map(m =>
                        m.id === messageId
                            ? { ...m, data: { ...m.data, content, isEdited: true, updatedAt: Date.now() } }
                            : m
                    )
                }
            };
        });

        try {
            await rtdbMessageService.editMessage(conversationId, messageId, userId, content);
        } catch (error) {
            if (snapshot) {
                set(state => ({
                    messages: {
                        ...state.messages,
                        [conversationId]: state.messages[conversationId]?.map(m =>
                            m.id === messageId ? snapshot : m
                        ) || []
                    }
                }));
            }
            console.error('[rtdbMessageSlice] Lỗi editMessage:', error);
            throw error;
        }
    },

    toggleReaction: async (conversationId: string, messageId: string, userId: string, emoji: string) => {
        const snapshot = get().messages[conversationId]?.find(m => m.id === messageId);

        set(state => {
            const msgs = state.messages[conversationId];
            if (!msgs) return state;
            return {
                messages: {
                    ...state.messages,
                    [conversationId]: msgs.map(m => {
                        if (m.id !== messageId) return m;
                        const reactions = { ...(m.data.reactions || {}) };
                        if (reactions[userId] === emoji) {
                            delete reactions[userId];
                        } else {
                            reactions[userId] = emoji;
                        }
                        return { ...m, data: { ...m.data, reactions } };
                    })
                }
            };
        });

        try {
            await rtdbMessageService.toggleReaction(conversationId, messageId, userId, emoji);
        } catch (error) {
            if (snapshot) {
                set(state => ({
                    messages: {
                        ...state.messages,
                        [conversationId]: state.messages[conversationId]?.map(m =>
                            m.id === messageId ? snapshot : m
                        ) || []
                    }
                }));
            }
            console.error('[rtdbMessageSlice] Lỗi toggleReaction:', error);
            throw error;
        }
    },

    clearMessages: (conversationId: string) => {
        set((state) => {
            const newMessages = { ...state.messages };
            delete newMessages[conversationId];
            return { messages: newMessages };
        });
    },

    setUploadProgress: (messageId: string, progress: number) => {
        set((state) => {
            const next = { ...state.uploadProgress };
            if (progress >= 100) {
                delete next[messageId];
            } else {
                next[messageId] = { ...state.uploadProgress[messageId], progress };
            }
            return { uploadProgress: next };
        });
    },

    setUploadError: (messageId: string, isError: boolean) => {
        set((state) => ({
            uploadProgress: {
                ...state.uploadProgress,
                [messageId]: { ...state.uploadProgress[messageId], error: isError }
            }
        }));
    }
});
