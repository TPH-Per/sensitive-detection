import React, { useEffect, useState } from 'react';
import { Search, Play } from 'lucide-react';
import { Modal, Input, Button, UserAvatar } from '../../ui';
import { Post, Visibility } from '../../../../shared/types';
import { useRtdbChatStore } from '../../../store';
import { toast } from '../../../store/toastStore';
import { TOAST_MESSAGES } from '../../../constants/toastMessages';
import { buildSharedPostPayload, getPostSnippet, getPreviewMedia } from '../../../utils/postShareMessage';
import { useShareTargets } from '../../../hooks/chat';
import { ShareTargetItem } from './ShareTargetItem';

interface SharePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  post: Post | null;
  authorName: string;
  currentUserId: string;
}

/** Modal chia sẻ bài viết vào tin nhắn chat */
export const SharePostModal: React.FC<SharePostModalProps> = ({
  isOpen,
  onClose,
  post,
  authorName,
  currentUserId,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedConversationIds, setSelectedConversationIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sendSharedPostMessage = useRtdbChatStore(state => state.sendSharedPostMessage);
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

  const isPrivatePost = post?.visibility === Visibility.PRIVATE;
  const canSubmit = selectedConversationIds.size > 0 && !!post && !isPrivatePost && !isSubmitting;

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

  const handleSubmit = async () => {
    if (!post || !canSubmit) return;

    const payload = buildSharedPostPayload(post, authorName);
    const targetIds = Array.from(selectedConversationIds);
    setIsSubmitting(true);

    try {
      const results = await Promise.allSettled(
        targetIds.map(conversationId => sendSharedPostMessage(conversationId, currentUserId, payload))
      );

      const hasSuccess = results.some(result => result.status === 'fulfilled');
      if (hasSuccess) {
        setSelectedConversationIds(new Set());
        onClose();
      } else {
        toast.error(TOAST_MESSAGES.CHAT.SHARE_POST_FAILED);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Chia sẻ vào tin nhắn"
      maxWidth="sm"
      footer={
        <div className="flex gap-2 w-full">
          <Button variant="secondary" fullWidth onClick={onClose} disabled={isSubmitting}>
            Hủy
          </Button>
          <Button fullWidth onClick={handleSubmit} disabled={!canSubmit}>
            {isSubmitting ? 'Đang gửi...' : `Gửi (${selectedConversationIds.size})`}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6 min-h-0 px-1 py-1">
        {isPrivatePost ? (
          <div className="rounded-2xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning font-medium">
            Bài viết riêng tư không thể chia sẻ.
          </div>
        ) : (
          <div className="flex bg-bg-secondary/50 rounded-2xl border border-border-light/50 overflow-hidden backdrop-blur-sm">
            {/* Media Preview */}
            {(() => {
              const media = post ? getPreviewMedia(post) : {};
              if (!media.url) return null;
              return (
                <div className="relative w-24 h-24 shrink-0 bg-bg-tertiary overflow-hidden border-r border-border-light/50">
                  <img 
                    src={media.url} 
                    alt="" 
                    className="w-full h-full object-cover" 
                  />
                  {media.type === 'video' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <div className="w-8 h-8 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm border border-white/20">
                        <Play size={12} fill="white" className="text-white ml-0.5" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Content Info */}
            <div className="p-4 min-w-0 flex-1 flex flex-col justify-center">
              <div className="flex items-center gap-2 mb-2">
                <UserAvatar 
                  userId={post?.authorId || ''} 
                  name={authorName} 
                  size="2xs" 
                  showStatus={false}
                  className="ring-1 ring-border-light"
                />
                <span className="text-xs font-black text-text-primary truncate">{authorName}</span>
              </div>
              <p className="text-[11px] text-text-secondary line-clamp-2 leading-relaxed break-all italic font-medium">
                {post ? getPostSnippet(post) : ''}
              </p>
            </div>
          </div>
        )}

        {/* Search Input */}
        <div className="relative group">
          <Input
            icon={<Search size={16} className="text-text-tertiary group-focus-within:text-primary transition-colors" />}
            placeholder="Tìm kiếm người dùng hoặc nhóm..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
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
