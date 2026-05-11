import React, { useState, useCallback } from 'react';
import { MoreHorizontal, Edit, Trash2, Flag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatRelativeTime, formatDateTime } from '../../utils/dateUtils';
import { UserAvatar, Skeleton, Dropdown, DropdownItem, IconButton, ReactionDetailsModal, UploadProgress } from '../ui';
import { Post, PostStatus, Visibility, PostType, User, ReportType, ReactionType } from '../../../shared/types';
import { useReportStore } from '../../store/reportStore';
import { usePostStore } from '../../store';
import { useFriendIds, useFilteredReactions } from '../../hooks';
import { VisibilityBadge, TruncatedText, InteractionActions, PostMediaGrid, SystemPostMedia } from './shared';
import { LinkPreviewCard } from '../shared/LinkPreviewCard';
import { extractFirstUrl } from '../../services/linkPreviewService';

interface PostItemProps {
  post: Post;
  author: User;
  currentUser: User;
  onReact: (postId: string, reaction: ReactionType | 'REMOVE') => void;
  onEdit?: (postId: string) => void;
  onDelete?: (postId: string) => void;
  onViewDetail?: (post: Post) => void;
  onProfileClick?: () => void;
  onShare?: (post: Post, authorName: string) => void;
}

const PostItemInner: React.FC<PostItemProps> = ({
  post, author, currentUser,
  onReact, onEdit, onDelete, onViewDetail, onProfileClick, onShare,
}) => {
  const [isReactionsModalOpen, setIsReactionsModalOpen] = useState(false);
  const navigate = useNavigate();
  const { openReportModal } = useReportStore();
  const { uploadingStates } = usePostStore();
  const friendIds = useFriendIds();

  const uploadState = uploadingStates[post.id];
  const isUploading = !!uploadState && !uploadState.error;
  const error = uploadState?.error;
  const isOwner = post.authorId === currentUser.id;
  const isSystemPost = post.type === PostType.AVATAR_UPDATE || post.type === PostType.COVER_UPDATE;
  const isFriend = friendIds?.includes(post.authorId) || false;
  const isDeleted = post.status === PostStatus.DELETED;
  const canAccessByVisibility = isOwner
    || post.visibility === Visibility.PUBLIC
    || (post.visibility === Visibility.FRIENDS && isFriend);
  const canShare = !isDeleted && post.visibility !== Visibility.PRIVATE && canAccessByVisibility;
  const canShowInteractions = !isSystemPost || (!isDeleted && canAccessByVisibility);

  const { filteredSummary, filteredCount, currentUserReaction } = useFilteredReactions(
    post.id, 'post', post.authorId, post.reactionCount
  );

  const handleProfileClick = useCallback(() => {
    if (author?.id) { onProfileClick?.(); navigate(`/profile/${author.id}`); }
  }, [author?.id, onProfileClick, navigate]);

  const handleViewDetail = useCallback(() => onViewDetail?.(post), [onViewDetail, post]);

  return (
    <article className="group bg-bg-primary border border-border-light rounded-2xl overflow-hidden transition-theme animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-center px-4 py-3 gap-3">
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
              className="font-semibold text-text-primary text-sm hover:text-primary transition-colors duration-200 truncate"
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

        {/* Menu */}
        {isOwner ? (
          !isDeleted && (
            <Dropdown
              trigger={
                <IconButton
                  icon={<MoreHorizontal size={18} />}
                  size="sm"
                />
              }
            >
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
          <Dropdown
            trigger={
              <IconButton
                icon={<MoreHorizontal size={18} />}
                size="sm"
              />
            }
          >
            <DropdownItem
              icon={<Flag size={15} />}
              label="Báo cáo"
              variant="danger"
              onClick={() => openReportModal(ReportType.POST, post.id, post.authorId)}
            />
          </Dropdown>
        )}
      </div>

      {/* ── Text content ── */}
      {!isSystemPost && post.content && (
        <div className="px-4 pb-3">
          <p className="text-text-primary whitespace-pre-line break-words text-sm leading-relaxed">
            <TruncatedText content={post.content} threshold={300} />
          </p>
          {error && (
            <div className="mt-2 p-2.5 bg-error/5 border border-error/20 rounded-xl">
              <span className="text-xs text-error font-medium">{error}</span>
            </div>
          )}
          {/* Link preview - only when no media attached */}
          {!isUploading && (post.media?.length ?? 0) === 0 && (() => {
            const url = extractFirstUrl(post.content);
            if (!url) return null;
            return (
              <LinkPreviewCard
                url={url}
                className="mt-3"
              />
            );
          })()}
        </div>
      )}

      {/* ── Media & Upload Progress ── */}
      <div className="relative">
        {isUploading && (
          <div className="px-4 py-2 border-b border-border-light bg-bg-secondary/30">
            <UploadProgress 
              progress={uploadState.progress} 
            />
          </div>
        )}
        
        {!isSystemPost ? (
          <PostMediaGrid
            media={post.media || []}
            onClick={handleViewDetail}
          />
        ) : (
          <SystemPostMedia
            type={post.type as PostType.AVATAR_UPDATE | PostType.COVER_UPDATE}
            media={post.media || []}
            onClick={handleViewDetail}
          />
        )}
      </div>

      {/* ── Reactions & comments ── */}
      {canShowInteractions && (
        <InteractionActions
          reactionSummary={filteredSummary}
          reactionCount={filteredCount}
          myReaction={currentUserReaction}
          commentCount={post.commentCount}
          onReact={(type) => onReact(post.id, type)}
          onCommentClick={handleViewDetail}
          onShareClick={canShare ? () => onShare?.(post, author?.fullName || 'Người dùng') : undefined}
          onViewReactions={() => setIsReactionsModalOpen(true)}
        />
      )}

      <ReactionDetailsModal
        isOpen={isReactionsModalOpen}
        onClose={() => setIsReactionsModalOpen(false)}
        sourceId={post.id}
        sourceType="post"
        currentUserId={currentUser.id}
      />
    </article>
  );
};

/* ── Skeleton ── */
const PostSkeleton: React.FC = () => (
  <div className="bg-bg-primary rounded-2xl border border-border-light overflow-hidden transition-theme">
    <div className="p-4 flex items-start gap-3">
      <Skeleton variant="circle" width={40} height={40} />
      <div className="space-y-2 flex-1">
        <Skeleton variant="line" width={130} height={14} />
        <Skeleton variant="line" width={80} height={11} className="opacity-50" />
      </div>
    </div>
    <div className="px-4 pb-3 space-y-2">
      <Skeleton variant="line" width="88%" height={14} className="opacity-70" />
      <Skeleton variant="line" width="58%" height={14} className="opacity-50" />
    </div>
    <div className="w-full aspect-video bg-bg-secondary" />
    <div className="flex px-2 py-1 border-t border-border-light">
      {[...Array(2)].map((_, i) => (
        <div key={i} className="flex-1 flex justify-center py-2.5">
          <Skeleton variant="line" width={64} height={18} className="opacity-40" />
        </div>
      ))}
    </div>
  </div>
);

export const PostItem: React.FC<PostItemProps> & { Skeleton: React.FC } = Object.assign(
  React.memo(PostItemInner),
  { Skeleton: PostSkeleton }
);
