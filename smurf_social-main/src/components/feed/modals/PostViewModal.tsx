import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ChevronLeft, ChevronRight, MoreHorizontal, Edit, Trash2, Flag } from 'lucide-react';
import {
  UserAvatar, IconButton, Modal, Dropdown, DropdownItem,
  Skeleton, ReactionDetailsModal, MediaViewer,
} from '../../ui';
import { Post, User, ReportType, ReactionType, PostType } from '../../../../shared/types';
import { CommentSection } from '../comment/CommentSection';
import { formatRelativeTime, formatDateTime } from '../../../utils/dateUtils';
import { useReportStore } from '../../../store/reportStore';
import { useFriendIds, useFilteredReactions } from '../../../hooks';
import { VisibilityBadge, TruncatedText, ReactionActions, PostMediaGrid, SystemPostMedia } from '../shared';
import { LinkPreviewCard } from '../../shared/LinkPreviewCard';
import { extractFirstUrl } from '../../../services/linkPreviewService';

interface PostViewModalProps {
  post: Post | null;
  author: User | null;
  currentUser: User;
  isOpen: boolean;
  onClose: () => void;
  onReact: (postId: string, reaction: ReactionType | 'REMOVE') => void;
  onEdit?: (postId: string) => void;
  onDelete?: (postId: string) => void;
  isLoading?: boolean;
}

export const PostViewModal: React.FC<PostViewModalProps> = ({
  post, author, currentUser, isOpen, onClose,
  onReact, onEdit, onDelete, isLoading,
}) => {
  const navigate = useNavigate();
  const { openReportModal } = useReportStore();
  const friendIds = useFriendIds();
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [isMediaViewerOpen, setIsMediaViewerOpen] = useState(false);
  const [isReactionsModalOpen, setIsReactionsModalOpen] = useState(false);

  const { filteredSummary, filteredCount, currentUserReaction } = useFilteredReactions(
    post?.id || '', 'post', post?.authorId || '', post?.reactionCount
  );

  const handleProfileClick = useCallback(() => {
    if (author?.id) { onClose(); navigate(`/profile/${author.id}`); }
  }, [author?.id, onClose, navigate]);

  useEffect(() => {
    if (isOpen) setActiveMediaIndex(0);
  }, [isOpen, post?.id]);

  const allMedia = useMemo(() => {
    if (!post) return [];
    return (post.media || []).map(m => ({
      url: m.url,
      type: m.mimeType.startsWith('video/') ? 'video' as const : 'image' as const,
      thumbnail: m.thumbnailUrl,
    }));
  }, [post?.media]);

  if (!isOpen) return null;

  const shouldShowSkeleton = !post || isLoading;
  const isCinema = post ? (post.media?.length ?? 0) > 0 : false;

  /* ── Loading skeleton ── */
  if (shouldShowSkeleton) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        showHeader={false}
        maxWidth={isCinema ? 'full' : '2xl'}
        padding="none"
        fullScreen={isCinema ? true : 'mobile'}
        bodyClassName={`overflow-hidden flex flex-col h-full ${isCinema ? 'lg:flex-row' : ''}`}
      >
        {isCinema && (
          <div className="hidden lg:flex flex-[1.6] bg-[#0a0c10] items-center justify-center border-r border-white/5 shrink-0">
            <Skeleton className="w-[80%] aspect-video rounded-xl opacity-10" />
          </div>
        )}
        <div className={`flex flex-col bg-bg-primary shrink-0 transition-theme ${isCinema ? 'h-full w-full lg:w-[460px] flex-1 lg:flex-none' : 'w-full h-auto'}`}>
          <div className="p-4 md:p-5 border-b border-border-light flex items-center gap-3 shrink-0">
            <Skeleton variant="circle" width={42} height={42} />
            <div className="space-y-1.5 flex-1">
              <Skeleton width={140} height={14} />
              <Skeleton width={80} height={11} />
            </div>
            <Skeleton variant="circle" width={32} height={32} />
            <Skeleton variant="circle" width={32} height={32} />
          </div>
          <div className="flex-1 p-5 space-y-3">
            <Skeleton width="100%" height={14} />
            <Skeleton width="85%" height={14} />
            <Skeleton width="60%" height={14} />
          </div>
        </div>
      </Modal>
    );
  }

  const isOwner = post.authorId === currentUser.id;
  const hasMedia = allMedia.length > 0;
  const isSystemPost = post.type === PostType.AVATAR_UPDATE || post.type === PostType.COVER_UPDATE;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      showHeader={false}
      maxWidth={hasMedia ? 'full' : '2xl'}
      padding="none"
      fullScreen={hasMedia ? true : 'mobile'}
      bodyClassName={`overflow-hidden flex flex-col ${hasMedia ? 'lg:flex-row h-full' : 'h-auto max-h-[90vh]'}`}
    >
      {/* ── Cinema media panel (desktop only) ── */}
      {hasMedia && (
        <div className="hidden lg:flex flex-[1.6] bg-[#0a0c10] items-center justify-center relative select-none overflow-hidden border-r border-white/5 shrink-0">
          <div className="w-full h-full relative flex items-center justify-center" style={{ zIndex: 10 }}>
            {!allMedia[activeMediaIndex] ? (
              <p className="text-white/40 text-sm">Không tìm thấy nội dung</p>
            ) : isSystemPost ? (
              <SystemPostMedia
                type={post.type as PostType.AVATAR_UPDATE | PostType.COVER_UPDATE}
                media={post.media || []}
                variant="cinema"
                onClick={() => setIsMediaViewerOpen(true)}
              />
            ) : allMedia[activeMediaIndex].type === 'video' ? (
              <video
                src={allMedia[activeMediaIndex].url}
                poster={allMedia[activeMediaIndex].thumbnail}
                controls playsInline preload="none"
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <img
                src={allMedia[activeMediaIndex].url}
                alt=""
                className="max-w-full max-h-full object-contain cursor-pointer hover:opacity-95 transition-opacity duration-200 animate-fade-in"
                onClick={() => setIsMediaViewerOpen(true)}
              />
            )}

            {/* Navigation arrows */}
            {allMedia.length > 1 && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveMediaIndex(p => (p === 0 ? allMedia.length - 1 : p - 1));
                  }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center bg-black/25 hover:bg-black/40 active:scale-90 backdrop-blur-md text-white rounded-full border border-white/15 shadow-xl transition-all duration-150"
                  style={{ zIndex: 30 }}
                >
                  <ChevronLeft size={28} strokeWidth={2} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveMediaIndex(p => (p === allMedia.length - 1 ? 0 : p + 1));
                  }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center bg-black/25 hover:bg-black/40 active:scale-90 backdrop-blur-md text-white rounded-full border border-white/15 shadow-xl transition-all duration-150"
                  style={{ zIndex: 30 }}
                >
                  <ChevronRight size={28} strokeWidth={2} />
                </button>
                {/* Counter pill */}
                <div
                  className="absolute top-5 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/35 backdrop-blur-md rounded-full border border-white/10 text-white/85 text-xs font-medium pointer-events-none"
                  style={{ zIndex: 30 }}
                >
                  {activeMediaIndex + 1} / {allMedia.length}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Content / comment panel ── */}
      <div
        className={`flex flex-col bg-bg-primary transition-theme relative overflow-hidden
          ${hasMedia
            ? 'h-full w-full lg:w-[460px] flex-1 lg:flex-none'
            : 'w-full h-auto'
          }`}
        style={{ zIndex: 10 }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 py-3 border-b border-border-light shrink-0 bg-bg-primary"
          style={{ zIndex: 'var(--z-sticky)' }}
        >
          <UserAvatar
            userId={author?.id}
            src={author?.avatar?.url}
            name={author?.fullName}
            size="md"
            initialStatus={author?.status}
            onClick={handleProfileClick}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                className="font-semibold text-sm text-text-primary hover:text-primary transition-colors duration-200 truncate"
                onClick={handleProfileClick}
              >
                {author?.fullName || 'Người dùng'}
              </button>
              {post.type === PostType.AVATAR_UPDATE && (
                <span className="text-sm text-text-secondary font-normal">vừa cập nhật ảnh đại diện.</span>
              )}
              {post.type === PostType.COVER_UPDATE && (
                <span className="text-sm text-text-secondary font-normal">vừa cập nhật ảnh bìa.</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-text-tertiary mt-0.5">
              <span title={formatDateTime(post.createdAt)}>
                {formatRelativeTime(post.createdAt)}
              </span>
              <span className="opacity-40">·</span>
              <VisibilityBadge visibility={post.visibility} size={11} />
            </div>
          </div>

          <div className="flex items-center gap-0.5 shrink-0 ml-auto">
            {isOwner ? (
              <Dropdown trigger={<IconButton icon={<MoreHorizontal size={18} />} size="sm" variant="ghost" />}>
                <DropdownItem
                  icon={<Edit size={15} />}
                  label={isSystemPost ? 'Chỉnh sửa quyền riêng tư' : 'Chỉnh sửa bài viết'}
                  onClick={() => onEdit?.(post.id)}
                />
                <DropdownItem
                  icon={<Trash2 size={15} />}
                  label="Xóa bài viết"
                  variant="danger"
                  onClick={() => onDelete?.(post.id)}
                />
              </Dropdown>
            ) : (
              <Dropdown trigger={<IconButton icon={<MoreHorizontal size={18} />} size="sm" variant="ghost" />}>
                <DropdownItem
                  icon={<Flag size={15} />}
                  label="Báo cáo bài viết"
                  variant="danger"
                  onClick={() => openReportModal(ReportType.POST, post.id, post.authorId)}
                />
              </Dropdown>
            )}
            <IconButton icon={<X size={18} />} onClick={onClose} variant="ghost" size="sm" />
          </div>
        </div>

        {/* Comment section with inline header content */}
        <CommentSection
          postId={post.id}
          currentUser={currentUser}
          variant="cinema"
          autoFocus
          className="flex-1 min-h-0"
          onProfileClick={onClose}
          postOwnerId={post.authorId}
          totalCommentCount={post.commentCount}
          header={
            <div className="flex flex-col">
              {/* Mobile media grid */}
              {hasMedia && (
                <div className="lg:hidden w-full">
                  {!isSystemPost ? (
                    <PostMediaGrid
                      media={post.media || []}
                      onItemClick={(index) => {
                        setActiveMediaIndex(index);
                        setIsMediaViewerOpen(true);
                      }}
                    />
                  ) : (
                    <SystemPostMedia
                      type={post.type as PostType.AVATAR_UPDATE | PostType.COVER_UPDATE}
                      media={post.media || []}
                      variant="cinema"
                      onClick={() => setIsMediaViewerOpen(true)}
                    />
                  )}
                </div>
              )}

              {/* Post text */}
              {!isSystemPost && post.content && (
                <div className="px-4 md:px-5 py-3 w-full">
                  <p className="text-text-primary whitespace-pre-line break-words text-sm leading-relaxed">
                    <TruncatedText content={post.content} threshold={300} />
                  </p>
                  {(post.media?.length ?? 0) === 0 && (() => {
                    const url = extractFirstUrl(post.content);
                    if (!url) return null;
                    return <LinkPreviewCard url={url} className="mt-3" />;
                  })()}
                </div>
              )}

              {/* Reaction actions */}
              <ReactionActions
                reactionSummary={filteredSummary}
                reactionCount={filteredCount}
                myReaction={currentUserReaction}
                commentCount={post.commentCount}
                onReact={(type) => onReact(post.id, type)}
                onViewReactions={() => setIsReactionsModalOpen(true)}
                statsClassName="px-4 md:px-5 py-2.5 flex justify-between items-center border-b border-border-light/50"
                actionClassName="flex px-1 py-1 gap-0.5 border-b border-border-light"
                selectorPosition="bottom"
              />
            </div>
          }
        />
      </div>

      <ReactionDetailsModal
        isOpen={isReactionsModalOpen}
        onClose={() => setIsReactionsModalOpen(false)}
        sourceId={post.id}
        sourceType="post"
        currentUserId={currentUser.id}
        authorId={post.authorId}
        context="POST"
        friendsIds={friendIds}
      />

      <MediaViewer
        media={allMedia}
        initialIndex={activeMediaIndex}
        isOpen={isMediaViewerOpen}
        onClose={() => setIsMediaViewerOpen(false)}
      />
    </Modal>
  );
};
