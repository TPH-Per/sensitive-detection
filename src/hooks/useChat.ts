import { useState, useEffect, useCallback, useMemo } from 'react';
import { RtdbMessage, User, FriendStatus, FriendRequest } from '../../shared/types';
import { useAuthStore } from '../store/authStore';
import { useRtdbChatStore } from '../store';
import { useContactStore } from '../store/contactStore';
import { useUserCache } from '../store/userCacheStore';
import { useLoadingStore } from '../store/loadingStore';
import { friendService } from '../services/friendService';
import { 
  useChatActions, 
  useChatMessages, 
  useChatBlock, 
  useChatGroups, 
  useConversationParticipants 
} from './chat';

const EMPTY_MESSAGES: Array<{ id: string; data: RtdbMessage }> = [];
const EMPTY_TYPING: string[] = [];

export const useChat = () => {
  const { user: currentUser } = useAuthStore();
  const {
    conversations,
    selectedConversationId,
    messages,
    selectConversation,
    subscribeToMessages,
    markAsRead,
    markAsDelivered,
    searchConversations,
    isSearchFocused,
    searchResults,
    setSearchFocused,
    getOrCreateConversation,
    searchHistory,
    addToSearchHistory,
    removeFromSearchHistory,
    clearSearchHistory,
    setIsChatVisible,
    loadMoreMessages,
    typingUsers,
    setTyping,
    subscribeToTyping,
  } = useRtdbChatStore();

  const { users: usersMap, fetchUsers } = useUserCache();
  const chatIsLoading = useLoadingStore(state => state.loadingStates['chat'] ?? false);
  const [viewMode, setViewMode] = useState<'normal' | 'archived'>('normal');
  const [forwardingMessage, setForwardingMessage] = useState<{ id: string; data: RtdbMessage } | null>(null);
  const [replyingTo, setReplyingTo] = useState<{ id: string; data: RtdbMessage } | null>(null);
  const [editingMessage, setEditingMessage] = useState<{ id: string; data: RtdbMessage } | null>(null);
  const sentRequests = useContactStore(state => state.sentRequests);
  const receivedRequests = useContactStore(state => state.receivedRequests);

  const selectedConversation = useMemo(() => {
    const existing = conversations.find(c => c.id === selectedConversationId);
    if (existing) return existing;

    if (selectedConversationId && selectedConversationId.startsWith('direct_') && currentUser) {
      const partnerId = selectedConversationId.replace('direct_', '').split('_').find(id => id !== currentUser.id);
      if (partnerId) {
        return {
          id: selectedConversationId,
          data: {
            isGroup: false,
            members: { [currentUser.id]: 'admin', [partnerId]: 'member' },
            createdAt: Date.now(),
            updatedAt: Date.now(),
            typing: {},
            lastMessage: null,
            avatar: null,
            name: null,
            creatorId: currentUser.id
          } as any,
          userChat: {
            isArchived: false,
            isMuted: false,
            isPinned: false,
            unreadCount: 0,
            updatedAt: Date.now()
          } as any
        };
      }
    }
    return undefined;
  }, [conversations, selectedConversationId, currentUser]);

  const filteredConversations = conversations;

  const archivedCount = useMemo(
    () => conversations.filter(c => c.userChat?.isArchived).length,
    [conversations]
  );

  const currentMessages = selectedConversationId ? (messages[selectedConversationId] ?? EMPTY_MESSAGES) : EMPTY_MESSAGES;
  const currentTypingUsers = selectedConversationId ? (typingUsers[selectedConversationId] ?? EMPTY_TYPING) : EMPTY_TYPING;

  const { isLoadingMore: storeIsLoadingMore, hasMoreMessages: storeHasMoreMessages } = useRtdbChatStore();
  const isLoadingMore = selectedConversationId ? (storeIsLoadingMore[selectedConversationId] || false) : false;
  const hasMoreMessages = selectedConversationId ? (storeHasMoreMessages[selectedConversationId] || false) : false;

  const participantIds = useMemo(() => {
    if (!selectedConversation) return [];
    return Object.keys(selectedConversation.data.members || {});
  }, [selectedConversation]);

  const participants = useConversationParticipants(participantIds);

  const partnerId = selectedConversation && !selectedConversation.data.isGroup
    ? participantIds.find(id => id !== currentUser?.id) ?? null
    : null;

  const partner = partnerId ? (usersMap[partnerId] ?? null) : null;

  const friendIds = useContactStore(state => state.friends.map(f => f.id));
  const partnerFriendStatus = useMemo(() => {
    if (!partnerId) return undefined;
    return friendIds.includes(partnerId) ? FriendStatus.FRIEND : undefined;
  }, [partnerId, friendIds]);

  const isFriend = useMemo(() => {
    if (!partnerId) return false;
    return friendIds.includes(partnerId);
  }, [partnerId, friendIds]);

  const canCall = useMemo(() => {
    if (selectedConversation?.data.isGroup) return true;
    return isFriend;
  }, [selectedConversation?.data.isGroup, isFriend]);

  const partnerPendingRequestId = useMemo(() => {
    if (!partnerId) return undefined;
    const sent = sentRequests.find(r => r.receiverId === partnerId);
    if (sent) return sent.id;
    const received = receivedRequests.find(r => r.senderId === partnerId);
    return received?.id;
  }, [partnerId, sentRequests, receivedRequests]);

  const friendRequestStatus = useMemo(() => {
    if (!partnerId) return 'none' as const;
    if (sentRequests.some(r => r.receiverId === partnerId)) return 'sent' as const;
    if (receivedRequests.some(r => r.senderId === partnerId)) return 'received' as const;
    return 'none' as const;
  }, [partnerId, sentRequests, receivedRequests]);

  const currentReceivedRequest = useMemo(() =>
    partnerId ? receivedRequests.find(r => r.senderId === partnerId) ?? null : null,
    [partnerId, receivedRequests]
  );

  const actions = useChatActions({
    selectedConversationId,
    currentUserId: currentUser?.id ?? null,
    selectConversation,
  });

  const chatMessages = useChatMessages({
    selectedConversationId,
    currentUserId: currentUser?.id ?? null,
  });

  const block = useChatBlock({
    partnerId,
    currentUser: currentUser ?? null,
    partner,
    isGroup: selectedConversation?.data.isGroup ?? false,
    usersMap,
    conversation: selectedConversation?.data,
  });

  const groups = useChatGroups({
    selectedConversationId,
    currentUserId: currentUser?.id ?? null,
    conversations,
    usersMap,
    currentUserName: currentUser?.fullName,
  });

  useEffect(() => {
    if (!selectedConversationId || !currentUser) return;
    const unsubMessages = subscribeToMessages(selectedConversationId);
    const unsubTyping = subscribeToTyping(selectedConversationId);
    markAsDelivered(selectedConversationId, currentUser.id);
    return () => {
      unsubMessages();
      unsubTyping();
    };
  }, [selectedConversationId, currentUser, subscribeToMessages, subscribeToTyping, markAsDelivered]);

  useEffect(() => {
    const selectedConvData = conversations.find(c => c.id === selectedConversationId)?.data;
    const isGroup = selectedConvData?.isGroup || false;
    
    let isMessageRequest = false;
    if (!isGroup) {
      const activeParticipantIds = Object.keys(selectedConvData?.members || {});
      const activePartnerId = activeParticipantIds.find(id => id !== currentUser.id);
      isMessageRequest = activePartnerId ? !friendIds.includes(activePartnerId) : false;
    }

    if (isMessageRequest) return;

    const msgs = messages[selectedConversationId] || [];
    const hasUnread = msgs.some(m =>
      m.data.senderId !== currentUser.id && (!m.data.readBy || !m.data.readBy[currentUser.id])
    );
    if (hasUnread) markAsRead(selectedConversationId, currentUser.id);
  }, [messages, selectedConversationId, currentUser, markAsRead, conversations, friendIds]);

  useEffect(() => {
    if (!selectedConversationId || !currentUser) return;
    const msgs = messages[selectedConversationId] || [];
    if (msgs.length === 0) return;
    const userIds = [...new Set(msgs.map(m => m.data.senderId))];
    participantIds.forEach(id => userIds.push(id));
    fetchUsers(userIds);
  }, [messages, selectedConversationId, currentUser, participantIds, fetchUsers]);

  const handleSelectConversation = useCallback((id: string) => selectConversation(id), [selectConversation]);

  const handleLoadMoreMessages = useCallback(async () => {
    if (selectedConversationId) await loadMoreMessages(selectedConversationId);
  }, [selectedConversationId, loadMoreMessages]);

  const handleForwardMessage = useCallback((message: { id: string; data: RtdbMessage }) => setForwardingMessage(message), []);

  const handleTyping = useCallback(async (isTyping: boolean) => {
    if (!selectedConversationId || !currentUser) return;
    await setTyping(selectedConversationId, currentUser.id, isTyping);
  }, [selectedConversationId, currentUser, setTyping]);

  const handleSearch = useCallback(async (term: string) => {
    if (!currentUser) return;
    await searchConversations(currentUser.id, term);
  }, [currentUser, searchConversations]);

  return {
    currentUser,
    conversations,
    filteredConversations,
    selectedConversation,
    selectedConversationId,
    currentMessages,
    currentTypingUsers,
    participants,
    usersMap,
    archivedCount,
    isLoading: chatIsLoading,
    isLoadingMore,
    hasMoreMessages,
    isSearchFocused,
    searchResults,
    searchHistory: currentUser?.id ? (searchHistory[currentUser.id] || []) : [],
    viewMode,
    setViewMode,
    forwardingMessage,
    setForwardingMessage,
    replyingTo,
    setReplyingTo,
    editingMessage,
    setEditingMessage,
    handleSelectConversation,
    handleLoadMoreMessages,
    handleForwardMessage,
    handleTyping,
    handleSearch,
    setSearchFocused,
    addToSearchHistory: (item: User) => {
      if (currentUser?.id) addToSearchHistory(item, currentUser.id);
    },
    removeFromSearchHistory: (id: string) => {
      if (currentUser?.id) removeFromSearchHistory(id, currentUser.id);
    },
    clearSearchHistory: () => {
      if (currentUser?.id) clearSearchHistory(currentUser.id);
    },
    getOrCreateConversation,
    setIsChatVisible,

    isBlocked: block.isBlocked,
    isBlockedByMe: block.isBlockedByMe,
    isMessageBlockedByMe: block.isMessageBlockedByMe,
    isCallBlockedByMe: block.isCallBlockedByMe,
    isCallBlockedByPartner: block.isCallBlockedByPartner,
    myBlockOptions: block.myBlockOptions,
    partnerId,
    blockedMessage: block.blockedMessage,
    getBlockedMessage: block.getBlockedMessage,
    handleApplyBlock: block.handleApplyBlock,
    handleUnblock: block.handleUnblock,
    shouldShowBlockBanner: block.shouldShowBlockBanner,
    friendRequestStatus,
    currentReceivedRequest,
    isFriend,
    canCall,
    sentRequests,
    receivedRequests,

    // Actions
    ...actions,

    // Messages
    ...chatMessages,

    // Groups
    ...groups,
  };
};
