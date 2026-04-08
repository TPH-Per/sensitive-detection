import React, { useState, useEffect } from 'react';
import { Search, Send, Check } from 'lucide-react';
import { Modal, Avatar, UserAvatar, Input, Button } from '../../ui';
import { RtdbMessage, RtdbConversation, User, UserStatus, RtdbUserChat } from '../../../../shared/types';
import { useRtdbChatStore } from '../../../store';
import { useAuthStore } from '../../../store/authStore';
import { useConversationParticipants } from '../../../hooks/chat/useConversationParticipants';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../firebase/config';

interface ForwardModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: { id: string; data: RtdbMessage } | null;
  currentUserId: string;
  conversations: Array<{ id: string; data: RtdbConversation; userChat: RtdbUserChat }>;
  usersMap: Record<string, User>;
}

export const ForwardModal: React.FC<ForwardModalProps> = ({
  isOpen, onClose, message, currentUserId, conversations, usersMap,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [blockedByPartners, setBlockedByPartners] = useState<Set<string>>(new Set());
  const forwardMessage = useRtdbChatStore(state => state.forwardMessage);
  const myBlockedUsers = useAuthStore(state => state.blockedUsers);

  useEffect(() => {
    if (!isOpen || !currentUserId) return;
    const directConvs = conversations.filter(c => !c.data.isGroup);
    const blockedSet = new Set<string>();

    Promise.all(
      directConvs.map(async (conv) => {
        const partnerId = Object.keys(conv.data.members).find(id => id !== currentUserId);
        if (!partnerId) return;
        try {
          const snap = await getDoc(doc(db, 'users', partnerId, 'blockedUsers', currentUserId));
          if (snap.exists() && snap.data().blockMessages === true) blockedSet.add(partnerId);
        } catch { /* silent */ }
      })
    ).then(() => setBlockedByPartners(new Set(blockedSet)));
  }, [isOpen, currentUserId, conversations]);

  if (!message) return null;

  const filteredConversations = conversations.filter(conv => {
    const partnerId = Object.keys(conv.data.members).find(id => id !== currentUserId);
    if (!conv.data.isGroup && partnerId) {
      if (myBlockedUsers[partnerId]) return false;
      if (blockedByPartners.has(partnerId)) return false;
      if (usersMap[partnerId]?.status === UserStatus.BANNED) return false;
    }
    const name = conv.data.isGroup
      ? conv.data.name
      : usersMap[partnerId || '']?.fullName || '';
    return name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const handleForward = async (conversationId: string) => {
    try {
      setSendingTo(conversationId);
      await forwardMessage(conversationId, currentUserId, message.data);
      setSentIds(prev => new Set(prev).add(conversationId));
    } catch { /* silent */ }
    finally { setSendingTo(null); }
  };

  const handleClose = () => {
    setSearchTerm('');
    setSentIds(new Set());
    setBlockedByPartners(new Set());
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Chuyển tiếp tin nhắn"
      maxWidth="sm"
      footer={
        <Button onClick={handleClose} fullWidth>Xong</Button>
      }
    >
      <div className="flex flex-col gap-4 min-h-0">
        {/* Search */}
        <Input
          icon={<Search size={15} />}
          placeholder="Tìm kiếm người dùng hoặc nhóm..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="bg-bg-secondary"
        />

        {/* Message preview */}
        <div className="p-3 bg-bg-secondary rounded-xl border border-border-light">
          <p className="text-xs text-text-tertiary mb-1 font-medium">Nội dung chuyển tiếp:</p>
          <p className="text-sm text-text-primary line-clamp-2 italic">
            {message.data.type === 'text' ? message.data.content : `[${message.data.type}]`}
          </p>
        </div>

        {/* Conversation list */}
        <div className="overflow-y-auto scroll-hide min-h-0 max-h-72 space-y-0.5">
          {filteredConversations.length > 0 ? (
            filteredConversations.map(conv => (
              <ConversationForwardItem
                key={conv.id}
                conversation={conv}
                currentUserId={currentUserId}
                usersMap={usersMap}
                hasSent={sentIds.has(conv.id)}
                isSending={sendingTo === conv.id}
                onForward={() => handleForward(conv.id)}
              />
            ))
          ) : (
            <div className="py-8 text-center text-sm text-text-tertiary">
              Không tìm thấy kết quả
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

interface ConversationForwardItemProps {
  conversation: { id: string; data: RtdbConversation; userChat: RtdbUserChat };
  currentUserId: string;
  usersMap: Record<string, User>;
  hasSent: boolean;
  isSending: boolean;
  onForward: () => void;
}

const ConversationForwardItem: React.FC<ConversationForwardItemProps> = ({
  conversation, currentUserId, usersMap, hasSent, isSending, onForward,
}) => {
  const participants = useConversationParticipants(Object.keys(conversation.data.members));
  const partner = participants.find(p => p.id !== currentUserId);

  if (!conversation.data.isGroup && partner?.status === UserStatus.BANNED) return null;

  const name = conversation.data.isGroup
    ? conversation.data.name
    : partner?.fullName || 'Unknown';
  const avatar = conversation.data.isGroup
    ? conversation.data.avatar
    : partner?.avatar;

  return (
    <div className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-bg-hover transition-colors duration-200 group">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <UserAvatar
          userId={conversation.data.isGroup ? '' : partner?.id || ''}
          src={avatar?.url}
          name={name}
          size="sm"
          isGroup={conversation.data.isGroup}
          members={participants}
        />
        <span className="text-sm font-medium text-text-primary truncate">{name}</span>
      </div>

      <button
        onClick={onForward}
        disabled={hasSent || isSending}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 flex-shrink-0
          ${hasSent
            ? 'bg-success/10 text-success cursor-default'
            : 'bg-primary/10 text-primary hover:bg-primary/20 active:brightness-95 opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100'
          }`}
      >
        {isSending ? (
          <span className="w-3 h-3 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
        ) : hasSent ? (
          <Check size={12} />
        ) : (
          <Send size={12} />
        )}
        {hasSent ? 'Đã gửi' : 'Gửi'}
      </button>
    </div>
  );
};
