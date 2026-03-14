import React, { useState } from 'react';
import { Search, Send } from 'lucide-react';
import { Modal, Avatar, UserAvatar, Input, Button } from '../../ui';
import { RtdbMessage, RtdbConversation, User, RtdbUserChat } from '../../../../shared/types';
import { useRtdbChatStore } from '../../../store';
import { useConversationParticipants } from '../../../hooks/chat/useConversationParticipants';

interface ForwardModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: { id: string; data: RtdbMessage } | null;
  currentUserId: string;
  conversations: Array<{ id: string; data: RtdbConversation; userChat: RtdbUserChat }>;
  usersMap: Record<string, User>;
}

export const ForwardModal: React.FC<ForwardModalProps> = ({
  isOpen,
  onClose,
  message,
  currentUserId,
  conversations,
  usersMap
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const forwardMessage = useRtdbChatStore(state => state.forwardMessage);

  if (!message) return null;

  const filteredConversations = conversations.filter(conv => {
    const participantIds = Object.keys(conv.data.members);
    const name = conv.data.isGroup
      ? conv.data.name
      : usersMap[participantIds.find(id => id !== currentUserId) || '']?.fullName || '';
    return name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const handleForward = async (conversationId: string) => {
    try {
      setSendingTo(conversationId);
      await forwardMessage(conversationId, currentUserId, message.data);
      setSentIds(prev => new Set(prev).add(conversationId));
    } catch (error) {
      console.error("Lỗi khi chuyển tiếp:", error);
    } finally {
      setSendingTo(null);
    }
  };

  const handleClose = () => {
    setSearchTerm('');
    setSentIds(new Set());
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Chuyển tiếp tin nhắn"
      maxWidth="sm"
      footer={
        <Button onClick={handleClose} variant="primary" className="w-full">
          Xong
        </Button>
      }
    >
      <div className="flex flex-col min-h-0">
        {/* Search */}
        <div className="flex-none relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" size={18} />
          <Input
            placeholder="Tìm kiếm người dùng hoặc nhóm..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-bg-secondary"
          />
        </div>

        {/* Message Preview */}
        <div className="flex-none p-3 bg-bg-secondary rounded-lg border border-border-light mb-4">
          <p className="text-xs text-text-tertiary mb-1 font-medium">Nội dung chuyển tiếp:</p>
          <p className="text-sm text-text-primary line-clamp-2 italic">
            {message.data.type === 'text' ? message.data.content : `[${message.data.type}]`}
          </p>
        </div>

        {/* List */}
        <div className="overflow-y-auto space-y-1 pr-2 -mr-2 custom-scrollbar min-h-0">
          {filteredConversations.length > 0 ? (
            filteredConversations.map((conv) => {
              return <ConversationForwardItem
                key={conv.id}
                conversation={conv}
                currentUserId={currentUserId}
                usersMap={usersMap}
                hasSent={sentIds.has(conv.id)}
                isSending={sendingTo === conv.id}
                onForward={() => handleForward(conv.id)}
              />;
            })
          ) : (
            <div className="py-8 text-center text-text-tertiary text-sm">
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
  conversation,
  currentUserId,
  usersMap,
  hasSent,
  isSending,
  onForward
}) => {
  const participants = useConversationParticipants(Object.keys(conversation.data.members));
  const partner = participants.find(p => p.id !== currentUserId);
  const name = conversation.data.isGroup ? conversation.data.name : partner?.fullName || 'Unknown';
  const avatar = conversation.data.isGroup ? conversation.data.avatar : partner?.avatar;

  return (
    <div className="flex items-center justify-between p-2 hover:bg-bg-hover active:bg-bg-active rounded-xl transition-all duration-base group">
      <div className="flex items-center gap-3 min-w-0">
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
      <Button
        size="sm"
        variant={hasSent ? "secondary" : "ghost"}
        isLoading={isSending}
        disabled={hasSent}
        onClick={onForward}
        icon={!hasSent && <Send size={14} className="text-primary" />}
        className={hasSent ? "" : "opacity-0 group-hover:opacity-100 transition-all duration-base"}
      >
        {hasSent ? 'Đã gửi' : 'Gửi'}
      </Button>
    </div>
  );
};
