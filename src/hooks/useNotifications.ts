import { useEffect } from 'react';
import { notificationService } from '../services/notificationService';
import { useAuthStore } from '../store/authStore';
import { useRtdbChatStore } from '../store/rtdbChatStore';

/**
 * Hook khởi tạo hệ thống thông báo tập trung
 * Lắng nghe FCM foreground message và phát âm thanh notify
 */
export const useNotifications = () => {
    const { user } = useAuthStore();
    const selectedConversationId = useRtdbChatStore((state) => state.selectedConversationId);

    useEffect(() => {
        if (!user?.id) return;

        // Mở khóa âm thanh khi người dùng click lần đầu
        const handleInteraction = () => {
            notificationService.unlockAudio();
            window.removeEventListener('click', handleInteraction);
        };
        window.addEventListener('click', handleInteraction);

        // Yêu cầu quyền thông báo nếu chưa có
        notificationService.requestPushPermission(user.id);

        // Khởi tạo trình lắng nghe foreground message (Âm thanh ting ting)
        const unsubscribe = notificationService.initForegroundMessageHandler(
            user.id, 
            selectedConversationId
        );

        return () => {
            window.removeEventListener('click', handleInteraction);
            if (unsubscribe) unsubscribe();
        };
    }, [user?.id, selectedConversationId]);
};
