import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { X, MessageCircle } from 'lucide-react';
import { Button, ConfirmDialog, UploadProgress } from '../../ui';
import { CONFIRM_MESSAGES } from '../../../constants';
import { toast } from '../../../store/toastStore';
import { Comment, User, ReportType, MediaObject } from '../../../../shared/types';
import { commentService } from '../../../services/commentService';
import { useCommentStore } from '../../../store';
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
  postId, currentUser, header, className = '',
  variant = 'default', autoFocus = false,
  onProfileClick, postOwnerId, totalCommentCount = 0,
}) => {
  const {
    rootComments, replies, hasMoreRoot, hasMoreReply, isLoadingPost,
    fetchRootComments, fetchReplies, subscribeToComments, subscribeToReplies,
    createComment, updateComment, deleteComment,
    getFilteredRootComments, getFilteredReplies,
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

  const { visibleComments: filteredRootComments, hiddenCount: rootHiddenCount } = useMemo(() =>
    getFilteredRootComments(postId, postOwnerId || '', currentUser.id, friendIds),
    [getFilteredRootComments, postId, postOwnerId, currentUser.id, friendIds, currentRootComments]
  );

  useEffect(() => {
    if (activeInputId && activeInputId !== 'root' && commentRefs.current[activeInputId]) {
      setTimeout(() => {
        commentRefs.current[activeInputId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    }
  }, [activeInputId]);

  useEffect(() => {
    resetInput();
    return () => {
      Object.values(replySubscriptionsRef.current).forEach(unsub => unsub?.());
      replySubscriptionsRef.current = {};
    };
  }, [postId]);

  useEffect(() => {
    const unsubscribe = subscribeToComments(postId, blockedUserIds);
    return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, [postId, blockedUserIds, subscribeToComments]);

  useEffect(() => {
    if (currentRootComments.length === 0) return;
    const userIds = [...new Set(currentRootComments.map(c => c.authorId))];
    fetchUsers(userIds);
  }, [currentRootComments, fetchUsers]);

  useEffect(() => {
    const postReplies = replies[postId] || {};
    const allReplyUserIds = Object.values(postReplies).flat().map(r => r.authorId);
    const unique = [...new Set(allReplyUserIds)];
    if (unique.length > 0) fetchUsers(unique);
  }, [replies, postId, fetchUsers]);

  const loadReplies = async (parentId: string) => {
    if (isLoadingReplyMap[parentId]) return;
    setIsLoadingReplyMap(prev => ({ ...prev, [parentId]: true }));
    try {
      if (replySubscriptionsRef.current[parentId]) {
        await fetchReplies(postId, parentId, blockedUserIds, true);
      } else {
        const unsub = subscribeToReplies(postId, parentId, blockedUserIds);
        replySubscriptionsRef.current[parentId] = unsub;
      }
    } finally {
      setIsLoadingReplyMap(prev => ({ ...prev, [parentId]: false }));
    }
  };

  const handleReplyClick = useCallback((comment: Comment) => {
    setReplyingTo(comment); setEditingComment(null);
    setActiveInputId(comment.id); setInputMode('reply');
  }, []);

  const handleEditClick = useCallback((comment: Comment) => {
    setEditingComment(comment); setReplyingTo(null);
    setActiveInputId(comment.id); setInputMode('edit');
  }, []);

  const resetInput = useCallback(() => {
    setReplyingTo(null); setEditingComment(null);
    setActiveInputId('root'); setInputMode('comment');
  }, []);

  const handleCommentSubmit = useCallback(async (content: string, image?: MediaObject) => {
    if (inputMode === 'edit' && editingComment) {
      await updateComment(
        postId, editingComment.id, content,
        editingComment.parentId, editingComment.replyToUserId,
        editingComment.replyToId, image
      );
    } else {
      const parentId = replyingTo ? (replyingTo.parentId || replyingTo.id) : null;
      await createComment(
        postId, currentUser.id, content,
        parentId, replyingTo?.authorId, replyingTo?.id, image
      );
    }
    resetInput();
  }, [inputMode, editingComment, replyingTo, postId, currentUser.id, updateComment, createComment, resetInput]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!commentToDelete) return;
    try {
      await deleteComment(postId, commentToDelete.id, currentUser.id, commentToDelete.parentId);
      setCommentToDelete(null);
    } catch {
      toast.error('Không thể xóa bình luận này');
    }
  }, [commentToDelete, postId, currentUser.id, deleteComment]);

  const handleUploadMedia = useCallback(async (file: File) => {
    setUploadProgress(0);
    try {
      const media = await commentService.uploadCommentImage(
        file, currentUser.id, (p) => setUploadProgress(p)
      );
      return media;
    } finally {
      setUploadProgress(null);
    }
  }, [currentUser.id]);

  const hasAnyHidden = useMemo(() => {
    if (rootHiddenCount > 0) return true;
    return filteredRootComments.some(root => {
      const { hiddenCount } = getFilteredReplies(
        postId, root.id, postOwnerId || '', currentUser.id, friendIds
      );
      return hiddenCount > 0;
    });
  }, [rootHiddenCount, filteredRootComments, getFilteredReplies, postId, postOwnerId, currentUser.id, friendIds]);

  return (
    <div className={`flex flex-col min-h-0 transition-all duration-200 ${className} ${!header ? 'border-t border-border-light' : 'h-full bg-bg-primary'}`}>

      {/* Scrollable comment list */}
      <div className="flex-1 overflow-y-auto scroll-hide">
        {header && <div className="bg-bg-primary">{header}</div>}

        <div className="pb-4">
          {isLoading && filteredRootComments.length === 0 ? (
            <div className="px-4 py-4">
              <CommentSkeleton />
            </div>
          ) : filteredRootComments.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
              <div className="w-10 h-10 rounded-full bg-bg-secondary flex items-center justify-center mb-3 border border-border-light">
                <MessageCircle size={18} className="text-text-tertiary" />
              </div>
              <p className="text-sm text-text-secondary font-medium">
                {hasAnyHidden
                  ? `Có ${totalCommentCount} bình luận. Bạn chỉ có thể xem bình luận của bạn bè.`
                  : 'Hãy là người đầu tiên bình luận!'}
              </p>
              {!hasAnyHidden && (
                <p className="text-xs text-text-tertiary mt-1">Gửi gắm suy nghĩ của bạn vào đây nào!</p>
              )}
            </div>
          ) : (
            <div className="flex flex-col">
              {rootHiddenCount > 0 && (
                <div className="mx-4 my-2 py-2 border-b border-border-light/30 text-center">
                  <p className="text-xs text-text-tertiary italic">
                    Có {totalCommentCount} bình luận. Bạn chỉ có thể xem bình luận của bạn bè.
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
                    getFilteredReplies={getFilteredReplies}
                  />
                </div>
              ))}

              {currentHasMoreRoot && (
                <div className="px-4 pt-3 pb-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => fetchRootComments(postId, blockedUserIds, true)}
                    isLoading={isLoading}
                    className="text-primary w-full justify-center text-xs font-semibold hover:bg-primary/5"
                  >
                    Xem thêm bình luận cũ...
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sticky input area */}
      <div
        className={`flex-shrink-0 sticky bottom-0 bg-bg-primary border-t border-border-light
          ${variant === 'cinema'
            ? 'p-4 md:p-5 bg-bg-primary/95 backdrop-blur-md shadow-md'
            : 'p-3 md:p-4'
          }
          pb-[calc(12px+env(safe-area-inset-bottom))] md:pb-4`}
        style={{ zIndex: 'var(--z-sticky)' }}
      >
        {/* Replying-to banner */}
        {replyingTo && (
          <div className="flex items-center justify-between mb-2.5 px-3 py-1.5 bg-primary/5 border border-primary/15 rounded-xl">
            <span className="text-xs text-primary font-medium flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot flex-shrink-0" />
              Đang trả lời <strong>{users[replyingTo.authorId || '']?.fullName}</strong>
            </span>
            <button
              onClick={resetInput}
              className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-primary/10 text-primary transition-colors duration-200"
            >
              <X size={11} />
            </button>
          </div>
        )}

        {/* Upload progress */}
        {uploadProgress !== null && (
          <div className="mb-2.5">
            <UploadProgress progress={uploadProgress} fileName="Đang tải lên ảnh..." />
          </div>
        )}

        {/* Root comment input */}
        {activeInputId === 'root' && (
          <CommentInput
            user={{ id: currentUser.id, fullName: currentUser.fullName, avatar: currentUser.avatar }}
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
        message={CONFIRM_MESSAGES.FEED.DELETE_COMMENT.MESSAGE(
          !!commentToDelete?.replyCount ||
          !!(replies[postId]?.[commentToDelete?.id || '']?.length)
        )}
        confirmLabel={CONFIRM_MESSAGES.FEED.DELETE_COMMENT.CONFIRM}
        variant="danger"
      />
    </div>
  );
};
