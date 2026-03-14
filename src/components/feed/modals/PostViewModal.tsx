import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ChevronLeft, ChevronRight, MoreHorizontal, Edit, Trash2, Flag } from 'lucide-react';
import { UserAvatar, IconButton, Modal, Dropdown, DropdownItem, Skeleton, ReactionDetailsModal } from '../../ui';
import { Post, User, ReportType, ReactionType } from '../../../types';
import { CommentSection } from '../comment/CommentSection';
import { formatRelativeTime, formatDateTime } from '../../../utils/dateUtils';
import { useReportStore } from '../../../store/reportStore';
import { usePostStore } from '../../../store/postStore';
import { useFriendIds, useFilteredReactions } from '../../../hooks';
import { VisibilityBadge, TruncatedText, ReactionActions } from '../shared';

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
  post,
  author,
  currentUser,
  isOpen,
  onClose,
  onReact,
  onEdit,
  onDelete,
  isLoading
}) => {
  const navigate = useNavigate();
  const { openReportModal } = useReportStore();
  const friendIds = useFriendIds();
  const myReaction = usePostStore(state => state.myPostReactions[post?.id || '']);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [isReactionsModalOpen, setIsReactionsModalOpen] = useState(false);

  const { filteredSummary, filteredCount } = useFilteredReactions(
    post?.id || '',
    'post',
    post?.authorId || ''
  );

  const handleProfileClick = useCallback(() => {
    if (author?.id) {
      onClose();
      navigate(`/profile/${author.id}`);
    }
  }, [author?.id, onClose, navigate]);

  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  // Min swipe distance (pixels)
  const minSwipeDistance = 50;

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => setTouchEnd(e.targetTouches[0].clientX), []);

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe && post && mediaIndex < allMedia.length - 1) {
      setMediaIndex(prev => prev + 1);
    }
    if (isRightSwipe && mediaIndex > 0) {
      setMediaIndex(prev => prev - 1);
    }
  };

  // Reset trạng thái khi đổi bài viết
  React.useEffect(() => {
    if (isOpen) {
      setMediaIndex(0);
    }
  }, [isOpen, post?.id]);

  const allMedia = useMemo(() => {
    if (!post) return [];
    return (post.media || []).map(m => ({
      url: m.url,
      type: m.mimeType.startsWith('video/') ? 'video' as const : 'image' as const,
      thumbnailUrl: m.thumbnailUrl
    }));
  }, [post?.media]);

  if (!isOpen) return null;

  if (isLoading || !post) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        showHeader={false}
        maxWidth="4xl"
        className="!p-0 shadow-none h-full md:h-auto overflow-hidden"
      >
        <div className="flex flex-col md:flex-row h-full md:h-[600px] bg-bg-primary md:rounded-2xl overflow-hidden">
          <div className="hidden md:flex flex-[1.5] bg-bg-secondary items-center justify-center border-r border-border-light">
            <Skeleton className="w-[80%] aspect-video rounded-lg opacity-20" />
          </div>

          <div className="flex-1 p-4 flex flex-col h-full">
            <div className="flex items-center gap-3 mb-4">
              <Skeleton variant="circle" width={40} height={40} />
              <div className="space-y-2">
                <Skeleton width={120} height={16} />
                <Skeleton width={80} height={12} />
              </div>
            </div>
            <div className="space-y-2 mb-6">
              <Skeleton width="100%" height={16} />
              <Skeleton width="100%" height={16} />
              <Skeleton width="70%" height={16} />
            </div>
            <div className="mt-auto space-y-4">
              <div className="flex gap-3">
                <Skeleton variant="circle" width={32} height={32} />
                <Skeleton className="flex-1 h-8 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </Modal>
    );
  }

  const isOwner = post.authorId === currentUser.id;
  const hasMedia = allMedia.length > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      showHeader={false}
      maxWidth={hasMedia ? 'full' : '2xl'}
      padding="none"
      fullScreen={hasMedia ? true : 'mobile'}
      className={`
        transition-all duration-base overflow-hidden
      `}
      bodyClassName={`overflow-hidden flex flex-col ${hasMedia ? 'lg:flex-row h-full' : 'h-auto max-h-[90vh]'}`}
    >

      {/* Khong gian Cinema cho Media (Desktop) */}
      {hasMedia && (
        <div className="hidden lg:flex flex-[1.6] bg-[#0a0c10] items-center justify-center relative group select-none overflow-hidden touch-none grow shrink-0 border-r border-white/5">
          <div className="w-full h-full relative z-10 flex items-center justify-center">
            {/* Media Content */}
            <div className="w-full h-full flex items-center justify-center">
              {allMedia[mediaIndex].type === 'video' ? (
                <video
                  src={allMedia[mediaIndex].url}
                  poster={allMedia[mediaIndex].thumbnailUrl}
                  controls
                  playsInline
                  preload="none"
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <img
                  src={allMedia[mediaIndex].url}
                  alt=""
                  className="max-w-full max-h-full object-contain animate-in fade-in zoom-in-95 duration-base"
                />
              )}
            </div>

            {/* Overlay Navigation (Desktop) */}
            {allMedia.length > 1 && (
              <>
                {/* Nut chuyen anh - Trai */}
                <div className="absolute inset-y-0 left-0 w-20 flex items-center justify-start pl-4 z-20 group-hover:opacity-100 opacity-0 transition-all duration-base">
                  <button
                    onClick={() => setMediaIndex(mediaIndex - 1)}
                    className={`
                        w-12 h-12 flex items-center justify-center 
                        bg-white/10 hover:bg-white/20 backdrop-blur-md text-white 
                        rounded-full border border-white/10 outline-none
                        transition-all duration-base
                        ${mediaIndex === 0 ? 'pointer-events-none invisible' : 'pointer-events-auto visible'}
                      `}
                  >
                    <ChevronLeft size={32} strokeWidth={2} />
                  </button>
                </div>

                {/* Nut chuyen anh - Phai */}
                <div className="absolute inset-y-0 right-0 w-20 flex items-center justify-end pr-4 z-20 group-hover:opacity-100 opacity-0 transition-all duration-base">
                  <button
                    onClick={() => setMediaIndex(mediaIndex + 1)}
                    className={`
                        w-12 h-12 flex items-center justify-center 
                        bg-white/10 hover:bg-white/20 backdrop-blur-md text-white 
                        rounded-full border border-white/10 outline-none
                        transition-all duration-base
                        ${mediaIndex === allMedia.length - 1 ? 'pointer-events-none invisible' : 'pointer-events-auto visible'}
                      `}
                  >
                    <ChevronRight size={32} strokeWidth={2} />
                  </button>
                </div>

              </>
            )}
          </div>
        </div>
      )}

      {/* Panel noi dung va tuong tac */}
      <div className={`flex flex-col bg-bg-primary transition-theme relative z-10 overflow-hidden ${hasMedia ? 'h-full w-full lg:w-[460px] lg:border-l border-border-light flex-1 lg:flex-none' : 'w-full h-auto'}`}>

        <div className="w-full p-4 md:p-5 border-b border-border-light flex items-center shrink-0 bg-bg-primary z-30">
          <div className="flex gap-3 items-center flex-1 min-w-0">
            <UserAvatar
              userId={author?.id}
              src={author?.avatar.url}
              name={author?.fullName}
              size="md"
              initialStatus={author?.status}
              onClick={handleProfileClick}
            />
            <div className="min-w-0 flex-1">
              <h3
                className="font-bold text-text-primary text-[15px] truncate cursor-pointer hover:underline transition-all duration-base"
                onClick={handleProfileClick}
              >
                {author?.fullName || 'Unknown User'}
              </h3>
              <div className="flex items-center gap-2 text-[12px] text-text-tertiary mt-0.5">
                <span title={formatDateTime(post.createdAt)}>
                  {formatRelativeTime(post.createdAt)}
                </span>
                <span className="opacity-40">•</span>
                <VisibilityBadge visibility={post.visibility} size={13} />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0 ml-auto">
            {isOwner ? (
              <Dropdown
                trigger={<IconButton icon={<MoreHorizontal size={20} />} size="md" variant="ghost" />}
                menuClassName="z-[var(--z-popover)]"
              >
                <DropdownItem icon={<Edit size={18} />} label="Chỉnh sửa bài viết" onClick={() => onEdit?.(post.id)} />
                <DropdownItem icon={<Trash2 size={18} />} label="Xóa bài viết" variant="danger" onClick={() => onDelete?.(post.id)} />
              </Dropdown>
            ) : (
              <Dropdown
                trigger={<IconButton icon={<MoreHorizontal size={20} />} size="md" variant="ghost" />}
                menuClassName="z-[var(--z-popover)]"
              >
                <DropdownItem
                  icon={<Flag size={18} />}
                  label="Báo cáo bài viết"
                  variant="danger"
                  onClick={() => openReportModal(ReportType.POST, post.id, post.authorId)}
                />
              </Dropdown>
            )}
            <IconButton
              icon={<X size={20} />}
              onClick={onClose}
              variant="ghost"
            />
          </div>
        </div>

        <CommentSection
          postId={post.id}
          currentUser={currentUser}
          variant="cinema"
          autoFocus={true}
          className="flex-1 min-h-0"
          onProfileClick={onClose}
          postOwnerId={post.authorId}
          totalCommentCount={post.commentCount}
          header={
            <div className="flex flex-col">
              {/* Media cho Mobile */}
              {hasMedia && (
                <div
                  className="lg:hidden w-full bg-[#0a0c10] aspect-video sm:aspect-square max-h-[60vh] flex items-center justify-center relative select-none overflow-hidden touch-none"
                  onTouchStart={onTouchStart}
                  onTouchMove={onTouchMove}
                  onTouchEnd={onTouchEnd}
                >
                  <div className="w-full h-full flex items-center justify-center">
                    {allMedia[mediaIndex].type === 'video' ? (
                      <video src={allMedia[mediaIndex].url} poster={allMedia[mediaIndex].thumbnailUrl} controls playsInline className="max-w-full max-h-full" />
                    ) : (
                      <img src={allMedia[mediaIndex].url} alt="" className="max-w-full max-h-full object-contain" />
                    )}
                  </div>
                  {allMedia.length > 1 && (
                    <>
                      <div className="absolute inset-y-0 left-0 flex items-center px-2">
                        <button onClick={() => setMediaIndex(mediaIndex - 1)} className={`bg-black/30 backdrop-blur-md text-white rounded-full w-11 h-11 flex items-center justify-center outline-none transition-all active:scale-90 ${mediaIndex === 0 ? 'invisible' : ''}`}>
                          <ChevronLeft size={28} strokeWidth={2.5} />
                        </button>
                      </div>
                      <div className="absolute inset-y-0 right-0 flex items-center px-2">
                        <button onClick={() => setMediaIndex(mediaIndex + 1)} className={`bg-black/30 backdrop-blur-md text-white rounded-full w-11 h-11 flex items-center justify-center outline-none transition-all active:scale-90 ${mediaIndex === allMedia.length - 1 ? 'invisible' : ''}`}>
                          <ChevronRight size={28} strokeWidth={2.5} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Noi dung van ban */}
              <div className="px-5 md:px-6 py-4 pb-3 w-full overflow-hidden">
                <p className="text-text-primary whitespace-pre-line break-words break-all text-[15px] md:text-[16px] leading-[1.6] w-full">
                  <TruncatedText content={post.content} threshold={300} />
                </p>
              </div>

              <ReactionActions
                reactionSummary={filteredSummary}
                reactionCount={filteredCount}
                myReaction={myReaction}
                commentCount={post.commentCount}
                onReact={(type) => onReact(post.id, type)}
                onViewReactions={() => setIsReactionsModalOpen(true)}
                statsClassName="px-5 md:px-6 py-4 flex justify-between items-center border-b border-border-light/60"
                actionClassName="flex px-2 py-1 border-b border-border-light relative"
                selectorClassName="z-[var(--z-popover)]"
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
    </Modal>
  );
};
