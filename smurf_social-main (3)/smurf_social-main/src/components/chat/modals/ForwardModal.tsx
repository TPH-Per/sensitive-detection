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

/** Modal chuyển tiếp tin nhắn */
export const ForwardModal: React.FC<ForwardModalProps> = ({
  isOpen, onClose, message, currentUserId,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedConversationIds, setSelectedConversationIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const forwardMessage = useRtdbChatStore(state => state.forwardMessage);
  const { 
    filteredItems, 
    recentItems, 
    friendItems, 
    usersMap 
  } = useShareTargets(currentUserId, searchTerm, isOpen);

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
      setSelectedConversationIds(new Set());
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
            {isSubmitting ? 'Đang gửi...' : `Gửi (${selectedConversationIds.size})`}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6 min-h-0 px-1 py-1">
        {/* Message Preview */}
        <div className="p-4 bg-bg-secondary/50 rounded-2xl border border-border-light/50 backdrop-blur-sm">
          <p className="text-[10px] text-text-tertiary mb-1.5 font-black uppercase tracking-widest opacity-70">Nội dung chuyển tiếp</p>
          <p className="text-sm text-text-primary line-clamp-2 italic leading-relaxed font-medium">
            {message.data.type === 'text' ? message.data.content : `[${getMessageTypeLabel(message.data.type)}]`}
          </p>
        </div>

        {/* Search Input */}
        <div className="relative group">
          <Input
            icon={<Search size={16} className="text-text-tertiary group-focus-within:text-primary transition-colors" />}
            placeholder="Tìm kiếm người dùng hoặc nhóm..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-bg-secondary/50 border-border-light/50 focus:border-primary/50 transition-all rounded-2xl"
          />
        </div>

        {/* Content Area */}
        <div className="flex flex-col min-h-0 max-h-[420px]">
          {!searchTerm ? (
            <div className="flex flex-col gap-5 overflow-y-auto scroll-hide pr-1">
              {recentItems.length > 0 && (
                <div className="flex flex-col gap-2.5">
                  <span className="text-[10px] font-black text-text-tertiary uppercase tracking-widest opacity-80 px-1">
                    Trò chuyện gần đây
                  </span>
                  <div className="flex overflow-x-auto gap-3 pb-1 px-1 scroll-hide">
                    {recentItems.map(entry => (
                      <ShareTargetItem
                        key={entry.id}
                        entry={entry}
                        variant="horizontal"
                        currentUserId={currentUserId}
                        usersMap={usersMap}
                        selected={selectedConversationIds.has(entry.id)}
                        onToggle={() => handleToggleConversation(entry.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-2.5">
                <span className="text-[10px] font-black text-text-tertiary uppercase tracking-widest opacity-80 px-1">
                  Danh sách bạn bè
                </span>
                <div className="space-y-1">
                  {friendItems.length > 0 ? (
                    friendItems.map(entry => (
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
                    <div className="py-6 text-center text-xs text-text-tertiary font-medium bg-bg-secondary/30 rounded-xl border border-dashed border-border-light/50">
                      Chưa có bạn bè trong danh sách
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Search Results */
            <div className="flex flex-col gap-3.5 overflow-y-auto scroll-hide min-h-0">
               <span className="text-[10px] font-black text-text-tertiary uppercase tracking-widest opacity-80 px-1">
                  Kết quả tìm kiếm
                </span>
              <div className="space-y-1.5">
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
                  <div className="py-12 text-center text-sm text-text-tertiary font-medium">
                    Không tìm thấy người dùng phù hợp
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
