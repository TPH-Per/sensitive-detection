import { useEffect, useMemo, useState } from 'react';
import { useRtdbChatStore } from '../../store';
import { useUserCache } from '../../store/userCacheStore';
import { useAuthStore } from '../../store/authStore';
import { friendService } from '../../services/friendService';
import { userService } from '../../services/userService';
import { BlockOptions, RtdbConversation, RtdbUserChat, User, UserStatus } from '../../../shared/types';
import { getDirectConversationId } from '../../utils/chatUtils';
import { PAGINATION } from '../../constants';

export type ShareableEntry =
  | { type: 'conversation'; id: string; item: { id: string; data: RtdbConversation; userChat: RtdbUserChat } }
  | { type: 'friend'; id: string; item: User };

/** Tìm kiếm và quản lý danh sách chia sẻ qua hội thoại và bạn bè */
export const useShareTargets = (currentUserId: string, searchTerm: string, isOpen: boolean) => {
  const conversations = useRtdbChatStore(state => state.conversations);
  const { users: usersMap, fetchUsers } = useUserCache();
  const blockedUsers = useAuthStore(state => state.blockedUsers);
  const [allFriends, setAllFriends] = useState<User[]>([]);
  const [blockedByPartners, setBlockedByPartners] = useState<Record<string, BlockOptions>>({});
  const [isLoading, setIsLoading] = useState(false);


  useEffect(() => {
    if (!isOpen) return;

    const userIds = Array.from(new Set(
      conversations.flatMap(conv => Object.keys(conv.data.members || {}))
    )).filter(id => id !== currentUserId);

    if (userIds.length > 0) {
      fetchUsers(userIds);
    }
  }, [isOpen, conversations, fetchUsers, currentUserId]);


  useEffect(() => {
    if (!isOpen) return;

    const loadFriends = async () => {
      try {
        setIsLoading(true);
        const friends = await friendService.getAllFriends(currentUserId);
        setAllFriends(friends);
      } catch (error) {
        console.error('Lỗi load friends trong useShareTargets:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadFriends();
  }, [isOpen, currentUserId]);


  useEffect(() => {
    if (!isOpen) {
      setBlockedByPartners({});
      return;
    }

    const loadBlockedBy = async () => {
      const partnerIds = conversations
        .filter(c => !c.data.isGroup)
        .map(c => Object.keys(c.data.members).find(id => id !== currentUserId))
        .filter((id): id is string => !!id);
      
      const friendIds = allFriends.map(f => f.id);
      const allTargetIds = Array.from(new Set([...partnerIds, ...friendIds]));

      if (allTargetIds.length > 0) {
        const results = await userService.checkMultipleBlockStatuses(allTargetIds, currentUserId);
        setBlockedByPartners(results);
      }
    };

    loadBlockedBy();
  }, [isOpen, conversations, allFriends, currentUserId]);


  const shareableItems = useMemo(() => {

    const validConvs = conversations.filter(conv => {
      if (conv.data.isDisbanded) return false;
      if (!conv.data.isGroup) {
        const partnerId = Object.keys(conv.data.members).find(id => id !== currentUserId);
        if (!partnerId) return false;
        
        // Loại bỏ nếu mình đã chặn nhắn tin người kia hoặc họ chặn mình
        const isBlockedByMe = !!blockedUsers[partnerId]?.blockMessages;
        const isBlockedByPartner = !!blockedByPartners[partnerId]?.blockMessages;
        if (isBlockedByMe || isBlockedByPartner) return false;
        
        const partner = usersMap[partnerId];
        if (partner?.status === UserStatus.BANNED) return false;
      }
      return true;
    });

    const convEntries: ShareableEntry[] = validConvs.map(conv => ({
      type: 'conversation',
      id: conv.id,
      item: conv
    }));


    const existingChatPartnerIds = new Set(
      validConvs
        .filter(c => !c.data.isGroup)
        .map(c => Object.keys(c.data.members).find(id => id !== currentUserId))
        .filter(Boolean)
    );

    const friendEntries: ShareableEntry[] = allFriends
      .filter(friend => friend.id !== currentUserId)
      .filter(friend => {
        const blocked = blockedUsers[friend.id];
        const blockedBy = blockedByPartners[friend.id];
        return !blocked?.blockMessages && !blockedBy?.blockMessages && friend.status !== UserStatus.BANNED;
      })
      .map(friend => ({
        type: 'friend',
        id: getDirectConversationId(currentUserId, friend.id),
        item: friend
      }));

    const searchItems: ShareableEntry[] = [
      ...convEntries,
      ...friendEntries.filter(f => !existingChatPartnerIds.has((f.item as any).id))
    ];

    return {
      allItems: searchItems,
      recentItems: convEntries,
      friendItems: friendEntries
    };
  }, [conversations, allFriends, currentUserId, blockedUsers, blockedByPartners, usersMap]);


  const filteredItems = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    
    let results = shareableItems.allItems;
    if (normalizedSearch) {
      results = shareableItems.allItems.filter(entry => {
        if (entry.type === 'conversation') {
          const conversation = entry.item.data;
          if (conversation.isGroup) {
            return (conversation.name || '').toLowerCase().includes(normalizedSearch);
          }
          const partnerId = Object.keys(conversation.members).find(id => id !== currentUserId) || '';
          const partnerName = usersMap[partnerId]?.fullName || '';
          return partnerName.toLowerCase().includes(normalizedSearch);
        } else {
          const friend = entry.item;
          return (friend.fullName || '').toLowerCase().includes(normalizedSearch) ||
                 (friend.email || '').toLowerCase().includes(normalizedSearch);
        }
      });
    }

    const limit = normalizedSearch ? PAGINATION.SHARE_SEARCH_LIMIT : PAGINATION.SHARE_MODAL_LIMIT;
    return results.slice(0, limit);
  }, [searchTerm, shareableItems.allItems, currentUserId, usersMap]);

  return { 
    filteredItems, 
    recentItems: shareableItems.recentItems,
    friendItems: shareableItems.friendItems,
    isLoading, 
    usersMap 
  };
};
