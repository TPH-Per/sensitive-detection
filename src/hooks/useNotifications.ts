import { useEffect, useRef } from 'react';
import { notificationService } from '../services/notificationService';
import { useAuthStore } from '../store/authStore';
import { useRtdbChatStore } from '../store/rtdbChatStore';

export const useNotifications = () => {
    const { user } = useAuthStore();
    const selectedConversationId = useRtdbChatStore((state) => state.selectedConversationId);
    const selectedConvRef = useRef(selectedConversationId);

    useEffect(() => {
        selectedConvRef.current = selectedConversationId;
    }, [selectedConversationId]);

    useEffect(() => {
        if (!user?.id) return;

        const handleInteraction = () => {
            notificationService.unlockAudio();
            window.removeEventListener('click', handleInteraction);
        };
        window.addEventListener('click', handleInteraction);

        notificationService.requestPushPermission(user.id);

        const unsubscribe = notificationService.initForegroundMessageHandler(
            user.id,
            selectedConvRef
        );

        return () => {
            window.removeEventListener('click', handleInteraction);
            if (unsubscribe) unsubscribe();
        };
    }, [user?.id]);
};
