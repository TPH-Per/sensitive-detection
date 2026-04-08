import { useEffect, useRef } from 'react';
import { notificationService } from '../services/notificationService';
import { useAuthStore } from '../store/authStore';
import { useRtdbChatStore } from '../store/rtdbChatStore';
import { soundManager } from '../services/soundManager';

export const useNotifications = () => {
    const { user } = useAuthStore();
    const { selectedConversationId, conversations } = useRtdbChatStore();
    
    const selectedConvRef = useRef(selectedConversationId);
    const prevConversationsRef = useRef(conversations);

    useEffect(() => {
        selectedConvRef.current = selectedConversationId;
    }, [selectedConversationId]);

    useEffect(() => {
        if (!user?.id) return;

        notificationService.requestPushPermission(user.id);

        const unsubscribeFCM = notificationService.initForegroundMessageHandler(
            user.id,
            selectedConvRef
        );

        return () => {
            if (unsubscribeFCM) unsubscribeFCM();
        };
    }, [user?.id]);

    useEffect(() => {
        if (!user?.id || conversations === prevConversationsRef.current) {
            prevConversationsRef.current = conversations;
            return;
        }

        conversations.forEach(conv => {
            const lastMsg = conv.data?.lastMessage;
            if (!lastMsg) return;

            const prevConv = prevConversationsRef.current.find(c => c.id === conv.id);
            const prevTimestamp = prevConv?.data?.lastMessage?.timestamp || 0;

            if (lastMsg.timestamp > prevTimestamp) {
                const isNotMe = lastMsg.senderId !== user.id;
                const isNotSilent = lastMsg.type !== 'system' && lastMsg.type !== 'call';
                const isNotMuted = !conv.userChat?.isMuted;
                const isNotSelected = selectedConversationId !== conv.id;
                const isTabHidden = document.visibilityState === 'hidden';

                const isVeryRecent = lastMsg.timestamp > (Date.now() - 30000);

                if (isVeryRecent && isNotMe && isNotSilent && isNotMuted && (isNotSelected || isTabHidden)) {
                    soundManager.play('message');
                }
            }
        });

        prevConversationsRef.current = conversations;
    }, [conversations, user?.id, selectedConversationId]);
};
