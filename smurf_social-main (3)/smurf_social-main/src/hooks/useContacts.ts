import { useState, useEffect, useCallback, useMemo } from 'react';
import { User, FriendRequest } from '../../shared/types';
import { useAuthStore } from '../store/authStore';
import { useContactStore } from '../store/contactStore';
import { useUserCache } from '../store/userCacheStore';
import { useRtdbChatStore } from '../store';
import { useLoadingStore } from '../store/loadingStore';
import { friendService } from '../services/friendService';
import { userService } from '../services/userService';
import { toast } from '../store/toastStore';
import { getDirectConversationId } from '../utils/chatUtils';

type TabType = 'all' | 'requests' | 'sent' | 'suggestions';

interface FriendGroup {
  letter: string;
  friends: User[];
}

interface UseContactsReturn {
  currentUser: User | null;
  friends: User[];
  receivedRequests: FriendRequest[];
  sentRequests: FriendRequest[];
  filteredReceivedRequests: FriendRequest[];
  filteredSentRequests: FriendRequest[];
  suggestions: User[];
  filteredSuggestions: User[];
  filteredFriends: User[];
  groupedFriends: FriendGroup[];
  userCache: Record<string, User>;
  isLoading: boolean;
  isSuggestionsLoading: boolean;

  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  sortOrder: 'asc' | 'desc';
  toggleSortOrder: () => void;

  handleAcceptRequest: (requestId: string, friendId: string) => Promise<void>;
  handleRejectRequest: (requestId: string) => Promise<void>;
  handleCancelRequest: (requestId: string) => Promise<void>;
  handleUnfriend: (friendId: string) => Promise<void>;
  handleMessage: (friendId: string) => string | null;
  handleAddFriend: (receiverId: string) => Promise<void>;
  handleDismissSuggestion: (userId: string) => void;
  handleRefreshSuggestions: () => Promise<void>;
  handleApplyBlock: (targetId: string, options: any) => Promise<void>;
  handleUnblock: (targetId: string) => Promise<void>;
}

/** Quản lý danh sách bạn bè và lời mời kết bạn */
export const useContacts = (): UseContactsReturn => {
  const { user: currentUser } = useAuthStore();
  const {
    friends,
    receivedRequests,
    sentRequests,
    suggestions,
    acceptFriendRequest,
    rejectFriendRequest,
    cancelFriendRequest,
    unfriend,
    sendFriendRequest,
    loadSuggestions,
    refreshSuggestions,
    dismissSuggestion,
  } = useContactStore();

  const { users: userCache, fetchUsers } = useUserCache();
  const { selectConversation } = useRtdbChatStore();
  const contactsLoading = useLoadingStore(state => state.loadingStates['contacts.friends'] ?? false);
  const suggestionsLoading = useLoadingStore(state => state.loadingStates['contacts.suggestions'] ?? false);

  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    if (!currentUser) return;
    loadSuggestions(currentUser.id);
  }, [currentUser?.id]);

  useEffect(() => {
    const userIds = [
      ...receivedRequests.map(r => r.senderId),
      ...sentRequests.map(r => r.receiverId)
    ];
    const uniqueIds = [...new Set(userIds)];
    if (uniqueIds.length > 0) {
      fetchUsers(uniqueIds);
    }
  }, [receivedRequests, sentRequests, fetchUsers]);

  const filteredFriends = useMemo(() => friends.filter(friend =>
    friend.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    friend.email?.toLowerCase().includes(searchTerm.toLowerCase())
  ), [friends, searchTerm]);

  const filteredReceivedRequests = useMemo(() => {
    if (!searchTerm) return receivedRequests;
    return receivedRequests.filter(req => {
      const user = userCache[req.senderId];
      return user?.fullName.toLowerCase().includes(searchTerm.toLowerCase());
    });
  }, [receivedRequests, userCache, searchTerm]);

  const filteredSentRequests = useMemo(() => {
    if (!searchTerm) return sentRequests;
    return sentRequests.filter(req => {
      const user = userCache[req.receiverId];
      return user?.fullName.toLowerCase().includes(searchTerm.toLowerCase());
    });
  }, [sentRequests, userCache, searchTerm]);

  const groupedFriends = useMemo(() => {
    const groups: Record<string, User[]> = {};
    filteredFriends.forEach(friend => {
      const firstLetter = friend.fullName.charAt(0).toUpperCase();
      if (!groups[firstLetter]) groups[firstLetter] = [];
      groups[firstLetter].push(friend);
    });

    const sortedGroups = Object.keys(groups).sort();
    if (sortOrder === 'desc') sortedGroups.reverse();

    return sortedGroups.map(letter => ({
      letter,
      friends: groups[letter].sort((a, b) => {
        return sortOrder === 'asc'
          ? a.fullName.localeCompare(b.fullName)
          : b.fullName.localeCompare(a.fullName);
      })
    }));
  }, [filteredFriends, sortOrder]);

  const toggleSortOrder = useCallback(() => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
  }, []);

  const filteredSuggestions = useMemo(() => {
    const excludeIds = new Set([
      ...friends.map(f => f.id),
      ...sentRequests.map(r => r.receiverId),
      ...receivedRequests.map(r => r.senderId),
    ]);
    return suggestions.filter(u => 
      !excludeIds.has(u.id) && 
      u.fullName.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [suggestions, friends, sentRequests, receivedRequests, searchTerm]);

  const handleAcceptRequest = useCallback(async (requestId: string, friendId: string) => {
    if (!currentUser) return;
    const request = receivedRequests.find(r => r.id === requestId);
    if (!request) return;
    await acceptFriendRequest(requestId, request.senderId, currentUser.id);
  }, [currentUser, receivedRequests, acceptFriendRequest]);

  const handleRejectRequest = useCallback(async (requestId: string) => {
    await rejectFriendRequest(requestId);
  }, [rejectFriendRequest]);

  const handleCancelRequest = useCallback(async (requestId: string) => {
    await cancelFriendRequest(requestId);
  }, [cancelFriendRequest]);

  const handleUnfriend = useCallback(async (friendId: string) => {
    if (!currentUser) return;
    await unfriend(currentUser.id, friendId);
  }, [currentUser, unfriend]);


  const handleMessage = useCallback((partnerId: string, bypassSettingsCheck: boolean = false): string | null => {
    if (!currentUser) return null;


    try {
      const conversationId = getDirectConversationId(currentUser.id, partnerId);
      selectConversation(conversationId);
      return conversationId;
    } catch (error: any) {
      console.error('[handleMessage] Lỗi không xác định:', error);
      toast.error("Đã có lỗi xảy ra khi khởi tạo cuộc trò chuyện.");
      return null;
    }
  }, [currentUser, friends, selectConversation]);


  const handleAddFriend = useCallback(async (receiverId: string) => {
    if (!currentUser) return;
    dismissSuggestion(receiverId);
    friendService.removeSuggestion(currentUser.id, receiverId);
    await sendFriendRequest(currentUser.id, receiverId);
  }, [currentUser, sendFriendRequest, dismissSuggestion]);

  const handleDismissSuggestion = useCallback((userId: string) => {
    if (!currentUser) return;
    dismissSuggestion(userId);
    friendService.removeSuggestion(currentUser.id, userId);
  }, [currentUser, dismissSuggestion]);

  const handleRefreshSuggestions = useCallback(async () => {
    await refreshSuggestions();
  }, [refreshSuggestions]);

  const handleApplyBlock = useCallback(async (targetId: string, options: any) => {
    if (!currentUser) return;
    try {
      await useAuthStore.getState().updateBlockEntry('add', targetId, options);
      // Refresh feed logic if needed
    } catch (error) {
      console.error("Lỗi chặn người dùng", error);
      throw error;
    }
  }, [currentUser]);

  const handleUnblock = useCallback(async (targetId: string) => {
    if (!currentUser) return;
    try {
      await useAuthStore.getState().updateBlockEntry('remove', targetId);
    } catch (error) {
      console.error("Lỗi bỏ chặn người dùng", error);
      throw error;
    }
  }, [currentUser]);

  return {
    currentUser,
    friends,
    receivedRequests,
    sentRequests,
    filteredReceivedRequests,
    filteredSentRequests,
    suggestions,
    filteredSuggestions,
    filteredFriends,
    groupedFriends,
    userCache,
    isLoading: contactsLoading,
    isSuggestionsLoading: suggestionsLoading,
    activeTab,
    setActiveTab,
    searchTerm,
    setSearchTerm,
    sortOrder,
    toggleSortOrder,
    handleAcceptRequest,
    handleRejectRequest,
    handleCancelRequest,
    handleUnfriend,
    handleMessage,
    handleAddFriend,
    handleDismissSuggestion,
    handleRefreshSuggestions,
    handleApplyBlock,
    handleUnblock,
  };
};
