import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ChevronLeft, ChevronRight, MoreHorizontal, Edit, Trash2, Flag, Play, Pause, Maximize2, AlertCircle } from 'lucide-react';
import {
  UserAvatar, IconButton, Modal, Dropdown, DropdownItem,
  Skeleton, ReactionDetailsModal, MediaViewer, SensitiveMediaGuard,
} from '../../ui';
import { Post, User, ReportType, ReactionType, PostType, Visibility, PostStatus } from '../../../../shared/types';
import { CommentSection } from '../comment/CommentSection';
import { formatRelativeTime, formatDateTime } from '../../../utils/dateUtils';
import { useReportStore } from '../../../store/reportStore';
import { useFriendIds, useFilteredReactions } from '../../../hooks';
import { VisibilityBadge, TruncatedText, InteractionActions, PostMediaGrid, SystemPostMedia } from '../shared';
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
  onShare?: (post: Post, authorName: string) => void;
  isLoading?: boolean;
}

export const PostViewModal: React.FC<PostViewModalProps> = ({
  post, author, currentUser, isOpen, onClose,
  onReact, onEdit, onDelete, onShare, isLoading,
}) => {
  const navigate = useNavigate();
  const { openReportModal } = useReportStore();
  const friendIds = useFriendIds();
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [isMediaViewerOpen, setIsMediaViewerOpen] = useState(false);
  const [isReactionsModalOpen, setIsReactionsModalOpen] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const { filteredSummary, filteredCount, currentUserReaction } = useFilteredReactions(
    post?.id || '', 'post', post?.authorId || '', post?.reactionCount
  );

  const handleProfileClick = useCallback(() => {
    if (author?.id) { onClose(); navigate(`/profile/${author.id}`); }
  }, [author?.id, onClose, navigate]);

  useEffect(() => {
    if (isOpen) {
      setActiveMediaIndex(0);
      setIsVideoPlaying(false);
    }
  }, [isOpen, post?.id]);

  useEffect(() => {
    setIsVideoPlaying(false);
  }, [activeMediaIndex]);

  const allMedia = useMemo(() => {
    if (!post) return [];
    return (post.media || []).map(m => ({
      url: m.url,
      type: m.mimeType.startsWith('video/') ? 'video' as const : 'image' as const,
      thumbnail: m.thumbnailUrl,
      isSensitive: m.isSensitive,
    }));
  }, [post?.media]);

  const isOwner = post?.authorId === currentUser.id;
  const isSystemPost = post?.type === PostType.AVATAR_UPDATE || post?.type === PostType.COVER_UPDATE;
  const isFriend = (post && friendIds?.includes(post.authorId)) || false;
  const isDeleted = post?.status === PostStatus.DELETED;
  const canAccessByVisibility = !post
    || isOwner
    || post.visibility === Visibility.PUBLIC
    || (post.visibility === Visibility.FRIENDS && isFriend);
  const canShare = !!post && !isDeleted && post.visibility !== Visibility.PRIVATE && canAccessByVisibility;
  const canShowInteractions = !post || !isSystemPost || (!isDeleted && canAccessByVisibility);

  const handleSharePost = useCallback(() => {
    if (!post) return;
    onShare?.(post, author?.fullName || 'Người dùng');
  }, [post, author?.fullName, onShare]);

  const readonlyMessage = useMemo(() => {
    if (!post) return undefined;

    if (isSystemPost) {
      if (!isOwner && !isFriend) return undefined;
      if (isDeleted) return "";
      if (post.visibility === Visibility.PRIVATE && isFriend) return "";
    }

    return undefined;
  }, [post, isSystemPost, isOwner, isFriend, isDeleted]);

  if (!isOpen) return null;

  const shouldShowSkeleton = !!isLoading;
  const isCinema = post ? (post.media?.length ?? 0) > 0 : false;

  if (!post && !shouldShowSkeleton) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        showHeader={false}
        maxWidth="md"
        padding="none"
      >
        <div className="p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-bg-secondary border border-border-light flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={24} className="text-text-tertiary" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-2">Không thể truy cập bài viết</h3>
          <p className="text-sm text-text-secondary leading-relaxed">
            Bài viết đã bị xóa hoặc bạn không còn quyền xem nội dung này.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-5 px-4 py-2 rounded-lg border border-border-light text-sm font-semibold text-text-primary hover:bg-bg-hover transition-colors"
          >
            Đóng
          </button>
        </div>
      </Modal>
    );
  }

  if (!post) return null;

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

  const hasMedia = allMedia.length > 0;

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
        <div className="hidden lg:flex flex-[1.6] bg-[#0a0c10] items-center justify-center relative overflow-hidden border-r border-white/5 shrink-0">
          <div className="w-full h-full relative flex items-center justify-center min-h-0 min-w-0" style={{ zIndex: 10 }}>
            <div className="absolute top-4 right-4" style={{ zIndex: 40 }}>
              <button
                onClick={() => setIsMediaViewerOpen(true)}
                className="w-11 h-11 flex items-center justify-center bg-black/20 hover:bg-black/30 active:scale-95 backdrop-blur-md text-white rounded-full border border-white/10 shadow-xl transition-all duration-150"
                title="Xem toàn màn hình"
              >
                <Maximize2 size={22} strokeWidth={2} />
              </button>
            </div>

            {!allMedia[activeMediaIndex] ? (
              <p className="text-white/40 text-sm">Không tìm thấy nội dung</p>
            ) : isSystemPost ? (
              <SystemPostMedia
                type={post.type as PostType.AVATAR_UPDATE | PostType.COVER_UPDATE}
                media={post.media || []}
                variant="cinema"
              />
            ) : allMedia[activeMediaIndex].type === 'video' ? (
              <SensitiveMediaGuard isSensitive={allMedia[activeMediaIndex].isSensitive} className="w-full h-full min-h-0 min-w-0">
                <div className="w-full h-full flex items-center justify-center relative group/player">
                  <video
                    ref={videoRef}
                    src={allMedia[activeMediaIndex].url}
                    poster={allMedia[activeMediaIndex].thumbnail}
                    controls playsInline preload="metadata"
                    className="w-full h-full object-contain"
                    onPlay={() => setIsVideoPlaying(true)}
                    onPause={() => setIsVideoPlaying(false)}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (videoRef.current) {
                        videoRef.current.paused ? videoRef.current.play() : videoRef.current.pause();
                      }
                    }}
                    className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-4 bg-bg-secondary hover:bg-bg-active text-text-primary rounded-full border border-border-light transition-all duration-200 active:scale-95 z-20 ${isVideoPlaying ? 'opacity-0 group-hover/player:opacity-100' : 'opacity-100'}`}
                  >
                    {isVideoPlaying ? <Pause size={28} /> : <Play size={28} />}
                  </button>
                </div>
              </SensitiveMediaGuard>
            ) : (
              <SensitiveMediaGuard isSensitive={allMedia[activeMediaIndex].isSensitive} className="w-full h-full min-h-0 min-w-0">
                <div className="w-full h-full flex items-center justify-center">
                    <img
                      src={allMedia[activeMediaIndex].url}
                      alt=""
                      className="w-full h-full object-contain hover:opacity-95 transition-opacity duration-200 animate-fade-in"
                    />
                </div>
              </SensitiveMediaGuard>
            )}

            {/* Navigation arrows */}
            {allMedia.length > 1 && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveMediaIndex(p => (p === 0 ? allMedia.length - 1 : p - 1));
                  }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center bg-black/20 hover:bg-black/30 active:scale-90 backdrop-blur-md text-white rounded-full border border-white/10 shadow-xl transition-all duration-150"
                  style={{ zIndex: 30 }}
                >
                  <ChevronLeft size={28} strokeWidth={2} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveMediaIndex(p => (p === allMedia.length - 1 ? 0 : p + 1));
                  }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center bg-black/20 hover:bg-black/30 active:scale-90 backdrop-blur-md text-white rounded-full border border-white/10 shadow-xl transition-all duration-150"
                  style={{ zIndex: 30 }}
                >
                  <ChevronRight size={28} strokeWidth={2} />
                </button>
                {/* Counter pill */}
                <div
                  className="absolute top-5 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/20 backdrop-blur-md rounded-full border border-white/10 text-white/90 text-xs font-medium pointer-events-none"
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
            userId={author?.id || post.authorId}
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
              !isDeleted && (
                <Dropdown trigger={<IconButton icon={<MoreHorizontal size={18} />} size="sm" variant="ghost" />}>
                  <DropdownItem
                    icon={<Edit size={15} />}
                    label={isSystemPost ? "Chỉnh sửa quyền riêng tư" : "Chỉnh sửa bài viết"}
                    onClick={() => onEdit?.(post.id)}
                  />
                  <DropdownItem
                    icon={<Trash2 size={15} />}
                    label="Xóa bài viết"
                    variant="danger"
                    onClick={() => onDelete?.(post.id)}
                  />
                </Dropdown>
              )
            ) : (
              <Dropdown trigger={<IconButton icon={<MoreHorizontal size={18} />} size="sm" variant="ghost" />}>
                <DropdownItem
                  icon={<Flag size={15} />}
                  label="Báo cáo"
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
          autoFocus={canShowInteractions}
          className="flex-1 min-h-0"
          onProfileClick={onClose}
          postOwnerId={post.authorId}
          totalCommentCount={post.commentCount}
          readonly={!canShowInteractions}
          readonlyMessage={readonlyMessage}
          header={
            <div className="flex flex-col">
              {/* Post text (Displayed first on mobile) */}
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

              {/* Mobile media grid - Displayed after text with "Full" style */}
              {hasMedia && (
                <div className="lg:hidden w-full relative bg-bg-secondary/20">
                  {/* Mobile Fullscreen button - Glassmorphism style preserved */}
                  <div className="absolute top-3 right-3 z-20">
                    <button
                      onClick={() => setIsMediaViewerOpen(true)}
                      className="w-9 h-9 flex items-center justify-center bg-black/20 hover:bg-black/30 active:scale-95 backdrop-blur-md text-white rounded-full border border-white/10 shadow-lg transition-all duration-150"
                      title="Xem toàn màn hình"
                    >
                      <Maximize2 size={18} strokeWidth={2} />
                    </button>
                  </div>

                  {!isSystemPost ? (
                    <div className={`grid gap-1 w-full bg-bg-secondary/10 ${allMedia.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                      {allMedia.map((media, idx) => (
                        <div
                          key={idx}
                          className={`relative cursor-pointer group overflow-hidden bg-bg-primary border border-border-light/30
                            ${allMedia.length > 2 && idx === 0 && allMedia.length % 2 !== 0 ? 'col-span-2 aspect-video' : 'aspect-square'}`}
                          onClick={() => {
                            setActiveMediaIndex(idx);
                            setIsMediaViewerOpen(true);
                          }}
                        >
                          <SensitiveMediaGuard isSensitive={media.isSensitive} className="w-full h-full">
                            {media.type === 'video' ? (
                              <div className="w-full h-full flex items-center justify-center bg-black">
                                <video
                                  src={media.url}
                                  className="w-full h-full object-cover"
                                  playsInline
                                  preload="metadata"
                                />
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <div className="p-2 bg-black/20 backdrop-blur-sm rounded-full text-white">
                                    <Play size={20} fill="white" />
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <img
                                src={media.url}
                                alt=""
                                className="w-full h-full object-cover animate-fade-in"
                                loading="lazy"
                              />
                            )}
                          </SensitiveMediaGuard>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <SystemPostMedia
                      type={post.type as PostType.AVATAR_UPDATE | PostType.COVER_UPDATE}
                      media={post.media || []}
                      variant="cinema"
                    />
                  )}
                </div>
              )}

              {/* Reaction actions */}
              {canShowInteractions && (
                <InteractionActions
                  reactionSummary={filteredSummary}
                  reactionCount={filteredCount}
                  myReaction={currentUserReaction}
                  commentCount={post.commentCount}
                  onReact={(type) => onReact(post.id, type)}
                  onShareClick={canShare ? handleSharePost : undefined}
                  onViewReactions={() => setIsReactionsModalOpen(true)}
                  statsClassName="px-4 md:px-5 py-2.5 flex justify-between items-center border-b border-border-light/50"
                  actionClassName="flex px-1 py-1 gap-0.5 border-b border-border-light"
                  selectorPosition="bottom"
                />
              )}
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
