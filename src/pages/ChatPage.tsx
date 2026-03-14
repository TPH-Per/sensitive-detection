import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { BlockOptionsModal } from '../components/ui';
import { useChat } from '../hooks';
import { useLoadingStore } from '../store/loadingStore';
import { useContactStore } from '../store/contactStore';
import { useFriendIds } from '../hooks';
import { useBlockedUsers } from '../hooks';
import { friendService } from '../services/friendService';
import { useRtdbChatStore } from '../store';
import { useConversationMemberSettings } from '../hooks/chat/useConversationMemberSettings';
import {
  ConversationList, ChatBox, ChatInput, ChatDetailsPanel,
  CreateGroupModal, AddMemberModal, EditGroupModal,
  TransferAdminModal, ForwardModal, MessengerSkeleton
} from '../components/chat';
import { OutgoingCallDialog } from '../components/chat/call/OutgoingCallDialog';
import { useCallStore } from '../store/callStore';
import { useCallSounds } from '../hooks/chat/useCallSounds';
import { scrollToMessage } from '../utils';

const ChatPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    currentUser,
    conversations,
    filteredConversations,
    selectedConversationId,
    selectedConversation,
    currentMessages,
    currentTypingUsers,
    isLoading,
    viewMode,
    setViewMode,
    isSearchFocused,
    setSearchFocused,
    searchResults,
    searchHistory,
    archivedCount,
    usersMap,
    isBlocked,
    isBlockedByMe,
    isCallBlockedByMe,
    isCallBlockedByPartner,
    blockedMessage,
    forwardingMessage,
    setForwardingMessage,
    replyingTo,
    setReplyingTo,
    editingMessage,
    setEditingMessage,

    handleSelectConversation,
    handleSendText,
    handleSendCall,
    handleEditMessage,
    handleRecallMessage,
    handleDeleteForMe,
    handleForwardMessage,
    handleSendImage,
    handleSendFile,
    handleSendVideo,
    handleSendVoice,
    handleTyping,
    handleSearch,
    handlePin,
    handleMute,
    handleArchive,
    handleMarkUnread,
    handleDelete,
    handleMarkAllRead,
    handleApplyBlock,
    handleUnblock,
    myBlockOptions,
    handleCreateGroup,
    handleAddMembers,
    handleRemoveMember,
    handleLeaveGroup,
    handleAssignAdminAndLeave,
    handlePromoteToAdmin,
    handleDemoteFromAdmin,
    handleEditGroup,
    handleDisbandGroup,
    addToSearchHistory,
    removeFromSearchHistory,
    clearSearchHistory,
    getOrCreateConversation,
    setIsChatVisible,
    isLoadingMore,
    hasMoreMessages,
    handleLoadMoreMessages,
    friendRequestStatus,
    currentReceivedRequest,
    receivedRequests,
    participants,
  } = useChat();
  const isSearching = useLoadingStore(state => state.loadingStates['contacts.search']);
  const friendIds = useFriendIds();
  const { blockedUserIds } = useBlockedUsers();

  // Get member settings for selected conversation
  const selectedMemberSettings = useConversationMemberSettings(
    selectedConversationId || '',
    currentUser?.id || ''
  );

  React.useEffect(() => {
    setIsChatVisible(true);
    return () => setIsChatVisible(false);
  }, [setIsChatVisible]);

  const [showDetails, setShowDetails] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showEditGroup, setShowEditGroup] = useState(false);
  const [showAssignAdmin, setShowAssignAdmin] = useState(false);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);

  const openBlockModal = () => setIsBlockModalOpen(true);
  const closeBlockModal = () => setIsBlockModalOpen(false);

  const {
    callPhase,
    callType,
    activeRoomId,
    otherUserIds,
    isGroupCall,
    isCaller,
    callStartTime,
    setCallPhase,
    setCallType,
    setActiveRoomId,
    setOtherUserIds,
    setIsGroupCall,
    setIsCaller,
    setCallStartTime,
    setCallConversationId,
    resetCall,
    startCall,
    endCall,
  } = useCallStore();

  const partner = selectedConversation?.data.isGroup
    ? null
    : participants.find(p => p.id !== currentUser.id);

  const { playSound } = useCallSounds();

  const handleInitiateCall = async (type: 'voice' | 'video') => {
    if (!selectedConversationId) return;

    setCallType(type);
    setActiveRoomId(selectedConversationId);
    setCallConversationId(selectedConversationId);

    const isGroup = selectedConversation?.data.isGroup || false;
    setIsGroupCall(isGroup);

    if (isGroup) {
      const groupMembersIds = Object.keys(selectedConversation?.data.members || {}).filter(id => id !== currentUser.id);
      if (groupMembersIds.length === 0) return;
      if (startCall) {
        setIsCaller(true);
        setOtherUserIds(groupMembersIds);
        setCallPhase('in-call');
        setCallStartTime(Date.now());
        await startCall(
          groupMembersIds,
          currentUser.id,
          currentUser.fullName,
          currentUser.avatar.url,
          type,
          selectedConversationId,
          true
        );
      }
    } else {
      if (!partner || !startCall) return;

      if (isCallBlockedByMe) {
        import('../store/toastStore').then(({ toast }) => toast.error('Bạn đã chặn cuộc gọi với người dùng này.'));
        return;
      }
      if (isCallBlockedByPartner) {
        import('../store/toastStore').then(({ toast }) => toast.error('Không thể thực hiện cuộc gọi cho người dùng này.'));
        return;
      }

      setIsCaller(true);
      setOtherUserIds([partner.id]);
      setCallPhase('outgoing');
      const result = await startCall(
        [partner.id],
        currentUser.id,
        currentUser.fullName,
        currentUser.avatar.url,
        type,
        selectedConversationId,
        false
      );

      if (result && !result.success) {
        if (result.reason === 'busy') {
          playSound('busy');
          resetCall();
        }
      }
    }
  };

  const handleCancelOutgoingCall = async () => {
    if (endCall) await endCall(otherUserIds);
    resetCall();
  };

  const handleMissedCallTimeout = async () => {
    if (endCall) await endCall(otherUserIds);
    playSound('busy');
    resetCall();
  };

  const handleEndCall = async () => {
    if (endCall) {
      if (!isGroupCall) {
        await endCall(otherUserIds);
      } else {
        await endCall([]);
      }
    }
    resetCall();
  };

  if (!currentUser) {
    return <MessengerSkeleton />;
  }

  const handleSendFriendRequest = async (userId: string) => {
    try {
      await friendService.sendFriendRequest(currentUser.id, userId);
    } catch (error) {
      console.error('Lỗi gửi lời mời kết bạn:', error);
    }
  };

  const handleAcceptFriendRequest = async (userId: string) => {
    const request = receivedRequests.find(r => r.senderId === userId);
    if (request) {
      try {
        await friendService.acceptFriendRequest(request.id, request.senderId, currentUser.id);
      } catch (error) {
        console.error('Lỗi chấp nhận kết bạn:', error);
      }
    }
  };

  const handleBackToList = () => {
    handleSelectConversation(null);
  };

  return (
    <div className="flex h-full w-full">
      {/* Sidebar danh sách hội thoại */}
      <div className={`${selectedConversationId ? 'hidden md:flex' : 'flex'} md:w-[300px] lg:w-[360px] flex-shrink-0 w-full`}>
        <ConversationList
          conversations={filteredConversations}
          selectedId={selectedConversationId}
          currentUserId={currentUser.id}
          currentUserFriendIds={friendIds}
          blockedUserIds={blockedUserIds}
          isLoading={isLoading}
          isSearching={isSearching}
          viewMode={viewMode}
          archivedCount={archivedCount}
          onViewModeChange={setViewMode}
          onBlock={openBlockModal}
          isSearchFocused={isSearchFocused}
          onSearchFocus={setSearchFocused}
          searchResults={{ conversations: [], users: searchResults.users }}
          searchHistory={searchHistory}
          onRemoveFromHistory={removeFromSearchHistory}
          onClearHistory={clearSearchHistory}
          onSelectUser={async (user) => {
            addToSearchHistory(user);
            const convId = await getOrCreateConversation(currentUser.id, user.id);
            handleSelectConversation(convId);
            setSearchFocused(false);
          }}
          onSelectConversation={(id) => {
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

      {/* Nội dung khung chat */}
      <div className={`flex-1 flex flex-col ${selectedConversationId ? 'flex' : 'hidden md:flex'}`}>
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
              onForward={(msg) => handleForwardMessage(msg)}
              onReply={(msg) => {
                setReplyingTo(msg);
                setEditingMessage(null);
              }}
              onEdit={(msg) => {
                setEditingMessage(msg);
                setReplyingTo(null);
              }}
              onAddFriend={handleSendFriendRequest}
              onAcceptFriend={handleAcceptFriendRequest}
              onBlock={openBlockModal}
              isLoading={isLoading}
              isLoadingMore={isLoadingMore}
              hasMoreMessages={hasMoreMessages}
              onLoadMore={handleLoadMoreMessages}
              isBlocked={isBlocked}
              isBlockedByMe={isBlockedByMe}
              onUnblock={handleUnblock}
              onCall={(isVideo) => handleInitiateCall(isVideo ? 'video' : 'voice')}
              onVideoCall={() => handleInitiateCall('video')}
            />
            <ChatInput
              key={selectedConversationId}
              onSendText={handleSendText}
              onSendImage={handleSendImage}
              onSendFile={handleSendFile}
              onSendVideo={handleSendVideo}
              onSendVoice={handleSendVoice}
              onTyping={handleTyping}
              blockedMessage={blockedMessage}
              replyingTo={replyingTo}
              editingMessage={editingMessage}
              currentUserId={currentUser.id}
              usersMap={usersMap}
              participants={participants}
              isGroup={selectedConversation.data.isGroup}
              onCancelAction={() => {
                setReplyingTo(null);
                setEditingMessage(null);
              }}
              onEditMessage={editingMessage ? (text) => handleEditMessage(editingMessage.id, text) : undefined}
            />
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-bg-secondary p-4 text-center">
            <div className="w-24 h-24 md:w-32 md:h-32 bg-primary/10 rounded-full flex items-center justify-center animate-fade-in">
              <MessageSquare className="w-12 h-12 md:w-16 md:h-16 text-primary" />
            </div>
            <h2 className="text-xl md:text-2xl font-bold text-text-primary mb-2">
              Tin nhắn của bạn
            </h2>
            <p className="text-text-secondary text-center max-w-sm text-sm md:text-base leading-relaxed">
              Chọn một cuộc trò chuyện để bắt đầu nhắn tin với bạn bè ngay bây giờ!
            </p>
          </div>
        )}
      </div>

      {/* Thông tin chi tiết hội thoại */}
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
          onMemberClick={(userId) => navigate(`/profile/${userId}`)}
          onMessageClick={(messageId) => scrollToMessage(messageId)}
        />
      )}

      {/* Quản lý nhóm và chuyển tiếp tin nhắn */}
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
          onAddMembers={handleAddMembers}
        />
      )}

      {selectedConversation && selectedConversation.data.isGroup && (
        <EditGroupModal
          isOpen={showEditGroup}
          conversation={selectedConversation}
          currentUserId={currentUser.id}
          onClose={() => setShowEditGroup(false)}
          onSave={handleEditGroup}
        />
      )}

      {selectedConversation && selectedConversation.data.isGroup && (
        <TransferAdminModal
          isOpen={showAssignAdmin}
          conversation={selectedConversation}
          currentUserId={currentUser.id}
          onClose={() => setShowAssignAdmin(false)}
          onConfirm={handleAssignAdminAndLeave}
        />
      )}

      <ForwardModal
        isOpen={!!forwardingMessage}
        onClose={() => setForwardingMessage(null)}
        message={forwardingMessage}
        currentUserId={currentUser.id}
        conversations={conversations}
        usersMap={usersMap}
      />

      {/* Cuộc gọi đi – chờ đối phương bắt máy */}
      {callPhase === 'outgoing' && partner && (
        <OutgoingCallDialog
          calleeName={partner.fullName || 'Người dùng'}
          calleeId={partner.id}
          callType={callType}
          onCancel={handleCancelOutgoingCall}
          onTimeout={handleMissedCallTimeout}
        />
      )}
      {/* Block options modal */}
      {partner && (
        <BlockOptionsModal
          isOpen={isBlockModalOpen}
          targetName={partner.fullName}
          initialOptions={myBlockOptions}
          onApply={handleApplyBlock}
          onClose={closeBlockModal}
        />
      )}
    </div>
  );
};

export default ChatPage;
