import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { BlockOptionsModal, ConfirmDialog } from '../components/ui';
import { User } from '../../shared/types';
import { useChat } from '../hooks';
import { useLoadingStore } from '../store/loadingStore';
import { useAuthStore } from '../store/authStore';
import { useFriendIds, useBlockedUsers } from '../hooks';
import { friendService } from '../services/friendService';
import { useConversationMemberSettings } from '../hooks/chat/useConversationMemberSettings';
import { useCallManager } from '../hooks/chat/useCallManager';
import { toast } from '../store/toastStore';
import {
  ConversationList, ChatBox, ChatInput, ChatDetailsPanel,
  CreateGroupModal, AddMemberModal, EditGroupModal,
  TransferAdminModal, ForwardModal, MessengerSkeleton,
  JoinGroupModal,
} from '../components/chat';

import { scrollToMessage } from '../utils';

const ChatPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    currentUser, conversations, filteredConversations,
    selectedConversationId, selectedConversation,
    currentMessages, currentTypingUsers, isLoading,
    viewMode, setViewMode, isSearchFocused, setSearchFocused,
    searchResults, searchHistory, archivedCount, usersMap,
    isBlocked, isBlockedByMe, isCallBlockedByMe, isCallBlockedByPartner,
    partnerStatus, blockedMessage, forwardingMessage, setForwardingMessage,
    replyingTo, setReplyingTo, editingMessage, setEditingMessage,
    handleSelectConversation, handleSendText, handleEditMessage,
    handleRecallMessage, handleDeleteForMe, handleForwardMessage,
    handleSendImage, handleSendFile, handleSendVideo, handleSendVoice, handleSendGif,
    handleTyping, handleSearch, handlePin, handleMute, handleArchive,
    handleMarkUnread, handleDelete, handleMarkAllRead,
    handleApplyBlock, handleUnblock, shouldShowBlockBanner, myBlockOptions,
    handleCreateGroup, handleAddMembers, handleInviteMembers, handleRemoveMember,
    handleLeaveGroup, handleAssignAdminAndLeave, handlePromoteToAdmin,
    handleDemoteFromAdmin, handleEditGroup, handleDisbandGroup,
    handleCopyInviteLink, handleResetInviteLink,
    handleJoinGroupByLink, fetchGroupInviteInfo,
    handleApproveMembers, handleRejectMembers, handleToggleApprovalMode, handleTransferCreator,

    addToSearchHistory, removeFromSearchHistory, clearSearchHistory,
    getOrCreateConversation, setIsChatVisible,
    isLoadingMore, hasMoreMessages, handleLoadMoreMessages,
    friendRequestStatus, canCall, receivedRequests, sentRequests, participants,
    handleMarkAsRead, isLoadingSettings,
  } = useChat();

  const isSearching = useLoadingStore(state => state.loadingStates['contacts.search']);
  const friendIds = useFriendIds();
  const selectedMemberSettings = useConversationMemberSettings(
    selectedConversationId || '', currentUser?.id || ''
  );

  useEffect(() => {
    setIsChatVisible(true);
    return () => { setIsChatVisible(false); handleSelectConversation(null); };
  }, [setIsChatVisible, handleSelectConversation]);

  const [searchParams] = useSearchParams();
  const convIdFromUrl = searchParams.get('conv');
  const joinTokenFromUrl = searchParams.get('joinToken');

  useEffect(() => {
    if (!convIdFromUrl) return;
    handleSelectConversation(convIdFromUrl);
    navigate('/', { replace: true });
  }, [convIdFromUrl, handleSelectConversation, navigate]);



  const [showDetails, setShowDetails] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showEditGroup, setShowEditGroup] = useState(false);
  const [showAssignAdmin, setShowAssignAdmin] = useState(false);
  const [showTransferCreator, setShowTransferCreator] = useState(false);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [blockTarget, setBlockTarget] = useState<{ id: string; name: string } | null>(null);


  const handleSelectUserFromSearch = (user: User, bypassSettingsCheck: boolean = false) => {
    if (!currentUser) return;
    
    addToSearchHistory(user);
    getOrCreateConversation(currentUser.id, user.id);
    setSearchFocused(false);
  };


  const openBlockModal = (partnerId?: string, partnerName?: string) => {
    if (partnerId && partnerName) {
      setBlockTarget({ id: partnerId, name: partnerName });
    }
    setIsBlockModalOpen(true);
  };
  const closeBlockModal = () => { setIsBlockModalOpen(false); setBlockTarget(null); };
  const confirmUnblock = async () => { await handleUnblock(blockTarget?.id); closeBlockModal(); };

  const { startCall, joinActiveCall } = useCallManager(currentUser?.id || '');

  const partner = selectedConversation?.data.isGroup
    ? null
    : participants.find(p => p.id !== currentUser?.id);

  const handleInitiateCall = async (type: 'voice' | 'video') => {
    if (!selectedConversationId || !currentUser) return;
    const isGroup = selectedConversation?.data.isGroup || false;
    const recipientIds = isGroup
      ? Object.keys(selectedConversation?.data.members || {}).filter(id => id !== currentUser.id)
      : (partner ? [partner.id] : []);
    if (recipientIds.length === 0) return;
    if (!isGroup) {
      if (isCallBlockedByMe) { toast.error('Bạn đã chặn cuộc gọi với người dùng này.'); return; }
      if (isCallBlockedByPartner) { toast.error('Không thể thực hiện cuộc gọi cho người dùng này.'); return; }
    }
    const result = await startCall(
      recipientIds, currentUser.fullName, currentUser.avatar?.url ?? '',
      type, selectedConversationId, isGroup,
      !isGroup ? partner?.fullName : (selectedConversation?.data.name || 'Cuộc gọi nhóm'),
      !isGroup ? partner?.avatar?.url : selectedConversation?.data.avatar?.url,
      isCallBlockedByPartner, isCallBlockedByMe
    );
    if (result && !result.success) {
      const messages: Record<string, string> = {
        busy: 'Người dùng này hiện đang bận.',
        blocked: 'Không thể thực hiện cuộc gọi với người dùng này.',
        not_friend: 'Chỉ có thể gọi cho bạn bè.',
        already_in_call: 'Bạn đang trong một cuộc gọi khác.',
      };
      toast.error(messages[result.reason ?? ''] ?? 'Không thể thực hiện cuộc gọi.');
    }
  };

  if (!currentUser) return <MessengerSkeleton />;

  const handleSendFriendRequest = async (userId: string) => {
    await friendService.sendFriendRequest(currentUser.id, userId);
  };

  const handleAcceptFriendRequest = async (userId: string) => {
    const request = receivedRequests.find(r => r.senderId === userId);
    if (request) await friendService.acceptFriendRequest(request.id, request.senderId, currentUser.id);
  };

  const handleDeclineFriendRequest = async (userId: string) => {
    const request = receivedRequests.find(r => r.senderId === userId);
    if (request) await friendService.rejectFriendRequest(request.id);
  };

  const handleCancelFriendRequest = async (userId: string) => {
    const request = sentRequests.find(r => r.receiverId === userId);
    if (request) await friendService.cancelFriendRequest(request.id);
  };

  const handleBackToList = () => {
    handleSelectConversation(null);
    navigate('/', { replace: true });
  };


  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* ── Conversation list panel ── */}
      <div className={`${selectedConversationId ? 'hidden md:flex' : 'flex'} md:w-[300px] lg:w-[360px] flex-shrink-0 w-full`}>
        <ConversationList
          conversations={filteredConversations}
          selectedId={selectedConversationId}
          currentUserId={currentUser.id}
          currentUserFriendIds={friendIds}
          isLoading={isLoading}
          isSearching={isSearching}
          viewMode={viewMode}
          archivedCount={archivedCount}
          onViewModeChange={setViewMode}
          onBlock={openBlockModal}
          isSearchFocused={isSearchFocused}
          onSearchFocus={setSearchFocused}
          searchResults={searchResults}
          searchHistory={searchHistory}
          onRemoveFromHistory={removeFromSearchHistory}
          onClearHistory={clearSearchHistory}
          onSelectUser={handleSelectUserFromSearch}
          onSelectConversation={(id) => {
            const conv = conversations.find(c => c.id === id);
            if (conv) addToSearchHistory(conv);
            handleSelectConversation(id);
            setSearchFocused(false);
          }}
          onSearch={handleSearch}
          onPin={handlePin}
          onMute={handleMute}
          onArchive={handleArchive}
          onMarkUnread={handleMarkUnread}
          onDelete={handleDelete}
          onMarkAllRead={handleMarkAllRead}
          onNewGroup={() => setShowCreateGroup(true)}
        />
      </div>

      {/* ── Chat area ── */}
      <div className={`flex-1 flex flex-col min-w-0 ${selectedConversationId ? 'flex' : 'hidden md:flex'}`}>
        {selectedConversation ? (
          <>
            <ChatBox
              conversation={selectedConversation}
              messages={currentMessages}
              participants={participants}
              currentUserId={currentUser.id}
              currentUserFriendIds={friendIds}
              friendRequestStatus={friendRequestStatus}
              usersMap={usersMap}
              typingUsers={currentTypingUsers}
              onBack={handleBackToList}
              onInfoClick={() => setShowDetails(true)}
              onRecall={handleRecallMessage}
              onDeleteForMe={handleDeleteForMe}
              onForward={handleForwardMessage}
              onReply={(msg) => { setReplyingTo(msg); setEditingMessage(null); }}
              onEdit={(msg) => { setEditingMessage(msg); setReplyingTo(null); }}
              onAddFriend={handleSendFriendRequest}
              onAcceptFriend={handleAcceptFriendRequest}
              onDeclineFriend={handleDeclineFriendRequest}
              onCancelFriend={handleCancelFriendRequest}
              onBlock={openBlockModal}
              isLoading={isLoading}
              isLoadingMore={isLoadingMore}
              hasMoreMessages={hasMoreMessages}
              onLoadMore={handleLoadMoreMessages}
              isBlocked={isBlocked}
              isBlockedByMe={isBlockedByMe}
              partnerStatus={partnerStatus}
              myBlockOptions={myBlockOptions}
              onUnblock={handleUnblock}
              onManageBlock={openBlockModal}
              shouldShowBlockBanner={shouldShowBlockBanner}
              onCall={(isVideo) => handleInitiateCall(isVideo ? 'video' : 'voice')}
              onVideoCall={() => handleInitiateCall('video')}
              canCall={canCall}
              onJoinCall={(callType) => joinActiveCall(selectedConversation.id, callType)}
              handleMarkAsRead={handleMarkAsRead}
            />
            <ChatInput
              key={selectedConversationId}
              onSendText={handleSendText}
              onSendImages={handleSendImage}
              onSendFile={handleSendFile}
              onSendVideo={handleSendVideo}
              onSendVoice={handleSendVoice}
              onSendGif={handleSendGif}
              onTyping={handleTyping}
              blockedMessage={blockedMessage}
              onManageBlock={openBlockModal}
              isBlockedByMe={isBlockedByMe}
              replyingTo={replyingTo}
              editingMessage={editingMessage}
              currentUserId={currentUser.id}
              usersMap={usersMap}
              participants={participants}
              isGroup={selectedConversation.data.isGroup}
              isDisbanded={selectedConversation.data.isDisbanded}
              onDeleteConversation={() => handleDelete(selectedConversation.id)}
              onCancelAction={() => { setReplyingTo(null); setEditingMessage(null); }}
              onEditMessage={editingMessage ? (text) => handleEditMessage(editingMessage.id, text) : undefined}
              conversationId={selectedConversationId}
              isLoadingSettings={isLoadingSettings}
            />
          </>
        ) : (
          /* ── Empty state ── */
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="relative mb-6">
              <div className="absolute inset-0 rounded-full bg-primary/10 blur-xl" />
              <div className="relative w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center border border-primary/20">
                <MessageSquare size={40} className="text-primary" />
              </div>
            </div>
            <h2 className="text-xl font-bold text-text-primary mb-2">Tin nhắn của bạn</h2>
            <p className="text-sm text-text-secondary max-w-xs leading-relaxed">
              Chọn một cuộc trò chuyện để bắt đầu nhắn tin với bạn bè ngay bây giờ!
            </p>
          </div>
        )}
      </div>

      {/* ── Details panel ── */}
      {selectedConversation && (
        <ChatDetailsPanel
          conversation={selectedConversation}
          messages={currentMessages}
          currentUserId={currentUser.id}
          usersMap={usersMap}
          isOpen={showDetails}
          isBlocked={isBlocked}
          onClose={() => setShowDetails(false)}
          onToggleMute={() => handleMute(selectedConversation.id, !(selectedMemberSettings?.isMuted || false))}
          onTogglePin={() => handlePin(selectedConversation.id, !(selectedMemberSettings?.isPinned || false))}
          onToggleArchive={() => handleArchive(selectedConversation.id, !(selectedMemberSettings?.isArchived || false))}
          onToggleMarkUnread={() => handleMarkUnread(selectedConversation.id, false)}
          onToggleBlock={openBlockModal}
          onDelete={() => {
            if (selectedConversation.data.isGroup && selectedConversation.data.creatorId === currentUser.id) {
              handleDisbandGroup();
            } else {
              handleDelete(selectedConversation.id);
            }
          }}
          onLeaveGroup={() => {
            const result = handleLeaveGroup();
            if (result && 'then' in result) {
              (result as Promise<{ needAssignAdmin: boolean }>).then((res) => {
                if (res?.needAssignAdmin) setShowAssignAdmin(true);
              });
            }
          }}
          onEditGroup={() => setShowEditGroup(true)}
          onAddMember={() => setShowAddMember(true)}
          onRemoveMember={handleRemoveMember}
          onPromoteToAdmin={handlePromoteToAdmin}
          onDemoteFromAdmin={handleDemoteFromAdmin}
          onApproveMembers={handleApproveMembers}
          onRejectMembers={handleRejectMembers}
          onToggleApprovalMode={handleToggleApprovalMode}
          onTransferCreator={() => setShowTransferCreator(true)}
          onCopyInviteLink={handleCopyInviteLink}
          onResetInviteLink={handleResetInviteLink}
          onMemberClick={(userId) => navigate(`/profile/${userId}`)}
          onMessageClick={(messageId) => scrollToMessage(messageId)}
        />
      )}

      <CreateGroupModal
        isOpen={showCreateGroup}
        currentUserId={currentUser.id}
        onClose={() => setShowCreateGroup(false)}
        onCreateGroup={handleCreateGroup}
      />

      {selectedConversation && (
        <AddMemberModal
          isOpen={showAddMember}
          conversation={selectedConversation}
          currentUserId={currentUser.id}
          onClose={() => setShowAddMember(false)}
          onAddMembers={handleInviteMembers}
        />
      )}

      {selectedConversation?.data.isGroup && (
        <EditGroupModal
          isOpen={showEditGroup}
          conversation={selectedConversation}
          currentUserId={currentUser.id}
          onClose={() => setShowEditGroup(false)}
          onSave={handleEditGroup}
        />
      )}

      {selectedConversation?.data.isGroup && (
        <TransferAdminModal
          isOpen={showAssignAdmin}
          mode="transfer_and_leave"
          conversation={selectedConversation}
          currentUserId={currentUser.id}
          onClose={() => setShowAssignAdmin(false)}
          onConfirm={handleAssignAdminAndLeave}
        />
      )}

      {selectedConversation?.data.isGroup && (
        <TransferAdminModal
          isOpen={showTransferCreator}
          mode="transfer_only"
          conversation={selectedConversation}
          currentUserId={currentUser.id}
          onClose={() => setShowTransferCreator(false)}
          onConfirm={handleTransferCreator}
        />
      )}

      <ForwardModal
        isOpen={!!forwardingMessage}
        onClose={() => setForwardingMessage(null)}
        message={forwardingMessage}
        currentUserId={currentUser.id}
      />



      {(partner || blockTarget) && (
        <BlockOptionsModal
          isOpen={isBlockModalOpen}
          targetName={blockTarget?.name ?? partner?.fullName ?? ''}
          initialOptions={blockTarget ? useAuthStore.getState().blockedUsers[blockTarget.id] : myBlockOptions}
          onApply={async (opts) => { await handleApplyBlock(opts, blockTarget?.id); closeBlockModal(); }}
          onUnblock={confirmUnblock}
          onClose={closeBlockModal}
        />
      )}

    </div>
  );
};

export default ChatPage;
