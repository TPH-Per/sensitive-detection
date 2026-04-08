import { useMemo } from 'react';
import { RtdbMessage, RtdbConversation, User, UserStatus } from '../../../shared/types';
import { useAuthStore } from '../../store/authStore';

interface UseMessageStatusOptions {
    messages: Array<{ id: string; data: RtdbMessage }>;
    conversation: { data: RtdbConversation };
    currentUserId: string;
    usersMap: Record<string, User>;
    partnerStatus?: UserStatus;
}

export interface MessageStatusResult {
    lastReadByMap: Record<string, User[]>;
    lastMessageReaders: User[];
    isLastMessageRead: boolean;
    isLastMessageDelivered: boolean;
}

export function useMessageStatus({
    messages,
    conversation,
    currentUserId,
    usersMap,
    partnerStatus,
}: UseMessageStatusOptions): MessageStatusResult {
    const { settings } = useAuthStore();

    const activeMembers = useMemo(
        () => new Set(Object.keys(conversation.data.members)),
        [conversation.data.members]
    );

    const isPartnerBanned = useMemo(() => {
        if (conversation.data.isGroup) return false;
        if (partnerStatus === UserStatus.BANNED) return true;
        const memberIds = [...activeMembers].filter(uid => uid !== currentUserId);
        const partnerId = memberIds[0];
        if (!partnerId) return false;
        return usersMap[partnerId]?.status === UserStatus.BANNED;
    }, [conversation.data.isGroup, partnerStatus, activeMembers, currentUserId, usersMap]);

    const eligibleMemberIds = useMemo(() => {
        if (isPartnerBanned) return [];
        return [...activeMembers].filter(uid => {
            if (uid === currentUserId) return false;
            const user = usersMap[uid];
            return !user || user.status !== UserStatus.BANNED;
        });
    }, [isPartnerBanned, activeMembers, currentUserId, usersMap]);

    const lastReadByMap = useMemo(() => {
        const map: Record<string, User[]> = {};

        if (settings?.showReadReceipts === false) return map;
        if (messages.length === 0) return map;
        if (eligibleMemberIds.length === 0) return map;

        const reversed = [...messages].reverse();

        if (conversation.data.isGroup) {
            eligibleMemberIds.forEach(uid => {
                const user = usersMap[uid];
                if (!user) return;
                const lastReadMsg = reversed.find(m => m.data.readBy?.[uid]);
                if (lastReadMsg) {
                    if (!map[lastReadMsg.id]) map[lastReadMsg.id] = [];
                    map[lastReadMsg.id].push(user);
                }
            });

            Object.keys(map).forEach(msgId => {
                const msg = messages.find(m => m.id === msgId);
                if (msg?.data.readBy) {
                    const readByEntries = Object.entries(msg.data.readBy);
                    map[msgId].sort((a, b) => {
                        const aTime = readByEntries.find(([uid]) => uid === a.id)?.[1] || 0;
                        const bTime = readByEntries.find(([uid]) => uid === b.id)?.[1] || 0;
                        return aTime - bTime;
                    });
                }
            });
        } else {
            const partnerId = eligibleMemberIds[0];
            const partner = partnerId ? usersMap[partnerId] : null;
            if (partnerId && partner) {
                const lastReadMsg = reversed.find(m => m.data.readBy?.[partnerId]);
                if (lastReadMsg) {
                    map[lastReadMsg.id] = [partner];
                }
            }
        }

        return map;
    }, [messages, conversation.data.isGroup, eligibleMemberIds, usersMap, settings?.showReadReceipts]);

    const lastSentMessage = useMemo(() => {
        for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            if (msg.data.senderId === currentUserId && !msg.data.isRecalled) {
                return msg;
            }
        }
        return null;
    }, [messages, currentUserId]);

    const lastMessageReaders = useMemo(() => {
        if (!lastSentMessage) return [];
        return lastReadByMap[lastSentMessage.id] || [];
    }, [lastSentMessage, lastReadByMap]);

    const isLastMessageRead = lastMessageReaders.length > 0;

    const isLastMessageDelivered = useMemo(() => {
        if (!lastSentMessage || eligibleMemberIds.length === 0) return false;
        const deliveredTo = lastSentMessage.data.deliveredTo || {};
        return Object.keys(deliveredTo).some(
            uid => uid !== currentUserId && eligibleMemberIds.includes(uid)
        );
    }, [lastSentMessage, currentUserId, eligibleMemberIds]);

    return {
        lastReadByMap,
        lastMessageReaders,
        isLastMessageRead,
        isLastMessageDelivered,
    };
}
