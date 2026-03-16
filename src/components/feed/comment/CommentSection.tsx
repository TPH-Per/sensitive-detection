import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { X } from 'lucide-react';
import { Button, ConfirmDialog, UploadProgress } from '../../ui';
import { CONFIRM_MESSAGES } from '../../../constants';
import { toast } from '../../../store/toastStore';
import { Comment, User, ReportType, MediaObject } from '../../../../shared/types';
import { postService } from '../../../services/postService';
import { useCommentStore } from '../../../store/commentStore';
import { useUserCache } from '../../../store/userCacheStore';
import { useReportStore } from '../../../store/reportStore';
import { useFriendIds, useBlockedUsers } from '../../../hooks';
import { CommentSkeleton } from './CommentSkeleton';
import { CommentInput } from './CommentInput';
import { CommentItem } from './CommentItem';

interface CommentSectionProps {
  postId: string;
  currentUser: User;
  header?: React.ReactNode;
  className?: string;
  variant?: 'default' | 'cinema';
  autoFocus?: boolean;
  onProfileClick?: () => void;
  postOwnerId?: string;
  totalCommentCount?: number;
}

export const CommentSection: React.FC<CommentSectionProps> = ({
  postId,
  currentUser,
  header,
  className = '',
  variant = 'default',
  autoFocus = false,
  onProfileClick,
  postOwnerId,
  totalCommentCount = 0
}) => {
  const {
    rootComments,
    replies,
    hasMoreRoot,
    hasMoreReply,
    isLoadingPost,
    fetchRootComments,
    fetchReplies,
    subscribeToComments,
    subscribeToReplies,
    createComment,
    updateComment,
    deleteComment
  } = useCommentStore();

  const { users, fetchUsers } = useUserCache();
  const { openReportModal } = useReportStore();
  const friendIds = useFriendIds();
  const { blockedUserIds } = useBlockedUsers();

  const [isLoadingReplyMap, setIsLoadingReplyMap] = useState<Record<string, boolean>>({});
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const [activeInputId, setActiveInputId] = useState<string | 'root'>('root');
  const [inputMode, setInputMode] = useState<'comment' | 'reply' | 'edit'>('comment');

  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [editingComment, setEditingComment] = useState<Comment | null>(null);
  const [commentToDelete, setCommentToDelete] = useState<Comment | null>(null);

  const replySubscriptionsRef = useRef<Record<string, () => void>>({});
  const commentRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const currentRootComments = rootComments[postId] || [];
  const currentHasMoreRoot = hasMoreRoot[postId] ?? false;
  const isLoading = isLoadingPost(postId);

  const filteredRootComments = useMemo(() =>
    currentRootComments.filter(c =>
      c.authorId === currentUser.id ||
      c.authorId === postOwnerId ||
      friendIds.includes(c.authorId)
    ), [currentRootComments, currentUser.id, friendIds, postOwnerId]
  );

  // Cuộn tới ô nhập liệu khi active
  useEffect(() => {
    if (activeInputId && activeInputId !== 'root' && commentRefs.current[activeInputId]) {
      setTimeout(() => {
        commentRefs.current[activeInputId]?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest'
        });
      }, 100);
    }
  }, [activeInputId]);

  // Reset input khi đổi bài viết
  useEffect(() => {
    resetInput();
    return () => {
      Object.values(replySubscriptionsRef.current).forEach(unsub => {
        if (typeof unsub === 'function') unsub();
      });
      replySubscriptionsRef.current = {};
    };
  }, [postId]);

  useEffect(() => {
    const unsubscribe = subscribeToComments(postId, blockedUserIds);
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [postId, blockedUserIds.join(','), subscribeToComments]);

  useEffect(() => {
    if (currentRootComments.length > 0) {
      const userIds = [...new Set(currentRootComments.map(c => c.authorId))];
      fetchUsers(userIds);
    }
  }, [currentRootComments, fetchUsers]);

  const loadMoreRootComments = async () => {
    await fetchRootComments(postId, blockedUserIds, true);
  };

  const loadReplies = async (parentId: string) => {
    if (isLoadingReplyMap[parentId]) return;

    if (replySubscriptionsRef.current[parentId]) {
      setIsLoadingReplyMap(prev => ({ ...prev, [parentId]: true }));
      try {
        await fetchReplies(postId, parentId, blockedUserIds, true);
      } finally {
        setIsLoadingReplyMap(prev => ({ ...prev, [parentId]: false }));
      }
      return;
    }

    setIsLoadingReplyMap(prev => ({ ...prev, [parentId]: true }));
    try {
      const unsubscribe = subscribeToReplies(postId, parentId, blockedUserIds);
      replySubscriptionsRef.current[parentId] = unsubscribe;
    } finally {
      setIsLoadingReplyMap(prev => ({ ...prev, [parentId]: false }));
    }
  };

  useEffect(() => {
    const postReplies = replies[postId] || {};
    Object.keys(postReplies).forEach(async (parentId) => {
      const parentReplies = postReplies[parentId] || [];
      if (parentReplies.length > 0) {
        const userIds = [...new Set(parentReplies.map(r => r.authorId))];
        if (userIds.length > 0) {
          await fetchUsers(userIds);
        }
      }
    });
  }, [replies, postId, fetchUsers]);

  const handleReplyClick = useCallback((comment: Comment) => {
    setReplyingTo(comment);
    setEditingComment(null);
    setActiveInputId(comment.id);
    setInputMode('reply');
  }, []);

  const handleEditClick = useCallback((comment: Comment) => {
    setEditingComment(comment);
    setReplyingTo(null);
    setActiveInputId(comment.id);
    setInputMode('edit');
  }, []);

  const resetInput = useCallback(() => {
    setReplyingTo(null);
    setEditingComment(null);
    setActiveInputId('root');
    setInputMode('comment');
  }, []);

  const handleCommentSubmit = useCallback(async (content: string, image?: MediaObject) => {
    try {
      if (inputMode === 'edit' && editingComment) {
        await updateComment(postId, editingComment.id, content, editingComment.parentId, editingComment.replyToUserId, editingComment.replyToId, image);
      } else {
        const parentId = replyingTo ? (replyingTo.parentId || replyingTo.id) : null;
        const replyToUserId = replyingTo ? replyingTo.authorId : undefined;
        const replyToId = replyingTo ? replyingTo.id : undefined;
        
        await createComment(
          postId,
          currentUser.id,
          content,
          parentId,
          replyToUserId,
          replyToId,
          image
        );
      }
      resetInput();
    } catch (error) {
      throw error;
    }
  }, [inputMode, editingComment, replyingTo, postId, currentUser.id, updateComment, createComment, resetInput]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!commentToDelete) return;
    try {
      await deleteComment(postId, commentToDelete.id, currentUser.id, commentToDelete.parentId);
      setCommentToDelete(null);
    } catch (error) {
      console.error("Lỗi xóa bình luận:", error);
      toast.error("Không thể xóa bình luận này");
    }
  }, [commentToDelete, postId, currentUser.id, deleteComment]);

  const handleUploadMedia = useCallback(async (file: File) => {
    setUploadProgress(0);
    try {
      const onProgress = (p: { progress: number }) => setUploadProgress(p.progress);
      if (file.type.startsWith('image/')) {
        const mediaObject = await postService.uploadCommentImage(file, currentUser.id, onProgress);
        return mediaObject;
      }
      throw new Error('Chỉ hỗ trợ tải ảnh');
    } finally {
      setUploadProgress(null);
    }
  }, [currentUser.id]);

  const hiddenInfo = useMemo(() => {
    if (isLoading && currentRootComments.length === 0) return { root: 0, total: 0 };
    
    const rootHidden = currentRootComments.length - filteredRootComments.length;
    
    let replyHidden = 0;
    const postReplies = replies[postId] || {};
    
    filteredRootComments.forEach(root => {
      const allReplies = postReplies[root.id] || [];
      const visibleReplies = allReplies.filter(r => 
        r.authorId === currentUser.id || 
        r.authorId === postOwnerId || 
        friendIds.includes(r.authorId)
      );
      replyHidden += (allReplies.length - visibleReplies.length);
    });

    return {
      root: rootHidden,
      total: rootHidden + replyHidden
    };
  }, [currentRootComments, filteredRootComments, replies, postId, currentUser.id, postOwnerId, friendIds, isLoading]);

  return (
    <div className={`flex flex-col min-h-0 transition-all duration-base ${className} ${!header ? 'border-t border-border-light bg-bg-secondary/20' : 'h-full bg-bg-primary'}`}>
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {header && <div className="bg-bg-primary">{header}</div>}

        <div className="pb-4">
          {isLoading && filteredRootComments.length === 0 ? (
            <div className="px-4 py-4"><CommentSkeleton /></div>
          ) : filteredRootComments.length === 0 ? (
            <div className="text-center py-10 px-6">
              <p className="text-text-secondary text-sm italic">
                {hiddenInfo.total > 0
                  ? `Có ${hiddenInfo.total} bình luận bị ẩn. Bạn chỉ xem được bình luận của bạn bè.`
                  : 'Hãy là người đầu tiên bình luận!'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col">
              {hiddenInfo.root > 0 && (
                <div className="text-center py-3 px-6 mb-2 border-b border-border-light/30 bg-bg-secondary/10">
                  <p className="text-text-tertiary text-[12px] italic">
                    Có {hiddenInfo.root} bình luận. Bạn chỉ xem được bình luận của bạn bè.
                  </p>
                </div>
              )}

              {filteredRootComments.map(comment => (
                <div key={comment.id} ref={el => { commentRefs.current[comment.id] = el; }}>
                  <CommentItem
                    comment={comment}
                    postId={postId}
                    currentUser={currentUser}
                    users={users}
                    replies={replies[postId] || {}}
                    hasMoreReply={hasMoreReply[postId] || {}}
                    isLoadingReplyMap={isLoadingReplyMap}
                    variant={variant}
                    postOwnerId={postOwnerId}
                    activeInputId={activeInputId}
                    inputMode={inputMode}
                    handleReplyClick={handleReplyClick}
                    handleEditClick={handleEditClick}
                    handleCommentSubmit={handleCommentSubmit}
                    handleDeleteClick={setCommentToDelete}
                    handleUploadMedia={handleUploadMedia}
                    loadReplies={loadReplies}
                    resetInput={resetInput}
                    onProfileClick={onProfileClick}
                    openReportModal={openReportModal}
                  />
                </div>
              ))}
              {currentHasMoreRoot && (
                <div className="px-6 py-4">
                  <Button
                    variant="ghost"
                    size="md"
                    onClick={loadMoreRootComments}
                    isLoading={isLoading}
                    className="text-primary w-full justify-start font-bold text-xs border-border-light hover:bg-bg-primary tracking-widest"
                  >
                    Xem thêm bình luận cũ...
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className={`
        pb-[calc(16px+env(safe-area-inset-bottom))] sticky bottom-0 bg-bg-primary z-20
        ${variant === 'cinema' ? 'p-4 md:p-5 pb-6 md:pb-6 bg-bg-primary/95 backdrop-blur-md border-t border-border-light shadow-md' : 'p-4 md:p-5 bg-bg-primary border-t border-border-light'}
      `}>
        {replyingTo && (
          <div className="flex items-center justify-between mb-2 px-3 py-1.5 bg-primary/5 rounded-xl text-[11px] text-primary border border-primary/10 backdrop-blur-sm">
            <span className="font-medium flex items-center gap-1.5">
              <div className="w-1 h-1 rounded-full bg-primary animate-pulse" />
              Đang trả lời <strong>{users[replyingTo.authorId || '']?.fullName}</strong>
            </span>
            <button onClick={resetInput} className="p-0.5 hover:bg-primary/10 active:bg-primary/20 rounded-full transition-all duration-base">
              <X size={12} />
            </button>
          </div>
        )}

        {uploadProgress !== null && (
          <div className="mb-2">
            <UploadProgress
              progress={uploadProgress}
              fileName="Đang tải lên media..."
            />
          </div>
        )}

        {activeInputId === 'root' && (
          <CommentInput
            user={{
              id: currentUser.id,
              fullName: currentUser.fullName,
              avatar: currentUser.avatar
            }}
            onSubmit={handleCommentSubmit}
            onUploadMedia={handleUploadMedia}
            autoFocus={autoFocus}
            placeholder="Nhập bình luận..."
          />
        )}
      </div>

      <ConfirmDialog
        isOpen={!!commentToDelete}
        onClose={() => setCommentToDelete(null)}
        onConfirm={handleDeleteConfirm}
        title={CONFIRM_MESSAGES.FEED.DELETE_COMMENT.TITLE}
        message={CONFIRM_MESSAGES.FEED.DELETE_COMMENT.MESSAGE(!!commentToDelete?.replyCount || !!(replies[postId]?.[commentToDelete?.id || '']?.length))}
        confirmLabel={CONFIRM_MESSAGES.FEED.DELETE_COMMENT.CONFIRM}
        variant="danger"
      />
    </div>
  );
};
