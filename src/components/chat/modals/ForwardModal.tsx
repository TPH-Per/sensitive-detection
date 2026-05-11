import React, { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { Modal, Input, Button } from '../../ui';
import { RtdbMessage } from '../../../../shared/types';
import { useRtdbChatStore } from '../../../store';
import { useShareTargets } from '../../../hooks/chat';
import { ShareTargetItem } from './ShareTargetItem';

interface ForwardModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: { id: string; data: RtdbMessage } | null;
  currentUserId: string;
}

export const ForwardModal: React.FC<ForwardModalProps> = ({
  isOpen, onClose, message, currentUserId,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedConversationIds, setSelectedConversationIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const forwardMessage = useRtdbChatStore(state => state.forwardMessage);
  const { filteredItems, usersMap } = useShareTargets(currentUserId, searchTerm, isOpen);

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('');
      setSelectedConversationIds(new Set());
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!message) return null;

  const handleToggleConversation = (conversationId: string) => {
    setSelectedConversationIds(prev => {
      const next = new Set(prev);
      if (next.has(conversationId)) {
        next.delete(conversationId);
      } else {
        next.add(conversationId);
      }
      return next;
    });
  };

  const handleForward = async () => {
    if (selectedConversationIds.size === 0 || isSubmitting) return;

    setIsSubmitting(true);
    const targetIds = Array.from(selectedConversationIds);

    try {
      await Promise.allSettled(
        targetIds.map(conversationId => forwardMessage(conversationId, currentUserId, message.data))
      );
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const getMessageTypeLabel = (type: string) => {
    switch (type) {
      case 'image': return 'Hình ảnh';
      case 'video': return 'Video';
      case 'file': return 'Tệp tin';
      case 'voice': return 'Tin nhắn thoại';
      case 'call': return 'Cuộc gọi';
      case 'system': return 'Hệ thống';
      default: return type;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Chuyển tiếp tin nhắn"
      maxWidth="sm"
      footer={
        <div className="flex gap-2 w-full">
          <Button variant="secondary" fullWidth onClick={onClose} disabled={isSubmitting}>
            Hủy
          </Button>
          <Button fullWidth onClick={handleForward} disabled={selectedConversationIds.size === 0 || isSubmitting}>
            {isSubmitting ? 'Đang gửi...' : 'Gửi'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 min-h-0">
        {/* Message preview */}
        <div className="p-3 bg-bg-secondary rounded-xl border border-border-light">
          <p className="text-[10px] text-text-tertiary mb-1 font-bold uppercase tracking-wider">Nội dung chuyển tiếp</p>
          <p className="text-sm text-text-primary line-clamp-2 italic leading-relaxed">
            {message.data.type === 'text' ? message.data.content : `[${getMessageTypeLabel(message.data.type)}]`}
          </p>
        </div>

        {/* Search */}
        <Input
          icon={<Search size={15} />}
          placeholder="Tìm kiếm người dùng hoặc nhóm..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="bg-bg-secondary"
        />

        {/* Conversation list */}
        <div className="overflow-y-auto scroll-hide min-h-0 max-h-72 space-y-1">
          {filteredItems.length > 0 ? (
            filteredItems.map(entry => (
              <ShareTargetItem
                key={entry.id}
                entry={entry}
                currentUserId={currentUserId}
                usersMap={usersMap}
                selected={selectedConversationIds.has(entry.id)}
                onToggle={() => handleToggleConversation(entry.id)}
              />
            ))
          ) : (
            <div className="py-8 text-center text-sm text-text-tertiary">
              Không tìm thấy kết quả phù hợp
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
